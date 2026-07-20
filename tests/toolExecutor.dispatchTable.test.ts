/**
 * Direct typed dispatch table tests.
 *
 * toolExecutor.ts used to convert these tool calls into a pipe-delimited
 * `/command: args` string (via convertToolToCommand) and then re-parse that
 * string with a regex in commandResponses.ts's executeCommandWithResponse.
 * That round trip is gone now - TOOL_DISPATCH calls typed apply* functions
 * directly with the already-parsed args object.
 *
 * Two of these tools - delete_goal and delete_note - previously built
 * command strings (`/delete_goal: ...`, `/note_delete: ...`) that had NO
 * matching regex handler anywhere in commandResponses.ts, so every call
 * silently failed with "Command execution returned null". This file
 * confirms both are now real, working implementations.
 */
import { describe, it, expect } from "vitest";
import { executeTools, ToolCall } from "@/app/misc/toolExecutor";
import {
  applyAdjustResource,
  applyReduceCooldown,
  applyResetAbilityCooldown,
} from "@/app/misc/commandResponses";
import type { Ability, Goal, Resource, StoryData } from "@/app/misc/structs";

function createTestStory(overrides: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "Test Story",
    premise: "Test premise",
    player_name: "Test Player",
    player_summary: "Test summary",
    intro: "Test intro",
    currentChapter: 0,
    max_chapters: 10,
    scene: { parts: [] },
    chapters: [],
    goals: [],
    stats: [],
    resources: [],
    inventory: [],
    lore: [],
    memory: [],
    relationships: [],
    rpgSystem: "3d6",
    abilities: [],
    npcs: [],
    ...overrides,
  } as StoryData;
}

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: `goal_${Math.random().toString(36).slice(2)}`,
    title: "Save the Village",
    shortDescription: "Save it",
    description: "The village is under attack.",
    active: true,
    fulfilled: false,
    ...overrides,
  };
}

function ability(overrides: Partial<Ability> = {}): Ability {
  return {
    name: "Fireball",
    description: "Launch a fireball",
    grade: "novice",
    cost: [],
    symbol: "🔥",
    cooldown: 0,
    ...overrides,
  };
}

function resource(overrides: Partial<Resource> = {}): Resource {
  return {
    name: "Mana",
    value: 50,
    maxValue: 100,
    description: "Magical energy",
    symbol: "✨",
    ...overrides,
  };
}

function toolCall(name: string, args: Record<string, unknown>): ToolCall {
  return {
    id: `tc_${Math.random().toString(36).slice(2)}`,
    type: "function",
    function: { name, arguments: args },
  };
}

