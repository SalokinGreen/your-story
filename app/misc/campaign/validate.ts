/**
 * Validation for every part of the campaign record, shared by the `campaign`
 * GM tool now and the Designer's `write_campaign` later (plan slice 4). A
 * rejection names the exact repair ("faction needs `goal`"), so the model can
 * fix the call on its next round.
 */

import { CAMPAIGN_STYLES, CLOCK_TRIGGERS } from "./types";
import type {
  CampaignRecord,
  CampaignStyle,
  ClockLinkKind,
  ClockTrigger,
  FrontStatus,
} from "./types";

export type CampaignPart =
  | "style"
  | "pitch"
  | "safety"
  | "faction"
  | "front"
  | "clock"
  | "person"
  | "secret"
  | "location"
  | "beat"
  | "end_state";

export const CAMPAIGN_PARTS: readonly CampaignPart[] = [
  "style",
  "pitch",
  "safety",
  "faction",
  "front",
  "clock",
  "person",
  "secret",
  "location",
  "beat",
  "end_state",
];

/** Parts that exist once per record; `add` and `edit` both set them. */
export const SINGLETON_PARTS: readonly CampaignPart[] = ["style", "pitch", "safety"];

export type PartResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface ValidationContext {
  /** True when the part is being created (a clock then needs 4, 6 or 8 segments). */
  isNew: boolean;
  record: CampaignRecord;
  npcs: { id: string; name: string }[];
  threads: { id: string; title: string }[];
  /** True when the record's style allows beats. */
  beatsAllowed: boolean;
  /**
   * The triggers some offered tool can fire in this story. Unset means every
   * trigger is accepted (callers with no story to ask).
   */
  fireableTriggers?: readonly string[];
}

// What each part is once validated: no id (the executor makes it) and no
// state the engine owns (a secret's revealed flag, a clue's found flag).
export interface PitchValue { premise: string; tone: string[] }
export interface SafetyValue {
  lines: { id?: string; text: string; keywords: string[] }[];
  veils: { id?: string; text: string; keywords: string[] }[];
}
export interface FactionValue { name: string; goal: string; methods?: string; clockId?: string }
export interface FrontValue {
  name: string;
  dangers: { name: string; impulse: string }[];
  portents: { at: number; text: string }[];
  doom: string;
  stakes: string[];
  clockId?: string;
  status?: FrontStatus;
}
export interface ClockValue {
  name: string;
  segments: number;
  filled?: number;
  triggers: ClockTrigger[];
  link?: { kind: ClockLinkKind; id: string };
  onFill?: string;
  visible?: boolean;
}
export interface PersonValue { npcId: string; want?: string; secret?: string; voice?: string }
export interface SecretValue {
  title: string;
  truth: string;
  keyPhrases: string[];
  clues: { text: string; where?: string }[];
}
export interface LocationValue { name: string; features: string[]; noteId?: string; npcIds: string[] }
export interface BeatValue { title: string; summary: string }
export interface EndStateValue { text: string }

export type PartValue =
  | { style: CampaignStyle }
  | PitchValue
  | SafetyValue
  | FactionValue
  | FrontValue
  | ClockValue
  | PersonValue
  | SecretValue
  | LocationValue
  | BeatValue
  | EndStateValue;

/**
 * The data shape of each part, in a line. The `campaign` tool's schema carries
 * none of this (it is in every request, and the tool list is budgeted); the
 * GM learns a shape from `read` on an empty part, or from the repair a refused
 * write names.
 */
export const PART_SHAPES: Record<CampaignPart, string> = {
  style: '{"style": "sandbox|adventure_path|mystery|horror|episodic|slice_of_life|solo"}',
  pitch: '{"premise": "...", "tone": ["2-4 words"]}',
  safety: '{"lines": [{"text": "...", "keywords": ["..."]}], "veils": [...]} (an empty list means none)',
  faction: '{"name", "goal", "methods"?, "clockId"?}',
  front:
    '{"name", "doom", "dangers": [{"name", "impulse"}] (max 3), "portents": ["in order"], "stakes": ["question"] (max 3), "clockId"?}',
  clock:
    '{"name", "segments": 4|6|8, "triggers": ["miss"|"scene"|"rest"|"session"|"manual"], "link"?: {"kind": "front"|"faction"|"thread", "id"}, "onFill"?, "visible"?}',
  person: '{"npcId", "want"?, "secret"?, "voice"?} (the NPC must exist: add_npc first)',
  secret: '{"title", "truth", "keyPhrases"?: [..], "clues": [{"text", "where"?}]} (three clues is the rule)',
  location: '{"name", "features": [3 evocative], "noteId"?, "npcIds"?: [..]}',
  beat: '{"title", "summary"} (adventure_path style only)',
  end_state: '{"text"}',
};

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function text(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Undefined when absent, null when present but not a list of strings. */
function strings(v: unknown): string[] | undefined | null {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const item of v) {
    const s = text(item);
    if (s === undefined) return null;
    out.push(s);
  }
  return out;
}

