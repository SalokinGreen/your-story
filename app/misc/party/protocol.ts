// Party mode's wire protocol: the JSON messages that travel between a phone
// (the /party controller page) and the desktop table over the LAN WebSocket.
// The Rust server only relays these; it never reads them. See
// docs/party-mode-design.md and docs/party-mode-implementation-plan.md (S2).
//
// This module is imported by the phone page as well as the desktop, so it must
// stay free of runtime imports from the rest of the app: types only.

import type { PlayerArchetype } from "../structs";

export const PARTY_PROTOCOL_VERSION = 1;

// Party mode's spotlight cooldown (decision 24). Couch mode keeps its own 4 s
// (FLOOR_STEAL_COOLDOWN_MS); this is the default for the setting.
export const PARTY_SPOTLIGHT_COOLDOWN_MS = 15000;

// Input limits, enforced when a phone message is parsed and again by the host.
export const PARTY_MAX_NAME_CHARS = 32;
export const PARTY_MAX_LINE_CHARS = 1000;
export const PARTY_MAX_QUEUE_LINES = 20;
export const PARTY_MAX_SEATS = 8;
export const PARTY_MAX_TAGS = 6;
export const PARTY_MAX_TAG_CHARS = 32;
// One voice_chunk's base64 payload. The server caps a whole message at 256 KB.
export const PARTY_MAX_CHUNK_BASE64 = 200_000;
// A whole voice take, decoded. The same cap transcribeAudio applies.
export const PARTY_MAX_TAKE_BYTES = 10 * 1024 * 1024;

export const PARTY_ARCHETYPES: readonly PlayerArchetype[] = [
  "power_gamer",
  "butt_kicker",
  "tactician",
  "specialist",
  "method_actor",
  "storyteller",
  "casual_gamer",
];

// ---------------------------------------------------------------- phone → desktop

export type LineKind = "typed" | "choice";

export interface AnswerItem {
  selectedLabel?: string;
  // Every option ticked on a multi-select question.
  selectedLabels?: string[];
  customText?: string;
  skipped: boolean;
}

// A question has at most four options, so no honest answer ticks more.
export const PARTY_MAX_PICKS = 4;

export type PhoneMessage =
  // First message on every connection. playerId + seatKey reclaim a seat
  // after a reconnect; both were handed out in this phone's view.
  | { type: "hello"; token: string; playerId?: string; seatKey?: string }
  // Take a new seat (name, colour…) or claim an open one by its id.
  | {
      type: "join";
      name: string;
      color: string;
      archetype?: PlayerArchetype;
      personalityTags?: string[];
      wishTags?: string[];
      seatId?: string;
    }
  | { type: "spotlight_take" }
  | { type: "spotlight_release" }
  | { type: "line"; text: string; kind: LineKind }
  // A recorded take, split into ordered chunks (the Android app, PR P2).
  // seq counts from 0 and the take's mimeType rides on the first chunk.
  | {
      type: "voice_chunk";
      takeId: string;
      seq: number;
      base64: string;
      last: boolean;
      mimeType?: string;
    }
  | { type: "go" }
  // value null: "Roll for me" (the GM rolls it digitally instead).
  | { type: "roll_result"; requestId: string; value: string | null }
  | { type: "answer"; requestId: string; answers: AnswerItem[] }
  // Reserved for auto-voice (design §7). Ignored for now.
  | { type: "vad_features"; t: number; p: number; level: number }
  | { type: "ping" };

// ---------------------------------------------------------------- desktop → phone

export interface PartySeatView {
  id: string;
  name: string;
  color: string;
  connected: boolean;
  // How much longer this seat is locked out of the spotlight, in ms (0 when
  // free). Relative, because the phone's clock is not the desktop's.
  lockoutMs: number;
}

export interface PartyQueuedLineView {
  id: string;
  playerId: string;
  name: string;
  color: string;
  text: string;
  kind: LineKind | "voice";
}

export type PartyRequestView =
  | {
      requestId: string;
      kind: "roll";
      title: string;
      description: string;
      formula?: string;
    }
  | {
      requestId: string;
      kind: "question";
      questions: {
        question: string;
        // Session zero: a sentence or two shown above the options.
        intro?: string;
        options: { label: string; description?: string }[];
        allowCustom: boolean;
        // Present (true) only on a multi-select question.
        multiSelect?: boolean;
      }[];
    };

export interface PartyJoinOptions {
  palette: string[];
  archetypes: { id: PlayerArchetype; label: string }[];
  // Seats nobody is connected to, which this phone may claim.
  openSeats: { id: string; name: string; color: string }[];
}

// Everything a phone is ever told. Built only by buildPlayerView (partyHost.ts),
// the redaction boundary: no StoryData, no notes but the player's own sheet,
// no keys.
export interface PlayerView {
  v: typeof PARTY_PROTOCOL_VERSION;
  storyName: string;
  me: { id: string; name: string; color: string; seatKey: string } | null;
  sheet: { title: string; content: string } | null;
  seats: PartySeatView[];
  spotlightHolderId: string | null;
  cooldownMs: number;
  queue: PartyQueuedLineView[];
  turn: "idle" | "generating";
  choices: string[];
  requests: PartyRequestView[];
  narration: string;
  // Only for a phone that hasn't taken a seat yet.
  join: PartyJoinOptions | null;
}

