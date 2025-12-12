import { describe, it, expect } from "vitest";
import {
  parseTemplateFields,
  createCharacterSheetTemplate,
  fillTemplate,
  getDefaultValues,
  validateTemplate,
  DEFAULT_CHARACTER_SHEET_TEMPLATE,
  MINIMAL_CHARACTER_SHEET_TEMPLATE,
} from "../app/misc/characterSheetTemplate";

describe("Character Sheet Template System", () => {
  describe("parseTemplateFields", () => {
    it("should extract fields from template", () => {
      const template = `# {{Name | Your name | Hero}}
**Class:** {{Class | Your class | Warrior}}`;

      const fields = parseTemplateFields(template);

      expect(fields).toHaveLength(2);
      expect(fields[0]).toEqual({
        name: "Name",
        description: "Your name",
        defaultValue: "Hero",
      });
      expect(fields[1]).toEqual({
        name: "Class",
        description: "Your class",
        defaultValue: "Warrior",
      });
    });

    it("should handle empty descriptions and defaults", () => {
      const template = `{{Name | | }}`;
      const fields = parseTemplateFields(template);

      expect(fields).toHaveLength(1);
      expect(fields[0]).toEqual({
        name: "Name",
        description: "",
        defaultValue: "",
      });
    });

    it("should handle extra whitespace", () => {
      const template = `{{  Name  |  Description here  |  Default value  }}`;
      const fields = parseTemplateFields(template);

      expect(fields).toHaveLength(1);
      expect(fields[0]).toEqual({
        name: "Name",
        description: "Description here",
        defaultValue: "Default value",
      });
    });

    it("should deduplicate fields with same name", () => {
      const template = `{{Name | First | A}}
{{Name | Second | B}}`;

      const fields = parseTemplateFields(template);
      expect(fields).toHaveLength(1);
      expect(fields[0].description).toBe("First"); // First occurrence wins
    });

    it("should handle case-insensitive deduplication", () => {
      const template = `{{name | lowercase | a}}
{{NAME | uppercase | b}}
{{Name | mixed | c}}`;

      const fields = parseTemplateFields(template);
      expect(fields).toHaveLength(1);
    });
  });

  describe("createCharacterSheetTemplate", () => {
    it("should create template with extracted fields", () => {
      const templateStr = `# {{Name | Your name | Hero}}`;
      const template = createCharacterSheetTemplate(templateStr);

      expect(template.template).toBe(templateStr);
      expect(template.fields).toHaveLength(1);
      expect(template.fields[0].name).toBe("Name");
    });
  });

  describe("fillTemplate", () => {
    it("should replace placeholders with values", () => {
      const template = `# {{Name | desc | default}}`;
      const result = fillTemplate(template, { Name: "Alice" });

      expect(result).toBe("# Alice");
    });

    it("should use default when value not provided", () => {
      const template = `# {{Name | desc | Hero}}`;
      const result = fillTemplate(template, {});

      expect(result).toBe("# Hero");
    });

    it("should use default when value is empty string", () => {
      const template = `# {{Name | desc | Hero}}`;
      const result = fillTemplate(template, { Name: "" });

      expect(result).toBe("# Hero");
    });

    it("should handle multiple fields", () => {
      const template = `# {{Name | | Hero}}
**Class:** {{Class | | Warrior}}
**Level:** {{Level | | 1}}`;

      const result = fillTemplate(template, {
        Name: "Alice",
        Class: "Mage",
      });

      expect(result).toContain("# Alice");
      expect(result).toContain("**Class:** Mage");
      expect(result).toContain("**Level:** 1"); // Uses default
    });
  });

  describe("getDefaultValues", () => {
    it("should extract default values as record", () => {
      const template = createCharacterSheetTemplate(
        `{{Name | | Hero}}
{{Class | | Warrior}}`
      );

      const defaults = getDefaultValues(template);

      expect(defaults).toEqual({
        Name: "Hero",
        Class: "Warrior",
      });
    });
  });

  describe("validateTemplate", () => {
    it("should return no errors for valid template", () => {
      const errors = validateTemplate(`# {{Name | Description | Default}}`);
      expect(errors).toHaveLength(0);
    });

    it("should detect mismatched braces", () => {
      const errors = validateTemplate(`# {{Name | desc | default`);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain("Mismatched braces");
    });

    it("should detect wrong number of pipes", () => {
      const errors = validateTemplate(`# {{Name | desc}}`);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain("2 pipes");
    });

    it("should detect too many pipes", () => {
      const errors = validateTemplate(`# {{Name | desc | default | extra}}`);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe("default templates", () => {
    it("DEFAULT_CHARACTER_SHEET_TEMPLATE should be valid", () => {
      const errors = validateTemplate(DEFAULT_CHARACTER_SHEET_TEMPLATE);
      expect(errors).toHaveLength(0);

      const fields = parseTemplateFields(DEFAULT_CHARACTER_SHEET_TEMPLATE);
      expect(fields.length).toBeGreaterThan(0);
    });

    it("MINIMAL_CHARACTER_SHEET_TEMPLATE should be valid", () => {
      const errors = validateTemplate(MINIMAL_CHARACTER_SHEET_TEMPLATE);
      expect(errors).toHaveLength(0);

      const fields = parseTemplateFields(MINIMAL_CHARACTER_SHEET_TEMPLATE);
      expect(fields.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("real-world templates", () => {
    it("should handle fantasy character template", () => {
      const template = `# {{Name | Your character's name | Unnamed Hero}}
**Race:** {{Race | Your character's race | Human}}
**Class:** {{Class | Your character's class or profession | Adventurer}}

## Background
{{Background | Your character's history | A wanderer seeking glory.}}

## Appearance
{{Appearance | Physical description | Weathered traveler.}}`;

      const errors = validateTemplate(template);
      expect(errors).toHaveLength(0);

      const fields = parseTemplateFields(template);
      expect(fields).toHaveLength(5);
      expect(fields.map((f) => f.name)).toEqual([
        "Name",
        "Race",
        "Class",
        "Background",
        "Appearance",
      ]);

      const filled = fillTemplate(template, {
        Name: "Aria Shadowmend",
        Race: "Half-Elf",
        Class: "Ranger",
        Background: "Former scout for the northern kingdom.",
        Appearance: "Tall and lithe with silver-streaked dark hair.",
      });

      expect(filled).toContain("# Aria Shadowmend");
      expect(filled).toContain("**Race:** Half-Elf");
      expect(filled).toContain("**Class:** Ranger");
    });
  });
});
