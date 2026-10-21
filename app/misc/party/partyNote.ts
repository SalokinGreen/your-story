// A GM-only note that tells the GM it is running a party-mode table. The
// co-op setup note (localStoryManager's "Players & Preferences") only exists
// for stories that started with several players, so a story that gains players
// from phones needs the same convention: one "Character: <name>" sheet per
// player, which is how a phone finds its player's sheet (partyHost.ts,
// findPlayerSheet), plus how rolls and questions reach a phone.

import type { StoryLore } from "../structs";

export const PARTY_NOTE_TITLE = "Party Table";

export const PARTY_NOTE_CONTENT =
  "This table is playing in party mode: every player is on their own phone and the desktop shows the story. " +
  'Each person plays their OWN character. When someone joins, create a separate `character_sheet` note for them titled "Character: <name>" ' +
  "(their name exactly as it appears in the player list), so it shows on their phone. " +
  'Player turns arrive as "> Name: action" lines, and several players can speak in one turn. ' +
  "Rotate the spotlight so nobody is left out. " +
  "When you ask a player for a roll or put a question to them, name them (player_name for ask_for_roll, target_player_name for ask_question): " +
  "the prompt then appears on that player's phone.";

export function partyTableNote(): StoryLore {
  return {
    title: PARTY_NOTE_TITLE,
    content: PARTY_NOTE_CONTENT,
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
    type: "dm_instructions",
    alwaysOn: true,
  };
}

// The notes with the party note added, once. A story that already has a note
// by that title (the player kept or edited it) is left as it is.
export function withPartyNote(lore: StoryLore[] | undefined): StoryLore[] {
  const notes = lore ?? [];
  if (notes.some((n) => n.title === PARTY_NOTE_TITLE)) return notes;
  return [...notes, partyTableNote()];
}
