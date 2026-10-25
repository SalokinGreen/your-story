import { describe, it, expect } from "vitest";
import { resolveSystem, SYSTEM_TOOL_NAMES } from "@/app/misc/systems/resolve";
import {
  BUILTIN_SYSTEMS,
  getBuiltinNote,
  isBuiltinId,
} from "@/app/misc/systems";
import type { BuiltinSystem } from "@/app/misc/systems/types";
import type { StoryLore } from "@/app/misc/structs";

const testSystem: BuiltinSystem = {
  id: "test",
  title: "Test",
  description: "d",
  packs: [
    {
      id: "test:rules",
      systemId: "test",
      title: "Rules",
      description: "",
      notes: [
        { id: "builtin:test:core", title: "Core", type: "dm_instructions", content: "x" },
      ],
    },
  ],
  starters: [],
  meterSets: [{ name: "Set", meters: [{ name: "Stress", min: 0, max: 6, start: 2 }] }],
  endOfSessionReminder: "Dawn.",
};

const lore = (libraryNoteId?: string): StoryLore[] => [
  { id: "1", title: "n", content: "c", type: "lore", libraryNoteId } as unknown as StoryLore,
];

describe("resolveSystem", () => {
  it("is off with no system", () => {
    const r = resolveSystem({ lore: lore("local:abc") }, [testSystem]);
    expect(r.system).toBeUndefined();
    expect(r.usesSystemTools).toBe(false);
    expect(r.meterSets).toEqual([]);
  });

  it("is on, with its sets, when a built-in note id is in the lore", () => {
    const r = resolveSystem({ lore: lore("builtin:test:core") }, [testSystem]);
    expect(r.system?.id).toBe("test");
    expect(r.usesSystemTools).toBe(true);
    expect(r.meterSets[0].name).toBe("Set");
    expect(r.endOfSessionReminder).toBe("Dawn.");
  });

  it("the explicit switch overrides in both directions", () => {
    const off = resolveSystem(
      { lore: lore("builtin:test:core"), systemState: { usesSystemTools: false, sessionCount: 0, dedupKeys: [] } },
      [testSystem],
    );
    expect(off.usesSystemTools).toBe(false);
    expect(off.system?.id).toBe("test");
    const on = resolveSystem(
      { lore: [], systemState: { usesSystemTools: true, sessionCount: 0, dedupKeys: [] } },
      [testSystem],
    );
    expect(on.usesSystemTools).toBe(true);
  });

  it("handles missing lore", () => {
    expect(resolveSystem({ lore: undefined as never, systemState: undefined }).usesSystemTools).toBe(false);
    expect(BUILTIN_SYSTEMS.map((s) => s.id)).toEqual(["blood-and-bone", "fantastic-realms"]);
  });

  it("names the four tools", () => {
    expect(SYSTEM_TOOL_NAMES).toEqual([
      "manage_meter",
      "manage_track",
      "end_session",
      "action_roll",
    ]);
  });
});

describe("registry helpers", () => {
  it("isBuiltinId and getBuiltinNote", () => {
    expect(isBuiltinId("builtin:x")).toBe(true);
    expect(isBuiltinId("local:x")).toBe(false);
    expect(isBuiltinId(undefined)).toBe(false);
    const n = getBuiltinNote("builtin:test:core", [testSystem]);
    expect(n?.packId).toBe("test:rules");
    expect(n?.systemId).toBe("test");
    expect(getBuiltinNote("builtin:nope", [testSystem])).toBeUndefined();
  });
});
