/**
 * The two decisions a new story makes before the GM is involved (legacy
 * removal slice 1): whether to show the character picker at all, and whether a
 * starting choice's authored opening is inserted directly or sent to the GM.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRESET,
  hasPremadeCharacters,
  shouldUseIntroOverride,
} from "@/app/misc/presets";
import type { Preset } from "@/app/misc/structs";

const real: Preset = { ...DEFAULT_PRESET, id: "preset-1", name: "Mira" };

describe("hasPremadeCharacters", () => {
  it("is false with no presets", () => {
    expect(hasPremadeCharacters({})).toBe(false);
    expect(hasPremadeCharacters({ presets: [] })).toBe(false);
  });

  it("is false when the only preset is Custom", () => {
    expect(hasPremadeCharacters({ presets: [DEFAULT_PRESET] })).toBe(false);
  });

  it("is true when one preset is not Custom", () => {
    expect(hasPremadeCharacters({ presets: [real] })).toBe(true);
    expect(hasPremadeCharacters({ presets: [DEFAULT_PRESET, real] })).toBe(true);
  });
});

describe("shouldUseIntroOverride", () => {
  const choice = { text: "Begin", intro_override: "The door opens." };

  it("is true outside session zero when the choice has an opening", () => {
    expect(shouldUseIntroOverride({ sessionZeroActive: false }, choice)).toBe(true);
    expect(shouldUseIntroOverride({}, choice)).toBe(true);
  });

  it("is false during session zero", () => {
    expect(shouldUseIntroOverride({ sessionZeroActive: true }, choice)).toBe(false);
  });

  it("is false for a choice with no opening", () => {
    expect(shouldUseIntroOverride({}, { text: "Begin" })).toBe(false);
    expect(
      shouldUseIntroOverride({}, { text: "Begin", intro_override: "" }),
    ).toBe(false);
  });
});
