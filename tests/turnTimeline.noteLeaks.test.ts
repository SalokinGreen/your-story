/**
 * Judge-layer review findings 4 and 5: search_notes excerpts of hidden or
 * secret notes, and a secret note's body that itself contains a "---" and a
 * "###" line, must not reach the player's view of a tool result.
 */
import { describe, it, expect } from "vitest";
import { executeTools } from "@/app/misc/toolExecutor";
import { executeGMTools } from "@/app/misc/gmExecutor";
import { HIDDEN_NOTE_PLACEHOLDER, redactForPlayer } from "@/app/misc/turnTimeline";
import type { StoryData, StoryLore } from "@/app/misc/structs";

function lore(o: Partial<StoryLore>): StoryLore {
  return {
    title: "x",
    content: "",
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
    type: "lore",
    ...o,
  } as StoryLore;
}

function storyOf(notes: StoryLore[]): StoryData {
  return { scene: { parts: [] }, lore: notes, memory: [], npcs: [], goals: [] } as unknown as StoryData;
}

describe("search_notes in the player's view", () => {
  const story = storyOf([
    lore({ title: "The Vault", type: "secret", content: "The key is under the third stone." }),
    lore({ title: "The Duke", visibility: "hidden", content: "The stone is poisoned." }),
    lore({ title: "The Gate", content: "A rusted stone gate." }),
  ]);

  it("blanks a hidden or secret note's excerpt and keeps the title", () => {
    const { responses } = executeTools(
      [{ id: "c", type: "function", function: { name: "search_notes", arguments: { query: "stone" } } }],
      story,
    );
    const out = redactForPlayer(responses[0].message, "search_notes");
    expect(out).toContain('"The Vault"');
    expect(out).toContain('"The Duke"');
    expect(out).not.toContain("third stone");
    expect(out).not.toContain("poisoned");
    expect(out).toContain(HIDDEN_NOTE_PLACEHOLDER);
    expect(out).toContain("A rusted stone gate.");
    // The GM still gets the text.
    expect(responses[0].message).toContain("third stone");
  });
});

describe("a secret note's body in read_notes", () => {
  it("is redacted whole even when it contains its own --- and ### lines", async () => {
    const story = storyOf([
      lore({
        title: "The Vault",
        type: "secret",
        content: "Part one.\n\n---\n### Appendix\nThe key is under the third stone.",
      }),
      lore({ title: "The Gate", content: "A rusted gate." }),
    ]);
    const { results } = await executeGMTools(
      [{ id: "c", function: { name: "read_notes", arguments: JSON.stringify({ titles: ["The Vault", "The Gate"] }) } }],
      story,
    );
    const text = results[0].contextForStory;
    const out = redactForPlayer(text, "read_notes");
    expect(out).not.toContain("third stone");
    expect(out).not.toContain("Part one");
    expect(out).toContain("### The Vault (Secret)");
    expect(out).toContain("A rusted gate.");
  });
});
