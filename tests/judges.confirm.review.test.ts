/**
 * The engine review of judge layer v2 slice 3: the fix plan read leniently where
 * a model varies and strictly where it must not, and the re-check that excuses
 * what the draft already had.
 */
import { describe, it, expect } from "vitest";
import {
  PROSE_SEPARATOR,
  parseFixPlan,
  planFollowed,
  recheckRewrite,
} from "@/app/misc/judges/rewritePlan";
import { emptyCampaign } from "@/app/misc/campaign/types";
import type { StoryData } from "@/app/misc/structs";

const SECRET = "The warden killed the clerk";

describe("the fix plan", () => {
  const original = "Marta sets the lamp down. The warden locks the gate.";
  const plan = `[{"span":"Marta sets the lamp down","problem":"x","replacement":"y"}]`;
  it("rejects a reply with a second separator line", () => {
    const r = parseFixPlan(`${plan}\n${PROSE_SEPARATOR}\nProse.\n${PROSE_SEPARATOR}\nMore.`, original);
    expect(r).toEqual({ ok: false, reason: "the reply has more than one prose separator" });
  });
  it("accepts a bold separator and words before the plan", () => {
    const r = parseFixPlan(
      `Here is my plan:\n\`\`\`json\n${plan}\n\`\`\`\n**${PROSE_SEPARATOR}**\nProse.`,
      original,
    );
    expect(r.ok).toBe(true);
  });
  it("reads a span the way a judge's quote is read: ellipsis, curly quotes, emphasis", () => {
    const text = "She said, “Marta sets *the lamp* down” and left. The warden locks the gate.";
    const r = parseFixPlan(
      `[{"span":"Marta sets … down","problem":"x","replacement":""},{"span":"warden locks","problem":"x","replacement":""}]\n${PROSE_SEPARATOR}\nProse.`,
      text,
    );
    expect(r.ok).toBe(true);
  });
  it("still rejects a span that is not in the text", () => {
    const r = parseFixPlan(`[{"span":"the moon rises","problem":"x","replacement":""}]\n${PROSE_SEPARATOR}\nProse.`, original);
    expect(r.ok).toBe(false);
  });
  it("passes a plan whose replacement keeps the span, and ignores an ellipsis span", () => {
    expect(
      planFollowed(
        [{ span: "Marta sets the lamp down", problem: "", replacement: "Marta sets the lamp down gently" }],
        "Marta sets the lamp down gently.",
      ),
    ).toEqual({ ok: true });
    expect(
      planFollowed([{ span: "Marta sets ... down", problem: "", replacement: "" }], "Marta sets the lamp down"),
    ).toEqual({ ok: true });
  });
});

describe("the re-check excuses what the draft already had", () => {
  const record = emptyCampaign();
  record.safety = { lines: [{ id: "l1", text: "no harm to children", keywords: ["orphan"] }], veils: [] };
  record.secrets = [
    { id: "s1", title: "T", truth: SECRET, keyPhrases: ["killed the clerk"], revealed: false, clues: [] },
  ];
  const story = { npcs: [], meters: [], campaign: record } as unknown as Pick<
    StoryData,
    "npcs" | "meters" | "campaign"
  >;
  const draft = "The orphan waits. The warden, who killed the clerk, locks the gate.";
  const fixed = "The orphan waits. The warden, who killed the clerk, bars the gate.";
  const run = (fixing?: { line?: boolean; secret?: boolean }) =>
    recheckRewrite({ rewritten: fixed, original: draft, storyBefore: story, storyAfter: story, fixing });
  it("excuses a keyword or phrase the draft had when the finding is about something else", () => {
    expect(run({}).ok).toBe(true);
  });
  it("does not excuse it when the finding is that line or that secret", () => {
    expect(run({ line: true }).ok).toBe(false);
    expect(run({ secret: true }).ok).toBe(false);
  });
  it("still fails a keyword the draft did not have", () => {
    expect(
      recheckRewrite({
        rewritten: fixed,
        original: "The warden locks the gate.",
        storyBefore: story,
        storyAfter: story,
      }).ok,
    ).toBe(false);
  });
});
