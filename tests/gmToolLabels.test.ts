import { describe, it, expect } from "vitest";
import { getToolProgressLabel } from "../app/misc/gmToolLabels";

describe("getToolProgressLabel", () => {
  it("returns a friendly label for known tools", () => {
    expect(getToolProgressLabel("formula_roll")).toBe("Rolling dice");
    expect(getToolProgressLabel("manage_timer")).toBe("Managing timer");
    expect(getToolProgressLabel("add_combatant")).toBe("Adding combatant");
    expect(getToolProgressLabel("end_gm_thinking")).toBe("Wrapping up");
  });

  it("prettifies unknown tool names as a fallback", () => {
    expect(getToolProgressLabel("some_future_tool")).toBe("Some future tool");
    expect(getToolProgressLabel("x")).toBe("X");
  });
});
