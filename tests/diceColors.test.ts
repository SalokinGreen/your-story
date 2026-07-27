import { describe, expect, it } from "vitest";
import {
  DIE_TYPE_COLORS,
  SPARE_COLORS,
  colorsForGroups,
} from "@/app/misc/diceColors";

describe("colorsForGroups", () => {
  it("gives each die type its own colour", () => {
    const [d6, d10] = colorsForGroups([
      { sides: 6 },
      { sides: 10 },
    ]);
    expect(d6).toBe(DIE_TYPE_COLORS[6]);
    expect(d10).toBe(DIE_TYPE_COLORS[10]);
    expect(d6).not.toBe(d10);
  });

  it("keeps a die type's colour stable from roll to roll", () => {
    // The point of a per-type palette: a d6 is the same green whether it is
    // thrown alone, alongside d10s, or in a five-pool monstrosity.
    const alone = colorsForGroups([{ sides: 6 }])[0];
    const mixed = colorsForGroups([{ sides: 10 }, { sides: 6 }])[1];
    const crowded = colorsForGroups([
      { sides: 4 },
      { sides: 20 },
      { sides: 6 },
      { sides: 12 },
    ])[2];
    expect(mixed).toBe(alone);
    expect(crowded).toBe(alone);
  });

  it("covers every die type dice-box can render", () => {
    for (const sides of [4, 6, 8, 10, 12, 20, 100]) {
      expect(colorsForGroups([{ sides }])[0]).toBe(DIE_TYPE_COLORS[sides]);
    }
  });

  // An opposed check is two pools of the same die type. They still have to be
  // tellable apart in the tray, so the second one gives up its type colour.
  it("gives two pools of the same type different colours", () => {
    const [first, second] = colorsForGroups([{ sides: 20 }, { sides: 20 }]);
    expect(first).toBe(DIE_TYPE_COLORS[20]);
    expect(second).not.toBe(first);
    expect(SPARE_COLORS).toContain(second);
  });

  it("never repeats a colour within one roll", () => {
    const rolls = [
      [{ sides: 6 }, { sides: 6 }, { sides: 6 }],
      [{ sides: 20 }, { sides: 20 }, { sides: 10 }, { sides: 10 }],
      [{ sides: 4 }, { sides: 6 }, { sides: 8 }, { sides: 10 }, { sides: 12 }, { sides: 20 }, { sides: 100 }],
    ];
    for (const groups of rolls) {
      const colors = colorsForGroups(groups);
      expect(new Set(colors).size).toBe(groups.length);
    }
  });

  it("never hands a duplicate pool a colour another pool in the same roll owns", () => {
    // The d6 comes last, but the duplicate d20 must not take green out from
    // under it.
    const colors = colorsForGroups([{ sides: 20 }, { sides: 20 }, { sides: 6 }]);
    expect(colors[1]).not.toBe(DIE_TYPE_COLORS[6]);
    expect(colors[2]).toBe(DIE_TYPE_COLORS[6]);
  });

  it("returns one colour per pool, in order, and nothing for no pools", () => {
    expect(colorsForGroups([])).toEqual([]);
    expect(colorsForGroups([{ sides: 6 }, { sides: 8 }])).toHaveLength(2);
  });

  it("still returns a colour for a die type with no palette entry", () => {
    // Nothing requests these today (the tray refuses die types dice-box can't
    // render), but a colour of `undefined` would be a silent black die.
    const colors = colorsForGroups([{ sides: 3 }, { sides: 7 }]);
    expect(colors.every((color) => /^#[0-9a-f]{6}$/i.test(color))).toBe(true);
    expect(new Set(colors).size).toBe(2);
  });

  it("keeps returning colours past the end of the palette", () => {
    const groups = Array.from({ length: 20 }, () => ({ sides: 6 }));
    const colors = colorsForGroups(groups);
    expect(colors).toHaveLength(20);
    expect(colors.every((color) => /^#[0-9a-f]{6}$/i.test(color))).toBe(true);
  });

  it("uses colours dice-box can actually parse, all far enough apart to tell apart", () => {
    const palette = [...Object.values(DIE_TYPE_COLORS), ...SPARE_COLORS];
    // dice-box's hexToRGB treats a 3-digit hex as shorthand and an 8-digit one
    // as carrying alpha; plain 6-digit is the only unambiguous form.
    for (const color of palette) expect(color).toMatch(/^#[0-9a-f]{6}$/);

    const rgb = (hex: string) => [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
    for (let i = 0; i < palette.length; i++) {
      for (let j = i + 1; j < palette.length; j++) {
        const [a, b] = [rgb(palette[i]), rgb(palette[j])];
        const distance = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        expect(
          distance,
          `${palette[i]} and ${palette[j]} are too close to tell apart`
        ).toBeGreaterThan(75);
      }
    }
  });
});
