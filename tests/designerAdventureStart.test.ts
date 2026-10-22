/**
 * Starting a story from a Game Designer adventure.
 *
 * draftToAdventure() only writes what the GM reads, so its story template has
 * none of the legacy stat-block arrays, and startAdventureLocally() used to
 * copy it as-is. Picking a character then opened the menu, which read
 * `storyData.inventory.length` and crashed the page. These tests build an
 * adventure through the Designer's own tools, start it the way the creator
 * and library do, and check the saved story has every array the app reads.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import type { StoryData } from "@/app/misc/structs";
import {
  createEmptyDraft,
  draftToAdventure,
  executeDesignerTools,
} from "@/app/misc/designer_executor";
import {
  getLocalStory,
  startAdventureLocally,
} from "@/app/misc/localStoryManager";
import { ensureStoryDataArrays } from "@/app/misc/storyDataDefaults";

// Every array StoryData declares as required. The menu, the context viewer,
// the Story Editor and several GM tools read these without guarding.
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

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("localStorage", new MemoryStorage());
});

// A small but complete adventure, written the way the Designer writes one:
// rules and a character sheet as notes, no NPCs, no presets.
function buildDesignerAdventure() {
  const { draft, results } = executeDesignerTools(
    [
      {
        id: "1",
        name: "set_adventure_info",
        arguments: { title: "Ashfall", tags: ["noir"] },
      },
      {
        id: "2",
        name: "set_premise",
        arguments: {
          premise: "A detective in a city under volcanic ash.",
          intro: "Ash drifts past the office window.",
        },
      },
      {
        id: "3",
        name: "write_note",
        arguments: {
          title: "Rules",
          type: "mechanics",
          content: "Roll 2d6 + trait. 10+ succeeds, 7-9 succeeds at a cost.",
        },
      },
      {
        id: "4",
        name: "write_note",
        arguments: {
          title: "Character",
          type: "character_sheet",
          content: "Name, Grit, Wits, Nerve.",
        },
      },
      {
        id: "5",
        name: "set_character_sheet_template",
        arguments: {
          template:
            "# {{Name | Your detective's name | Sam}}\n" +
            "**Grit:** {{Grit | How tough you are | 1}}",
        },
      },
    ],
    createEmptyDraft(),
  );
  expect(results.map((r) => r.error)).toEqual(results.map(() => undefined));
  return draftToAdventure(draft);
}

async function startAndLoad(
  ...args: Parameters<typeof startAdventureLocally>
): Promise<StoryData> {
  const id = await startAdventureLocally(...args);
  const saved = await getLocalStory(id);
  expect(saved).toBeDefined();
  return saved!.storyData;
}

describe("starting a story from a Designer-made adventure", () => {
  it("saves every array the app reads", async () => {
    const story = await startAndLoad(buildDesignerAdventure());

    for (const key of REQUIRED_ARRAYS) {
      expect(Array.isArray(story[key]), `storyData.${key}`).toBe(true);
    }
    expect(Array.isArray(story.scene.parts)).toBe(true);
    // The legacy stat-block arrays start empty; nothing is invented for them.
    expect(story.inventory).toEqual([]);
    expect(story.stats).toEqual([]);
    expect(story.npcs).toEqual([]);
  });

  it("keeps what the adventure wrote", async () => {
    const story = await startAndLoad(buildDesignerAdventure());

    expect(story.premise).toBe("A detective in a city under volcanic ash.");
    expect(story.intro).toBe("Ash drifts past the office window.");
    expect(story.lore.map((l) => l.title)).toEqual(["Rules", "Character"]);
    expect(story.characterSheetTemplate?.fields.length).toBeGreaterThan(0);
  });

  it("works for the library's call too, with notes picked at start", async () => {
    const story = await startAndLoad(buildDesignerAdventure(), "Player", [
      {
        title: "House rules",
        content: "No PvP.",
        relatedCharacters: [],
        relatedLocations: [],
        secrtet: false,
        keys: [],
        type: "dm_instructions",
      },
    ]);

    for (const key of REQUIRED_ARRAYS) {
      expect(Array.isArray(story[key]), `storyData.${key}`).toBe(true);
    }
    expect(story.lore.map((l) => l.title)).toContain("House rules");
  });
});

describe("ensureStoryDataArrays", () => {
  it("repairs a story saved before the fix, as the story page's load does", () => {
    // What startAdventureLocally saved for a Designer adventure before.
    const broken = {
      ...draftToAdventure(createEmptyDraft()).storyTemplate,
      player_name: "Player",
    } as unknown as StoryData;
    expect(broken.inventory).toBeUndefined();

    ensureStoryDataArrays(broken);

    for (const key of REQUIRED_ARRAYS) {
      expect(Array.isArray(broken[key]), `storyData.${key}`).toBe(true);
    }
  });

  it("never replaces arrays that are already there", () => {
    const goals = [
      { title: "Find the arsonist", description: "", fulfilled: false },
    ];
    const parts = [{ content: "Hi", user: false }];
    const story = {
      goals,
      scene: { parts, summary: "So far" },
    } as unknown as StoryData;

    const result = ensureStoryDataArrays(story);

    expect(result).toBe(story);
    expect(story.goals).toBe(goals);
    expect(story.scene.parts).toBe(parts);
    expect(story.scene.summary).toBe("So far");
  });

  it("creates the scene when there is none", () => {
    const story = ensureStoryDataArrays({} as StoryData);
    expect(story.scene).toEqual({ parts: [] });
  });
});

describe("starting with attached notes", () => {
  it("reports the template notes the attached ones replaced", async () => {
    const adventure = buildDesignerAdventure();
    const base = {
      content: "x",
      relatedCharacters: [],
      relatedLocations: [],
      keys: [],
      secrtet: false,
      type: "lore" as const,
    };
    adventure.storyTemplate = {
      ...adventure.storyTemplate,
      lore: [{ ...base, title: "The Docks", enabled: false }],
    } as typeof adventure.storyTemplate;
    let replaced: string[] = [];
    const id = await startAdventureLocally(
      adventure,
      "Player",
      [{ ...base, title: "The Docks", content: "mine" }],
      (titles) => (replaced = titles),
    );
    expect(replaced).toEqual(["The Docks"]);
    const saved = await getLocalStory(id);
    const docks = saved!.storyData.lore.find((l) => l.title === "The Docks");
    expect(docks?.content).toBe("mine");
    expect(docks?.enabled).toBe(true);
  });
});
