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

  it("parses choice metadata correctly", () => {
    const text = `<story>A challenge appears.</story>\n<choices>\n- Fight the beast <use_skill: Combat (DC 75); use_resource: Health>\n- Use potion <use_item: Health Potion; use_resource: Mana>\n</choices>`;
    const part = outputToScenePart(text);
    expect(part.choices).toHaveLength(2);
    expect(part.choices?.[0].text).toBe("Fight the beast");
    expect(part.choices?.[0].skill_used).toBe("Combat");
    expect(part.choices?.[0].skill_dc).toBe(75);
    expect(part.choices?.[0].resource_used).toBe("Health");
    expect(part.choices?.[1].item_used).toBe("Health Potion");
    expect(part.choices?.[1].resource_used).toBe("Mana");
  });

  it("parses YZE success-based format", () => {
    const text = `<story>Year Zero Engine test.</story>\n<choices>\n- Sneak past guards <use_skill: Stealth (1 success needed); use_resource: none; use_item: none>\n- Hack terminal <use_skill: Technology (2 successes needed); use_resource: none; use_item: Data Pad>\n- Defuse bomb <use_skill: Explosives (3 successes needed); use_resource: none; use_item: Toolkit>\n</choices>`;
    const part = outputToScenePart(text);
    expect(part.choices).toHaveLength(3);
    expect(part.choices?.[0].skill_used).toBe("Stealth");
    expect(part.choices?.[0].skill_dc).toBe(1);
    expect(part.choices?.[1].skill_used).toBe("Technology");
    expect(part.choices?.[1].skill_dc).toBe(2);
    expect(part.choices?.[1].item_used).toBe("Data Pad");
    expect(part.choices?.[2].skill_used).toBe("Explosives");
    expect(part.choices?.[2].skill_dc).toBe(3);
    expect(part.choices?.[2].item_used).toBe("Toolkit");
  });

  it("parses alternative success formats", () => {
    const text = `<story>Alternative formats test.</story>\n<choices>\n- Option A <use_skill: Skill A (needs 2 successes); use_resource: none; use_item: none>\n- Option B <use_skill: Skill B (1 success required); use_resource: none; use_item: none>\n- Option C <use_skill: Skill C (2 succ needed); use_resource: none; use_item: none>\n</choices>`;
    const part = outputToScenePart(text);
    expect(part.choices).toHaveLength(3);
    expect(part.choices?.[0].skill_dc).toBe(2);
    expect(part.choices?.[1].skill_dc).toBe(1);
    expect(part.choices?.[2].skill_dc).toBe(2);
  });

  it("parses tier-based DC formats", () => {
    const text = `<story>Tier difficulty test.</story>\n<choices>\n- Easy task <use_skill: Athletics (easy); use_resource: none; use_item: none>\n- Hard task <use_skill: Stealth (hard); use_resource: Stamina; use_item: none>\n- Very hard <use_skill: Combat (very_hard); use_resource: Health; use_item: Sword>\n- With DC prefix <use_skill: Magic (DC average); use_resource: Mana; use_item: none>\n</choices>`;
    const part = outputToScenePart(text);
    expect(part.choices).toHaveLength(4);
    // Tier names should be stored in skill_dc_tier, not skill_dc
    expect(part.choices?.[0].skill_used).toBe("Athletics");
    expect(part.choices?.[0].skill_dc_tier).toBe("easy");
    expect(part.choices?.[0].skill_dc).toBeUndefined();
    expect(part.choices?.[1].skill_used).toBe("Stealth");
    expect(part.choices?.[1].skill_dc_tier).toBe("hard");
    expect(part.choices?.[1].resource_used).toBe("Stamina");
    expect(part.choices?.[2].skill_used).toBe("Combat");
    expect(part.choices?.[2].skill_dc_tier).toBe("very_hard");
    expect(part.choices?.[2].item_used).toBe("Sword");
    expect(part.choices?.[3].skill_used).toBe("Magic");
    expect(part.choices?.[3].skill_dc_tier).toBe("average");
  });
});
