/**
 * Which built-in system (if any) a story runs, and whether the GM is offered
 * the system tools (decision 79: only adventures that use them).
 */
import type { MeterSet, StoryData } from "../structs";
import { BUILTIN_SYSTEMS } from "./index";
import type { BuiltinSystem } from "./types";

export const SYSTEM_TOOL_NAMES = [
  "manage_meter",
  "manage_track",
  "end_session",
  "action_roll",
];

export interface ResolvedSystem {
  system?: BuiltinSystem;
  usesSystemTools: boolean;
  meterSets: MeterSet[];
  endOfSessionReminder?: string;
}

/**
 * The system is the first whose built-in note ids appear as `libraryNoteId`
 * on the story's lore. `systemState.usesSystemTools` overrides the derived
 * answer in either direction.
 */
export function resolveSystem(
  storyData: Pick<StoryData, "lore" | "systemState">,
  systems: BuiltinSystem[] = BUILTIN_SYSTEMS,
): ResolvedSystem {
  const ids = new Set<string>();
  for (const l of storyData.lore || []) {
    if (l.libraryNoteId) ids.add(l.libraryNoteId);
  }
  let system: BuiltinSystem | undefined;
  if (ids.size > 0) {
    system = systems.find((s) =>
      s.packs.some((p) => p.notes.some((n) => ids.has(n.id))),
    );
  }
  const explicit = storyData.systemState?.usesSystemTools;
  return {
    system,
    usesSystemTools: explicit !== undefined ? explicit : !!system,
    meterSets: system?.meterSets ?? [],
    endOfSessionReminder: system?.endOfSessionReminder,
  };
}
