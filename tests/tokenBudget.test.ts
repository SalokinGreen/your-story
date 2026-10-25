/**
 * Token-savings measurements (docs/token-savings-design.md section 2), on the
 * deterministic fixture in helpers/turnHarness.ts. Each number is a test so a
 * slice's effect is checked, not claimed. The "was" figures are what the same
 * fixture measured on master before PR T1 (5dfea85); later slices tighten the
 * assertions marked "T2".
 *
 * The fixture's turns carry a 120-token <thinking> each, so even the prose-only
 * history was sent at 1.9x what a prose-counting window saw before T1.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  buildGMStagePrompt,
  renderThreadsSection,
  THREADS_SECTION_CAP_TOKENS,
  THREAD_DESCRIPTION_CAP_CHARS,
} from "@/app/misc/ai_staged";
import { estimateTokens } from "@/app/misc/tokenCounter";
import {
  DESIGN_FIXTURE,
  appendTurn,
  buildFixtureStory,
  designTurnRounds,
  historyTokensOf,
  proseWindowTokens,
  runRecordedTurnWithResult,
  sharedPrefixTokens,
  warmTokenizer,
} from "./helpers/turnHarness";

const LONG = 120_000;

beforeAll(async () => {
  await warmTokenizer();
});

function historyRatio(readEveryNthTurn: number | null): number {
  const story = buildFixtureStory({ ...DESIGN_FIXTURE, readEveryNthTurn });
  const { messages } = buildGMStagePrompt({ storyData: story, userChoice: "I go" });
  return historyTokensOf(messages) / proseWindowTokens(story.scene.parts);
}

describe("the history the GM is sent, against what a prose-counting window saw", () => {
  // was 1.91, 4.98 and 14.22 (the design measured 1.0, 3.5 and 11 without the fixture's thinking)
  it("is close to 1x with no reads in history", () => {
    expect(historyRatio(null)).toBeLessThan(1.2);
  }, LONG);

  it("stays under 1.3x with a note read every fourth turn", () => {
    expect(historyRatio(4)).toBeLessThan(1.3);
  }, LONG);

  it("stays under 1.7x with a note read every turn", () => {
    expect(historyRatio(1)).toBeLessThan(1.7);
  }, LONG);
});

describe("the design's four-round turn", () => {
  it("grows each round by the note it just read, from a smaller start", async () => {
    const story = buildFixtureStory(DESIGN_FIXTURE);
    const { requests } = await runRecordedTurnWithResult(story, {
      rounds: designTurnRounds(),
    });
    expect(requests).toHaveLength(4);
    // was 40,519 / 42,631 / 44,750 / 46,863 (messages + tool list)
    expect(requests[0].tokens).toBeLessThan(32_000);
    for (let i = 1; i < 4; i++) {
      const growth = requests[i].tokens - requests[i - 1].tokens;
      expect(growth).toBeGreaterThan(2000); // the 2k note, plus the call that asked for it
      expect(growth).toBeLessThan(2400);
    }
  }, LONG);

  it("shares round 1's prefix with round 2, and the whole stable prefix with the next turn", async () => {
    const story = buildFixtureStory(DESIGN_FIXTURE);
    const first = await runRecordedTurnWithResult(story, {
      input: "I go left",
      rounds: designTurnRounds(),
    });
    appendTurn(story, first.input, first.scenePart);
    const second = await runRecordedTurnWithResult(story, {
      input: "I go right",
      rounds: designTurnRounds(),
    });

    const within = sharedPrefixTokens(
      first.requests[0].body.messages,
      first.requests[1].body.messages,
    );
    expect(within).toBeGreaterThan(10_000);

    // T2 (decision 91): was 0, because the first difference sat inside the
    // system prompt (the per-turn GM tip). Now the system prompt, the stable
    // block and all of the previous turn's history are shared; only the live
    // block and the action, then the new history tail, differ.
    const across = sharedPrefixTokens(
      first.requests[0].body.messages,
      second.requests[0].body.messages,
    );
    const firstRound = first.requests[0].messageTokens;
    console.log(
      `[tokenBudget] consecutive turns share ${across} of ${firstRound} message tokens`,
    );
    // Everything but the live block and the action (about 3.4k of 14.6k tokens here).
    expect(across).toBeGreaterThan(10_000);
    expect(across).toBeGreaterThan(firstRound * 0.7);
  }, LONG);

  it("keeps everything per-turn out of the system message", async () => {
    // The fixture's long replies trigger the pacing note, and the GM tip is
    // always there; the Observer-style notes are covered by the unit test in
    // aiStaged.stablePrefix.test.ts.
    const story = buildFixtureStory(DESIGN_FIXTURE);
    const { requests } = await runRecordedTurnWithResult(story, {
      rounds: designTurnRounds(),
    });
    const system = requests[0].body.messages[0].content as string;
    const lastUser = [...requests[0].body.messages]
      .reverse()
      .find((m: { role: string }) => m.role === "user").content as string;
    for (const marker of ["PACING FEEDBACK", "GM Advice for this scene", "Oracle State"]) {
      expect(system).not.toContain(marker);
    }
    // ...and they sit next to the action instead.
    expect(lastUser).toContain("PACING FEEDBACK");
    expect(lastUser).toContain("GM Advice for this scene");
    expect(lastUser).toContain("> I keep walking.");
  }, LONG);

  it("sends the same story key on every GM round, and none without a story id", async () => {
    const story = buildFixtureStory({ ...DESIGN_FIXTURE, priorTurns: 2 });
    const keyed = await runRecordedTurnWithResult(story, {
      rounds: designTurnRounds(),
      options: { storyId: "story-abc" },
    });
    for (const r of keyed.requests) expect(r.body.cacheKey).toBe("ys:story-abc:gm");
    const unkeyed = await runRecordedTurnWithResult(story, { rounds: designTurnRounds() });
    for (const r of unkeyed.requests) expect(r.body.cacheKey).toBeUndefined();
  }, LONG);
});

describe("the active-threads section", () => {
  it("stays under its cap with fifteen long threads, main first, and counts what it left out", () => {
    const sentence = "The harbour watch keeps a second ledger that nobody is meant to see. ";
    const threads = Array.from({ length: 15 }, (_, i) => ({
      id: `t${i}`,
      title: `Thread ${i}`,
      description: sentence.repeat(60),
      status: "active" as const,
      createdAt: 0,
      priority: (i === 14 ? "main" : "background") as "main" | "background",
    }));
    const section = renderThreadsSection(threads);
    expect(estimateTokens(section)).toBeLessThanOrEqual(THREADS_SECTION_CAP_TOKENS);
    const lines = section.split("\n");
    expect(lines[1]).toContain("[main] Thread 14");
    expect(lines[1]).toContain("(cut for length)");
    expect(lines[1]).toContain("ledger that nobody is meant to see. …");
    expect(lines[1].length).toBeLessThan(THREAD_DESCRIPTION_CAP_CHARS + 80);
    const shown = lines.filter((l) => /^- \[/.test(l)).length;
    const overflow = section.match(/… (\d+) more active threads? not shown/);
    expect(shown + (overflow ? Number(overflow[1]) : 0)).toBe(15);
  });

  it("keeps a short description whole", () => {
    const out = renderThreadsSection([
      { id: "a", title: "A", description: "Short one.", status: "active", priority: "side", createdAt: 0 },
    ]);
    expect(out).toContain("- [side] A: Short one.");
    expect(out).not.toContain("cut for length");
  });
});
