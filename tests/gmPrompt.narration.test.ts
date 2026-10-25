/**
 * GM prompt plan slice 4 (design 2.7, finding A17): the narration prompt names
 * the grammatical person, says the narrator writes only what the character
 * perceives, and gives the hidden-text excluded case with an invented example.
 * Also: the narration request keeps alternating roles, its stable block is
 * byte-identical from turn to turn, and the behavioural fixture parses and
 * its hidden text never reaches the narration context. No model is called.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildNarrationContext,
  appendToLastUser,
  NARRATOR_SYSTEM_PROMPT,
} from "@/app/misc/campaign/narrationContext";
import { buildStoryContinuationPrompt } from "@/app/misc/ai_staged";
import { parseFixtureText } from "@/app/misc/judges/evalFormat";
import { expectAlternatingRoles } from "./helpers/roles";
import type { StoryData } from "@/app/misc/structs";

describe("the narrator's system message", () => {
  it("names the person, perception and the hidden-text case", () => {
    expect(NARRATOR_SYSTEM_PROMPT).toMatch(/second person/);
    expect(NARRATOR_SYSTEM_PROMPT).toMatch(/"you"/);
    expect(NARRATOR_SYSTEM_PROMPT).toMatch(/only what the player's character perceives/);
    expect(NARRATOR_SYSTEM_PROMPT).toMatch(/Hidden text is never narrated/);
    // An invented example, with the word that must not appear.
    expect(NARRATOR_SYSTEM_PROMPT).toContain("ferryman");
    expect(NARRATOR_SYSTEM_PROMPT).toContain("informer");
  });

  it("lets a style note or the earlier narration set another person", () => {
    expect(NARRATOR_SYSTEM_PROMPT).toMatch(/style note that names another person/);
    expect(NARRATOR_SYSTEM_PROMPT).toMatch(/Earlier in the story/);
  });
});

describe("the continuation prompt", () => {
  it("says the person and perception in narrator mode", () => {
    const p = buildStoryContinuationPrompt("narrator", "medium");
    expect(p).toMatch(/second person/);
    expect(p).toMatch(/only what the character perceives/);
  });

  it("says perception in DM mode, which already names the person", () => {
    const p = buildStoryContinuationPrompt("dm", "medium");
    expect(p).toMatch(/second person/);
    expect(p).toMatch(/only what the character perceives/);
  });
});

function story(lore: StoryData["lore"] = []): StoryData {
  return {
    story_name: "The Lantern Quay",
    premise: "A courier arrives at a river town.",
    player_name: "Wren",
    scene: { parts: [{ content: "The ferry arrives.", imageUrl: "", user: false, role: "assistant" }] },
    lore,
    npcs: [],
  } as unknown as StoryData;
}

describe("the narration request", () => {
  it("alternates roles with the instruction joined into the last user message", () => {
    const ctx = buildNarrationContext({ playerLine: "I wave", results: [] }, story());
    const req = appendToLastUser(ctx, buildStoryContinuationPrompt("narrator", "medium"));
    expectAlternatingRoles(req);
    expect(req[0].role).toBe("system");
  });

  it("keeps the stable block byte-identical across turns", () => {
    const a = buildNarrationContext({ playerLine: "I wave", results: [] }, story());
    const b = buildNarrationContext(
      { playerLine: "I leave", results: [] },
      { ...story(), scene: { parts: [...story().scene.parts, { content: "> I wave", imageUrl: "", user: true, role: "user" }] } },
    );
    expect(a[0].content).toBe(b[0].content);
    expect(a[1].content).toBe(b[1].content);
    expect(a[1].cacheBreakpoint).toBe("prefix");
  });
});

describe("the hidden-note behavioural fixture", () => {
  const text = readFileSync(
    join(process.cwd(), "evals", "generation", "narration-hidden-note-stays-out.json"),
    "utf8",
  );

  it("is a valid generation fixture with the phrases the narration must not hold", () => {
    const parsed = parseFixtureText(text);
    expect(parsed.ok, parsed.ok ? "" : parsed.errors.join("; ")).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.fixture.kind).toBe("generation");
    const expectBlock = parsed.fixture.kind === "generation" ? (parsed.fixture.expect as Record<string, unknown>) : {};
    expect(expectBlock.narrationExcludes).toContain("informer");
  });

  it("builds a narration context with none of the hidden text (free check; the live run is owed)", () => {
    const raw = JSON.parse(text) as { storySnapshot: Record<string, unknown>; playerLine: string; expect: { narrationExcludes: string[] } };
    const snap = raw.storySnapshot as unknown as StoryData;
    const ctx = buildNarrationContext({ playerLine: raw.playerLine, results: [] }, snap);
    const sent = ctx.map((m) => m.content).join("\n").toLowerCase();
    for (const phrase of raw.expect.narrationExcludes) {
      // The invented example in the system message names "informer" on purpose.
      const withoutSystem = ctx.slice(1).map((m) => m.content).join("\n").toLowerCase();
      expect(withoutSystem, phrase).not.toContain(phrase);
    }
    expect(sent).toContain("ferryman");
  });
});
