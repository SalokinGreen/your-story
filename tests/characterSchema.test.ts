import { describe, it, expect } from "vitest";
import {
  CharacterSchema,
  SchemaField,
  createDefaultCharacterData,
  recalculateDerivedFields,
  evaluateFormula,
  getNumericValue,
  createSchemaResolver,
  validateSchema,
  DND5E_SCHEMA,
  COC_SCHEMA,
  NARRATIVE_SCHEMA,
  processTemplate,
} from "../app/misc/characterSchema";

describe("Character Schema System", () => {
  // ============================================
  // DEFAULT DATA CREATION
  // ============================================

  describe("createDefaultCharacterData", () => {
    it("creates default values for number fields", () => {
      const schema: CharacterSchema = {
        version: 1,
        name: "Test",
        fields: [
          {
            id: "strength",
            name: "Strength",
            type: "number",
            defaultValue: 10,
          },
          { id: "dex", name: "Dexterity", type: "number" }, // No default
        ],
      };

      const data = createDefaultCharacterData(schema);
      expect(data.values.strength).toBe(10);
      expect(data.values.dex).toBe(0); // Falls back to 0
    });

    it("creates default values for resource fields", () => {
      const schema: CharacterSchema = {
        version: 1,
        name: "Test",
        fields: [
          {
            id: "hp",
            name: "HP",
            type: "resource",
            defaultValue: 45,
            defaultMax: 50,
          },
        ],
      };

      const data = createDefaultCharacterData(schema);
      expect(data.values.hp).toEqual({ current: 45, max: 50 });
    });

    it("creates default values for text fields", () => {
      const schema: CharacterSchema = {
        version: 1,
        name: "Test",
        fields: [
          { id: "name", name: "Name", type: "text", defaultValue: "Hero" },
          { id: "bio", name: "Bio", type: "text" },
        ],
      };

      const data = createDefaultCharacterData(schema);
      expect(data.values.name).toBe("Hero");
      expect(data.values.bio).toBe("");
    });

    it("creates default values for list fields", () => {
      const schema: CharacterSchema = {
        version: 1,
        name: "Test",
        fields: [
          {
            id: "languages",
            name: "Languages",
            type: "list",
            defaultValue: ["Common", "Elvish"],
          },
        ],
      };

      const data = createDefaultCharacterData(schema);
      expect(data.values.languages).toEqual(["Common", "Elvish"]);
    });

    it("creates default values for boolean fields", () => {
      const schema: CharacterSchema = {
        version: 1,
        name: "Test",
        fields: [
          {
            id: "concentrating",
            name: "Concentrating",
            type: "boolean",
            defaultValue: true,
          },
        ],
      };

      const data = createDefaultCharacterData(schema);
      expect(data.values.concentrating).toBe(true);
    });

    it("creates default values for select fields", () => {
      const schema: CharacterSchema = {
        version: 1,
        name: "Test",
        fields: [
          {
            id: "class",
            name: "Class",
            type: "select",
            options: [
              { value: "fighter", label: "Fighter" },
              { value: "wizard", label: "Wizard" },
            ],
            defaultValue: "fighter",
          },
        ],
      };

      const data = createDefaultCharacterData(schema);
      expect(data.values.class).toBe("fighter");
    });

    it("calculates derived fields on creation", () => {
      const schema: CharacterSchema = {
        version: 1,
        name: "Test",
        fields: [
          {
            id: "strength",
            name: "Strength",
            type: "number",
            defaultValue: 14,
          },
          {
            id: "str_mod",
            name: "STR Mod",
            type: "derived",
            formula: "floor(({{strength}} - 10) / 2)",
          },
        ],
      };

      const data = createDefaultCharacterData(schema);
      expect(data.values.str_mod).toBe(2); // floor((14-10)/2) = 2
    });
  });

  // ============================================
  // FORMULA EVALUATION
  // ============================================

  describe("evaluateFormula", () => {
    it("evaluates simple arithmetic", () => {
      expect(evaluateFormula("10 + 5", {})).toBe(15);
      expect(evaluateFormula("20 - 8", {})).toBe(12);
      expect(evaluateFormula("4 * 3", {})).toBe(12);
      expect(evaluateFormula("20 / 4", {})).toBe(5);
    });

    it("evaluates with parentheses", () => {
      expect(evaluateFormula("(10 + 5) * 2", {})).toBe(30);
      expect(evaluateFormula("10 + (5 * 2)", {})).toBe(20);
    });

    it("substitutes variables", () => {
      const values = { strength: 16, level: 5 };
      expect(evaluateFormula("{{strength}} + {{level}}", values)).toBe(21);
    });

    it("handles floor function", () => {
      expect(evaluateFormula("floor(7.8)", {})).toBe(7);
      expect(evaluateFormula("floor((14 - 10) / 2)", {})).toBe(2);
    });

    it("handles ceil function", () => {
      expect(evaluateFormula("ceil(7.2)", {})).toBe(8);
    });

    it("handles min/max functions", () => {
      expect(evaluateFormula("min(5, 10)", {})).toBe(5);
      expect(evaluateFormula("max(5, 10)", {})).toBe(10);
      expect(evaluateFormula("min(3, 7, 2)", {})).toBe(2);
    });

    it("handles abs function", () => {
      expect(evaluateFormula("abs(-5)", {})).toBe(5);
      expect(evaluateFormula("abs(5)", {})).toBe(5);
    });

    it("evaluates D&D-style modifier formula", () => {
      const values = { Strength: 16 };
      expect(evaluateFormula("floor(({{Strength}} - 10) / 2)", values)).toBe(3);
    });

    it("evaluates D&D proficiency bonus formula", () => {
      const values = { Level: 5 };
      expect(evaluateFormula("floor(({{Level}} - 1) / 4) + 2", values)).toBe(3);
    });

    it("handles resource values (extracts current)", () => {
      const values = { hp: { current: 25, max: 50 } };
      expect(evaluateFormula("{{hp}}", values)).toBe(25);
    });

    it("handles boolean values (true=1, false=0)", () => {
      const values = { inspired: true, cursed: false };
      expect(evaluateFormula("{{inspired}} + {{cursed}}", values)).toBe(1);
    });

    it("handles list values (returns length)", () => {
      const values = { languages: ["Common", "Elvish", "Dwarvish"] };
      expect(evaluateFormula("{{languages}}", values)).toBe(3);
    });

    it("returns 0 for undefined variables", () => {
      expect(evaluateFormula("{{undefined_var}}", {})).toBe(0);
    });

    it("handles complex nested formulas", () => {
      const values = { STR: 16, DEX: 14, Level: 5 };
      const formula = "10 + max({{STR}}, {{DEX}}) + floor(({{Level}} - 1) / 4)";
      expect(evaluateFormula(formula, values)).toBe(27); // 10 + 16 + 1
    });
  });

  // ============================================
  // DERIVED FIELD RECALCULATION
  // ============================================

  describe("recalculateDerivedFields", () => {
    it("updates all derived fields", () => {
      const schema: CharacterSchema = {
        version: 1,
        name: "Test",
        fields: [
          { id: "strength", name: "Strength", type: "number" },
          { id: "dexterity", name: "Dexterity", type: "number" },
          {
            id: "str_mod",
            name: "STR Mod",
            type: "derived",
            formula: "floor(({{strength}} - 10) / 2)",
          },
          {
            id: "dex_mod",
            name: "DEX Mod",
            type: "derived",
            formula: "floor(({{dexterity}} - 10) / 2)",
          },
        ],
      };

      const values = {
        strength: 18,
        dexterity: 12,
        str_mod: 0,
        dex_mod: 0,
      };

      recalculateDerivedFields(schema, values);

      expect(values.str_mod).toBe(4); // floor((18-10)/2)
      expect(values.dex_mod).toBe(1); // floor((12-10)/2)
    });
  });

  // ============================================
  // NUMERIC VALUE EXTRACTION
  // ============================================

  describe("getNumericValue", () => {
    it("returns number directly", () => {
      expect(getNumericValue({ stat: 15 }, "stat")).toBe(15);
    });

    it("extracts current from resource", () => {
      expect(getNumericValue({ hp: { current: 25, max: 50 } }, "hp")).toBe(25);
    });

    it("converts boolean to 1/0", () => {
      expect(getNumericValue({ flag: true }, "flag")).toBe(1);
      expect(getNumericValue({ flag: false }, "flag")).toBe(0);
    });

    it("returns length for arrays", () => {
      expect(getNumericValue({ items: ["a", "b", "c"] }, "items")).toBe(3);
    });

    it("returns 0 for undefined", () => {
      expect(getNumericValue({}, "missing")).toBe(0);
    });
  });

  // ============================================
  // SCHEMA RESOLVER (for dice formulas)
  // ============================================

  describe("createSchemaResolver", () => {
    const schema: CharacterSchema = {
      version: 1,
      name: "Test",
      fields: [
        { id: "Strength", name: "Strength", type: "number" },
        { id: "Dexterity", name: "Dexterity", type: "number" },
      ],
    };

    it("resolves direct field values", () => {
      const values = { Strength: 16, Dexterity: 14 };
      const resolver = createSchemaResolver(schema, values);

      expect(resolver("Strength")).toBe(16);
      expect(resolver("Dexterity")).toBe(14);
    });

    it("returns undefined for unknown fields", () => {
      const resolver = createSchemaResolver(schema, {});
      expect(resolver("Unknown")).toBeUndefined();
    });
  });

  // ============================================
  // SCHEMA VALIDATION
  // ============================================

  describe("validateSchema", () => {
    it("passes for valid schema", () => {
      const result = validateSchema(DND5E_SCHEMA);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("fails for schema without name", () => {
      const schema = { version: 1, name: "", fields: [] } as CharacterSchema;
      const result = validateSchema(schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Schema must have a name");
    });

    it("fails for schema without fields", () => {
      const schema = {
        version: 1,
        name: "Test",
        fields: [],
      } as CharacterSchema;
      const result = validateSchema(schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Schema must have at least one field");
    });

    it("fails for duplicate field IDs", () => {
      const schema: CharacterSchema = {
        version: 1,
        name: "Test",
        fields: [
          { id: "stat", name: "Stat 1", type: "number" },
          { id: "stat", name: "Stat 2", type: "number" },
        ],
      };
      const result = validateSchema(schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Duplicate field ID: stat");
    });

    it("fails for invalid field ID format", () => {
      const schema: CharacterSchema = {
        version: 1,
        name: "Test",
        fields: [{ id: "123invalid", name: "Bad ID", type: "number" }],
      };
      const result = validateSchema(schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Invalid field ID format");
    });

    it("fails for select field without options", () => {
      const schema: CharacterSchema = {
        version: 1,
        name: "Test",
        fields: [
          { id: "class", name: "Class", type: "select", options: [] },
        ] as SchemaField[],
      };
      const result = validateSchema(schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("must have at least one option");
    });

    it("warns for derived field referencing unknown field", () => {
      const schema: CharacterSchema = {
        version: 1,
        name: "Test",
        fields: [
          {
            id: "derived",
            name: "Derived",
            type: "derived",
            formula: "{{unknown}} + 5",
          },
        ],
      };
      const result = validateSchema(schema);
      expect(result.valid).toBe(true); // Warning, not error
      expect(result.warnings[0]).toContain("references unknown field");
    });
  });

  // ============================================
  // PRESET SCHEMAS
  // ============================================

  describe("Preset Schemas", () => {
    it("D&D 5e schema is valid", () => {
      const result = validateSchema(DND5E_SCHEMA);
      expect(result.valid).toBe(true);
    });

    it("D&D 5e calculates modifiers correctly", () => {
      const data = createDefaultCharacterData(DND5E_SCHEMA);
      // Default stats are 10, so modifier should be 0
      expect(data.values.STR_mod).toBe(0);

      // Manually set strength and recalculate
      data.values.Strength = 18;
      recalculateDerivedFields(DND5E_SCHEMA, data.values);
      expect(data.values.STR_mod).toBe(4);
    });

    it("D&D 5e proficiency bonus scales with level", () => {
      const data = createDefaultCharacterData(DND5E_SCHEMA);

      // Level 1 = +2
      expect(data.values.proficiency).toBe(2);

      // Level 5 = +3
      data.values.Level = 5;
      recalculateDerivedFields(DND5E_SCHEMA, data.values);
      expect(data.values.proficiency).toBe(3);

      // Level 9 = +4
      data.values.Level = 9;
      recalculateDerivedFields(DND5E_SCHEMA, data.values);
      expect(data.values.proficiency).toBe(4);
    });

    it("Call of Cthulhu schema is valid", () => {
      const result = validateSchema(COC_SCHEMA);
      expect(result.valid).toBe(true);
    });

    it("Narrative schema is valid", () => {
      const result = validateSchema(NARRATIVE_SCHEMA);
      expect(result.valid).toBe(true);
    });

    it("Narrative schema creates simple character", () => {
      const data = createDefaultCharacterData(NARRATIVE_SCHEMA);
      expect(data.values.Physique).toBe(2);
      expect(data.values.Finesse).toBe(2);
      expect(data.values.Mind).toBe(2);
      expect(data.values.Spirit).toBe(2);
      expect(data.values.Stress).toEqual({ current: 0, max: 10 });
    });
  });

  // ============================================
  // EDGE CASES
  // ============================================

  describe("Edge Cases", () => {
    it("handles empty formula", () => {
      expect(evaluateFormula("", {})).toBe(0);
    });

    it("handles formula with only whitespace", () => {
      expect(evaluateFormula("   ", {})).toBe(0);
    });

    it("handles invalid math expressions gracefully", () => {
      expect(evaluateFormula("abc + def", {})).toBe(0);
    });

    it("handles division by zero", () => {
      const result = evaluateFormula("10 / 0", {});
      expect(result === Infinity || result === 0).toBe(true);
    });

    it("handles deeply nested parentheses", () => {
      expect(evaluateFormula("((((5))))", {})).toBe(5);
    });

    it("handles negative numbers", () => {
      expect(evaluateFormula("-5 + 10", {})).toBe(5);
    });

    it("handles decimal numbers", () => {
      expect(evaluateFormula("3.5 + 1.5", {})).toBe(5);
    });
  });

  // ============================================
  // TEMPLATE PROCESSOR (processTemplate)
  // ============================================

  describe("processTemplate", () => {
    it("handles field names with spaces using quotes", () => {
      const values = { "Days in Captivity": 5 };

      // Simple value substitution with quoted field name
      expect(processTemplate('{{"Days in Captivity"}}', values)).toBe("5");

      // If block with quoted field name
      expect(
        processTemplate('{{#if "Days in Captivity"}}SHOW{{/if}}', values)
      ).toBe("SHOW");

      // Unless block with quoted field name (value is truthy, so don't show)
      expect(
        processTemplate(
          '{{#unless "Days in Captivity"}}HIDE{{/unless}}',
          values
        )
      ).toBe("");
    });

    it("handles nested add expressions", () => {
      const values = {
        skill_athletics: 3,
        skill_stealth: 2,
        skill_acrobatics: 4,
      };

      // Nested add with s-expression syntax
      expect(
        processTemplate(
          "{{(add (add skill_athletics skill_stealth) skill_acrobatics)}}",
          values
        )
      ).toBe("9");

      // Multiple args in add helper
      expect(
        processTemplate(
          "{{add skill_athletics skill_stealth skill_acrobatics}}",
          values
        )
      ).toBe("9");
    });

    it("handles compare blocks with field refs", () => {
      const values = { skill_persuasion: 5, skill_intimidation: 3 };

      // Compare two fields - persuasion > intimidation
      expect(
        processTemplate(
          '{{#compare skill_persuasion ">=" skill_intimidation}}YES{{/compare}}',
          values
        )
      ).toBe("YES");

      // Compare two fields - intimidation < persuasion
      expect(
        processTemplate(
          '{{#compare skill_intimidation "<" skill_persuasion}}YES{{/compare}}',
          values
        )
      ).toBe("YES");

      // Compare that should be false
      expect(
        processTemplate(
          '{{#compare skill_intimidation ">" skill_persuasion}}NO{{/compare}}',
          values
        )
      ).toBe("");
    });

    it("handles each with quoted field names", () => {
      const values = { "My Items": ["Sword", "Shield", "Potion"] };

      expect(
        processTemplate('{{#each "My Items"}}{{this}},{{/each}}', values)
      ).toBe("Sword,Shield,Potion,");
    });

    it("handles simple field substitution", () => {
      const values = { name: "Hero", level: 5 };

      expect(processTemplate("{{name}} - Level {{level}}", values)).toBe(
        "Hero - Level 5"
      );
    });

    it("handles resource current/max", () => {
      const values = { health: { current: 30, max: 50 } };

      expect(
        processTemplate("HP: {{health.current}}/{{health.max}}", values)
      ).toBe("HP: 30/50");
    });

    it("handles math helpers with nested s-expressions", () => {
      const values = { a: 10, b: 5, c: 2 };

      // (a + b) * c = (10 + 5) * 2 = 30
      expect(processTemplate("{{(mul (add a b) c)}}", values)).toBe("30");

      // subtract with nested
      expect(processTemplate("{{subtract (add a b) c}}", values)).toBe("13");
    });
  });
});
