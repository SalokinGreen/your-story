import { describe, it, expect, vi, afterEach } from "vitest";
import { deAiifyText } from "../app/misc/deAiify";

describe("deAiifyText", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("leaves flagged words untouched below the roll that decides to keep them", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const result = deAiifyText("The air smelled of ozone after the storm.");
    expect(result).toBe("The air smelled of ozone after the storm.");
  });

  it("swaps flagged words for a synonym above the keep threshold", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const result = deAiifyText("The air smelled of ozone after the storm.");
    expect(result).not.toContain("ozone");
    expect(result).toMatch(
      /scorched air|burnt-metal tang|electric tang|sulfurous whiff|singed-wire smell/,
    );
  });

  it("preserves capitalization of the replaced word", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const result = deAiifyText("Palpable tension filled the room.");
    expect(result[0]).toBe(result[0].toUpperCase());
    expect(result).not.toMatch(/^palpable/);
  });

  it("does not touch words that aren't on the flagged list", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const text = "The knight drew her sword and walked into the tavern.";
    expect(deAiifyText(text)).toBe(text);
  });
});
