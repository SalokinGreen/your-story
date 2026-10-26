/**
 * The `campaign` GM tool's executor (design section 7). It works on the
 * executor's working copy, validates every write by part with the exact
 * repair named, and never writes prose: the GM narrates what it reports.
 *
 * Ids are made here, with crypto.randomUUID(), never during render.
 */

import type { GMToolResult } from "../gmExecutor";
import type { CampaignParams } from "../gmTools";
import type { StoryData } from "../structs";
import { resolveSystem } from "../systems/resolve";
import { defaultClockVisibility, describeTick, tickClock } from "./clocks";
import { migrateTimers } from "./migrate";
import {
  CAMPAIGN_PARTS,
  PART_SHAPES,
  SINGLETON_PARTS,
  listIds,
  validatePart,
} from "./validate";
import type {
  CampaignPart,
  ClockValue,
  FactionValue,
  FrontValue,
  LocationValue,
  PersonValue,
  PitchValue,
  SafetyValue,
  SecretValue,
  ValidationContext,
} from "./validate";
import { emptyCampaign } from "./types";
import type { Beat, CampaignRecord, CampaignStyle, Clock, Front, SafetyItem } from "./types";

type Ref = { id: string; name?: string; title?: string };

/** An id with a prefix, made with crypto.randomUUID() and unique inside `taken`. */
export function makeId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let i = 0; i < 6; i++) {
    const id = `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
    if (!used.has(id)) return id;
  }
  let n = 2;
  const base = `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

function findRef<T extends Ref>(list: T[], ref: string | undefined): T | undefined {
  if (!ref) return undefined;
  const lower = ref.trim().toLowerCase();
  return (
    list.find((x) => x.id === ref) ??
    list.find((x) => (x.name ?? x.title ?? "").toLowerCase() === lower)
  );
}

function allIds(record: CampaignRecord): string[] {
  return [
    ...record.factions.map((x) => x.id),
    ...record.fronts.map((x) => x.id),
    ...record.clocks.map((x) => x.id),
    ...record.secrets.flatMap((s) => [s.id, ...s.clues.map((c) => c.id)]),
    ...record.locations.map((x) => x.id),
    ...record.endStates.map((x) => x.id),
    ...(record.beats?.list.map((b) => b.id) ?? []),
    ...(record.safety?.lines.map((x) => x.id) ?? []),
    ...(record.safety?.veils.map((x) => x.id) ?? []),
  ];
}

function result(
  toolCallId: string,
  p: CampaignParams,
  ok: boolean,
  message: string,
  extra: { part?: string; id?: string } = {},
): GMToolResult {
  return {
    toolName: "campaign",
    toolCallId,
    success: ok,
    result: { type: "campaign", action: p.action, part: extra.part ?? p.part, id: extra.id ?? p.id, message },
    contextForStory: ok ? `[Campaign: ${message}]` : `[ERROR: ${message}]`,
  };
}

/**
 * Triggers an offered tool can fire (events.ts): scene (increment_scene), miss
 * (record_challenge_result, and the system's rolls) and manual always; rest
 * only from take_rest, session only from end_session, both system tools.
 */
function fireableTriggersFor(story: StoryData): string[] {
  const tools = resolveSystem(story).tools as string[];
  const out = ["manual", "scene", "miss"];
  if (tools.includes("take_rest")) out.push("rest");
  if (tools.includes("end_session")) out.push("session");
  return out;
}

function ctxFor(story: StoryData, record: CampaignRecord, isNew: boolean): ValidationContext {
  return {
    isNew,
    record,
    npcs: (story.npcs ?? []).map((n) => ({ id: n.id, name: n.name })),
    threads: (story.threads ?? []).map((t) => ({ id: t.id, title: t.title })),
    beatsAllowed: record.style === "adventure_path",
    fireableTriggers: fireableTriggersFor(story),
  };
}

function mergeForEdit(existing: Record<string, unknown>, data: Record<string, unknown>): Record<string, unknown> {
  return { ...existing, ...data };
}

// ---------------------------------------------------------------------------
// read
// ---------------------------------------------------------------------------

function describeClock(c: Clock): string {
  return `${c.id} "${c.name}" ${c.filled}/${c.segments} [${c.triggers.join("/")}]${c.visible ? "" : " hidden"}${
    c.paused ? " paused" : ""
  }${c.cancelled ? " cancelled" : ""}${c.onFill ? ` | on fill: ${c.onFill}` : ""}${
    c.link ? ` | linked to ${c.link.kind} ${c.link.id}` : ""
  }`;
}

function describeFront(f: Front): string {
  return [
    `${f.id} "${f.name}" (${f.status}) clock: ${f.clockId ?? "none"}`,
    `  doom: ${f.doom}`,
    ...f.dangers.map((d) => `  danger: ${d.name} - ${d.impulse}`),
    ...f.portents.map((p) => `  portent${p.at > 0 ? ` at ${p.at}` : ""}: ${p.text}`),
    ...f.stakes.map((q) => `  stakes: ${q}`),
  ].join("\n");
}

function describeAll(story: StoryData, record: CampaignRecord, part: CampaignPart): string[] {
  switch (part) {
    case "style":
      return [`style: ${record.style ?? "not set"}`];
    case "pitch":
      return [record.pitch ? `premise: ${record.pitch.premise}\ntone: ${record.pitch.tone.join(", ")}` : "pitch: not set"];
    case "safety":
      return [
        `lines: ${(record.safety?.lines ?? []).map((l) => l.text).join("; ") || "none set"}`,
        `veils: ${(record.safety?.veils ?? []).map((l) => l.text).join("; ") || "none set"}`,
      ];
    case "faction":
      return record.factions.map((f) => `${f.id} "${f.name}": ${f.goal}${f.methods ? ` (methods: ${f.methods})` : ""}${f.clockId ? ` clock: ${f.clockId}` : ""}`);
    case "front":
      return record.fronts.map(describeFront);
    case "clock":
      return record.clocks.map(describeClock);
    case "person":
      return record.people.map((p) => {
        const npc = (story.npcs ?? []).find((n) => n.id === p.npcId);
        return `${p.npcId} ${npc ? `"${npc.name}"` : "(missing)"}${p.want ? ` wants: ${p.want}` : ""}${p.secret ? ` | secret: ${p.secret}` : ""}${p.voice ? ` | voice: ${p.voice}` : ""}`;
      });
    case "secret":
      return record.secrets.map(
        (s) =>
          `${s.id} "${s.title}"${s.revealed ? " (revealed)" : ""}: ${s.truth}\n` +
          (s.keyPhrases.length ? `  key phrases: ${s.keyPhrases.join(", ")}\n` : "") +
          s.clues.map((c) => `  clue ${c.id}${c.found ? " (found)" : ""}: ${c.text}${c.where ? ` [${c.where}]` : ""}`).join("\n"),
      );
    case "location":
      return record.locations.map(
        (l) => `${l.id} "${l.name}": ${l.features.join("; ")}${l.noteId ? ` note: ${l.noteId}` : ""}${l.npcIds.length ? ` people: ${l.npcIds.join(", ")}` : ""}`,
      );
    case "beat":
      return (record.beats?.list ?? []).map(
        (b) => `${b.id} [${b.status}] ${b.title}: ${b.summary}${record.beats?.currentId === b.id ? " <- current" : ""}`,
      );
    case "end_state":
      return record.endStates.map((e) => `${e.id}: ${e.text}`);
  }
}

function executeRead(story: StoryData, p: CampaignParams, toolCallId: string): GMToolResult {
  const record = story.campaign;
  if (!record) return result(toolCallId, p, true, "No campaign record yet. Start one with action add.");
  if (!p.part) {
    const lines = CAMPAIGN_PARTS.map((part) => {
      const items = describeAll(story, record, part).filter((l) => !l.endsWith("not set") && !l.endsWith("none set"));
      return `${part}: ${items.length}`;
    });
    return result(toolCallId, p, true, `Parts held (read one with part; an empty part answers with its data shape):${lines.join("; ")}`);
  }
  if (!(CAMPAIGN_PARTS as readonly string[]).includes(p.part)) {
    return result(toolCallId, p, false, `Unknown part "${p.part}". Parts: ${CAMPAIGN_PARTS.join(", ")}`);
  }
  const part = p.part as CampaignPart;
  let lines = describeAll(story, record, part);
  if (p.id) {
    const wanted = p.id.toLowerCase();
    const hit = lines.filter((l) => l.toLowerCase().startsWith(wanted) || l.toLowerCase().includes(`"${wanted}"`));
    if (hit.length === 0) {
      return result(toolCallId, p, false, `Unknown ${part} id "${p.id}". Valid ids: ${lines.map((l) => l.split(" ")[0]).join(", ") || "none yet"}`);
    }
    lines = hit;
  }
  const empty = lines.length === 0 || lines.every((l) => l.endsWith("not set") || l.endsWith("none set"));
  const shape = `To add one: campaign add, part "${part}", data ${PART_SHAPES[part]}`;
  return result(toolCallId, p, true, empty ? `No ${part} yet. ${shape}` : lines.join("\n"));
}

// ---------------------------------------------------------------------------
// add / edit
// ---------------------------------------------------------------------------

function toSafety(items: { id?: string; text: string; keywords: string[] }[], taken: string[]): SafetyItem[] {
  const out: SafetyItem[] = [];
  for (const it of items) {
    const id = it.id && !taken.includes(it.id) ? it.id : makeId("saf", [...taken, ...out.map((o) => o.id)]);
    out.push({ id, text: it.text, keywords: it.keywords });
  }
  return out;
}

/** Keep both sides of a clock <-> front/faction link pointing at each other. */
function syncLinks(record: CampaignRecord, clock: Clock): void {
  if (clock.link?.kind === "front") {
    const f = record.fronts.find((x) => x.id === clock.link?.id);
    if (f && !f.clockId) f.clockId = clock.id;
  }
  if (clock.link?.kind === "faction") {
    const f = record.factions.find((x) => x.id === clock.link?.id);
    if (f && !f.clockId) f.clockId = clock.id;
  }
}

function linkFromOwner(record: CampaignRecord, clockId: string | undefined, kind: "front" | "faction", ownerId: string): void {
  if (!clockId) return;
  const clock = record.clocks.find((c) => c.id === clockId);
  if (clock && !clock.link) clock.link = { kind, id: ownerId };
}

function ensureRecord(story: StoryData): CampaignRecord {
  if (!story.campaign) {
    story.campaign = emptyCampaign();
    migrateTimers(story);
  }
  return story.campaign;
}

/**
 * Options only the GM's own tool passes (the Designer and the starters write
 * freely): `rejectName` returns a refusal for a new or renamed location whose
 * name the engine did not roll (names/accept.ts), else null.
 */
export interface CampaignWriteOptions {
  rejectName?: (name: string, kind: "place") => string | null;
}

function executeWrite(
  story: StoryData,
  p: CampaignParams,
  toolCallId: string,
  opts: CampaignWriteOptions = {},
): GMToolResult {
  const isEdit = p.action === "edit";
  if (!p.part || !(CAMPAIGN_PARTS as readonly string[]).includes(p.part)) {
    return result(toolCallId, p, false, `${p.action} needs \`part\`, one of ${CAMPAIGN_PARTS.join(", ")}`);
  }
  const part = p.part as CampaignPart;
  if (p.data === undefined) return result(toolCallId, p, false, `${p.action} ${part} needs \`data\`: ${PART_SHAPES[part]}`);

  const singleton = (SINGLETON_PARTS as readonly string[]).includes(part);
  // Validation runs against a stand-in when there is no record yet, so a
  // refusal leaves no half-made record behind.
  const record = story.campaign ?? emptyCampaign();

  // Find the target of an edit.
  let existing: Record<string, unknown> | undefined;
  let existingId: string | undefined;
  if (isEdit && !singleton) {
    if (!p.id) return result(toolCallId, p, false, `edit ${part} needs \`id\``);
    const pool = poolFor(story, record, part);
    const hit = pool.find((x) => x.key === p.id || x.name.toLowerCase() === p.id!.toLowerCase());
    if (!hit) return result(toolCallId, p, false, `Unknown ${part} id "${p.id}". Valid ids: ${pool.map((x) => `${x.key} (${x.name})`).join(", ") || "none yet"}`);
    existing = hit.value;
    existingId = hit.key;
    if (part === "secret" && (p.data.clues !== undefined || p.data.revealed !== undefined)) {
      return result(toolCallId, p, false, "edit secret cannot change `clues` or `revealed`; use place_clue, find_clue and reveal_secret");
    }
  }
  if (!isEdit && part === "person" && isRecord(p.data)) {
    const npcId = typeof p.data.npcId === "string" ? p.data.npcId : undefined;
    if (npcId && record.people.some((x) => x.npcId === npcId)) {
      return result(toolCallId, p, false, `person "${npcId}" already has an entry; use edit with id "${npcId}"`);
    }
  }

  if (isEdit && part === "clock" && p.data.filled !== undefined) {
    return result(toolCallId, p, false, 'edit clock cannot set `filled`; use action "tick" with `by` (negative to take a segment back) and a `reason`');
  }

  const candidate = existing ? mergeForEdit(stripState(part, existing), p.data) : p.data;
  const v = validatePart(part, candidate, ctxFor(story, record, !isEdit));
  if (!v.ok) return result(toolCallId, p, false, v.error);
  if (part === "location" && opts.rejectName) {
    const nextName = (v.value as { name?: string }).name;
    const oldName = existing && typeof existing.name === "string" ? existing.name : undefined;
    if (nextName && nextName !== oldName) {
      const why = opts.rejectName(nextName, "place");
      if (why) return result(toolCallId, p, false, why);
    }
  }

  const rec = ensureRecord(story);
  const taken = allIds(rec);
  const value = v.value;

  switch (part) {
    case "style": {
      rec.style = (value as { style: CampaignStyle }).style;
      if (rec.origin === "migrated") delete rec.origin;
      return result(toolCallId, p, true, `style set to ${rec.style}`, { part });
    }
    case "pitch": {
      rec.pitch = value as PitchValue;
      return result(toolCallId, p, true, "pitch saved", { part });
    }
    case "safety": {
      const sv = value as SafetyValue;
      rec.safety = {
        lines: toSafety(sv.lines, taken),
        veils: toSafety(sv.veils, [...taken, ...sv.lines.map((l) => l.id ?? "")]),
      };
      return result(toolCallId, p, true, `safety saved: ${rec.safety.lines.length} lines, ${rec.safety.veils.length} veils`, { part });
    }
    case "faction": {
      const fv = value as FactionValue;
      if (existingId) {
        const f = rec.factions.find((x) => x.id === existingId)!;
        Object.assign(f, fv);
        linkFromOwner(rec, f.clockId, "faction", f.id);
        return result(toolCallId, p, true, `faction "${f.name}" updated`, { part, id: f.id });
      }
      const f = { id: makeId("fac", taken), ...fv };
      rec.factions.push(f);
      linkFromOwner(rec, f.clockId, "faction", f.id);
      return result(toolCallId, p, true, `faction "${f.name}" added (id ${f.id})`, { part, id: f.id });
    }
    case "front": {
      const fv = value as FrontValue;
      if (existingId) {
        const f = rec.fronts.find((x) => x.id === existingId)!;
        Object.assign(f, { ...fv, status: fv.status ?? f.status });
        linkFromOwner(rec, f.clockId, "front", f.id);
        return result(toolCallId, p, true, `front "${f.name}" updated`, { part, id: f.id });
      }
      const f: Front = { id: makeId("frt", taken), ...fv, status: fv.status ?? "active" };
      rec.fronts.push(f);
      linkFromOwner(rec, f.clockId, "front", f.id);
      return result(toolCallId, p, true, `front "${f.name}" added (id ${f.id})`, { part, id: f.id });
    }
    case "clock": {
      const cv = value as ClockValue;
      if (existingId) {
        const c = rec.clocks.find((x) => x.id === existingId)!;
        c.name = cv.name;
        c.segments = cv.segments;
        c.triggers = cv.triggers;
        c.filled = Math.min(cv.filled ?? c.filled, cv.segments);
        if (cv.link) c.link = cv.link;
        if (cv.onFill !== undefined) c.onFill = cv.onFill;
        if (cv.visible !== undefined) c.visible = cv.visible;
        syncLinks(rec, c);
        return result(toolCallId, p, true, `clock "${c.name}" updated (${c.filled}/${c.segments})`, { part, id: c.id });
      }
      const c: Clock = {
        id: makeId("clk", taken),
        name: cv.name,
        segments: cv.segments,
        filled: cv.filled ?? 0,
        triggers: cv.triggers,
        visible: cv.visible ?? defaultClockVisibility(rec.style),
        paused: false,
        crossed: [],
      };
      if (cv.link) c.link = cv.link;
      if (cv.onFill) c.onFill = cv.onFill;
      rec.clocks.push(c);
      syncLinks(rec, c);
      return result(toolCallId, p, true, `clock "${c.name}" added (id ${c.id}, ${c.filled}/${c.segments}, ticks on ${c.triggers.join("/")})`, { part, id: c.id });
    }
    case "person": {
      const pv = value as PersonValue;
      const at = rec.people.findIndex((x) => x.npcId === pv.npcId);
      if (at >= 0) rec.people[at] = pv;
      else rec.people.push(pv);
      return result(toolCallId, p, true, `person ${pv.npcId} saved`, { part, id: pv.npcId });
    }
    case "secret": {
      const sv = value as SecretValue;
      if (existingId) {
        const s = rec.secrets.find((x) => x.id === existingId)!;
        s.title = sv.title;
        s.truth = sv.truth;
        s.keyPhrases = sv.keyPhrases;
        return result(toolCallId, p, true, `secret "${s.title}" updated`, { part, id: s.id });
      }
      const id = makeId("sec", taken);
      const seen = new Set<string>([...taken, id]);
      const clues = sv.clues.map((c) => {
        const clueId = makeId("clu", seen);
        seen.add(clueId);
        return { id: clueId, text: c.text, ...(c.where ? { where: c.where } : {}), found: false };
      });
      rec.secrets.push({ id, title: sv.title, truth: sv.truth, keyPhrases: sv.keyPhrases, revealed: false, clues });
      return result(toolCallId, p, true, `secret "${sv.title}" added (id ${id}, ${clues.length} clues)`, { part, id });
    }
    case "location": {
      const lv = value as LocationValue;
      if (existingId) {
        const l = rec.locations.find((x) => x.id === existingId)!;
        Object.assign(l, lv);
        return result(toolCallId, p, true, `location "${l.name}" updated`, { part, id: l.id });
      }
      const l = { id: makeId("loc", taken), ...lv };
      rec.locations.push(l);
      return result(toolCallId, p, true, `location "${l.name}" added (id ${l.id})`, { part, id: l.id });
    }
    case "beat": {
      const bv = value as { title: string; summary: string };
      const beats = (rec.beats ??= { list: [] });
      if (existingId) {
        const b = beats.list.find((x) => x.id === existingId)!;
        b.title = bv.title;
        b.summary = bv.summary;
        return result(toolCallId, p, true, `beat "${b.title}" updated`, { part, id: b.id });
      }
      const b: Beat = { id: makeId("bt", taken), title: bv.title, summary: bv.summary, status: "pending" };
      if (!beats.currentId) {
        b.status = "current";
        beats.currentId = b.id;
      }
      beats.list.push(b);
      return result(toolCallId, p, true, `beat "${b.title}" added (id ${b.id})${beats.currentId === b.id ? ", now the current beat" : ""}`, { part, id: b.id });
    }
    case "end_state": {
      const text = (value as { text: string }).text;
      if (existingId) {
        const e = rec.endStates.find((x) => x.id === existingId)!;
        e.text = text;
        return result(toolCallId, p, true, "end state updated", { part, id: e.id });
      }
      const e = { id: makeId("end", taken), text };
      rec.endStates.push(e);
      return result(toolCallId, p, true, `end state added (id ${e.id})`, { part, id: e.id });
    }
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Keep the editable shape of an existing part: no ids or engine-owned state. */
function stripState(part: CampaignPart, existing: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...existing };
  delete copy.id;
  if (part === "clock") {
    delete copy.crossed;
    delete copy.paused;
    delete copy.cancelled;
    delete copy.migratedFromTimerId;
  }
  if (part === "secret") {
    delete copy.clues;
    delete copy.revealed;
  }
  if (part === "beat") delete copy.status;
  return copy;
}

interface PoolEntry {
  key: string;
  name: string;
  value: Record<string, unknown>;
}

function poolFor(story: StoryData, record: CampaignRecord, part: CampaignPart): PoolEntry[] {
  const as = <T extends object>(list: T[], key: (x: T) => string, name: (x: T) => string): PoolEntry[] =>
    list.map((x) => ({ key: key(x), name: name(x), value: x as unknown as Record<string, unknown> }));
  switch (part) {
    case "faction":
      return as(record.factions, (x) => x.id, (x) => x.name);
    case "front":
      return as(record.fronts, (x) => x.id, (x) => x.name);
    case "clock":
      return as(record.clocks, (x) => x.id, (x) => x.name);
    case "person":
      return as(record.people, (x) => x.npcId, (x) => (story.npcs ?? []).find((n) => n.id === x.npcId)?.name ?? x.npcId);
    case "secret":
      return as(record.secrets, (x) => x.id, (x) => x.title);
    case "location":
      return as(record.locations, (x) => x.id, (x) => x.name);
    case "beat":
      return as(record.beats?.list ?? [], (x) => x.id, (x) => x.title);
    case "end_state":
      return as(record.endStates, (x) => x.id, (x) => x.text);
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// clocks, fronts, secrets, clues, beats
// ---------------------------------------------------------------------------

function needRecord(story: StoryData, p: CampaignParams, toolCallId: string): CampaignRecord | GMToolResult {
  if (story.campaign) return story.campaign;
  return result(toolCallId, p, false, `There is no campaign record yet. Start one with action add (for example part "style").`);
}

function unknown(kind: string, ref: string | undefined, list: Ref[]): string {
  return ref
    ? `Unknown ${kind} id "${ref}". Valid ids: ${listIds(list)}`
    : `${kind} needs \`id\`. Valid ids: ${listIds(list)}`;
}

function manualTick(
  record: CampaignRecord,
  clockRef: string | undefined,
  p: CampaignParams,
  toolCallId: string,
  cause: string,
): GMToolResult {
  const clock = findRef(record.clocks, clockRef);
  if (!clock) return result(toolCallId, p, false, unknown("clock", clockRef, record.clocks));
  const by = typeof p.by === "number" && Number.isFinite(p.by) && Math.trunc(p.by) !== 0 ? Math.trunc(p.by) : 1;
  const before = clock.filled;
  const t = tickClock(clock, by, p.reason, record);
  if (t.refused) {
    return result(toolCallId, p, false, `Clock "${clock.name}" is ${t.refused === "cancelled" ? "cancelled" : "paused"}; ${t.refused === "paused" ? "resume it first" : "edit or resume it to use it again"}`, { id: clock.id });
  }
  if (t.applied === 0) {
    return result(toolCallId, p, false, `Clock "${clock.name}" is already ${by > 0 ? "full" : "empty"} (${clock.filled}/${clock.segments})`, { id: clock.id });
  }
  const idx = record.clocks.findIndex((c) => c.id === clock.id);
  record.clocks[idx] = t.clock;
  const line = describeTick(t.clock, before, t, record, cause);
  return {
    toolName: "campaign",
    toolCallId,
    success: true,
    result: { type: "campaign", action: p.action, part: "clock", id: clock.id, message: line.slice(1, -1) },
    contextForStory: line,
  };
}

function executeClockState(p: CampaignParams, record: CampaignRecord, toolCallId: string): GMToolResult {
  const clock = findRef(record.clocks, p.id);
  if (!clock) return result(toolCallId, p, false, unknown("clock", p.id, record.clocks));
  if (p.action === "pause") {
    clock.paused = true;
    return result(toolCallId, p, true, `clock "${clock.name}" paused at ${clock.filled}/${clock.segments}`, { id: clock.id });
  }
  if (p.action === "cancel") {
    // Works on a full clock too: that is how a filled clock is cleared.
    if (clock.cancelled) return result(toolCallId, p, false, `clock "${clock.name}" is already cancelled`, { id: clock.id });
    clock.paused = true;
    clock.cancelled = true;
    return result(toolCallId, p, true, `clock "${clock.name}" cancelled at ${clock.filled}/${clock.segments}; resume it to use it again`, { id: clock.id });
  }
  clock.paused = false;
  delete clock.cancelled;
  return result(toolCallId, p, true, `clock "${clock.name}" resumed at ${clock.filled}/${clock.segments}`, { id: clock.id });
}

function executeAdvanceFront(record: CampaignRecord, p: CampaignParams, toolCallId: string): GMToolResult {
  const front = findRef(record.fronts, p.id);
  if (!front) return result(toolCallId, p, false, unknown("front", p.id, record.fronts));
  const status = p.data && typeof p.data.status === "string" ? p.data.status : undefined;
  if (status !== undefined) {
    if (status !== "active" && status !== "resolved" && status !== "doomed") {
      return result(toolCallId, p, false, "advance_front `data.status` must be active, resolved or doomed");
    }
    front.status = status;
    return result(toolCallId, p, true, `front "${front.name}" is now ${status}`, { id: front.id });
  }
  if (!front.clockId) {
    return result(toolCallId, p, false, `front "${front.name}" has no clock; add one (campaign add, part "clock", data with link {kind "front", id "${front.id}"}) or pass data {status}`, { id: front.id });
  }
  return manualTick(record, front.clockId, { ...p, action: "advance_front" }, toolCallId, `front advanced${p.reason ? `: ${p.reason}` : ""}`);
}

function executeSecretAction(record: CampaignRecord, p: CampaignParams, toolCallId: string): GMToolResult {
  if (p.action === "find_clue") {
    for (const s of record.secrets) {
      const c = s.clues.find((x) => x.id === p.id);
      if (c) {
        if (c.found) return result(toolCallId, p, false, `Clue ${c.id} was already found`, { id: c.id });
        c.found = true;
        const found = s.clues.filter((x) => x.found).length;
        return result(toolCallId, p, true, `clue found for "${s.title}": ${found} of ${s.clues.length} clues found`, { id: c.id });
      }
    }
    const all = record.secrets.flatMap((s) => s.clues.map((c) => ({ id: c.id, name: c.text.slice(0, 40) })));
    return result(toolCallId, p, false, unknown("clue", p.id, all));
  }
  const secret = findRef(record.secrets, p.id);
  if (!secret) return result(toolCallId, p, false, unknown("secret", p.id, record.secrets));
  if (p.action === "reveal_secret") {
    if (secret.revealed) return result(toolCallId, p, false, `Secret "${secret.title}" is already revealed`, { id: secret.id });
    secret.revealed = true;
    return result(toolCallId, p, true, `secret "${secret.title}" revealed. Play it in the fiction`, { id: secret.id });
  }
  // place_clue
  const text = p.data && typeof p.data.text === "string" ? p.data.text.trim() : "";
  if (!text) return result(toolCallId, p, false, "place_clue needs `data.text`, the clue");
  const where = p.data && typeof p.data.where === "string" && p.data.where.trim() ? p.data.where.trim() : undefined;
  const id = makeId("clu", allIds(record));
  secret.clues.push({ id, text, ...(where ? { where } : {}), found: false });
  return result(toolCallId, p, true, `clue added to "${secret.title}" (id ${id}; ${secret.clues.length} clues)`, { id });
}

function executeBeatAction(record: CampaignRecord, p: CampaignParams, toolCallId: string): GMToolResult {
  if (record.style !== "adventure_path") {
    return result(toolCallId, p, false, 'beats belong to the adventure_path style; set it first with campaign edit, part "style", data {"style":"adventure_path"}');
  }
  const beats = (record.beats ??= { list: [] });
  if (p.action === "set_beat") {
    if (beats.suspendedId) return result(toolCallId, p, false, "A side beat is open; close_side_beat first");
    const target = findRef(beats.list, p.id);
    if (!target) return result(toolCallId, p, false, unknown("beat", p.id, beats.list.map((b) => ({ id: b.id, name: b.title }))));
    const cur = beats.list.find((b) => b.id === beats.currentId);
    if (cur && cur.id !== target.id) cur.status = "done";
    target.status = "current";
    beats.currentId = target.id;
    return result(toolCallId, p, true, `beat "${target.title}" is now current${cur && cur.id !== target.id ? `; "${cur.title}" done` : ""}`, { id: target.id });
  }
  if (p.action === "open_side_beat") {
    if (beats.suspendedId) return result(toolCallId, p, false, "A side beat is already open; close it first");
    const title = p.data && typeof p.data.title === "string" ? p.data.title.trim() : "";
    const summary = p.data && typeof p.data.summary === "string" ? p.data.summary.trim() : "";
    if (!title) return result(toolCallId, p, false, "open_side_beat needs `data.title`");
    if (!summary) return result(toolCallId, p, false, "open_side_beat needs `data.summary`");
    const cur = beats.list.find((b) => b.id === beats.currentId);
    const side: Beat = { id: makeId("bt", allIds(record)), title, summary, status: "current" };
    if (cur) {
      cur.status = "suspended";
      beats.suspendedId = cur.id;
    }
    beats.list.push(side);
    beats.currentId = side.id;
    return result(toolCallId, p, true, `side beat "${title}" is open${cur ? `; "${cur.title}" is paused` : ""}`, { id: side.id });
  }
  // close_side_beat
  if (!beats.suspendedId) return result(toolCallId, p, false, "No side beat is open");
  const side = beats.list.find((b) => b.id === beats.currentId);
  const back = beats.list.find((b) => b.id === beats.suspendedId);
  if (side) side.status = "done";
  if (back) {
    back.status = "current";
    beats.currentId = back.id;
  }
  delete beats.suspendedId;
  return result(toolCallId, p, true, `side beat closed${back ? `; back to "${back.title}"` : ""}`, { id: side?.id });
}

// ---------------------------------------------------------------------------
// entry point
// ---------------------------------------------------------------------------

export function executeCampaign(
  toolCallId: string,
  p: CampaignParams,
  story: StoryData,
  opts: CampaignWriteOptions = {},
): GMToolResult {
  switch (p.action) {
    case "read":
      return executeRead(story, p, toolCallId);
    case "add":
    case "edit":
      return executeWrite(story, p, toolCallId, opts);
    default:
      break;
  }
  const record = needRecord(story, p, toolCallId);
  if ("toolName" in record) return record;
  switch (p.action) {
    case "tick": {
      if (!p.reason || !p.reason.trim()) {
        return result(toolCallId, p, false, "tick needs `reason`, why the fiction moves this clock");
      }
      return manualTick(record, p.id, p, toolCallId, `GM: ${p.reason.trim()}`);
    }
    case "pause":
    case "resume":
    case "cancel":
      return executeClockState(p, record, toolCallId);
    case "reveal_secret":
    case "place_clue":
    case "find_clue":
      return executeSecretAction(record, p, toolCallId);
    case "advance_front":
      return executeAdvanceFront(record, p, toolCallId);
    case "set_beat":
    case "open_side_beat":
    case "close_side_beat":
      return executeBeatAction(record, p, toolCallId);
    default:
      return result(toolCallId, p, false, `Unknown campaign action "${String(p.action)}"`);
  }
}
