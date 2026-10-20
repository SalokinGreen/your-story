import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import type { StoryData } from "@/app/misc/structs";
import {
  createEmptyDraft,
  draftToAdventure,
} from "@/app/misc/designer_executor";
import {
  ensureStoryArrays,
  getLocalStory,
  startAdventureLocally,
} from "@/app/misc/localStoryManager";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

const REQUIRED_ARRAYS = [
  "memory",
  "chapters",
  "stats",
  "resources",
  "inventory",
  "abilities",
  "lore",
  "goals",
  "relationships",
  "npcs",
] as const;

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
  vi.stubGlobal("indexedDB", new IDBFactory());
});

describe("startAdventureLocally", () => {
  // Regression: a story started from a Game Designer adventure had no
  // `inventory` (draftToAdventure() never sets it), and the story menu's
  // `storyData.inventory.length` crashed the page on first render.
  it("gives a story started from a Designer adventure every required array", async () => {
    const draft = { ...createEmptyDraft(), title: "Smoke Test" };
    const adventure = draftToAdventure(draft);
    expect(adventure.storyTemplate?.inventory).toBeUndefined();
    expect(adventure.storyTemplate?.npcs).toBeUndefined();

    const id = await startAdventureLocally(adventure, "Custom");
    const story = await getLocalStory(id);

    expect(story).toBeDefined();
    for (const key of REQUIRED_ARRAYS) {
      expect(Array.isArray(story!.storyData[key]), key).toBe(true);
    }
    expect(story!.storyData.inventory).toEqual([]);
    expect(story!.storyData.player_name).toBe("Custom");
  });

  it("keeps what the adventure's template already has", async () => {
    const draft = {
      ...createEmptyDraft(),
      title: "With NPCs",
      npcs: [{ id: "npc_1", name: "Mara" }],
    } as unknown as ReturnType<typeof createEmptyDraft>;

    const id = await startAdventureLocally(draftToAdventure(draft));
    const story = await getLocalStory(id);

    expect(story!.storyData.npcs.map((n) => n.name)).toEqual(["Mara"]);
  });
});

describe("ensureStoryArrays", () => {
  it("fills in missing arrays and leaves existing ones alone", () => {
    const goals = [{ id: "g1" }];
    const story = { story_name: "Old save", goals } as unknown as StoryData;

    ensureStoryArrays(story);

    expect(story.goals).toBe(goals);
    expect(story.inventory).toEqual([]);
    expect(story.npcs).toEqual([]);
    for (const key of REQUIRED_ARRAYS) {
      expect(Array.isArray(story[key]), key).toBe(true);
    }
  });
});
