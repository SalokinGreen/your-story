"use client";

// Party mode on the story page: the React side of PartyRuntime
// (app/misc/party/partyRuntime.ts). The runtime owns the table's state and
// talks to the LAN server; this hook gives the page its start/stop, the table
// snapshot for the strip and lobby, and the few hooks into the GM loop (the
// turn, rolls and questions).

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { CouchPlayer, StoryData } from "../misc/structs";
import type {
  AskQuestionAnswer,
  AskQuestionRequest,
  ManualRollAnswer,
  ManualRollRequest,
} from "../misc/gmExecutor";
import {
  isPartyAvailable,
  tauriPartyBridge,
  toPartyError,
  type PartyBridge,
  type PartyError,
  type PartyInfo,
} from "../misc/party/partyBridge";
import {
  PartyRuntime,
  type PartyPending,
  type PartyTable,
  type RosterChange,
} from "../misc/party/partyRuntime";
import { withPartyNote } from "../misc/party/partyNote";
import { loadCooldownMs, saveCooldownMs } from "../misc/party/partySettings";
import { PARTY_MAX_TAKE_BYTES } from "../misc/party/protocol";
import { sttFetch } from "../misc/sttFetch";

export type PartyStatus = "off" | "starting" | "on";

export interface UsePartyHostOptions {
  storyData: StoryData | null;
  setStoryData: Dispatch<SetStateAction<StoryData | null>>;
  // True while a turn is generating, however it started.
  turnBusy: boolean;
  submitTurn: (
    text: string,
    speakerIds: string[],
    inputKind: "freeform" | "voice",
  ) => Promise<void>;
  mistralKey: string;
  // A roll or question that was on a phone goes back to the desktop to be
  // answered there (its player was removed, or the table closed).
  onReturnRequest: (pending: PartyPending) => void;
  // Tests substitute a fake server.
  bridge?: PartyBridge;
}

export interface PartyHostApi {
  // Only the desktop app can host a party.
  available: boolean;
  status: PartyStatus;
  info: PartyInfo | null;
  error: PartyError | null;
  table: PartyTable | null;
  cooldownMs: number;
  start: (interfaceIp?: string) => Promise<void>;
  stop: () => Promise<void>;
  go: () => void;
  removePlayer: (playerId: string) => void;
  setCooldownMs: (ms: number) => void;
  offerRoll: (
    request: ManualRollRequest,
    onAnswer: (answer: ManualRollAnswer | null) => void,
  ) => string | null;
  offerQuestion: (
    request: AskQuestionRequest,
    onAnswer: (answer: AskQuestionAnswer | null) => void,
  ) => string | null;
  cancelRequest: (requestId: string) => void;
}

function base64ToBlob(chunks: string[], mimeType: string): Blob {
  const parts: Uint8Array<ArrayBuffer>[] = chunks.map((chunk) => {
    const bin = atob(chunk);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  });
  return new Blob(parts, { type: mimeType });
}

// A phone's recorded take, transcribed on the desktop with its own key, as
// the couch bubbles do (the phone needs no key).
async function transcribeChunks(
  chunks: string[],
  mimeType: string,
  mistralKey: string,
): Promise<string> {
  if (typeof window !== "undefined" && localStorage.getItem("sttEnabled") === "false") {
    throw new Error("Speech-to-text is turned off on the desktop");
  }
  if (!mistralKey) throw new Error("The desktop has no Mistral key for speech-to-text");
  const blob = base64ToBlob(chunks, mimeType);
  if (blob.size < 1000) return "";
  if (blob.size > PARTY_MAX_TAKE_BYTES) throw new Error("That recording is too long");
  const form = new FormData();
  form.append("audio", blob, "recording.webm");
  form.append("mistralKey", mistralKey);
  const response = await sttFetch(form);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Couldn't transcribe that");
  }
  const data = await response.json();
  return typeof data.transcript === "string" ? data.transcript : "";
}

// How long the story must sit still before phones are sent a fresh view.
const VIEW_REFRESH_MS = 250;

function mergeRoster(prev: CouchPlayer[], change: RosterChange): CouchPlayer[] {
  const removed = new Set(change.removedIds);
  const upserts = new Map(change.players.map((p) => [p.id, p]));
  const merged = prev
    .filter((p) => !removed.has(p.id))
    .map((p) => (upserts.has(p.id) ? { ...p, ...upserts.get(p.id)! } : p));
  for (const p of change.players) {
    if (!merged.some((m) => m.id === p.id) && !removed.has(p.id)) merged.push(p);
  }
  return merged;
}