describe("TOOL_DISPATCH - direct typed tool execution", () => {
  describe("complete_goal", () => {
    it("completes an active goal", () => {
      const storyData = createTestStory({
        goals: [goal({ title: "Save the Village" })],
      });

      const { responses } = executeTools(
        [toolCall("complete_goal", { title: "Save the Village" })],
        storyData
      );

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      expect(responses[0].message).toContain("Completed goal");
      expect(storyData.goals[0].fulfilled).toBe(true);
    });

    it("reports partial success when the goal was already completed", () => {
      const storyData = createTestStory({
        goals: [goal({ title: "Save the Village", fulfilled: true })],
      });

      const { responses } = executeTools(
        [toolCall("complete_goal", { title: "Save the Village" })],
        storyData
      );

      expect(responses[0].success).toBe("partial");
      expect(responses[0].message).toContain("already completed");
    });
  });

  describe("delete_goal (bug fix - previously always failed)", () => {
    it("deletes an existing goal by fuzzy title match", () => {
      const storyData = createTestStory({
        goals: [
          goal({ title: "Save the Village" }),
          goal({ title: "Find the Amulet" }),
        ],
      });

      const { responses } = executeTools(
        [toolCall("delete_goal", { title: "Save the Village" })],
        storyData
      );

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      expect(responses[0].message).toContain("Deleted goal");
      // This is the regression check: previously this tool built
      // `/delete_goal: ...` which had no regex handler, so
      // executeCommandWithResponse returned null and the message was
      // always "Command execution returned null".
      expect(responses[0].message).not.toContain("returned null");
      expect(storyData.goals).toHaveLength(1);
      expect(storyData.goals[0].title).toBe("Find the Amulet");
    });

    it("reports not-found for a nonexistent goal", () => {
      const storyData = createTestStory({
        goals: [goal({ title: "Save the Village" })],
      });

      const { responses } = executeTools(
        [toolCall("delete_goal", { title: "Nonexistent Goal" })],
        storyData
      );

      expect(responses[0].success).toBe(false);
      expect(responses[0].message).toContain("not found");
      expect(storyData.goals).toHaveLength(1);
    });
  });

  describe("delete_note (bug fix - previously always failed)", () => {
    it("deletes an existing note by fuzzy title match", () => {
      const storyData = createTestStory({
        lore: [
          {
            title: "The Ancient Temple",
            content: "A forgotten temple",
            relatedCharacters: [],
            relatedLocations: [],
            secrtet: false,
            keys: [],
            on: true,
          },
          {
            title: "The Merchant Aldric",
            content: "A traveling merchant",
            relatedCharacters: [],
            relatedLocations: [],
            secrtet: false,
            keys: [],
            on: true,
          },
        ],
      });

      const { responses } = executeTools(
        [toolCall("delete_note", { title: "The Ancient Temple" })],
        storyData
      );

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      expect(responses[0].message).toContain("Deleted note");
      // Regression check - previously this built `/note_delete: ...`
      // which had no regex handler anywhere in commandResponses.ts.
      expect(responses[0].message).not.toContain("returned null");
      expect(storyData.lore).toHaveLength(1);
      expect(storyData.lore[0].title).toBe("The Merchant Aldric");
    });

    it("reports not-found for a nonexistent note", () => {
      const storyData = createTestStory({
        lore: [
          {
            title: "The Ancient Temple",
            content: "A forgotten temple",
            relatedCharacters: [],
            relatedLocations: [],
            secrtet: false,
            keys: [],
            on: true,
          },
        ],
      });

      const { responses } = executeTools(
        [toolCall("delete_note", { title: "Nonexistent Note Title Xyz" })],
        storyData
      );

      expect(responses[0].success).toBe(false);
      expect(responses[0].message).toContain("not found");
      expect(storyData.lore).toHaveLength(1);
    });
  });

  describe("update_goal", () => {
    it("updates both description and shortDescription in a single call", () => {
      const storyData = createTestStory({
        goals: [goal({ title: "Save the Village" })],
      });

      const { responses } = executeTools(
        [
          toolCall("update_goal", {
            title: "Save the Village",
            description: "A new, more detailed description of the threat.",
            shortDescription: "Dragon attack!",
          }),
        ],
        storyData
      );

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      expect(storyData.goals[0].description).toBe(
        "A new, more detailed description of the threat."
      );
      expect(storyData.goals[0].shortDescription).toBe("Dragon attack!");
    });
  });

  describe("modify_ability", () => {
    it("applies multiple fields (description, stat, maxCooldown) in one call", () => {
      const storyData = createTestStory({
        stats: [{ name: "Magic", value: 5, description: "", symbol: "" }],
        abilities: [ability({ name: "Fireball", description: "Old desc" })],
      });

      const { responses } = executeTools(
        [
          toolCall("modify_ability", {
            name: "Fireball",
            description: "A bigger, badder fireball",
            stat: "Magic",
            maxCooldown: 3,
          }),
        ],
        storyData
      );

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
      // All three fields should be reflected in the combined message
      expect(responses[0].message).toContain("description");
      expect(responses[0].message).toContain("stat");
      expect(responses[0].message).toContain("maxCooldown");
      expect(storyData.abilities[0].description).toBe(
        "A bigger, badder fireball"
      );
      expect(storyData.abilities[0].stat).toBe("Magic");
      // maxCooldown isn't a formally declared Ability field (a pre-existing
      // quirk inherited from the old regex block this replaces - see
      // applyModifyAbility), but is set/read consistently at runtime.
      const patchedAbility = storyData.abilities[0] as unknown as {
        maxCooldown: number;
      };
      expect(patchedAbility.maxCooldown).toBe(3);
    });

    it("fails when no modification fields are provided", () => {
      const storyData = createTestStory({
        abilities: [ability({ name: "Fireball" })],
      });

      const { responses } = executeTools(
        [toolCall("modify_ability", { name: "Fireball" })],
        storyData
      );

      expect(responses[0].success).toBe(false);
      expect(responses[0].message).toContain("No modifications");
    });
  });

  // NOTE: adjust_resource, reduce_cooldown, and refresh_ability are not
  // currently registered in TOOL_MAP (app/misc/toolSchemas.ts) - this
  // predates this refactor (the old convertToolToCommand/inline special
  // case for these names was equally unreachable via executeTools, since
  // TOOL_MAP validation runs before any dispatch). They're still wired
  // into TOOL_DISPATCH per the task's scope, and are tested here by
  // calling the exported apply* functions directly, which exercises the
  // actual new dispatch logic without depending on that separate,
  // out-of-scope TOOL_MAP gap.
  describe("adjust_resource (apply function - not yet reachable via TOOL_MAP)", () => {
    it("clamps at maxValue when increasing past the cap", () => {
      const storyData = createTestStory({
        resources: [resource({ name: "Mana", value: 90, maxValue: 100 })],
      });

      const response = applyAdjustResource({ name: "Mana", delta: 50 }, storyData);

      expect(response?.success).toBe(true);
      expect(storyData.resources[0].value).toBe(100);
    });

    it("clamps at 0 when decreasing past the floor", () => {
      const storyData = createTestStory({
        resources: [resource({ name: "Mana", value: 10, maxValue: 100 })],
      });

      const response = applyAdjustResource(
        { name: "Mana", delta: -50 },
        storyData
      );

      expect(response?.success).toBe(true);
      expect(storyData.resources[0].value).toBe(0);
    });
  });

  describe("fail_goal", () => {
    it("deactivates an active, unfulfilled goal", () => {
      const storyData = createTestStory({
        goals: [goal({ title: "Save the Village" })],
      });

      const { responses } = executeTools(
        [toolCall("fail_goal", { title: "Save the Village" })],
        storyData
      );

      expect(responses[0].success).toBe(true);
      expect(storyData.goals[0].active).toBe(false);
    });
  });

  describe("remove_ability / upgrade_ability / reduce_cooldown / reset_ability_cooldown", () => {
    it("removes an ability", () => {
      const storyData = createTestStory({
        abilities: [ability({ name: "Fireball" }), ability({ name: "Heal" })],
      });

      const { responses } = executeTools(
        [toolCall("remove_ability", { name: "Fireball" })],
        storyData
      );

      expect(responses[0].success).toBe(true);
      expect(storyData.abilities).toHaveLength(1);
      expect(storyData.abilities[0].name).toBe("Heal");
    });

    it("upgrades an ability to the next grade (ignoring the requested newGrade, matching prior behavior)", () => {
      const storyData = createTestStory({
        abilities: [ability({ name: "Fireball", grade: "novice" })],
      });

      // The tool schema requires `newGrade`, but applyUpgradeAbility - like
      // the regex block it replaces - always advances exactly one grade via
      // ABILITY_GRADE_ORDER regardless of what newGrade was requested. This
      // preserves the pre-existing behavior faithfully rather than changing it.
      const { responses } = executeTools(
        [
          toolCall("upgrade_ability", {
            name: "Fireball",
            newGrade: "legendary",
          }),
        ],
        storyData
      );

      expect(responses[0].success).toBe(true);
      expect(storyData.abilities[0].grade).toBe("apprentice");
    });

    it("reduce_cooldown (apply function) lowers the current cooldown by the given amount", () => {
      const storyData = createTestStory({
        abilities: [ability({ name: "Fireball", cooldown: 3 })],
      });

      const response = applyReduceCooldown(
        { name: "Fireball", amount: 2 },
        storyData
      );

      expect(response?.success).toBe(true);
      expect(storyData.abilities[0].cooldown).toBe(1);
    });

    it("reset_ability_cooldown (via executeTools) fully clears cooldown", () => {
      const storyData = createTestStory({
        abilities: [ability({ name: "Fireball", cooldown: 3 })],
      });

      const { responses } = executeTools(
        [toolCall("reset_ability_cooldown", { name: "Fireball" })],
        storyData
      );

      expect(responses[0].success).toBe(true);
      expect(storyData.abilities[0].cooldown).toBe(0);
    });

    it("applyResetAbilityCooldown (shared impl for refresh_ability) fully clears cooldown", () => {
      const storyData = createTestStory({
        abilities: [ability({ name: "Fireball", cooldown: 3 })],
      });

      const response = applyResetAbilityCooldown(
        { name: "Fireball" },
        storyData
      );

      expect(response?.success).toBe(true);
      expect(storyData.abilities[0].cooldown).toBe(0);
    });
  });
});
