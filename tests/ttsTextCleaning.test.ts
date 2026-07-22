import { describe, it, expect } from "vitest";
import { cleanTextForTTS } from "@/app/misc/ttsCall";

describe("cleanTextForTTS", () => {
  it("strips emoji and leaves surrounding prose intact", () => {
    const result = cleanTextForTTS("You find a sword! 🗡️✨ Nice work 😄.");
    expect(result).toBe("You find a sword!  Nice work .");
  });

  it("strips flag sequences and skin-tone-modified emoji", () => {
    const result = cleanTextForTTS("Great job 👍🏽! You made it 🇬🇧.");
    expect(result).toBe("Great job ! You made it .");
  });

  it("strips misc symbols, arrows, and dingbats", () => {
    const result = cleanTextForTTS("Go north → then east ➡ and grab the ★ item.");
    expect(result).toBe("Go north  then east  and grab the  item.");
  });

  it("strips markdown emphasis and code formatting", () => {
    const result = cleanTextForTTS("The **goblin** growls, *snarling* and baring its `teeth`.");
    expect(result).toBe("The goblin growls, snarling and baring its teeth.");
  });

  it("converts links to their display text", () => {
    const result = cleanTextForTTS("Check the [ancient map](https://example.com/map) closely.");
    expect(result).toBe("Check the ancient map closely.");
  });

  it("removes spoiler-tagged text entirely", () => {
    const result = cleanTextForTTS("The stranger is ||secretly the king|| in disguise.");
    expect(result).toBe("The stranger is  in disguise.");
  });

  it("removes horizontal rules", () => {
    const result = cleanTextForTTS("The chapter ends.\n\n---\n\nA new one begins.");
    expect(result).toBe("The chapter ends.\n\nA new one begins.");
  });

  it("removes blockquote markers", () => {
    const result = cleanTextForTTS("> The old man warns you\n> to turn back now.");
    expect(result).toBe("The old man warns you\nto turn back now.");
  });

  it("converts a markdown table into spoken sentences", () => {
    const table = ["| Name | HP | AC |", "| --- | --- | --- |", "| Goblin | 7 | 15 |", "| Orc | 15 | 13 |"].join(
      "\n",
    );
    const result = cleanTextForTTS(table);
    expect(result).toBe("Name: Goblin, HP: 7, AC: 15.\nName: Orc, HP: 15, AC: 13.");
  });

  it("neutralizes stray pipe characters outside of a real table", () => {
    const result = cleanTextForTTS("Choose wisely | your fate depends on it.");
    expect(result).toBe("Choose wisely ,  your fate depends on it.");
  });

  it("collapses excessive blank lines and trims", () => {
    const result = cleanTextForTTS("  First line.\n\n\n\nSecond line.  ");
    expect(result).toBe("First line.\n\nSecond line.");
  });
});
