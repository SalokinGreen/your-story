"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { CouchPlayer } from "../misc/structs";
import { DynamicIcon } from "./DynamicIcon";
import { useNotification } from "../misc/NotificationContext";
import { useAPIKeys } from "../misc/APIKeysContext";
import { sttFetch } from "../misc/sttFetch";

interface PendingLine {
  id: string;
  playerId: string;
  name: string;
  color: string;
  text: string;
}

interface Position {
  xPct: number; // 0-100, left edge as % of viewport width
  yPct: number; // 0-100, top edge as % of viewport height
}

const BUBBLE_SIZE = 64; // px
const SILENCE_TIMEOUT_MS = 3000;
const DRAG_THRESHOLD = 8; // px of movement before a press counts as a drag, not a tap

function positionStorageKey(playerId: string) {
  return `couchBubblePos:${playerId}`;
}

function defaultPosition(index: number): Position {
  const isLeft = index % 2 === 0;
  const row = Math.floor(index / 2);
  return {
    xPct: isLeft ? 8 : 80,
    yPct: Math.max(20, 78 - row * 14),
  };
}

function loadPosition(playerId: string, index: number): Position {
  if (typeof window === "undefined") return defaultPosition(index);
  try {
    const raw = localStorage.getItem(positionStorageKey(playerId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        typeof parsed.xPct === "number" &&
        typeof parsed.yPct === "number"
      ) {
        return parsed;
      }
    }
  } catch {
    // ignore malformed storage
  }
  return defaultPosition(index);
}

function savePosition(playerId: string, pos: Position) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(positionStorageKey(playerId), JSON.stringify(pos));
  } catch {
    // ignore quota errors
  }
}

