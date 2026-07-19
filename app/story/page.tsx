"use client";

import {
  Scene,
  ScenePart,
  StoryData,
  StoryLore,
  Choices,
  Choice,
  Resource,
  InventoryItem,
  Ability,
  Preset,
  CommandResponse,
  getMemoryContent,
  deduplicateMemories,
  NPCReaction,
  Adventure,
} from "../misc/structs";
import {
  askFate,
  generateElement,
  generateEventFocus,
  generateEventMeaning,
  type Likelihood,
  type ElementCategory,
} from "../misc/mythic";
import { NARRATION_MODEL_KEY } from "../misc/reasoningTiers";
import Story from "./story";
import LorePage from "./lore";
import QuestsPage from "./quests";
import AchievementsPage from "./achievements";
import NPCsPage from "./npcs";
import MenuPage from "./menu";
import { StoryTabBar } from "./StoryTabBar";
import LogViewer from "./LogViewer";
import ContextViewer from "./ContextViewer";
import StoryCreativeAssistant from "../components/StoryCreativeAssistant";
import { logger } from "../misc/logger";
import { useState, useEffect, useRef, Suspense } from "react";
import { useNotification } from "../misc/NotificationContext";
import { useAPIKeys } from "../misc/APIKeysContext";
import { useSearchParams, useRouter } from "next/navigation";

// Helper function to get models for generation options.
// storyModel/toolsModel/choicesModel are no longer read from presets or
// localStorage - the reasoning-tier router (generation.ts) picks the actual
// model per stage/turn internally. These fields stay on GenerationOptions
// for type compatibility with other callers, filled with the narration
// model as an inert default that's never actually dispatched to.
function getModelsFromPreset() {
  if (typeof window === "undefined") {
    return {
      storyModel: NARRATION_MODEL_KEY,
      toolsModel: NARRATION_MODEL_KEY,
      choicesModel: NARRATION_MODEL_KEY,
      novelaiEnabled: false,
      novelaiKey: "",
      novelaiTemperature: 1,
    };
  }

  // NovelAI settings (BYOK for story stage only) - still user-configurable
  const novelaiEnabled = localStorage.getItem("novelaiEnabled") === "true";
  const novelaiKey = localStorage.getItem("novelaiKey") || "";
  const novelaiTemperature = parseFloat(
    localStorage.getItem("novelaiTemperature") || "1",
  );

  return {
    storyModel: NARRATION_MODEL_KEY,
    toolsModel: NARRATION_MODEL_KEY,
    choicesModel: NARRATION_MODEL_KEY,
    novelaiEnabled,
    novelaiKey,
    novelaiTemperature,
  };
}

import { DEFAULT_PRESET } from "../misc/presets";
import ConfirmDialog from "../components/ConfirmDialog";
import SyncConflictModal from "../components/SyncConflictModal";
import SyncIndicator from "../components/SyncIndicator";
import { authenticatedFetch, getAuthToken } from "../misc/getAuthToken";
import {
  syncLoreEmbeddings,
  syncNewMemories,
  getExistingEmbeddingKeys,
} from "../misc/embeddings";
import { getModelConfig } from "../misc/ai_prices";
import { processLoreTriggers } from "../misc/lore";
import { fillTemplate } from "../misc/characterSheetTemplate";
import { DynamicIcon } from "../components/DynamicIcon";
import { DiceVisualizer } from "../components/DiceVisualizer";
import {
  generateCommandResponses,
  formatResponsesForAI,
  executeCommandWithResponse,
} from "../misc/commandResponses";
import {
  findItemMatch,
  findResourceMatch,
  findStatMatch,
  findQuestMatch,
  findRelationshipMatch,
  findLoreMatch,
} from "../misc/fuzzyMatch";
import { outputToScenePart } from "../misc/ai";
import { generateStoryTurn, analyzeAction } from "../misc/generation";
import {
  GMToolResult,
  GMNPCReactionResult,
  GMFormulaRollResult,
} from "../misc/gmExecutor";
import { tickCooldowns } from "../misc/abilitySystem";
import CharacterCreationForm from "./create-character/form";
import { NPCReactionContainer } from "./NPCReactionToast";
import { getSamplingSettings } from "../misc/samplingSettings";

// Cryptographically secure random number generator
// Returns a random integer between min (inclusive) and max (inclusive)
function getSecureRandomInt(min: number, max: number): number {
  const range = max - min + 1;
  const bytesNeeded = Math.ceil(Math.log2(range) / 8);
  const maxValue = Math.pow(256, bytesNeeded);
  const randomValues = new Uint8Array(bytesNeeded);

  // Rejection sampling to avoid modulo bias
  let randomNumber;
  do {
    crypto.getRandomValues(randomValues);
    randomNumber = randomValues.reduce(
      (acc, val, i) => acc + val * Math.pow(256, i),
      0,
    );
  } while (randomNumber >= maxValue - (maxValue % range));

  return min + (randomNumber % range);
}

// Helper to track player actions between turns (shown to AI on next generation)
function trackPlayerAction(storyData: StoryData, action: string) {
  if (!storyData.pendingPlayerActions) {
    storyData.pendingPlayerActions = [];
  }
  storyData.pendingPlayerActions.push(action);
}

// Helper to trigger notifications for quest-related tool responses
function processQuestNotifications(
  toolResponses: CommandResponse[],
  addNotification: (
    message: string,
    type: "success" | "failure" | "info" | "warning",
  ) => void,
) {
  for (const response of toolResponses) {
    if (!response.success) continue;

    const command = response.command.toLowerCase();

    // Quest created
    if (command.includes("/create_quest:")) {
      // Extract quest title from message like 'Created quest "Title" (X points)'
      const match = response.message.match(/Created quest "([^"]+)"/);
      if (match) {
        addNotification(`📜 New Quest: ${match[1]}`, "info");
      }
    }

    // Quest completed
    if (command.includes("/complete_quest:")) {
      const match = response.message.match(/Completed quest "([^"]+)"/);
      if (match) {
        const pointsMatch = response.message.match(/\+(\d+) points/);
        if (pointsMatch) {
          addNotification(
            `✅ Quest Complete: ${match[1]} (+${pointsMatch[1]} points)`,
            "success",
          );
        } else {
          addNotification(`✅ Quest Complete: ${match[1]}`, "success");
        }
      }
    }

    // Quest failed
    if (command.includes("/fail_quest:")) {
      const match = response.message.match(/Failed quest "([^"]+)"/);
      if (match) {
        addNotification(`❌ Quest Failed: ${match[1]}`, "warning");
      }
    }

    // Quest updated
    if (
      command.includes("/update_quest_description:") ||
      command.includes("/update_quest_short_description:")
    ) {
      const match = response.message.match(/Updated quest "([^"]+)"/);
      if (match) {
        addNotification(`📝 Quest Updated: ${match[1]}`, "info");
      }
    }

    // Quest deactivated
    if (command.includes("/deactivate_quest:")) {
      const match = response.message.match(/Deactivated quest "([^"]+)"/);
      if (match) {
        addNotification(`⏸️ Quest Deactivated: ${match[1]}`, "info");
      }
    }

    // Quest activated
    if (command.includes("/activate_quest:")) {
      const match = response.message.match(/Activated quest "([^"]+)"/);
      if (match) {
        addNotification(`▶️ Quest Activated: ${match[1]}`, "info");
      }
    }

    // Quest deleted
    if (command.includes("/delete_quest:")) {
      const match = response.message.match(/Deleted quest "([^"]+)"/);
      if (match) {
        addNotification(`🗑️ Quest Removed: ${match[1]}`, "info");
      }
    }
  }
}

enum StoryState {
  STORY = "STORY",
  STATS = "STATS",
  INVENTORY = "INVENTORY",
  LORE = "LORE",
  NPCS = "NPCS",
  QUESTS = "QUESTS",
  ACHIEVEMENTS = "ACHIEVEMENTS",
  MENU = "MENU",
  LOGS = "LOGS",
  CONTEXT = "CONTEXT",
  CHARACTER_CREATION = "CHARACTER_CREATION",
}