export function usePartyHost(opts: UsePartyHostOptions): PartyHostApi {
  const [status, setStatus] = useState<PartyStatus>("off");
  const [info, setInfo] = useState<PartyInfo | null>(null);
  const [error, setError] = useState<PartyError | null>(null);
  const [table, setTable] = useState<PartyTable | null>(null);
  // Read once from this device. The Menu is only drawn after the story has
  // loaded, so this never meets the prerendered page.
  const [cooldownMs, setCooldownState] = useState(() => loadCooldownMs());

  // The runtime's callbacks read the latest props through this ref.
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });
  const cooldownRef = useRef(cooldownMs);
  const runtimeRef = useRef<PartyRuntime | null>(null);

  const getRuntime = useCallback((): PartyRuntime => {
    if (!runtimeRef.current) {
      runtimeRef.current = new PartyRuntime({
        bridge: optsRef.current.bridge ?? tauriPartyBridge,
        getStory: () => optsRef.current.storyData,
        applyRoster: (change) => {
          optsRef.current.setStoryData((prev) => {
            if (!prev) return prev;
            const couchPlayers = mergeRoster(prev.multiplayer?.couchPlayers ?? [], change);
            return {
              ...prev,
              // The GM learns it is running a party table once players are on it.
              lore: couchPlayers.length > 0 ? withPartyNote(prev.lore) : prev.lore,
              multiplayer: { ...prev.multiplayer, enabled: couchPlayers.length > 0, couchPlayers },
            };
          });
        },
        submitTurn: (text, speakerIds, kind) => optsRef.current.submitTurn(text, speakerIds, kind),
        transcribe: (chunks, mimeType) =>
          transcribeChunks(chunks, mimeType, optsRef.current.mistralKey),
        onTable: setTable,
        onReturnRequest: (pending) => optsRef.current.onReturnRequest(pending),
        onError: (e) => {
          setError(e);
          setInfo(null);
          setStatus("off");
        },
        cooldownMs: cooldownRef.current,
      });
    }
    return runtimeRef.current;
  }, []);

  const start = useCallback(
    async (interfaceIp?: string) => {
      if (!isPartyAvailable() && !optsRef.current.bridge) {
        setError({
          code: "UNAVAILABLE",
          message: "Party mode runs in the Your Story desktop app.",
        });
        return;
      }
      const runtime = getRuntime();
      setStatus("starting");
      setError(null);
      try {
        const roster = optsRef.current.storyData?.multiplayer?.couchPlayers ?? [];
        const started = await runtime.start({ interfaceIp }, roster);
        setInfo(started);
        setStatus("on");
        // Seats added or renamed while the lobby was coming up.
        runtime.setTurnBusy(optsRef.current.turnBusy);
      } catch (e) {
        const error = toPartyError(e);
        // Closed while it was opening: that was asked for, not an error.
        if (error.code !== "CANCELLED") setError(error);
        setInfo(null);
        setStatus("off");
      }
    },
    [getRuntime],
  );

  const stop = useCallback(async () => {
    await runtimeRef.current?.stop();
    setInfo(null);
    setStatus("off");
  }, []);

  // The server runs only while party mode is open: leaving the story ends it.
  // There is nowhere left to show a waiting prompt, so those are skipped.
  useEffect(() => {
    return () => {
      void runtimeRef.current?.stop({ returnToDesktop: false });
    };
  }, []);

  // The queue locks while the GM works.
  useEffect(() => {
    runtimeRef.current?.setTurnBusy(opts.turnBusy);
  }, [opts.turnBusy]);

  // Names and colours follow the story's roster (a rename in the Menu, an
  // undo); seats the party holds are written back if it loses them.
  const couchPlayers = opts.storyData?.multiplayer?.couchPlayers;
  // A solo story has no roster at all until a player joins, so an undo to one
  // arrives as undefined: the party's seats are written back all the same.
  useEffect(() => {
    if (status === "on") runtimeRef.current?.syncRoster(couchPlayers ?? []);
  }, [couchPlayers, status]);

  // Phones' views follow the story: the narration, choices and sheets.
  const storyForViews = opts.storyData;
  useEffect(() => {
    if (status !== "on") return;
    const timer = setTimeout(() => runtimeRef.current?.refreshViews(), VIEW_REFRESH_MS);
    return () => clearTimeout(timer);
  }, [storyForViews, status]);

  const setCooldownMs = useCallback((ms: number) => {
    const saved = saveCooldownMs(ms);
    cooldownRef.current = saved;
    setCooldownState(saved);
    runtimeRef.current?.setCooldownMs(saved);
  }, []);

  return {
    available: isPartyAvailable() || !!opts.bridge,
    status,
    info,
    error,
    table,
    cooldownMs,
    start,
    stop,
    go: useCallback(() => runtimeRef.current?.go(), []),
    removePlayer: useCallback((id: string) => runtimeRef.current?.removePlayer(id), []),
    setCooldownMs,
    offerRoll: useCallback(
      (request, onAnswer) => runtimeRef.current?.offerRoll(request, onAnswer) ?? null,
      [],
    ),
    offerQuestion: useCallback(
      (request, onAnswer) => runtimeRef.current?.offerQuestion(request, onAnswer) ?? null,
      [],
    ),
    cancelRequest: useCallback((id: string) => runtimeRef.current?.cancelRequest(id), []),
  };
}
