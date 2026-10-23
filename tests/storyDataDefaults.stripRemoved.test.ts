import { describe, it, expect } from "vitest";
import {
  ensureStoryDataArrays,
  stripRemovedFields,
  withLegacyGuestShim,
  REMOVED_STORY_FIELDS,
} from "@/app/misc/storyDataDefaults";
import type { StoryData } from "@/app/misc/structs";

type Loose = Record<string, unknown>;

const LEGACY_ARRAYS = [
  "stats",
  "resources",
  "inventory",
  "abilities",
  "relationships",
  "variables",
];

// What an arcade-era save looked like: every removed key, top level and
// nested, next to the data that must survive (decision 126).
function arcadeChoice(): Loose {
  return {
    text: "Pick the lock",
    intro_override: "You crouch at the door.",
    stt_input: true,
    skill_used: "Stealth",
    skill_dc: 12,
    skill_dc_tier: "hard",
    item_used: "Lockpick",
    item_loss: "yes",
    resource_used: "Stamina",
    ability_used: "Shadowstep",
    stat_bonus: 2,
    agmt_check: "Is it guarded?",
    agmt_context_only: true,
    agmt_table: "Event Focus",
    table: "Weather",
    custom_table: "Weather",
    rolls: [{ skill: "Stealth", dc: 12 }],
    challenge_handling: { is_complex_event: true },
  };
}

function oldArcadeSave(): StoryData {
  return {
    story_name: "Old arcade run",
    premise: "A heist.",
    player_name: "Rook",
    player_summary: "A thief.",
    intro: "Rain.",
    memory: ["The vault is under the clock tower."],
    max_chapters: 0,
    currentChapter: 0,
    chapters: [
      {
        title: "One",
        summary: "",
        notes: [],
        scene: {
          parts: [
            { content: "old", gameOver: true, choices: [arcadeChoice()] },
          ],
        },
      },
    ],
    scene: {
      parts: [
        { content: "You arrive.", user: false, choices: [arcadeChoice()] },
        {
          content: "Dead end.",
          user: false,
          gameOver: true,
          choices: [],
          observerRewriteOriginal: {
            content: "first draft",
            flag: {},
            choices: [arcadeChoice()],
          },
        },
      ],
      summary: "So far",
    },
    stats: [{ name: "Stealth", value: 20, description: "", symbol: "Moon" }],
    resources: [
      { name: "HP", value: 5, maxValue: 10, description: "", symbol: "Heart" },
    ],
    inventory: [
      {
        name: "Lockpick",
        quantity: 1,
        description: "",
        type: "normal",
        symbol: "Key",
      },
    ],
    abilities: [
      {
        name: "Shadowstep",
        description: "",
        grade: "novice",
        cost: [],
        symbol: "Moon",
      },
    ],
    relationships: [{ name: "Mara", value: 10, description: "", symbol: "Heart" }],
    variables: [
      { id: "v", name: "Alarm", description: "", type: "boolean", value: false },
    ],
    skillTrees: [
      { id: "t", name: "Tree", description: "", symbol: "Moon", nodes: [] },
    ],
    unlockedNodes: ["t:n1"],
    nodeEffects: { statBonuses: [], resourceBonuses: [], passives: [] },
    restState: { quickRestsUsed: 1, shortRestsUsed: 0 },
    stress: 3,
    maxStress: 10,
    reverseDC: true,
    upgradeSettings: { enabled: true },
    newGamePlusCount: 2,
    newGamePlusMode: true,
    gameOver: { reason: "Died", timestamp: 1 },
    pendingPlayerActions: ["Bought a lockpick"],
    incidentalReactions: {},
    lore: [
      {
        title: "Sheet",
        content: "Rook, thief.",
        type: "character_sheet",
        relatedCharacters: [],
        relatedLocations: [],
        secrtet: false,
        keys: [],
        var_on_triggers: ["Alarm"],
        var_off_triggers: ["Calm"],
        on_triggers: ["clock"],
      },
      {
        title: "Rules",
        content: "Roll d20.",
        type: "mechanics",
        relatedCharacters: [],
        relatedLocations: [],
        secrtet: false,
        keys: [],
      },
    ],
    goals: [
      { id: "g", title: "Rob the vault", description: "", active: true, fulfilled: false },
    ],
    npcs: [{ id: "n", name: "Mara" }],
    threads: [
      { id: "th", title: "Heat", description: "", status: "active", createdAt: 1 },
    ],
    customTables: [
      {
        id: "ct",
        name: "Weather",
        description: "",
        entries: [{ text: "Rain", weight: 1 }],
      },
    ],
    presets: [
      {
        id: "p1",
        name: "Thief",
        description: "",
        icon: "Moon",
        authorNotes: "",
        characterSheet: "A thief.",
        stats: [{ name: "Stealth" }],
        resources: [],
        inventory: [],
        abilities: [],
        relationships: [],
        variables: [],
        npcs: [],
      },
    ],
    starting_choices: [arcadeChoice()],
    agmtState: {
      chaosFactor: 5,
      sceneCount: 3,
      skillCheckHistory: [],
      currentStreak: 0,
      lastChaosAdjustment: 0,
      threads: [],
    },
  } as unknown as StoryData;
}

