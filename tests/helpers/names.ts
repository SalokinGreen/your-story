/**
 * Test helpers for the name check (randomness plan R2). A test that adds an NPC
 * with a name it made up does it through `withRolledNames`, which puts the
 * names on the story's ledger the way `generate_name` would; the check itself
 * is never weakened.
 */
import { pushOffered } from "@/app/misc/names/accept";
import type { StoryData } from "@/app/misc/structs";

/** The story with these names on its ledger (a copy; the original is untouched). */
export function withRolledNames<T extends StoryData>(story: T, names: string[]): T {
  const copy = structuredClone(story);
  pushOffered(copy, names);
  return copy;
}
