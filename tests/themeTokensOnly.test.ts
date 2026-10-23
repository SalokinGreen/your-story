// The tokenising ratchet (docs/whole-app-themes-design.md §3.5): a file that
// has moved to the `ys-*` tokens must not bring a hard-coded colour back. The
// list only grows. Red, green and amber are allowed only as ys-danger,
// ys-success and ys-warning.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..");

/** .tsx files that have moved to the tokens. Each slice appends its own. */
const TOKENISED_TSX: string[] = [
  // slice 1: the foundation and the shared shells
  "app/layout.tsx",
  "app/components/FullScreenView.tsx",
  "app/components/ConfirmDialog.tsx",
  "app/components/LoadingButton.tsx",
  "app/components/Skeleton.tsx",
  "app/components/ModelSelect.tsx",
  "app/components/NotificationContainer.tsx",
  "app/components/FontInitializer.tsx",
  // slice 2: Settings
  "app/components/APIKeysModal.tsx",
  "app/components/AIConfigTab.tsx",
  "app/components/FontSettingsTab.tsx",
  "app/components/TurnCostPanel.tsx",
  "app/components/SamplingSettingsTab.tsx",
  "app/components/ArchitectureSettingsTab.tsx",
  "app/components/SyncTab.tsx",
  "app/components/ImageSettingsTab.tsx",
  "app/components/ClaudeSubscriptionPanel.tsx",
  "app/components/InfoTabs.tsx",
  "app/components/CustomVoiceManager.tsx",
  // slice 3: the story's own sub-pages and what they render through
  "app/story/lore.tsx",
  "app/story/npcs.tsx",
  "app/story/goals.tsx",
  "app/story/menu.tsx",
  "app/story/menu/LoreEditor.tsx",
  "app/story/menu/NPCEditor.tsx",
  "app/story/menu/BasicSettings.tsx",
  "app/story/menu/OnlinePlayEditor.tsx",
  "app/story/menu/GoalEditor.tsx",
  "app/story/menu/CompactStoryModal.tsx",
  "app/story/menu/ThreadsEditor.tsx",
  "app/story/menu/CouchPlayersEditor.tsx",
  "app/story/menu/PartyModeEditor.tsx",
  "app/story/menu/PictureSettings.tsx",
  "app/story/menu/StoryMetaEditor.tsx",
  "app/story/menu/ChatDisplaySettings.tsx",
  "app/story/MetersPanel.tsx",
  "app/story/ContextViewer.tsx",
  "app/story/LogViewer.tsx",
  "app/story/page.tsx",
  "app/story/story.tsx",
  "app/story/StoryTurn.tsx",
  "app/story/StoryHeader.tsx",
  "app/story/StoryMenuSheet.tsx",
  "app/story/NPCReactionToast.tsx",
  "app/components/CombatDisplay.tsx",
  "app/components/SyncIndicator.tsx",
  "app/components/NetStatusBadge.tsx",
  "app/components/ChapterNav.tsx",
  "app/components/LoreImageGenerator.tsx",
  "app/components/StoryImage.tsx",
  "app/components/IconPicker.tsx",
  "app/components/DiceThrowModal.tsx",
  "app/components/ManualRollModal.tsx",
  "app/components/AskQuestionModal.tsx",
  "app/components/PlayerBubbles.tsx",
  "app/components/OOCChatPanel.tsx",
  "app/components/TurnLobbyOverlay.tsx",
  "app/components/PartyLobby.tsx",
  "app/components/PartyTableStrip.tsx",
  "app/components/TTSControls.tsx",
  "app/components/SyncConflictModal.tsx",
  "app/components/ProfilePickerModal.tsx",
  // slice 4: Library and Designer
  "app/components/DraggableScroll.tsx",
  "app/library/AdventuresLibraryTab.tsx",
  "app/library/BuiltinSystemsSection.tsx",
  "app/library/FolderDetailView.tsx",
  "app/library/LibraryHome.tsx",
  "app/library/NotesLibraryTab.tsx",
  "app/library/StoriesLibraryTab.tsx",
  "app/library/page.tsx",
  "app/creator/AdventureInspector.tsx",
  "app/creator/DesignerChat.tsx",
  "app/creator/page.tsx",
  "app/components/LibraryPickerModal.tsx",
  "app/components/NewFolderDialog.tsx",
  "app/components/FolderActionSheet.tsx",
  "app/components/ExportFolderModal.tsx",
  "app/components/JoinGameModal.tsx",
  "app/components/HostGameModal.tsx",
];

/** Stylesheets: no hex colour outside the `:root` token block. */
const TOKENISED_CSS: string[] = ["app/globals.css"];

