/**
 * Limits on always-loaded notes (decision 96, docs/token-savings-design.md 4.5).
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  PINNED_NOTE_WARN_TOKENS,
  PINNED_TOTAL_CAP_TOKENS,
  capPinnedNotes,
  pinnedNoteWarning,
} from "@/app/misc/contextLimits";
import { buildGMStagePrompt, estimateTokens } from "@/app/misc/ai_staged";
import { createEmptyDraft, executeDesignerTool } from "@/app/misc/designer_executor";
import type { LoreType, StoryData, StoryLore } from "@/app/misc/structs";
import { seededText, warmTokenizer } from "./helpers/turnHarness";

vi.setConfig({ testTimeout: 120_000 }); // seededText tokenises as it grows

beforeAll(async () => {
  await warmTokenizer();
});

function note(title: string, tokens: number, type: LoreType = "dm_instructions", seed = 1): StoryLore {
  return {
    title,
    content: seededText(tokens, seed),
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
    type,
    alwaysOn: true,
    enabled: true,
  } as StoryLore;
}

describe("pinnedNoteWarning", () => {
  it("fires just past 3,000 tokens and not at or under it", () => {
    const over = { type: "dm_instructions" as LoreType, content: seededText(3001, 7) };
    expect(estimateTokens(over.content)).toBeGreaterThan(PINNED_NOTE_WARN_TOKENS);
    expect(pinnedNoteWarning(over)).toMatch(/sent to the GM in full every turn/);
    const under = { type: "dm_instructions" as LoreType, content: seededText(2900, 7) };
    expect(estimateTokens(under.content)).toBeLessThanOrEqual(PINNED_NOTE_WARN_TOKENS);
    expect(pinnedNoteWarning(under)).toBeUndefined();
  });

  it("is only for the types the GM prompt sends in full", () => {
    const big = seededText(3500, 3);
    expect(pinnedNoteWarning({ type: "character_sheet", content: big })).toBeDefined();
    expect(pinnedNoteWarning({ type: "gm_plan", content: big })).toBeDefined();
    expect(pinnedNoteWarning({ type: "lore", content: big })).toBeUndefined();
    expect(pinnedNoteWarning({ type: "mechanics", content: big })).toBeUndefined();
  });
});

describe("capPinnedNotes", () => {
  it("changes nothing under the cap", () => {
    const notes = [note("A", 2000, "dm_instructions", 1), note("B", 3000, "character_sheet", 2)];
    const out = capPinnedNotes(notes);
    expect(out.map((n) => n.content)).toEqual(notes.map((n) => n.content));
    expect(out.every((n) => n.cutTokens === 0)).toBe(true);
  });

  it("holds the total at or under the cap and ends each shortened note with its pointer", () => {
    const notes = [
      note("DM Instructions", 9000, "dm_instructions", 1),
      note("Sheet", 2000, "character_sheet", 2),
      note("Campaign Plan", 6000, "gm_plan", 3),
    ];
    const out = capPinnedNotes(notes);
    const total = out.reduce((sum, n) => sum + estimateTokens(n.content), 0);
    expect(total).toBeLessThanOrEqual(PINNED_TOTAL_CAP_TOKENS);
    // the short note is under an equal share, so it keeps everything
    expect(out[1].content).toBe(notes[1].content);
    expect(out[1].cutTokens).toBe(0);
    for (const i of [0, 2]) {
      expect(out[i].cutTokens).toBeGreaterThan(0);
      expect(out[i].content).toMatch(
        new RegExp(`\\[… [\\d,]+ more tokens: read_notes "${notes[i].title}" for the rest\\]$`),
      );
    }
    // the long ones share what the short one left, about equally
    const a = estimateTokens(out[0].content);
    const c = estimateTokens(out[2].content);
    expect(Math.abs(a - c)).toBeLessThan(200);
  });

  it("keeps the front of a shortened note", () => {
    const notes = [note("Long", 14000, "dm_instructions", 4)];
    const out = capPinnedNotes(notes);
    expect(out[0].content.startsWith(notes[0].content.slice(0, 200))).toBe(true);
  });
});

function storyWith(lore: StoryLore[]): StoryData {
  return {
    story_name: "Test",
    scene: { parts: [] },
    lore,
    memory: [],
    npcs: [],
  } as unknown as StoryData;
}

describe("the GM prompt", () => {
  it("sends pinned notes whole under the cap", () => {
    const dm = note("House Rules", 1500, "dm_instructions", 5);
    const { messages } = buildGMStagePrompt({ storyData: storyWith([dm]), userChoice: "go" });
    expect(JSON.stringify(messages)).toContain(dm.content.slice(0, 80));
    expect(JSON.stringify(messages)).not.toContain("more tokens: read_notes");
  });

  it("shortens pinned notes past the cap, with a pointer, and keeps the stored note whole", () => {
    const dm = note("House Rules", 9000, "dm_instructions", 5);
    const plan = note("Campaign Plan", 6000, "gm_plan", 6);
    const before = dm.content;
    const { messages } = buildGMStagePrompt({ storyData: storyWith([dm, plan]), userChoice: "go" });
    const sent = JSON.stringify(messages);
    expect(sent).toContain('more tokens: read_notes \\"House Rules\\" for the rest');
    expect(sent).toContain('more tokens: read_notes \\"Campaign Plan\\" for the rest');
    expect(dm.content).toBe(before);
  });
});

describe("the Designer's write_note", () => {
  function write(content: string): string {
    const { result } = executeDesignerTool(
      {
        id: "c1",
        name: "write_note",
        arguments: { title: "Rules of the House", type: "dm_instructions", content },
      },
      createEmptyDraft(),
    );
    return result.content;
  }

  it("warns when a pinned note passes the line, and stays quiet otherwise", () => {
    expect(write(seededText(3500, 9))).toMatch(/WARNING: .*sent to the GM in full every turn/);
    expect(write(seededText(500, 9))).not.toMatch(/WARNING/);
  });
});