export function processCommands(
  commands: string[],
  storyData: StoryData,
  addNotification: (
    message: string,
    type: "success" | "failure" | "info" | "warning",
  ) => void,
) {
  logger.action("Processing commands", { commands });
  for (const command of commands) {
    const trimmed = command.trim();

    // /add_item: item name | description | type | quantity
    const addItemMatch = trimmed.match(
      /^\/add_item:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(normal|consumable|story|misc)\s*\|\s*(\d+)$/i,
    );
    if (addItemMatch) {
      const itemName = addItemMatch[1].trim();
      const description = addItemMatch[2].trim();
      const itemType = addItemMatch[3].trim().toLowerCase() as
        | "normal"
        | "consumable"
        | "story"
        | "misc";
      const quantity = parseInt(addItemMatch[4], 10);

      const existingItem = storyData.inventory.find((i) => i.name === itemName);
      if (existingItem) {
        existingItem.quantity += quantity;
        logger.action("Item quantity increased via command", {
          itemName,
          quantity,
          newTotal: existingItem.quantity,
        });
      } else {
        storyData.inventory.push({
          name: itemName,
          quantity: quantity,
          description: description,
          type: itemType,
          stat: "",
          resource: "",
          symbol: "??",
        });
        logger.action("New item added via command", {
          itemName,
          quantity,
          type: itemType,
        });
      }
      continue;
    }

    // /modify_item: item name(amount)
    const itemMatch = trimmed.match(/^\/modify_item:\s*(.+?)\(([+-]?\d+)\)$/i);
    if (itemMatch) {
      const itemName = itemMatch[1].trim();
      const amount = parseInt(itemMatch[2], 10);

      const itemIndex = storyData.inventory.findIndex(
        (i) => i.name === itemName,
      );
      if (itemIndex !== -1) {
        storyData.inventory[itemIndex].quantity += amount;
        if (storyData.inventory[itemIndex].quantity <= 0) {
          storyData.inventory.splice(itemIndex, 1);
          logger.action("Item removed via command", { itemName, amount });
        } else {
          logger.action("Item quantity modified via command", {
            itemName,
            amount,
            newTotal: storyData.inventory[itemIndex].quantity,
          });
        }
      } else if (amount > 0) {
        storyData.inventory.push({
          name: itemName,
          quantity: amount,
          description: "",
          type: "misc",
          stat: "",
          resource: "",
          symbol: "??",
        });
        logger.action("New item added via modify command", {
          itemName,
          amount,
        });
      }
      continue;
    }

    // /modify_item: item name | description | type (for updating item properties)
    const itemModifyPropsMatch = trimmed.match(
      /^\/modify_item:\s*(.+?)\s*\|\s*(.+?)(?:\s*\|\s*(.+))?$/i,
    );
    if (itemModifyPropsMatch) {
      const itemName = itemModifyPropsMatch[1].trim();
      const secondParam = itemModifyPropsMatch[2].trim();
      const thirdParam = itemModifyPropsMatch[3]?.trim();

      const matchResult = findItemMatch(itemName, storyData.inventory);
      const item = matchResult?.item;

      if (matchResult && !matchResult.isExact) {
        logger.info("Fuzzy matched item for modification", {
          aiProvided: itemName,
          matched: matchResult.name,
          score: matchResult.score,
        });
      }

      if (!item) {
        logger.warn("Item modification failed: item not found", { itemName });
      } else {
        // Determine what was passed: description, type, or both
        const validTypes = ["normal", "consumable", "story", "misc"];

        if (thirdParam && validTypes.includes(thirdParam.toLowerCase())) {
          // Both description and type provided
          item.description = secondParam;
          item.type = thirdParam.toLowerCase() as
            | "normal"
            | "consumable"
            | "story"
            | "misc";
          logger.action("Item description and type updated via command", {
            itemName: item.name,
            description: secondParam,
            type: thirdParam,
          });
        } else if (validTypes.includes(secondParam.toLowerCase())) {
          // Only type provided
          item.type = secondParam.toLowerCase() as
            | "normal"
            | "consumable"
            | "story"
            | "misc";
          logger.action("Item type updated via command", {
            itemName: item.name,
            type: secondParam,
          });
        } else {
          // Only description provided
          item.description = secondParam;
          logger.action("Item description updated via command", {
            itemName: item.name,
            description: secondParam,
          });
        }
      }
      continue;
    }

    // /trigger_achievement: achievement title
    const achievementMatch = trimmed.match(/^\/trigger_achievement:\s*(.+)$/i);
    if (achievementMatch) {
      const achievementTitle = achievementMatch[1].trim();

      // Use exact match only - no fuzzy matching
      const existing = storyData.achievements.find(
        (a) => a.title.toLowerCase() === achievementTitle.toLowerCase(),
      );

      if (existing && !existing.dateAchieved) {
        existing.dateAchieved = new Date();
        storyData.points = (storyData.points || 0) + existing.points;
        logger.action("Achievement unlocked via command", {
          title: existing.title,
          points: existing.points,
        });
        addNotification(`Achievement Unlocked: ${existing.title}`, "success");
        addNotification(`+${existing.points} points!`, "success");
      } else if (!existing) {
        logger.warn("Achievement not found - exact match required", {
          achievement: achievementTitle,
          availableAchievements: storyData.achievements.map((a) => a.title),
        });
        addNotification(
          `Achievement not found: ${achievementTitle}`,
          "warning",
        );
      }
      continue;
    }

    // /create_quest: title | short description | full description | points
    const createQuestMatch = trimmed.match(
      /^\/create_quest:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(\d+)$/i,
    );
    if (createQuestMatch) {
      const title = createQuestMatch[1].trim();
      const shortDesc = createQuestMatch[2].trim();
      const fullDesc = createQuestMatch[3].trim();
      const points = parseInt(createQuestMatch[4], 10);

      if (!storyData.quests) storyData.quests = [];
      if (!storyData.earnedPointsFromQuests)
        storyData.earnedPointsFromQuests = [];

      const newQuest = {
        id: `quest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title,
        shortDescription: shortDesc,
        description: fullDesc,
        active: true,
        fulfilled: false,
        points,
        createdAt: new Date(),
      };

      storyData.quests.push(newQuest);
      logger.action("New quest created via command", { title, points });
      addNotification(`New quest: ${title}`, "success");
      continue;
    }

    // /activate_quest: quest title
    const activateQuestMatch = trimmed.match(/^\/activate_quest:\s*(.+)$/i);
    if (activateQuestMatch) {
      const questTitle = activateQuestMatch[1].trim();
      if (!storyData.quests) storyData.quests = [];

      // Try fuzzy matching first
      const matchResult = findQuestMatch(questTitle, storyData.quests);
      const quest = matchResult?.item;

      // Log fuzzy match result
      if (matchResult && !matchResult.isExact) {
        logger.info("Fuzzy matched quest", {
          aiProvided: questTitle,
          matched: matchResult.name,
          score: matchResult.score,
        });
      }

      if (quest) {
        quest.active = true;
        logger.action("Quest activated via command", { title: quest.title });
      } else {
        logger.warn("Quest not found or no fuzzy match", {
          quest: questTitle,
        });
        addNotification(`Quest not found: ${questTitle}`, "warning");
      }
      continue;
    }

    // /complete_quest: quest title
    const completeQuestMatch = trimmed.match(/^\/complete_quest:\s*(.+)$/i);
    if (completeQuestMatch) {
      const questTitle = completeQuestMatch[1].trim();
      if (!storyData.quests) storyData.quests = [];
      if (!storyData.earnedPointsFromQuests)
        storyData.earnedPointsFromQuests = [];

      // Try fuzzy matching first
      const matchResult = findQuestMatch(questTitle, storyData.quests);
      const quest = matchResult?.item;

      // Log fuzzy match result
      if (matchResult && !matchResult.isExact) {
        logger.info("Fuzzy matched quest", {
          aiProvided: questTitle,
          matched: matchResult.name,
          score: matchResult.score,
        });
      }

      if (quest && !quest.fulfilled) {
        quest.fulfilled = true;
        // Award points if not already earned
        if (!storyData.earnedPointsFromQuests.includes(quest.id)) {
          storyData.points = (storyData.points || 0) + quest.points;
          storyData.earnedPointsFromQuests.push(quest.id);
          addNotification(`+${quest.points} points!`, "success");
        }
        logger.action("Quest completed via command", { title: quest.title });
        addNotification(`Quest completed: ${quest.title}`, "success");
      } else if (!quest) {
        logger.warn("Quest not found or no fuzzy match", {
          quest: questTitle,
        });
        addNotification(`Quest not found: ${questTitle}`, "warning");
      }
      continue;
    }

    // /deactivate_quest: quest title
    const deactivateQuestMatch = trimmed.match(/^\/deactivate_quest:\s*(.+)$/i);
    if (deactivateQuestMatch) {
      const questTitle = deactivateQuestMatch[1].trim();
      if (!storyData.quests) storyData.quests = [];

      // Try fuzzy matching first
      const matchResult = findQuestMatch(questTitle, storyData.quests);
      const quest = matchResult?.item;

      // Log fuzzy match result
      if (matchResult && !matchResult.isExact) {
        logger.info("Fuzzy matched quest", {
          aiProvided: questTitle,
          matched: matchResult.name,
          score: matchResult.score,
        });
      }

      if (quest) {
        quest.active = false;
        logger.action("Quest deactivated via command", { title: quest.title });
      } else {
        logger.warn("Quest not found or no fuzzy match", {
          quest: questTitle,
        });
        addNotification(`Quest not found: ${questTitle}`, "warning");
      }
      continue;
    }

    // /create_note: title | content | on_triggers | off_triggers
    const createNoteMatch = trimmed.match(
      /^\/create_note:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.*?)\s*\|\s*(.*)$/i,
    );
    if (createNoteMatch) {
      const noteTitle = createNoteMatch[1].trim();
      const noteContent = createNoteMatch[2].trim();
      const onTriggers = createNoteMatch[3].trim();
      const offTriggers = createNoteMatch[4].trim();

      if (!storyData.lore) storyData.lore = [];

      // Check if note entry already exists
      const existingNote = storyData.lore.find((l) => l.title === noteTitle);
      if (existingNote) {
        logger.warn("Note already exists", { noteTitle });
        addNotification(`Note "${noteTitle}" already exists`, "warning");
      } else {
        const onTriggerArray = onTriggers
          ? onTriggers
              .split(",")
              .map((t) => t.trim())
              .filter((t) => t.length > 0)
          : [];
        const offTriggerArray = offTriggers
          ? offTriggers
              .split(",")
              .map((t) => t.trim())
              .filter((t) => t.length > 0)
          : [];

        storyData.lore.push({
          title: noteTitle,
          content: noteContent,
          relatedCharacters: [],
          relatedLocations: [],
          secrtet: false,
          keys: [],
          on_triggers: onTriggerArray,
          off_triggers: offTriggerArray,
          on: onTriggerArray.length === 0, // If no triggers, show from start
        });
        logger.action("New note created via command", { title: noteTitle });
      }
      continue;
    }

    // /lore_replace_content: lore title | old text | new text
    const loreReplaceMatch = trimmed.match(
      /^\/lore_replace_content:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+)$/i,
    );
    if (loreReplaceMatch) {
      const loreTitle = loreReplaceMatch[1].trim();
      const oldText = loreReplaceMatch[2].trim();
      const newText = loreReplaceMatch[3].trim();

      if (!storyData.lore) storyData.lore = [];

      const loreEntry = storyData.lore.find((l) => l.title === loreTitle);
      if (!loreEntry) {
        logger.warn("Lore replace failed: entry not found", {
          title: loreTitle,
        });
      } else if (!loreEntry.content.includes(oldText)) {
        logger.warn("Lore replace failed: text not found", {
          title: loreTitle,
          oldText,
        });
      } else {
        loreEntry.content = loreEntry.content.replace(oldText, newText);
        logger.action("Lore content replaced via command", {
          title: loreTitle,
          oldText,
          newText,
        });
      }
      continue;
    }

    // /lore_add_content: lore title | new text
    const loreAddMatch = trimmed.match(
      /^\/lore_add_content:\s*(.+?)\s*\|\s*(.+)$/i,
    );
    if (loreAddMatch) {
      const loreTitle = loreAddMatch[1].trim();
      const newText = loreAddMatch[2].trim();

      if (!storyData.lore) storyData.lore = [];

      const loreEntry = storyData.lore.find((l) => l.title === loreTitle);
      if (!loreEntry) {
        logger.warn("Lore add failed: entry not found", { title: loreTitle });
      } else {
        loreEntry.content = loreEntry.content.trim() + "\n" + newText;
        logger.action("Content added to lore via command", {
          title: loreTitle,
          addedText: newText,
        });
      }
      continue;
    }

    // /lore_delete_content: lore title | text to delete
    const loreDeleteMatch = trimmed.match(
      /^\/lore_delete_content:\s*(.+?)\s*\|\s*(.+)$/i,
    );
    if (loreDeleteMatch) {
      const loreTitle = loreDeleteMatch[1].trim();
      const textToDelete = loreDeleteMatch[2].trim();

      if (!storyData.lore) storyData.lore = [];

      const loreEntry = storyData.lore.find((l) => l.title === loreTitle);
      if (!loreEntry) {
        logger.warn("Lore delete failed: entry not found", {
          title: loreTitle,
        });
      } else if (!loreEntry.content.includes(textToDelete)) {
        logger.warn("Lore delete failed: text not found", {
          title: loreTitle,
          textToDelete,
        });
      } else {
        loreEntry.content = loreEntry.content.replace(textToDelete, "").trim();
        // Clean up multiple spaces and newlines that might result from deletion
        loreEntry.content = loreEntry.content.replace(/  +/g, " "); // Replace multiple spaces with single space
        loreEntry.content = loreEntry.content.replace(/\n{3,}/g, "\n\n"); // Max 2 newlines
        logger.action("Content deleted from lore via command", {
          title: loreTitle,
          deletedText: textToDelete,
        });
      }
      continue;
    }

    // /lore_delete: lore title
    const loreDeleteEntryMatch = trimmed.match(/^\/lore_delete:\s*(.+)$/i);
    if (loreDeleteEntryMatch) {
      const loreTitle = loreDeleteEntryMatch[1].trim();
      if (!storyData.lore) storyData.lore = [];

      const loreIndex = storyData.lore.findIndex(
        (l) => l.title.toLowerCase() === loreTitle.toLowerCase(),
      );
      if (loreIndex === -1) {
        logger.warn("Lore delete failed: entry not found", {
          title: loreTitle,
        });
      } else {
        const removed = storyData.lore.splice(loreIndex, 1)[0];
        logger.action("Lore entry deleted via command", {
          title: removed.title,
        });
      }
      continue;
    }

    // /lore_show: lore title
    const loreShowMatch = trimmed.match(/^\/lore_show:\s*(.+)$/i);
    if (loreShowMatch) {
      const loreTitle = loreShowMatch[1].trim();
      if (!storyData.lore) storyData.lore = [];

      const matchResult = findLoreMatch(loreTitle, storyData.lore);
      if (!matchResult) {
        logger.warn("Lore show failed: entry not found", { title: loreTitle });
      } else {
        const loreEntry = matchResult.item;
        loreEntry.on = true;
        loreEntry.lastTriggeredIndex = storyData.scene.parts.length;

        // Add to revealedLore on the last scene part (or create one if needed)
        const lastPart =
          storyData.scene.parts[storyData.scene.parts.length - 1];
        if (lastPart) {
          if (!lastPart.revealedLore) lastPart.revealedLore = [];
          if (!lastPart.revealedLore.includes(loreEntry.title)) {
            lastPart.revealedLore.push(loreEntry.title);
          }
        }

        logger.action("Lore entry revealed via command", {
          title: loreEntry.title,
          matchedFrom: loreTitle,
          score: matchResult.score,
        });
      }
      continue;
    }

    // /lore_hide: lore title
    const loreHideMatch = trimmed.match(/^\/lore_hide:\s*(.+)$/i);
    if (loreHideMatch) {
      const loreTitle = loreHideMatch[1].trim();
      if (!storyData.lore) storyData.lore = [];

      const matchResult = findLoreMatch(loreTitle, storyData.lore);
      if (!matchResult) {
        logger.warn("Lore hide failed: entry not found", { title: loreTitle });
      } else {
        const loreEntry = matchResult.item;
        loreEntry.on = false;
        logger.action("Lore entry hidden via command", {
          title: loreEntry.title,
          matchedFrom: loreTitle,
          score: matchResult.score,
        });
      }
      continue;
    }

    // /lore_update: title | newTitle | content | on | onTriggers | offTriggers
    const loreUpdateMatch = trimmed.match(
      /^\/lore_update:\s*(.+?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*)$/i,
    );
    if (loreUpdateMatch) {
      const loreTitle = loreUpdateMatch[1].trim();
      const newTitle = loreUpdateMatch[2].trim();
      const newContent = loreUpdateMatch[3].trim();
      const onValue = loreUpdateMatch[4].trim().toLowerCase();
      const onTriggers = loreUpdateMatch[5].trim();
      const offTriggers = loreUpdateMatch[6].trim();

      if (!storyData.lore) storyData.lore = [];

      const loreEntry = storyData.lore.find(
        (l) => l.title.toLowerCase() === loreTitle.toLowerCase(),
      );
      if (!loreEntry) {
        logger.warn("Lore update failed: entry not found", {
          title: loreTitle,
        });
      } else {
        if (newTitle) loreEntry.title = newTitle;
        if (newContent) loreEntry.content = newContent;
        if (onValue === "true") loreEntry.on = true;
        else if (onValue === "false") loreEntry.on = false;
        if (onTriggers) {
          loreEntry.on_triggers = onTriggers
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t.length > 0);
        }
        if (offTriggers) {
          loreEntry.off_triggers = offTriggers
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t.length > 0);
        }
        logger.action("Lore entry updated via command", {
          title: loreEntry.title,
        });
      }
      continue;
    }

    // ==== INVENTORY MANAGEMENT COMMANDS ====

    // /remove_item: item name | quantity
    const removeItemMatch = trimmed.match(
      /^\/remove_item:\s*(.+?)\s*\|\s*(\d+)$/i,
    );
    if (removeItemMatch) {
      const itemName = removeItemMatch[1].trim();
      const quantity = parseInt(removeItemMatch[2], 10);

      const matchResult = findItemMatch(itemName, storyData.inventory);
      const item = matchResult?.item;

      if (matchResult && !matchResult.isExact) {
        logger.info("Fuzzy matched item for removal", {
          aiProvided: itemName,
          matched: matchResult.name,
          score: matchResult.score,
        });
      }

      if (!item) {
        logger.warn("Item removal failed: item not found", { itemName });
      } else if (item.quantity < quantity) {
        logger.warn("Item removal failed: insufficient quantity", {
          itemName: item.name,
          have: item.quantity,
          need: quantity,
        });
      } else {
        item.quantity -= quantity;
        if (item.quantity === 0) {
          storyData.inventory = storyData.inventory.filter(
            (i) => i.name !== item.name,
          );
          logger.action("Item removed (depleted) via command", {
            itemName: item.name,
            quantityRemoved: quantity,
          });
        } else {
          logger.action("Item quantity reduced via command", {
            itemName: item.name,
            quantityRemoved: quantity,
            remaining: item.quantity,
          });
        }
      }
      continue;
    }

    // /modify_item_quantity: item name | quantity_delta
    const modifyItemQuantityMatch = trimmed.match(
      /^\/modify_item_quantity:\s*(.+?)\s*\|\s*(-?\d+)$/i,
    );
    if (modifyItemQuantityMatch) {
      const itemName = modifyItemQuantityMatch[1].trim();
      const quantityDelta = parseInt(modifyItemQuantityMatch[2], 10);

      const matchResult = findItemMatch(itemName, storyData.inventory);
      const item = matchResult?.item;

      if (matchResult && !matchResult.isExact) {
        logger.info("Fuzzy matched item for quantity modification", {
          aiProvided: itemName,
          matched: matchResult.name,
          score: matchResult.score,
        });
      }

      if (!item) {
        logger.warn("Item quantity modification failed: item not found", {
          itemName,
        });
      } else {
        const newQuantity = Math.max(0, item.quantity + quantityDelta);
        const actualDelta = newQuantity - item.quantity;

        if (newQuantity === 0) {
          storyData.inventory = storyData.inventory.filter(
            (i) => i.name !== item.name,
          );
          logger.action("Item depleted via quantity modification", {
            itemName: item.name,
            delta: actualDelta,
          });
        } else {
          item.quantity = newQuantity;
          logger.action("Item quantity modified via command", {
            itemName: item.name,
            delta: actualDelta,
            newQuantity,
          });
        }
      }
      continue;
    }

    // /transform_item: old_item | new_item | description | type
    const transformItemMatch = trimmed.match(
      /^\/transform_item:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(normal|consumable|story|misc)$/i,
    );
    if (transformItemMatch) {
      const oldItemName = transformItemMatch[1].trim();
      const newItemName = transformItemMatch[2].trim();
      const newDescription = transformItemMatch[3].trim();
      const newType = transformItemMatch[4].trim() as
        | "normal"
        | "consumable"
        | "story"
        | "misc";

      const matchResult = findItemMatch(oldItemName, storyData.inventory);
      const oldItem = matchResult?.item;

      if (matchResult && !matchResult.isExact) {
        logger.info("Fuzzy matched item for transformation", {
          aiProvided: oldItemName,
          matched: matchResult.name,
          score: matchResult.score,
        });
      }

      if (!oldItem) {
        logger.warn("Item transformation failed: item not found", {
          oldItemName,
        });
      } else {
        const quantity = oldItem.quantity;
        const symbol = oldItem.symbol;
        const custom_symbol_url = oldItem.custom_symbol_url;

        // Remove old item
        storyData.inventory = storyData.inventory.filter(
          (i) => i.name !== oldItem.name,
        );

        // Add new item
        storyData.inventory.push({
          name: newItemName,
          quantity,
          description: newDescription,
          type: newType,
          symbol,
          custom_symbol_url,
        });

        logger.action("Item transformed via command", {
          oldItem: oldItem.name,
          newItem: newItemName,
          type: newType,
          quantity,
        });
      }
      continue;
    }

    // ==== RESOURCE MANAGEMENT COMMANDS ====

    // /add_resource: name | description | current | max
    const addResourceMatch = trimmed.match(
      /^\/add_resource:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(\d+)\s*\|\s*(\d+)$/i,
    );
    if (addResourceMatch) {
      const name = addResourceMatch[1].trim();
      const description = addResourceMatch[2].trim();
      const current = parseInt(addResourceMatch[3], 10);
      const max = parseInt(addResourceMatch[4], 10);

      const existing = storyData.resources.find((r) => r.name === name);
      if (existing) {
        logger.warn("Resource addition failed: already exists", { name });
      } else {
        storyData.resources.push({
          name,
          value: current,
          maxValue: max,
          description,
          symbol: "??",
          custom_symbol_url: undefined,
        });
        logger.action("Resource added via command", { name, current, max });
      }
      continue;
    }

    // /modify_resource: name | current_delta | max_delta
    const modifyResourceMatch = trimmed.match(
      /^\/modify_resource:\s*(.+?)\s*\|\s*(-?\d+)\s*\|\s*(-?\d+)$/i,
    );
    if (modifyResourceMatch) {
      const name = modifyResourceMatch[1].trim();
      const currentDelta = parseInt(modifyResourceMatch[2], 10);
      const maxDelta = parseInt(modifyResourceMatch[3], 10);

      const matchResult = findResourceMatch(name, storyData.resources);
      const resource = matchResult?.item;

      if (matchResult && !matchResult.isExact) {
        logger.info("Fuzzy matched resource for modification", {
          aiProvided: name,
          matched: matchResult.name,
          score: matchResult.score,
        });
      }

      if (!resource) {
        logger.warn("Resource modification failed: resource not found", {
          name,
        });
      } else {
        // Ensure resource.value is a valid number (prevent NaN)
        if (typeof resource.value !== "number" || isNaN(resource.value)) {
          resource.value = 0;
        }

        const oldValue = resource.value;
        const oldMax = resource.maxValue;

        resource.maxValue = Math.max(1, resource.maxValue + maxDelta);
        resource.value = Math.max(
          0,
          Math.min(resource.maxValue, resource.value + currentDelta),
        );

        logger.action("Resource modified via command", {
          name: resource.name,
          currentDelta,
          maxDelta,
          oldValue,
          newValue: resource.value,
          oldMax,
          newMax: resource.maxValue,
        });
      }
      continue;
    }

    // /remove_resource: name
    const removeResourceMatch = trimmed.match(/^\/remove_resource:\s*(.+)$/i);
    if (removeResourceMatch) {
      const name = removeResourceMatch[1].trim();

      const matchResult = findResourceMatch(name, storyData.resources);
      const resource = matchResult?.item;

      if (matchResult && !matchResult.isExact) {
        logger.info("Fuzzy matched resource for removal", {
          aiProvided: name,
          matched: matchResult.name,
          score: matchResult.score,
        });
      }

      if (!resource) {
        logger.warn("Resource removal failed: resource not found", { name });
      } else {
        storyData.resources = storyData.resources.filter(
          (r) => r.name !== resource.name,
        );
        logger.action("Resource removed via command", {
          name: resource.name,
        });
      }
      continue;
    }

    // ==== STAT MANAGEMENT COMMANDS ====

    // /add_stat: name | description | value
    const addStatMatch = trimmed.match(
      /^\/add_stat:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(\d+)$/i,
    );
    if (addStatMatch) {
      const name = addStatMatch[1].trim();
      const description = addStatMatch[2].trim();
      const value = parseInt(addStatMatch[3], 10);

      const existing = storyData.stats.find((s) => s.name === name);
      if (existing) {
        logger.warn("Stat addition failed: already exists", { name });
      } else {
        storyData.stats.push({
          name,
          value,
          description,
          symbol: "?",
          custom_symbol_url: undefined,
        });
        logger.action("Stat added via command", { name, value });
      }
      continue;
    }

    // /modify_stat: name | value_delta
    const modifyStatMatch = trimmed.match(
      /^\/modify_stat:\s*(.+?)\s*\|\s*(-?\d+)$/i,
    );
    if (modifyStatMatch) {
      const name = modifyStatMatch[1].trim();
      const valueDelta = parseInt(modifyStatMatch[2], 10);

      const matchResult = findStatMatch(name, storyData.stats);
      const stat = matchResult?.item;

      if (matchResult && !matchResult.isExact) {
        logger.info("Fuzzy matched stat for modification", {
          aiProvided: name,
          matched: matchResult.name,
          score: matchResult.score,
        });
      }

      if (!stat) {
        logger.warn("Stat modification failed: stat not found", { name });
      } else {
        const oldValue = stat.value;
        stat.value = Math.max(0, stat.value + valueDelta);

        logger.action("Stat modified via command", {
          name: stat.name,
          valueDelta,
          oldValue,
          newValue: stat.value,
        });
      }
      continue;
    }

    // /remove_stat: name
    const removeStatMatch = trimmed.match(/^\/remove_stat:\s*(.+)$/i);
    if (removeStatMatch) {
      const name = removeStatMatch[1].trim();

      const matchResult = findStatMatch(name, storyData.stats);
      const stat = matchResult?.item;

      if (matchResult && !matchResult.isExact) {
        logger.info("Fuzzy matched stat for removal", {
          aiProvided: name,
          matched: matchResult.name,
          score: matchResult.score,
        });
      }

      if (!stat) {
        logger.warn("Stat removal failed: stat not found", { name });
      } else {
        storyData.stats = storyData.stats.filter((s) => s.name !== stat.name);
        logger.action("Stat removed via command", { name: stat.name });
      }
      continue;
    }

    // ==== QUEST MANAGEMENT COMMANDS (ADDITIONAL) ====

    // /update_quest_description: quest title | new description
    const updateQuestDescMatch = trimmed.match(
      /^\/update_quest_description:\s*(.+?)\s*\|\s*(.+)$/i,
    );
    if (updateQuestDescMatch) {
      const questTitle = updateQuestDescMatch[1].trim();
      const newDescription = updateQuestDescMatch[2].trim();

      if (!storyData.quests) storyData.quests = [];

      const matchResult = findQuestMatch(questTitle, storyData.quests);
      const quest = matchResult?.item;

      if (matchResult && !matchResult.isExact) {
        logger.info("Fuzzy matched quest for description update", {
          aiProvided: questTitle,
          matched: matchResult.name,
          score: matchResult.score,
        });
      }

      if (!quest) {
        addNotification(`Quest "${questTitle}" not found`, "warning");
        logger.warn("Quest description update failed: quest not found", {
          title: questTitle,
        });
      } else {
        quest.description = newDescription;
        logger.action("Quest description updated via command", {
          title: quest.title,
          newDescription,
        });
      }
      continue;
    }

    // /update_quest_short_description: quest title | new short description
    const updateQuestShortDescMatch = trimmed.match(
      /^\/update_quest_short_description:\s*(.+?)\s*\|\s*(.+)$/i,
    );
    if (updateQuestShortDescMatch) {
      const questTitle = updateQuestShortDescMatch[1].trim();
      const newShortDescription = updateQuestShortDescMatch[2].trim();

      if (!storyData.quests) storyData.quests = [];

      const matchResult = findQuestMatch(questTitle, storyData.quests);
      const quest = matchResult?.item;

      if (matchResult && !matchResult.isExact) {
        logger.info("Fuzzy matched quest for short description update", {
          aiProvided: questTitle,
          matched: matchResult.name,
          score: matchResult.score,
        });
      }

      if (!quest) {
        addNotification(`Quest "${questTitle}" not found`, "warning");
        logger.warn("Quest short description update failed: quest not found", {
          title: questTitle,
        });
      } else {
        quest.shortDescription = newShortDescription;
        logger.action("Quest short description updated via command", {
          title: quest.title,
          newShortDescription,
        });
      }
      continue;
    }

    // /add_relationship: name | value | description
    const addRelationshipMatch = trimmed.match(
      /^\/add_relationship:\s*(.+?)\s*\|\s*(-?\d+)\s*\|\s*(.+)$/i,
    );
    if (addRelationshipMatch) {
      const name = addRelationshipMatch[1].trim();
      const value = parseInt(addRelationshipMatch[2], 10);
      const description = addRelationshipMatch[3].trim();

      if (!storyData.relationships) storyData.relationships = [];

      // Validate name is not empty
      if (!name) {
        addNotification(`Relationship name cannot be empty`, "warning");
        logger.warn("Relationship add failed: empty name");
        continue;
      }

      // Check for duplicates
      const existing = storyData.relationships.find(
        (r) => r.name.toLowerCase() === name.toLowerCase(),
      );

      if (existing) {
        logger.warn("Relationship add failed: already exists", { name });
        addNotification(`Relationship "${name}" already exists`, "warning");
      } else if (value < -100 || value > 100) {
        addNotification(
          `Relationship value must be between -100 and 100`,
          "warning",
        );
        logger.warn("Relationship add failed: invalid value", {
          name,
          value,
        });
      } else {
        // Determine symbol based on relationship value
        let symbol = "??"; // Default neutral
        if (value >= 75)
          symbol = "??"; // Strong ally
        else if (value >= 50)
          symbol = "??"; // Ally
        else if (value >= 25)
          symbol = "??"; // Friend
        else if (value >= 0)
          symbol = "??"; // Neutral/Acquaintance
        else if (value >= -25)
          symbol = "??"; // Slight tension
        else if (value >= -50)
          symbol = "??"; // Unfriendly
        else if (value >= -75)
          symbol = "??"; // Enemy
        else symbol = "??"; // Hostile

        storyData.relationships.push({
          name,
          value,
          description,
          symbol,
        });
        logger.action("Relationship added via command", {
          name,
          value,
          description,
        });
      }
      continue;
    }

    // /modify_relationship: name | value_delta
    const modifyRelationshipMatch = trimmed.match(
      /^\/modify_relationship:\s*(.+?)\s*\|\s*(-?\d+)$/i,
    );
    if (modifyRelationshipMatch) {
      const name = modifyRelationshipMatch[1].trim();
      const delta = parseInt(modifyRelationshipMatch[2], 10);

      if (!storyData.relationships) storyData.relationships = [];

      const matchResult = findRelationshipMatch(name, storyData.relationships);
      const relationship = matchResult?.item;

      if (matchResult && !matchResult.isExact) {
        logger.info("Fuzzy matched relationship for modification", {
          aiProvided: name,
          matched: matchResult.name,
          score: matchResult.score,
        });
      }

      if (!relationship) {
        logger.warn("Relationship modify failed: not found", { name });
        addNotification(`Relationship not found: ${name}`, "warning");
      } else {
        const oldValue = relationship.value;
        relationship.value = Math.max(-100, Math.min(100, oldValue + delta));

        // Update symbol based on new value
        if (relationship.value >= 75) relationship.symbol = "??";
        else if (relationship.value >= 50) relationship.symbol = "??";
        else if (relationship.value >= 25) relationship.symbol = "??";
        else if (relationship.value >= 0) relationship.symbol = "??";
        else if (relationship.value >= -25) relationship.symbol = "??";
        else if (relationship.value >= -50) relationship.symbol = "??";
        else if (relationship.value >= -75) relationship.symbol = "??";
        else relationship.symbol = "??";

        logger.action("Relationship modified via command", {
          name: relationship.name,
          oldValue,
          newValue: relationship.value,
          delta,
        });
      }
      continue;
    }

    // /remove_relationship: name
    const removeRelationshipMatch = trimmed.match(
      /^\/remove_relationship:\s*(.+)$/i,
    );
    if (removeRelationshipMatch) {
      const name = removeRelationshipMatch[1].trim();

      if (!storyData.relationships) storyData.relationships = [];

      const matchResult = findRelationshipMatch(name, storyData.relationships);
      const relationship = matchResult?.item;

      if (matchResult && !matchResult.isExact) {
        logger.info("Fuzzy matched relationship for removal", {
          aiProvided: name,
          matched: matchResult.name,
          score: matchResult.score,
        });
      }

      if (!relationship) {
        logger.warn("Relationship remove failed: not found", { name });
        addNotification(`Relationship not found: ${name}`, "warning");
      } else {
        storyData.relationships = storyData.relationships.filter(
          (r) => r !== relationship,
        );
        logger.action("Relationship removed via command", {
          name: relationship.name,
          value: relationship.value,
        });
      }
      continue;
    }

    // /update_relationship_description: name | new description
    const updateRelationshipDescMatch = trimmed.match(
      /^\/update_relationship_description:\s*(.+?)\s*\|\s*(.+)$/i,
    );
    if (updateRelationshipDescMatch) {
      const name = updateRelationshipDescMatch[1].trim();
      const newDescription = updateRelationshipDescMatch[2].trim();

      if (!storyData.relationships) storyData.relationships = [];

      const matchResult = findRelationshipMatch(name, storyData.relationships);
      const relationship = matchResult?.item;

      if (matchResult && !matchResult.isExact) {
        logger.info("Fuzzy matched relationship for description update", {
          aiProvided: name,
          matched: matchResult.name,
          score: matchResult.score,
        });
      }

      if (!relationship) {
        logger.warn("Relationship description update failed: not found", {
          name,
        });
        addNotification(`Relationship not found: ${name}`, "warning");
      } else {
        relationship.description = newDescription;
        logger.action("Relationship description updated via command", {
          name: relationship.name,
          newDescription,
        });
      }
      continue;
    }
  }
}

// Utility: Prepare story data for saving (no truncation - pruning happens at context building time)
function trimStoryData(data: StoryData): StoryData {
  // No longer truncating parts - context-aware pruning happens in ai_staged.ts
  // based on actual token limits (75% story history, 25% info/lore/memory)
  return data;
}

function StoryPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const storyId = searchParams.get("storyId");

  const { addNotification } = useNotification();
  const { keys: apiKeys } = useAPIKeys();
  const { openRouterKey, deepseekKey, googleKey, mistralKey, deepinfraKey } =
    apiKeys;
  const [currentState, setCurrentState] = useState<StoryState>(
    StoryState.STORY,
  );
  const [storyData, setStoryData] = useState<StoryData | null>(null);
  const [storyDbId, setStoryDbId] = useState<string | null>(null);
  const [sourceAdventureId, setSourceAdventureId] = useState<string | null>(
    null,
  );
  const saveTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const hasLoadedStoryRef = useRef<string | null>(null); // Track loaded story ID to prevent re-fetching on tab focus
  const generationAbortRef = useRef<AbortController | null>(null); // Abort controller for stopping generation
  const [choices, setChoices] = useState<Choices>({ choices: [] });
  const [input, setInput] = useState<Record<string, boolean>>({});
  const [storyText, setStoryText] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<
    "gm" | "story" | "choices" | null
  >(null);
  // Pending user choice text - shown in chat while GM is generating
  const [pendingUserChoice, setPendingUserChoice] = useState<string>("");
  // Live GM streaming state - interleaved thinking and tool results
  type GMEntry =
    | { type: "thinking"; content: string; isStreaming?: boolean }
    | { type: "tool"; result: import("@/app/misc/gmExecutor").GMToolResult };
  const [liveGMEntries, setLiveGMEntries] = useState<GMEntry[]>([]);
  const [pendingChoice, setPendingChoice] = useState<number | null>(null);
  const [loadingStory, setLoadingStory] = useState(true);
  const [started, setStarted] = useState(false);
  const [canRetry, setCanRetry] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [showPresetSelection, setShowPresetSelection] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    icon?: string;
    confirmText?: string;
    confirmButtonClass?: string;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const handleCharacterCreate = async (
    characterData: Record<string, string>,
  ) => {
    if (!storyData || !selectedPreset) return;
    logger.action("User created custom character", { characterData });

    const updatedStoryData = {
      ...storyData,
      characterData,
      selected_preset: selectedPreset.id,
    };

    // For custom preset, generate a character sheet from the template and filled data
    if (
      updatedStoryData.characterSheetTemplate?.template &&
      Object.keys(characterData).length > 0
    ) {
      // Use the proper fillTemplate function that handles "FieldName (Category)" syntax
      const filledSheet = fillTemplate(
        updatedStoryData.characterSheetTemplate.template,
        characterData,
      );
      updatedStoryData.characterSheet = filledSheet;

      // Add character sheet to lore as "character_sheet" type for AI context
      const characterSheetLore: StoryLore = {
        title: "Player Character Sheet",
        content: filledSheet,
        relatedCharacters: [],
        relatedLocations: [],
        secrtet: false,
        keys: [],
        type: "character_sheet",
        on: true,
        on_triggers: [],
        off_triggers: [],
        var_on_triggers: [],
        var_off_triggers: [],
      };
      updatedStoryData.lore = [
        ...(updatedStoryData.lore || []),
        characterSheetLore,
      ];
    }

    // Determine starting choices
    const startingChoices = updatedStoryData.starting_choices?.length
      ? updatedStoryData.starting_choices.map((sc) => ({
          text: sc.text,
          intro_override: sc.intro_override,
        }))
      : [{ text: "Start Story" }];

    // Add starting scene part
    updatedStoryData.scene.parts.push({
      content: updatedStoryData.intro || "The story begins.",
      imageUrl: "",
      user: false,
      role: "assistant",
      choices: startingChoices,
    });

    setStoryData(updatedStoryData);
    setShowPresetSelection(false);
    setCurrentState(StoryState.STORY);
    setStarted(true);

    // Set story text and choices from the first part
    const lastPart =
      updatedStoryData.scene.parts[updatedStoryData.scene.parts.length - 1];
    setStoryText(lastPart.content);
    setChoices({ choices: lastPart.choices || [] });

    // Save the story
    await performSave(updatedStoryData);
  };

  const [diceRoll, setDiceRoll] = useState<{
    show: boolean;
    rolls: number[];
    finalRoll: number;
    skillName: string;
    skillBonus: number;
    dc: number;
    isSuccess: boolean;
    isPartial?: boolean; // For PbtA partial success
    isCritical: boolean;
    hasAdvantage: boolean;
    hasDisadvantage: boolean;
    advantageCount?: number;
    disadvantageCount?: number;
    netAdvantage?: number;
    advantageSources?: string;
    disadvantageSources?: string;
    diceRolls?: number[][]; // Individual dice for each roll (for 3d6 system)
    // Formula-based rolls (generic mode) - when provided, uses simplified display
    formula?: string; // The formula used (e.g., "1d20+{{STR}}")
    resolvedFormula?: string; // Formula with variables resolved (e.g., "1d20+5")
    // Reverse DC mode (Call of Cthulhu style - roll under DC to succeed)
    reverseDC?: boolean;
    baseDice?: number[]; // YZE: base dice rolls
    stressDice?: number[]; // YZE: stress dice rolls
    successes?: number; // YZE: count of 6s
    panicTriggered?: boolean; // YZE: if stress dice showed 1s
    panicEffect?: string; // YZE: panic table result
    stressLevel?: number; // YZE: current stress (0-10)
    stressRelief?: boolean; // YZE: strong success (-1 stress)
    explosions?: number; // Explosive: number of explosions
    dieSize?: number; // Explosive: die size (d4-d20)
    conditionAutoFail?: boolean; // Condition caused auto-fail
    conditionName?: string; // Name of condition that caused auto-fail/penalty
    conditionPenalty?: number; // Condition penalty modifier (negative number like -2, -4)
  } | null>(null);

  // NPC Reaction notifications (social media style)
  const [pendingNPCReactions, setPendingNPCReactions] = useState<NPCReaction[]>(
    [],
  );

  // Command responses for AI feedback loop
  const [pendingCommandResponses, setPendingCommandResponses] = useState<
    CommandResponse[]
  >([]);

  // Story part navigation
  const [viewingPartIndex, setViewingPartIndex] = useState<number | null>(null);

  // Sync state
  const [syncStatus, setSyncStatus] = useState<
    "synced" | "pending" | "conflict" | "local-only"
  >("synced");
  const [syncConflict, setSyncConflict] = useState<{
    isOpen: boolean;
    serverData: StoryData | null;
    serverUpdatedAt: string;
    localPartCount: number;
    serverPartCount: number;
  }>({
    isOpen: false,
    serverData: null,
    serverUpdatedAt: "",
    localPartCount: 0,
    serverPartCount: 0,
  });

  // AI Story Editor state (lifted from menu so it persists across tabs)
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [isAIPinned, setIsAIPinned] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("storyAIPinned") === "true";
    }
    return false;
  });

  const handleAIPinToggle = () => {
    setIsAIPinned((prev) => {
      const next = !prev;
      localStorage.setItem("storyAIPinned", String(next));
      return next;
    });
  };

  // Helper to process multiple scene parts from API
  function processSceneParts(
    parts: any[],
    storyData: StoryData,
    addNotification: (
      message: string,
      type: "success" | "failure" | "info" | "warning",
    ) => void,
  ) {
    if (!parts || parts.length === 0) return null;

    let lastPartWithContent = null;

    for (const part of parts) {
      // Handle tool calls (new system)
      if (part.toolCalls && part.toolResponses) {
        // Execute commands from tool responses to mutate game state
        // Use executeCommandWithResponse for proper command handling
        const commands = part.toolResponses
          .map((r: CommandResponse) => r.command)
          .filter(
            (cmd: string | undefined): cmd is string =>
              cmd !== undefined && cmd !== null,
          );

        if (commands.length > 0) {
          for (const command of commands) {
            try {
              executeCommandWithResponse(command, storyData);
            } catch (error) {
              console.error("Error executing command:", command, error);
            }
          }
        }

        // Handle add_memory tool calls
        try {
          const memoryToolCalls = (part.toolCalls || []).filter(
            (tc: any) => tc?.function?.name === "add_memory",
          );
          if (memoryToolCalls.length > 0) {
            const existingMemoryLower = storyData.memory.map((m) =>
              getMemoryContent(m).toLowerCase().trim(),
            );
            for (const tc of memoryToolCalls) {
              let args: any = tc.function?.arguments;
              if (typeof args === "string") {
                try {
                  args = JSON.parse(args);
                } catch (e) {
                  continue;
                }
              }
              const entry: string | undefined = args?.entry?.trim();
              if (
                entry &&
                !existingMemoryLower.includes(entry.toLowerCase().trim())
              ) {
                // Add as MemoryEntry with embedded: false
                storyData.memory.push({ content: entry, embedded: false });
                existingMemoryLower.push(entry.toLowerCase().trim());
                addNotification(
                  `Memory added: ${entry.substring(0, 80)}${
                    entry.length > 80 ? "..." : ""
                  }`,
                  "success",
                );
              }
            }
          }
        } catch (e) {
          console.error("Failed processing add_memory tool calls", e);
        }

        // Store tool responses for AI feedback in next turn
        setPendingCommandResponses(part.toolResponses);
      }
      // Handle legacy XML commands
      else if (part.commands && part.commands.length > 0) {
        processCommands(part.commands, storyData, addNotification);

        const responses = generateCommandResponses(part.commands, storyData);
        setPendingCommandResponses(responses);
      }

      // Handle memory entries (legacy system)
      if (part.memoryEntries && part.memoryEntries.length > 0) {
        const existingMemoryLower = storyData.memory.map((m) =>
          getMemoryContent(m).toLowerCase().trim(),
        );
        const newMemories = part.memoryEntries.filter(
          (entry: string) =>
            !existingMemoryLower.includes(entry.toLowerCase().trim()),
        );
        if (newMemories.length > 0) {
          logger.action("New memory entries added", {
            count: newMemories.length,
            entries: newMemories,
          });
          // Add as MemoryEntry with embedded: false
          storyData.memory.push(
            ...newMemories.map((content: string) => ({
              content,
              embedded: false,
            })),
          );
        }
      }

      // Push part to scene
      storyData.scene.parts.push(part);

      // Track the last part with actual content for UI display
      if (part.content && part.content.trim().length > 0) {
        lastPartWithContent = part;
      }
    }

    processLoreTriggers(storyData, addNotification);
    return lastPartWithContent || parts[parts.length - 1];
  }

  // Navigation handlers - only navigate through AI story parts with content
  function handleNavigateLeft() {
    if (!storyData) return;

    // Filter to only AI story parts with actual content and deduplicate consecutive identical content
    const storyParts = storyData.scene.parts.filter(
      (part) => !part.user && part.content.trim().length > 0,
    );

    // Remove consecutive duplicates (same content)
    const uniqueStoryParts = storyParts.filter((part, index, arr) => {
      if (index === 0) return true;
      return part.content !== arr[index - 1].content;
    });

    if (uniqueStoryParts.length === 0) return;

    // If viewing current (null), we're at the last unique story part
    let currentStoryIndex;
    if (viewingPartIndex === null || viewingPartIndex === undefined) {
      currentStoryIndex = uniqueStoryParts.length - 1;
    } else {
      const currentPart = storyData.scene.parts[viewingPartIndex];
      currentStoryIndex = uniqueStoryParts.indexOf(currentPart);
    }

    if (currentStoryIndex > 0) {
      const prevStoryPart = uniqueStoryParts[currentStoryIndex - 1];
      const newIndex = storyData.scene.parts.indexOf(prevStoryPart);
      setViewingPartIndex(newIndex);
      setStoryText(prevStoryPart.content);
      setChoices({ choices: prevStoryPart.choices || [] });
    }
  }

  function handleNavigateRight() {
    if (!storyData) return;

    // Filter to only AI story parts with actual content and deduplicate consecutive identical content
    const storyParts = storyData.scene.parts.filter(
      (part) => !part.user && part.content.trim().length > 0,
    );

    // Remove consecutive duplicates (same content)
    const uniqueStoryParts = storyParts.filter((part, index, arr) => {
      if (index === 0) return true;
      return part.content !== arr[index - 1].content;
    });

    if (uniqueStoryParts.length === 0) return;

    // If viewing current (null), we're already at the end
    if (viewingPartIndex === null || viewingPartIndex === undefined) {
      return;
    }

    const currentPart = storyData.scene.parts[viewingPartIndex];
    const currentStoryIndex = uniqueStoryParts.indexOf(currentPart);

    if (currentStoryIndex < uniqueStoryParts.length - 1) {
      const nextStoryPart = uniqueStoryParts[currentStoryIndex + 1];
      const newIndex = storyData.scene.parts.indexOf(nextStoryPart);

      // Check if this is the last story part - if so, set to null to show "current"
      if (currentStoryIndex + 1 === uniqueStoryParts.length - 1) {
        setViewingPartIndex(null);
      } else {
        setViewingPartIndex(newIndex);
      }

      setStoryText(nextStoryPart.content);
      setChoices({ choices: nextStoryPart.choices || [] });
    } else {
      // Moving to the end, return to current
      setViewingPartIndex(null);
      const lastPart = storyData.scene.parts[storyData.scene.parts.length - 1];
      setStoryText(lastPart.content);
      setChoices({ choices: lastPart.choices || [] });
    }
  }

  function resetToCurrentPart() {
    if (!storyData) return;
    setViewingPartIndex(null);
    const lastPart = storyData.scene.parts[storyData.scene.parts.length - 1];
    setStoryText(lastPart.content);
    setChoices({ choices: lastPart.choices || [] });
  }

  // Jump directly to a specific scene part index (used by chapter navigation).
  // Mirrors handleNavigateRight's "snap to current when landing on the last
  // part" behavior so jumping to the latest chapter re-enables live updates.
  function handleNavigateToIndex(index: number) {
    if (!storyData) return;
    const part = storyData.scene.parts[index];
    if (!part) return;

    const isLastPart = index === storyData.scene.parts.length - 1;
    setViewingPartIndex(isLastPart ? null : index);
    setStoryText(part.content);
    setChoices({ choices: part.choices || [] });
  }

  // Fetch token balance on mount
  useEffect(() => {
    async function fetchBalance() {
      try {
        const response = await authenticatedFetch("/api/tokens/balance", {
          headers: {
            "Content-Type": "application/json",
          },
        });
        if (response.ok) {
          const data = await response.json();
          setTokenBalance(data.balance.total);
        }
      } catch (error) {
        console.error("Failed to fetch token balance:", error);
      }
    }
    fetchBalance();
  }, []);

  // Update canUndo and canRetry based on story state
  useEffect(() => {
    if (!storyData) return;

    const lastPart = storyData.scene.parts[storyData.scene.parts.length - 1];
    const hasAIPart = lastPart && !lastPart.user;

    // Can undo if we have at least 2 parts and last part is from AI
    setCanUndo(storyData.scene.parts.length > 1 && hasAIPart);

    // Can retry if we have at least 1 part and last part is from AI
    setCanRetry(storyData.scene.parts.length > 0 && hasAIPart);
  }, [storyData]);

  // Load story from database on mount - OFFLINE FIRST
  useEffect(() => {
    if (!storyId) {
      addNotification("No story ID provided", "failure");
      setLoadingStory(false);
      return;
    }

    // Skip re-fetching if we've already loaded this story (prevents reload on tab focus)
    if (hasLoadedStoryRef.current === storyId && storyData) {
      console.log(
        "Story already loaded, skipping re-fetch (tab focus protection)",
      );
      return;
    }

    // Helper to setup UI state from loaded story data
    function setupUIFromStory(loadedStoryData: StoryData) {
      // Mark this story as loaded to prevent re-fetching
      hasLoadedStoryRef.current = storyId;

      // Migrate AGMT state to include new performance tracking fields
      // Also migrate "mythic" item grades to "mythic" for backward compatibility
      import("@/app/misc/mythicChaos").then(
        ({ migrateAGMTState, migrateItemGrades }) => {
          if (loadedStoryData.agmtState) {
            loadedStoryData.agmtState = migrateAGMTState(
              loadedStoryData.agmtState!,
            );
          }
          // Migrate item grades from "mythic" to "mythic"
          migrateItemGrades(loadedStoryData);
        },
      );

      //Initializequestarraysiftheydon'texist(forbackwardscompatibility)
      if (!loadedStoryData.quests) loadedStoryData.quests = [];

      //ProcessLoretriggersonloadtoinitializeLorevisibility
      processLoreTriggers(loadedStoryData, addNotification, true);

      // Deduplicate memories on load (removes exact duplicates and very similar entries)
      if (loadedStoryData.memory && loadedStoryData.memory.length > 0) {
        const originalCount = loadedStoryData.memory.length;
        loadedStoryData.memory = deduplicateMemories(loadedStoryData.memory);
        const removedCount = originalCount - loadedStoryData.memory.length;
        if (removedCount > 0) {
          console.log(
            `[Story Load] Removed ${removedCount} duplicate memories`,
          );
        }
      }

      setStoryData(loadedStoryData);

      //Initializestoryifnopartsyet-showpresetselection
      if (loadedStoryData.scene.parts.length === 0) {
        setShowPresetSelection(true);
        setLoadingStory(false);
        return true; // early return signal
      }

      //SetupUIstatefromloadedstory
      const lastPart =
        loadedStoryData.scene.parts[loadedStoryData.scene.parts.length - 1];
      setStoryText(lastPart.content);
      setChoices({ choices: lastPart.choices || [] });

      const inputs =
        lastPart.choices?.reduce(
          (acc, choice) => ({ ...acc, [choice.text]: false }),
          {} as Record<string, boolean>,
        ) || {};
      setInput(inputs);
      setStarted(true);
      return false;
    }

    async function loadStory() {
      try {
        const { getLocalStory } = await import("@/app/misc/localStoryManager");
        const localStory = await getLocalStory(storyId!);

        if (!localStory) {
          throw new Error("Local story not found");
        }

        console.log("Local story loaded:", localStory);
        setStoryDbId(localStory.id);
        setSyncStatus("local-only");

        if (setupUIFromStory(localStory.storyData)) return;
        setLoadingStory(false);
      } catch (error: any) {
        console.error("Error loading story:", error);
        addNotification(error.message || "Failed to load story", "failure");
        setLoadingStory(false);
      }
    }

    loadStory();
  }, [storyId, addNotification]);

  // Sync lore and memory embeddings when story is first loaded (if embeddings enabled and dirty)
  useEffect(() => {
    if (!storyData || !storyDbId || storyDbId.startsWith("local_")) return;

    const embeddingsEnabled =
      typeof window !== "undefined"
        ? localStorage.getItem("embeddingsEnabled") === "true"
        : false;

    if (!embeddingsEnabled) return;

    // Only sync lore if we have enough entries and it's dirty (or first load)
    const shouldSyncLore =
      storyData.lore.length >= 5 && storyData.loreEmbeddingsDirty !== false;

    // Always sync memories on load if we have any
    const shouldSyncMemories = storyData.memory.length > 0;

    if (!shouldSyncLore && !shouldSyncMemories) return;

    // Fire and forget - sync embeddings in background
    getAuthToken().then(async (token) => {
      if (!token) return;

      // First, get existing embedding keys to avoid re-generating
      let existingKeys: { lore: string[]; memory: string[]; scene: string[] } =
        {
          lore: [],
          memory: [],
          scene: [],
        };

      try {
        existingKeys = await getExistingEmbeddingKeys(storyDbId, token);
        console.log(
          `[Embeddings] Found existing keys: ${existingKeys.lore.length} lore, ${existingKeys.memory.length} memories`,
        );
      } catch (err) {
        console.warn(
          "[Embeddings] Failed to get existing keys, will sync all:",
          err,
        );
      }

      // Sync lore if needed
      if (shouldSyncLore) {
        syncLoreEmbeddings(
          storyDbId,
          storyData.lore.map((l) => ({
            title: l.title,
            content: l.content,
            embedded: l.embedded,
          })),
          token,
        )
          .then((result) => {
            if (result.synced > 0 || result.cleaned > 0) {
              console.log(
                `[Embeddings] Lore sync: ${result.synced} entries, ${result.cleaned} cleaned`,
              );
            }
            // Mark successfully embedded lore entries and clear dirty flag
            if (
              result.embeddedTitles.length > 0 ||
              storyData.loreEmbeddingsDirty !== false
            ) {
              const updatedLore = storyData.lore.map((l) =>
                result.embeddedTitles.includes(l.title)
                  ? { ...l, embedded: true }
                  : l,
              );
              setStoryData({
                ...storyData,
                lore: updatedLore,
                loreEmbeddingsDirty: false,
              });
            }
          })
          .catch((err) => {
            console.warn("[Embeddings] Lore sync failed:", err.message);
          });
      }

      // Sync memories if we have any
      if (shouldSyncMemories) {
        syncNewMemories(
          storyDbId,
          storyData.memory,
          new Set(existingKeys.memory), // Pass existing keys to skip already-synced
          token,
        )
          .then((result) => {
            if (result.synced > 0 || result.cleaned > 0) {
              console.log(
                `[Embeddings] Memory sync: ${result.synced} entries, ${result.cleaned} cleaned`,
              );
            }
            // Mark successfully embedded memory entries
            if (result.embeddedIndices.length > 0) {
              const updatedMemory = storyData.memory.map((m, i) => {
                if (result.embeddedIndices.includes(i)) {
                  // Convert to MemoryEntry format with embedded: true
                  const content = typeof m === "string" ? m : m.content;
                  return { content, embedded: true };
                }
                return m;
              });
              setStoryData({ ...storyData, memory: updatedMemory });
            }
          })
          .catch((err) => {
            console.warn("[Embeddings] Memory sync failed:", err.message);
          });
      }
    });
    // Only run when storyDbId or dirty flag changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyDbId, storyData?.loreEmbeddingsDirty]);

  //Applypresetandstartstory
  const handlePresetSelect = async (preset: Preset) => {
    if (!storyData) return;
    logger.action("User selected preset", { preset: preset.name });

    // For custom preset with a character sheet template, redirect to character creation
    const isCustom = preset.id === "custom";
    if (isCustom) {
      // Check if storyData has characterSheetTemplate with fields
      let templateWithFields = storyData.characterSheetTemplate;

      // If not in storyData, try to fetch from the source adventure
      if (!templateWithFields?.fields?.length && sourceAdventureId) {
        try {
          const { getLocalAdventure } =
            await import("@/app/misc/localAdventureManager");
          const localAdv = await getLocalAdventure(sourceAdventureId);
          const adventure = localAdv?.adventureData;
          if (adventure?.characterSheetTemplate?.fields?.length) {
            templateWithFields = adventure.characterSheetTemplate;
            // Also update storyData so we have it for later
            setStoryData((prev) =>
              prev
                ? { ...prev, characterSheetTemplate: templateWithFields }
                : prev,
            );
          }
        } catch (error) {
          console.error(
            "Failed to fetch adventure for character template:",
            error,
          );
        }
      }

      if (templateWithFields?.fields?.length) {
        setSelectedPreset(preset);
        setCurrentState(StoryState.CHARACTER_CREATION);
        setShowPresetSelection(false);
        return;
      }
    }

    const updatedStoryData = { ...storyData };

    // For custom preset, use default values but don't apply any preset-specific overrides
    // The user can customize via the menu after starting

    // Apply preset to story data (skip for custom - use adventure defaults)
    if (!isCustom) {
      // Add character sheet to lore if preset has one
      if (preset.characterSheet) {
        const characterSheetLore: StoryLore = {
          title: `${preset.name} - Character Sheet`,
          content: preset.characterSheet,
          relatedCharacters: [],
          relatedLocations: [],
          secrtet: false,
          keys: [],
          type: "character_sheet",
          on: true,
          on_triggers: [],
          off_triggers: [],
          var_on_triggers: [],
          var_off_triggers: [],
        };
        updatedStoryData.lore = [
          ...(updatedStoryData.lore || []),
          characterSheetLore,
        ];
      }
      if (preset.stats?.length)
        updatedStoryData.stats = JSON.parse(JSON.stringify(preset.stats));
      if (preset.resources?.length)
        updatedStoryData.resources = JSON.parse(
          JSON.stringify(preset.resources),
        );
      if (preset.inventory?.length)
        updatedStoryData.inventory = JSON.parse(
          JSON.stringify(preset.inventory),
        );
      if (preset.relationships?.length)
        updatedStoryData.relationships = JSON.parse(
          JSON.stringify(preset.relationships),
        );
      if (preset.conditions?.length)
        updatedStoryData.conditions = JSON.parse(
          JSON.stringify(preset.conditions),
        );
      if (preset.authorNotes)
        updatedStoryData.author_notes = preset.authorNotes;
    }

    // Determine starting choices - use custom ones if available, otherwise default
    // Choices are now plain text only - GM stage handles all dice mechanics
    const startingChoices = updatedStoryData.starting_choices?.length
      ? updatedStoryData.starting_choices.map((sc) => ({
          text: sc.text,
          // Include intro_override so it can be used when this choice is selected
          intro_override: sc.intro_override,
        }))
      : [{ text: "Start Story" }];

    // Determine intro content - priority order:
    // 1. Preset's unique intro (if exists)
    // 2. Adventure's default intro
    // NOTE: starting_choices intro_override is applied AFTER the user selects a choice,
    // not at preset selection time. The intro_override replaces the AI's first response.
    const introContent = preset.intro || updatedStoryData.intro;

    //Addstartingscenepart
    updatedStoryData.scene.parts.push({
      content: introContent,
      imageUrl: "",
      user: false,
      role: "assistant",
      choices: startingChoices,
    });

    //Updatestoryindatabasewithpresetapplied
    if (storyDbId) {
      try {
        const { saveLocalStory } = await import("@/app/misc/localStoryManager");
        updatedStoryData.selected_preset = preset.id;
        await saveLocalStory(storyDbId, updatedStoryData);
      } catch (error) {
        console.error("Error saving preset:", error);
      }
    }

    //Updatelocalstate
    setStoryData(updatedStoryData);
    setStoryText(introContent);
    setChoices({ choices: startingChoices });
    setInput({ StartStory: false });
    setStarted(true);
    setShowPresetSelection(false);
    setSelectedPreset(preset);

    // For custom preset, open the menu so user can customize their character
    if (isCustom) {
      setCurrentState(StoryState.MENU);
      addNotification(
        "Customize your character in the menu, then return to the story!",
        "success",
      );
    } else {
      addNotification(
        `Character preset "${preset.name}" applied! ?`,
        "success",
      );
    }
  };

  //Savestoryprogresstodatabase(debounced)
  async function saveProgress(updatedStoryData: StoryData, immediate = false) {
    if (!storyDbId) return;

    //Clearexistingtimeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // If immediate, save now without debounce
    if (immediate) {
      return performSave(updatedStoryData);
    }

    // Debounce: Only save after 3 seconds of no activity
    saveTimeoutRef.current = setTimeout(() => {
      performSave(updatedStoryData);
    }, 3000); //3seconddebounce
  }

  //Actualsavelogicisolated
  async function performSave(updatedStoryData: StoryData) {
    if (!storyDbId) return;

    try {
      logger.info("Saving story progress...");
      const { saveLocalStory } = await import("@/app/misc/localStoryManager");
      //Trimscenehistorybeforesavingtoreducedatasize
      const trimmedData = trimStoryData(updatedStoryData);

      // Log what we're saving
      const lastPartBeingSaved =
        trimmedData.scene.parts[trimmedData.scene.parts.length - 1];
      console.log("Saving local story - last part:", {
        user: lastPartBeingSaved?.user,
        role: lastPartBeingSaved?.role,
        choicesCount: lastPartBeingSaved?.choices?.length || 0,
        contentPreview: lastPartBeingSaved?.content.substring(0, 50),
      });

      await saveLocalStory(storyDbId, trimmedData);
      console.log("Local story saved successfully");
    } catch (error) {
      console.error("Error saving progress:", error);
      addNotification(
        "Failed to save story progress. Please try again.",
        "failure",
      );
    }
  }

  //Updatestorydatainstate
  function updateStoryData(updates: Partial<StoryData>) {
    if (!storyData) return;

    // If lore is being updated, mark embeddings as dirty (will sync on next generation)
    if (updates.lore) {
      updates.loreEmbeddingsDirty = true;
    }

    //Getcurrentmodelconfigfordynamicmemorycap
    const modelKey =
      typeof window !== "undefined"
        ? localStorage.getItem("aiModel") || "DeepSeek V4 Flash"
        : "DeepSeek V4 Flash";
    const modelConfig = getModelConfig(modelKey);

    // Dynamic memory cap: Reserve maxOutputTokens, then use 25% of remaining for memory
    const CHARS_PER_TOKEN = 4;
    const availableInputTokens =
      modelConfig.maxTokens - modelConfig.maxOutputTokens;
    const memory_cap = availableInputTokens * 0.25 * CHARS_PER_TOKEN;

    // Deduplicate memories (removes exact duplicates and very similar entries)
    storyData.memory = deduplicateMemories(storyData.memory);

    //Trimmemoryiftoolarge
    let totalMemoryLength = storyData.memory.reduce(
      (acc, entry) => acc + getMemoryContent(entry).length,
      0,
    );
    while (totalMemoryLength > memory_cap && storyData.memory.length > 0) {
      const removed = storyData.memory.shift();
      if (removed) {
        totalMemoryLength -= getMemoryContent(removed).length;
      }
    }
    const updatedStory = { ...storyData, ...updates };
    setStoryData(updatedStory);
  }

  async function handleCustomInput(customText: string, playerComment?: string) {
    if (!storyData) return;
    logger.action("User custom input", { customText });

    setLoading(true);
    setLoadingStage("story");

    //Adduser'scustominputtoscene
    storyData.scene.parts.push({
      content: ">" + customText,
      imageUrl: "",
      user: true,
      role: "user",
      playerComment: playerComment?.trim() ? playerComment.trim() : undefined,
      choices: [],
    });

    //ProcessLoretriggersafteruserinput
    processLoreTriggers(storyData, addNotification);

    const {
      storyModel,
      toolsModel,
      choicesModel,
      novelaiEnabled,
      novelaiKey,
      novelaiTemperature,
    } = getModelsFromPreset();
    const toolCallingEnabled = true;

    logger.ai_request("Starting generation (custom input)", {
      storyModel,
      toolsModel,
      choicesModel,
      toolCallingEnabled,
      novelaiEnabled,
    });

    // Track partial scene part as we stream
    let partialPart: ScenePart = {
      content: "",
      imageUrl: "",
      user: false,
      role: "assistant",
      choices: [],
    };

    try {
      const maxToolLoops =
        typeof window !== "undefined"
          ? parseInt(localStorage.getItem("maxToolLoops") || "10", 10)
          : 10;
      const customMaxContext =
        typeof window !== "undefined"
          ? parseInt(localStorage.getItem("customMaxContext") || "36000", 10)
          : 36000;
      const storyContextSize =
        typeof window !== "undefined"
          ? parseInt(localStorage.getItem("storyContextSize") || "16000", 10)
          : 16000;
      const customMaxOutput =
        typeof window !== "undefined"
          ? parseInt(localStorage.getItem("customMaxOutput") || "8000", 10)
          : 8000;
      const embeddingsEnabled =
        typeof window !== "undefined"
          ? localStorage.getItem("embeddingsEnabled") === "true"
          : false;
      const embeddingThreshold =
        typeof window !== "undefined"
          ? parseFloat(localStorage.getItem("embeddingThreshold") || "0.25")
          : 0.25;
      const usePrefill =
        typeof window !== "undefined"
          ? localStorage.getItem("usePrefill") !== "false"
          : true;
      const storytellerMode =
        typeof window !== "undefined"
          ? (localStorage.getItem("storytellerMode") as "narrator" | "dm") ||
            "narrator"
          : "narrator";
      // GM Stage is always enabled - legacy tool calling is deprecated
      const gmStageEnabled = true;

      // Track parallel completion of tools and choices
      let toolsComplete = !toolCallingEnabled; // If tools disabled, mark as complete
      let choicesComplete = false;

      const checkBothComplete = () => {
        if (toolsComplete && choicesComplete) {
          setLoadingStage(null);
        }
      };

      // Create abort controller for this generation
      generationAbortRef.current = new AbortController();

      await generateStoryTurn(
        storyData,
        "", // Custom input already in storyData.scene.parts
        {
          storyModel,
          toolsModel,
          choicesModel,
          enableTools: toolCallingEnabled,
          maxToolLoops,
          customMaxContext: customMaxContext > 0 ? customMaxContext : undefined,
          customStoryContext:
            storyContextSize > 0 ? storyContextSize : undefined,
          customMaxOutput: customMaxOutput > 0 ? customMaxOutput : undefined,
          novelaiEnabled: novelaiEnabled && !!novelaiKey,
          novelaiKey,
          novelaiTemperature,
          openRouterKey,
          deepseekKey,
          googleKey,
          mistralKey,
          deepinfraKey,
          storyId: storyDbId || undefined,
          enableEmbeddings: embeddingsEnabled,
          embeddingThreshold,
          samplingSettings: getSamplingSettings(),
          usePrefill,
          storytellerMode,
          enableGMStage: gmStageEnabled,
          gmStageModel: toolsModel, // Use same model as tools stage
          abortSignal: generationAbortRef.current.signal,
        },
        {
          onGMStageStart: () => {
            setLoadingStage("gm");
            setLiveGMEntries([]);
            logger.action("GM stage started (custom input)");
          },
          onCompaction: (summary) => {
            addNotification(
              "Recap: earlier events were condensed into a summary to save space",
              "info",
              6000,
            );
            logger.action("Story history compacted", {
              summaryLength: summary.length,
            });
          },
          onGMContent: (delta, fullContent) => {
            // Update or add the current thinking entry (last one if streaming)
            setLiveGMEntries((prev) => {
              const lastEntry = prev[prev.length - 1];
              if (lastEntry?.type === "thinking" && lastEntry.isStreaming) {
                // Update the existing streaming thinking entry
                return [
                  ...prev.slice(0, -1),
                  { type: "thinking", content: fullContent, isStreaming: true },
                ];
              } else {
                // Start a new thinking entry
                return [
                  ...prev,
                  { type: "thinking", content: fullContent, isStreaming: true },
                ];
              }
            });
          },
          onGMToolResult: (result) => {
            // Finalize any streaming thinking entry, then add tool result
            setLiveGMEntries((prev) => {
              const updated = prev.map((entry) =>
                entry.type === "thinking" && entry.isStreaming
                  ? { ...entry, isStreaming: false }
                  : entry,
              );
              return [...updated, { type: "tool", result }];
            });
          },
          onGMStageComplete: (gmResults, storyContext, usage, thinking) => {
            logger.ai_response("GM stage complete (custom input)", {
              toolCount: gmResults.length,
              contextLength: storyContext.length,
              thinkingLines: thinking?.length || 0,
              usage,
            });
            setLiveGMEntries([]);

            // Store GM results in the partial part (keeps all results including errors)
            if (gmResults.length > 0) {
              partialPart.gmToolCalls = gmResults;
            }
            if (storyContext) {
              partialPart.gmStoryContext = storyContext;
            }
            if (thinking && thinking.length > 0) {
              partialPart.gmThinking = thinking;
            }

            // Extract NPC reactions from GM results and show as toast notifications
            const npcReactionResults = gmResults.filter(
              (r) => r.toolName === "npc_reaction",
            );
            if (npcReactionResults.length > 0) {
              const newReactions = npcReactionResults
                .map((r) => (r.result as GMNPCReactionResult)?.reaction)
                .filter((r): r is NPCReaction => r !== undefined);

              if (newReactions.length > 0) {
                setPendingNPCReactions((prev) => [...prev, ...newReactions]);
                if (!partialPart.npcReactions) {
                  partialPart.npcReactions = [];
                }
                partialPart.npcReactions.push(...newReactions);
              }
            }

            setLoadingStage("story");
          },
          onStoryContent: (chunk: string, fullContent: string) => {
            // Update partial part as content streams
            partialPart.content = fullContent;

            // Only add to scene once (when we first get content)
            if (
              storyData.scene.parts[storyData.scene.parts.length - 1] !==
              partialPart
            ) {
              storyData.scene.parts = [...storyData.scene.parts, partialPart];
            }

            setStoryText(fullContent);
            // Don't call setStoryData here - it causes infinite loops during rapid streaming
            // storyText is sufficient for display, full update happens in onStoryComplete
            setLoading(false); // Let player read while tools/choices generate
            setPendingUserChoice(""); // Clear pending choice - response is here
          },
          onStoryComplete: (content: string, usage: any) => {
            // Update the partial part with the cleaned content (strips [GM State Update] etc)
            partialPart.content = content;
            setStoryText(content);
            setStoryData({ ...storyData }); // Full update only at completion

            // Tools and choices run in parallel after story - no separate loading stage
            logger.ai_response("Story narration complete (custom input)", {
              length: content.length,
              usage,
            });
          },
          onToolsStart: () => {
            // Keep showing tools stage while either is running
          },
          onToolsComplete: (toolCalls, toolResponses, stateChanges, usage) => {
            // Update the last part with tool data including stateChanges
            const lastPartIndex = storyData.scene.parts.length - 1;
            if (lastPartIndex >= 0) {
              storyData.scene.parts[lastPartIndex] = {
                ...storyData.scene.parts[lastPartIndex],
                toolCalls,
                toolResponses,
                stateChanges:
                  stateChanges.length > 0 ? stateChanges : undefined,
              };
            }

            // Store tool responses for AI feedback in next turn
            setPendingCommandResponses(toolResponses);

            // Notify player of quest changes
            processQuestNotifications(toolResponses, addNotification);

            setStoryData({ ...storyData });
            toolsComplete = true;
            checkBothComplete();

            logger.ai_response("Tools complete (custom input)", {
              toolCallsCount: toolCalls.length,
              responsesCount: toolResponses.length,
              stateChangesCount: stateChanges.length,
              usage,
            });
          },
          onChoicesStart: () => {
            // Keep showing tools stage while either is running
          },
          onChoicesComplete: (newChoices, usage) => {
            // Update the last part with choices
            const lastPartIndex = storyData.scene.parts.length - 1;
            if (lastPartIndex >= 0) {
              storyData.scene.parts[lastPartIndex] = {
                ...storyData.scene.parts[lastPartIndex],
                choices: newChoices,
              };
            }

            setChoices({ choices: newChoices });
            setStoryData({ ...storyData });
            choicesComplete = true;
            checkBothComplete();

            logger.ai_response("Choices complete (custom input)", {
              choicesCount: newChoices.length,
              usage,
            });
          },
          onComplete: (result) => {
            // Update token balance
            if (result.meta.balance !== undefined) {
              setTokenBalance(result.meta.balance);
            }

            if (result.meta.totalTokenCost) {
              addNotification(
                `Used ${result.meta.totalTokenCost} tokens`,
                "success",
              );
            }

            // Tick ability cooldowns at end of turn
            if (storyData.abilities && storyData.abilities.length > 0) {
              const offCooldown = tickCooldowns(storyData.abilities);
              if (offCooldown.length > 0) {
                addNotification(
                  `Abilities ready: ${offCooldown.join(", ")}`,
                  "success",
                );
              }
            }

            // Copy gmConversation from result.scenePart to the last scene part
            // This preserves the full GM conversation history for future context
            const lastIdx = storyData.scene.parts.length - 1;
            if (lastIdx >= 0 && result.scenePart?.gmConversation) {
              storyData.scene.parts[lastIdx] = {
                ...storyData.scene.parts[lastIdx],
                gmConversation: result.scenePart.gmConversation,
              };
            }

            setCanRetry(true);
            setCanUndo(true);
            setLoadingStage(null);

            // Clear command responses after successful generation
            setPendingCommandResponses([]);

            setStoryData({ ...storyData });

            // Save progress
            const lastPartForSave =
              storyData.scene.parts[storyData.scene.parts.length - 1];
            console.log(
              "Saving story (custom input) - last part choices:",
              lastPartForSave.choices?.length || 0,
              "choices",
            );
            saveProgress(storyData, true);

            logger.ai_response("Generation complete (custom input)", {
              totalTokenCost: result.meta.totalTokenCost,
            });
          },
          onError: (error) => {
            addNotification(`Error: ${error.message}`, "failure");
            setLoading(false);
            setLoadingStage(null);

            logger.error("Generation error (custom input)", {
              message: error.message,
            });
          },
        },
        pendingCommandResponses.length > 0
          ? pendingCommandResponses
          : undefined,
      );
    } catch (error: any) {
      addNotification(`Error: ${error.message}`, "failure");
      setLoading(false);
      setLoadingStage(null);
      logger.error("Generation exception (custom input)", {
        message: error.message,
      });
    }
  }

  function handleCommentSubmit(comment: string) {
    if (!storyData) return;
    const trimmed = comment.trim();
    if (!trimmed) return;

    const nextPart: ScenePart = {
      content: "",
      imageUrl: "",
      user: true,
      role: "user",
      playerComment: trimmed,
      choices: [],
    };

    const updatedStory: StoryData = {
      ...storyData,
      scene: {
        ...storyData.scene,
        parts: [...storyData.scene.parts, nextPart],
      },
    };

    setStoryData(updatedStory);
  }

  // Handle freeform action submission - analyze the action and return metadata
  async function handleActionSubmit(
    actionText: string,
  ): Promise<{ analysis: any; warnings: string[] } | null> {
    if (!storyData) return null;

    // Check if GM Stage is enabled - if so, skip action analysis
    // The GM Stage will determine mechanics during generation
    // GM Stage is always enabled - legacy tool calling is deprecated
    const gmStageEnabled = true;

    if (gmStageEnabled) {
      logger.action("GM Stage enabled - skipping action analysis", {
        actionText,
      });
      // Return a plain action analysis - GM Stage will determine mechanics
      return {
        analysis: {
          action_summary: actionText,
          skill_used: null,
          skill_dc: null,
          item_used: null,
          ability_used: null,
          resource_used: null,
          agmt_check: null,
          table: null,
          is_plain_action: true,
          stat_bonus: null,
          rolls: undefined,
        },
        warnings: ["GM Stage will determine mechanics during generation"],
      };
    }

    logger.action("Analyzing freeform action", { actionText });

    try {
      const { choicesModel } = getModelsFromPreset();
      const result = await analyzeAction(storyData, actionText, choicesModel, {
        openRouterKey,
        deepseekKey,
        googleKey,
        mistralKey,
        deepinfraKey,
      });

      logger.ai_response("Action analysis complete", {
        analysis: result.analysis,
        warnings: result.validationWarnings,
      });

      return {
        analysis: result.analysis,
        warnings: result.validationWarnings,
      };
    } catch (error: any) {
      logger.error("Action analysis failed", { error: error.message });
      addNotification(`Analysis failed: ${error.message}`, "failure");
      return null;
    }
  }

  // Handle confirmed freeform action - this is called after analysis with a Choice object
  async function handleActionConfirm(choice: Choice, playerComment?: string) {
    if (!storyData) return;

    logger.action("Freeform action confirmed", { choice });

    // Directly call handleChoice with the action choice
    // We pass the choice directly to avoid state timing issues
    handleChoiceWithAction(choice, playerComment);
  }

  // Public handleChoice function - wrapper for normal choice selection
  async function handleChoice(playerComment?: string) {
    handleChoiceWithAction(undefined, playerComment);
  }

  // Internal function that handles both regular choices and freeform actions
  async function handleChoiceWithAction(
    actionChoice?: Choice,
    playerComment?: string,
  ) {
    if (!storyData) return;

    let choice: Choice | undefined;
    if (actionChoice) {
      // Direct action from freeform mode
      choice = actionChoice;
    } else {
      choice = choices.choices.find((c) => input[c.text]);
    }

    if (!choice) return;
    const key = actionChoice ? 0 : choices.choices.indexOf(choice);

    logger.action("User selected choice", { choice: choice.text, index: key });

    setLoading(true);
    setLoadingStage("story");
    // Set pending user choice for immediate display in chat
    setPendingUserChoice(choice.text);

    // Check if this choice has intro_override (for starting choices)
    // If so, skip AI generation and use the preset intro directly
    if (choice.intro_override) {
      logger.action("Using intro_override instead of AI generation", {
        choice: choice.text,
      });

      const overridePart: ScenePart = {
        content: choice.intro_override,
        imageUrl: "",
        user: false,
        role: "assistant",
        choices: [], // Will need to generate choices next
      };
      storyData.scene.parts.push(overridePart);

      setStoryText(choice.intro_override);
      setStoryData({ ...storyData });
      setLoading(false);
      setLoadingStage("choices");

      try {
        const { choicesModel } = getModelsFromPreset();
        const { generateChoicesOnly } = await import("../misc/generation");
        const newChoices = await generateChoicesOnly(storyData, {
          choicesModel,
          openRouterKey,
          deepseekKey,
          googleKey,
          mistralKey,
          deepinfraKey,
        });

        const lastPartIndex = storyData.scene.parts.length - 1;
        if (lastPartIndex >= 0) {
          storyData.scene.parts[lastPartIndex] = {
            ...storyData.scene.parts[lastPartIndex],
            choices: newChoices,
          };
        }

        setChoices({ choices: newChoices });
        setStoryData({ ...storyData });
        setLoadingStage(null);

        saveProgress(storyData);
        addNotification("Story continues...", "success");
      } catch (error) {
        console.error("Error generating choices:", error);
        const fallbackChoices = [{ text: "Continue" }];
        const lastPartIndex = storyData.scene.parts.length - 1;
        if (lastPartIndex >= 0) {
          storyData.scene.parts[lastPartIndex] = {
            ...storyData.scene.parts[lastPartIndex],
            choices: fallbackChoices,
          };
        }
        setChoices({ choices: fallbackChoices });
        setStoryData({ ...storyData });
        setLoadingStage(null);
        saveProgress(storyData);
      }
      return;
    }

    // Build the player-facing text: the choice itself, plus lightweight
    // flavor annotations (oracle question, table roll, context dice).
    // No mechanical resolution happens client-side anymore - the GM decides
    // whether/how to roll via its own formula_roll tool once it reads this.
    const flavorLines: string[] = [];

    if (choice.agmt_check) {
      try {
        const LIKELIHOODS: Likelihood[] = [
          "Impossible",
          "No Way",
          "Very Unlikely",
          "Unlikely",
          "50/50",
          "Somewhat Likely",
          "Likely",
          "Very Likely",
          "Near Sure Thing",
          "A Sure Thing",
          "Has To Be",
        ];
        const match = choice.agmt_check.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
        const question = (match ? match[1] : choice.agmt_check).trim();
        const rawLikelihood = (match ? match[2] : "50/50").trim();
        const likelihood: Likelihood =
          LIKELIHOODS.find(
            (l) => l.toLowerCase() === rawLikelihood.toLowerCase(),
          ) || "50/50";
        const chaosFactor = storyData.agmtState?.chaosFactor ?? 5;
        const fateResult = askFate(likelihood, chaosFactor);

        flavorLines.push(`[AGMT Question: ${question}]`);
        const answerLine = fateResult.randomEvent
          ? `[AGMT Answer: ${fateResult.answer} - RANDOM EVENT TRIGGERED!]`
          : `[AGMT Answer: ${fateResult.answer}]`;
        flavorLines.push(answerLine);

        if (fateResult.randomEvent) {
          const focus = generateEventFocus();
          const meaning = generateEventMeaning();
          flavorLines.push(
            `[Random Event: ${focus.focus} - ${meaning.action} ${meaning.subject}]`,
          );
        }
      } catch (error) {
        console.error("Error processing agmt_check:", error);
      }
    }

    // Table roll: unified `table` field, with legacy fallbacks
    const tableForChoice = choice.table || choice.agmt_table || choice.custom_table;
    if (tableForChoice) {
      try {
        if (storyData.customTables) {
          const { getTableByName, rollOnCustomTable } =
            await import("../misc/tableRoller");
          const customTable = getTableByName(
            storyData.customTables,
            tableForChoice,
          );
          if (customTable) {
            const result = rollOnCustomTable(customTable);
            if (result) {
              flavorLines.push(`[${customTable.name}: ${result.text}]`);
            } else {
              addNotification(`Table "${customTable.name}" is empty`, "warning");
            }
          } else {
            const result = generateElement(tableForChoice as ElementCategory);
            if (result) {
              flavorLines.push(`[${tableForChoice} Table: ${result.element}]`);
            }
          }
        } else {
          const result = generateElement(tableForChoice as ElementCategory);
          if (result) {
            flavorLines.push(`[${tableForChoice} Table: ${result.element}]`);
          }
        }
      } catch (error) {
        console.error("Error processing table roll:", error);
      }
    }

    // Context rolls from action analysis (flavor dice unrelated to skill checks)
    if (choice.rolls && choice.rolls.length > 0) {
      for (const roll of choice.rolls) {
        if (!roll.dice) continue;
        try {
          const diceMatch = roll.dice.match(/^(\d+)?d(\d+)([+-]\d+)?$/i);
          if (diceMatch) {
            const count = parseInt(diceMatch[1] || "1");
            const sides = parseInt(diceMatch[2]);
            const modifier = parseInt(diceMatch[3] || "0");

            let total = modifier;
            const diceResults: number[] = [];
            for (let i = 0; i < count; i++) {
              const dieRoll = Math.floor(Math.random() * sides) + 1;
              diceResults.push(dieRoll);
              total += dieRoll;
            }

            const rollStr =
              count > 1 ? `(${diceResults.join("+")})` : `${diceResults[0]}`;
            const modStr =
              modifier !== 0 ? `${modifier > 0 ? "+" : ""}${modifier}` : "";
            flavorLines.push(
              `[Context: ${roll.description} (${roll.dice}) = ${rollStr}${modStr} → ${total}]`,
            );
          } else {
            console.warn(`Invalid dice notation: ${roll.dice}`);
          }
        } catch (error) {
          console.error("Error processing context roll:", error);
        }
      }
    }

    let text = ">" + choice.text;
    if (choice.stt_input) {
      text += "\n[Voice Input - may contain transcription errors]";
    }
    if (flavorLines.length > 0) {
      text += "\n" + flavorLines.join("\n");
    }

    storyData.scene.parts.push({
      content: text,
      imageUrl: "",
      user: true,
      role: "user",
      playerComment: playerComment?.trim() ? playerComment.trim() : undefined,
      choices: [], // User parts don't have choices - choices come from AI response
    });

    setChoices({ choices: [] });

    processLoreTriggers(storyData, addNotification);

    const {
      storyModel,
      toolsModel,
      choicesModel,
      novelaiEnabled,
      novelaiKey,
      novelaiTemperature,
    } = getModelsFromPreset();
    const toolCallingEnabled = true;

    logger.ai_request("Starting generation (choice)", {
      storyModel,
      toolsModel,
      choicesModel,
      toolCallingEnabled,
      novelaiEnabled,
    });

    // Track partial scene part as we stream
    let partialPart: ScenePart = {
      content: "",
      imageUrl: "",
      user: false,
      role: "assistant",
      choices: [],
    };

    const maxToolLoops =
      typeof window !== "undefined"
        ? parseInt(localStorage.getItem("maxToolLoops") || "10", 10)
        : 10;
    const customMaxContext =
      typeof window !== "undefined"
        ? parseInt(localStorage.getItem("customMaxContext") || "36000", 10)
        : 36000;
    const storyContextSize =
      typeof window !== "undefined"
        ? parseInt(localStorage.getItem("storyContextSize") || "16000", 10)
        : 16000;
    const customMaxOutput =
      typeof window !== "undefined"
        ? parseInt(localStorage.getItem("customMaxOutput") || "8000", 10)
        : 8000;
    const embeddingsEnabled =
      typeof window !== "undefined"
        ? localStorage.getItem("embeddingsEnabled") === "true"
        : false;
    const embeddingThreshold =
      typeof window !== "undefined"
        ? parseFloat(localStorage.getItem("embeddingThreshold") || "0.25")
        : 0.25;
    const usePrefill =
      typeof window !== "undefined"
        ? localStorage.getItem("usePrefill") !== "false"
        : true;
    const storytellerMode =
      typeof window !== "undefined"
        ? (localStorage.getItem("storytellerMode") as "narrator" | "dm") ||
          "narrator"
        : "narrator";
    // GM Stage is always enabled - legacy tool calling is deprecated
    const gmStageEnabled = true;

    // Track parallel completion of tools and choices
    let toolsComplete = !toolCallingEnabled; // If tools disabled, mark as complete
    let choicesComplete = !!actionChoice; // If freeform action, choices will be skipped

    const checkBothComplete = () => {
      if (toolsComplete && choicesComplete) {
        setLoadingStage(null);
      }
    };

    console.log(
      "[page.tsx] About to call generateStoryTurn. actionChoice:",
      !!actionChoice,
      actionChoice?.text?.slice(0, 50),
    );

    // Create abort controller for this generation
    generationAbortRef.current = new AbortController();

    try {
      await generateStoryTurn(
        storyData,
        "", // User choice already in storyData.scene.parts
        {
          storyModel,
          toolsModel,
          choicesModel,
          enableTools: toolCallingEnabled,
          maxToolLoops,
          customMaxContext: customMaxContext > 0 ? customMaxContext : undefined,
          customStoryContext:
            storyContextSize > 0 ? storyContextSize : undefined,
          customMaxOutput: customMaxOutput > 0 ? customMaxOutput : undefined,
          skipChoices: !!actionChoice, // Skip choices generation in freeform action mode
          novelaiEnabled: novelaiEnabled && !!novelaiKey,
          novelaiKey,
          novelaiTemperature,
          openRouterKey,
          deepseekKey,
          googleKey,
          mistralKey,
          deepinfraKey,
          storyId: storyDbId || undefined,
          abortSignal: generationAbortRef.current.signal,
          enableEmbeddings: embeddingsEnabled,
          embeddingThreshold,
          samplingSettings: getSamplingSettings(),
          usePrefill,
          storytellerMode,
          enableGMStage: gmStageEnabled,
          gmStageModel: toolsModel, // Use same model as tools stage
        },
        {
          onGMStageStart: () => {
            setLoadingStage("gm");
            // Reset live GM entries for new generation
            setLiveGMEntries([]);
            logger.action("GM stage started - determining mechanics");
          },
          onCompaction: (summary) => {
            addNotification(
              "Recap: earlier events were condensed into a summary to save space",
              "info",
              6000,
            );
            logger.action("Story history compacted", {
              summaryLength: summary.length,
            });
          },
          onGMContent: (delta, fullContent) => {
            // Stream GM thinking content - accumulate entries properly
            setLiveGMEntries((prev) => {
              const lastEntry = prev[prev.length - 1];
              if (lastEntry?.type === "thinking" && lastEntry.isStreaming) {
                return [
                  ...prev.slice(0, -1),
                  {
                    type: "thinking",
                    content: fullContent,
                    isStreaming: true,
                  },
                ];
              } else {
                return [
                  ...prev,
                  {
                    type: "thinking",
                    content: fullContent,
                    isStreaming: true,
                  },
                ];
              }
            });
          },
          onGMToolResult: (result) => {
            setLiveGMEntries((prev) => {
              const updated = prev.map((entry) =>
                entry.type === "thinking" && entry.isStreaming
                  ? { ...entry, isStreaming: false }
                  : entry,
              );
              return [...updated, { type: "tool", result }];
            });
          },
          onGMStageComplete: (gmResults, storyContext, usage, thinking) => {
            logger.ai_response("GM stage complete", {
              toolCount: gmResults.length,
              tools: gmResults.map((r) => r.toolName),
              contextLength: storyContext.length,
              thinkingLines: thinking?.length || 0,
              usage,
            });

            setLiveGMEntries([]);

            if (gmResults.length > 0) {
              partialPart.gmToolCalls = gmResults;
            }
            if (storyContext) {
              partialPart.gmStoryContext = storyContext;
            }
            if (thinking && thinking.length > 0) {
              partialPart.gmThinking = thinking;
            }

            // Find formula_roll results to show dice - this is the GM's own
            // freeform dice tool, the only roll path left in the app.
            const formulaResult = gmResults.find(
              (r) =>
                r.toolName === "formula_roll" &&
                (r.result as GMFormulaRollResult)?.showToPlayer !== false,
            );

            if (formulaResult && formulaResult.result) {
              const result = formulaResult.result as GMFormulaRollResult;
              const dc = typeof result.dc === "number" ? result.dc : 0;
              setDiceRoll({
                show: true,
                rolls: result.rolls || [],
                finalRoll: result.total,
                skillName: result.displayName || result.reason || "Roll",
                skillBonus: 0, // Formula rolls handle bonuses internally
                dc,
                isSuccess: result.success ?? true,
                isPartial: false,
                isCritical: false,
                hasAdvantage: false,
                hasDisadvantage: false,
                diceRolls: [result.rolls || []],
                formula: result.formula,
                resolvedFormula: result.resolvedFormula,
                reverseDC: result.reverseDC,
              });

              logger.action(
                "Dice visualizer triggered from GM formula_roll",
                {
                  formula: result.formula,
                  resolvedFormula: result.resolvedFormula,
                  total: result.total,
                  dc: result.dc,
                  success: result.success,
                },
              );
            }

            // Extract NPC reactions from GM results and show as toast notifications
            const npcReactionResults = gmResults.filter(
              (r) => r.toolName === "npc_reaction",
            );
            if (npcReactionResults.length > 0) {
              const newReactions = npcReactionResults
                .map((r) => (r.result as GMNPCReactionResult)?.reaction)
                .filter((r): r is NPCReaction => r !== undefined);

              if (newReactions.length > 0) {
                setPendingNPCReactions((prev) => [...prev, ...newReactions]);

                if (!partialPart.npcReactions) {
                  partialPart.npcReactions = [];
                }
                partialPart.npcReactions.push(...newReactions);

                logger.action("NPC reactions triggered", {
                  count: newReactions.length,
                  npcs: newReactions.map((r) => r.npcName),
                });
              }
            }

            setLoadingStage("story");
          },
          onStoryContent: (chunk: string, fullContent: string) => {
            partialPart.content = fullContent;

            if (
              storyData.scene.parts[storyData.scene.parts.length - 1] !==
              partialPart
            ) {
              storyData.scene.parts = [...storyData.scene.parts, partialPart];
            }

            setStoryText(fullContent);
            setLoading(false); // Let player read while tools/choices generate
            setPendingUserChoice(""); // Clear pending choice - response is here
          },
          onStoryComplete: (content: string, usage: any) => {
            partialPart.content = content;
            setStoryText(content);
            setStoryData({ ...storyData }); // Full update only at completion

            logger.ai_response("Story narration complete", {
              length: content.length,
              usage,
            });
          },
          onToolsStart: () => {
            // Keep showing tools stage while either is running
          },
          onToolsComplete: (
            toolCalls,
            toolResponses,
            stateChanges,
            usage,
          ) => {
            const lastPartIndex = storyData.scene.parts.length - 1;
            if (lastPartIndex >= 0) {
              storyData.scene.parts[lastPartIndex] = {
                ...storyData.scene.parts[lastPartIndex],
                toolCalls,
                toolResponses,
                stateChanges:
                  stateChanges.length > 0 ? stateChanges : undefined,
              };
            }

            setPendingCommandResponses(toolResponses);
            processQuestNotifications(toolResponses, addNotification);

            setStoryData({ ...storyData });
            toolsComplete = true;
            checkBothComplete();

            logger.ai_response("Tools complete", {
              toolCallsCount: toolCalls.length,
              responsesCount: toolResponses.length,
              stateChangesCount: stateChanges.length,
              usage,
            });
          },
          onChoicesStart: () => {
            // Keep showing tools stage while either is running
          },
          onChoicesComplete: (newChoices, usage) => {
            const lastPartIndex = storyData.scene.parts.length - 1;
            if (lastPartIndex >= 0) {
              storyData.scene.parts[lastPartIndex] = {
                ...storyData.scene.parts[lastPartIndex],
                choices: newChoices,
              };
            }

            setChoices({ choices: newChoices });
            setStoryData({ ...storyData });
            choicesComplete = true;
            checkBothComplete();

            logger.ai_response("Choices complete", {
              choicesCount: newChoices.length,
              usage,
            });
          },
          onComplete: (result) => {
            if (result.meta.balance !== undefined) {
              setTokenBalance(result.meta.balance);
            }

            if (partialPart.content.includes("!!!ENDCHAPTER!!!")) {
              const currentChapter = storyData.chapters.length;
              addNotification(
                `Chapter ${currentChapter} Complete!`,
                "success",
              );
            }

            // Tick ability cooldowns at end of turn
            if (storyData.abilities && storyData.abilities.length > 0) {
              const offCooldown = tickCooldowns(storyData.abilities);
              if (offCooldown.length > 0) {
                addNotification(
                  `Abilities ready: ${offCooldown.join(", ")}`,
                  "success",
                );
              }
            }

            const lastIdx = storyData.scene.parts.length - 1;
            if (lastIdx >= 0 && result.scenePart?.gmConversation) {
              storyData.scene.parts[lastIdx] = {
                ...storyData.scene.parts[lastIdx],
                gmConversation: result.scenePart.gmConversation,
              };
            }

            setCanRetry(true);
            setCanUndo(true);
            setLoadingStage(null);

            setPendingCommandResponses([]);

            setStoryData({ ...storyData });

            saveProgress(storyData, true);

            logger.ai_response("Generation complete (choice)", {
              totalTokenCost: result.meta.totalTokenCost,
            });
          },
          onError: (error) => {
            addNotification(`Error: ${error.message}`, "failure");
            setLoading(false);
            setLoadingStage(null);
            setCanRetry(true);
            setChoices({
              choices:
                storyData.scene.parts[storyData.scene.parts.length - 1]
                  ?.choices || [],
            });

            logger.error("Generation error (choice)", {
              message: error.message,
            });
          },
        },
        pendingCommandResponses.length > 0
          ? pendingCommandResponses
          : undefined,
      );
    } catch (error: any) {
      addNotification(`Error: ${error.message}`, "failure");
      setLoading(false);
      setLoadingStage(null);
      setCanRetry(true);
      logger.error("Generation exception (choice)", { message: error.message });
    }
  }

  function handleSelect(index: number): void {
    const key = choices.choices[index]?.text;
    if (!key) return;
    let newInput = input;
    if (!newInput[key]) {
      newInput[key] = true;
    }
    Object.keys(newInput).forEach((k) => {
      if (k !== key) {
        newInput[k] = false;
      }
    });
    setInput({ ...newInput });
  }

  // Stop generation (abort ongoing requests)
  function handleStop() {
    if (generationAbortRef.current) {
      generationAbortRef.current.abort();
      generationAbortRef.current = null;
    }
    setLoading(false);
    setLoadingStage(null);
    addNotification("Generation stopped", "warning");
  }

  async function handleRetry() {
    if (!storyData || loading) return;

    //CheckiflastpartisanAIresponse
    const lastPart = storyData.scene.parts[storyData.scene.parts.length - 1];
    if (!lastPart || lastPart.user) {
      addNotification("Nothing to retry", "warning");
      return;
    }

    //Findtheuser'schoice(secondtolastpart)
    if (storyData.scene.parts.length < 2) {
      addNotification("Cannot retry initial story", "warning");
      return;
    }

    setLoading(true);
    setLoadingStage("story");
    setCanRetry(false);

    // Save GM context from the last AI response before popping it
    // This preserves the dice rolls, skill checks, and reasoning for the regeneration
    const lastAIPart = storyData.scene.parts[storyData.scene.parts.length - 1];
    const savedGMThinking = lastAIPart.gmThinking;
    const savedGMStoryContext = lastAIPart.gmStoryContext;
    const savedGMToolCalls = lastAIPart.gmToolCalls;

    // Remove the last AI response
    storyData.scene.parts.pop();

    // Get the user choice part (now the last part after popping AI response)
    const userChoicePart =
      storyData.scene.parts[storyData.scene.parts.length - 1];

    // Get the user's choice content and choices for regeneration
    const userChoiceContent = userChoicePart?.content || "";
    const savedChoices = userChoicePart?.choices || [];

    // Also pop the user choice part - we'll re-add it via generateStoryTurn
    // This prevents duplicate user messages in the prompt
    if (userChoicePart?.user) {
      storyData.scene.parts.pop();
    }

    // Restore choices from the user's choice part
    if (savedChoices.length > 0) {
      setChoices({ choices: savedChoices });
    }

    addNotification("Regenerating response...", "info");
    logger.action("User requested retry", {
      hasGMThinking: !!savedGMThinking?.length,
      hasGMStoryContext: !!savedGMStoryContext,
      userChoice: userChoiceContent.substring(0, 100),
    });

    const {
      storyModel,
      toolsModel,
      choicesModel,
      novelaiEnabled,
      novelaiKey,
      novelaiTemperature,
    } = getModelsFromPreset();
    const toolCallingEnabled = true;

    logger.ai_request("Starting generation (retry)", {
      storyModel,
      toolsModel,
      choicesModel,
      toolCallingEnabled,
      novelaiEnabled,
    });

    // Track partial scene part as we stream
    // Preserve GM context from the popped part - this is the dice rolls and reasoning
    let partialPart: ScenePart = {
      content: "",
      imageUrl: "",
      user: false,
      role: "assistant",
      choices: [],
      gmThinking: savedGMThinking,
      gmStoryContext: savedGMStoryContext,
      gmToolCalls: savedGMToolCalls,
    };

    const maxToolLoops =
      typeof window !== "undefined"
        ? parseInt(localStorage.getItem("maxToolLoops") || "10", 10)
        : 10;
    const customMaxContext =
      typeof window !== "undefined"
        ? parseInt(localStorage.getItem("customMaxContext") || "36000", 10)
        : 36000;
    const storyContextSize =
      typeof window !== "undefined"
        ? parseInt(localStorage.getItem("storyContextSize") || "16000", 10)
        : 16000;
    const customMaxOutput =
      typeof window !== "undefined"
        ? parseInt(localStorage.getItem("customMaxOutput") || "8000", 10)
        : 8000;
    const embeddingsEnabled =
      typeof window !== "undefined"
        ? localStorage.getItem("embeddingsEnabled") === "true"
        : false;
    const embeddingThreshold =
      typeof window !== "undefined"
        ? parseFloat(localStorage.getItem("embeddingThreshold") || "0.25")
        : 0.25;
    const usePrefill =
      typeof window !== "undefined"
        ? localStorage.getItem("usePrefill") !== "false"
        : true;
    const storytellerMode =
      typeof window !== "undefined"
        ? (localStorage.getItem("storytellerMode") as "narrator" | "dm") ||
          "narrator"
        : "narrator";
    // GM Stage is always enabled - legacy tool calling is deprecated
    const gmStageEnabled = true;

    // Track parallel completion of tools and choices
    let toolsComplete = !toolCallingEnabled; // If tools disabled, mark as complete
    let choicesComplete = false;

    const checkBothComplete = () => {
      if (toolsComplete && choicesComplete) {
        setLoadingStage(null);
      }
    };

    // Create abort controller for this generation
    generationAbortRef.current = new AbortController();

    // Re-add the user choice part before generation (matching normal flow)
    // The prompt builder will deduplicate this when building the context
    storyData.scene.parts.push({
      content: userChoiceContent,
      imageUrl: "",
      user: true,
      role: "user",
      choices: savedChoices, // Preserve the choices from the original turn
    });

    try {
      await generateStoryTurn(
        storyData,
        userChoiceContent, // Use the user's original choice content
        {
          storyModel,
          toolsModel,
          choicesModel,
          enableTools: toolCallingEnabled,
          maxToolLoops,
          customMaxContext: customMaxContext > 0 ? customMaxContext : undefined,
          customStoryContext:
            storyContextSize > 0 ? storyContextSize : undefined,
          customMaxOutput: customMaxOutput > 0 ? customMaxOutput : undefined,
          skipChoices: true, // On retry, we already have choices from the previous generation
          novelaiEnabled: novelaiEnabled && !!novelaiKey,
          novelaiKey,
          novelaiTemperature,
          openRouterKey,
          deepseekKey,
          googleKey,
          mistralKey,
          deepinfraKey,
          storyId: storyDbId || undefined,
          enableEmbeddings: embeddingsEnabled,
          embeddingThreshold,
          samplingSettings: getSamplingSettings(),
          usePrefill,
          storytellerMode,
          // Skip GM stage on retry - use the saved context from the popped part
          enableGMStage: false, // Don't re-run GM stage
          precomputedGMContext: savedGMStoryContext,
          precomputedGMThinking: savedGMThinking,
          abortSignal: generationAbortRef.current.signal,
        },
        {
          onStoryContent: (chunk: string, fullContent: string) => {
            // Update partial part as content streams
            partialPart.content = fullContent;

            // Only add to scene once (when we first get content)
            if (
              storyData.scene.parts[storyData.scene.parts.length - 1] !==
              partialPart
            ) {
              storyData.scene.parts = [...storyData.scene.parts, partialPart];
            }

            setStoryText(fullContent);
            // Don't call setStoryData here - it causes infinite loops during rapid streaming
            // storyText is sufficient for display, full update happens in onStoryComplete
            setLoading(false); // Let player read while tools/choices generate
            setPendingUserChoice(""); // Clear pending choice - response is here
          },
          onStoryComplete: (content: string, usage: any) => {
            // Update the partial part with the cleaned content (strips [GM State Update] etc)
            partialPart.content = content;
            setStoryText(content);
            setStoryData({ ...storyData }); // Full update only at completion

            // Tools and choices run in parallel after story - no separate loading stage
            logger.ai_response("Story narration complete (retry)", {
              length: content.length,
              usage,
            });
          },
          onToolsStart: () => {
            // Keep showing tools stage while either is running
          },
          onToolsComplete: (toolCalls, toolResponses, stateChanges, usage) => {
            // Update the last part with tool data including stateChanges
            const lastPartIndex = storyData.scene.parts.length - 1;
            if (lastPartIndex >= 0) {
              storyData.scene.parts[lastPartIndex] = {
                ...storyData.scene.parts[lastPartIndex],
                toolCalls,
                toolResponses,
                stateChanges:
                  stateChanges.length > 0 ? stateChanges : undefined,
              };
            }

            // Store tool responses for AI feedback in next turn
            setPendingCommandResponses(toolResponses);

            // Notify player of quest changes
            processQuestNotifications(toolResponses, addNotification);

            setStoryData({ ...storyData });
            toolsComplete = true;
            checkBothComplete();

            logger.ai_response("Tools complete (retry)", {
              toolCallsCount: toolCalls.length,
              responsesCount: toolResponses.length,
              stateChangesCount: stateChanges.length,
              usage,
            });
          },
          onChoicesStart: () => {
            // Keep showing tools stage while either is running
          },
          onChoicesComplete: (newChoices, usage) => {
            // Update the last part with choices
            const lastPartIndex = storyData.scene.parts.length - 1;
            if (lastPartIndex >= 0) {
              storyData.scene.parts[lastPartIndex] = {
                ...storyData.scene.parts[lastPartIndex],
                choices: newChoices,
              };
            }

            setChoices({ choices: newChoices });
            setStoryData({ ...storyData });
            choicesComplete = true;
            checkBothComplete();

            logger.ai_response("Choices complete (retry)", {
              choicesCount: newChoices.length,
              usage,
            });
          },
          onComplete: (result) => {
            // Update token balance
            if (result.meta.balance !== undefined) {
              setTokenBalance(result.meta.balance);
            }

            // Check for chapter completion
            if (partialPart.content.includes("!!!ENDCHAPTER!!!")) {
              const currentChapter = storyData.chapters.length;
              addNotification(`Chapter ${currentChapter} Complete!`, "success");
            }

            // Process lore triggers based on new content
            processLoreTriggers(storyData, addNotification);

            // Copy gmConversation from result.scenePart to the last scene part
            // This preserves the full GM conversation history for future context
            const lastIdx = storyData.scene.parts.length - 1;
            if (lastIdx >= 0 && result.scenePart?.gmConversation) {
              storyData.scene.parts[lastIdx] = {
                ...storyData.scene.parts[lastIdx],
                gmConversation: result.scenePart.gmConversation,
              };
            }

            setCanRetry(true);
            setCanUndo(true);
            setLoadingStage(null);

            // Clear command responses after successful generation
            setPendingCommandResponses([]);

            setStoryData({ ...storyData });

            // Save progress
            saveProgress(storyData);

            addNotification("Response regenerated", "success");

            logger.ai_response("Generation complete (retry)", {
              totalTokenCost: result.meta.totalTokenCost,
            });
          },
          onError: (error) => {
            addNotification(`Error: ${error.message}`, "failure");
            setLoading(false);
            setLoadingStage(null);
            setCanRetry(true);

            logger.error("Generation error (retry)", {
              message: error.message,
            });
          },
        },
        pendingCommandResponses.length > 0
          ? pendingCommandResponses
          : undefined,
      );
    } catch (error: any) {
      addNotification(`Error: ${error.message}`, "failure");
      setLoading(false);
      setLoadingStage(null);
      setCanRetry(true);
      logger.error("Generation exception (retry)", { message: error.message });
    }
  }

  async function handleUndo() {
    if (!storyData || loading) return;

    // Check if there are at least 2 parts: user choice + AI response
    if (storyData.scene.parts.length < 2) {
      addNotification("Nothing to undo", "warning");
      return;
    }

    const lastPart = storyData.scene.parts[storyData.scene.parts.length - 1];
    const secondLastPart =
      storyData.scene.parts[storyData.scene.parts.length - 2];

    // Last part should be AI response, second-to-last should be user choice
    if (lastPart.user || !secondLastPart.user) {
      addNotification("Cannot undo from current state", "warning");
      return;
    }

    logger.action("User requested undo");

    // Remove both the AI response and the user choice
    storyData.scene.parts.pop();
    storyData.scene.parts.pop();

    // Update state to previous scene part
    if (storyData.scene.parts.length > 0) {
      const previousPart =
        storyData.scene.parts[storyData.scene.parts.length - 1];
      setStoryText(previousPart.content);
      setChoices({ choices: previousPart.choices || [] });
      const inputs =
        previousPart.choices?.reduce(
          (acc, choice) => ({ ...acc, [choice.text]: false }),
          {} as Record<string, boolean>,
        ) || {};
      setInput(inputs);
    }

    setCanRetry(false);
    setCanUndo(storyData.scene.parts.length >= 2);
    addNotification("Undone last action", "success");

    // Save progress
    await saveProgress(storyData);
  }

  async function handleEdit(editedText: string, partIndex: number) {
    if (!storyData || loading) return;

    if (partIndex < 0 || partIndex >= storyData.scene.parts.length) {
      addNotification("Invalid part to edit", "failure");
      return;
    }

    const partToEdit = storyData.scene.parts[partIndex];

    // Only allow editing AI responses
    if (partToEdit.user) {
      addNotification("Can only edit AI responses", "warning");
      return;
    }

    logger.action("User editing story part", {
      partIndex,
      originalLength: partToEdit.content.length,
      editedLength: editedText.length,
    });

    // If the text contains tags, re-parse it to update structured data
    if (
      editedText.includes("<output>") ||
      editedText.includes("<story>") ||
      editedText.includes("<choices>") ||
      editedText.includes("<memory>") ||
      editedText.includes("<commands>")
    ) {
      const parsedPart = outputToScenePart(editedText);
      storyData.scene.parts[partIndex] = {
        ...partToEdit,
        ...parsedPart,
        raw: editedText, // Store the edited raw text
      };

      // Update UI if this is the current/last part
      if (partIndex === storyData.scene.parts.length - 1) {
        setStoryText(parsedPart.content);
        if (parsedPart.choices) {
          setChoices({ choices: parsedPart.choices });
        }
      }
    } else {
      // Just update content and raw text
      storyData.scene.parts[partIndex] = {
        ...partToEdit,
        content: editedText,
        raw: editedText,
      };

      // Update UI if this is the current/last part
      if (partIndex === storyData.scene.parts.length - 1) {
        setStoryText(editedText);
      }
    }

    setStoryData({ ...storyData });
    addNotification("Story narration edited successfully", "success");

    // Save progress to database
    await saveProgress(storyData);
  }

  async function handleRerollChoices() {
    if (!storyData || loading) return;

    setLoading(true);
    setLoadingStage("choices");

    try {
      const { choicesModel } = getModelsFromPreset();
      const { generateChoicesOnly } = await import("../misc/generation");

      const newChoices = await generateChoicesOnly(storyData, {
        choicesModel,
        openRouterKey,
        deepseekKey,
        googleKey,
        mistralKey,
        deepinfraKey,
      });

      // Update the last part with new choices
      const lastPartIndex = storyData.scene.parts.length - 1;
      if (lastPartIndex >= 0 && !storyData.scene.parts[lastPartIndex].user) {
        storyData.scene.parts[lastPartIndex] = {
          ...storyData.scene.parts[lastPartIndex],
          choices: newChoices,
        };
      }

      setChoices({ choices: newChoices });
      setStoryData({ ...storyData });

      // Save progress
      await saveProgress(storyData);
      addNotification("Choices regenerated!", "success");
    } catch (error: any) {
      console.error("Error regenerating choices:", error);
      addNotification(
        `Failed to regenerate choices: ${error.message}`,
        "failure",
      );
    } finally {
      setLoading(false);
      setLoadingStage(null);
    }
  }

  if (loadingStory) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-400 border-t-transparent mx-auto"></div>
            <p className="mt-4 text-sm text-blue-200/60">Loading story...</p>
          </div>
        </div>
      </div>
    );
  }

  //Checkforgameoverstate
  const isGameOver =
    storyData?.scene.parts.some((part) => part.gameOver) || false;

  if (!storyData) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center bg-blue-950/50 rounded-xl p-6 border border-blue-800/30">
            <DynamicIcon
              name="FileQuestion"
              className="w-12 h-12 text-blue-200/30 mx-auto mb-3"
            />
            <p className="text-blue-200/60 mb-4">Story not found</p>
            <button
              onClick={() => router.push("/library")}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              Browse Adventures
            </button>
          </div>
        </div>
      </div>
    );
  }

  //GameOverScreen
  if (isGameOver && storyData) {
    const achievedCount = storyData.achievements.filter(
      (a) => a.dateAchieved,
    ).length;
    const totalAchievements = storyData.achievements.length;
    const completedQuests =
      storyData.quests?.filter((q) => q.fulfilled).length || 0;
    const totalQuests = storyData.quests?.length || 0;

    return (
      <div className="min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 py-6 px-4">
        <div className="w-full px-2 sm:max-w-3xl mx-auto">
          {/* Game Over Header */}
          <div className="bg-blue-950/50 rounded-xl border border-blue-800/30 p-6 mb-4 text-center">
            <div className="flex items-center justify-center gap-3 text-red-400 mb-3">
              <DynamicIcon name="Skull" className="w-8 h-8" />
              <h1 className="text-3xl font-bold">Game Over</h1>
              <DynamicIcon name="Skull" className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-1">
              {storyData.story_name}
            </h2>
            <p className="text-sm text-blue-200/60">
              {storyData.player_name}&apos;s journey has concluded
            </p>
          </div>

          {/* Stats Summary */}
          <div className="bg-blue-950/50 rounded-xl border border-blue-800/30 p-4 mb-4">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <DynamicIcon name="BarChart2" className="w-5 h-5 text-blue-400" />
              Final Statistics
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-purple-500/10 rounded-lg border border-purple-500/30">
                <div className="flex items-center gap-2 mb-1">
                  <DynamicIcon
                    name="Trophy"
                    className="w-5 h-5 text-purple-400"
                  />
                  <span className="text-sm font-medium text-white">
                    Achievements
                  </span>
                </div>
                <div className="text-2xl font-bold text-purple-400">
                  {achievedCount}/{totalAchievements}
                </div>
                <div className="text-xs text-blue-200/40">
                  {totalAchievements > 0
                    ? Math.round((achievedCount / totalAchievements) * 100)
                    : 0}
                  % Complete
                </div>
              </div>

              <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/30">
                <div className="flex items-center gap-2 mb-1">
                  <DynamicIcon
                    name="Target"
                    className="w-5 h-5 text-green-400"
                  />
                  <span className="text-sm font-medium text-white">Quests</span>
                </div>
                <div className="text-2xl font-bold text-green-400">
                  {completedQuests}/{totalQuests}
                </div>
                <div className="text-xs text-blue-200/40">
                  {totalQuests > 0
                    ? Math.round((completedQuests / totalQuests) * 100)
                    : 0}
                  % Complete
                </div>
              </div>

              <div className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
                <div className="flex items-center gap-2 mb-1">
                  <DynamicIcon
                    name="Coins"
                    className="w-5 h-5 text-yellow-400"
                  />
                  <span className="text-sm font-medium text-white">Points</span>
                </div>
                <div className="text-2xl font-bold text-yellow-400">
                  {storyData.points}
                </div>
                <div className="text-xs text-blue-200/40">
                  Progression Earned
                </div>
              </div>
            </div>
          </div>

          {/* Achievements Earned */}
          {achievedCount > 0 && (
            <div className="bg-blue-950/50 rounded-xl border border-blue-800/30 p-4 mb-4">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <DynamicIcon name="Trophy" className="w-5 h-5 text-amber-400" />
                Achievements Earned
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {storyData.achievements
                  .filter((a) => a.dateAchieved)
                  .map((achievement, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/30"
                    >
                      <div className="flex items-start gap-2">
                        <DynamicIcon
                          name={achievement.symbol}
                          className="w-5 h-5 text-amber-400 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-medium text-white text-sm">
                            {achievement.title}
                          </div>
                          <div className="text-xs text-blue-200/40 line-clamp-1">
                            {achievement.description}
                          </div>
                          <div className="text-xs text-amber-400 font-medium mt-0.5">
                            +{achievement.points} points
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="bg-blue-950/50 rounded-xl border border-blue-800/30 p-4">
            <h3 className="text-lg font-semibold text-white mb-4 text-center">
              What&apos;s Next?
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setConfirmDialog({
                    isOpen: true,
                    title: "Replay Story",
                    message:
                      "Start this adventure from the beginning? All progress will be lost.",
                    icon: "RotateCcw",
                    confirmText: "Replay",
                    confirmButtonClass: "bg-blue-600 hover:bg-blue-700",
                    onConfirm: async () => {
                      setConfirmDialog({ ...confirmDialog, isOpen: false });
                      //Replaysamestory-resettobeginning
                      if (!storyDbId) return;
                      try {
                        // Try to fetch fresh adventure data if we have a source adventure
                        let freshTemplate: Partial<StoryData> | null = null;
                        if (sourceAdventureId) {
                          try {
                            const { getLocalAdventure } =
                              await import("@/app/misc/localAdventureManager");
                            const localAdv =
                              await getLocalAdventure(sourceAdventureId);
                            freshTemplate =
                              (localAdv?.adventureData as Partial<Adventure>)
                                ?.storyTemplate || null;
                          } catch (e) {
                            console.warn(
                              "Could not fetch fresh adventure data, using current story values",
                            );
                          }
                        }

                        //Resetstorytoinitialstatebutkeepadventuretemplate
                        const resetStoryData: StoryData = {
                          ...storyData,
                          // Reset dynamic fields from fresh adventure template or current story
                          stats: freshTemplate?.stats || storyData.stats,
                          resources:
                            freshTemplate?.resources || storyData.resources,
                          inventory:
                            freshTemplate?.inventory || storyData.inventory,
                          abilities:
                            freshTemplate?.abilities || storyData.abilities,
                          conditions: freshTemplate?.conditions || [],
                          relationships:
                            freshTemplate?.relationships ||
                            storyData.relationships,
                          variables:
                            freshTemplate?.variables || storyData.variables,
                          skillTrees:
                            freshTemplate?.skillTrees || storyData.skillTrees,
                          agmtState:
                            freshTemplate?.agmtState || storyData.agmtState,
                          customTables:
                            freshTemplate?.customTables ||
                            storyData.customTables,
                          restState: freshTemplate?.restState || {
                            quickRestsUsed: 0,
                            shortRestsUsed: 0,
                          },
                          unlockedNodes:
                            freshTemplate?.unlockedNodes ||
                            storyData.unlockedNodes,
                          // Always reset these
                          scene: { parts: [] },
                          memory: [],
                          currentChapter: 0,
                          chapters: [],
                          points: 0,
                          earnedPointsFromChapters: [],
                          earnedPointsFromQuests: [],
                          achievements: (
                            freshTemplate?.achievements ||
                            storyData.achievements
                          ).map((a) => ({
                            ...a,
                            dateAchieved: null,
                          })),
                          quests:
                            (freshTemplate?.quests || storyData.quests)?.map(
                              (q) => ({
                                ...q,
                                fulfilled: false,
                                active: false,
                              }),
                            ) || [],
                          lore: (freshTemplate?.lore || storyData.lore).map(
                            (l) => ({
                              ...l,
                              on:
                                l.on_triggers && l.on_triggers.length > 0
                                  ? false
                                  : true,
                            }),
                          ),
                          newGamePlusMode: false,
                        };

                        // Save reset story locally
                        const { saveLocalStory } =
                          await import("@/app/misc/localStoryManager");
                        await saveLocalStory(storyDbId, resetStoryData);

                        addNotification(
                          "Story reset! Starting fresh...",
                          "success",
                        );
                        router.push(`/story?storyId=${storyDbId}`);
                        window.location.reload();
                      } catch (error) {
                        console.error("Error replaying story:", error);
                        addNotification("Failed to replay story", "failure");
                      }
                    },
                  });
                }}
                className="p-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <DynamicIcon name="RotateCcw" className="w-5 h-5" />
                <div className="text-left text-sm">
                  <div>Replay</div>
                  <div className="text-xs opacity-70">Fresh start</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setConfirmDialog({
                    isOpen: true,
                    title: "New Game Plus",
                    message:
                      "Start a New Game Plus run? You&apos;ll keep all achievements, stats, resources, and items, plus earn bonus rewards!",
                    icon: "Star",
                    confirmText: "Start NG+",
                    confirmButtonClass:
                      "bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700",
                    onConfirm: async () => {
                      setConfirmDialog({ ...confirmDialog, isOpen: false });
                      //New Game Plus - keep achievements and increase difficulty
                      if (!storyDbId) return;
                      try {
                        const ngPlusCount =
                          (storyData.newGamePlusCount || 0) + 1;
                        const bonusPoints = ngPlusCount * 50; //50pointsperNG+run

                        // Try to fetch fresh adventure data for story-specific fields (lore, quests)
                        let freshTemplate: Partial<StoryData> | null = null;
                        if (sourceAdventureId) {
                          try {
                            const { getLocalAdventure } =
                              await import("@/app/misc/localAdventureManager");
                            const localAdv =
                              await getLocalAdventure(sourceAdventureId);
                            freshTemplate =
                              (localAdv?.adventureData as Partial<Adventure>)
                                ?.storyTemplate || null;
                          } catch (e) {
                            console.warn(
                              "Could not fetch fresh adventure data, using current story values",
                            );
                          }
                        }

                        //Resetstorybutkeepachievements,stats,resources,andinventory
                        const ngPlusStoryData: StoryData = {
                          ...storyData,
                          scene: { parts: [] },
                          memory: [],
                          currentChapter: 0,
                          chapters: [],
                          points: bonusPoints, //Startwithbonuspoints
                          earnedPointsFromChapters: [],
                          earnedPointsFromQuests: [],
                          //Keepachievements,stats,resources,inventory,abilities!
                          achievements: storyData.achievements,
                          stats: storyData.stats, //Keepstats
                          resources: storyData.resources, //Keepresources
                          inventory: storyData.inventory, //Keepinventory
                          abilities: storyData.abilities, //Keepabilities
                          conditions: [], // Clear conditions
                          // Reset story-specific fields from fresh adventure
                          relationships:
                            freshTemplate?.relationships ||
                            storyData.relationships, // Reset relationships
                          variables:
                            freshTemplate?.variables || storyData.variables,
                          agmtState:
                            freshTemplate?.agmtState || storyData.agmtState,
                          customTables:
                            freshTemplate?.customTables ||
                            storyData.customTables,
                          restState: { quickRestsUsed: 0, shortRestsUsed: 0 },
                          // Keep skill tree progress!
                          skillTrees: storyData.skillTrees,
                          unlockedNodes: storyData.unlockedNodes,
                          // Reset quests from fresh adventure or current story
                          quests:
                            (freshTemplate?.quests || storyData.quests)?.map(
                              (q) => ({
                                ...q,
                                fulfilled: false,
                                active: false,
                              }),
                            ) || [],
                          // Reset lore from fresh adventure or current story
                          lore: (freshTemplate?.lore || storyData.lore).map(
                            (l) => ({
                              ...l,
                              on:
                                l.on_triggers && l.on_triggers.length > 0
                                  ? false
                                  : true,
                            }),
                          ),
                          newGamePlusCount: ngPlusCount,
                          newGamePlusMode: true,
                        };

                        // Save NG+ story locally
                        const { saveLocalStory } =
                          await import("@/app/misc/localStoryManager");
                        await saveLocalStory(storyDbId, ngPlusStoryData);

                        addNotification(
                          `New Game Plus ${ngPlusCount} activated! +${bonusPoints} points`,
                          "success",
                        );
                        router.push(`/story?storyId=${storyDbId}`);
                        window.location.reload();
                      } catch (error) {
                        console.error("Error starting NG+:", error);
                        addNotification(
                          "Failed to start New Game Plus",
                          "failure",
                        );
                      }
                    },
                  });
                }}
                className="p-3 bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <DynamicIcon name="Star" className="w-5 h-5" />
                <div className="text-left text-sm">
                  <div>New Game+</div>
                  <div className="text-xs opacity-70">Keep progress</div>
                </div>
              </button>

              <button
                onClick={() => router.push("/library")}
                className="p-3 bg-blue-900/50 hover:bg-blue-900/70 text-white font-medium rounded-lg border border-blue-800/30 transition-colors flex items-center gap-2"
              >
                <DynamicIcon name="Library" className="w-5 h-5" />
                <div className="text-left text-sm">
                  <div>Library</div>
                  <div className="text-xs opacity-70">Your stories</div>
                </div>
              </button>

              <button
                onClick={() => router.push("/creator")}
                className="p-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <DynamicIcon name="Map" className="w-5 h-5" />
                <div className="text-left text-sm">
                  <div>Explore</div>
                  <div className="text-xs opacity-70">New adventures</div>
                </div>
              </button>
            </div>

            {storyData.newGamePlusCount && storyData.newGamePlusCount > 0 && (
              <div className="mt-4 p-3 bg-amber-500/10 rounded-lg border border-amber-500/30 text-center">
                <div className="font-medium text-sm text-amber-300 flex items-center justify-center gap-2">
                  <DynamicIcon name="Star" className="w-4 h-4" />
                  New Game Plus: Run #{storyData.newGamePlusCount}
                </div>
                <div className="text-xs text-blue-200/40 mt-0.5">
                  Completed {storyData.newGamePlusCount}{" "}
                  {storyData.newGamePlusCount === 1
                    ? "playthrough"
                    : "playthroughs"}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  //Showpresetselectionbeforestartingstory
  if (showPresetSelection && storyData) {
    const availablePresets = [
      DEFAULT_PRESET,
      ...(storyData.presets || []).filter((p) => p.id !== "custom"),
    ];

    return (
      <div className="min-h-[calc(100vh-4rem)] bg-linear-to-br from-gray-900 via-blue-950 to-purple-950">
        <div className="py-6 px-4">
          <div className="w-full px-2 sm:max-w-3xl mx-auto">
            {/* Header */}
            <div className="text-center mb-6">
              <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
                {storyData.story_name}
              </h1>
              <p className="text-sm text-blue-200/60">
                Choose your character to begin
              </p>
            </div>

            {/* Preset Selection */}
            <div className="bg-blue-950/50 rounded-xl border border-blue-800/30 p-4 mb-4">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <DynamicIcon name="Users" className="w-5 h-5 text-blue-400" />
                Select Character
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {availablePresets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => handlePresetSelect(preset)}
                    className={`rounded-lg p-4 text-left transition-all border ${
                      preset.id === "custom"
                        ? "bg-purple-500/10 border-purple-500/30 hover:border-purple-500/60"
                        : "bg-blue-900/30 border-blue-800/30 hover:border-blue-600/50"
                    }`}
                  >
                    <div className="flex items-start gap-3 mb-2">
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          preset.id === "custom"
                            ? "bg-purple-500/20"
                            : "bg-blue-500/20"
                        }`}
                      >
                        <DynamicIcon
                          name={preset.icon}
                          className={`w-5 h-5 ${
                            preset.id === "custom"
                              ? "text-purple-400"
                              : "text-blue-400"
                          }`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white text-sm">
                          {preset.name}
                        </h3>
                        <p className="text-xs text-blue-200/40 line-clamp-2">
                          {preset.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {preset.id !== "custom" ? (
                        <>
                          {preset.stats && preset.stats.length > 0 && (
                            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 text-xs rounded">
                              {preset.stats.length} Stats
                            </span>
                          )}
                          {preset.resources && preset.resources.length > 0 && (
                            <span className="px-2 py-0.5 bg-green-500/20 text-green-300 text-xs rounded">
                              {preset.resources.length} Resources
                            </span>
                          )}
                          {preset.inventory && preset.inventory.length > 0 && (
                            <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-300 text-xs rounded">
                              {preset.inventory.length} Items
                            </span>
                          )}
                          {preset.conditions &&
                            preset.conditions.length > 0 && (
                              <span className="px-2 py-0.5 bg-rose-500/20 text-rose-300 text-xs rounded">
                                {preset.conditions.length} Conditions
                              </span>
                            )}
                        </>
                      ) : (
                        <>
                          <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-xs rounded">
                            Default Stats
                          </span>
                          <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-xs rounded">
                            Starter Items
                          </span>
                        </>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Back Button */}
            <button
              onClick={() => router.push("/library")}
              className="px-4 py-2 bg-blue-950/50 hover:bg-blue-900/50 text-blue-200 text-sm font-medium rounded-lg border border-blue-800/30 transition-colors flex items-center gap-2"
            >
              <DynamicIcon name="ArrowLeft" className="w-4 h-4" />
              Back to Library
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[calc(100vh-4rem)] bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 py-0 px-0 pb-0 sm:py-4 sm:px-4 sm:pb-20">
      {/* Ambient glow orbs - purely decorative, sits behind all content */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-purple-700/20 blur-[100px]" />
        <div className="absolute top-1/3 -right-32 w-96 h-96 rounded-full bg-blue-700/15 blur-[110px]" />
        <div className="absolute bottom-0 left-1/4 w-80 h-80 rounded-full bg-indigo-600/10 blur-[100px]" />
      </div>
      <main className="flex gap-2 sm:gap-4 w-full px-0 sm:px-2 sm:max-w-4xl mx-auto flex-col">
        {/* Compact Story Header */}
        <div className="bg-blue-950/50 backdrop-blur-sm rounded-none sm:rounded-2xl border-x-0 sm:border border-blue-800/30 px-4 py-3 sm:shadow-lg sm:shadow-purple-950/20">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => router.push("/library")}
                className="p-1.5 hover:bg-blue-900/50 rounded-lg transition-colors"
                title="Back to Library"
              >
                <DynamicIcon
                  name="ArrowLeft"
                  className="w-5 h-5 text-blue-300"
                />
              </button>
              <h1 className="text-lg font-semibold text-white truncate">
                {storyData.story_name}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              {/* Sync Status */}
              <div
                className={`w-2 h-2 rounded-full ${
                  syncStatus === "synced"
                    ? "bg-green-500"
                    : syncStatus === "pending"
                      ? "bg-yellow-500 animate-pulse"
                      : syncStatus === "local-only"
                        ? "bg-blue-500"
                        : "bg-red-500"
                }`}
                title={`Sync: ${syncStatus}`}
              />
              {/* Token Balance */}
              {tokenBalance !== null && (
                <div className="flex items-center gap-1.5 text-yellow-400 font-medium">
                  <DynamicIcon name="Coins" className="w-4 h-4" />
                  <span className="text-sm">{tokenBalance}</span>
                </div>
              )}
              {/* Menu / Settings entry (moved out of the tab row) */}
              <button
                type="button"
                onClick={() => setCurrentState(StoryState.MENU)}
                aria-label="Menu"
                aria-current={
                  currentState === StoryState.MENU ? "page" : undefined
                }
                title="Menu"
                className={`focus-ring rounded-lg p-1.5 transition-colors ${
                  currentState === StoryState.MENU
                    ? "bg-purple-600/20 text-purple-300 ring-1 ring-purple-400/40 shadow-[0_0_10px_rgba(147,51,234,0.4)]"
                    : "text-blue-300 hover:bg-blue-900/50 hover:text-white"
                }`}
              >
                <DynamicIcon name="Settings" className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <StoryTabBar
          currentState={currentState}
          onSelect={(state) => setCurrentState(state as StoryState)}
          tabs={[
            { state: StoryState.STORY, icon: "BookOpen", label: "Story" },
            { state: StoryState.LORE, icon: "Scroll", label: "Notes" },
            { state: StoryState.NPCS, icon: "Users", label: "NPCs" },
            { state: StoryState.QUESTS, icon: "Target", label: "Quests" },
            {
              state: StoryState.ACHIEVEMENTS,
              icon: "Trophy",
              label: "Achievements",
            },
          ]}
        />

        {/* Render current page */}
        <div key={currentState} className="animate-fade-in">
        {currentState === StoryState.STORY && (
          <Story
            storyData={storyData}
            storyText={storyText}
            choices={choices}
            input={input}
            loading={loading}
            loadingStage={loadingStage}
            handleChoice={handleChoice}
            handleSelect={handleSelect}
            onCustomInput={handleCustomInput}
            onActionSubmit={handleActionSubmit}
            onActionConfirm={handleActionConfirm}
            onCommentSubmit={handleCommentSubmit}
            onRerollChoices={handleRerollChoices}
            onRetry={handleRetry}
            canRetry={canRetry}
            onUndo={handleUndo}
            canUndo={canUndo}
            onStop={handleStop}
            onEdit={handleEdit}
            viewingPartIndex={viewingPartIndex}
            onNavigateLeft={handleNavigateLeft}
            onNavigateRight={handleNavigateRight}
            onNavigateToIndex={handleNavigateToIndex}
            onResetToCurrentPart={resetToCurrentPart}
            syncStatus={syncStatus}
            onOpenJournal={() => setCurrentState(StoryState.QUESTS)}
            pendingUserChoice={pendingUserChoice}
            liveGMEntries={liveGMEntries}
          />
        )}
        {currentState === StoryState.CHARACTER_CREATION && (
          <CharacterCreationForm
            storyData={storyData}
            onCharacterCreate={handleCharacterCreate}
          />
        )}
        {currentState === StoryState.LORE && (
          <LorePage
            {...storyData}
            onUpdateLore={(updatedLore) =>
              updateStoryData({ lore: updatedLore })
            }
          />
        )}
        {currentState === StoryState.NPCS && (
          <NPCsPage
            {...storyData}
            onUpdateNPCs={(updatedNPCs) =>
              updateStoryData({ npcs: updatedNPCs })
            }
          />
        )}
        {currentState === StoryState.QUESTS && <QuestsPage {...storyData} />}
        {currentState === StoryState.ACHIEVEMENTS && (
          <AchievementsPage {...storyData} />
        )}
        {currentState === StoryState.MENU && (
          <MenuPage
            {...storyData}
            storyDbId={storyDbId}
            sourceAdventureId={sourceAdventureId}
            onSaveProgress={(updatedStoryData) =>
              saveProgress(updatedStoryData || storyData)
            }
            onUpdateStoryData={updateStoryData}
            onViewLogs={() => setCurrentState(StoryState.LOGS)}
            onViewContext={() => setCurrentState(StoryState.CONTEXT)}
            onOpenAIAssistant={() => setShowAIAssistant(true)}
          />
        )}
        {currentState === StoryState.LOGS && <LogViewer />}
        {currentState === StoryState.CONTEXT && (
          <ContextViewer storyData={storyData} />
        )}
        </div>
      </main>

      {/* AI Story Editor - Rendered at page level to persist across tabs */}
      <StoryCreativeAssistant
        isOpen={showAIAssistant}
        onClose={() => setShowAIAssistant(false)}
        onOpen={() => setShowAIAssistant(true)}
        storyData={storyData}
        storyId={storyDbId || undefined}
        onApplyChanges={(updates) => {
          updateStoryData(updates);
          addNotification("Changes applied! Don't forget to save.", "success");
        }}
        isPinned={isAIPinned}
        onPinToggle={handleAIPinToggle}
      />

      {/*ConfirmDialog*/}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        icon={confirmDialog.icon}
        confirmText={confirmDialog.confirmText}
        confirmButtonClass={confirmDialog.confirmButtonClass}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
      />

      {/* Sync Conflict Modal */}
      {storyData && (
        <SyncConflictModal
          isOpen={syncConflict.isOpen}
          onClose={() => setSyncConflict({ ...syncConflict, isOpen: false })}
          storyName={storyData.story_name}
          localUpdatedAt={new Date()}
          serverUpdatedAt={syncConflict.serverUpdatedAt}
          localPartCount={syncConflict.localPartCount}
          serverPartCount={syncConflict.serverPartCount}
          onKeepLocal={async () => {
            // Keep local version - push to server
            setSyncConflict({ ...syncConflict, isOpen: false });
            setSyncStatus("pending");
            if (storyDbId && storyData) {
              await performSave(storyData);
            }
            addNotification(
              "Local version kept, syncing to cloud...",
              "success",
            );
          }}
          onKeepServer={async () => {
            // Keep server version - update local
            if (syncConflict.serverData && storyDbId) {
              const { saveLocalStory } =
                await import("@/app/misc/localStoryManager");
              await saveLocalStory(storyDbId, syncConflict.serverData, null, {
                serverUpdatedAt: syncConflict.serverUpdatedAt,
                markAsSynced: true,
              });
              setStoryData(syncConflict.serverData);
              // Setup UI from server data
              const lastPart =
                syncConflict.serverData.scene.parts[
                  syncConflict.serverData.scene.parts.length - 1
                ];
              if (lastPart) {
                setStoryText(lastPart.content);
                setChoices({ choices: lastPart.choices || [] });
              }
              setSyncStatus("synced");
              addNotification("Cloud version restored", "success");
            }
            setSyncConflict({ ...syncConflict, isOpen: false });
          }}
        />
      )}

      {/*DiceVisualizer*/}
      {diceRoll && diceRoll.show && (
        <DiceVisualizer
          rolls={diceRoll.rolls}
          finalRoll={diceRoll.finalRoll}
          skillName={diceRoll.skillName}
          skillBonus={diceRoll.skillBonus}
          dc={diceRoll.dc}
          isSuccess={diceRoll.isSuccess}
          isCritical={diceRoll.isCritical}
          hasAdvantage={diceRoll.hasAdvantage}
          hasDisadvantage={diceRoll.hasDisadvantage}
          diceRolls={diceRoll.diceRolls}
          formula={diceRoll.formula}
          resolvedFormula={diceRoll.resolvedFormula}
          reverseDC={diceRoll.reverseDC}
          baseDice={diceRoll.baseDice}
          stressDice={diceRoll.stressDice}
          successes={diceRoll.successes}
          panicTriggered={diceRoll.panicTriggered}
          panicEffect={diceRoll.panicEffect}
          stressLevel={diceRoll.stressLevel}
          stressRelief={diceRoll.stressRelief}
          conditionPenalty={diceRoll.conditionPenalty}
          conditionName={diceRoll.conditionName}
          onComplete={() => setDiceRoll(null)}
        />
      )}

      {/* NPC Reaction Notifications (social media style) */}
      <NPCReactionContainer
        reactions={pendingNPCReactions}
        onDismissReaction={(index) => {
          setPendingNPCReactions((prev) => prev.filter((_, i) => i !== index));
        }}
      />
    </div>
  );
}

export default function StoryPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 dark:border-purple-400"></div>
        </div>
      }
    >
      <StoryPageContent />
    </Suspense>
  );
}