/**
 * .tsx files that hold a fixed palette or fixed chrome on purpose, with the
 * reason. A region inside a file that is otherwise converted (the picker's
 * swatches in FontSettingsTab.tsx, slice 2) is exempted by keeping the
 * literals in a named constant and listing that file here only if the whole
 * file is a palette; otherwise the swatch lines are the single allowed
 * literals and the slice that converts the file records how it excuses them.
 */
const EXEMPT: Record<string, string> = {
  "app/misc/multiplayer/palette.ts": "player colours are a fixed palette",
  "app/misc/diceColors.ts": "dice material colours are a fixed palette",
  "app/components/GameIcon.tsx":
    "rewrites the icon library's SVG fills to currentColor; its literals are what it matches, not colours it paints",
};

const FAMILIES =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const PREFIXES =
  "bg|text|border|border-[trblxyse]|ring|ring-offset|outline|divide|fill|stroke|from|via|to|decoration|shadow|accent|caret|placeholder|scrollbar-thumb|scrollbar-track|inset-ring";
const FAMILY_CLASS = new RegExp(
  `^(?:${PREFIXES})-(?:${FAMILIES})-(?:\\d{2,3}|950)$`,
);
const BW_CLASS = new RegExp(`^(?:${PREFIXES})-(?:white|black)$`);
const ARBITRARY_COLOUR = new RegExp(
  `^(?:${PREFIXES})-\\[(?:#[0-9a-fA-F]{3,8}|rgba?\\(|hsla?\\()`,
);

/** Splits `hover:dark:bg-x` on the colons outside brackets. */
function splitVariants(token: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of token) {
    if (ch === "[" || ch === "(") depth++;
    if (ch === "]" || ch === ")") depth--;
    if (ch === ":" && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return parts;
}

/** Why a class-like token is a hard-coded colour, or null when it is fine. */
function classProblem(token: string): string | null {
  const parts = splitVariants(token);
  if (parts.slice(0, -1).includes("dark")) return "dark: variant";
  let base = parts[parts.length - 1].replace(/^!/, "").replace(/^-/, "");
  // Drop an opacity modifier: bg-red-500/50, bg-white/[0.03]
  base = base.replace(/\/(?:\d+|\[[^\]]*\])$/, "");
  if (FAMILY_CLASS.test(base)) return "palette colour";
  if (BW_CLASS.test(base)) return "black or white";
  if (ARBITRARY_COLOUR.test(base)) return "arbitrary colour";
  return null;
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[\s;{}(,])\/\/.*$/gm, "$1");
}

/** Every string literal and template piece in the source, each its own pass so a stray apostrophe in JSX text cannot hide a real string. */
function stringLiterals(src: string): string[] {
  const out: string[] = [];
  for (const re of [/"([^"\n]*)"/g, /'([^'\n]*)'/g, /`([^`]*)`/g]) {
    for (const m of src.matchAll(re)) out.push(m[1]);
  }
  return out;
}

const NEUTRAL_PAINT = /^(?:none|currentColor|transparent|inherit|initial|unset)$|^url\(|^var\(/;
const COLOUR_VALUE = /^(?:#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\()/;

/** Every hard-coded colour in a .tsx source, as short messages. */
export function colourProblems(source: string): string[] {
  const src = stripComments(source);
  const problems: string[] = [];

  for (const literal of stringLiterals(src)) {
    for (const token of literal.split(/\s+/).filter(Boolean)) {
      const p = classProblem(token);
      if (p) problems.push(`${p}: ${token}`);
    }
    if (COLOUR_VALUE.test(literal.trim())) {
      problems.push(`colour literal: ${literal.trim()}`);
    }
  }

  // Inline style colours: style={{ color: "#fff" }}, backgroundColor: `rgb(...)`
  for (const m of src.matchAll(
    /\b(?:color|background|backgroundColor|borderColor|borderTopColor|borderBottomColor|borderLeftColor|borderRightColor|outlineColor|boxShadow|textShadow|caretColor|accentColor)\s*:\s*["'`]?\s*(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\()/g,
  )) {
    problems.push(`inline style colour: ${m[1]}`);
  }

  // SVG paint attributes: fill="#fff", stroke="red"
  for (const m of src.matchAll(/\b(fill|stroke)=["']([^"']+)["']/g)) {
    if (!NEUTRAL_PAINT.test(m[2])) problems.push(`svg ${m[1]}: ${m[2]}`);
  }

  return problems;
}

/** Hex colours in a stylesheet outside the `:root { ... }` block and outside comments. */
export function cssHexProblems(source: string): string[] {
  const css = source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/:root\s*\{[^}]*\}/g, " ");
  return [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(
    (m) => `hex colour outside :root: ${m[0]}`,
  );
}

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf-8");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === "node_modules" || name === ".next") continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx")) {
      out.push(relative(ROOT, full).split("\\").join("/"));
    }
  }
  return out;
}

