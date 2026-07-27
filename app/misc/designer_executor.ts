/**
 * Executes Game Designer tool calls against an adventure draft.
 *
 * Mirrors the "LLM proposes, deterministic engine disposes" split used at play
 * time: the Designer asks for changes, this module decides what actually lands
 * in the draft. All mutation is done here on a copy, so a malformed tool call
 * can't corrupt the draft the user is editing.
 */

import {
  Adventure,
  CharacterSheetTemplate,
  CustomTable,
  Goal,
  LoreType,
  NPC,
  Preset,
  StartingChoice,
  StoryData,
  StoryLore,
} from "@/app/misc/structs";
import { createCharacterSheetTemplate } from "@/app/misc/characterSheetTemplate";

// ============================================
// DRAFT
// ============================================

/**
 * The working shape the Designer edits. Flatter than Adventure/StoryData so
 * both the tools and the inspector panel can address fields directly; it's
 * converted back into an Adventure on save.
 */
export interface AdventureDraft {
  title: string;
  shortDescription: string;
  description: string;
  tags: string[];
  difficulty: "easy" | "medium" | "hard" | "expert";
  estimatedDuration: string;
  nsfw: boolean;
  premise: string;
  intro: string;
  authorNotes: string;
  lore: StoryLore[];
  npcs: NPC[];
  goals: Goal[];
  startingChoices: StartingChoice[];
  presets: Preset[];
  characterSheetTemplate?: CharacterSheetTemplate;
  customTables: CustomTable[];
}

export function createEmptyDraft(): AdventureDraft {
  return {
    title: "",
    shortDescription: "",
    description: "",
    tags: [],
    difficulty: "medium",
    estimatedDuration: "1-2 hours",
    nsfw: false,
    premise: "",
    intro: "",
    authorNotes: "",
    lore: [],
    npcs: [],
    goals: [],
    startingChoices: [],
    presets: [],
    customTables: [],
  };
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ============================================
// TOOL CALL TYPES
// ============================================

export interface DesignerToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface DesignerToolResult {
  toolCallId: string;
  name: string;
  /** Human-readable summary shown in the chat transcript. */
  summary: string;
  /** Fed back to the model as the tool result. */
  content: string;
  error?: string;
}

// ---- argument coercion helpers -------------------------------------------

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((v): v is string => typeof v === "string");
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is Record<string, unknown> =>
      typeof v === "object" && v !== null && !Array.isArray(v),
  );
}

const VALID_LORE_TYPES: LoreType[] = [
  "lore",
  "secret",
  "mechanics",
  "character_sheet",
  "dm_instructions",
  "story_instructions",
  "gm_plan",
];

const VALID_ATTITUDES: NPC["attitude"][] = [
  "hostile",
  "unfriendly",
  "neutral",
  "friendly",
  "allied",
];

const VALID_STATUSES: NPC["status"][] = [
  "alive",
  "dead",
  "missing",
  "unknown",
  "departed",
];

const VALID_DIFFICULTIES: AdventureDraft["difficulty"][] = [
  "easy",
  "medium",
  "hard",
  "expert",
];

/** Case-insensitive title/name match, so the model doesn't have to be exact. */
function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// ============================================
// EXECUTION
// ============================================

/**
 * Applies one tool call to `draft`, returning the updated draft. `draft` is
 * never mutated in place.
 */
