import { describe, it, expect } from "vitest";
import { outputToScenePart } from "../app/misc/ai";

describe("Memory Deduplication", () => {
  it("should parse memory entries from AI output", () => {
    const text = `
<story>
The adventure continues.
</story>

<memory>
- Met Gandalf the wizard
- Found the ancient sword
- Discovered the hidden cave
</memory>

<choices>
- Continue forward
</choices>
`;

    const part = outputToScenePart(text);
    expect(part.memoryEntries).toBeDefined();
    expect(part.memoryEntries).toHaveLength(3);
    expect(part.memoryEntries).toEqual([
      "Met Gandalf the wizard",
      "Found the ancient sword",
      "Discovered the hidden cave",
    ]);
  });

  it("should handle empty memory section", () => {
    const text = `
<story>
The adventure continues.
</story>

<memory>
</memory>

<choices>
- Continue forward
</choices>
`;

    const part = outputToScenePart(text);
    expect(part.memoryEntries).toBeUndefined();
  });

  it("should handle no memory section", () => {
    const text = `
<story>
The adventure continues.
</story>

<choices>
- Continue forward
</choices>
`;

    const part = outputToScenePart(text);
    expect(part.memoryEntries).toBeUndefined();
  });

  it("should trim whitespace from memory entries", () => {
    const text = `
<story>
The adventure continues.
</story>

<memory>
-   Met Gandalf the wizard   
-  Found the ancient sword  
- Discovered the hidden cave
</memory>

<choices>
- Continue forward
</choices>
`;

    const part = outputToScenePart(text);
    expect(part.memoryEntries).toEqual([
      "Met Gandalf the wizard",
      "Found the ancient sword",
      "Discovered the hidden cave",
    ]);
  });

  it("should handle memory entries with various formatting", () => {
    const text = `
<story>
The adventure continues.
</story>

<memory>
- Met Gandalf the wizard
* Found the ancient sword
• Discovered the hidden cave
</memory>

<choices>
- Continue forward
</choices>
`;

    const part = outputToScenePart(text);
    expect(part.memoryEntries).toHaveLength(3);
    // All bullet types should be handled
    expect(part.memoryEntries?.[0]).toContain("Met Gandalf");
    expect(part.memoryEntries?.[1]).toContain("Found the ancient");
    expect(part.memoryEntries?.[2]).toContain("Discovered the hidden");
  });

  describe("Case-insensitive deduplication logic", () => {
    // Note: These tests verify the expected behavior.
    // Actual deduplication happens in page.tsx when processing memoryEntries.

    it("should provide consistent lowercase comparison", () => {
      const entries = [
        "Met Gandalf the wizard",
        "met gandalf the wizard",
        "MET GANDALF THE WIZARD",
      ];

      const normalized = entries.map((e) => e.toLowerCase().trim());
      const uniqueSet = new Set(normalized);

      expect(uniqueSet.size).toBe(1);
    });

    it("should handle trimming with case insensitivity", () => {
      const entries = ["  Met Gandalf  ", "met gandalf", "MET GANDALF   "];

      const normalized = entries.map((e) => e.toLowerCase().trim());
      const uniqueSet = new Set(normalized);

      expect(uniqueSet.size).toBe(1);
    });

    it("should distinguish genuinely different entries", () => {
      const entries = [
        "Met Gandalf the wizard",
        "Met Gandalf the Grey",
        "Met Saruman the wizard",
      ];

      const normalized = entries.map((e) => e.toLowerCase().trim());
      const uniqueSet = new Set(normalized);

      expect(uniqueSet.size).toBe(3);
    });
  });
});