export type DesktopMessage =
  | { type: "welcome"; playerId: string | null; view: PlayerView }
  | { type: "view"; view: PlayerView }
  | { type: "toast"; text: string }
  // The desktop ended this connection on purpose (the seat was removed, or
  // opened on another screen). The phone must not reconnect on its own.
  | { type: "kicked"; reason: string }
  | { type: "pong" };

// ---------------------------------------------------------------- parsing

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, max: number): string | undefined {
  return typeof v === "string" && v.length <= max ? v : undefined;
}

function tagList(v: unknown): string[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length > PARTY_MAX_TAGS) return undefined;
  const out: string[] = [];
  for (const t of v) {
    if (typeof t !== "string" || t.length > PARTY_MAX_TAG_CHARS) return undefined;
    out.push(t);
  }
  return out;
}

const ID_MAX = 64;
// Room for surrounding whitespace that the host trims off.
const TEXT_SLACK = 200;

// Parse one raw WebSocket frame from a phone. Anything malformed, oversized or
// of an unknown type is null and gets dropped: a phone is untrusted input.
export function parsePhoneMessage(raw: string): PhoneMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(data) || typeof data.type !== "string") return null;
  switch (data.type) {
    case "hello": {
      const token = str(data.token, 256);
      if (token === undefined) return null;
      const playerId = data.playerId === undefined ? undefined : str(data.playerId, ID_MAX);
      const seatKey = data.seatKey === undefined ? undefined : str(data.seatKey, ID_MAX);
      if (data.playerId !== undefined && playerId === undefined) return null;
      if (data.seatKey !== undefined && seatKey === undefined) return null;
      return { type: "hello", token, playerId, seatKey };
    }
    case "join": {
      const name = str(data.name, PARTY_MAX_NAME_CHARS + TEXT_SLACK);
      const color = str(data.color, 16);
      if (name === undefined || color === undefined) return null;
      const archetype =
        typeof data.archetype === "string" &&
        (PARTY_ARCHETYPES as readonly string[]).includes(data.archetype)
          ? (data.archetype as PlayerArchetype)
          : undefined;
      const personalityTags = tagList(data.personalityTags);
      const wishTags = tagList(data.wishTags);
      const seatId = data.seatId === undefined ? undefined : str(data.seatId, ID_MAX);
      if (data.seatId !== undefined && seatId === undefined) return null;
      return { type: "join", name, color, archetype, personalityTags, wishTags, seatId };
    }
    case "spotlight_take":
    case "spotlight_release":
    case "go":
    case "ping":
      return { type: data.type };
    case "line": {
      const text = str(data.text, PARTY_MAX_LINE_CHARS + TEXT_SLACK);
      if (text === undefined) return null;
      if (data.kind !== "typed" && data.kind !== "choice") return null;
      return { type: "line", text, kind: data.kind };
    }
    case "voice_chunk": {
      const takeId = str(data.takeId, ID_MAX);
      const base64 = str(data.base64, PARTY_MAX_CHUNK_BASE64);
      const seq = data.seq;
      if (takeId === undefined || base64 === undefined) return null;
      if (typeof seq !== "number" || !Number.isInteger(seq) || seq < 0) return null;
      if (typeof data.last !== "boolean") return null;
      const mimeType = data.mimeType === undefined ? undefined : str(data.mimeType, 64);
      return { type: "voice_chunk", takeId, seq, base64, last: data.last, mimeType };
    }
    case "roll_result": {
      const requestId = str(data.requestId, ID_MAX);
      if (requestId === undefined) return null;
      if (data.value === null) return { type: "roll_result", requestId, value: null };
      const value = str(data.value, PARTY_MAX_LINE_CHARS);
      if (value === undefined) return null;
      return { type: "roll_result", requestId, value };
    }
    case "answer": {
      const requestId = str(data.requestId, ID_MAX);
      if (requestId === undefined || !Array.isArray(data.answers)) return null;
      if (data.answers.length > 3) return null;
      const answers: AnswerItem[] = [];
      for (const a of data.answers) {
        if (!isObj(a) || typeof a.skipped !== "boolean") return null;
        const selectedLabel =
          a.selectedLabel === undefined ? undefined : str(a.selectedLabel, PARTY_MAX_LINE_CHARS);
        const customText =
          a.customText === undefined ? undefined : str(a.customText, PARTY_MAX_LINE_CHARS);
        if (a.selectedLabel !== undefined && selectedLabel === undefined) return null;
        if (a.customText !== undefined && customText === undefined) return null;
        let selectedLabels: string[] | undefined;
        if (a.selectedLabels !== undefined) {
          if (!Array.isArray(a.selectedLabels) || a.selectedLabels.length > PARTY_MAX_PICKS) {
            return null;
          }
          selectedLabels = [];
          for (const l of a.selectedLabels) {
            const label = str(l, PARTY_MAX_LINE_CHARS);
            if (label === undefined) return null;
            selectedLabels.push(label);
          }
        }
        answers.push({
          selectedLabel,
          ...(selectedLabels ? { selectedLabels } : {}),
          customText,
          skipped: a.skipped,
        });
      }
      return { type: "answer", requestId, answers };
    }
    case "vad_features": {
      if (typeof data.t !== "number" || typeof data.p !== "number" || typeof data.level !== "number") {
        return null;
      }
      return { type: "vad_features", t: data.t, p: data.p, level: data.level };
    }
    default:
      return null;
  }
}
