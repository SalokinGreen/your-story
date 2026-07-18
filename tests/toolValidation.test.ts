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
