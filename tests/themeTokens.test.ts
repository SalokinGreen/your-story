import { describe, expect, it } from "vitest";
import { THEME_PRESETS } from "@/app/components/FontSettingsTab";
import { INK, mixRgb, themeTokens } from "@/app/story/themeTokens";

function channels(color: string): [number, number, number] {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(color);
  if (!m) throw new Error(`unparsable colour ${color}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

// WCAG 2.x relative luminance and contrast ratio.
function luminance(color: string): number {
  const [r, g, b] = channels(color).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("themeTokens", () => {
  it("Ink has the design's values", () => {
    expect(themeTokens(INK)).toEqual({
      bg: "#121212",
      surface: "#1c1c1c",
      text: "#ececec",
      muted: "#9a9a9a",
      border: "#2a2a2a",
      accent: "#e8dcc4",
    });
  });

  it("Ink is the first preset", () => {
    expect(THEME_PRESETS[0].id).toBe("ink");
  });

  it("mixRgb accepts hex and rgb() and returns rgb()", () => {
    expect(mixRgb("#000000", "#ffffff", 0.5)).toBe("rgb(128, 128, 128)");
    expect(mixRgb("rgb(0, 0, 0)", "rgb(100, 200, 50)", 0.1)).toBe(
      "rgb(10, 20, 5)",
    );
    expect(mixRgb("#102030", "rgb(16, 32, 48)", 0.7)).toBe("rgb(16, 32, 48)");
  });

  it("derives surface, muted and border when a preset names none", () => {
    const t = themeTokens({
      id: "x",
      name: "X",
      background: "rgb(0, 0, 0)",
      text: "rgb(100, 100, 100)",
      accent: "rgb(1, 2, 3)",
    });
    expect(t.surface).toBe("rgb(6, 6, 6)");
    expect(t.muted).toBe("rgb(62, 62, 62)");
    expect(t.border).toBe("rgb(14, 14, 14)");
  });

  describe.each(THEME_PRESETS.map((p) => [p.name, p] as const))(
    "%s",
    (_name, preset) => {
      const t = themeTokens(preset);
      it("text on bg is at least 7:1", () => {
        expect(contrast(t.text, t.bg)).toBeGreaterThanOrEqual(7);
      });
      it("muted on bg is at least 4.5:1", () => {
        expect(contrast(t.muted, t.bg)).toBeGreaterThanOrEqual(4.5);
      });
      it("accent on bg is at least 3:1", () => {
        expect(contrast(t.accent, t.bg)).toBeGreaterThanOrEqual(3);
      });
    },
  );
});
