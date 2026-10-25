// The app's validateSubmission (app/misc/feedback.ts) and the Worker's
// parseSubmission (sync-worker/src/feedback.ts) are two copies of one schema
// (docs/feedback-design.md §2). If they drift, the form either refuses what the
// Worker would store or sends what the Worker refuses with a 400. This runs
// one set of cases through both and requires the same verdict.
import { describe, expect, it } from "vitest";
import { validateSubmission } from "@/app/misc/feedback";
import { parseSubmission } from "../sync-worker/src/feedback";

const base = {
  v: 1,
  id: "abcd1234efgh",
  kind: "turn",
  text: "The dawn came too early.",
  app: { version: "0.1.0", platform: "android" },
};
const turn = { playerLine: "I wait.", prose: "The sun rises.", rolls: ["Face Danger: weak hit"], models: ["glm-5.3"] };

const cases: Array<[string, unknown]> = [
  ["minimal", base],
  ["every field", { ...base, systemId: "blood-and-bone", starterId: "builtin:blood-and-bone:grave-watcher", rating: 4, session: 3, turn }],
  ["rating only, empty text", { ...base, text: "", rating: 5 }],
  ["neither rating nor text", { ...base, text: "   " }],
  ["unknown top key", { ...base, contact: "me@example.com" }],
  ["unknown app key", { ...base, app: { ...base.app, device: "x" } }],
  ["unknown turn key", { ...base, turn: { ...turn, reasoning: "secret" } }],
  ["turn missing a field", { ...base, turn: { playerLine: "a", prose: "b", rolls: [] } }],
  ["fractional rating", { ...base, rating: 2.5 }],
  ["rating 0", { ...base, rating: 0 }],
  ["rating 6", { ...base, rating: 6 }],
  ["v 2", { ...base, v: 2 }],
  ["short id", { ...base, id: "abc" }],
  ["id with a space", { ...base, id: "abcd 1234" }],
  ["id at 64", { ...base, id: "a".repeat(64) }],
  ["id at 65", { ...base, id: "a".repeat(65) }],
  ["bad kind", { ...base, kind: "bug" }],
  ["bad platform", { ...base, app: { version: "1", platform: "linux" } }],
  ["empty version", { ...base, app: { version: "", platform: "web" } }],
  ["version at 33", { ...base, app: { version: "1".repeat(33), platform: "web" } }],
  ["text at 2000", { ...base, text: "x".repeat(2000) }],
  ["text at 2001", { ...base, text: "x".repeat(2001) }],
  ["empty systemId", { ...base, systemId: "" }],
  ["systemId at 65", { ...base, systemId: "s".repeat(65) }],
  ["starterId at 129", { ...base, starterId: "s".repeat(129) }],
  ["session 0", { ...base, session: 0 }],
  ["session 10001", { ...base, session: 10_001 }],
  ["session 1.5", { ...base, session: 1.5 }],
  ["prose at 4001", { ...base, turn: { ...turn, prose: "p".repeat(4001) } }],
  ["playerLine at 1001", { ...base, turn: { ...turn, playerLine: "p".repeat(1001) } }],
  ["13 rolls", { ...base, turn: { ...turn, rolls: Array(13).fill("r") } }],
  ["roll at 201", { ...base, turn: { ...turn, rolls: ["r".repeat(201)] } }],
  ["5 models", { ...base, turn: { ...turn, models: Array(5).fill("m") } }],
  ["model at 81", { ...base, turn: { ...turn, models: ["m".repeat(81)] } }],
  ["rolls not strings", { ...base, turn: { ...turn, rolls: [1] } }],
  ["null rating", { ...base, rating: null }],
  ["not an object", "hello"],
  ["an array", [base]],
];

describe("the app and the Worker agree on the feedback schema", () => {
  it.each(cases)("%s", (_name, input) => {
    const worker = parseSubmission(input);
    const app = validateSubmission(input);
    expect(app.ok).toBe(worker.ok);
  });

  it("covers both verdicts", () => {
    const verdicts = new Set(cases.map(([, input]) => parseSubmission(input).ok));
    expect(verdicts).toEqual(new Set([true, false]));
  });
});