export function listIds(items: { id: string; name?: string; title?: string }[]): string {
  if (items.length === 0) return "none yet";
  return items
    .map((i) => `${i.id} (${i.name ?? i.title ?? ""})`.replace(" ()", ""))
    .join(", ");
}

function safetyItems(
  v: unknown,
  label: string,
): PartResult<{ id?: string; text: string; keywords: string[] }[]> {
  if (v === undefined) return { ok: true, value: [] };
  if (!Array.isArray(v)) return fail(`safety \`${label}\` must be a list of {text, keywords?} (or plain strings)`);
  const out: { id?: string; text: string; keywords: string[] }[] = [];
  for (const raw of v) {
    if (typeof raw === "string") {
      const t = text(raw);
      if (!t) return fail(`safety \`${label}\` has an empty entry; give each a \`text\``);
      out.push({ text: t, keywords: [] });
      continue;
    }
    if (!isObj(raw)) return fail(`safety \`${label}\` entries must be {text, keywords?} or a string`);
    const t = text(raw.text);
    if (!t) return fail(`a safety ${label.replace(/s$/, "")} needs \`text\``);
    const kw = strings(raw.keywords);
    if (kw === null) return fail(`safety \`keywords\` must be a list of strings`);
    const item: { id?: string; text: string; keywords: string[] } = { text: t, keywords: kw ?? [] };
    const id = text(raw.id);
    if (id) item.id = id;
    out.push(item);
  }
  return { ok: true, value: out };
}

/**
 * Authoring warnings for the Game Designer (plan slice 4). They never block:
 * the GM can build what is missing in session zero. A mystery secret wants
 * three clues (the rule in `PART_SHAPES`), a front wants a clock that moves
 * it, and a record wants a style, since the style decides which parts the GM
 * expects.
 */
export function campaignWarnings(record: CampaignRecord): string[] {
  const out: string[] = [];
  if (!record.style) {
    out.push('No style set: the style decides which parts the GM expects (set it with part "style").');
  }
  if (record.style === "mystery") {
    for (const s of record.secrets) {
      if (s.clues.length < 3) {
        out.push(
          `Secret "${s.title}" has ${s.clues.length} clue${s.clues.length === 1 ? "" : "s"}; a mystery wants at least three, found in different places.`,
        );
      }
    }
  }
  for (const f of record.fronts) {
    if (!f.clockId || !record.clocks.some((c) => c.id === f.clockId)) {
      out.push(`Front "${f.name}" has no clock: add one (a clock part linked to the front) so it advances on its own.`);
    }
  }
  return out;
}

/**
 * Validates `data` for one part and returns it normalised. `data` is the whole
 * part for a new one; for an edit the executor merges the changes over the
 * existing part first, so the same rules judge both.
 */
