/**
 * The party-mode GM note: added once when a table has players, never
 * duplicated, and it tells the GM the convention the phones rely on.
 */
import { describe, expect, it } from "vitest";
import { PARTY_NOTE_TITLE, partyTableNote, withPartyNote } from "@/app/misc/party/partyNote";
import { findPlayerSheet } from "@/app/misc/party/partyHost";
import type { StoryData, StoryLore } from "@/app/misc/structs";

const existing: StoryLore = {
  title: "The town",
  content: "A town.",
  relatedCharacters: [],
  relatedLocations: [],
  secrtet: false,
  keys: [],
};

describe("party table note", () => {
  it("is GM-only guidance that is always on", () => {
    const note = partyTableNote();
    expect(note.type).toBe("dm_instructions");
    expect(note.alwaysOn).toBe(true);
    expect(note.title).toBe(PARTY_NOTE_TITLE);
  });

  it("teaches the sheet title convention the phones look for", () => {
    const { content } = partyTableNote();
    expect(content).toContain('"Character: <name>"');
    expect(content).toContain("player_name");
    expect(content).toContain("target_player_name");
    // The convention it states is the one findPlayerSheet reads.
    const story = {
      lore: [{ ...existing, title: "Character: Mara", content: "sheet", type: "character_sheet" }],
    } as unknown as StoryData;
    expect(findPlayerSheet(story, { id: "p1", name: "Mara" })?.content).toBe("sheet");
  });

  it("adds the note once and keeps everything else", () => {
    const once = withPartyNote([existing]);
    expect(once.map((n) => n.title)).toEqual(["The town", PARTY_NOTE_TITLE]);
    expect(withPartyNote(once)).toBe(once);
    expect(withPartyNote(undefined).map((n) => n.title)).toEqual([PARTY_NOTE_TITLE]);
  });

  it("leaves a note the player edited as it is", () => {
    const edited = { ...partyTableNote(), content: "my own rules" };
    expect(withPartyNote([edited])[0].content).toBe("my own rules");
  });
});
