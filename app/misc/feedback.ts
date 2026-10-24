/**
 * Feedback to the developer (docs/feedback-design.md, decisions 190-194): the
 * shape of a submission, the builder that enforces the allowlist and the caps,
 * and the validator that mirrors the Worker's schema rule for rule.
 *
 * Pure apart from the two platform probes at the bottom. Nothing here sends
 * anything (feedbackClient.ts does) and nothing here reads a tool result body,
 * a tool argument, reasoning, a note or a memory: the only things a turn
 * attachment can hold are the player's line, the turn's visible prose, the
 * one-line roll summaries the work line already shows, and model names.
 */
import { isTauri } from "@tauri-apps/api/core";
import { Capacitor } from "@capacitor/core";
import type { ScenePart } from "./structs";
import { extractVisibleText, redactForPlayer } from "./turnTimeline";
import { getTierModelDisplayName } from "./reasoningTiers";
import { isStandalone } from "./standalone";
import { rollHeadline } from "../story/turnWork";
import type { BuiltinSystem } from "./systems/types";

// ---- The contract (fixed by the Worker) ------------------------------------

export type FeedbackKind = "turn" | "system" | "starter" | "session" | "app";
export type FeedbackPlatform = "desktop" | "android" | "ios" | "web";
export type FeedbackRating = 1 | 2 | 3 | 4 | 5;

export interface TurnAttachment {
  playerLine: string;
  prose: string;
  rolls: string[];
  models: string[];
}

export interface FeedbackSubmission {
  v: 1;
  id: string;
  kind: FeedbackKind;
  systemId?: string;
  starterId?: string;
  rating?: FeedbackRating;
  text: string;
  app: { version: string; platform: FeedbackPlatform };
  session?: number;
  turn?: TurnAttachment;
}

export const FEEDBACK_KINDS: readonly FeedbackKind[] = [
  "turn",
  "system",
  "starter",
  "session",
  "app",
];
export const FEEDBACK_PLATFORMS: readonly FeedbackPlatform[] = [
  "desktop",
  "android",
  "ios",
  "web",
];

/** Lengths are JavaScript string lengths (UTF-16 units), as the Worker counts them. */
export const FEEDBACK_LIMITS = {
  idMin: 8,
  idMax: 64,
  systemId: 64,
  starterId: 128,
  text: 2000,
  version: 32,
  sessionMax: 10000,
  playerLine: 1000,
  prose: 4000,
  rolls: 12,
  roll: 200,
  models: 4,
  model: 80,
  /** The whole JSON body, in UTF-8 bytes. */
  bodyBytes: 16384,
} as const;

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

// ---- Text helpers -----------------------------------------------------------

/**
 * Takes out `||hidden||` spans (the markup the narrator uses for text the
 * player only sees with "Show hidden messages" on). A lone `||` with no closer
 * hides everything after it: when in doubt, less leaves the device.
 */
export function stripHiddenSpans(text: string): string {
  const closed = text.replace(/\|\|[\s\S]*?\|\|/g, "");
  const open = closed.indexOf("||");
  return open === -1 ? closed : closed.slice(0, open);
}

/** Cuts to `max` UTF-16 units without leaving half of a surrogate pair behind. */
export function cutChars(text: string, max: number): string {
  if (max <= 0) return "";
  if (text.length <= max) return text;
  let cut = text.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return cut;
}

/** The hidden spans go first, then the cut: a span straddling the cut point is gone, not half-shown. */
function cleanField(text: unknown, max: number): string {
  if (typeof text !== "string") return "";
  return cutChars(stripHiddenSpans(text), max);
}

export function bodyBytes(sub: FeedbackSubmission): number {
  return new TextEncoder().encode(JSON.stringify(sub)).length;
}

// ---- Building ---------------------------------------------------------------

export interface FeedbackInput {
  id: string;
  kind: FeedbackKind;
  systemId?: string | null;
  starterId?: string | null;
  rating?: number | null;
  text: string;
  session?: number | null;
  turn?: Partial<TurnAttachment> | null;
  /** Defaults to appVersion() / appPlatform(). */
  app?: { version: string; platform: FeedbackPlatform };
}

