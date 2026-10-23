// The six colour tokens the story screen's chrome reads (`--ys-*` in
// globals.css). A reading theme names three colours; the other three are
// mixed from them unless the preset names its own.

export interface ThemeTokens {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
}

export interface ThemePreset {
  id: string;
  name: string;
  background: string;
  text: string;
  accent: string;
  surface?: string;
  muted?: string;
  border?: string;
}

/** Id of the theme a player gets when they have never saved one. */
export const DEFAULT_THEME_ID = "ink";

/** Georgia on Windows, macOS and iOS, Noto Serif on Android: nothing bundled. */
export const DEFAULT_READING_FONT = "Georgia, 'Noto Serif', serif";

export const INK: ThemePreset = {
  id: DEFAULT_THEME_ID,
  name: "Ink",
  background: "#121212",
  surface: "#1c1c1c",
  text: "#ececec",
  muted: "#9a9a9a",
  border: "#2a2a2a",
  accent: "#e8dcc4",
};

function parseRgb(color: string): [number, number, number] {
  const c = color.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(c);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(c);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  throw new Error(`Unsupported colour: ${color}`);
}

/** `a` moved `t` (0..1) of the way toward `b`. Accepts #rrggbb and rgb(); returns rgb(). */
export function mixRgb(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseRgb(a);
  const [br, bg, bb] = parseRgb(b);
  const mix = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${mix(ar, br)}, ${mix(ag, bg)}, ${mix(ab, bb)})`;
}

/** The six tokens for a preset: its own surface/muted/border when it names them, else mixed from bg and text. */
export function themeTokens(preset: ThemePreset): ThemeTokens {
  return {
    bg: preset.background,
    text: preset.text,
    accent: preset.accent,
    surface: preset.surface ?? mixRgb(preset.background, preset.text, 0.06),
    muted: preset.muted ?? mixRgb(preset.text, preset.background, 0.38),
    border: preset.border ?? mixRgb(preset.background, preset.text, 0.14),
  };
}
