/**
 * Tool Call History Tests
 *
 * Verifies that tool calls and their responses are properly preserved
 * in conversation history and reconstructed in AI context.
 */

import { describe, it, expect } from "vitest";
import { buildMessages } from "../app/misc/ai";
import { StoryData, CommandResponse } from "../app/misc/structs";

describe("Tool Call History Preservation", () => {
  const createTestStory = (): StoryData => ({
    story_name: "Test Story",
    premise: "Test premise",
    player_name: "Test Player",
    player_summary: "Test summary",
    intro: "Test intro",
    stats: [],
    resources: [],
    inventory: [],
    achievements: [],
    abilities: [],
    level: 1,
    upgradesSpent: 0,
    conditions: [],
    lore: [],
    memory: [],
    quests: [],
    relationships: [],
    scene: {
      parts: [],
    },
    chapters: [],
    currentChapter: 0,
    max_chapters: 10,
    points: 0,
    momentum: 0,
    maxMomentum: 10,
    earnedPointsFromChapters: [],
    earnedPointsFromQuests: [],
  });

  it("should include tool calls in assistant messages", () => {
    const storyData = createTestStory();

    // Need at least 2 parts to avoid "first interaction" path
    storyData.scene.parts.push({
      content: "You enter the dungeon.",
      imageUrl: "",
      user: true,
      role: "user",
      choices: [],
    });

    // Add a scene part with tool calls
    storyData.scene.parts.push({
      content: "You find a mysterious sword.",
      imageUrl: "",
      user: false,
      role: "assistant",
      choices: [],
      toolCalls: [
        {
          id: "call_123",
          type: "function",
          function: {
            name: "add_item",
            arguments: {
              name: "Mysterious Sword",
              description: "A glowing blade",
              type: "normal",
              quantity: 1,
            },
          },
        },
      ],
      toolResponses: [],
    });

    const { messages } = buildMessages({ storyData });

    // Find the assistant message
    const assistantMessage = messages.find(
      (m) => m.role === "assistant" && m.content?.includes("mysterious sword")
    );

    expect(assistantMessage).toBeDefined();
    expect(assistantMessage?.tool_calls).toBeDefined();
    expect(assistantMessage?.tool_calls).toHaveLength(1);
    expect(assistantMessage?.tool_calls?.[0].function.name).toBe("add_item");
  });

  it("should include tool responses as separate tool messages", () => {
    const storyData = createTestStory();

    const toolResponses: CommandResponse[] = [
      {
        command: "add_item",
        success: true,
        message: "Added Mysterious Sword to inventory",
        timestamp: Date.now(),
        toolCallId: "call_123",
      },
    ];

    // Need at least 2 parts to avoid "first interaction" path
    storyData.scene.parts.push({
      content: "You enter the dungeon.",
      imageUrl: "",
      user: true,
      role: "user",
      choices: [],
    });

    // Add a scene part with tool calls and responses
    storyData.scene.parts.push({
      content: "You find a mysterious sword.",
      imageUrl: "",
      user: false,
      role: "assistant",
      choices: [],
      toolCalls: [
        {
          id: "call_123",
          type: "function",
          function: {
            name: "add_item",
            arguments: {
              name: "Mysterious Sword",
              description: "A glowing blade",
              type: "normal",
              quantity: 1,
            },
          },
        },
      ],
      toolResponses,
    });

    const { messages } = buildMessages({ storyData });

    // Should have assistant message followed by tool message
    const assistantIndex = messages.findIndex(
      (m) => m.role === "assistant" && m.content?.includes("mysterious sword")
    );
    expect(assistantIndex).toBeGreaterThanOrEqual(0);

    // Tool message should come after assistant message
    const toolMessage = messages[assistantIndex + 1];
    expect(toolMessage?.role).toBe("tool");
    expect(toolMessage?.tool_call_id).toBe("call_123");
    expect(toolMessage?.content).toContain("✓");
    expect(toolMessage?.content).toContain(
      "Added Mysterious Sword to inventory"
    );
  });

  it("should handle multiple tool calls and responses", () => {
    const storyData = createTestStory();

    const toolResponses: CommandResponse[] = [
      {
        command: "add_item",
        success: true,
        message: "Added Health Potion to inventory",
        timestamp: Date.now(),
        toolCallId: "call_1",
      },
      {
        command: "adjust_resource",
        success: true,
        message: "Health: 80 → 100/100 (+20)",
        timestamp: Date.now(),
        toolCallId: "call_2",
      },
      {
        command: "add_memory",
        success: true,
        message: 'Added memory: "Found healing supplies in the old cabin"',
        timestamp: Date.now(),
        toolCallId: "call_3",
      },
    ];

    storyData.scene.parts.push({
      content: "You explore the area.",
      imageUrl: "",
      user: true,
      role: "user",
      choices: [],
    });

    storyData.scene.parts.push({
      content: "You discover a cache of healing supplies in an old cabin.",
      imageUrl: "",
      user: false,
      role: "assistant",
      choices: [],
      toolCalls: [
        {
          id: "call_1",
          type: "function",
          function: {
            name: "add_item",
            arguments: {
              name: "Health Potion",
              description: "Restores health",
              type: "consumable",
              quantity: 3,
            },
          },
        },
        {
          id: "call_2",
          type: "function",
          function: {
            name: "adjust_resource",
            arguments: { name: "Health", currentDelta: 20 },
          },
        },
        {
          id: "call_3",
          type: "function",
          function: {
            name: "add_memory",
            arguments: { entry: "Found healing supplies in the old cabin" },
          },
        },
      ],
      toolResponses,
    });

    const { messages } = buildMessages({ storyData });

    // Find assistant message
    const assistantIndex = messages.findIndex(
      (m) => m.role === "assistant" && m.content?.includes("healing supplies")
    );
    expect(assistantIndex).toBeGreaterThanOrEqual(0);

    // Should have 3 tool messages following
    const toolMessages = messages.slice(assistantIndex + 1, assistantIndex + 4);
    expect(toolMessages).toHaveLength(3);

    toolMessages.forEach((msg, idx) => {
      expect(msg.role).toBe("tool");
      expect(msg.tool_call_id).toBe(`call_${idx + 1}`);
      expect(msg.content).toContain("✓");
    });

    expect(toolMessages[0].content).toContain("Health Potion");
    expect(toolMessages[1].content).toContain("Health: 80 → 100/100");
    expect(toolMessages[2].content).toContain("Found healing supplies");
  });

  it("should mark failed tool calls with ✗", () => {
    const storyData = createTestStory();

    const toolResponses: CommandResponse[] = [
      {
        command: "adjust_resource",
        success: false,
        message: 'Resource "Mana" not found',
        timestamp: Date.now(),
        toolCallId: "call_fail",
      },
    ];

    storyData.scene.parts.push({
      content: "You attempt magic.",
      imageUrl: "",
      user: true,
      role: "user",
      choices: [],
    });

    storyData.scene.parts.push({
      content: "You try to restore your magical energy.",
      imageUrl: "",
      user: false,
      role: "assistant",
      choices: [],
      toolCalls: [
        {
          id: "call_fail",
          type: "function",
          function: {
            name: "adjust_resource",
            arguments: { name: "Mana", currentDelta: 10 },
          },
        },
      ],
      toolResponses,
    });

    const { messages } = buildMessages({ storyData });

    const toolMessage = messages.find(
      (m) => m.role === "tool" && m.tool_call_id === "call_fail"
    );
    expect(toolMessage).toBeDefined();
    expect(toolMessage?.content).toContain("✗");
    expect(toolMessage?.content).toContain("not found");
  });

  it("should preserve tool history across multiple turns", () => {
    const storyData = createTestStory();

    // Turn 1: User enters, AI responds with tool call
    storyData.scene.parts.push({
      content: "You enter the shop.",
      imageUrl: "",
      user: true,
      role: "user",
      choices: [],
    });

    storyData.scene.parts.push({
      content: "The shopkeeper greets you warmly.",
      imageUrl: "",
      user: false,
      role: "assistant",
      choices: [],
      toolCalls: [
        {
          id: "call_a",
          type: "function",
          function: {
            name: "add_relationship",
            arguments: {
              name: "Shopkeeper",
              value: 10,
              description: "Friendly merchant",
            },
          },
        },
      ],
      toolResponses: [
        {
          command: "add_relationship",
          success: true,
          message: "Added relationship: Shopkeeper (+10)",
          timestamp: Date.now(),
          toolCallId: "call_a",
        },
      ],
    });

    // Turn 2: User buys something, AI responds with tool call
    storyData.scene.parts.push({
      content: "I buy a health potion.",
      imageUrl: "",
      user: true,
      role: "user",
      choices: [],
    });

    storyData.scene.parts.push({
      content: "The shopkeeper hands you the potion with a smile.",
      imageUrl: "",
      user: false,
      role: "assistant",
      choices: [],
      toolCalls: [
        {
          id: "call_b",
          type: "function",
          function: {
            name: "add_item",
            arguments: {
              name: "Health Potion",
              description: "Restores 50 HP",
              type: "consumable",
              quantity: 1,
            },
          },
        },
      ],
      toolResponses: [
        {
          command: "add_item",
          success: true,
          message: "Added Health Potion to inventory",
          timestamp: Date.now(),
          toolCallId: "call_b",
        },
      ],
    });

    const { messages } = buildMessages({ storyData });

    // Should have both tool responses in history
    const toolMessages = messages.filter((m) => m.role === "tool");
    expect(toolMessages).toHaveLength(2);

    expect(toolMessages[0].tool_call_id).toBe("call_a");
    expect(toolMessages[0].content).toContain("Shopkeeper");

    expect(toolMessages[1].tool_call_id).toBe("call_b");
    expect(toolMessages[1].content).toContain("Health Potion");
  });
});