function cleanList(list: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const item of list) {
    if (out.length >= maxItems) break;
    const clean = cleanField(item, maxLen).trim();
    if (clean) out.push(clean);
  }
  return out;
}

function cleanTurn(turn: Partial<TurnAttachment>): TurnAttachment | undefined {
  const clean: TurnAttachment = {
    playerLine: cleanField(turn.playerLine, FEEDBACK_LIMITS.playerLine),
    prose: cleanField(turn.prose, FEEDBACK_LIMITS.prose),
    rolls: cleanList(turn.rolls, FEEDBACK_LIMITS.rolls, FEEDBACK_LIMITS.roll),
    models: cleanList(turn.models, FEEDBACK_LIMITS.models, FEEDBACK_LIMITS.model),
  };
  const empty =
    !clean.playerLine.trim() &&
    !clean.prose.trim() &&
    clean.rolls.length === 0 &&
    clean.models.length === 0;
  return empty ? undefined : clean;
}

/**
 * Trims until the JSON body fits the Worker's 16 KB, prose first (design §2),
 * then the player's line, then the free text, then the roll and model lists.
 * Each field is cut to the longest length that makes the body fit (a binary
 * search, because a character costs between one and six bytes of JSON), and
 * only a field that cannot make it fit alone is emptied before the next.
 */
function fit(sub: FeedbackSubmission): FeedbackSubmission {
  const fits = () => bodyBytes(sub) <= FEEDBACK_LIMITS.bodyBytes;
  if (fits()) return sub;

  const turn = sub.turn;
  const fields: Array<[() => string, (v: string) => void]> = [];
  if (turn) {
    fields.push([() => turn.prose, (v) => void (turn.prose = v)]);
    fields.push([() => turn.playerLine, (v) => void (turn.playerLine = v)]);
  }
  fields.push([() => sub.text, (v) => void (sub.text = v)]);

  for (const [get, set] of fields) {
    const original = get();
    set("");
    if (!fits()) continue;
    let lo = 0;
    let hi = original.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      set(cutChars(original, mid));
      if (fits()) lo = mid;
      else hi = mid - 1;
    }
    set(cutChars(original, lo));
    return sub;
  }
  while (!fits() && turn && (turn.rolls.length > 0 || turn.models.length > 0)) {
    if (turn.rolls.length > 0) turn.rolls.pop();
    else turn.models.pop();
  }
  return sub;
}

/**
 * The one place a submission is made. It is an allowlist: it reads only the
 * named fields of its input, drops `||hidden||` spans before cutting any field
 * to length, leaves an unset optional out entirely, and fits the body under
 * 16 KB by trimming the attached prose first. It does not judge whether the
 * result is sendable; validateSubmission() does.
 */
export function buildSubmission(input: FeedbackInput): FeedbackSubmission {
  const sub: FeedbackSubmission = {
    v: 1,
    id: input.id,
    kind: input.kind,
    text: cutChars(typeof input.text === "string" ? input.text.trim() : "", FEEDBACK_LIMITS.text),
    app: input.app ?? { version: appVersion(), platform: appPlatform() },
  };
  const systemId = cutChars((input.systemId ?? "").trim(), FEEDBACK_LIMITS.systemId);
  if (systemId) sub.systemId = systemId;
  const starterId = cutChars((input.starterId ?? "").trim(), FEEDBACK_LIMITS.starterId);
  if (starterId) sub.starterId = starterId;
  const rating = input.rating;
  if (
    typeof rating === "number" &&
    Number.isInteger(rating) &&
    rating >= 1 &&
    rating <= 5
  ) {
    sub.rating = rating as FeedbackRating;
  }
  if (
    input.kind === "session" &&
    typeof input.session === "number" &&
    Number.isInteger(input.session) &&
    input.session >= 1 &&
    input.session <= FEEDBACK_LIMITS.sessionMax
  ) {
    sub.session = input.session;
  }
  if (input.turn && (input.kind === "turn" || input.kind === "session")) {
    const turn = cleanTurn(input.turn);
    if (turn) sub.turn = turn;
  }
  return fit(sub);
}

