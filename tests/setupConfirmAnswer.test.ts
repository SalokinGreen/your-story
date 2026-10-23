import { describe, expect, it, vi } from "vitest";
import {
  SETUP_APPROVED,
  SETUP_DISMISSED,
  SETUP_STOPPED,
  changesAnswer,
  settleSetupResolver,
} from "@/app/misc/setupConfirmAnswer";
import type { SetupConfirmationAnswer } from "@/app/misc/gmExecutor";

describe("the setup card's answers", () => {
  it("has the three fixed answers", () => {
    expect(SETUP_APPROVED).toEqual({ approved: true });
    expect(SETUP_DISMISSED).toEqual({ dismissed: true });
    expect(SETUP_STOPPED).toEqual({ stopped: true });
  });

  it("builds a changes answer from trimmed text, and none from blank text", () => {
    expect(changesAnswer("  make her older \n")).toEqual({
      approved: false,
      note: "make her older",
    });
    expect(changesAnswer("")).toBeNull();
    expect(changesAnswer("   \n ")).toBeNull();
  });
});

describe("settleSetupResolver", () => {
  it("resolves the pending card once and clears the ref", () => {
    const resolve = vi.fn();
    const ref: { current: ((a: SetupConfirmationAnswer) => void) | null } = {
      current: resolve,
    };
    expect(settleSetupResolver(ref, SETUP_STOPPED)).toBe(true);
    expect(resolve).toHaveBeenCalledWith({ stopped: true });
    expect(ref.current).toBeNull();
    // Stop pressed again, or a late button: nothing waits, nothing happens.
    expect(settleSetupResolver(ref, SETUP_APPROVED)).toBe(false);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when no card is open", () => {
    const ref: { current: ((a: SetupConfirmationAnswer) => void) | null } = {
      current: null,
    };
    expect(settleSetupResolver(ref, SETUP_STOPPED)).toBe(false);
  });
});
