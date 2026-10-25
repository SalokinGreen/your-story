/**
 * The page's "a turn is running" rule (app/story/turnLock.ts, judge-layer
 * design 3.2, Codex finding 2): the lock outlives the stage callbacks that used
 * to release it, so a blocking judge cannot be raced by a second action.
 */
import { describe, it, expect } from "vitest";
import {
  effectiveLoadingStage,
  isTurnLocked,
  shouldHoldNarrationForJudge,
} from "@/app/story/turnLock";
import { cloneDefaultObserverSettings } from "@/app/misc/observer";
import {
  LEGACY_OBSERVER_SETTINGS,
  FLAG_ONLY_OBSERVER_SETTINGS,
} from "./helpers/observerSettings";

describe("isTurnLocked", () => {
  it("stays locked after streaming and the choices stage have both released their own flags", () => {
    // loading is cleared when the first prose arrives; loadingStage when the
    // choices finish. The judge decides after both.
    expect(
      isTurnLocked({ loading: false, loadingStage: null, turnInFlight: true }),
    ).toBe(true);
  });

  it("is open only when nothing is running", () => {
    expect(
      isTurnLocked({ loading: false, loadingStage: null, turnInFlight: false }),
    ).toBe(false);
    expect(
      isTurnLocked({ loading: true, loadingStage: null, turnInFlight: false }),
    ).toBe(true);
    expect(
      isTurnLocked({ loading: false, loadingStage: "choices", turnInFlight: false }),
    ).toBe(true);
  });
});

describe("effectiveLoadingStage", () => {
  it("shows a turn in flight as the story stage once the stages report done", () => {
    expect(effectiveLoadingStage(null, true)).toBe("story");
    expect(effectiveLoadingStage(null, false)).toBeNull();
    expect(effectiveLoadingStage("gm", true)).toBe("gm");
  });
});

describe("shouldHoldNarrationForJudge", () => {
  it("lets read-aloud start at once when every judge may only flag", () => {
    expect(shouldHoldNarrationForJudge(FLAG_ONLY_OBSERVER_SETTINGS)).toBe(false);
  });

  it("holds read-aloud under the defaults, where the prose judges rewrite (decision 220)", () => {
    expect(shouldHoldNarrationForJudge(cloneDefaultObserverSettings())).toBe(true);
  });

  it("holds read-aloud for a judge the player allowed to rewrite", () => {
    expect(shouldHoldNarrationForJudge(LEGACY_OBSERVER_SETTINGS)).toBe(true);
  });
});
