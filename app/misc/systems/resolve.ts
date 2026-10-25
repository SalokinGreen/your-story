/**
 * Which built-in system (if any) a story runs, and whether the GM is offered
 * the system tools (decision 79: only adventures that use them).
 */
import type { MeterSet, StoryData } from "../structs";
import { BUILTIN_SYSTEMS } from "./index";
import { LEGACY_SYSTEM_TOOLS, type BuiltinSystem } from "./types";

/**
 * Blood & Bone's four tools, the legacy tools-on set. A system's own list is
 * `system.tools`; `allSystemToolNames` is the union over a registry.
 */
export const SYSTEM_TOOL_NAMES: string[] = [...LEGACY_SYSTEM_TOOLS];

/** Every tool any of the systems offers, once each, in first-seen order. */
export function allSystemToolNames(
  systems: BuiltinSystem[] = BUILTIN_SYSTEMS,
): string[] {
  const out: string[] = [];
  for (const s of systems) {
    for (const t of s.tools ?? LEGACY_SYSTEM_TOOLS) if (!out.includes(t)) out.push(t);
  }
  return out;
}

export interface ResolvedSystem {
  system?: BuiltinSystem;
  usesSystemTools: boolean;
  meterSets: MeterSet[];
  endOfSessionReminder?: string;
  /** The GM tools this story is offered: story-level fields only (the cache rule). */
  tools: string[];
}

/** The first system whose built-in note ids appear as `libraryNoteId` on the lore. */
function systemFromNotes(
  storyData: Pick<StoryData, "lore">,
  systems: BuiltinSystem[],
): BuiltinSystem | undefined {
  const ids = new Set<string>();
  for (const l of storyData.lore || []) {
    if (l.libraryNoteId) ids.add(l.libraryNoteId);
  }
  if (ids.size === 0) return undefined;
  return systems.find((s) =>
    s.packs.some((p) => p.notes.some((n) => ids.has(n.id))),
  );
}

/**
 * The system is the one `systemState.systemId` records, else the first whose
 * built-in note ids appear as `libraryNoteId` on the story's lore.
 * `systemState.usesSystemTools` overrides the derived answer in either
 * direction. The tools are the system's own; tools forced on with no system
 * keep Blood & Bone's four (the Designer's legacy switch).
 */
export function resolveSystem(
  storyData: Pick<StoryData, "lore" | "systemState">,
  systems: BuiltinSystem[] = BUILTIN_SYSTEMS,
): ResolvedSystem {
  const recorded = storyData.systemState?.systemId;
  const system =
    (recorded ? systems.find((s) => s.id === recorded) : undefined) ??
    systemFromNotes(storyData, systems);
  const explicit = storyData.systemState?.usesSystemTools;
  const usesSystemTools = explicit !== undefined ? explicit : !!system;
  return {
    system,
    usesSystemTools,
    meterSets: system?.meterSets ?? [],
    endOfSessionReminder: system?.endOfSessionReminder,
    tools: usesSystemTools
      ? [...(system ? (system.tools ?? LEGACY_SYSTEM_TOOLS) : LEGACY_SYSTEM_TOOLS)]
      : [],
  };
}

/**
 * Records `systemState.systemId` from the notes the story holds, once, when
 * it is unset and a system resolves. Returns true when it wrote. Mutates in
 * place, like ensureStoryDataArrays.
 */
export function recordSystemId(
  story: Pick<StoryData, "lore" | "systemState">,
  systems: BuiltinSystem[] = BUILTIN_SYSTEMS,
): boolean {
  if (story.systemState?.systemId) return false;
  const system = systemFromNotes(story, systems);
  if (!system) return false;
  story.systemState = {
    sessionCount: 0,
    dedupKeys: [],
    ...story.systemState,
    systemId: system.id,
  };
  return true;
}
