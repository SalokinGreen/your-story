import { describe, it, expect } from "vitest";
import { cleanTextForSpeech } from "../app/misc/ai";

describe("cleanTextForSpeech", () => {
  it("removes hidden GM notes wrapped in ||...||", () => {
    const text = "You enter the room. ||The chest is trapped.|| It is quiet.";
    expect(cleanTextForSpeech(text)).toBe(
      "You enter the room. It is quiet.",
    );
  });

  it("strips markdown bold, italic, and headings", () => {
    const text = "# Chapter One\n\nThe **old** door creaks *open* slowly.";
    expect(cleanTextForSpeech(text)).toBe(
      "Chapter One\n\nThe old door creaks open slowly.",
    );
  });

  it("strips links, images, code, and list markers", () => {
    const text =
      "See [the map](https://example.com) and ![art](img.png).\n- Take the sword\n1. Leave quietly\n`whisper`";
    expect(cleanTextForSpeech(text)).toBe(
      "See the map and art.\nTake the sword\nLeave quietly\nwhisper",
    );
  });

  it("strips <output> tags and thinking tags before cleaning", () => {
    const text =
      "<thinking>internal reasoning</thinking><output>The **hero** advances.</output>";
    expect(cleanTextForSpeech(text)).toBe("The hero advances.");
  });

  it("returns empty string for empty input", () => {
    expect(cleanTextForSpeech("")).toBe("");
  });
});
