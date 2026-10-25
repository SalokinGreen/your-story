/**
 * The Game Designer's side of the campaign record (plan slice 4): the logic
 * behind `write_campaign` and the Adventure Inspector's Campaign section.
 *
 * The Designer writes the same parts the GM's `campaign` tool does, through
 * the same executor and the same `validatePart`, run against a stand-in story
 * built from the draft (its NPCs and notes). Pure: it never mutates the record
 * it is handed, so a rejected write leaves the draft byte-identical.
 */

import type { NPC, StoryData, StoryLore } from "../structs";
import type { CampaignParams } from "../gmTools";
import { executeCampaign } from "./executor";
import { CAMPAIGN_PARTS, PART_SHAPES } from "./validate";
import type { CampaignPart } from "./validate";
import type { CampaignRecord } from "./types";

/** What the stand-in story needs from a draft. */
export interface CampaignDraftContext {
  npcs: NPC[];
  lore: StoryLore[];
  systemState?: { usesSystemTools?: boolean; setting?: string; systemId?: string };
}

export type DesignerCampaignAction = "add" | "edit" | "remove";

export interface DesignerCampaignArgs {
  action?: unknown;
  part?: unknown;
  id?: unknown;
  data?: unknown;
}

export type DesignerCampaignOutcome =
  | { ok: true; campaign: CampaignRecord; message: string }
  | { ok: false; error: string };

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** `data` may arrive as an object or as a JSON string (a Gemini-safe schema). */
function dataObject(v: unknown): Record<string, unknown> | undefined | null {
  if (v === undefined) return undefined;
  if (typeof v === "string") {
    try {
      const parsed: unknown = JSON.parse(v);
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Applies one `write_campaign` call to a copy of `record` (which may be absent). */
export function applyDesignerCampaignWrite(
  record: CampaignRecord | undefined,
  args: DesignerCampaignArgs,
  ctx: CampaignDraftContext,
): DesignerCampaignOutcome {
  const action = str(args.action);
  if (action !== "add" && action !== "edit" && action !== "remove") {
    return { ok: false, error: "write_campaign needs `action`: add, edit or remove" };
  }
  const part = str(args.part);
  if (!part || !(CAMPAIGN_PARTS as readonly string[]).includes(part)) {
    return { ok: false, error: `write_campaign needs \`part\`, one of ${CAMPAIGN_PARTS.join(", ")}` };
  }
  const id = str(args.id);

  if (action === "remove") {
    if (!record) return { ok: false, error: "There is no campaign record to remove from yet." };
    const copy = structuredClone(record);
    const removed = removeCampaignPart(copy, part as CampaignPart, id, ctx.npcs);
    return removed.ok ? { ok: true, campaign: copy, message: removed.message } : removed;
  }

  const data = dataObject(args.data);
  if (data === undefined) {
    return { ok: false, error: `${action} ${part} needs \`data\`: ${PART_SHAPES[part as CampaignPart]}` };
  }
  if (data === null) {
    return { ok: false, error: `\`data\` must be an object (or a JSON object string): ${PART_SHAPES[part as CampaignPart]}` };
  }

  // The stand-in story: the executor reads the NPCs and notes (a person must
  // be an NPC; a trigger must be one an offered tool can fire) and writes
  // `campaign`. A record starts empty; the working copy is a deep clone.
  const working = {
    campaign: record ? structuredClone(record) : undefined,
    npcs: ctx.npcs,
    threads: [],
    lore: ctx.lore,
    systemState: {
      sessionCount: 0,
      dedupKeys: [],
      ...(ctx.systemState ?? {}),
    },
  } as unknown as StoryData;
  const params: CampaignParams = {
    action,
    part,
    ...(id ? { id } : {}),
    data,
  };
  const res = executeCampaign("designer", params, working);
  const message = typeof res.result === "object" && res.result !== null && "message" in res.result
    ? String((res.result as { message: unknown }).message)
    : res.contextForStory;
  if (!res.success || !working.campaign) return { ok: false, error: message };
  return { ok: true, campaign: working.campaign, message };
}

type RemoveOutcome = { ok: true; message: string } | { ok: false; error: string };

/** Removes one part by id or name (singletons need no id), mutating `record`. */
export function removeCampaignPart(
  record: CampaignRecord,
  part: CampaignPart,
  ref: string | undefined,
  npcs: { id: string; name: string }[] = [],
): RemoveOutcome {
  if (part === "style") {
    delete record.style;
    return { ok: true, message: "style cleared" };
  }
  if (part === "pitch") {
    delete record.pitch;
    return { ok: true, message: "pitch cleared" };
  }
  if (part === "safety") {
    delete record.safety;
    return { ok: true, message: "lines and veils cleared" };
  }
  if (!ref) return { ok: false, error: `remove ${part} needs \`id\`` };
  const lower = ref.toLowerCase();

  const take = <T extends { id: string }>(
    list: T[],
    label: (x: T) => string,
  ): { hit: T | undefined; valid: string } => ({
    hit: list.find((x) => x.id === ref) ?? list.find((x) => label(x).toLowerCase() === lower),
    valid: list.map((x) => `${x.id} (${label(x)})`).join(", ") || "none yet",
  });
  const miss = (valid: string): RemoveOutcome => ({
    ok: false,
    error: `Unknown ${part} id "${ref}". Valid ids: ${valid}`,
  });

  switch (part) {
    case "faction": {
      const { hit, valid } = take(record.factions, (x) => x.name);
      if (!hit) return miss(valid);
      record.factions = record.factions.filter((x) => x !== hit);
      for (const c of record.clocks) if (c.link?.kind === "faction" && c.link.id === hit.id) delete c.link;
      return { ok: true, message: `faction "${hit.name}" removed` };
    }
    case "front": {
      const { hit, valid } = take(record.fronts, (x) => x.name);
      if (!hit) return miss(valid);
      record.fronts = record.fronts.filter((x) => x !== hit);
      for (const c of record.clocks) if (c.link?.kind === "front" && c.link.id === hit.id) delete c.link;
      return { ok: true, message: `front "${hit.name}" removed` };
    }
    case "clock": {
      const { hit, valid } = take(record.clocks, (x) => x.name);
      if (!hit) return miss(valid);
      record.clocks = record.clocks.filter((x) => x !== hit);
      for (const f of record.fronts) if (f.clockId === hit.id) delete f.clockId;
      for (const f of record.factions) if (f.clockId === hit.id) delete f.clockId;
      return { ok: true, message: `clock "${hit.name}" removed` };
    }
    case "person": {
      const hit =
        record.people.find((x) => x.npcId === ref) ??
        record.people.find((x) => npcs.find((n) => n.id === x.npcId)?.name.toLowerCase() === lower);
      if (!hit) return miss(record.people.map((x) => x.npcId).join(", ") || "none yet");
      record.people = record.people.filter((x) => x !== hit);
      return { ok: true, message: `person ${hit.npcId} removed` };
    }
    case "secret": {
      const { hit, valid } = take(record.secrets, (x) => x.title);
      if (!hit) return miss(valid);
      record.secrets = record.secrets.filter((x) => x !== hit);
      return { ok: true, message: `secret "${hit.title}" removed` };
    }
    case "location": {
      const { hit, valid } = take(record.locations, (x) => x.name);
      if (!hit) return miss(valid);
      record.locations = record.locations.filter((x) => x !== hit);
      return { ok: true, message: `location "${hit.name}" removed` };
    }
    case "beat": {
      const beats = record.beats;
      const { hit, valid } = take(beats?.list ?? [], (x) => x.title);
      if (!beats || !hit) return miss(valid);
      beats.list = beats.list.filter((x) => x !== hit);
      if (beats.currentId === hit.id) {
        const next = beats.list.find((b) => b.status === "pending");
        if (next) {
          next.status = "current";
          beats.currentId = next.id;
        } else {
          delete beats.currentId;
        }
      }
      if (beats.suspendedId === hit.id) delete beats.suspendedId;
      return { ok: true, message: `beat "${hit.title}" removed` };
    }
    case "end_state": {
      const { hit, valid } = take(record.endStates, (x) => x.text);
      if (!hit) return miss(valid);
      record.endStates = record.endStates.filter((x) => x !== hit);
      return { ok: true, message: "end state removed" };
    }
  }
  return { ok: false, error: `Unknown part "${String(part)}"` };
}

/**
 * A record back at the start of play: clocks empty and un-paused, portents
 * unreported, clues unfound, secrets unrevealed, fronts active, the first
 * beat current. What the author (or the GM's session zero) wrote stays. Used
 * by Restart when the story has no adventure template to restore from.
 */
export function resetCampaignPlayState(record: CampaignRecord): CampaignRecord {
  const copy = structuredClone(record);
  for (const c of copy.clocks) {
    c.filled = 0;
    c.crossed = [];
    c.paused = false;
    delete c.cancelled;
  }
  for (const f of copy.fronts) f.status = "active";
  for (const s of copy.secrets) {
    s.revealed = false;
    for (const clue of s.clues) clue.found = false;
  }
  if (copy.beats) {
    copy.beats.list.forEach((b, i) => {
      b.status = i === 0 ? "current" : "pending";
    });
    copy.beats.currentId = copy.beats.list[0]?.id;
    if (copy.beats.currentId === undefined) delete copy.beats.currentId;
    delete copy.beats.suspendedId;
  }
  return copy;
}
