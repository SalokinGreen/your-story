import { describe, it, expect } from "vitest";
import {
  validateToolArgs,
  formatValidationErrors,
  ToolFunctionSchema,
} from "../app/misc/toolValidation";

const questSchema: ToolFunctionSchema = {
  function: {
    name: "create_quest",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        shortDescription: { type: "string" },
        description: { type: "string" },
        points: {
          oneOf: [
            { type: "number" },
            { type: "string", enum: ["trivial", "minor", "moderate", "major", "legendary"] },
          ],
        },
      },
      required: ["title", "shortDescription", "description"],
    },
  },
};

const timerSchema: ToolFunctionSchema = {
  function: {
    name: "create_timer",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        totalTicks: { type: "number" },
        visibility: { type: "string", enum: ["visible", "hidden"] },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["name", "totalTicks"],
    },
  },
};

describe("validateToolArgs", () => {
  it("passes for fully valid args", () => {
    const errors = validateToolArgs(questSchema, {
      title: "Find the sword",
      shortDescription: "A quest",
      description: "Find the ancient sword in the ruins",
      points: "minor",
    });
    expect(errors).toEqual([]);
  });

  it("flags missing required parameters", () => {
    const errors = validateToolArgs(questSchema, { title: "Find the sword" });
    const params = errors.map((e) => e.param);
    expect(params).toContain("shortDescription");
    expect(params).toContain("description");
  });

  it("flags a wrong-typed value", () => {
    const errors = validateToolArgs(timerSchema, {
      name: "Bomb timer",
      totalTicks: "five", // should be a number
    });
    expect(errors.some((e) => e.param === "totalTicks")).toBe(true);
  });

  it("flags an invalid enum value", () => {
    const errors = validateToolArgs(timerSchema, {
      name: "Bomb timer",
      totalTicks: 5,
      visibility: "sneaky", // not in enum
    });
    expect(errors.some((e) => e.param === "visibility")).toBe(true);
  });

  it("accepts either branch of a oneOf", () => {
    const numeric = validateToolArgs(questSchema, {
      title: "t",
      shortDescription: "s",
      description: "d",
      points: 42,
    });
    expect(numeric).toEqual([]);

    const tiered = validateToolArgs(questSchema, {
      title: "t",
      shortDescription: "s",
      description: "d",
      points: "legendary",
    });
    expect(tiered).toEqual([]);
  });

  it("rejects a oneOf value that matches neither branch", () => {
    const errors = validateToolArgs(questSchema, {
      title: "t",
      shortDescription: "s",
      description: "d",
      points: "legendarey", // typo, not a valid enum value and not a number
    });
    expect(errors.some((e) => e.param === "points")).toBe(true);
  });

  it("validates array item types", () => {
    const errors = validateToolArgs(timerSchema, {
      name: "t",
      totalTicks: 3,
      tags: ["ok", 5, "also ok"],
    });
    expect(errors.some((e) => e.param === "tags[1]")).toBe(true);
  });

  it("ignores unknown/extra properties", () => {
    const errors = validateToolArgs(timerSchema, {
      name: "t",
      totalTicks: 3,
      extraField: "should not fail validation",
    });
    expect(errors).toEqual([]);
  });

  it("does not double-report a missing required param as a type error", () => {
    const errors = validateToolArgs(timerSchema, { name: "t" });
    const totalTicksErrors = errors.filter((e) => e.param === "totalTicks");
    expect(totalTicksErrors).toHaveLength(1);
    expect(totalTicksErrors[0].message).toContain("missing required parameter");
  });

  it("coerces an unambiguous numeric string for a number field instead of erroring", () => {
    const args: Record<string, unknown> = { name: "Bomb timer", totalTicks: "5" };
    const errors = validateToolArgs(timerSchema, args);
    expect(errors).toEqual([]);
    expect(args.totalTicks).toBe(5);
  });

  it("coerces an unambiguous boolean string for a boolean field instead of erroring", () => {
    const boolSchema: ToolFunctionSchema = {
      function: {
        name: "toggle_thing",
        parameters: {
          type: "object",
          properties: { active: { type: "boolean" } },
          required: ["active"],
        },
      },
    };
    const args: Record<string, unknown> = { active: "true" };
    const errors = validateToolArgs(boolSchema, args);
    expect(errors).toEqual([]);
    expect(args.active).toBe(true);
  });

  it("does not coerce ambiguous/non-numeric strings for a number field", () => {
    const errors = validateToolArgs(timerSchema, {
      name: "Bomb timer",
      totalTicks: "five",
    });
    expect(errors.some((e) => e.param === "totalTicks")).toBe(true);
  });

  it("does not coerce dice-formula-like strings for a number field", () => {
    const errors = validateToolArgs(timerSchema, {
      name: "Bomb timer",
      totalTicks: "1d6",
    });
    expect(errors.some((e) => e.param === "totalTicks")).toBe(true);
  });

  it("does not apply scalar coercion to oneOf fields", () => {
    // points is `oneOf: [number, enum string]` - "42" is a numeric string
    // but should still be validated against the oneOf branches, not
    // silently coerced to the number 42 at the top level.
    const errors = validateToolArgs(questSchema, {
      title: "t",
      shortDescription: "s",
      description: "d",
      points: "42",
    });
    expect(errors.some((e) => e.param === "points")).toBe(true);
  });
});

