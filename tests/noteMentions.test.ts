import { describe, it, expect } from "vitest";
import {
  buildMentionCandidates,
  buildMentionMatcher,
  splitTextWithMentions,
} from "../app/misc/noteMentions";
import { StoryData, StoryLore, NPC } from "../app/misc/structs";

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
    npcs: [],
    ...overrides,
  } as StoryData;
}

function lore(overrides: Partial<StoryLore>): StoryLore {
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

function npc(overrides: Partial<NPC>): NPC {
  return {
    id: "npc_1",
    name: "Unnamed",
    description: "",
    role: "",
    status: "alive",
    relationship: "",
    attitude: "neutral",
    createdAt: 0,
    ...overrides,
  };
}

describe("noteMentions", () => {
  describe("buildMentionCandidates", () => {
    it("includes lore notes with their title and colors them by type", () => {
      const storyData = createMockStoryData({
        lore: [lore({ title: "The Sunken Temple", type: "location" })],
      });
      const candidates = buildMentionCandidates(storyData);
      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({
        kind: "lore",
        id: "The Sunken Temple",
        label: "The Sunken Temple",
        terms: ["The Sunken Temple"],
        colorClass: "text-green-300",
      });
    });

    it("includes a lore note's aliases as extra terms", () => {
      const storyData = createMockStoryData({
        lore: [lore({ title: "Bob", aliases: ["Bobby", "the old man"] })],
      });
      const candidates = buildMentionCandidates(storyData);
      expect(candidates[0].terms).toEqual(["Bob", "Bobby", "the old man"]);
    });

    it("excludes secret notes so an unrevealed secret's title is never highlighted", () => {
      const storyData = createMockStoryData({
        lore: [lore({ title: "The Killer's Identity", secrtet: true })],
      });
      expect(buildMentionCandidates(storyData)).toHaveLength(0);
    });

    it("excludes disabled notes", () => {
      const storyData = createMockStoryData({
        lore: [lore({ title: "Dormant Lore", enabled: false })],
      });
      expect(buildMentionCandidates(storyData)).toHaveLength(0);
    });

    it("includes NPCs with a fixed color and their aliases", () => {
      const storyData = createMockStoryData({
        npcs: [npc({ id: "npc_bob", name: "Bob", aliases: ["Bobby"] })],
      });
      const candidates = buildMentionCandidates(storyData);
      expect(candidates[0]).toMatchObject({
        kind: "npc",
        id: "npc_bob",
        label: "Bob",
        terms: ["Bob", "Bobby"],
        colorClass: "text-pink-300",
      });
    });
  });

  describe("buildMentionMatcher + splitTextWithMentions", () => {
    it("returns null when there are no usable terms", () => {
      expect(buildMentionMatcher([])).toBeNull();
    });

    it("splits plain text around a matched mention", () => {
      const storyData = createMockStoryData({
        npcs: [npc({ id: "npc_bob", name: "Bob" })],
      });
      const matcher = buildMentionMatcher(buildMentionCandidates(storyData));
      const segments = splitTextWithMentions("Bob walked into the tavern.", matcher!);
      expect(segments).toEqual([
        { text: "Bob", mention: expect.objectContaining({ id: "npc_bob" }) },
        { text: " walked into the tavern." },
      ]);
    });

    it("is case-insensitive and matches whole words only", () => {
      const storyData = createMockStoryData({
        npcs: [npc({ id: "npc_bob", name: "Bob" })],
      });
      const matcher = buildMentionMatcher(buildMentionCandidates(storyData));
      const segments = splitTextWithMentions("bob and Bobby went to see BOB.", matcher!);
      const mentioned = segments.filter((s) => s.mention).map((s) => s.text);
      // "Bobby" must NOT match just because it contains "Bob"
      expect(mentioned).toEqual(["bob", "BOB"]);
    });

    it("prefers the longest overlapping term", () => {
      const storyData = createMockStoryData({
        npcs: [
          npc({ id: "npc_bob", name: "Bob" }),
          npc({ id: "npc_bobsmith", name: "Bob Smith" }),
        ],
      });
      const matcher = buildMentionMatcher(buildMentionCandidates(storyData));
      const segments = splitTextWithMentions("Bob Smith walked in.", matcher!);
      expect(segments[0]).toEqual({
        text: "Bob Smith",
        mention: expect.objectContaining({ id: "npc_bobsmith" }),
      });
    });

    it("drops a term claimed by two different notes instead of linking ambiguously", () => {
      const storyData = createMockStoryData({
        lore: [lore({ title: "Bob", type: "location" })],
        npcs: [
          npc({ id: "npc_bob", name: "Bob" }),
          npc({ id: "npc_alice", name: "Alice" }),
        ],
      });
      const matcher = buildMentionMatcher(buildMentionCandidates(storyData));
      const segments = splitTextWithMentions("Bob and Alice are here.", matcher!);
      expect(segments.filter((s) => s.mention)).toEqual([
        { text: "Alice", mention: expect.objectContaining({ id: "npc_alice" }) },
      ]);
    });

    it("returns null when the only term is ambiguous, leaving nothing to match", () => {
      const storyData = createMockStoryData({
        lore: [lore({ title: "Bob", type: "location" })],
        npcs: [npc({ id: "npc_bob", name: "Bob" })],
      });
      expect(buildMentionMatcher(buildMentionCandidates(storyData))).toBeNull();
    });

    it("skips single-character terms", () => {
      const storyData = createMockStoryData({
        npcs: [npc({ id: "npc_i", name: "I" })],
      });
      expect(buildMentionMatcher(buildMentionCandidates(storyData))).toBeNull();
    });

    it("escapes regex-special characters in terms instead of treating them as regex syntax", () => {
      const storyData = createMockStoryData({
        npcs: [npc({ id: "npc_mr", name: "Mr. Smith" })],
      });
      const matcher = buildMentionMatcher(buildMentionCandidates(storyData));
      const matchTexts = (text: string) =>
        splitTextWithMentions(text, matcher!)
          .filter((s) => s.mention)
          .map((s) => s.text);
      expect(matchTexts("Mr. Smith nodded.")).toEqual(["Mr. Smith"]);
      // If "." were left as a regex wildcard, this would incorrectly match too.
      expect(matchTexts("Mrz Smith nodded.")).toEqual([]);
    });
  });
});
