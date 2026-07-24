/**
 * The GM stage - the "brain" that decides rolls, NPC reactions, and what the
 * world does next - never saw StoryData.player_name, player_summary, or the
 * profile tags the player picked at story start: only buildInfoMessage (the
 * choices/story stage) surfaced any of it. That's why the GM would forget who
 * the player character was after the opening scene and stop using the traits
 * the player chose. These lock in that the state message names the player
 * character and carries their profile every turn.
 */
import { describe, it, expect } from "vitest";
import { buildGMStagePrompt } from "@/app/misc/ai_staged";
import type { StoryData } from "@/app/misc/structs";

function createTestStory(overrides: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "Test Story",
    premise: "Test premise",
    player_name: "Kira Vance",
    player_summary: "A disgraced ranger hunting the thing that took her sister",
    scene: { parts: [] },
    lore: [],
    memory: [],
    npcs: [],
    ...overrides,
  } as unknown as StoryData;
}

function stateMessageOf(storyData: StoryData): string {
  const { messages } = buildGMStagePrompt({ storyData, userChoice: "Look around" });
  return messages.map((m) => m.content).join("\n\n");
}

describe("buildGMStagePrompt player character section", () => {
  it("names the player character in the game state", () => {
    const prompt = stateMessageOf(createTestStory());
    expect(prompt).toContain("PLAYER CHARACTER");
    expect(prompt).toContain("**Kira Vance** is the player character");
    expect(prompt).toContain("disgraced ranger");
  });

  it("carries the player's chosen traits and what they want from the story", () => {
    const prompt = stateMessageOf(
      createTestStory({
        playerPersonalityTags: ["Reckless", "Loyal"],
        playerWishTags: ["Mystery", "Hard choices"],
      }),
    );
    expect(prompt).toContain("Reckless, Loyal");
    expect(prompt).toContain("Mystery, Hard choices");
  });

  it("attributes tags per player in couch co-op", () => {
    const prompt = stateMessageOf(
      createTestStory({
        multiplayer: {
          enabled: true,
          couchPlayers: [
            { id: "a", name: "Ren", personalityTags: ["Brave"] },
            { id: "b", name: "Sol", wishTags: ["Romance"] },
          ],
        } as unknown as StoryData["multiplayer"],
      }),
    );
    expect(prompt).toContain("Ren, Sol");
    expect(prompt).toContain("Ren: Brave");
    expect(prompt).toContain("Sol: Romance");
  });

  it("omits the section entirely for a story with no player identity yet", () => {
    const prompt = stateMessageOf(
      createTestStory({ player_name: "", player_summary: "" }),
    );
    expect(prompt).not.toContain("## 🧍 PLAYER CHARACTER");
  });

  it("tells the GM to keep using the character sheet, not just read it once", () => {
    const prompt = stateMessageOf(
      createTestStory({
        lore: [
          {
            title: "Kira Vance",
            content: "Traits: reckless, loyal.",
            type: "character_sheet",
          },
        ] as unknown as StoryData["lore"],
      }),
    );
    expect(prompt).toContain("not opening-scene set dressing");
    expect(prompt).toContain("Traits: reckless, loyal.");
  });
});
