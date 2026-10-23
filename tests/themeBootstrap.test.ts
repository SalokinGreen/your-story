import { describe, expect, it } from "vitest";
import { THEME_BOOTSTRAP_SCRIPT } from "@/app/misc/themeBootstrap";
import {
  INK,
  THEME_PRESETS,
  themeTokens,
  themeVarEntries,
} from "@/app/story/themeTokens";

// Runs the script against a fake document and localStorage and returns what
// it set on <html>.
function run(storage: unknown): Record<string, string> {
  const set: Record<string, string> = {};
  const fakeDocument = {
    documentElement: {
      style: {
        setProperty: (k: string, v: string) => {
          set[k] = v;
        },
      },
    },
  };
  new Function("document", "localStorage", THEME_BOOTSTRAP_SCRIPT)(
    fakeDocument,
    storage,
  );
  return set;
}

function expected(preset: (typeof THEME_PRESETS)[number]) {
  return {
    ...Object.fromEntries(themeVarEntries(preset)),
    "color-scheme": themeTokens(preset).scheme,
  };
}

const storageWith = (value: string | null) => ({
  getItem: (k: string) => (k === "storyTheme" ? value : null),
});

describe("theme bootstrap script", () => {
  it.each(THEME_PRESETS.map((p) => [p.name, p] as const))(
    "sets exactly themeTokens() for %s",
    (_name, preset) => {
      expect(run(storageWith(preset.id))).toEqual(expected(preset));
    },
  );

  it("is Ink when nothing is saved", () => {
    expect(run(storageWith(null))).toEqual(expected(INK));
  });

  it("is Ink for an unknown or corrupt saved value", () => {
    expect(run(storageWith("no-such-theme"))).toEqual(expected(INK));
    expect(run(storageWith("{not json"))).toEqual(expected(INK));
    expect(run(storageWith(""))).toEqual(expected(INK));
  });

  it("is Ink when localStorage throws", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(run(throwing)).toEqual(expected(INK));
  });

  it("is Ink when localStorage is not there at all", () => {
    expect(run(undefined)).toEqual(expected(INK));
  });

  it("is plain ES5-style text that cannot close its own script tag", () => {
    expect(THEME_BOOTSTRAP_SCRIPT).not.toContain("</");
    expect(THEME_BOOTSTRAP_SCRIPT).not.toContain("=>");
  });
});
