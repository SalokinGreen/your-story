import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { measuredPrecision, MEASURED_JUDGES } from "@/app/misc/judges/measured";
import {
  DEFAULT_OBSERVER_SETTINGS,
  JUDGE_DEFAULT_OVERRIDES,
  observerModeOf,
} from "@/app/misc/observer";
import { FLAG_ONLY_PRECISION } from "@/app/misc/judges/evalScore";
import { JUDGE_FLAG_TYPE } from "@/app/misc/judges/combined";
import type { ObserverFlagType } from "@/app/misc/structs";
import { TurnWorkLine } from "@/app/story/StoryTurn";
import report from "@/evals/results.json";

const judgeRow = (judge: string, precision: number | null) => ({
  judge,
  totalRuns: 20,
  major: { precision, recall: 0.5 },
});

describe("measured judge precision (judge layer v2, slice 5)", () => {
  it("reads nothing from an empty, odd or missing summary", () => {
    const odd: unknown[] = [
      undefined,
      null,
      7,
      "x",
      {},
      { modes: "no" },
      { modes: [] },
      { modes: [null, { judges: 3 }] },
    ];
    for (const raw of odd) expect(measuredPrecision(raw)).toEqual({});
  });

  it("maps a judge to its Settings row and prefers the combined form", () => {
    const got = measuredPrecision({
      generatedAt: "2026-10-30T00:00:00Z",
      modes: [
        {
          mode: "combined",
          judges: [judgeRow("agency", 0.9), judgeRow("length", null), judgeRow("bogus", 1)],
        },
        { mode: "split", judges: [judgeRow("agency", 0.4), judgeRow("outcome", 0.6)] },
      ],
    });
    expect(got.player_agency?.precision).toBe(0.9);
    expect(got.outcome_narration_mismatch?.precision).toBe(0.6);
    expect(got.response_length).toBeUndefined();
    expect(got.player_agency?.generatedAt).toBe("2026-10-30T00:00:00Z");
  });

  it("the bundled summary parses, and a judge it says ships flag-only is in the override table", () => {
    expect(report.v).toBe(1);
    for (const [type, m] of Object.entries(MEASURED_JUDGES)) {
      if (m && m.precision < FLAG_ONLY_PRECISION) {
        expect(JUDGE_DEFAULT_OVERRIDES[type as ObserverFlagType]).toBeTruthy();
      }
    }
  });

  it("an overridden judge defaults to Flag", () => {
    for (const type of Object.keys(JUDGE_DEFAULT_OVERRIDES) as ObserverFlagType[]) {
      expect(Object.values(JUDGE_FLAG_TYPE)).toContain(type);
      expect(observerModeOf(DEFAULT_OBSERVER_SETTINGS[type])).toBe("flag");
    }
  });
});

describe("the turn's public notice", () => {
  it("says checked or revised, generically, and nothing while streaming", () => {
    const line = (notice?: "checked" | "revised", streaming = false) =>
      renderToStaticMarkup(createElement(TurnWorkLine, { blocks: [], notice, streaming }));
    expect(line("checked")).toContain("Checked");
    expect(line("revised")).toContain("Revised after a check");
    expect(line(undefined)).toBe("");
    expect(line("checked", true)).not.toContain("Checked");
  });
});