export function executeDesignerTool(
  call: DesignerToolCall,
  draft: AdventureDraft,
): { draft: AdventureDraft; result: DesignerToolResult } {
  const next: AdventureDraft = {
    ...draft,
    tags: [...draft.tags],
    lore: [...draft.lore],
    npcs: [...draft.npcs],
    goals: [...draft.goals],
    startingChoices: [...draft.startingChoices],
    presets: [...draft.presets],
    customTables: [...draft.customTables],
  };
  const args = call.arguments || {};

  const ok = (summary: string): { draft: AdventureDraft; result: DesignerToolResult } => ({
    draft: next,
    result: {
      toolCallId: call.id,
      name: call.name,
      summary,
      content: `OK. ${summary}`,
    },
  });

  const fail = (message: string): { draft: AdventureDraft; result: DesignerToolResult } => ({
    draft,
    result: {
      toolCallId: call.id,
      name: call.name,
      summary: message,
      content: `ERROR: ${message}`,
      error: message,
    },
  });

  switch (call.name) {
    // ---- identity -------------------------------------------------------
    case "set_adventure_info": {
      const changed: string[] = [];
      const title = asString(args.title);
      if (title !== undefined) {
        next.title = title;
        changed.push("title");
      }
      const shortDescription = asString(args.shortDescription);
      if (shortDescription !== undefined) {
        next.shortDescription = shortDescription;
        changed.push("short description");
      }
      const description = asString(args.description);
      if (description !== undefined) {
        next.description = description;
        changed.push("description");
      }
      const tags = asStringArray(args.tags);
      if (tags) {
        next.tags = tags;
        changed.push("tags");
      }
      const difficulty = asString(args.difficulty);
      if (
        difficulty &&
        VALID_DIFFICULTIES.includes(difficulty as AdventureDraft["difficulty"])
      ) {
        next.difficulty = difficulty as AdventureDraft["difficulty"];
        changed.push("difficulty");
      }
      const estimatedDuration = asString(args.estimatedDuration);
      if (estimatedDuration !== undefined) {
        next.estimatedDuration = estimatedDuration;
        changed.push("duration");
      }
      const nsfw = asBoolean(args.nsfw);
      if (nsfw !== undefined) {
        next.nsfw = nsfw;
        changed.push("content rating");
      }
      if (changed.length === 0) return fail("No recognised fields to update.");
      return ok(`Updated ${changed.join(", ")}.`);
    }

    case "set_premise": {
      const changed: string[] = [];
      const premise = asString(args.premise);
      if (premise !== undefined) {
        next.premise = premise;
        changed.push("premise");
      }
      const intro = asString(args.intro);
      if (intro !== undefined) {
        next.intro = intro;
        changed.push("opening prose");
      }
      const authorNotes = asString(args.authorNotes);
      if (authorNotes !== undefined) {
        next.authorNotes = authorNotes;
        changed.push("author notes");
      }
      if (changed.length === 0) return fail("No recognised fields to update.");
      return ok(`Updated ${changed.join(", ")}.`);
    }

    // ---- notes ----------------------------------------------------------
    case "write_note": {
      const title = asString(args.title)?.trim();
      const content = asString(args.content);
      if (!title) return fail("A note needs a title.");
      if (content === undefined) return fail(`Note "${title}" needs content.`);

      const rawType = asString(args.type);
      const type: LoreType =
        rawType && VALID_LORE_TYPES.includes(rawType as LoreType)
          ? (rawType as LoreType)
          : "lore";
      const isSecret = asBoolean(args.secret) ?? type === "secret";
      // Rules and character notes are useless to the GM unless they're always
      // in context, so those two types are pinned on even if the model asks
      // for keyword triggering. Everything else respects what it passed.
      const mustAlwaysLoad = type === "mechanics" || type === "character_sheet";
      const alwaysOn = mustAlwaysLoad || (asBoolean(args.alwaysOn) ?? false);
      const keys = asStringArray(args.keys) ?? [];

      const existingIndex = next.lore.findIndex((l) => sameName(l.title, title));
      const note: StoryLore = {
        title,
        content,
        relatedCharacters: [],
        relatedLocations: [],
        secrtet: isSecret,
        keys,
        type,
        alwaysOn,
        enabled: true,
        on: alwaysOn,
      };

      if (existingIndex >= 0) {
        next.lore[existingIndex] = { ...next.lore[existingIndex], ...note };
        return ok(`Rewrote note "${title}".`);
      }
      next.lore.push(note);
      return ok(`Added ${type === "lore" ? "note" : type} "${title}".`);
    }

    case "delete_note": {
      const titles = asStringArray(args.titles) ?? [];
      if (titles.length === 0) return fail("No titles given.");
      const before = next.lore.length;
      next.lore = next.lore.filter(
        (l) => !titles.some((t) => sameName(t, l.title)),
      );
      const removed = before - next.lore.length;
      if (removed === 0) return fail(`No notes matched: ${titles.join(", ")}.`);
      return ok(`Deleted ${removed} note${removed === 1 ? "" : "s"}.`);
    }

    // ---- NPCs -----------------------------------------------------------
    case "write_npcs": {
      const incoming = asRecordArray(args.npcs);
      if (incoming.length === 0) return fail("No NPCs given.");
      let added = 0;
      let updated = 0;
      for (const raw of incoming) {
        const name = asString(raw.name)?.trim();
        if (!name) continue;
        const attitude = asString(raw.attitude);
        const status = asString(raw.status);
        const patch = {
          name,
          description: asString(raw.description) ?? "",
          role: asString(raw.role) ?? "",
          relationship: asString(raw.relationship) ?? "",
          attitude: VALID_ATTITUDES.includes(attitude as NPC["attitude"])
            ? (attitude as NPC["attitude"])
            : ("neutral" as const),
          status: VALID_STATUSES.includes(status as NPC["status"])
            ? (status as NPC["status"])
            : ("alive" as const),
          faction: asString(raw.faction),
          symbol: asString(raw.symbol),
          notes: asString(raw.notes),
        };
        const index = next.npcs.findIndex((n) => sameName(n.name, name));
        if (index >= 0) {
          next.npcs[index] = { ...next.npcs[index], ...patch };
          updated++;
        } else {
          next.npcs.push({
            id: newId("npc"),
            createdAt: Date.now(),
            ...patch,
          });
          added++;
        }
      }
      if (added === 0 && updated === 0) return fail("No NPCs had a usable name.");
      return ok(describeWrite("NPC", added, updated));
    }

    case "delete_npcs": {
      const names = asStringArray(args.names) ?? [];
      if (names.length === 0) return fail("No names given.");
      const before = next.npcs.length;
      next.npcs = next.npcs.filter(
        (n) => !names.some((x) => sameName(x, n.name)),
      );
      const removed = before - next.npcs.length;
      if (removed === 0) return fail(`No NPCs matched: ${names.join(", ")}.`);
      return ok(`Deleted ${removed} NPC${removed === 1 ? "" : "s"}.`);
    }

    // ---- goals ----------------------------------------------------------
    case "write_goals": {
      const incoming = asRecordArray(args.goals);
      if (incoming.length === 0) return fail("No goals given.");
      let added = 0;
      let updated = 0;
      for (const raw of incoming) {
        const title = asString(raw.title)?.trim();
        if (!title) continue;
        const shortDescription = asString(raw.shortDescription) ?? "";
        const patch = {
          title,
          shortDescription,
          description: asString(raw.description) ?? shortDescription,
          active: asBoolean(raw.active) ?? true,
        };
        const index = next.goals.findIndex((g) => sameName(g.title, title));
        if (index >= 0) {
          next.goals[index] = { ...next.goals[index], ...patch };
          updated++;
        } else {
          next.goals.push({
            id: newId("goal"),
            fulfilled: false,
            createdAt: new Date(),
            ...patch,
          });
          added++;
        }
      }
      if (added === 0 && updated === 0) return fail("No goals had a usable title.");
      return ok(describeWrite("goal", added, updated));
    }

    case "delete_goals": {
      const titles = asStringArray(args.titles) ?? [];
      if (titles.length === 0) return fail("No titles given.");
      const before = next.goals.length;
      next.goals = next.goals.filter(
        (g) => !titles.some((t) => sameName(t, g.title)),
      );
      const removed = before - next.goals.length;
      if (removed === 0) return fail(`No goals matched: ${titles.join(", ")}.`);
      return ok(`Deleted ${removed} goal${removed === 1 ? "" : "s"}.`);
    }

    // ---- opening choices -------------------------------------------------
    case "set_starting_choices": {
      const incoming = asRecordArray(args.choices);
      const choices: StartingChoice[] = [];
      for (const raw of incoming) {
        const text = asString(raw.text)?.trim();
        if (!text) continue;
        const introOverride = asString(raw.introOverride)?.trim();
        choices.push({
          text,
          ...(introOverride ? { intro_override: introOverride } : {}),
        });
      }
      next.startingChoices = choices;
      return ok(
        choices.length === 0
          ? "Cleared the opening choices."
          : `Set ${choices.length} opening choice${choices.length === 1 ? "" : "s"}.`,
      );
    }

    // ---- presets --------------------------------------------------------
    case "write_presets": {
      const incoming = asRecordArray(args.presets);
      if (incoming.length === 0) return fail("No presets given.");
      let added = 0;
      let updated = 0;
      for (const raw of incoming) {
        const name = asString(raw.name)?.trim();
        if (!name) continue;
        const patch = {
          name,
          description: asString(raw.description) ?? "",
          icon: asString(raw.icon) ?? "🎭",
          characterSheet: asString(raw.characterSheet),
          intro: asString(raw.intro),
        };
        const index = next.presets.findIndex((p) => sameName(p.name, name));
        if (index >= 0) {
          next.presets[index] = { ...next.presets[index], ...patch };
          updated++;
        } else {
          next.presets.push({
            id: newId("preset"),
            // Legacy stat-block fields the GM no longer reads, kept empty so
            // old consumers still see well-formed arrays.
            stats: [],
            resources: [],
            inventory: [],
            relationships: [],
            authorNotes: "",
            ...patch,
          });
          added++;
        }
      }
      if (added === 0 && updated === 0) return fail("No presets had a usable name.");
      return ok(describeWrite("preset", added, updated));
    }

    case "delete_presets": {
      const names = asStringArray(args.names) ?? [];
      if (names.length === 0) return fail("No names given.");
      const before = next.presets.length;
      next.presets = next.presets.filter(
        (p) => !names.some((x) => sameName(x, p.name)),
      );
      const removed = before - next.presets.length;
      if (removed === 0) return fail(`No presets matched: ${names.join(", ")}.`);
      return ok(`Deleted ${removed} preset${removed === 1 ? "" : "s"}.`);
    }

    case "set_character_sheet_template": {
      const template = asString(args.template);
      if (template === undefined) return fail("No template given.");
      next.characterSheetTemplate = createCharacterSheetTemplate(template);
      const fieldCount = next.characterSheetTemplate.fields.length;
      return ok(
        `Set the character sheet template (${fieldCount} field${fieldCount === 1 ? "" : "s"}).`,
      );
    }

    // ---- tables ---------------------------------------------------------
    case "write_tables": {
      const incoming = asRecordArray(args.tables);
      if (incoming.length === 0) return fail("No tables given.");
      let added = 0;
      let updated = 0;
      for (const raw of incoming) {
        const name = asString(raw.name)?.trim();
        if (!name) continue;
        const entries = asRecordArray(raw.entries)
          .map((e) => ({
            text: asString(e.text) ?? "",
            weight: typeof e.weight === "number" && e.weight > 0 ? e.weight : 1,
          }))
          .filter((e) => e.text.trim().length > 0);
        if (entries.length === 0) continue;
        const patch = {
          name,
          description: asString(raw.description) ?? "",
          entries,
        };
        const index = next.customTables.findIndex((t) => sameName(t.name, name));
        if (index >= 0) {
          next.customTables[index] = { ...next.customTables[index], ...patch };
          updated++;
        } else {
          next.customTables.push({ id: newId("table"), ...patch });
          added++;
        }
      }
      if (added === 0 && updated === 0)
        return fail("No tables had a usable name and at least one entry.");
      return ok(describeWrite("table", added, updated));
    }

    case "delete_tables": {
      const names = asStringArray(args.names) ?? [];
      if (names.length === 0) return fail("No names given.");
      const before = next.customTables.length;
      next.customTables = next.customTables.filter(
        (t) => !names.some((x) => sameName(x, t.name)),
      );
      const removed = before - next.customTables.length;
      if (removed === 0) return fail(`No tables matched: ${names.join(", ")}.`);
      return ok(`Deleted ${removed} table${removed === 1 ? "" : "s"}.`);
    }

    default:
      return fail(`Unknown tool "${call.name}".`);
  }
}

