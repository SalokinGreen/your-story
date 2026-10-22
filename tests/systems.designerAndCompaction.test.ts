import { describe, expect, it } from "vitest";
import {
  adventureToDraft,
  createEmptyDraft,
  draftToAdventure,
  summarizeDraft,
} from "@/app/misc/designer_executor";
import {
  buildDesignerMessages,
  builtinSystemsParagraph,
} from "@/app/misc/designer_ai";
import { buildCondensedStorySeed } from "@/app/misc/storyCompaction";
import { createMeter, createTrack } from "@/app/misc/metersAndTracks";
import type { StoryData, StoryLore } from "@/app/misc/structs";
import { TEST_SYSTEM, mockStory } from "./helpers/systemsHarness";

describe("the Designer and systems", () => {
  it("round-trips the hand switch through an adventure", () => {
    const draft = { ...createEmptyDraft(), title: "T", systemState: { usesSystemTools: true } };
    const adventure = draftToAdventure(draft);
    expect(adventure.storyTemplate?.systemState?.usesSystemTools).toBe(true);
    expect(adventureToDraft(adventure).systemState).toEqual({ usesSystemTools: true });
    const off = draftToAdventure({ ...draft, systemState: { usesSystemTools: false } });
    expect(adventureToDraft(off).systemState?.usesSystemTools).toBe(false);
  });

  it("leaves systemState out when it was never set", () => {
    const adventure = draftToAdventure({ ...createEmptyDraft(), title: "T" });
    expect(adventure.storyTemplate && "systemState" in adventure.storyTemplate).toBe(false);
    expect(adventureToDraft(adventure).systemState).toBeUndefined();
  });

  it("summarizeDraft says nothing about systems when there is none", () => {
    expect(summarizeDraft(createEmptyDraft())).not.toContain("Built-in system");
  });

  it("summarizeDraft names the switch when it is set by hand", () => {
    const text = summarizeDraft({ ...createEmptyDraft(), systemState: { usesSystemTools: true } });
    expect(text).toContain("Built-in system");
    expect(text).toContain("ON");
  });

  it("builtinSystemsParagraph is empty with no systems and names the systems otherwise", () => {
    expect(builtinSystemsParagraph([])).toBe("");
    const text = builtinSystemsParagraph([TEST_SYSTEM]);
    expect(text).toContain("Test System");
    expect(text).toContain("import");
  });

  it("the Designer's system prompt gains the paragraph only when systems exist", () => {
    const draft = createEmptyDraft();
    const none = buildDesignerMessages({ history: [], draft, systems: [] });
    const some = buildDesignerMessages({ history: [], draft, systems: [TEST_SYSTEM] });
    expect(String(some[0].content)).toContain("Built-in rules packs");
    expect(String(none[0].content)).not.toContain("Built-in rules packs");
    expect(String(some[0].content).startsWith(String(none[0].content))).toBe(true);
  });
});

describe("compaction and systems", () => {
  it("a condensed story keeps its meters and tracks and clears the dedup keys", async () => {
    const story: StoryData = mockStory({
      meters: [createMeter({ name: "Stress", min: 0, max: 6, start: 4 }, "Mira")],
      progressTracks: [createTrack("Mira", "Vow", "vow", "dangerous")],
      systemState: {
        usesSystemTools: true,
        sessionCount: 2,
        dedupKeys: [{ meterId: "mira::stress", key: "a", scope: "scene", at: 3 }],
      },
      lore: [] as StoryLore[],
    });
    const seed = await buildCondensedStorySeed(story, "Copy", {
      model: "x",
      token: null,
    } as never);
    expect(seed.meters?.[0].value).toBe(4);
    expect(seed.progressTracks).toHaveLength(1);
    expect(seed.systemState?.dedupKeys).toEqual([]);
    expect(seed.systemState?.sessionCount).toBe(2);
    expect(seed.systemState?.usesSystemTools).toBe(true);
    // the original is untouched
    expect(story.systemState?.dedupKeys).toHaveLength(1);
  });
});
