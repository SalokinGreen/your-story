/**
 * Tests for the name pointer generator - the deterministic half of naming.
 *
 * The contract the GM prompt leans on: starting letters and syllable counts
 * are BINDING (so they must be internally consistent and honour what the GM
 * locked), rolled initials steer away from names already in the story, and
 * seed sounds actually start with the letter they're paired with. If any of
 * those slip, the tool quietly degrades back into "the model names things
 * however it likes", which is the failure it exists to prevent.
 */
import { describe, it, expect } from "vitest";
import {
  collectUsedInitials,
  formatNamePointers,
  generateNamePointers,
} from "@/app/misc/nameGenerator";
import { executeGMTools } from "@/app/misc/gmExecutor";
import { buildGMStagePrompt } from "@/app/misc/ai_staged";
import { StoryData, StoryLore, NPC } from "@/app/misc/structs";

/** Deterministic rng cycling a fixed sequence, mirroring the dice tests. */
function seededRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

function createMockStoryData(overrides: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "Test Story",
    player_name: "Hero",
    premise: "",
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

function createNPC(name: string, overrides: Partial<NPC> = {}): NPC {
  return {
    id: `npc_${name}`,
    name,
    description: "",
    role: "",
    status: "alive",
    relationship: "",
    attitude: "neutral",
    createdAt: 0,
    ...overrides,
  } as NPC;
}

function createNote(overrides: Partial<StoryLore> = {}): StoryLore {
  return {
    title: "Note",
    content: "",
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
    ...overrides,
  } as StoryLore;
}

function createToolCall(name: string, args: Record<string, unknown>) {
  return {
    id: `test_${Math.random().toString(36).slice(2)}`,
    function: { name, arguments: JSON.stringify(args) },
  };
}

describe("generateNamePointers: structure", () => {
  it("defaults a person to a given + family name", () => {
    const pointers = generateNamePointers({ kind: "person" });
    expect(pointers.parts.map((p) => p.label)).toEqual([
      "Given name",
      "Family name",
    ]);
  });

  it("defaults non-person kinds to a single part", () => {
    expect(generateNamePointers({ kind: "place" }).parts).toHaveLength(1);
    expect(generateNamePointers({ kind: "faction" }).parts).toHaveLength(1);
  });

  it("labels a three-part person name with a middle name", () => {
    const pointers = generateNamePointers({ kind: "person", parts: 3 });
    expect(pointers.parts.map((p) => p.label)).toEqual([
      "Given name",
      "Middle name",
      "Family name",
    ]);
  });

  it("clamps part counts to 1-3", () => {
    expect(generateNamePointers({ parts: 9 }).parts).toHaveLength(3);
    expect(generateNamePointers({ parts: 0 }).parts).toHaveLength(1);
    expect(generateNamePointers({ parts: -4 }).parts).toHaveLength(1);
  });

  it("falls back to person for an unknown kind", () => {
    // Kind arrives as raw JSON from the model, so it can be anything.
    const pointers = generateNamePointers({
      kind: "spaceship" as never,
    });
    expect(pointers.kind).toBe("person");
  });
});

describe("generateNamePointers: the binding half", () => {
  it("emits one seed sound per declared syllable", () => {
    for (let run = 0; run < 25; run++) {
      const pointers = generateNamePointers({ kind: "person", parts: 3 });
      for (const part of pointers.parts) {
        expect(part.sounds).toHaveLength(part.syllables);
      }
    }
  });

  it("starts every part's first seed sound with that part's initial", () => {
    for (let run = 0; run < 50; run++) {
      const pointers = generateNamePointers({ kind: "person", parts: 2 });
      for (const part of pointers.parts) {
        expect(part.sounds[0].charAt(0).toUpperCase()).toBe(part.initial);
      }
    }
  });

  it("honours locked initials verbatim and marks them locked", () => {
    const pointers = generateNamePointers({
      kind: "person",
      parts: 2,
      starts_with: ["n", "f"],
    });
    expect(pointers.parts.map((p) => p.initial)).toEqual(["N", "F"]);
    expect(pointers.parts.every((p) => p.locked)).toBe(true);
  });

  it("rolls the parts the GM left open ('?') and locks the rest", () => {
    const pointers = generateNamePointers({
      kind: "person",
      parts: 2,
      starts_with: ["V", "?"],
    });
    expect(pointers.parts[0].initial).toBe("V");
    expect(pointers.parts[0].locked).toBe(true);
    expect(pointers.parts[1].locked).toBe(false);
    expect(pointers.parts[1].initial).toMatch(/^[A-Z]$/);
  });

  it("honours locked syllable counts and clamps them to 1-4", () => {
    const pointers = generateNamePointers({
      kind: "person",
      parts: 3,
      syllables: [3, 99, 0],
    });
    expect(pointers.parts.map((p) => p.syllables)).toEqual([3, 4, 1]);
  });

  it("never rolls the same initial twice within one name", () => {
    for (let run = 0; run < 50; run++) {
      const pointers = generateNamePointers({ kind: "person", parts: 3 });
      const initials = pointers.parts.map((p) => p.initial);
      expect(new Set(initials).size).toBe(3);
    }
  });
});

describe("generateNamePointers: avoiding initials already in play", () => {
  it("never rolls a letter that's already used", () => {
    const used = ["A", "B", "C", "D", "E", "K", "L", "M", "T"];
    for (let run = 0; run < 100; run++) {
      const pointers = generateNamePointers({ kind: "person", parts: 2 }, used);
      for (const part of pointers.parts) {
        expect(used).not.toContain(part.initial);
      }
    }
  });

  it("reports which initials it steered around", () => {
    const pointers = generateNamePointers({ parts: 1 }, ["k", "e"]);
    expect(pointers.avoidedInitials).toEqual(["E", "K"]);
  });

  it("lets a locked initial collide with an existing name on purpose", () => {
    // Naming Nicolas's brother: the GM wants the N, avoidance must not fight it.
    const pointers = generateNamePointers(
      { kind: "person", parts: 1, starts_with: ["N"] },
      ["N", "F"]
    );
    expect(pointers.parts[0].initial).toBe("N");
  });

  it("drops avoidance once too few letters are left", () => {
    // A long campaign eventually touches most letters; squeezing every later
    // name into the leftovers would be worse than allowing repeats.
    const nearlyEverything = "abcdefghijklmnopqrstuvw".split("");
    const pointers = generateNamePointers({ parts: 1 }, nearlyEverything);
    expect(pointers.avoidedInitials).toEqual([]);
    expect(pointers.parts[0].initial).toMatch(/^[A-Z]$/);
  });

  it("is driven by the injected rng, not ambient randomness", () => {
    const request = { kind: "person" as const, parts: 2 };
    const a = generateNamePointers(request, [], seededRng([0.11, 0.42, 0.73]));
    const b = generateNamePointers(request, [], seededRng([0.11, 0.42, 0.73]));
    expect(a).toEqual(b);
  });
});

describe("collectUsedInitials", () => {
  it("collects from the player, NPCs, aliases and combatants", () => {
    const storyData = createMockStoryData({
      player_name: "Wren",
      npcs: [createNPC("Kel Draven", { aliases: ["The Shrike"] })],
      combatState: {
        active: true,
        combatants: [
          {
            id: "c1",
            name: "Bog Hound",
            type: "enemy",
            stats: { HP: 8 },
            conditions: [],
            initiative: "1d20",
            isActive: true,
          },
        ],
        turnOrder: ["c1"],
        currentTurnIndex: 0,
        round: 1,
      },
    });

    const used = collectUsedInitials(storyData);
    // Every word counts, so multi-word names contribute both letters.
    expect(used).toEqual(expect.arrayContaining(["W", "K", "D", "T", "S", "B", "H"]));
  });

  it("collects note titles and the entities notes point at", () => {
    const storyData = createMockStoryData({
      player_name: "",
      lore: [
        createNote({
          title: "Ashfen Vale",
          type: "lore",
          relatedCharacters: ["Mira"],
          relatedLocations: ["Grimhollow"],
        }),
      ],
    });

    expect(collectUsedInitials(storyData)).toEqual(["A", "G", "M", "V"]);
  });

  it("ignores scaffolding notes whose titles name nobody", () => {
    const storyData = createMockStoryData({
      player_name: "",
      lore: [
        createNote({ title: "Mechanics", type: "mechanics" }),
        createNote({ title: "Campaign Plan", type: "gm_plan" }),
        createNote({ title: "Sheet", type: "character_sheet" }),
        createNote({ title: "Running This Adventure", type: "dm_instructions" }),
      ],
    });

    expect(collectUsedInitials(storyData)).toEqual([]);
  });

  it("survives an empty story and old saves missing arrays", () => {
    const bare = { player_name: "" } as StoryData;
    expect(collectUsedInitials(bare)).toEqual([]);
  });
});

describe("formatNamePointers", () => {
  it("renders binding constraints, seeds and the avoid list", () => {
    const pointers = generateNamePointers(
      {
        kind: "person",
        parts: 2,
        starts_with: ["N", "F"],
        syllables: [3, 1],
        flavor: "Norse-ish",
      },
      ["K"]
    );

    const text = formatNamePointers(pointers, "the innkeeper who spoke up");

    expect(text).toContain('flavor: "Norse-ish"');
    expect(text).toContain('Given name: starts with "N"');
    expect(text).toContain("3 syllables");
    expect(text).toContain('Family name: starts with "F"');
    expect(text).toContain("1 syllable,");
    expect(text).toContain("Already in play, not rolled: K");
    expect(text).toContain("Naming: the innkeeper who spoke up");
    // The split the whole design rests on has to be stated in the output.
    expect(text).toContain("binding");
    expect(text).toContain("inspiration");
  });

  it("omits the avoid list when nothing was steered around", () => {
    const pointers = generateNamePointers({ parts: 1 });
    expect(formatNamePointers(pointers)).not.toContain("Already in play");
  });
});

describe("generate_name tool wiring", () => {
  it("is offered to the model by the GM stage prompt", () => {
    const { tools } = buildGMStagePrompt({
      storyData: createMockStoryData(),
      userChoice: "Talk to the innkeeper",
    });
    expect(tools.map((t) => t.function.name)).toContain("generate_name");
  });

  it("returns pointers as story context without mutating state", async () => {
    const storyData = createMockStoryData({
      npcs: [createNPC("Kessa")],
    });

    const result = await executeGMTools(
      [
        createToolCall("generate_name", {
          kind: "person",
          parts: 2,
          flavor: "coastal trading town",
          reason: "the innkeeper",
        }),
      ],
      storyData
    );

    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(true);
    expect(result.storyContext).toContain("Name pointers");
    expect(result.storyContext).toContain("coastal trading town");
    expect(result.storyContext).toContain("Naming: the innkeeper");
    // Read-only: the name itself is recorded later via add_npc/create_note.
    expect(result.modifiedStoryData.npcs).toHaveLength(1);
    expect(result.modifiedStoryData.lore).toHaveLength(0);
  });

  it("steers away from the initials of NPCs already in the story", async () => {
    const storyData = createMockStoryData({
      player_name: "",
      npcs: [
        createNPC("Kessa"),
        createNPC("Kolm"),
        createNPC("Karrick"),
      ],
    });

    for (let run = 0; run < 20; run++) {
      const result = await executeGMTools(
        [createToolCall("generate_name", { kind: "person", parts: 1 })],
        storyData
      );
      expect(result.storyContext).not.toContain('starts with "K"');
    }
  });

  it("works with no arguments at all", async () => {
    const result = await executeGMTools(
      [createToolCall("generate_name", {})],
      createMockStoryData()
    );

    expect(result.results[0].success).toBe(true);
    expect(result.storyContext).toContain("Name pointers (person)");
  });
});