// ---- Validating (mirrors the Worker) ---------------------------------------

export type FeedbackValidation = { ok: true } | { ok: false; field: string };

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function stringWithin(x: unknown, min: number, max: number): boolean {
  return typeof x === "string" && x.length >= min && x.length <= max;
}

/** The first key of `obj` not in `allowed`, or null. */
function unknownKey(obj: Record<string, unknown>, allowed: readonly string[]): string | null {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) return key;
  }
  return null;
}

/**
 * The Worker's strict schema, for the client to refuse early: unknown keys,
 * wrong types, a fractional rating, a missing rating-and-text, an oversized
 * field. Not the body size: that is bodyBytes() against
 * FEEDBACK_LIMITS.bodyBytes, which the Worker answers with 413. `field` is the
 * offending key, dotted for the nested ones ("turn.prose", "app.platform").
 */
export function validateSubmission(x: unknown): FeedbackValidation {
  const bad = (field: string): FeedbackValidation => ({ ok: false, field });
  if (!isPlainObject(x)) return bad("body");
  const stray = unknownKey(x, [
    "v",
    "id",
    "kind",
    "systemId",
    "starterId",
    "rating",
    "text",
    "app",
    "session",
    "turn",
  ]);
  if (stray) return bad(stray);

  if (x.v !== 1) return bad("v");
  if (
    !stringWithin(x.id, FEEDBACK_LIMITS.idMin, FEEDBACK_LIMITS.idMax) ||
    !ID_PATTERN.test(x.id as string)
  ) {
    return bad("id");
  }
  if (typeof x.kind !== "string" || !FEEDBACK_KINDS.includes(x.kind as FeedbackKind)) {
    return bad("kind");
  }
  if (x.systemId !== undefined && !stringWithin(x.systemId, 1, FEEDBACK_LIMITS.systemId)) {
    return bad("systemId");
  }
  if (x.starterId !== undefined && !stringWithin(x.starterId, 1, FEEDBACK_LIMITS.starterId)) {
    return bad("starterId");
  }
  if (
    x.rating !== undefined &&
    !(typeof x.rating === "number" && Number.isInteger(x.rating) && x.rating >= 1 && x.rating <= 5)
  ) {
    return bad("rating");
  }
  if (!stringWithin(x.text, 0, FEEDBACK_LIMITS.text)) return bad("text");
  if (x.rating === undefined && (x.text as string).trim() === "") return bad("text");

  if (!isPlainObject(x.app)) return bad("app");
  const strayApp = unknownKey(x.app, ["version", "platform"]);
  if (strayApp) return bad(`app.${strayApp}`);
  if (!stringWithin(x.app.version, 1, FEEDBACK_LIMITS.version)) return bad("app.version");
  if (
    typeof x.app.platform !== "string" ||
    !FEEDBACK_PLATFORMS.includes(x.app.platform as FeedbackPlatform)
  ) {
    return bad("app.platform");
  }

  if (x.session !== undefined) {
    if (
      !(
        typeof x.session === "number" &&
        Number.isInteger(x.session) &&
        x.session >= 1 &&
        x.session <= FEEDBACK_LIMITS.sessionMax
      )
    ) {
      return bad("session");
    }
  }

  if (x.turn !== undefined) {
    if (!isPlainObject(x.turn)) return bad("turn");
    const strayTurn = unknownKey(x.turn, ["playerLine", "prose", "rolls", "models"]);
    if (strayTurn) return bad(`turn.${strayTurn}`);
    if (!stringWithin(x.turn.playerLine, 0, FEEDBACK_LIMITS.playerLine)) {
      return bad("turn.playerLine");
    }
    if (!stringWithin(x.turn.prose, 0, FEEDBACK_LIMITS.prose)) return bad("turn.prose");
    const lists: Array<["rolls" | "models", number, number]> = [
      ["rolls", FEEDBACK_LIMITS.rolls, FEEDBACK_LIMITS.roll],
      ["models", FEEDBACK_LIMITS.models, FEEDBACK_LIMITS.model],
    ];
    for (const [name, maxItems, maxLen] of lists) {
      const list = x.turn[name];
      if (
        !Array.isArray(list) ||
        list.length > maxItems ||
        !list.every((item) => stringWithin(item, 0, maxLen))
      ) {
        return bad(`turn.${name}`);
      }
    }
  }
  return { ok: true };
}