function clampPct(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

interface RecordingSession {
  reason: "generate" | "queue";
  stopped: boolean;
}

type ActivityState = "recording" | "processing" | "idle";

interface PlayerBubblesProps {
  players: CouchPlayer[];
  onSubmit: (text: string, speakerIds?: string[]) => void;
  disabled?: boolean;
  // Networked play only (see app/misc/multiplayer/) - unset in couch co-op,
  // where anyone at the table can tap anyone's bubble by design. When set,
  // only the bubble matching this id is tappable from this device, and
  // other players' bubbles reflect remoteActivity instead of local
  // recording state.
  myPlayerId?: string;
  remoteActivity?: Record<string, ActivityState>;
  onLocalActivity?: (state: ActivityState) => void;
}

export default function PlayerBubbles({
  players,
  onSubmit,
  disabled = false,
  myPlayerId,
  remoteActivity,
  onLocalActivity,
}: PlayerBubblesProps) {
  const { addNotification } = useNotification();
  const { keys } = useAPIKeys();

  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [processingPlayerId, setProcessingPlayerId] = useState<string | null>(
    null,
  );
  const [pendingLines, setPendingLines] = useState<PendingLine[]>([]);

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
      const sttEnabled =
        typeof window === "undefined" ||
        localStorage.getItem("sttEnabled") !== "false";
      if (!sttEnabled) {
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

  const submitLines = useCallback(
    (lines: PendingLine[]) => {
      if (lines.length === 0) return;
      const text = lines.map((l) => `> ${l.name}: ${l.text}`).join("\n");
      const speakerIds = Array.from(new Set(lines.map((l) => l.playerId)));
      onSubmit(text, speakerIds);
    },
    [onSubmit],
  );

  const handleRecordingStopped = useCallback(
    async (
      player: CouchPlayer,
      mimeType: string,
      chunks: Blob[],
      session: RecordingSession,
    ) => {
      setActivePlayerId((cur) => (cur === player.id ? null : cur));

      if (chunks.length === 0) {
        onLocalActivity?.("idle");
        return;
      }
      const blob = new Blob(chunks, { type: mimeType });
      if (blob.size < 1000) {
        onLocalActivity?.("idle");
        return;
      }

      setProcessingPlayerId(player.id);
      onLocalActivity?.("processing");
      try {
        const transcript = await transcribe(blob);
        const trimmed = transcript.trim();

        if (trimmed) {
          const line: PendingLine = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            playerId: player.id,
            name: player.name,
            color: player.color,
            text: trimmed,
          };
          setPendingLines((prev) => {
            const next = [...prev, line];
            if (session.reason === "generate") {
              submitLines(next);
              return [];
            }
            return next;
          });
        } else if (session.reason === "generate") {
          setPendingLines((prev) => {
            if (prev.length > 0) {
              submitLines(prev);
              return [];
            }
            return prev;
          });
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Couldn't transcribe that — try again";
        addNotification(message, "failure");
      } finally {
        setProcessingPlayerId((cur) => (cur === player.id ? null : cur));
        onLocalActivity?.("idle");
      }
    },
    [transcribe, submitLines, addNotification, onLocalActivity],
  );

  const stopRecording = useCallback(
    (reason: "generate" | "queue") => {
      const session = sessionRef.current;
      if (!session) return;
      session.reason = reason;
      session.stopped = true;
      sessionRef.current = null;

      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
      teardownAudio();
    },
    [teardownAudio],
  );

  const watchSilence = useCallback((session: RecordingSession) => {
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
        stopRecording("queue");
        return;
      }
      animationFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, [stopRecording]);

  const beginRecording = useCallback(
    async (player: CouchPlayer) => {
      const sttEnabled =
        typeof window === "undefined" ||
        localStorage.getItem("sttEnabled") !== "false";
      if (!sttEnabled) {
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

        const session: RecordingSession = { reason: "queue", stopped: false };
        sessionRef.current = session;

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        mediaRecorder.onstop = () => {
          handleRecordingStopped(player, mimeType, chunks, session);
        };
        mediaRecorder.onerror = () => {
          addNotification("Recording error", "failure");
          session.stopped = true;
          sessionRef.current = null;
          teardownAudio();
          setActivePlayerId((cur) => (cur === player.id ? null : cur));
          onLocalActivity?.("idle");
        };

        mediaRecorder.start(100);
        setActivePlayerId(player.id);
        onLocalActivity?.("recording");
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
    [addNotification, handleRecordingStopped, teardownAudio, watchSilence, onLocalActivity],
  );

  const handleBubbleTap = useCallback(
    async (player: CouchPlayer) => {
      if (disabled || processingPlayerId) return;
      if (myPlayerId && player.id !== myPlayerId) return;

      if (activePlayerId === player.id) {
        stopRecording("generate");
      } else if (activePlayerId) {
        stopRecording("queue");
        await beginRecording(player);
      } else {
        await beginRecording(player);
      }
    },
    [
      disabled,
      processingPlayerId,
      myPlayerId,
      activePlayerId,
      stopRecording,
      beginRecording,
    ],
  );

  const removePendingLine = useCallback((id: string) => {
    setPendingLines((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const handleGenerateTap = useCallback(() => {
    if (disabled || processingPlayerId) return;
    submitLines(pendingLines);
    setPendingLines([]);
  }, [disabled, processingPlayerId, submitLines, pendingLines]);

  if (players.length === 0) return null;

  return (
    <>
      {players.map((player, index) => {
        // In networked play, only my own bubble ever runs local
        // recording/processing state (handleBubbleTap gates on
        // myPlayerId) - everyone else's bubble reflects what they
        // broadcast instead.
        const isOwnBubble = !myPlayerId || player.id === myPlayerId;
        const remote = isOwnBubble ? undefined : remoteActivity?.[player.id];
        return (
          <Bubble
            key={player.id}
            player={player}
            index={index}
            isActive={isOwnBubble ? activePlayerId === player.id : remote === "recording"}
            isProcessing={isOwnBubble ? processingPlayerId === player.id : remote === "processing"}
            disabled={disabled || !isOwnBubble}
            onTap={() => handleBubbleTap(player)}
          />
        );
      })}

      {pendingLines.length > 0 && (
        <PendingLinesPanel lines={pendingLines} onRemove={removePendingLine} />
      )}

      {pendingLines.length > 0 && !activePlayerId && (
        <GenerateBubble
          count={pendingLines.length}
          disabled={disabled || !!processingPlayerId}
          onTap={handleGenerateTap}
        />
      )}
    </>
  );
}

function Bubble({
  player,
  index,
  isActive,
  isProcessing,
  disabled,
  onTap,
}: {
  player: CouchPlayer;
  index: number;
  isActive: boolean;
  isProcessing: boolean;
  disabled: boolean;
  onTap: () => void;
}) {
  const [pos, setPos] = useState<Position>(() =>
    loadPosition(player.id, index),
  );
  const dragState = useRef<{
    startX: number;
    startY: number;
    startPos: Position;
    moved: boolean;
    pointerId: number;
  } | null>(null);
  const elRef = useRef<HTMLButtonElement>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPos: pos,
      moved: false,
      pointerId: e.pointerId,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragState.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.moved = true;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const newXPct = clampPct(
      drag.startPos.xPct + (dx / vw) * 100,
      2,
      100 - (BUBBLE_SIZE / vw) * 100 - 2,
    );
    const newYPct = clampPct(
      drag.startPos.yPct + (dy / vh) * 100,
      4,
      100 - (BUBBLE_SIZE / vh) * 100 - 4,
    );
    setPos({ xPct: newXPct, yPct: newYPct });
  };

  const onPointerUp = () => {
    const drag = dragState.current;
    dragState.current = null;
    if (!drag) return;
    if (drag.moved) {
      savePosition(player.id, pos);
    } else {
      onTap();
    }
  };

  return (
    <button
      ref={elRef}
      type="button"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        dragState.current = null;
      }}
      disabled={disabled}
      className="fixed z-40 flex flex-col items-center gap-1 touch-none select-none"
      style={{
        left: `${pos.xPct}%`,
        top: `${pos.yPct}%`,
        width: BUBBLE_SIZE,
      }}
      title={
        isActive
          ? `${player.name} is speaking — tap to finish & generate`
          : `Tap to let ${player.name} speak`
      }
    >
      <span className="relative flex items-center justify-center">
        {isActive && (
          <span
            className="absolute inline-flex rounded-full opacity-60 animate-ping"
            style={{
              width: BUBBLE_SIZE,
              height: BUBBLE_SIZE,
              backgroundColor: player.color,
            }}
          />
        )}
        <span
          className="relative rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95"
          style={{
            width: BUBBLE_SIZE,
            height: BUBBLE_SIZE,
            backgroundColor: player.color,
            boxShadow: isActive
              ? `0 0 0 3px rgba(255,255,255,0.7), 0 0 18px ${player.color}`
              : `0 4px 12px rgba(0,0,0,0.4)`,
            opacity: disabled ? 0.4 : 1,
          }}
        >
          {isProcessing ? (
            <DynamicIcon
              name="Loader2"
              className="w-6 h-6 text-white animate-spin"
            />
          ) : (
            <DynamicIcon
              name={isActive ? "Mic" : "Mic"}
              className="w-6 h-6 text-white"
            />
          )}
        </span>
      </span>
      <span
        className="px-2 py-0.5 rounded-full text-[11px] font-semibold text-white shadow-sm whitespace-nowrap max-w-[6.5rem] truncate"
        style={{ backgroundColor: `${player.color}cc` }}
      >
        {player.name}
      </span>
    </button>
  );
}

function GenerateBubble({
  count,
  disabled,
  onTap,
}: {
  count: number;
  disabled: boolean;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled}
      className="fixed z-40 flex flex-col items-center gap-1 touch-none select-none"
      style={{
        left: "50%",
        bottom: "1.25rem",
        transform: "translateX(-50%)",
      }}
      title="Generate from queued turns"
    >
      <span
        className="relative rounded-full flex items-center justify-center shadow-lg animate-[pulse_2s_ease-in-out_infinite] transition-transform active:scale-95 bg-linear-to-br from-purple-600 to-indigo-600"
        style={{
          width: BUBBLE_SIZE,
          height: BUBBLE_SIZE,
          opacity: disabled ? 0.4 : 1,
        }}
      >
        <DynamicIcon name="Sparkles" className="w-6 h-6 text-white" />
        <span className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 rounded-full bg-white text-purple-700 text-[11px] font-bold flex items-center justify-center shadow">
          {count}
        </span>
      </span>
      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold text-white bg-purple-900/70 shadow-sm whitespace-nowrap">
        Generate
      </span>
    </button>
  );
}

function PendingLinesPanel({
  lines,
  onRemove,
}: {
  lines: PendingLine[];
  onRemove: (id: string) => void;
}) {
  return (
    <div
      className="fixed z-40 left-1/2 -translate-x-1/2 bottom-24 w-[min(22rem,calc(100vw-2rem))] max-h-40 overflow-y-auto rounded-xl bg-gray-900/90 backdrop-blur border border-white/10 shadow-2xl p-2 space-y-1"
      role="log"
      aria-label="Queued player turns"
    >
      {lines.map((line) => (
        <div
          key={line.id}
          className="flex items-start gap-2 text-xs bg-white/5 rounded-lg px-2 py-1.5"
        >
          <span
            className="w-2 h-2 rounded-full mt-1 shrink-0"
            style={{ backgroundColor: line.color }}
          />
          <div className="min-w-0 flex-1">
            <span className="font-semibold text-white/90">{line.name}:</span>{" "}
            <span className="text-white/70">{line.text}</span>
          </div>
          <button
            type="button"
            onClick={() => onRemove(line.id)}
            className="shrink-0 text-white/40 hover:text-white/80 transition-colors"
            title="Remove this line"
          >
            <DynamicIcon name="X" className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
