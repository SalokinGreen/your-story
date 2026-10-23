"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNotification } from "../misc/NotificationContext";
import { useAPIKeys } from "../misc/APIKeysContext";
import { sttFetch } from "../misc/sttFetch";

// Moved out of PlayerBubbles so the composer's mic uses the same recorder:
// start, cancel, confirm, the waveform's analyser, the 3 s silence stop, STT
// through the Mistral key, and the error toast. What to do with a transcript,
// and which player a recording belongs to, stay with the caller.

const SILENCE_TIMEOUT_MS = 3000;

interface RecordingSession {
  stopped: boolean;
  // Set by cancelRecording() - tells mediaRecorder.onstop to discard the
  // take instead of transcribing it.
  discard: boolean;
}

export type RecorderActivity = "recording" | "processing" | "idle";

/** Whether voice input is switched on in Settings (key `sttEnabled`, default on). */
export function isSttEnabled(): boolean {
  return (
    typeof window === "undefined" ||
    localStorage.getItem("sttEnabled") !== "false"
  );
}

interface UseVoiceRecorderOptions<P extends { id: string }> {
  /** Called with the cleaned transcript of a finished take (never an empty one). */
  onTranscript: (owner: P, text: string) => void;
  onLocalActivity?: (state: RecorderActivity) => void;
  // Networked play only: the recording claims the party-voice floor when it
  // starts and yields it when it stops.
  isNetworked?: boolean;
  onFloorTake?: () => void;
  onFloorRelease?: () => void;
}

export function useVoiceRecorder<P extends { id: string }>({
  onTranscript,
  onLocalActivity,
  isNetworked = false,
  onFloorTake,
  onFloorRelease,
}: UseVoiceRecorderOptions<P>) {
  const { addNotification } = useNotification();
  const { keys } = useAPIKeys();

  const [activeOwnerId, setActiveOwnerId] = useState<string | null>(null);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const sessionRef = useRef<RecordingSession | null>(null);

  const teardownAudio = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  useEffect(() => teardownAudio, [teardownAudio]);

  const transcribe = useCallback(
    async (blob: Blob): Promise<string> => {
      if (!isSttEnabled()) {
        throw new Error("Speech-to-text is disabled in Settings");
      }
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");
      formData.append("mistralKey", keys.mistralKey);

      const response = await sttFetch(formData);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to transcribe audio");
      }
      const data = await response.json();
      return data.transcript || "";
    },
    [keys.mistralKey],
  );

  const handleRecordingStopped = useCallback(
    async (owner: P, mimeType: string, chunks: Blob[]) => {
      setActiveOwnerId((cur) => (cur === owner.id ? null : cur));

      if (chunks.length === 0) {
        onLocalActivity?.("idle");
        return;
      }
      const blob = new Blob(chunks, { type: mimeType });
      if (blob.size < 1000) {
        onLocalActivity?.("idle");
        return;
      }

      setProcessingIds((prev) => new Set(prev).add(owner.id));
      onLocalActivity?.("processing");
      try {
        const transcript = await transcribe(blob);
        const trimmed = transcript.trim();
        if (trimmed) onTranscript(owner, trimmed);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Couldn't transcribe that — try again";
        addNotification(message, "failure");
      } finally {
        setProcessingIds((prev) => {
          const next = new Set(prev);
          next.delete(owner.id);
          return next;
        });
        onLocalActivity?.("idle");
      }
    },
    [transcribe, addNotification, onLocalActivity, onTranscript],
  );

  const stopRecording = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    session.stopped = true;
    sessionRef.current = null;

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    teardownAudio();
    // Networked: yield the party-voice floor so the next speaker can take it.
    if (isNetworked) onFloorRelease?.();
  }, [teardownAudio, isNetworked, onFloorRelease]);

  // Like stopRecording, but marks the take to be discarded once the
  // MediaRecorder actually stops (see onstop in beginRecording) instead of
  // sending it off for transcription - the "X" on the recording overlay.
  const cancelRecording = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    session.stopped = true;
    session.discard = true;
    sessionRef.current = null;

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    teardownAudio();
    if (isNetworked) onFloorRelease?.();
  }, [teardownAudio, isNetworked, onFloorRelease]);

  const watchSilence = useCallback(
    (session: RecordingSession) => {
      const analyser = analyserRef.current;
      if (!analyser) return;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      let lastSoundTime = Date.now();

      const tick = () => {
        if (session.stopped || !analyserRef.current) return;
        analyser.getByteFrequencyData(dataArray);
        const average =
          dataArray.reduce((sum, v) => sum + v, 0) / bufferLength;

        if (average > 10) {
          lastSoundTime = Date.now();
        } else if (Date.now() - lastSoundTime > SILENCE_TIMEOUT_MS) {
          // Silence: pause and queue what was said, but don't generate yet.
          stopRecording();
          return;
        }
        animationFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    },
    [stopRecording],
  );

  const beginRecording = useCallback(
    async (owner: P) => {
      if (!isSttEnabled()) {
        addNotification(
          "Voice input is disabled — enable it in Settings",
          "warning",
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        streamRef.current = stream;

        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const mimeType = MediaRecorder.isTypeSupported(
          "audio/webm;codecs=opus",
        )
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : "audio/mp4";

        const chunks: Blob[] = [];
        const mediaRecorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = mediaRecorder;

        const session: RecordingSession = { stopped: false, discard: false };
        sessionRef.current = session;

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        mediaRecorder.onstop = () => {
          if (session.discard) {
            setActiveOwnerId((cur) => (cur === owner.id ? null : cur));
            onLocalActivity?.("idle");
            return;
          }
          handleRecordingStopped(owner, mimeType, chunks);
        };
        mediaRecorder.onerror = () => {
          addNotification("Recording error", "failure");
          session.stopped = true;
          sessionRef.current = null;
          teardownAudio();
          setActiveOwnerId((cur) => (cur === owner.id ? null : cur));
          onLocalActivity?.("idle");
        };

        mediaRecorder.start(100);
        setActiveOwnerId(owner.id);
        onLocalActivity?.("recording");
        // Networked: claim the party-voice floor (host arbitrates and may
        // interrupt someone else). Couch play grabs the floor in handleBubbleTap
        // before we ever get here.
        if (isNetworked) onFloorTake?.();
        watchSilence(session);
      } catch (error) {
        let message =
          error instanceof Error ? error.message : "Failed to start recording";
        if (error instanceof DOMException && error.name === "NotAllowedError") {
          message = "Microphone access denied";
        } else if (
          error instanceof DOMException &&
          error.name === "NotFoundError"
        ) {
          message = "No microphone found";
        }
        addNotification(message, "failure");
        teardownAudio();
      }
    },
    [
      addNotification,
      handleRecordingStopped,
      teardownAudio,
      watchSilence,
      onLocalActivity,
      isNetworked,
      onFloorTake,
    ],
  );

  return {
    /** Id of whoever is recording right now, else null. */
    activeOwnerId,
    /** Ids whose last take is still being transcribed. */
    processingIds,
    analyserRef,
    beginRecording,
    stopRecording,
    cancelRecording,
  };
}