// ---- The attachment, from a saved turn --------------------------------------

/** A leading ">" marks a player's line in a saved turn; the form shows it without. */
function plainPlayerLine(content: string): string {
  return content
    .split("\n")
    .map((l) => l.replace(/^\s*>+\s?/, ""))
    .join("\n")
    .trim();
}

/**
 * What "Attach this turn" offers, from the GM part at `gmIndex` and the
 * player's line before it. Only: the player's line, the turn's visible prose
 * (no `<thinking>`, no hidden note text, no `||hidden||` spans), the roll
 * headlines the work line shows (executed rolls only, none made behind the
 * GM's screen) and the model that adjudicated the turn. A tool result's body,
 * a tool call's arguments, reasoning, notes and memory never enter.
 */
export function turnAttachmentFrom(
  parts: readonly ScenePart[],
  gmIndex: number,
): TurnAttachment | null {
  const part = parts[gmIndex];
  if (!part || part.user) return null;

  let playerLine = "";
  for (let i = gmIndex - 1; i >= 0; i--) {
    if (parts[i].user) {
      playerLine = plainPlayerLine(parts[i].content ?? "");
      break;
    }
  }

  const rolls: string[] = [];
  for (const call of part.gmToolCalls ?? []) {
    if (!call || call.success === false || call.hiddenFromPlayer) continue;
    const headline = rollHeadline(
      String(call.toolName ?? ""),
      String(call.contextForStory ?? ""),
    );
    if (headline) rolls.push(headline);
  }

  const models: string[] = [];
  if (part.reasoningTierModelKey) {
    models.push(getTierModelDisplayName(part.reasoningTierModelKey));
  }

  const prose = redactForPlayer(extractVisibleText(part.content ?? ""));
  return cleanTurn({ playerLine, prose, rolls, models }) ?? null;
}

// ---- Which system or starter a story belongs to -----------------------------

/**
 * The built-in starter a story was begun from, best effort: a story does not
 * record where it came from, so this is derived. The system must resolve; the
 * starter's `systemState.setting` must equal the story's; and at least half of
 * the starter's note titles must still be in the story. Null when nothing
 * fits (a story of the player's own making).
 */
export function starterIdFor(
  story: {
    lore?: Array<{ title?: string }>;
    systemState?: { setting?: string };
  },
  owner: BuiltinSystem | undefined,
): string | null {
  if (!owner) return null;
  const titles = new Set((story.lore ?? []).map((l) => l.title ?? ""));
  let best: { id: string; share: number } | null = null;
  for (const starter of owner.starters) {
    const template = starter.adventure.storyTemplate;
    if ((template?.systemState?.setting ?? undefined) !== (story.systemState?.setting ?? undefined)) {
      continue;
    }
    const own = (template?.lore ?? []).map((l) => l.title);
    if (own.length === 0) continue;
    const share = own.filter((t) => titles.has(t)).length / own.length;
    if (share >= 0.5 && (!best || share > best.share)) {
      best = { id: starter.id, share };
    }
  }
  return best?.id ?? null;
}

// ---- Ids and the platform ---------------------------------------------------

/** A random 32-character id. Call it from a handler or a lazy state initialiser, never during render. */
export function newFeedbackId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** package.json's version, baked in by next.config.ts. */
export function appVersion(): string {
  return cutChars(process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0", FEEDBACK_LIMITS.version);
}

export function appPlatform(): FeedbackPlatform {
  try {
    if (isTauri()) return "desktop";
    if (isStandalone()) {
      const platform = Capacitor.getPlatform();
      if (platform === "android" || platform === "ios") return platform;
    }
  } catch {
    // A probe that throws is not a native app.
  }
  return "web";
}