export function validatePart(
  part: CampaignPart,
  data: unknown,
  ctx: ValidationContext,
): PartResult<PartValue> {
  if (!isObj(data)) return fail(`${part} needs \`data\`, an object`);

  switch (part) {
    case "style": {
      const s = text(data.style);
      if (!s || !(CAMPAIGN_STYLES as readonly string[]).includes(s)) {
        return fail(`style needs \`style\`, one of ${CAMPAIGN_STYLES.join(", ")}`);
      }
      return { ok: true, value: { style: s as CampaignStyle } };
    }

    case "pitch": {
      const premise = text(data.premise);
      if (!premise) return fail("pitch needs `premise`, a sentence or two");
      const tone = strings(data.tone);
      if (tone === undefined || tone === null || tone.length === 0) {
        return fail("pitch needs `tone`, a list of 2-4 tone words");
      }
      if (tone.length > 4) return fail("pitch `tone` holds at most 4 words");
      return { ok: true, value: { premise, tone } };
    }

    case "safety": {
      const lines = safetyItems(data.lines, "lines");
      if (!lines.ok) return lines;
      const veils = safetyItems(data.veils, "veils");
      if (!veils.ok) return veils;
      if (data.lines === undefined && data.veils === undefined) {
        return fail("safety needs `lines` and/or `veils`, each a list of {text, keywords?} (an empty list means none)");
      }
      return { ok: true, value: { lines: lines.value, veils: veils.value } };
    }

    case "faction": {
      const name = text(data.name);
      if (!name) return fail("faction needs `name`");
      const goal = text(data.goal);
      if (!goal) return fail("faction needs `goal`");
      const value: FactionValue = { name, goal };
      const methods = text(data.methods);
      if (methods) value.methods = methods;
      const clockId = text(data.clockId);
      if (clockId) {
        if (!ctx.record.clocks.some((c) => c.id === clockId)) {
          return fail(`faction \`clockId\` "${clockId}" is not a clock. Valid ids: ${listIds(ctx.record.clocks)}`);
        }
        value.clockId = clockId;
      }
      return { ok: true, value };
    }

    case "front": {
      const name = text(data.name);
      if (!name) return fail("front needs `name`");
      const doom = text(data.doom);
      if (!doom) return fail("front needs `doom`, the impending disaster in a sentence");
      const dangersRaw = data.dangers ?? [];
      if (!Array.isArray(dangersRaw)) return fail("front `dangers` must be a list of {name, impulse}");
      if (dangersRaw.length > 3) return fail("front `dangers` holds at most 3");
      const dangers: { name: string; impulse: string }[] = [];
      for (const d of dangersRaw) {
        if (!isObj(d)) return fail("front `dangers` entries must be {name, impulse}");
        const dn = text(d.name);
        if (!dn) return fail("each front danger needs `name`");
        const impulse = text(d.impulse);
        if (!impulse) return fail(`front danger "${dn}" needs \`impulse\`, what it wants to do`);
        dangers.push({ name: dn, impulse });
      }
      const portentsRaw = data.portents ?? [];
      if (!Array.isArray(portentsRaw)) return fail("front `portents` must be a list of {text, at?} (or strings), in order");
      const portents: { at: number; text: string }[] = [];
      for (const p of portentsRaw) {
        if (typeof p === "string") {
          const t = text(p);
          if (!t) return fail("a front portent is empty; give it `text`");
          portents.push({ at: 0, text: t });
          continue;
        }
        if (!isObj(p)) return fail("front `portents` entries must be {text, at?} or a string");
        const t = text(p.text);
        if (!t) return fail("each front portent needs `text`");
        let at = 0;
        if (p.at !== undefined) {
          if (typeof p.at !== "number" || !Number.isInteger(p.at) || p.at < 0) {
            return fail(`front portent "${t}": \`at\` must be a whole number of segments, 1 or more (or leave it out to spread them evenly)`);
          }
          at = p.at;
        }
        portents.push({ at, text: t });
      }
      const stakes = strings(data.stakes ?? []);
      if (stakes === null) return fail("front `stakes` must be a list of questions (strings)");
      if ((stakes ?? []).length > 3) return fail("front `stakes` holds at most 3 questions");
      const value: FrontValue = { name, dangers, portents, doom, stakes: stakes ?? [] };
      const clockId = text(data.clockId);
      if (clockId) {
        if (!ctx.record.clocks.some((c) => c.id === clockId)) {
          return fail(`front \`clockId\` "${clockId}" is not a clock. Valid ids: ${listIds(ctx.record.clocks)}`);
        }
        value.clockId = clockId;
      }
      if (data.status !== undefined) {
        if (data.status !== "active" && data.status !== "resolved" && data.status !== "doomed") {
          return fail("front `status` must be active, resolved or doomed");
        }
        value.status = data.status;
      }
      return { ok: true, value };
    }

    case "clock": {
      const name = text(data.name);
      if (!name) return fail("clock needs `name`");
      const seg = data.segments;
      if (typeof seg !== "number" || !Number.isInteger(seg)) {
        return fail(ctx.isNew ? "clock `segments` must be 4, 6 or 8 for a new clock" : "clock `segments` must be a whole number, 1 or more");
      }
      if (ctx.isNew ? ![4, 6, 8].includes(seg) : seg < 1 || seg > 100) {
        return fail(ctx.isNew ? "clock `segments` must be 4, 6 or 8 for a new clock" : "clock `segments` must be a whole number from 1 to 100");
      }
      let triggers: ClockTrigger[] = ["manual"];
      if (data.triggers !== undefined) {
        const list = strings(data.triggers);
        if (list === null || list === undefined || list.length === 0) {
          return fail(`clock \`triggers\` must be a non-empty list from ${CLOCK_TRIGGERS.join(", ")}`);
        }
        for (const t of list) {
          if (!(CLOCK_TRIGGERS as readonly string[]).includes(t)) {
            return fail(`clock trigger "${t}" is not one of ${CLOCK_TRIGGERS.join(", ")}`);
          }
          if (ctx.fireableTriggers && !ctx.fireableTriggers.includes(t)) {
            return fail(
              `clock trigger "${t}" can never fire in this story: no tool it is offered fires it. Triggers that can: ${ctx.fireableTriggers.join(", ")}`,
            );
          }
        }
        triggers = [...new Set(list)] as ClockTrigger[];
      }
      const value: ClockValue = { name, segments: seg, triggers };
      if (data.filled !== undefined) {
        if (typeof data.filled !== "number" || !Number.isInteger(data.filled) || data.filled < 0 || data.filled > seg) {
          return fail(`clock \`filled\` must be a whole number from 0 to ${seg}`);
        }
        value.filled = data.filled;
      }
      if (data.link !== undefined) {
        if (!isObj(data.link)) return fail("clock `link` must be {kind: front|faction|thread, id}");
        const kind = data.link.kind;
        const id = text(data.link.id);
        if ((kind !== "front" && kind !== "faction" && kind !== "thread") || !id) {
          return fail("clock `link` must be {kind: front|faction|thread, id}");
        }
        const pool: { id: string; name?: string; title?: string }[] =
          kind === "front" ? ctx.record.fronts : kind === "faction" ? ctx.record.factions : ctx.threads;
        if (!pool.some((p) => p.id === id)) {
          return fail(`clock link: unknown ${kind} id "${id}". Valid ids: ${listIds(pool)}`);
        }
        value.link = { kind, id };
      }
      const onFill = text(data.onFill);
      if (onFill) value.onFill = onFill;
      if (data.visible !== undefined) {
        if (typeof data.visible !== "boolean") return fail("clock `visible` must be true or false");
        value.visible = data.visible;
      }
      return { ok: true, value };
    }

    case "person": {
      let npcId = text(data.npcId);
      if (!npcId) {
        const byName = text(data.npc);
        if (byName) npcId = ctx.npcs.find((n) => n.name.toLowerCase() === byName.toLowerCase())?.id;
      }
      if (!npcId || !ctx.npcs.some((n) => n.id === npcId)) {
        return fail(`person needs \`npcId\`, an NPC id (add the NPC first with add_npc). Valid ids: ${listIds(ctx.npcs)}`);
      }
      const value: PersonValue = { npcId };
      for (const k of ["want", "secret", "voice"] as const) {
        const v = text(data[k]);
        if (v) value[k] = v;
      }
      if (!value.want && !value.secret && !value.voice) {
        return fail("person needs at least one of `want`, `secret`, `voice`");
      }
      return { ok: true, value };
    }

    case "secret": {
      const title = text(data.title);
      if (!title) return fail("secret needs `title`");
      const truth = text(data.truth);
      if (!truth) return fail("secret needs `truth`, what is really going on");
      const kp = strings(data.keyPhrases ?? []);
      if (kp === null) return fail("secret `keyPhrases` must be a list of strings");
      const cluesRaw = data.clues ?? [];
      if (!Array.isArray(cluesRaw)) return fail("secret `clues` must be a list of {text, where?}");
      const clues: { text: string; where?: string }[] = [];
      for (const c of cluesRaw) {
        const ct = typeof c === "string" ? text(c) : isObj(c) ? text(c.text) : undefined;
        if (!ct) return fail("each clue needs `text`");
        const where = isObj(c) ? text(c.where) : undefined;
        clues.push(where ? { text: ct, where } : { text: ct });
      }
      return { ok: true, value: { title, truth, keyPhrases: kp ?? [], clues } };
    }

    case "location": {
      const name = text(data.name);
      if (!name) return fail("location needs `name`");
      const features = strings(data.features ?? []);
      if (features === null) return fail("location `features` must be a list of strings");
      if ((features ?? []).length > 5) return fail("location `features` holds at most 5 (three evocative ones is the aim)");
      const npcIds = strings(data.npcIds ?? []);
      if (npcIds === null) return fail("location `npcIds` must be a list of NPC ids");
      const value: LocationValue = { name, features: features ?? [], npcIds: npcIds ?? [] };
      const noteId = text(data.noteId);
      if (noteId) value.noteId = noteId;
      return { ok: true, value };
    }

    case "beat": {
      if (!ctx.beatsAllowed) {
        return fail('beats belong to the adventure_path style; set it first with campaign edit, part "style", data {"style":"adventure_path"}');
      }
      const title = text(data.title);
      if (!title) return fail("beat needs `title`");
      const summary = text(data.summary);
      if (!summary) return fail("beat needs `summary`, what happens in it");
      return { ok: true, value: { title, summary } };
    }

    case "end_state": {
      const t = text(data.text);
      if (!t) return fail("end_state needs `text`, one possible conclusion");
      return { ok: true, value: { text: t } };
    }
  }
}
