import { executeGMTools } from "@/app/misc/gmExecutor";
import type { StoryData } from "@/app/misc/structs";
import { BUILTIN_SYSTEMS } from "@/app/misc/systems";
import type { BuiltinSystem } from "@/app/misc/systems/types";

export function mockStory(overrides: Partial<StoryData> = {}): StoryData {
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

let n = 0;
export function call(name: string, args: Record<string, unknown>) {
  n += 1;
  return { id: `test_${n}`, function: { name, arguments: JSON.stringify(args) } };
}

export async function run(
  story: StoryData,
  name: string,
  args: Record<string, unknown>,
) {
  const out = await executeGMTools([call(name, args)], story);
  return { result: out.results[0], story: out.modifiedStoryData };
}

/** A small system for tests, with the sets create_set reads. */
export const TEST_SYSTEM: BuiltinSystem = {
  id: "test",
  title: "Test System",
  description: "A system used by tests.",
  packs: [
    {
      id: "test:rules",
      systemId: "test",
      title: "Test rules",
      description: "",
      notes: [
        { id: "builtin:test:core", title: "Core", type: "dm_instructions", content: "x" },
      ],
    },
  ],
  starters: [],
  meterSets: [
    {
      name: "Hero",
      meters: [
        { name: "Stress", min: 0, max: 6, start: 2 },
        {
          name: "Beast",
          min: 0,
          max: 10,
          start: 0,
          onlyUp: true,
          thresholds: [{ at: 3, label: "Stirring", note: "the Beast whispers" }],
        },
        { name: "Resolve", min: 0, max: 3, start: 3, resetsAtSessionEnd: 3 },
      ],
    },
  ],
  endOfSessionReminder: "Run the Reckoning.",
};

/** Registers TEST_SYSTEM in the registry for the duration of a test; call the returned function after. */
export function installTestSystem(): () => void {
  BUILTIN_SYSTEMS.push(TEST_SYSTEM);
  return () => {
    const i = BUILTIN_SYSTEMS.indexOf(TEST_SYSTEM);
    if (i >= 0) BUILTIN_SYSTEMS.splice(i, 1);
  };
}

/** A story whose lore holds the test system's core note, so resolveSystem finds the system. */
export function systemStory(overrides: Partial<StoryData> = {}): StoryData {
  return mockStory({
    lore: [
      {
        id: "core",
        title: "Core",
        content: "x",
        type: "dm_instructions",
        libraryNoteId: "builtin:test:core",
      },
    ] as unknown as StoryData["lore"],
    ...overrides,
  });
}
