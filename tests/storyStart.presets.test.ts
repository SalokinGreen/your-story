/**
 * The two decisions a new story makes before the GM is involved (legacy
 * removal slice 1): whether to show the character picker at all, and whether a
 * starting choice's authored opening is inserted directly or sent to the GM.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRESET,
  authoredOpeningForStart,
  buildAdventureWelcome,
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

describe("buildAdventureWelcome (decision 197)", () => {
  const story = { story_name: "Grave Watcher", premise: "A season beside a graveyard." };

  it("names the adventure, gives the premise and points at setup", () => {
    const text = buildAdventureWelcome(story, DEFAULT_PRESET);
    expect(text).toContain("Welcome to **Grave Watcher**.");
    expect(text).toContain("A season beside a graveyard.");
    expect(text).toContain("make your character");
    expect(text).toContain("quick, or step by step");
  });

  it("drops the date a new story's name carries", () => {
    expect(
      buildAdventureWelcome({ ...story, story_name: "Grave Watcher - 10/25/2026" }, DEFAULT_PRESET),
    ).toContain("Welcome to **Grave Watcher**.");
    expect(
      buildAdventureWelcome({ ...story, story_name: "Grave Watcher - 25.10.2026" }, DEFAULT_PRESET),
    ).toContain("Welcome to **Grave Watcher**.");
    expect(
      buildAdventureWelcome({ ...story, story_name: "Grave Watcher - 2026. 10. 25." }, DEFAULT_PRESET),
    ).toContain("Welcome to **Grave Watcher**.");
  });

  it("names a pre-made character", () => {
    expect(buildAdventureWelcome(story, real)).toContain("You'll be playing Mira.");
  });

  it("never carries an authored opening", () => {
    const text = buildAdventureWelcome({ ...story, intro: "The radio wakes you." } as typeof story, DEFAULT_PRESET);
    expect(text).not.toContain("radio");
  });
});

describe("authoredOpeningForStart", () => {
  const part = (content: string) => ({ content, user: false, role: "assistant", imageUrl: "" });
  const welcome = part(buildAdventureWelcome({ story_name: "X", premise: "" }, DEFAULT_PRESET));

  it("returns the intro for a story that began with the welcome", () => {
    expect(
      authoredOpeningForStart({ intro: " Pancakes. ", scene: { parts: [welcome] } } as never),
    ).toBe("Pancakes.");
  });

  it("is null with no intro", () => {
    expect(authoredOpeningForStart({ intro: "", scene: { parts: [welcome] } } as never)).toBeNull();
  });

  // Older saves showed an opening first: the adventure's, or a preset's own.
  it("is null for a story that began with an opening, whichever one", () => {
    for (const first of ["Pancakes.", "A preset's own opening."]) {
      expect(
        authoredOpeningForStart({ intro: "Pancakes.", scene: { parts: [part(first)] } } as never),
      ).toBeNull();
    }
  });
});