function describeWrite(noun: string, added: number, updated: number): string {
  const parts: string[] = [];
  if (added > 0) parts.push(`Added ${added} ${noun}${added === 1 ? "" : "s"}`);
  if (updated > 0)
    parts.push(`updated ${updated} ${noun}${updated === 1 ? "" : "s"}`);
  return `${parts.join(", ")}.`;
}

/** Runs a batch of tool calls in order, threading the draft through each. */
export function executeDesignerTools(
  calls: DesignerToolCall[],
  draft: AdventureDraft,
): { draft: AdventureDraft; results: DesignerToolResult[] } {
  let current = draft;
  const results: DesignerToolResult[] = [];
  for (const call of calls) {
    const { draft: updated, result } = executeDesignerTool(call, current);
    current = updated;
    results.push(result);
  }
  return { draft: current, results };
}

// ============================================
// CONVERSION
// ============================================

/** Builds the Adventure record that gets persisted and played. */
export function draftToAdventure(draft: AdventureDraft): Partial<Adventure> {
  const storyTemplate: Partial<StoryData> = {
    story_name: draft.title,
    premise: draft.premise,
    intro: draft.intro,
    author_notes: draft.authorNotes,
    memory: [],
    currentChapter: 0,
    chapters: [],
    scene: { parts: [] },
    lore: draft.lore,
    npcs: draft.npcs.length > 0 ? draft.npcs : undefined,
    goals: draft.goals,
    customTables: draft.customTables,
    presets: draft.presets,
  };

  return {
    title: draft.title,
    shortDescription: draft.shortDescription,
    description: draft.description,
    tags: draft.tags,
    difficulty: draft.difficulty,
    estimatedDuration: draft.estimatedDuration,
    nsfw: draft.nsfw,
    isPublished: false,
    isFeatured: false,
    storyTemplate,
    presets: draft.presets,
    characterSheetTemplate: draft.characterSheetTemplate,
    startingChoices:
      draft.startingChoices.length > 0 ? draft.startingChoices : undefined,
  };
}