const boundedSchema: ToolFunctionSchema = {
  function: {
    name: "start_challenge",
    parameters: {
      type: "object",
      properties: {
        required_successes: { type: "number", minimum: 2, maximum: 10 },
        value: {
          oneOf: [{ type: "number", minimum: -100, maximum: 100 }],
        },
        tags: { type: "array", items: { type: "string" }, maxItems: 3 },
      },
      required: ["required_successes"],
    },
  },
};

describe("validateToolArgs - numeric and array bounds", () => {
  it("rejects a number below the declared minimum", () => {
    const errors = validateToolArgs(boundedSchema, { required_successes: -5 });
    expect(errors.some((e) => e.param === "required_successes")).toBe(true);
  });

  it("rejects a number above the declared maximum", () => {
    const errors = validateToolArgs(boundedSchema, { required_successes: 999 });
    expect(errors.some((e) => e.param === "required_successes")).toBe(true);
  });

  it("accepts a number within bounds", () => {
    const errors = validateToolArgs(boundedSchema, { required_successes: 5 });
    expect(errors).toEqual([]);
  });

  it("accepts the boundary values themselves", () => {
    expect(validateToolArgs(boundedSchema, { required_successes: 2 })).toEqual([]);
    expect(validateToolArgs(boundedSchema, { required_successes: 10 })).toEqual([]);
  });

  it("enforces bounds inside a oneOf branch", () => {
    const errors = validateToolArgs(boundedSchema, {
      required_successes: 5,
      value: 150,
    });
    expect(errors.some((e) => e.param === "value")).toBe(true);
  });

  it("enforces maxItems on arrays", () => {
    const errors = validateToolArgs(boundedSchema, {
      required_successes: 5,
      tags: ["a", "b", "c", "d"],
    });
    expect(errors.some((e) => e.param === "tags")).toBe(true);
  });

  it("caps create_quest points at the schema maximum", () => {
    const cappedQuestSchema: ToolFunctionSchema = {
      function: {
        name: "create_quest",
        parameters: {
          type: "object",
          properties: {
            points: {
              oneOf: [
                { type: "number", minimum: 1, maximum: 500 },
                {
                  type: "string",
                  enum: ["trivial", "minor", "moderate", "major", "legendary"],
                },
              ],
            },
          },
          required: [],
        },
      },
    };
    const errors = validateToolArgs(cappedQuestSchema, { points: 999999999 });
    expect(errors.some((e) => e.param === "points")).toBe(true);
  });
});

describe("formatValidationErrors", () => {
  it("joins errors into a single readable message", () => {
    const msg = formatValidationErrors("create_timer", [
      { param: "totalTicks", message: 'missing required parameter "totalTicks"' },
    ]);
    expect(msg).toContain("create_timer");
    expect(msg).toContain("totalTicks");
  });
});
