import { describe, it, expect } from "vitest";
import { outputToScenePart } from "../app/misc/ai";

describe("outputToScenePart", () => {
  it("parses full tagged output", () => {
    const text = `
<story>
You walk into the cave. It's cold and dripping, the smell of wet stone filling your nostrils.
</story>

<memory>
- Found a rusty key
- Met the elder
</memory>

<choices>
- Enter deeper <use_skill: Stealth (DC 12)>
- Return to village
- Light a torch <use_item: Torch>
</choices>
!!! END CHAPTER !!!
`;
    const part = outputToScenePart(text);
    expect(part.role).toBe("assistant");
    expect(part.user).toBe(false);
    expect(part.content).toContain("You walk into the cave");
    expect(part.memoryEntries).toEqual(["Found a rusty key", "Met the elder"]);
    expect(part.choices).toHaveLength(3);
    expect(part.choices?.[0].text).toContain("Enter deeper");
    expect(part.endChapter).toBe(true);
  });

  it("falls back to full text when no tags", () => {
    const text = "A single-line response without tags.";
    const part = outputToScenePart(text);
    expect(part.content).toBe(text);
    expect(part.choices).toBeUndefined();
    expect(part.memoryEntries).toBeUndefined();
  });

  it("handles tags with attributes and odd spacing", () => {
    const text = `<STORY id=\"1\">\nThe wind howled.\n</STORY>\n<choices>\n* Go north\n* Go south <use_skill: Survival (DC 10)>\n</choices>`;
    const part = outputToScenePart(text);
    expect(part.content).toContain("The wind howled");
    expect(part.choices).toHaveLength(2);
    expect(part.choices?.[1].text).toContain("Go south");
    expect(part.endChapter).toBeUndefined();
  });

  it("detects end chapter marker", () => {
    const text = `<story>Chapter conclusion.</story>\n!!! END CHAPTER !!!`;
    const part = outputToScenePart(text);
    expect(part.endChapter).toBe(true);
  });

  it("leaves the old arcade tags in the choice text and sets none of their fields", () => {
    const text = `<story>A challenge appears.</story>
<choices>
- Fight the beast <use_skill: Combat (DC 75); use_resource: Health>
- Use potion <use_item: Health Potion; agmt_check: Does it work? (Likely)>
</choices>`;
    const part = outputToScenePart(text);
    expect(part.choices).toHaveLength(2);
    expect(part.choices?.[0].text).toBe(
      "Fight the beast <use_skill: Combat (DC 75); use_resource: Health>"
    );
    expect(part.choices?.[1].text).toContain("<use_item: Health Potion;");
    for (const choice of part.choices ?? []) {
      expect(Object.keys(choice)).toEqual(["text"]);
    }
  });

  it("no longer reads the game over marker", () => {
    const part = outputToScenePart(`<story>The end.</story>
!!! GAME OVER !!!`);
    expect("gameOver" in part).toBe(false);
  });
});
