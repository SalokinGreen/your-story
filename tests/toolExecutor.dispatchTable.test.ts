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
import type { Goal, StoryData } from "@/app/misc/structs";

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
});
