// Which notes the player must not read the text of. One rule for the places
// that wrap a note's text in [[HIDDEN_LORE]] markers (read_notes, search_notes)
// so the player's view of a tool result (turnTimeline.ts redactForPlayer) can
// blank it. A secret note is hidden whatever its visibility says.

import type { StoryLore } from "./structs";

export function isHiddenFromPlayerNote(
  note: { type?: string; visibility?: StoryLore["visibility"] } | undefined,
): boolean {
  if (!note) return false;
  return (
    note.type === "secret" ||
    note.visibility === "hidden" ||
    note.visibility === "to_be_revealed" ||
    note.visibility === "check_per_turn"
  );
}
