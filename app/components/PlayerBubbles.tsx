"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { CouchPlayer } from "../misc/structs";
import { DynamicIcon } from "./DynamicIcon";
import { useNotification } from "../misc/NotificationContext";
import { useAPIKeys } from "../misc/APIKeysContext";
import { sttFetch } from "../misc/sttFetch";
import {
  createFloor,
  lockedOutIds as floorLockedOutList,
  pruneLockouts,
  FLOOR_STEAL_COOLDOWN_MS,
} from "../misc/multiplayer/floorControl";

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
  stopped: boolean;
  // Set by cancelRecording() - tells mediaRecorder.onstop to discard the
  // take instead of transcribing it.
  discard: boolean;
}

const WAVEFORM_BAR_COUNT = 24;

// Draws a live mic-level waveform by writing bar heights straight to the DOM
// on every animation frame instead of through React state, so a recording
// session doesn't force 60fps re-renders of the whole bubble tree.
function LiveWaveform({
  analyserRef,
}: {
  analyserRef: React.RefObject<AnalyserNode | null>;
}) {
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const bucketSize = Math.max(1, Math.floor(bufferLength / WAVEFORM_BAR_COUNT));

    const tick = () => {
      analyser.getByteFrequencyData(dataArray);
      for (let i = 0; i < WAVEFORM_BAR_COUNT; i++) {
        const start = i * bucketSize;
        let sum = 0;
        for (let j = 0; j < bucketSize; j++) sum += dataArray[start + j] || 0;
        const avg = sum / bucketSize; // 0-255
        const pct = Math.min(100, 14 + (avg / 255) * 86);
        const bar = barsRef.current[i];
        if (bar) bar.style.height = `${pct}%`;
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [analyserRef]);

  return (
    <div className="flex items-center gap-[3px] h-8 flex-1 min-w-0 justify-center px-1">
      {Array.from({ length: WAVEFORM_BAR_COUNT }).map((_, i) => (
        <div
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          className="w-[3px] rounded-full bg-white/70 shrink-0"
          style={{ height: "14%" }}
        />
      ))}
    </div>
  );
}

function RecordingOverlay({
  player,
  analyserRef,
  onCancel,
  onConfirm,
}: {
  player: CouchPlayer;
  analyserRef: React.RefObject<AnalyserNode | null>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed z-50 left-1/2 -translate-x-1/2 bottom-6 w-[min(26rem,calc(100vw-2rem))] flex items-center gap-2 rounded-full bg-[#0d1829]/95 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50 pl-2 pr-2 py-2"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      role="dialog"
      aria-label={`Recording for ${player.name}`}
    >
      <button
        type="button"
        onClick={onCancel}
        className="shrink-0 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center transition-all touch-manipulation"
        title="Cancel recording"
      >
        <DynamicIcon name="X" className="w-4 h-4 text-white/80" />
      </button>

      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span
          className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
          style={{ backgroundColor: player.color }}
        />
        <span
          className="relative inline-flex rounded-full h-2.5 w-2.5"
          style={{ backgroundColor: player.color }}
        />
      </span>

      <LiveWaveform analyserRef={analyserRef} />

      <button
        type="button"
        onClick={onConfirm}
        className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95 touch-manipulation bg-linear-to-br from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-md shadow-purple-950/40"
        title="Stop & transcribe"
      >
        <DynamicIcon name="Check" className="w-4 h-4 text-white" />
      </button>
    </div>
  );
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
  // Party-voice floor (talking stick). In networked play these are supplied
  // by the host-authoritative floor (see floorControl.ts): floorHolderId is
  // whoever currently has the mic, floorLockedOutIds are players briefly barred
  // from grabbing it back after being interrupted, and onFloorTake/Release let
  // this device claim/yield the floor. In couch play they're all unset and a
  // local floor is maintained here instead.
  floorHolderId?: string | null;
  floorLockedOutIds?: string[];
  onFloorTake?: () => void;
  onFloorRelease?: () => void;
}

export default function PlayerBubbles({
  players,
  onSubmit,
  disabled = false,
  myPlayerId,
  remoteActivity,
  onLocalActivity,
  floorHolderId,
  floorLockedOutIds,
  onFloorTake,
  onFloorRelease,
}: PlayerBubblesProps) {
  const { addNotification } = useNotification();
  const { keys } = useAPIKeys();

  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [processingPlayerIds, setProcessingPlayerIds] = useState<Set<string>>(
    new Set(),
  );
  const [pendingLines, setPendingLines] = useState<PendingLine[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const sessionRef = useRef<RecordingSession | null>(null);

  // Networked play drives the floor from the host (props); couch play keeps a
  // local floor here so the talking-stick + anti-steal-back rules still apply
  // when everyone shares one device.
  const isNetworked = !!myPlayerId;
  const couchFloorRef = useRef(createFloor());
  const [couchLockedOut, setCouchLockedOut] = useState<string[]>([]);
  const couchFloorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Unified per-player floor view for rendering, sourced from props (net) or
  // the local couch floor.
  const floorHolder = isNetworked ? floorHolderId ?? null : activePlayerId;
  const lockedOutSet = new Set(
    isNetworked ? floorLockedOutIds ?? [] : couchLockedOut,
  );

  const refreshCouchFloor = useCallback(() => {
    const now = Date.now();
    pruneLockouts(couchFloorRef.current, now);
    setCouchLockedOut(floorLockedOutList(couchFloorRef.current, now));
    if (couchFloorTimerRef.current) {
      clearTimeout(couchFloorTimerRef.current);
      couchFloorTimerRef.current = null;
    }
    const locks = [...couchFloorRef.current.lockouts.values()];
    if (locks.length > 0) {
      const delay = Math.max(0, Math.min(...locks) - now) + 50;
      couchFloorTimerRef.current = setTimeout(refreshCouchFloor, delay);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (couchFloorTimerRef.current) clearTimeout(couchFloorTimerRef.current);
    };
  }, []);

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
    async (player: CouchPlayer, mimeType: string, chunks: Blob[]) => {
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

      setProcessingPlayerIds((prev) => new Set(prev).add(player.id));
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
          setPendingLines((prev) => [...prev, line]);
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Couldn't transcribe that — try again";
        addNotification(message, "failure");
      } finally {
        setProcessingPlayerIds((prev) => {
          const next = new Set(prev);
          next.delete(player.id);
          return next;
        });
        onLocalActivity?.("idle");
      }
    },
    [transcribe, addNotification, onLocalActivity],
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
        stopRecording();
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

        const session: RecordingSession = { stopped: false, discard: false };
        sessionRef.current = session;

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        mediaRecorder.onstop = () => {
          if (session.discard) {
            setActivePlayerId((cur) => (cur === player.id ? null : cur));
            onLocalActivity?.("idle");
            return;
          }
          handleRecordingStopped(player, mimeType, chunks);
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

  const handleBubbleTap = useCallback(
    async (player: CouchPlayer) => {
      if (disabled) return;
      if (myPlayerId && player.id !== myPlayerId) return;
      // Only block re-tapping this specific player while their own last
      // line is still transcribing - other players can start recording
      // immediately, they don't wait on someone else's STT call.
      if (processingPlayerIds.has(player.id)) return;

      // Tapping your own active bubble always just stops (yields the floor).
      if (activePlayerId === player.id) {
        stopRecording();
        return;
      }

      // Party-voice floor: a player who was just interrupted has to wait before
      // they can grab the mic again, so two people can't ping-pong it.
      if (isNetworked) {
        // Networked: only my own bubble reaches here (gated above). If I'm
        // locked out, the host would reject the take anyway - block locally so
        // recording never even starts.
        if ((floorLockedOutIds ?? []).includes(player.id)) {
          addNotification("Hold on — wait your turn to speak", "warning");
          return;
        }
      } else {
        // Couch: a player just talked over is on cooldown and can't grab the
        // mic back yet.
        const now = Date.now();
        pruneLockouts(couchFloorRef.current, now);
        const lockedUntil = couchFloorRef.current.lockouts.get(player.id);
        if (lockedUntil !== undefined && now < lockedUntil) {
          addNotification(
            `${player.name} was just interrupted — wait a moment`,
            "warning",
          );
          return;
        }
        // Interrupting whoever's currently speaking locks *them* out (not this
        // tapper), so they can't immediately steal it back.
        if (activePlayerId && activePlayerId !== player.id) {
          couchFloorRef.current.lockouts.set(
            activePlayerId,
            now + FLOOR_STEAL_COOLDOWN_MS,
          );
        }
        refreshCouchFloor();
      }

      if (activePlayerId) {
        stopRecording();
        await beginRecording(player);
      } else {
        await beginRecording(player);
      }
    },
    [
      disabled,
      processingPlayerIds,
      myPlayerId,
      activePlayerId,
      stopRecording,
      beginRecording,
      isNetworked,
      floorLockedOutIds,
      refreshCouchFloor,
      addNotification,
    ],
  );

  // Networked: if the host reassigns the floor to someone else while I'm
  // recording, I've been talked over - stop (my partial take is still queued).
  useEffect(() => {
    if (!isNetworked || !myPlayerId) return;
    if (
      activePlayerId === myPlayerId &&
      floorHolderId != null &&
      floorHolderId !== myPlayerId
    ) {
      stopRecording();
    }
  }, [isNetworked, myPlayerId, activePlayerId, floorHolderId, stopRecording]);

  const removePendingLine = useCallback((id: string) => {
    setPendingLines((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const handleGenerateTap = useCallback(() => {
    if (disabled || processingPlayerIds.size > 0) return;
    submitLines(pendingLines);
    setPendingLines([]);
  }, [disabled, processingPlayerIds, submitLines, pendingLines]);

  if (players.length === 0) return null;

  // activePlayerId only ever reflects this device's own recording (remote
  // players' state comes through remoteActivity instead), so it's always
  // safe to surface the waveform overlay for whichever player it names.
  const recordingPlayer = activePlayerId
    ? players.find((p) => p.id === activePlayerId) || null
    : null;

  return (
    <>
      {players.map((player, index) => {
        // In networked play, only my own bubble ever runs local
        // recording/processing state (handleBubbleTap gates on
        // myPlayerId) - everyone else's bubble reflects what they
        // broadcast instead.
        const isOwnBubble = !myPlayerId || player.id === myPlayerId;
        const remote = isOwnBubble ? undefined : remoteActivity?.[player.id];
        const isActive = isOwnBubble
          ? activePlayerId === player.id
          : remote === "recording";
        // Locked out (just interrupted) and not the one currently speaking:
        // show a brief cooldown so it's clear why the mic won't respond.
        const lockedOut = lockedOutSet.has(player.id) && floorHolder !== player.id;
        return (
          <Bubble
            key={player.id}
            player={player}
            index={index}
            isActive={isActive}
            isProcessing={isOwnBubble ? processingPlayerIds.has(player.id) : remote === "processing"}
            lockedOut={lockedOut}
            disabled={disabled || !isOwnBubble || (lockedOut && isOwnBubble)}
            onTap={() => handleBubbleTap(player)}
          />
        );
      })}

      {recordingPlayer && (
        <RecordingOverlay
          player={recordingPlayer}
          analyserRef={analyserRef}
          onCancel={cancelRecording}
          onConfirm={stopRecording}
        />
      )}

      {pendingLines.length > 0 && (
        <PendingLinesPanel lines={pendingLines} onRemove={removePendingLine} />
      )}

      {pendingLines.length > 0 && !activePlayerId && (
        <GenerateBubble
          count={pendingLines.length}
          disabled={disabled || processingPlayerIds.size > 0}
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
  lockedOut = false,
  disabled,
  onTap,
}: {
  player: CouchPlayer;
  index: number;
  isActive: boolean;
  isProcessing: boolean;
  lockedOut?: boolean;
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
      className="fixed z-50 flex flex-col items-center gap-1 touch-none select-none"
      style={{
        left: `${pos.xPct}%`,
        top: `${pos.yPct}%`,
        width: BUBBLE_SIZE,
      }}
      title={
        isActive
          ? `${player.name} is speaking — tap to stop & queue`
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
          ) : lockedOut ? (
            <DynamicIcon name="MicOff" className="w-6 h-6 text-white/80" />
          ) : (
            <DynamicIcon name="Mic" className="w-6 h-6 text-white" />
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
      className="fixed z-50 flex flex-col items-center gap-1 touch-none select-none"
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
      className="fixed z-40 left-1/2 -translate-x-1/2 bottom-24 w-[min(22rem,calc(100vw-2rem))] max-h-40 overflow-y-auto rounded-xl bg-[#0d1829]/90 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50 p-2 space-y-1"
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
