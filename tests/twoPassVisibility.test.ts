/**
 * Tests for the Two-Pass Visibility state machine (see §2.3 in
 * docs/research-paper-ttrpg-theory-gap-analysis.md): read_notes wraps
 * hidden/to_be_revealed/check_per_turn lore in [[HIDDEN_LORE:...]]
 * markers, stripHiddenLoreContent removes them before the Narrator stage
 * ever sees them, and resolveCheckPerTurnVisibility passively reveals
 * check_per_turn entries over time.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { executeGMTools, resolveCheckPerTurnVisibility } from "@/app/misc/gmExecutor";
import { stripHiddenLoreContent } from "@/app/misc/ai_staged";
import { StoryData, StoryLore } from "@/app/misc/structs";

function createMockStoryData(overrides: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "Test Story",
    player_name: "Hero",
    premise: "A test adventure",
    scene: { parts: [] },
    stats: [],
    resources: [],
    inventory: [],
    abilities: [],
    achievements: [],
    lore: [],
    memory: [],
    ...overrides,
  } as StoryData;
}

function createLore(overrides: Partial<StoryLore>): StoryLore {
  return {
    title: "Untitled",
    content: "",
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
    ...overrides,
  };
}

function createToolCall(
  name: string,
  args: Record<string, unknown>
): { id: string; function: { name: string; arguments: string } } {
  return {
    id: `test_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    function: { name, arguments: JSON.stringify(args) },
  };
}

describe("read_notes hidden-content wrapping", () => {
  it("wraps hidden lore content in HIDDEN_LORE markers with a do-not-narrate instruction", async () => {
    const storyData = createMockStoryData({
      lore: [
        createLore({
          title: "The Trap",
          content: "A pressure plate triggers a dart trap.",
          visibility: "hidden",
        }),
      ],
    });

    const result = await executeGMTools(
      [createToolCall("read_notes", { titles: ["The Trap"] })],
      storyData
    );
    const contextForStory = result.results[0].contextForStory;

    expect(contextForStory).toContain("[[HIDDEN_LORE:The Trap]]");
    expect(contextForStory).toContain("[[/HIDDEN_LORE]]");
    expect(contextForStory).toContain("HIDDEN FROM PLAYER");
    expect(contextForStory).toContain("A pressure plate triggers a dart trap.");
  });

  it("does not wrap always_reveal (or unset) lore content", async () => {
    const storyData = createMockStoryData({
      lore: [
        createLore({
          title: "The Village",
          content: "A small farming village.",
          visibility: "always_reveal",
        }),
        createLore({
          title: "Unset Visibility",
          content: "No visibility field set at all.",
        }),
      ],
    });

    const result = await executeGMTools(
      [
        createToolCall("read_notes", {
          titles: ["The Village", "Unset Visibility"],
        }),
      ],
      storyData
    );
    const contextForStory = result.results[0].contextForStory;

    expect(contextForStory).not.toContain("[[HIDDEN_LORE:");
    expect(contextForStory).toContain("A small farming village.");
    expect(contextForStory).toContain("No visibility field set at all.");
  });

  it("wraps to_be_revealed and check_per_turn the same way as hidden", async () => {
    const storyData = createMockStoryData({
      lore: [
        createLore({
          title: "Secret Villain",
          content: "The mayor is secretly the villain.",
          visibility: "to_be_revealed",
        }),
        createLore({
          title: "Nearby Patrol",
          content: "A patrol is searching the area.",
          visibility: "check_per_turn",
        }),
      ],
    });

    const result = await executeGMTools(
      [
        createToolCall("read_notes", {
          titles: ["Secret Villain", "Nearby Patrol"],
        }),
      ],
      storyData
    );
    const contextForStory = result.results[0].contextForStory;

    expect(contextForStory).toContain("[[HIDDEN_LORE:Secret Villain]]");
    expect(contextForStory).toContain("[[HIDDEN_LORE:Nearby Patrol]]");
  });
});

describe("stripHiddenLoreContent", () => {
  it("removes everything between HIDDEN_LORE markers, including the content itself", () => {
    const text =
      "Some visible GM reasoning.\n\n" +
      "### The Trap [[HIDDEN_LORE:The Trap]]\n" +
      "(HIDDEN FROM PLAYER - do not narrate this content or reveal its existence.)\n" +
      "A pressure plate triggers a dart trap.[[/HIDDEN_LORE]]\n\n" +
      "More visible reasoning.";

    const stripped = stripHiddenLoreContent(text);

    expect(stripped).not.toContain("pressure plate");
    expect(stripped).not.toContain("HIDDEN_LORE");
    expect(stripped).toContain("Some visible GM reasoning.");
    expect(stripped).toContain("More visible reasoning.");
  });

  it("strips multiple independent hidden blocks", () => {
    const text =
      "[[HIDDEN_LORE:A]]secret A[[/HIDDEN_LORE]] visible middle [[HIDDEN_LORE:B]]secret B[[/HIDDEN_LORE]]";
    const stripped = stripHiddenLoreContent(text);

    expect(stripped).not.toContain("secret A");
    expect(stripped).not.toContain("secret B");
    expect(stripped).toContain("visible middle");
  });

  it("is a no-op on text with no hidden markers", () => {
    const text = "Just ordinary narration with nothing hidden.";
    expect(stripHiddenLoreContent(text)).toBe(text);
  });

  it("handles empty/undefined input safely", () => {
    expect(stripHiddenLoreContent("")).toBe("");
  });
});

describe("resolveCheckPerTurnVisibility", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("flips check_per_turn entries to always_reveal when the roll succeeds", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // always below the reveal chance
    const storyData = createMockStoryData({
      lore: [
        createLore({ title: "Patrol", content: "...", visibility: "check_per_turn" }),
      ],
    });

    const revealed = resolveCheckPerTurnVisibility(storyData);

    expect(revealed).toEqual(["Patrol"]);
    expect(storyData.lore![0].visibility).toBe("always_reveal");
  });

  it("leaves check_per_turn entries alone when the roll fails", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999); // always above the reveal chance
    const storyData = createMockStoryData({
      lore: [
        createLore({ title: "Patrol", content: "...", visibility: "check_per_turn" }),
      ],
    });

    const revealed = resolveCheckPerTurnVisibility(storyData);

    expect(revealed).toEqual([]);
    expect(storyData.lore![0].visibility).toBe("check_per_turn");
  });

  it("does not touch hidden, to_be_revealed, or always_reveal entries", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const storyData = createMockStoryData({
      lore: [
        createLore({ title: "Hidden", content: "...", visibility: "hidden" }),
        createLore({
          title: "ToReveal",
          content: "...",
          visibility: "to_be_revealed",
        }),
        createLore({
          title: "Always",
          content: "...",
          visibility: "always_reveal",
        }),
      ],
    });

    const revealed = resolveCheckPerTurnVisibility(storyData);

    expect(revealed).toEqual([]);
    expect(storyData.lore![0].visibility).toBe("hidden");
    expect(storyData.lore![1].visibility).toBe("to_be_revealed");
    expect(storyData.lore![2].visibility).toBe("always_reveal");
  });

  it("handles a story with no lore entries", () => {
    const storyData = createMockStoryData({ lore: [] });
    expect(resolveCheckPerTurnVisibility(storyData)).toEqual([]);
  });
});
