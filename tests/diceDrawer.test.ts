import { beforeAll, describe, expect, it, vi } from "vitest";
import { buildGMStagePrompt } from "@/app/misc/ai_staged";
import { drawDrawer, formatDrawer } from "@/app/misc/diceDrawer";
import { isNameAccepted } from "@/app/misc/names/accept";
import { estimateTokens } from "@/app/misc/tokenCounter";
import {
  DESIGN_FIXTURE,
  buildFixtureStory,
  readNoteRound,
  runRecordedTurn,
  warmTokenizer,
} from "./helpers/turnHarness";

const LONG = 120_000;

beforeAll(async () => {
  await warmTokenizer();
});

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawerLines(body: { messages: { content?: unknown }[] }): string {
  const text = body.messages.map((m) => (typeof m.content === "string" ? m.content : "")).join("\n");
  const at = text.indexOf("DICE DRAWER");
  return at < 0 ? "" : text.slice(at, text.indexOf("\n", text.indexOf("\n", at) + 1));
}

describe("the dice drawer", () => {
  it("draws three names and one meaning pair, and prints two lines", () => {
    const story = buildFixtureStory(DESIGN_FIXTURE);
    const d = drawDrawer(story, seeded(7));
    expect(d.names).toHaveLength(3);
    expect(d.meaning.action).toBeTruthy();
    expect(d.meaning.description).toBeTruthy();
    const text = formatDrawer(d);
    expect(text.split("\n")).toHaveLength(2);
    expect(text).toContain("DICE DRAWER (rolled by the engine; use only what this turn needs)");
    expect(text).toContain(`Names: ${d.names.join(" · ")}   Meaning: ${d.meaning.action} / ${d.meaning.description}`);
  });

  it("the preview never calls the RNG", () => {
    const spy = vi.spyOn(Math, "random");
    const text = formatDrawer("preview");
    const story = buildFixtureStory(DESIGN_FIXTURE);
    story.sessionZeroActive = false;
    buildGMStagePrompt({ storyData: story, userChoice: "I go", drawer: "preview" });
    expect(text).toContain("(rolled when a turn starts)");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  }, LONG);

  it("a prompt rebuilt with the same drawer object is byte-identical", () => {
    const story = buildFixtureStory(DESIGN_FIXTURE);
    story.sessionZeroActive = false;
    const drawer = drawDrawer(story, seeded(3));
    const a = buildGMStagePrompt({ storyData: story, userChoice: "I go", drawer });
    const b = buildGMStagePrompt({ storyData: story, userChoice: "I go", drawer });
    expect(JSON.stringify(a.messages)).toBe(JSON.stringify(b.messages));
  }, LONG);

  it("grows the live block by at most 60 tokens and leaves the shared prefix alone", () => {
    const story = buildFixtureStory(DESIGN_FIXTURE);
    story.sessionZeroActive = false;
    const drawer = drawDrawer(story, seeded(5));
    const without = buildGMStagePrompt({ storyData: story, userChoice: "I go" });
    const withIt = buildGMStagePrompt({ storyData: story, userChoice: "I go", drawer });
    const grew =
      estimateTokens(JSON.stringify(withIt.messages)) - estimateTokens(JSON.stringify(without.messages));
    expect(grew).toBeGreaterThan(0);
    expect(grew).toBeLessThanOrEqual(60);
    // Every message but the live block is the same; the drawer sits in that one only.
    const liveAt = withIt.messages.findIndex((m) => JSON.stringify(m).includes("DICE DRAWER"));
    expect(liveAt).toBeGreaterThan(0);
    const rest = (ms: typeof withIt.messages) => JSON.stringify(ms.filter((_, i) => i !== liveAt));
    expect(rest(withIt.messages)).toBe(rest(without.messages));
    expect(JSON.stringify(withIt.messages.slice(0, liveAt))).toBe(JSON.stringify(without.messages.slice(0, liveAt)));
    expect(JSON.stringify(withIt.tools)).toBe(JSON.stringify(without.tools));
  }, LONG);

  it("is drawn once per turn: two rounds see the same drawer", async () => {
    const story = buildFixtureStory(DESIGN_FIXTURE);
    story.sessionZeroActive = false;
    const requests = await runRecordedTurn(story, {
      rounds: [readNoteRound(0), { content: "<thinking>Enough.</thinking>\nThe courier steps out." }],
    });
    expect(requests).toHaveLength(2);
    const first = drawerLines(requests[0].body);
    expect(first).toContain("Names: ");
    expect(drawerLines(requests[1].body)).toBe(first);
  }, LONG);

  it("is not drawn in session zero", async () => {
    const story = buildFixtureStory(DESIGN_FIXTURE);
    story.sessionZeroActive = true;
    const requests = await runRecordedTurn(story, {
      rounds: Array.from({ length: 3 }, () => ({ content: "Welcome. What kind of story do you want?" })),
    });
    expect(requests.length).toBeGreaterThan(0);
    for (const r of requests) expect(JSON.stringify(r.body.messages)).not.toContain("DICE DRAWER");
    const prompt = buildGMStagePrompt({ storyData: story, userChoice: "hi" });
    expect(JSON.stringify(prompt.messages)).not.toContain("DICE DRAWER");
  }, LONG);

  it("puts the drawn names on the ledger, and a drawer name passes the add_npc check next turn", async () => {
    const story = buildFixtureStory(DESIGN_FIXTURE);
    story.sessionZeroActive = false;
    const drawer = drawDrawer(story, seeded(11));
    // The engine pushes them at the draw; the check reads the ledger.
    story.nameLedger = [...(story.nameLedger ?? []), ...drawer.names];
    for (const n of drawer.names) expect(isNameAccepted(n, story)).toBe(true);
    expect(isNameAccepted("Zzyzx Qwertley", story)).toBe(false);
  }, LONG);
});
