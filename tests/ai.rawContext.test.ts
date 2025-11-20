import { describe, it, expect } from "vitest";
import { outputToScenePart, buildMessages } from "../app/misc/ai";
import { StoryData, ScenePart } from "../app/misc/structs";

describe("Raw Context Feature", () => {
  // Test that raw output is preserved
  it("preserves raw AI output in ScenePart", () => {
    const rawText = `<story>
You enter the dungeon. Dark shadows dance on the walls.
</story>

<memory>
- Entered the dungeon
</memory>

<choices>
- Go left
- Go right <use_skill: Perception (DC 100)>
</choices>`;

    const part = outputToScenePart(rawText);

    expect(part.raw).toBeDefined();
    expect(part.raw).toBe(rawText);
    expect(part.content).toContain("You enter the dungeon");
    expect(part.memoryEntries).toHaveLength(1);
    expect(part.choices).toHaveLength(2);
  });

  // Test that buildMessages uses parsed content by default
  it("uses parsed content when useRawContext is false", () => {
    const storyData: StoryData = {
      story_name: "Test Story",
      premise: "A test adventure",
      player_name: "Hero",
      player_summary: "A brave hero",
      intro: "You wake up in a forest.",
      stats: [
        {
          name: "Strength",
          value: 50,
          description: "Physical power",
          symbol: "💪",
        },
      ],
      resources: [
        {
          name: "Health",
          value: 100,
          maxValue: 100,
          description: "Life force",
          symbol: "❤️",
        },
      ],
      inventory: [],
      achievements: [],
      lore: [],
      plot_beats: [],
      memory: [],
      chapters: [],
      currentChapter: 0,
      scene: {
        parts: [
          {
            content: "You see a path ahead.",
            imageUrl: "",
            user: true,
            role: "user",
            raw: undefined,
          },
          {
            content: "The path leads to a village.",
            imageUrl: "",
            user: false,
            role: "assistant",
            raw: "<story>The path leads to a village.</story>\n<choices>\n- Enter village\n- Go back\n</choices>",
            choices: [{ text: "Enter village" }, { text: "Go back" }],
          },
        ],
      },
      momentum: 0,
      maxMomentum: 3,
      points: 0,
      author_notes: "",
      player_notes: "",
      newGamePlusCount: 0,
      newGamePlusMode: false,
      quests: [],
      max_chapters: 10,
      earnedPointsFromBeats: [],
      earnedPointsFromChapters: [],
      earnedPointsFromQuests: [],
      upgradeSettings: {
        enabled: true,
        allowStatUpgrade: true,
        allowResourceUpgrade: true,
        allowAddItem: true,
        statUpgradeCost: 10,
        statUpgradeAmount: 1,
        resourceUpgradeCost: 15,
        resourceUpgradeAmount: 10,
        addItemCost: 20,
        statShopEnabled: false,
        resourceShopEnabled: false,
        itemShopEnabled: false,
        statShop: [],
        resourceShop: [],
        itemShop: [],
      },
    };

    const messages = buildMessages({ storyData, useRawContext: false });

    // Find the assistant message
    const assistantMessage = messages.find(
      (m) => m.role === "assistant" && m.content.includes("village")
    );

    expect(assistantMessage).toBeDefined();
    expect(assistantMessage?.content).toBe("The path leads to a village.");
    expect(assistantMessage?.content).not.toContain("<story>");
    expect(assistantMessage?.content).not.toContain("<choices>");
  });

  // Test that buildMessages uses raw output when enabled
  it("uses raw AI output when useRawContext is true", () => {
    const rawOutput =
      "<story>The path leads to a village.</story>\n<choices>\n- Enter village\n- Go back\n</choices>";

    const storyData: StoryData = {
      story_name: "Test Story",
      premise: "A test adventure",
      player_name: "Hero",
      player_summary: "A brave hero",
      intro: "You wake up in a forest.",
      stats: [
        {
          name: "Strength",
          value: 50,
          description: "Physical power",
          symbol: "💪",
        },
      ],
      resources: [
        {
          name: "Health",
          value: 100,
          maxValue: 100,
          description: "Life force",
          symbol: "❤️",
        },
      ],
      inventory: [],
      achievements: [],
      lore: [],
      plot_beats: [],
      memory: [],
      chapters: [],
      currentChapter: 0,
      scene: {
        parts: [
          {
            content: "You see a path ahead.",
            imageUrl: "",
            user: true,
            role: "user",
            raw: undefined,
          },
          {
            content: "The path leads to a village.",
            imageUrl: "",
            user: false,
            role: "assistant",
            raw: rawOutput,
            choices: [{ text: "Enter village" }, { text: "Go back" }],
          },
        ],
      },
      momentum: 0,
      maxMomentum: 3,
      points: 0,
      author_notes: "",
      player_notes: "",
      newGamePlusCount: 0,
      newGamePlusMode: false,
      quests: [],
      max_chapters: 10,
      earnedPointsFromBeats: [],
      earnedPointsFromChapters: [],
      earnedPointsFromQuests: [],
      upgradeSettings: {
        enabled: true,
        allowStatUpgrade: true,
        allowResourceUpgrade: true,
        allowAddItem: true,
        statUpgradeCost: 10,
        statUpgradeAmount: 1,
        resourceUpgradeCost: 15,
        resourceUpgradeAmount: 10,
        addItemCost: 20,
        statShopEnabled: false,
        resourceShopEnabled: false,
        itemShopEnabled: false,
        statShop: [],
        resourceShop: [],
        itemShop: [],
      },
    };

    const messages = buildMessages({ storyData, useRawContext: true });

    // Find the assistant message
    const assistantMessage = messages.find(
      (m) => m.role === "assistant" && m.content.includes("village")
    );

    expect(assistantMessage).toBeDefined();
    expect(assistantMessage?.content).toBe(rawOutput);
    expect(assistantMessage?.content).toContain("<story>");
    expect(assistantMessage?.content).toContain("<choices>");
  });

  // Test that user messages are never affected by raw context setting
  it("never uses raw output for user messages", () => {
    const storyData: StoryData = {
      story_name: "Test Story",
      premise: "A test adventure",
      player_name: "Hero",
      player_summary: "A brave hero",
      intro: "You wake up in a forest.",
      stats: [],
      resources: [],
      inventory: [],
      achievements: [],
      lore: [],
      plot_beats: [],
      memory: [],
      chapters: [],
      currentChapter: 0,
      scene: {
        parts: [
          {
            content: "I choose to go left.",
            imageUrl: "",
            user: true,
            role: "user",
            raw: "This should never be used",
          },
        ],
      },
      momentum: 0,
      maxMomentum: 3,
      points: 0,
      author_notes: "",
      player_notes: "",
      newGamePlusCount: 0,
      newGamePlusMode: false,
      quests: [],
      max_chapters: 10,
      earnedPointsFromBeats: [],
      earnedPointsFromChapters: [],
      earnedPointsFromQuests: [],
      upgradeSettings: {
        enabled: true,
        allowStatUpgrade: true,
        allowResourceUpgrade: true,
        allowAddItem: true,
        statUpgradeCost: 10,
        statUpgradeAmount: 1,
        resourceUpgradeCost: 15,
        resourceUpgradeAmount: 10,
        addItemCost: 20,
        statShopEnabled: false,
        resourceShopEnabled: false,
        itemShopEnabled: false,
        statShop: [],
        resourceShop: [],
        itemShop: [],
      },
    };

    const messagesWithRaw = buildMessages({ storyData, useRawContext: true });
    const messagesWithoutRaw = buildMessages({
      storyData,
      useRawContext: false,
    });

    const userMessageWithRaw = messagesWithRaw.find(
      (m) => m.role === "user" && m.content.includes("left")
    );
    const userMessageWithoutRaw = messagesWithoutRaw.find(
      (m) => m.role === "user" && m.content.includes("left")
    );

    expect(userMessageWithRaw?.content).toBe("I choose to go left.");
    expect(userMessageWithoutRaw?.content).toBe("I choose to go left.");
    expect(userMessageWithRaw?.content).not.toContain(
      "This should never be used"
    );
  });

  // Test that parts without raw field fall back to content
  it("falls back to parsed content when raw is undefined", () => {
    const storyData: StoryData = {
      story_name: "Test Story",
      premise: "A test adventure",
      player_name: "Hero",
      player_summary: "A brave hero",
      intro: "You wake up in a forest.",
      stats: [],
      resources: [],
      inventory: [],
      achievements: [],
      lore: [],
      plot_beats: [],
      memory: [],
      chapters: [],
      currentChapter: 0,
      scene: {
        parts: [
          {
            content: "You see a path ahead.",
            imageUrl: "",
            user: true,
            role: "user",
          },
          {
            content: "A mysterious fog appears.",
            imageUrl: "",
            user: false,
            role: "assistant",
            // raw is undefined - old story data before feature was added
          },
        ],
      },
      momentum: 0,
      maxMomentum: 3,
      points: 0,
      author_notes: "",
      player_notes: "",
      newGamePlusCount: 0,
      newGamePlusMode: false,
      quests: [],
      max_chapters: 10,
      earnedPointsFromBeats: [],
      earnedPointsFromChapters: [],
      earnedPointsFromQuests: [],
      upgradeSettings: {
        enabled: true,
        allowStatUpgrade: true,
        allowResourceUpgrade: true,
        allowAddItem: true,
        statUpgradeCost: 10,
        statUpgradeAmount: 1,
        resourceUpgradeCost: 15,
        resourceUpgradeAmount: 10,
        addItemCost: 20,
        statShopEnabled: false,
        resourceShopEnabled: false,
        itemShopEnabled: false,
        statShop: [],
        resourceShop: [],
        itemShop: [],
      },
    };

    const messages = buildMessages({ storyData, useRawContext: true });

    const assistantMessage = messages.find((m) => m.role === "assistant");

    // Should fall back to content when raw is undefined
    expect(assistantMessage?.content).toBe("A mysterious fog appears.");
  });

  // Test with complex raw output including all tags
  it("preserves complex raw output with all tag types", () => {
    const complexRaw = `<story>
The dragon roars, flames licking at your armor!
</story>

<memory>
- Entered dragon's lair
- Survived first attack
</memory>

<choices>
- Attack with sword <use_skill: Combat (DC 150); use_resource: Stamina>
- Cast fireball <use_skill: Magic (DC 120); use_resource: Mana>
- Use dragon scale shield <use_item: Dragon Scale; item_loss: false>
- Flee to safety
</choices>

<commands>
/trigger_achievement: Dragon Slayer
/add_item: Dragon Tooth | A sharp tooth from a mighty dragon | story | 1
</commands>

!!! END CHAPTER !!!`;

    const part = outputToScenePart(complexRaw);

    expect(part.raw).toBe(complexRaw);
    expect(part.content).toContain("The dragon roars");
    expect(part.memoryEntries).toHaveLength(2);
    expect(part.choices).toHaveLength(4);
    expect(part.commands).toHaveLength(2);
    expect(part.endChapter).toBe(true);

    // Verify choice metadata was parsed
    expect(part.choices?.[0].skill_used).toBe("Combat");
    expect(part.choices?.[0].skill_dc).toBe(150);
    expect(part.choices?.[2].item_used).toBe("Dragon Scale");
  });
});
