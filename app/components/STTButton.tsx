"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { DynamicIcon } from "./DynamicIcon";
import { useNotification } from "../misc/NotificationContext";
import { useAPIKeys } from "../misc/APIKeysContext";
import { sttFetch } from "../misc/sttFetch";

interface STTButtonProps {
  onTranscript: (text: string) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  className?: string;
  /** Silence timeout in milliseconds before auto-stop (default: 3000) */
  silenceTimeout?: number;
}

type RecordingState = "idle" | "recording" | "processing";

export default function STTButton({
  onTranscript,
  onError,
  disabled = false,
  className = "",
  silenceTimeout = 3000,
}: STTButtonProps) {
  const [state, setState] = useState<RecordingState>("idle");
  const [isSupported, setIsSupported] = useState(true);
  const { addNotification } = useNotification();
  const { keys } = useAPIKeys();

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    audioChunksRef.current = [];
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  // Detect whether voice input is actually usable in this context (secure
  // context + browser support). navigator.mediaDevices is undefined on
  // insecure (non-HTTPS, non-localhost) origins and in some unsupported
  // browsers/webviews, which would otherwise throw when clicked.
  useEffect(() => {
    const supported =
      typeof window !== "undefined" &&
      window.isSecureContext &&
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function";
    setIsSupported(supported);
  }, []);

  // Check for silence and auto-stop
  const startSilenceDetection = useCallback(() => {
    if (!analyserRef.current) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let lastSoundTime = Date.now();

    const checkAudio = () => {
      if (state !== "recording" || !analyserRef.current) return;

      analyser.getByteFrequencyData(dataArray);

      // Calculate average volume
      const average =
        dataArray.reduce((sum, val) => sum + val, 0) / bufferLength;

      // If there's sound above threshold, reset the timer
      if (average > 10) {
        lastSoundTime = Date.now();
      } else if (Date.now() - lastSoundTime > silenceTimeout) {
        // Silence detected for too long, stop recording
        stopRecording();
        return;
      }

      animationFrameRef.current = requestAnimationFrame(checkAudio);
    };

    checkAudio();
  }, [state, silenceTimeout]);

  const sendAudioToAPI = async (audioBlob: Blob) => {
    setState("processing");

    try {
      const sttEnabled = localStorage.getItem("sttEnabled") !== "false";

      if (!sttEnabled) {
        throw new Error("Speech-to-text is disabled");
      }

      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");
      formData.append("mistralKey", keys.mistralKey);

      const response = await sttFetch(formData);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to transcribe audio");
      }

      const data = await response.json();

      if (data.transcript) {
        onTranscript(data.transcript);
      } else {
        throw new Error("No transcript received");
      }
    } catch (error: any) {
      const message = error.message || "Transcription failed";
      addNotification(message, "failure");
      onError?.(message);
    } finally {
      setState("idle");
    }
  };

  const startRecording = async () => {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Set up audio context for silence detection
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      // Determine supported MIME type
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, {
            type: mimeType,
          });

          // Check minimum audio size (avoid sending empty/very short recordings)
          if (audioBlob.size > 1000) {
            await sendAudioToAPI(audioBlob);
          } else {
            addNotification("Recording too short", "warning");
            setState("idle");
          }
        } else {
          setState("idle");
        }
      };

      mediaRecorder.onerror = (event: any) => {
        console.error("MediaRecorder error:", event.error);
        addNotification("Recording error", "failure");
        cleanup();
        setState("idle");
      };

      // Start recording
      mediaRecorder.start(100); // Collect data every 100ms
      setState("recording");

      // Start silence detection
      startSilenceDetection();
    } catch (error: any) {
      console.error("Failed to start recording:", error);

      let message: string;
      if (error.name === "NotAllowedError") {
        message = "Microphone access denied";
      } else if (error.name === "NotFoundError") {
        message = "No microphone found";
      } else {
        message = error.message || "Failed to start recording";
      }

      addNotification(message, "failure");
      onError?.(message);
      cleanup();
      setState("idle");
    }
  };

  const stopRecording = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  const handleClick = () => {
    if (disabled || !isSupported) return;

    if (state === "idle") {
      startRecording();
    } else if (state === "recording") {
      stopRecording();
    }
    // Do nothing if processing
  };

  const getButtonStyle = () => {
    if (disabled || !isSupported) {
      return "bg-white/5 text-blue-300/40 cursor-not-allowed";
    }
    switch (state) {
      case "recording":
        return "bg-linear-to-r from-red-600 to-rose-600 text-white shadow-md shadow-red-950/40 animate-pulse";
      case "processing":
        return "bg-linear-to-r from-amber-600 to-orange-600 text-white shadow-md shadow-amber-950/40 cursor-wait";
      default:
        return "bg-blue-500/10 hover:bg-blue-500/20 border border-blue-400/20 text-blue-300";
    }
  };

  const getIcon = () => {
    switch (state) {
      case "recording":
        return "MicOff";
      case "processing":
        return "Loader2";
      default:
        return "Mic";
    }
  };

  const getTitle = () => {
    if (!isSupported) {
      return "Voice input requires a secure connection (HTTPS) and a supported browser";
    }
    switch (state) {
      case "recording":
        return "Click to stop recording";
      case "processing":
        return "Processing audio...";
      default:
        return "Click to speak your action";
    }
  };

  return (
    <div className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || !isSupported || state === "processing"}
        title={getTitle()}
        className={`h-full w-11 rounded-xl transition-all flex items-center justify-center touch-manipulation ${getButtonStyle()}`}
      >
        <DynamicIcon
          name={getIcon()}
          className={`w-5 h-5 ${state === "processing" ? "animate-spin" : ""}`}
        />
      </button>

      {/* Recording indicator */}
      {state === "recording" && (
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
        </span>
      )}
    </div>
  );
}