/** Rebuilds a draft from a saved adventure so it can be edited again. */
export function adventureToDraft(adventure: Partial<Adventure>): AdventureDraft {
  const story = adventure.storyTemplate ?? {};
  const empty = createEmptyDraft();
  return {
    title: adventure.title ?? story.story_name ?? "",
    shortDescription: adventure.shortDescription ?? "",
    description: adventure.description ?? "",
    tags: adventure.tags ?? [],
    difficulty: adventure.difficulty ?? empty.difficulty,
    estimatedDuration: adventure.estimatedDuration ?? empty.estimatedDuration,
    nsfw: adventure.nsfw ?? false,
    premise: story.premise ?? "",
    intro: story.intro ?? "",
    authorNotes: story.author_notes ?? "",
    lore: story.lore ?? [],
    npcs: story.npcs ?? [],
    goals: story.goals ?? [],
    startingChoices: adventure.startingChoices ?? [],
    presets: adventure.presets ?? story.presets ?? [],
    characterSheetTemplate: adventure.characterSheetTemplate,
    customTables: story.customTables ?? [],
  };
}

// ============================================
// SUMMARY (for the Designer's context)
// ============================================

/**
 * Compact snapshot of the draft injected into the system prompt so the
 * Designer always knows what already exists without replaying the transcript.
 */
