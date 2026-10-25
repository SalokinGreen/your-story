/**
 * Fantastic Realms plan slice 1: the loader follows the system's own core id,
 * default setting and cross-setting scope, a system's step hints replace the
 * shared hint, and the recorded system id decides the system and its tools.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { buildGMStagePrompt } from "@/app/misc/ai_staged";
import { getCreationSteps } from "@/app/misc/setupSteps";
import type { StoryData, StoryLore } from "@/app/misc/structs";
import { BUILTIN_SYSTEMS } from "@/app/misc/systems";
import {
  addMissingBuiltinNotes,
  pushedBuiltinNotes,
  seedBuiltinNotesOffered,
} from "@/app/misc/systems/builtinNotes";
import {
  allSystemToolNames,
  recordSystemId,
  resolveSystem,
  SYSTEM_TOOL_NAMES,
} from "@/app/misc/systems/resolve";
import type { BuiltinNote, BuiltinSystem } from "@/app/misc/systems/types";
import { mockStory } from "./helpers/systemsHarness";
import { warmTokenizer } from "./helpers/turnHarness";

const note = (id: string, extra: Partial<BuiltinNote> = {}): BuiltinNote => ({
  id,
  title: id.split(":").pop()!,
  type: "lore",
  content: "c",
  ...extra,
});

const FAKE: BuiltinSystem = {
  id: "fake",
  title: "Fake",
  description: "",
  packs: [
    {
      id: "fake:rules",
      systemId: "fake",
      title: "Rules",
      description: "",
      notes: [
        note("builtin:fake:heart", { type: "dm_instructions" }),
        note("builtin:fake:foes"),
      ],
    },
    {
      id: "fake:world",
      systemId: "fake",
      title: "World",
      description: "",
      notes: [
        note("builtin:fake:crossroads", { scope: "crossroads" }),
        note("builtin:fake:marsh-town", { scope: "Marsh Town" }),
      ],
    },
  ],
  starters: [],
  meterSets: [],
  tools: ["manage_meter", "feat_roll"],
  coreNoteId: "builtin:fake:heart",
  defaultSetting: "crossroads",
  crossSettingScope: "crossroads",
  stepHints: { history: "Where did they grow up?" },
};

const OTHER: BuiltinSystem = {
  id: "other",
  title: "Other",
  description: "",
  packs: [
    {
      id: "other:rules",
      systemId: "other",
      title: "Rules",
      description: "",
      notes: [note("builtin:other:core", { type: "dm_instructions" })],
    },
  ],
  starters: [],
  meterSets: [],
  tools: ["manage_meter", "manage_track"],
};

const lore = (...ids: string[]): StoryLore[] =>
  ids.map((id) => ({ title: id, content: "c", type: "lore", libraryNoteId: id }) as unknown as StoryLore);

function story(ids: string[], extra: Partial<StoryData> = {}): StoryData {
  return mockStory({ lore: lore(...ids), ...extra });
}

describe("builtinNotes follows the system's own declarations", () => {
  it("keeps up a story holding the system's core, adding its rules and cross-setting notes", () => {
    const s = story(["builtin:fake:heart"]);
    s.systemState = { sessionCount: 0, dedupKeys: [], builtinNotesOffered: [] };
    const added = addMissingBuiltinNotes(s, [FAKE]);
    const ids = s.lore.map((l) => l.libraryNoteId);
    expect(added).toBe(2);
    expect(ids).toContain("builtin:fake:foes");
    expect(ids).toContain("builtin:fake:crossroads");
    expect(ids).not.toContain("builtin:fake:marsh-town"); // a place note is not pushed
    expect(s.systemState?.systemId).toBe("fake");
  });

  it("does nothing for a story holding another note but not the core", () => {
    const s = story(["builtin:fake:foes"]);
    const before = JSON.stringify(s);
    expect(addMissingBuiltinNotes(s, [FAKE])).toBe(0);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("an unset setting means the system's default; another setting gets no cross notes", () => {
    expect(pushedBuiltinNotes(FAKE).map((n) => n.id)).toContain("builtin:fake:crossroads");
    expect(pushedBuiltinNotes(FAKE, "crossroads").map((n) => n.id)).toContain("builtin:fake:crossroads");
    expect(pushedBuiltinNotes(FAKE, "elsewhere").map((n) => n.id)).not.toContain("builtin:fake:crossroads");
    expect(pushedBuiltinNotes(FAKE, "elsewhere").map((n) => n.id)).toContain("builtin:fake:foes");
  });

  it("seeds a story's offered list the same way", () => {
    const s = story(["builtin:fake:heart"]);
    seedBuiltinNotesOffered(s, [FAKE]);
    expect(s.systemState?.builtinNotesOffered).toEqual(
      expect.arrayContaining(["builtin:fake:heart", "builtin:fake:foes", "builtin:fake:crossroads"]),
    );
    expect(addMissingBuiltinNotes(s, [FAKE])).toBe(0);
  });
});

describe("a system's step hints", () => {
  it("replace the shared hint for that step only", () => {
    BUILTIN_SYSTEMS.push(FAKE);
    try {
      const s = story(["builtin:fake:heart"], {
        systemState: { systemId: "fake", sessionCount: 0, dedupKeys: [] },
      });
      const steps = getCreationSteps(s);
      expect(steps.find((x) => x.id === "history")?.hint).toBe("Where did they grow up?");
      const plain = getCreationSteps(mockStory());
      expect(plain.find((x) => x.id === "history")?.hint).not.toBe("Where did they grow up?");
      expect(steps.find((x) => x.id === "drives")?.hint).toBe(plain.find((x) => x.id === "drives")?.hint);
    } finally {
      BUILTIN_SYSTEMS.splice(BUILTIN_SYSTEMS.indexOf(FAKE), 1);
    }
  });
});

describe("resolveSystem: the recorded system and its tools", () => {
  const SYSTEMS = [FAKE, OTHER];

  it("a recorded id wins over the notes the story holds", () => {
    const r = resolveSystem(
      { lore: lore("builtin:fake:heart"), systemState: { systemId: "other", sessionCount: 0, dedupKeys: [] } },
      SYSTEMS,
    );
    expect(r.system?.id).toBe("other");
    expect(r.tools).toEqual(["manage_meter", "manage_track"]);
  });

  it("an unknown recorded id falls back to the notes", () => {
    const r = resolveSystem(
      { lore: lore("builtin:fake:heart"), systemState: { systemId: "gone", sessionCount: 0, dedupKeys: [] } },
      SYSTEMS,
    );
    expect(r.system?.id).toBe("fake");
  });

  it("an old save derives its system and records it once", () => {
    const s = { lore: lore("builtin:other:core"), systemState: undefined } as Pick<StoryData, "lore" | "systemState">;
    expect(recordSystemId(s, SYSTEMS)).toBe(true);
    expect(s.systemState?.systemId).toBe("other");
    expect(recordSystemId(s, SYSTEMS)).toBe(false);
    // once recorded, deleting the notes does not switch the system
    s.lore = [];
    expect(resolveSystem(s, SYSTEMS).system?.id).toBe("other");
  });

  it("records nothing when no system resolves", () => {
    const s = { lore: lore("local:x"), systemState: undefined } as Pick<StoryData, "lore" | "systemState">;
    expect(recordSystemId(s, SYSTEMS)).toBe(false);
    expect(s.systemState).toBeUndefined();
  });

  it("two systems' cores with no record resolve to the first in the registry", () => {
    const r = resolveSystem({ lore: lore("builtin:other:core", "builtin:fake:heart") }, SYSTEMS);
    expect(r.system?.id).toBe("fake");
    const real = resolveSystem({ lore: lore("builtin:other:core", "builtin:blood-and-bone:core") });
    expect(real.system?.id).toBe("blood-and-bone");
  });

  it("Blood & Bone is offered exactly its four tools", () => {
    const bb = BUILTIN_SYSTEMS.find((x) => x.id === "blood-and-bone")!;
    expect(bb.tools).toEqual(["manage_meter", "manage_track", "end_session", "action_roll"]);
    expect(resolveSystem({ lore: lore("builtin:blood-and-bone:core") }).tools).toEqual(bb.tools);
  });

  it("the legacy tools-on switch with no system gives Blood & Bone's four", () => {
    const r = resolveSystem(
      { lore: [], systemState: { usesSystemTools: true, sessionCount: 0, dedupKeys: [] } },
      SYSTEMS,
    );
    expect(r.tools).toEqual(SYSTEM_TOOL_NAMES);
  });

  it("tools off gives none, even with a system", () => {
    const r = resolveSystem(
      { lore: lore("builtin:other:core"), systemState: { usesSystemTools: false, sessionCount: 0, dedupKeys: [] } },
      SYSTEMS,
    );
    expect(r.system?.id).toBe("other");
    expect(r.tools).toEqual([]);
  });

  it("allSystemToolNames is the union over a registry, once each", () => {
    expect(allSystemToolNames(SYSTEMS)).toEqual(["manage_meter", "feat_roll", "manage_track"]);
  });
});

describe("the GM is offered the resolved system's tools, the same every turn", () => {
  beforeAll(async () => {
    await warmTokenizer();
  });

  const names = (s: StoryData, userChoice: string) =>
    (buildGMStagePrompt({ storyData: s, userChoice }).tools as { function: { name: string } }[]).map(
      (t) => t.function.name,
    );

  it("offers a second system's tools, and is identical across two turns", () => {
    BUILTIN_SYSTEMS.push(FAKE);
    try {
      const s = {
        story_name: "T",
        scene: { parts: [] },
        lore: [],
        memory: [],
        npcs: [],
        systemState: { systemId: "fake", sessionCount: 0, dedupKeys: [] },
      } as unknown as StoryData;
      const first = names(s, "I go");
      const later = names(
        { ...s, scene: { parts: [{ id: "p1", text: "x" }] } } as unknown as StoryData,
        "I draw my sword",
      );
      expect(first).toContain("feat_roll");
      expect(first).toContain("manage_meter");
      expect(first).not.toContain("action_roll");
      expect(first).not.toContain("manage_track");
      expect(later).toEqual(first);
    } finally {
      BUILTIN_SYSTEMS.splice(BUILTIN_SYSTEMS.indexOf(FAKE), 1);
    }
  });
});
