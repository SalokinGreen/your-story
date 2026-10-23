// The colour tokens every screen's chrome reads (`--ys-*` in globals.css). A
// reading theme names three colours; the others are mixed or chosen from them
// unless the preset names its own. `app/misc/themeBootstrap.ts` carries a copy
// of this arithmetic that runs before first paint: change both
// (tests/themeBootstrap.test.ts runs them side by side).

export interface ThemeTokens {
  bg: string;
  surface: string;
  /** A raised or hovered surface: menus, selected rows, inputs on a card. */
  surface2: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  /** Text and icons on an accent fill. */
  onAccent: string;
  danger: string;
  success: string;
  warning: string;
  /** The page-frame gradient (home, Library, site header). */
  gradient: string;
  /** What `color-scheme` on <html> should say, so native controls follow. */
  scheme: "dark" | "light";
}

export interface ThemePreset {
  id: string;
  name: string;
  background: string;
  text: string;
  accent: string;
  surface?: string;
  surface2?: string;
  muted?: string;
  border?: string;
  onAccent?: string;
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
  surface2: "#262626", // what the story screen's hover already used
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

function channelLuminance(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG 2.x relative luminance of a #rrggbb or rgb() colour. */
export function relativeLuminance(color: string): number {
  const [r, g, b] = parseRgb(color);
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

/** WCAG 2.x contrast ratio, 1..21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** True when the preset's background is light (relative luminance over 0.5). */
export function isLightTheme(preset: ThemePreset): boolean {
  return relativeLuminance(preset.background) > 0.5;
}

const NEAR_BLACK = "#111111";
const NEAR_WHITE = "#fafafa";

/** bg or text, whichever contrasts more with the accent; near-black or near-white when neither reaches 4.5:1. */
function deriveOnAccent(preset: ThemePreset): string {
  const best =
    contrastRatio(preset.background, preset.accent) >=
    contrastRatio(preset.text, preset.accent)
      ? preset.background
      : preset.text;
  if (contrastRatio(best, preset.accent) >= 4.5) return best;
  return contrastRatio(NEAR_BLACK, preset.accent) >=
    contrastRatio(NEAR_WHITE, preset.accent)
    ? NEAR_BLACK
    : NEAR_WHITE;
}

// Meaning colours: red, green and amber at a lightness that reads on the
// theme's background (tests/themeTokens.test.ts holds the contrast).
export const MEANING_DARK = {
  danger: "#fca5a5",
  success: "#4ade80",
  warning: "#fbbf24",
};
export const MEANING_LIGHT = {
  danger: "#b91c1c",
  success: "#166534",
  warning: "#92400e",
};

/** The tokens for a preset: its own named colours when it has them, else mixed or chosen from bg, text and accent. */
export function themeTokens(preset: ThemePreset): ThemeTokens {
  const light = isLightTheme(preset);
  const meaning = light ? MEANING_LIGHT : MEANING_DARK;
  return {
    bg: preset.background,
    text: preset.text,
    accent: preset.accent,
    surface: preset.surface ?? mixRgb(preset.background, preset.text, 0.06),
    surface2: preset.surface2 ?? mixRgb(preset.background, preset.text, 0.11),
    muted: preset.muted ?? mixRgb(preset.text, preset.background, 0.38),
    border: preset.border ?? mixRgb(preset.background, preset.text, 0.14),
    onAccent: preset.onAccent ?? deriveOnAccent(preset),
    danger: meaning.danger,
    success: meaning.success,
    warning: meaning.warning,
    gradient: `linear-gradient(160deg, ${preset.background}, ${mixRgb(
      preset.background,
      preset.accent,
      0.07,
    )})`,
    scheme: light ? "light" : "dark",
  };
}

// The themes a player can pick. Ink is first and the default.
export const THEME_PRESETS: ThemePreset[] = [
  INK,
  {
    id: "default",
    name: "Ocean Blue",
    background: "rgb(23, 37, 84)", // blue-950
    text: "rgb(239, 246, 255)", // blue-50
    accent: "rgb(59, 130, 246)", // blue-500
    muted: "rgb(174, 183, 204)", // derived mix is 4.4:1 on surface-2
  },
  {
    id: "sepia",
    name: "Sepia",
    background: "rgb(68, 52, 35)",
    text: "rgb(245, 235, 220)",
    accent: "rgb(194, 154, 108)",
    muted: "rgb(205, 190, 168)", // derived mix is 4.2:1 on surface
  },
  {
    id: "dark",
    name: "Pure Dark",
    background: "rgb(17, 17, 17)",
    text: "rgb(229, 229, 229)",
    accent: "rgb(168, 162, 158)",
  },
  {
    id: "paper",
    name: "Paper White",
    background: "rgb(250, 250, 248)",
    text: "rgb(41, 37, 36)",
    accent: "rgb(87, 83, 78)",
    muted: "rgb(100, 96, 92)", // derived mix is 4.3:1; this is about 6:1
  },
  {
    id: "forest",
    name: "Forest",
    background: "rgb(20, 30, 22)",
    text: "rgb(220, 237, 222)",
    accent: "rgb(74, 124, 89)",
  },
  {
    id: "sunset",
    name: "Sunset",
    background: "rgb(45, 25, 30)",
    text: "rgb(255, 235, 230)",
    accent: "rgb(220, 120, 95)",
  },
  {
    id: "nord",
    name: "Nord",
    background: "rgb(46, 52, 64)",
    text: "rgb(236, 239, 244)",
    accent: "rgb(136, 192, 208)",
    muted: "rgb(190, 198, 212)", // derived mix is 4.4:1 on surface
  },
  {
    id: "solarized",
    name: "Solarized Dark",
    background: "rgb(0, 43, 54)",
    text: "rgb(253, 246, 227)",
    accent: "rgb(38, 139, 210)",
  },
];

/** The preset a saved theme id names; Ink when it is missing or unknown. */
export function findThemePreset(id: string | null | undefined): ThemePreset {
  return THEME_PRESETS.find((t) => t.id === id) ?? THEME_PRESETS[0];
}

/** Every CSS custom property a theme sets on <html>: the tokens, then the three older --story-* colours a synced older device may still read. */
export function themeVarEntries(preset: ThemePreset): [string, string][] {
  const t = themeTokens(preset);
  return [
    ["--ys-bg", t.bg],
    ["--ys-surface", t.surface],
    ["--ys-surface-2", t.surface2],
    ["--ys-text", t.text],
    ["--ys-muted", t.muted],
    ["--ys-border", t.border],
    ["--ys-accent", t.accent],
    ["--ys-on-accent", t.onAccent],
    ["--ys-danger", t.danger],
    ["--ys-success", t.success],
    ["--ys-warning", t.warning],
    ["--ys-gradient", t.gradient],
    ["--story-bg-color", preset.background],
    ["--story-text-color", preset.text],
    ["--story-accent-color", preset.accent],
  ];
}

/** Paint a theme: the tokens, `color-scheme` on <html> and the `theme-color` meta (the phone's status bar). */
export function applyThemeVars(preset: ThemePreset): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const [name, value] of themeVarEntries(preset)) {
    root.style.setProperty(name, value);
  }
  root.style.setProperty("color-scheme", themeTokens(preset).scheme);
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", preset.background);
}
