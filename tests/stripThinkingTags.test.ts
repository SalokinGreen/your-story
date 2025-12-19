import { describe, it, expect } from "vitest";
import { stripThinkingTags } from "../app/misc/ai";

describe("stripThinkingTags", () => {
  it("extracts content from <output> tags", () => {
    const text = `[GM] This is reasoning.

<output>
The actual story content here.
</output>`;
    const result = stripThinkingTags(text);
    expect(result).toBe("The actual story content here.");
  });

  it("extracts content from <story> tags", () => {
    const text = `[GAME MASTER] Analyzing the situation.

<story>
You enter the dark cavern.
</story>`;
    const result = stripThinkingTags(text);
    expect(result).toBe("You enter the dark cavern.");
  });

  it("handles multiple <output> blocks", () => {
    const text = `<output>First part of the story.</output>

[GM] Some reasoning.

<output>Second part continues.</output>`;
    const result = stripThinkingTags(text);
    expect(result).toBe("First part of the story.\n\nSecond part continues.");
  });

  it("returns content as-is when no tags present", () => {
    const text = `The corridor is dark and quiet. You move carefully.`;
    const result = stripThinkingTags(text);
    expect(result).toBe("The corridor is dark and quiet. You move carefully.");
  });

  it("returns all content when no output tags (fallback)", () => {
    const text = `Some intro text here.

More content follows.`;
    const result = stripThinkingTags(text);
    expect(result).toContain("Some intro text here.");
    expect(result).toContain("More content follows.");
  });

  it("handles unclosed <output> tags during streaming", () => {
    const text = `[GM] Some reasoning.

<output>
The story is being written and continues here...`;
    const result = stripThinkingTags(text);
    expect(result).toBe("The story is being written and continues here...");
  });

  it("handles unclosed <story> tags during streaming", () => {
    const text = `[GM] Some reasoning.

<story>
The story is being written...`;
    const result = stripThinkingTags(text);
    expect(result).toBe("The story is being written...");
  });

  it("strips content AFTER closing </output> tag", () => {
    const text = `[GM] Reasoning before.

<output>
The story prose.
</output>

[GM] More reasoning after the output.`;
    const result = stripThinkingTags(text);
    expect(result).toBe("The story prose.");
  });

  it("strips content BEFORE opening <output> tag", () => {
    const text = `[GM] Initial analysis.
The DC is 15.

<output>
You step forward cautiously.
</output>`;
    const result = stripThinkingTags(text);
    expect(result).toBe("You step forward cautiously.");
  });

  it("only extracts from <output> tags, ignoring everything else", () => {
    const text = `**[GAME MASTER]**
1. **Skill Check**: Stealth vs DC 14
2. **Roll Result**: Success

<output>
The shadows embrace you.
</output>

Now I need to update the game state...`;
    const result = stripThinkingTags(text);
    expect(result).toBe("The shadows embrace you.");
  });

  it("preserves formatting inside <output> tags", () => {
    const text = `<output>
First paragraph.

Second paragraph.
</output>`;
    const result = stripThinkingTags(text);
    expect(result).toContain("First paragraph.");
    expect(result).toContain("Second paragraph.");
  });

  it("returns empty string for empty input", () => {
    expect(stripThinkingTags("")).toBe("");
  });
});