function loose(value: unknown): Loose {
  return value as Loose;
}

const PLAIN_CHOICE_KEYS = ["intro_override", "stt_input", "text"];

describe("ensureStoryDataArrays on an old arcade save", () => {
  it("drops every removed top-level key", () => {
    const story = ensureStoryDataArrays(oldArcadeSave());
    for (const key of REMOVED_STORY_FIELDS) {
      expect(key in story, key).toBe(false);
    }
  });

  it("drops the nested fields", () => {
    const story = loose(ensureStoryDataArrays(oldArcadeSave()));
    const parts = loose(story.scene).parts as Loose[];
    const chapterParts = loose(loose((story.chapters as Loose[])[0]).scene)
      .parts as Loose[];

    expect("gameOver" in parts[1]).toBe(false);
    expect("gameOver" in chapterParts[0]).toBe(false);

    const choices = [
      ...(parts[0].choices as Loose[]),
      ...(loose(parts[1].observerRewriteOriginal).choices as Loose[]),
      ...(chapterParts[0].choices as Loose[]),
      ...(story.starting_choices as Loose[]),
    ];
    expect(choices).toHaveLength(4);
    for (const choice of choices) {
      expect(Object.keys(choice).sort()).toEqual(PLAIN_CHOICE_KEYS);
    }

    for (const note of story.lore as Loose[]) {
      expect("var_on_triggers" in note).toBe(false);
      expect("var_off_triggers" in note).toBe(false);
    }
    const preset = (story.presets as Loose[])[0];
    expect(Object.keys(preset).sort()).toEqual([
      "authorNotes",
      "characterSheet",
      "description",
      "icon",
      "id",
      "name",
    ]);
    expect("threads" in loose(story.agmtState)).toBe(false);
  });

  it("keeps notes, the sheet, NPCs, goals, scene parts, starting choice text and customTables", () => {
    const story = ensureStoryDataArrays(oldArcadeSave());
    expect(story.lore.map((l) => l.title)).toEqual(["Sheet", "Rules"]);
    expect(story.lore[0].type).toBe("character_sheet");
    expect(story.lore[0].on_triggers).toEqual(["clock"]);
    expect(story.npcs).toHaveLength(1);
    expect(story.goals).toHaveLength(1);
    expect(story.threads).toHaveLength(1);
    expect(story.memory).toEqual(["The vault is under the clock tower."]);
    expect(story.scene.parts.map((p) => p.content)).toEqual([
      "You arrive.",
      "Dead end.",
    ]);
    expect(story.scene.summary).toBe("So far");
    expect(story.starting_choices?.[0].text).toBe("Pick the lock");
    expect(story.starting_choices?.[0].intro_override).toBe(
      "You crouch at the door.",
    );
    expect(story.customTables).toHaveLength(1);
    expect(story.agmtState?.sceneCount).toBe(3);
    expect(story.presets?.[0].characterSheet).toBe("A thief.");
  });

  it("returns the same object", () => {
    const save = oldArcadeSave();
    expect(ensureStoryDataArrays(save)).toBe(save);
  });
});

describe("a save without the removed fields", () => {
  it("is unchanged", () => {
    const clean = stripRemovedFields(oldArcadeSave());
    const before = structuredClone(clean);
    ensureStoryDataArrays(clean);
    expect(clean).toEqual(before);
  });

  it("does not backfill the removed arrays", () => {
    const story = ensureStoryDataArrays({} as StoryData);
    for (const key of REMOVED_STORY_FIELDS) {
      expect(key in story, key).toBe(false);
    }
    expect(story.lore).toEqual([]);
    expect(story.npcs).toEqual([]);
    expect(story.goals).toEqual([]);
  });
});

describe("an Undo snapshot", () => {
  it("carries none of the removed fields once stripped, so restoring it brings none back", () => {
    // getUndoStack strips each snapshot as it reads the stack; Undo then
    // restores one over the live story with Object.assign.
    const live = ensureStoryDataArrays(oldArcadeSave());
    const snapshot = stripRemovedFields(oldArcadeSave());
    Object.assign(live, snapshot);

    for (const key of REMOVED_STORY_FIELDS) {
      expect(key in live, key).toBe(false);
    }
    const choice = live.scene.parts[0].choices?.[0] as unknown as Loose;
    expect(Object.keys(choice).sort()).toEqual(PLAIN_CHOICE_KEYS);
    expect("gameOver" in live.scene.parts[1]).toBe(false);
  });
});

describe("withLegacyGuestShim", () => {
  it("adds the empty arrays to a copy and leaves the original untouched", () => {
    const story = ensureStoryDataArrays(oldArcadeSave());
    const sent = loose(withLegacyGuestShim(story));

    for (const key of LEGACY_ARRAYS) {
      expect(sent[key], key).toEqual([]);
      expect(key in story, key).toBe(false);
    }
    expect(sent).not.toBe(story);
    expect(sent.lore).toBe(story.lore);
  });

  it("is undone by a new guest's ensureStoryDataArrays", () => {
    const story = ensureStoryDataArrays(oldArcadeSave());
    const received = ensureStoryDataArrays(withLegacyGuestShim(story));
    for (const key of LEGACY_ARRAYS) {
      expect(key in received, key).toBe(false);
    }
  });
});