export function summarizeDraft(draft: AdventureDraft): string {
  const lines: string[] = [];

  lines.push(`Title: ${draft.title || "(untitled)"}`);
  if (draft.shortDescription) lines.push(`Hook: ${draft.shortDescription}`);
  lines.push(`Tags: ${draft.tags.length ? draft.tags.join(", ") : "(none)"}`);
  lines.push(`Difficulty: ${draft.difficulty}`);
  lines.push(`Premise: ${draft.premise || "(not written yet)"}`);
  lines.push(`Opening prose: ${draft.intro ? "written" : "NOT WRITTEN YET"}`);

  const mechanics = draft.lore.filter((l) => l.type === "mechanics");
  const sheets = draft.lore.filter((l) => l.type === "character_sheet");
  lines.push(
    `Mechanics note: ${mechanics.length ? mechanics.map((m) => `"${m.title}"`).join(", ") : "MISSING - the adventure is unplayable without one"}`,
  );
  lines.push(
    `Character sheet note: ${sheets.length ? sheets.map((s) => `"${s.title}"`).join(", ") : "MISSING"}`,
  );

  const otherNotes = draft.lore.filter(
    (l) => l.type !== "mechanics" && l.type !== "character_sheet",
  );
  lines.push(
    `Notes (${otherNotes.length}): ${
      otherNotes.length
        ? otherNotes.map((l) => `"${l.title}" [${l.type ?? "lore"}]`).join(", ")
        : "(none)"
    }`,
  );
  lines.push(
    `NPCs (${draft.npcs.length}): ${
      draft.npcs.length
        ? draft.npcs.map((n) => `"${n.name}" (${n.role})`).join(", ")
        : "(none)"
    }`,
  );
  lines.push(
    `Goals (${draft.goals.length}): ${
      draft.goals.length ? draft.goals.map((g) => `"${g.title}"`).join(", ") : "(none)"
    }`,
  );
  lines.push(
    `Presets (${draft.presets.length}): ${
      draft.presets.length
        ? draft.presets.map((p) => `"${p.name}"`).join(", ")
        : "(none)"
    }`,
  );
  lines.push(
    `Random tables (${draft.customTables.length}): ${
      draft.customTables.length
        ? draft.customTables.map((t) => `"${t.name}"`).join(", ")
        : "(none)"
    }`,
  );
  lines.push(
    `Opening choices (${draft.startingChoices.length}): ${
      draft.startingChoices.length
        ? draft.startingChoices.map((c) => `"${c.text}"`).join(" | ")
        : "(none - player sees a plain Start button)"
    }`,
  );
  lines.push(
    `Character sheet template: ${
      draft.characterSheetTemplate?.template ? "set" : "not set"
    }`,
  );

  return lines.join("\n");
}

/** Fields that must exist before an adventure is worth playing. */
export function draftReadiness(draft: AdventureDraft): {
  ready: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  if (!draft.title.trim()) missing.push("a title");
  if (!draft.premise.trim()) missing.push("a premise");
  if (!draft.intro.trim()) missing.push("opening prose");
  if (!draft.lore.some((l) => l.type === "mechanics"))
    missing.push("a mechanics note");
  if (!draft.lore.some((l) => l.type === "character_sheet"))
    missing.push("a character sheet");
  return { ready: missing.length === 0, missing };
}