describe("colourProblems (the detector)", () => {
  it("passes words that only contain a colour family or a prefix", () => {
    expect(colourProblems(`const a = "history"; const b = "grayed out";`)).toEqual(
      [],
    );
    expect(
      colourProblems(`<div className="translate-x-0 animate-slide-in to-ys-bg" />`),
    ).toEqual([]);
    expect(colourProblems(`const c = "text-ys-text bg-ys-surface/50";`)).toEqual(
      [],
    );
  });

  it("passes theme-aware fills, currentColor and commented-out classes", () => {
    expect(colourProblems(`<svg fill="currentColor" stroke="none" />`)).toEqual(
      [],
    );
    expect(colourProblems(`// was bg-gray-800\nconst a = 1;`)).toEqual([]);
    expect(colourProblems(`/* text-white */ const a = 1;`)).toEqual([]);
    expect(
      colourProblems(`<div className="bg-[image:var(--ys-gradient)]" />`),
    ).toEqual([]);
  });

  it("fails a palette class inside cn(), a template branch or a constant", () => {
    expect(colourProblems(`cn("bg-gray-800")`)).toHaveLength(1);
    expect(
      colourProblems("className={`a ${x ? 'border-white/10' : ''}`}"),
    ).toHaveLength(1);
    expect(colourProblems(`const BASE = "px-2 text-blue-300/60";`)).toHaveLength(1);
  });

  it("fails black and white, colour stops, dark: and arbitrary colours", () => {
    expect(colourProblems(`"hover:text-white"`)).toHaveLength(1);
    expect(colourProblems(`"bg-black/60"`)).toHaveLength(1);
    expect(colourProblems(`"from-purple-600 to-pink-600"`)).toHaveLength(2);
    expect(colourProblems(`"dark:bg-ys-surface"`)).toHaveLength(1);
    expect(colourProblems(`"bg-[#0a1628]/95"`)).toHaveLength(1);
    expect(colourProblems(`"text-[rgb(1,2,3)]"`)).toHaveLength(1);
    expect(colourProblems(`"bg-red-500 text-amber-300"`)).toHaveLength(2);
  });

  it("fails inline style colours and SVG paint", () => {
    expect(colourProblems(`<div style={{ color: "#fff" }} />`).length).toBeGreaterThan(
      0,
    );
    expect(
      colourProblems("<div style={{ backgroundColor: `rgb(1, 2, 3)` }} />").length,
    ).toBeGreaterThan(0);
    expect(colourProblems(`<path fill="#ff0000" />`).length).toBeGreaterThan(0);
    expect(colourProblems(`<path stroke="red" />`)).toHaveLength(1);
  });
});

describe("cssHexProblems", () => {
  it("allows hex inside :root and in comments only", () => {
    expect(
      cssHexProblems(":root { --a: #fff; }\n/* #000 */\n.x { color: var(--a); }"),
    ).toEqual([]);
    expect(cssHexProblems(".x { color: #fff; }")).toHaveLength(1);
  });
});

describe("the tokenised files", () => {
  it.each(TOKENISED_TSX)("%s holds no hard-coded colour", (file) => {
    expect(colourProblems(read(file))).toEqual([]);
  });

  it.each(TOKENISED_CSS)("%s holds no hex outside :root", (file) => {
    expect(cssHexProblems(read(file))).toEqual([]);
  });

  it("globals.css has no OS colour-scheme switch and no leftover page vars", () => {
    const css = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, " ");
    expect(css).not.toMatch(/prefers-color-scheme/);
    expect(css).not.toMatch(/--background|--foreground/);
  });

  it("every listed file exists, and none is both listed and exempt", () => {
    for (const f of [...TOKENISED_TSX, ...TOKENISED_CSS]) {
      expect(() => statSync(join(ROOT, f)), f).not.toThrow();
      expect(Object.keys(EXEMPT), f).not.toContain(f);
    }
    for (const f of Object.keys(EXEMPT)) {
      expect(() => statSync(join(ROOT, f)), f).not.toThrow();
    }
  });

  // Un-skip in slice 5, when every screen is listed: a new .tsx file under
  // app/ must then choose, by joining the list or the exempt list.
  it.skip("every .tsx file under app/ is listed or exempt", () => {
    const unlisted = walk(join(ROOT, "app")).filter(
      (f) => !TOKENISED_TSX.includes(f) && !(f in EXEMPT),
    );
    expect(unlisted).toEqual([]);
  });
});
