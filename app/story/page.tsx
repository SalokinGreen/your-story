"use client";

import {
  Scene,
  ScenePart,
  StoryData,
  Choices,
  Choice,
  Resource,
  UPGRADE_COSTS,
  Preset,
  CommandResponse,
} from "../misc/structs";
import {
  getRPGSystem,
  rollDice,
  checkSuccess,
  calculateResourceRequirements,
  getConditionPenalty,
} from "../misc/rpgSystems";
import {
  askFate,
  generateElement,
  type Likelihood,
  type ElementCategory,
} from "../misc/mythic";
import { MODEL_PRESETS } from "../misc/ai_prices";
import Story from "./story";
import StatsPage from "./stats";
import LorePage from "./lore";
import QuestsPage from "./quests";
import MenuPage from "./menu";
import UpgradesPage from "./upgrades";
import LogViewer from "./LogViewer";
import ContextViewer from "./ContextViewer";
import { logger } from "../misc/logger";
import { useState, useEffect, useRef, Suspense } from "react";
import { useNotification } from "../misc/NotificationContext";
import { useAuth } from "../misc/AuthContext";
import { supabase } from "../misc/supabase";
import { useSearchParams, useRouter } from "next/navigation";

// Helper function to get models from preset
function getModelsFromPreset() {
  if (typeof window === "undefined") {
    const preset = MODEL_PRESETS["main"];
    return {
      storyModel: preset.storyModel,
      toolsModel: preset.toolsModel,
      choicesModel: preset.choicesModel,
    };
  }

  const currentPreset = localStorage.getItem("aiPreset") || "main";
  const preset = MODEL_PRESETS[currentPreset];

  // For custom preset, check if user has overridden any models
  if (currentPreset === "custom") {
    return {
      storyModel: localStorage.getItem("aiModelStory") || preset.storyModel,
      toolsModel: localStorage.getItem("aiModelTools") || preset.toolsModel,
      choicesModel:
        localStorage.getItem("aiModelChoices") || preset.choicesModel,
    };
  }

  // For non-custom presets, use the preset's models directly
  return {
    storyModel: preset.storyModel,
    toolsModel: preset.toolsModel,
    choicesModel: preset.choicesModel,
  };
}

import { DEFAULT_PRESET } from "../misc/presets";
import ConfirmDialog from "../components/ConfirmDialog";
import SyncConflictModal from "../components/SyncConflictModal";
import SyncIndicator from "../components/SyncIndicator";
import { authenticatedFetch } from "../misc/getAuthToken";
import {
  encryptStoryData,
  decryptStoryData,
  isEncrypted,
} from "../misc/encryption";
import { getModelConfig } from "../misc/ai_prices";
import { processLoreTriggers } from "../misc/lore";
import { DynamicIcon } from "../components/DynamicIcon";
import { DiceVisualizer } from "../components/DiceVisualizer";
import {
  generateCommandResponses,
  formatResponsesForAI,
} from "../misc/commandResponses";
import {
  findItemMatch,
  findResourceMatch,
  findStatMatch,
  findAchievementMatch,
  findQuestMatch,
  findRelationshipMatch,
  findLoreMatch,
} from "../misc/fuzzyMatch";
import { outputToScenePart } from "../misc/ai";
import { generateStoryTurn, analyzeAction } from "../misc/generation";

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
      0
    );
  } while (randomNumber >= maxValue - (maxValue % range));

  return min + (randomNumber % range);
}

enum StoryState {
  STORY = "STORY",
  STATS = "STATS",
  INVENTORY = "INVENTORY",
  LORE = "LORE",
  QUESTS = "QUESTS",
  ACHIEVEMENTS = "ACHIEVEMENTS",
  UPGRADES = "UPGRADES",
  MENU = "MENU",
  LOGS = "LOGS",
  CONTEXT = "CONTEXT",
}

export function processCommands(
  commands: string[],
  storyData: StoryData,
  addNotification: (
    message: string,
    type: "success" | "failure" | "info" | "warning"
  ) => void
) {
  logger.action("Processing commands", { commands });
  for (const command of commands) {
    const trimmed = command.trim();

    // /add_item: item name | description | type | quantity
    const addItemMatch = trimmed.match(
      /^\/add_item:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(normal|consumable|story|misc)\s*\|\s*(\d+)$/i
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
        (i) => i.name === itemName
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
      /^\/modify_item:\s*(.+?)\s*\|\s*(.+?)(?:\s*\|\s*(.+))?$/i
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
        (a) => a.title.toLowerCase() === achievementTitle.toLowerCase()
      );

      if (existing && !existing.dateAchieved) {
        existing.dateAchieved = new Date();
        storyData.points += existing.points;
        logger.action("Achievement unlocked via command", {
          title: existing.title,
          points: existing.points,
        });
        addNotification(
          `?? Achievement Unlocked: ${existing.title}`,
          "success"
        );
        addNotification(
          `? Earned ${existing.points} points! Total: ${storyData.points}`,
          "success"
        );
      } else if (!existing) {
        logger.warn("Achievement not found - exact match required", {
          achievement: achievementTitle,
          availableAchievements: storyData.achievements.map((a) => a.title),
        });
        addNotification(
          `?? Achievement not found: ${achievementTitle}`,
          "warning"
        );
      }
      continue;
    }

    // /modify_momentum: amount
    const momentumMatch = trimmed.match(/^\/modify_momentum:\s*([+-]?\d+)$/i);
    if (momentumMatch) {
      const amount = parseInt(momentumMatch[1], 10);
      const oldValue = storyData.momentum;
      storyData.momentum = Math.max(
        0,
        Math.min(storyData.maxMomentum, storyData.momentum + amount)
      );
      logger.action("Momentum modified via command", {
        amount,
        oldValue,
        newValue: storyData.momentum,
      });
      continue;
    }

    // /mark_beat: beat index
    const markBeatMatch = trimmed.match(/^\/mark_beat:\s*(\d+)$/i);
    if (markBeatMatch) {
      const beatIndex = parseInt(markBeatMatch[1], 10) - 1;
      if (beatIndex >= 0 && beatIndex < storyData.plot_beats.length) {
        storyData.plot_beats[beatIndex].fulfilled = true;
        logger.action("Story beat completed via command", {
          beatIndex: beatIndex + 1,
          title: storyData.plot_beats[beatIndex].title,
        });
        addNotification(`? Story beat ${beatIndex + 1} completed`, "success");

        // Award points for completing a new beat (use custom points if set, otherwise default)
        if (!storyData.earnedPointsFromBeats.includes(beatIndex)) {
          storyData.earnedPointsFromBeats.push(beatIndex);
          const pointsAwarded =
            storyData.plot_beats[beatIndex].points ?? UPGRADE_COSTS.BEAT_REWARD;
          storyData.points += pointsAwarded;
          logger.action("Points awarded for beat", {
            points: pointsAwarded,
            totalPoints: storyData.points,
          });
          addNotification(
            `?? Earned ${pointsAwarded} points! Total: ${storyData.points}`,
            "success"
          );
        }
      }
      continue;
    }

    // /create_quest: title | short description | full description | points
    const createQuestMatch = trimmed.match(
      /^\/create_quest:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(\d+)$/i
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
      addNotification(`? New quest: ${title}`, "success");
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
        addNotification(`?? Quest not found: ${questTitle}`, "warning");
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
        logger.action("Quest completed via command", { title: quest.title });

        // Award points if not already awarded
        if (!storyData.earnedPointsFromQuests.includes(quest.id)) {
          storyData.earnedPointsFromQuests.push(quest.id);
          storyData.points += quest.points;
          logger.action("Points awarded for quest", {
            points: quest.points,
            totalPoints: storyData.points,
          });
          addNotification(`? Quest completed: ${quest.title}`, "success");
          addNotification(
            `? Earned ${quest.points} points! Total: ${storyData.points}`,
            "success"
          );
        } else {
          addNotification(`? Quest completed: ${quest.title}`, "success");
        }
      } else if (!quest) {
        logger.warn("Quest not found or no fuzzy match", {
          quest: questTitle,
        });
        addNotification(`?? Quest not found: ${questTitle}`, "warning");
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
        addNotification(`?? Quest not found: ${questTitle}`, "warning");
      }
      continue;
    }

    // /create_lore: title | content | on_triggers | off_triggers
    const createLoreMatch = trimmed.match(
      /^\/create_lore:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.*?)\s*\|\s*(.*)$/i
    );
    if (createLoreMatch) {
      const loreTitle = createLoreMatch[1].trim();
      const loreContent = createLoreMatch[2].trim();
      const onTriggers = createLoreMatch[3].trim();
      const offTriggers = createLoreMatch[4].trim();

      if (!storyData.lore) storyData.lore = [];

      // Check if lore entry already exists
      const existingLore = storyData.lore.find((l) => l.title === loreTitle);
      if (existingLore) {
        logger.warn("Lore already exists", { loreTitle });
        addNotification(`?? Lore "${loreTitle}" already exists`, "warning");
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
          title: loreTitle,
          content: loreContent,
          relatedCharacters: [],
          relatedLocations: [],
          secrtet: false,
          keys: [],
          on_triggers: onTriggerArray,
          off_triggers: offTriggerArray,
          on: onTriggerArray.length === 0, // If no triggers, show from start
        });
        logger.action("New lore created via command", { title: loreTitle });
      }
      continue;
    }

    // /lore_replace_content: lore title | old text | new text
    const loreReplaceMatch = trimmed.match(
      /^\/lore_replace_content:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+)$/i
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
      /^\/lore_add_content:\s*(.+?)\s*\|\s*(.+)$/i
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
      /^\/lore_delete_content:\s*(.+?)\s*\|\s*(.+)$/i
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
        (l) => l.title.toLowerCase() === loreTitle.toLowerCase()
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
      /^\/lore_update:\s*(.+?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*)$/i
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
        (l) => l.title.toLowerCase() === loreTitle.toLowerCase()
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
      /^\/remove_item:\s*(.+?)\s*\|\s*(\d+)$/i
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
            (i) => i.name !== item.name
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
      /^\/modify_item_quantity:\s*(.+?)\s*\|\s*(-?\d+)$/i
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
            (i) => i.name !== item.name
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
      /^\/transform_item:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(normal|consumable|story|misc)$/i
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
          (i) => i.name !== oldItem.name
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
      /^\/add_resource:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(\d+)\s*\|\s*(\d+)$/i
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
      /^\/modify_resource:\s*(.+?)\s*\|\s*(-?\d+)\s*\|\s*(-?\d+)$/i
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
          Math.min(resource.maxValue, resource.value + currentDelta)
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
          (r) => r.name !== resource.name
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
      /^\/add_stat:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(\d+)$/i
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
      /^\/modify_stat:\s*(.+?)\s*\|\s*(-?\d+)$/i
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
      /^\/update_quest_description:\s*(.+?)\s*\|\s*(.+)$/i
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
        addNotification(`?? Quest "${questTitle}" not found`, "warning");
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
      /^\/update_quest_short_description:\s*(.+?)\s*\|\s*(.+)$/i
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
        addNotification(`?? Quest "${questTitle}" not found`, "warning");
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
      /^\/add_relationship:\s*(.+?)\s*\|\s*(-?\d+)\s*\|\s*(.+)$/i
    );
    if (addRelationshipMatch) {
      const name = addRelationshipMatch[1].trim();
      const value = parseInt(addRelationshipMatch[2], 10);
      const description = addRelationshipMatch[3].trim();

      if (!storyData.relationships) storyData.relationships = [];

      // Validate name is not empty
      if (!name) {
        addNotification(`?? Relationship name cannot be empty`, "warning");
        logger.warn("Relationship add failed: empty name");
        continue;
      }

      // Check for duplicates
      const existing = storyData.relationships.find(
        (r) => r.name.toLowerCase() === name.toLowerCase()
      );

      if (existing) {
        logger.warn("Relationship add failed: already exists", { name });
        addNotification(`?? Relationship "${name}" already exists`, "warning");
      } else if (value < -100 || value > 100) {
        addNotification(
          `?? Relationship value must be between -100 and 100`,
          "warning"
        );
        logger.warn("Relationship add failed: invalid value", {
          name,
          value,
        });
      } else {
        // Determine symbol based on relationship value
        let symbol = "??"; // Default neutral
        if (value >= 75) symbol = "??"; // Strong ally
        else if (value >= 50) symbol = "??"; // Ally
        else if (value >= 25) symbol = "??"; // Friend
        else if (value >= 0) symbol = "??"; // Neutral/Acquaintance
        else if (value >= -25) symbol = "??"; // Slight tension
        else if (value >= -50) symbol = "??"; // Unfriendly
        else if (value >= -75) symbol = "??"; // Enemy
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
      /^\/modify_relationship:\s*(.+?)\s*\|\s*(-?\d+)$/i
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
        addNotification(`?? Relationship not found: ${name}`, "warning");
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
      /^\/remove_relationship:\s*(.+)$/i
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
        addNotification(`?? Relationship not found: ${name}`, "warning");
      } else {
        storyData.relationships = storyData.relationships.filter(
          (r) => r !== relationship
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
      /^\/update_relationship_description:\s*(.+?)\s*\|\s*(.+)$/i
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
        addNotification(`?? Relationship not found: ${name}`, "warning");
      } else {
        relationship.description = newDescription;
        logger.action("Relationship description updated via command", {
          name: relationship.name,
          newDescription,
        });
      }
      continue;
    }

    // /edit_beat_title: new title (index)
    const editBeatTitleMatch = trimmed.match(
      /^\/edit_beat_title:\s*(.+?)\((\d+)\)$/i
    );
    if (editBeatTitleMatch) {
      const newTitle = editBeatTitleMatch[1].trim();
      const beatIndex = parseInt(editBeatTitleMatch[2], 10);
      if (beatIndex >= 0 && beatIndex < storyData.plot_beats.length) {
        storyData.plot_beats[beatIndex].title = newTitle;
        logger.action("Beat title updated via command", {
          beatIndex,
          newTitle,
        });
      }
      continue;
    }

    ///edit_beat_content:new content(index)
    const editBeatContentMatch = trimmed.match(
      /^\/edit_beat_content:\s*(.+?)\((\d+)\)$/i
    );
    if (editBeatContentMatch) {
      const newContent = editBeatContentMatch[1].trim();
      const beatIndex = parseInt(editBeatContentMatch[2], 10);
      if (beatIndex >= 0 && beatIndex < storyData.plot_beats.length) {
        storyData.plot_beats[beatIndex].content = newContent;
        logger.action("Beat content updated via command", {
          beatIndex,
          newContent,
        });
      }
      continue;
    }

    ///add_beat:title|content
    const addBeatMatch = trimmed.match(/^\/add_beat:\s*(.+?)\|(.+)$/i);
    if (addBeatMatch) {
      const title = addBeatMatch[1].trim();
      const content = addBeatMatch[2].trim();
      storyData.plot_beats.push({
        title: title,
        content: content,
        fulfilled: false,
      });
      logger.action("Beat added via command", { title, content });
      continue;
    }

    ///remove_beat:beatindex
    const removeBeatMatch = trimmed.match(/^\/remove_beat:\s*(\d+)$/i);
    if (removeBeatMatch) {
      const beatIndex = parseInt(removeBeatMatch[1], 10);
      if (beatIndex >= 0 && beatIndex < storyData.plot_beats.length) {
        const removed = storyData.plot_beats.splice(beatIndex, 1)[0];
        logger.action("Beat removed via command", { beatIndex, removed });
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
  const { user, getEncryptionPassword } = useAuth();
  const [currentState, setCurrentState] = useState<StoryState>(
    StoryState.STORY
  );
  const [storyData, setStoryData] = useState<StoryData | null>(null);
  const [storyDbId, setStoryDbId] = useState<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const [choices, setChoices] = useState<Choices>({ choices: [] });
  const [input, setInput] = useState<Record<string, boolean>>({});
  const [storyText, setStoryText] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<
    "story" | "tools" | "choices" | null
  >(null);
  const [momentumMode, setMomentumMode] = useState<
    "none" | "reroll" | "guarantee"
  >("none");
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
    rpgSystem?:
      | "3d6"
      | "1d20"
      | "1d100"
      | "percentile"
      | "pbta"
      | "fate"
      | "yze"
      | "explosive"
      | "narrative"; // RPG system type
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
    conditionName?: string; // Name of condition that caused auto-fail
  } | null>(null);

  // YZE: Stress dice selection state
  const [yzeStressDiceChoice, setYzeStressDiceChoice] = useState<number>(0);
  const [yzeAwaitingStressChoice, setYzeAwaitingStressChoice] =
    useState<boolean>(false);
  const [yzePendingChoice, setYzePendingChoice] = useState<Choice | null>(null);

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

  // Helper to process multiple scene parts from API
  function processSceneParts(
    parts: any[],
    storyData: StoryData,
    addNotification: (
      message: string,
      type: "success" | "failure" | "info" | "warning"
    ) => void
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
              cmd !== undefined && cmd !== null
          );

        if (commands.length > 0) {
          // Import executeCommandWithResponse from commandResponses
          const {
            executeCommandWithResponse,
          } = require("@/app/misc/commandResponses");

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
            (tc: any) => tc?.function?.name === "add_memory"
          );
          if (memoryToolCalls.length > 0) {
            const existingMemoryLower = storyData.memory.map((m) =>
              m.toLowerCase().trim()
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
                storyData.memory.push(entry);
                existingMemoryLower.push(entry.toLowerCase().trim());
                addNotification(
                  `?? Memory added: ${entry.substring(0, 80)}${
                    entry.length > 80 ? "..." : ""
                  }`,
                  "success"
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
          m.toLowerCase().trim()
        );
        const newMemories = part.memoryEntries.filter(
          (entry: string) =>
            !existingMemoryLower.includes(entry.toLowerCase().trim())
        );
        if (newMemories.length > 0) {
          logger.action("New memory entries added", {
            count: newMemories.length,
            entries: newMemories,
          });
          storyData.memory.push(...newMemories);
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
      (part) => !part.user && part.content.trim().length > 0
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
      (part) => !part.user && part.content.trim().length > 0
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

    //Wait for user to be loaded before attempting to load story
    if (!user) {
      return;
    }

    // Helper to setup UI state from loaded story data
    function setupUIFromStory(loadedStoryData: StoryData) {
      // Migrate Mythic state to include new performance tracking fields
      if (loadedStoryData.mythicState) {
        import("@/app/misc/mythicChaos").then(({ migrateMythicState }) => {
          loadedStoryData.mythicState = migrateMythicState(
            loadedStoryData.mythicState!
          );
        });
      }

      //Initializequestarraysiftheydon'texist(forbackwardscompatibility)
      if (!loadedStoryData.quests) loadedStoryData.quests = [];
      if (!loadedStoryData.earnedPointsFromQuests)
        loadedStoryData.earnedPointsFromQuests = [];

      //ProcessLoretriggersonloadtoinitializeLorevisibility
      processLoreTriggers(loadedStoryData, addNotification, true);

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
          {} as Record<string, boolean>
        ) || {};
      setInput(inputs);
      setStarted(true);
      return false;
    }

    async function loadStory() {
      try {
        //Checkifthisisalocalstory (local-only, no sync needed)
        if (storyId?.startsWith("local_")) {
          const { getLocalStory } = await import(
            "@/app/misc/localStoryManager"
          );
          const localStory = await getLocalStory(storyId);

          if (!localStory) {
            throw new Error("Local story not found");
          }

          console.log("Local story loaded:", localStory);
          setStoryDbId(localStory.id);
          setSyncStatus("local-only");

          if (setupUIFromStory(localStory.storyData)) return;
          setLoadingStory(false);
          return;
        }

        // ONLINE STORY - Try offline cache first for instant loading
        const { getLocalStory, saveLocalStory, determineSyncAction } =
          await import("@/app/misc/localStoryManager");

        // storyId is guaranteed non-null at this point (checked at function start)
        const localStory = await getLocalStory(storyId!);
        let usedLocalCache = false;

        // If we have a local cache, show it immediately
        if (localStory && localStory.storyData) {
          console.log("Loading from offline cache for instant display...");
          setStoryDbId(storyId!);
          setSyncStatus(localStory.syncStatus || "synced");
          if (setupUIFromStory(localStory.storyData)) {
            setLoadingStory(false);
            return;
          }
          usedLocalCache = true;
          setLoadingStory(false);
        }

        // Fetch from server in background (or foreground if no cache)
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const headers: HeadersInit = {
          "Content-Type": "application/json",
        };

        if (session?.access_token) {
          headers["Authorization"] = `Bearer ${session.access_token}`;
        }

        const response = await fetch(`/api/stories/${storyId}`, { headers });
        console.log("Story fetch response status:", response.status);

        if (!response.ok) {
          if (usedLocalCache) {
            // We already showed local cache, just warn about sync
            console.warn("Server fetch failed, using offline cache");
            setSyncStatus("pending");
            return;
          }
          const errorData = await response
            .json()
            .catch(() => ({ error: "Unknown error" }));
          console.error("Story fetch failed:", errorData);
          throw new Error(errorData.error || "Failed to load story");
        }

        const { story } = await response.json();
        console.log("Story loaded from server:", story);
        setStoryDbId(story.id);

        //Checkifstorydataisencrypted
        let serverStoryData: StoryData;
        if (isEncrypted(story.storyData)) {
          console.log("Story is encrypted, attempting decryption...");

          //Getusercredentialsfordecryption
          const password = getEncryptionPassword();
          const email = user?.email;

          if (!password || !email) {
            throw new Error(
              "Cannot decrypt story: credentials not available. Please sign out and sign back in."
            );
          }

          try {
            //Decryptthestorydata
            serverStoryData = await decryptStoryData(
              story.storyData,
              email,
              password
            );
            console.log("Story decrypted successfully");
          } catch (decryptError) {
            console.error("Decryption failed:", decryptError);
            throw new Error(
              "Failed to decrypt story. Your credentials may have changed."
            );
          }
        } else {
          //Storyisnotencrypted,useas-is
          serverStoryData = story.storyData;
        }

        // Determine sync action
        const syncAction = determineSyncAction(localStory, story.updated_at);
        console.log("Sync action determined:", syncAction, {
          localUpdatedAt: localStory?.updatedAt,
          serverUpdatedAt: story.updated_at,
        });

        if (syncAction === "none" || syncAction === "download") {
          // Server is same or newer - use server data
          if (usedLocalCache && syncAction === "download") {
            console.log("Server has newer data, updating...");
          }

          // Save to local cache (mark as synced)
          await saveLocalStory(storyId!, serverStoryData, null, {
            serverUpdatedAt: story.updated_at,
            markAsSynced: true,
          });

          setSyncStatus("synced");
          if (!usedLocalCache || syncAction === "download") {
            setupUIFromStory(serverStoryData);
          }
        } else if (syncAction === "upload") {
          // Local is newer and was edited on this device - auto-sync to server
          console.log(
            "Local changes detected from this device, syncing to server..."
          );
          setSyncStatus("pending");

          // We'll upload in the background - keep using local data
          if (!usedLocalCache && localStory) {
            setupUIFromStory(localStory.storyData);
          }

          // Trigger upload (will be handled by save mechanism)
          // For now just mark as pending - the next save will push it
        } else if (syncAction === "conflict") {
          // Conflict - show modal
          console.log("Sync conflict detected!");
          setSyncStatus("conflict");

          setSyncConflict({
            isOpen: true,
            serverData: serverStoryData,
            serverUpdatedAt: story.updated_at,
            localPartCount: localStory?.storyData.scene.parts.length || 0,
            serverPartCount: serverStoryData.scene.parts.length,
          });

          // Keep using local data until user decides
          if (!usedLocalCache && localStory) {
            setupUIFromStory(localStory.storyData);
          }
        }

        setLoadingStory(false);
      } catch (error: any) {
        console.error("Error loading story:", error);
        addNotification(error.message || "Failed to load story", "failure");
        setLoadingStory(false);
      }
    }

    loadStory();
  }, [storyId, addNotification, user, getEncryptionPassword]);

  //Applypresetandstartstory
  const handlePresetSelect = async (preset: Preset) => {
    if (!storyData) return;
    logger.action("User selected preset", { preset: preset.name });

    // If custom preset, route to character creation page
    if (preset.id === "custom") {
      router.push(`/story/create-character?storyId=${storyDbId}`);
      return;
    }

    const updatedStoryData = { ...storyData };

    //Applypresettostorydata
    if (preset.playerName) updatedStoryData.player_name = preset.playerName;
    if (preset.playerSummary)
      updatedStoryData.player_summary = preset.playerSummary;
    if (preset.stats.length > 0)
      updatedStoryData.stats = JSON.parse(JSON.stringify(preset.stats));
    if (preset.resources.length > 0)
      updatedStoryData.resources = JSON.parse(JSON.stringify(preset.resources));
    if (preset.inventory.length > 0)
      updatedStoryData.inventory = JSON.parse(JSON.stringify(preset.inventory));
    if (preset.authorNotes) updatedStoryData.author_notes = preset.authorNotes;

    // Determine starting choices - use custom ones if available, otherwise default
    const startingChoices = updatedStoryData.starting_choices?.length
      ? updatedStoryData.starting_choices.map((sc) => ({
          text: sc.text,
          item_used: sc.item_used,
          item_loss: sc.item_loss,
          skill_used: sc.skill_used,
          skill_dc: sc.skill_dc,
          resource_used: sc.resource_used,
          mythic_check: sc.mythic_check,
          mythic_context_only: sc.mythic_context_only,
          mythic_table: sc.mythic_table,
          custom_table: sc.custom_table,
        }))
      : [{ text: "Start Story" }];

    // Use intro override from first starting choice if available
    const introContent =
      updatedStoryData.starting_choices?.length &&
      updatedStoryData.starting_choices[0].intro_override
        ? updatedStoryData.starting_choices[0].intro_override
        : updatedStoryData.intro;

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
        if (storyDbId.startsWith("local_")) {
          const { saveLocalStory } = await import(
            "@/app/misc/localStoryManager"
          );
          updatedStoryData.selected_preset = preset.id;
          await saveLocalStory(storyDbId, updatedStoryData);
        } else {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          const headers: HeadersInit = {
            "Content-Type": "application/json",
          };
          if (session?.access_token) {
            headers["Authorization"] = `Bearer ${session.access_token}`;
          }

          const response = await fetch(`/api/stories/${storyDbId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              storyData: updatedStoryData,
              selectedPreset: preset.id,
            }),
          });

          if (!response.ok) {
            console.error("Failed to save preset selection");
          } else {
            // Also save to local cache for offline-first loading
            const { saveLocalStory } = await import(
              "@/app/misc/localStoryManager"
            );
            const result = await response.json().catch(() => null);
            await saveLocalStory(storyDbId, updatedStoryData, null, {
              serverUpdatedAt:
                result?.story?.updated_at || new Date().toISOString(),
              markAsSynced: true,
              isLocalEdit: true,
            });
          }
        }
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

    addNotification(`Character preset "${preset.name}" applied! ?`, "success");
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

  //Actualsa velogicisolated
  async function performSave(updatedStoryData: StoryData) {
    if (!storyDbId) return;

    try {
      logger.info("Saving story progress...");
      //Handlelocalstorysaving
      if (storyDbId.startsWith("local_")) {
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
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      //Checkforencryptioncredentials
      const password = getEncryptionPassword();
      const email = user?.email;

      if (!password || !email) {
        //No credentials available - require user to re-login for security
        console.error(
          "Cannot save story: encryption credentials not available"
        );
        addNotification(
          "?? Please sign out and sign back in to enable encrypted story saving",
          "warning"
        );
        return; //Abortsavetopreventunencrypteddatastorage
      }

      //Trimscenehistorybeforesavingtoreducedatasize
      const trimmedData = trimStoryData(updatedStoryData);

      //Encryptthestorydatabeforesaving
      let dataToSave: any;
      try {
        dataToSave = await encryptStoryData(trimmedData, email, password);
        console.log("Story data encrypted for saving");
      } catch (encryptError) {
        console.error("Encryption failed:", encryptError);
        addNotification(
          "? Failed to encrypt story data. Please sign out and sign back in.",
          "failure"
        );
        return; //Abortsaveonencryptionfailure
      }

      // Save to server
      const response = await fetch(`/api/stories/${storyDbId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          storyData: dataToSave,
        }),
      });

      // Also save to local cache for offline access
      if (response.ok) {
        const { saveLocalStory } = await import("@/app/misc/localStoryManager");
        const result = await response.json().catch(() => null);
        await saveLocalStory(storyDbId, trimmedData, null, {
          serverUpdatedAt:
            result?.story?.updated_at || new Date().toISOString(),
          markAsSynced: true,
          isLocalEdit: true,
        });
        setSyncStatus("synced");
        console.log("Story saved to server and local cache");
      } else {
        // Server save failed - save locally as pending
        const { saveLocalStory } = await import("@/app/misc/localStoryManager");
        await saveLocalStory(storyDbId, trimmedData, null, {
          isLocalEdit: true,
        });
        setSyncStatus("pending");
        console.warn("Server save failed, saved to local cache as pending");
      }
    } catch (error) {
      console.error("Error saving progress:", error);
      addNotification(
        "Failed to save story progress. Please try again.",
        "failure"
      );
    }
  }

  //Updatestorydatainstate
  function updateStoryData(updates: Partial<StoryData>) {
    if (!storyData) return;

    //Getcurrentmodelconfigfordynamicmemorycap
    const modelKey =
      typeof window !== "undefined"
        ? localStorage.getItem("aiModel") || "Deepseek Chat"
        : "Deepseek Chat";
    const modelConfig = getModelConfig(modelKey);

    // Dynamic memory cap: Reserve maxOutputTokens, then use 25% of remaining for memory
    const CHARS_PER_TOKEN = 4;
    const availableInputTokens =
      modelConfig.maxTokens - modelConfig.maxOutputTokens;
    const memory_cap = availableInputTokens * 0.25 * CHARS_PER_TOKEN;

    //Removeduplicateentriesfrommemory
    let addedItems = new Set<string>();
    const new_memory = storyData.memory.filter((item, index) => {
      if (addedItems.has(item)) {
        return false;
      } else {
        addedItems.add(item);
        return true;
      }
    });
    storyData.memory = new_memory;
    //Trimmemoryiftoolarge
    let totalMemoryLength = storyData.memory.reduce(
      (acc, entry) => acc + entry.length,
      0
    );
    while (totalMemoryLength > memory_cap && storyData.memory.length > 0) {
      const removed = storyData.memory.shift();
      if (removed) {
        totalMemoryLength -= removed.length;
      }
    }
    const updatedStory = { ...storyData, ...updates };
    setStoryData(updatedStory);
  }

  async function handleCustomInput(customText: string) {
    if (!storyData) return;
    logger.action("User custom input", { customText });
    if (!user) {
      addNotification("Please sign in to continue the story", "warning");
      return;
    }

    setLoading(true);
    setLoadingStage("story");

    //Adduser'scustominputtoscene
    storyData.scene.parts.push({
      content: ">" + customText,
      imageUrl: "",
      user: true,
      role: "user",
      choices: [],
    });

    //ProcessLoretriggersafteruserinput
    processLoreTriggers(storyData, addNotification);

    const { storyModel, toolsModel, choicesModel } = getModelsFromPreset();
    const toolCallingEnabled =
      typeof window !== "undefined"
        ? localStorage.getItem("toolCallingEnabled") !== "false"
        : true;

    logger.ai_request("Starting generation (custom input)", {
      storyModel,
      toolsModel,
      choicesModel,
      toolCallingEnabled,
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
          ? parseInt(localStorage.getItem("maxToolLoops") || "1", 10)
          : 1;

      // Track parallel completion of tools and choices
      let toolsComplete = !toolCallingEnabled; // If tools disabled, mark as complete
      let choicesComplete = false;

      const checkBothComplete = () => {
        if (toolsComplete && choicesComplete) {
          setLoadingStage(null);
        }
      };

      await generateStoryTurn(
        storyData,
        "", // Custom input already in storyData.scene.parts
        {
          storyModel,
          toolsModel,
          choicesModel,
          enableTools: toolCallingEnabled,
          maxToolLoops,
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
            setStoryData({ ...storyData });
            setLoading(false); // Let player read while tools/choices generate
          },
          onStoryComplete: (content: string, usage: any) => {
            setLoadingStage("tools");
            logger.ai_response("Story narration complete (custom input)", {
              length: content.length,
              usage,
            });
          },
          onToolsStart: () => {
            // Keep showing tools stage while either is running
          },
          onToolsComplete: (toolCalls, toolResponses, usage) => {
            // Update the last part with tool data
            const lastPartIndex = storyData.scene.parts.length - 1;
            if (lastPartIndex >= 0) {
              storyData.scene.parts[lastPartIndex] = {
                ...storyData.scene.parts[lastPartIndex],
                toolCalls,
                toolResponses,
              };
            }

            // Store tool responses for AI feedback in next turn
            setPendingCommandResponses(toolResponses);

            setStoryData({ ...storyData });
            toolsComplete = true;
            checkBothComplete();

            logger.ai_response("Tools complete (custom input)", {
              toolCallsCount: toolCalls.length,
              responsesCount: toolResponses.length,
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
                `? Used ${result.meta.totalTokenCost} tokens`,
                "success"
              );
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
              "choices"
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
        pendingCommandResponses.length > 0 ? pendingCommandResponses : undefined
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

  // Handle freeform action submission - analyze the action and return metadata
  async function handleActionSubmit(
    actionText: string
  ): Promise<{ analysis: any; warnings: string[] } | null> {
    if (!storyData) return null;
    if (!user) {
      addNotification("Please sign in to continue the story", "warning");
      return null;
    }

    logger.action("Analyzing freeform action", { actionText });

    try {
      const { choicesModel } = getModelsFromPreset();
      const result = await analyzeAction(storyData, actionText, choicesModel);

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
  async function handleActionConfirm(choice: Choice) {
    if (!storyData) return;

    logger.action("Freeform action confirmed", { choice });

    if (!user) {
      addNotification("Please sign in to continue the story", "warning");
      return;
    }

    // Directly call handleChoice with the action choice
    // We pass the choice directly to avoid state timing issues
    handleChoiceWithAction(choice);
  }

  // Public handleChoice function - wrapper for normal choice selection
  async function handleChoice() {
    handleChoiceWithAction();
  }

  // Internal function that handles both regular choices and freeform actions
  async function handleChoiceWithAction(actionChoice?: Choice) {
    if (!storyData) return;

    // If we're resuming from YZE stress dice selection, use the pending choice
    let choice: Choice | undefined;
    if (actionChoice) {
      // Direct action from freeform mode
      choice = actionChoice;
    } else if (yzePendingChoice && yzeAwaitingStressChoice) {
      choice = yzePendingChoice;
    } else {
      choice = choices.choices.find((c) => input[c.text]);
    }

    if (!choice) return;
    const key = actionChoice ? 0 : choices.choices.indexOf(choice);

    logger.action("User selected choice", { choice: choice.text, index: key });

    if (!user) {
      addNotification("Please sign in to continue the story", "warning");
      return;
    }

    // Get RPG system configuration
    const rpgSystem = getRPGSystem(storyData.rpgSystem || "3d6");

    // YZE: If this choice has a skill check, show stress dice selection UI first
    if (
      rpgSystem.id === "yze" &&
      choice.skill_used &&
      !yzeAwaitingStressChoice &&
      true
    ) {
      setYzePendingChoice(choice);
      setYzeAwaitingStressChoice(true);
      setYzeStressDiceChoice(0); // Default to 0 stress dice
      return; // Wait for player to choose stress dice
    }

    setLoading(true);
    setLoadingStage("story");

    //Handlemomentumspending
    if (momentumMode === "reroll" && storyData.momentum >= 1) {
      storyData.momentum--;
      logger.action("Momentum spent", {
        mode: "reroll",
        cost: 1,
        remaining: storyData.momentum,
      });
      addNotification(
        `? Spent 1 Momentum for Reroll! (${storyData.momentum}/${storyData.maxMomentum} remaining)`,
        "info"
      );
    } else if (momentumMode === "guarantee" && storyData.momentum >= 2) {
      storyData.momentum -= 2;
      logger.action("Momentum spent", {
        mode: "guarantee",
        cost: 2,
        remaining: storyData.momentum,
      });
      addNotification(
        `? Spent 2 Momentum for Guaranteed Success! (${storyData.momentum}/${storyData.maxMomentum} remaining)`,
        "success"
      );
    }

    // Get RPG system configuration (already fetched above, remove duplicate)

    // For YZE and Explosive: Need stat value before rolling, so defer the initial roll
    let dice_roll = 0;
    let diceResult: { rolls: number[]; total: number; explosions?: number } = {
      rolls: [],
      total: 0,
    };
    let explosionCount = 0; // Track explosions for explosive system

    if (rpgSystem.id !== "yze" && rpgSystem.id !== "explosive") {
      // Roll dice according to system (non-YZE, non-Explosive systems roll once globally)
      diceResult = rollDice(rpgSystem);
      dice_roll = diceResult.total;
      logger.action("Initial dice roll", {
        system: rpgSystem.id,
        rolls: diceResult.rolls,
        total: dice_roll,
      });
    }

    //Track all dice rolls for visualization
    const allDiceRolls: number[] = [dice_roll];
    const allDiceDetails: number[][] = [diceResult.rolls]; // Track individual dice per roll
    let insufficientResourceDisadvantage = false; // Track if disadvantage from low resources

    // Track advantage/disadvantage sources for stacking
    let advantageCount = 0;
    let disadvantageCount = 0;
    const advantageSources: string[] = [];
    const disadvantageSources: string[] = [];

    //BuilddetailedRPG-stylechoicetextwithbrackets
    let choiceDetails: string[] = [];

    // Process Mythic GME checks first (less important, shown at top)
    const mythicDetails: string[] = [];
    if (choice.mythic_check) {
      try {
        // Parse format: "question (likelihood)" or just "question"
        const match = choice.mythic_check.match(
          /^(.+?)(?:\s*\(\s*([^)]+)\s*\))?$/
        );
        if (match) {
          const question = match[1].trim();
          let likelihood = (match[2]?.trim() || "50/50") as Likelihood;

          // Validate and normalize likelihood
          const validLikelihoods: Likelihood[] = [
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
          if (!validLikelihoods.includes(likelihood)) {
            console.warn(
              `Invalid Mythic likelihood "${likelihood}", defaulting to 50/50`
            );
            likelihood = "50/50";
          }

          const chaosFactor = storyData.mythicState?.chaosFactor || 5;

          const result = askFate(likelihood, chaosFactor);

          let mythicLine = `[Mythic Question: ${question}]`;
          let answerLine = `[Mythic Answer: ${result.answer}`;
          if (result.randomEvent) {
            answerLine += " - RANDOM EVENT TRIGGERED!";
          }
          answerLine += `]`;

          mythicDetails.push(mythicLine);
          mythicDetails.push(answerLine);

          // Add context flag if skill check exists or mythic_context_only is set
          if (choice.skill_used || choice.mythic_context_only) {
            mythicDetails.push(
              `[Note: Mythic is context only - skill check determines success/failure]`
            );
          }

          logger.action("Mythic fate check from choice", {
            question,
            likelihood,
            answer: result.answer,
            roll: result.roll,
            randomEvent: result.randomEvent,
            contextOnly: !!(choice.skill_used || choice.mythic_context_only),
          });
        }
      } catch (error) {
        console.error("Error processing mythic_check:", error);
      }
    }

    if (choice.mythic_table) {
      try {
        const result = generateElement(choice.mythic_table as ElementCategory);
        const tableName = choice.mythic_table
          .replace(/_/g, " ")
          .replace(/\b\w/g, (l) => l.toUpperCase());
        mythicDetails.push(`[Mythic ${tableName} Table: ${result.element}]`);

        logger.action("Mythic table roll from choice", {
          table: choice.mythic_table,
          result: result.element,
        });
      } catch (error) {
        console.error("Error processing mythic_table:", error);
      }
    }

    // Process custom tables (also less important context)
    if (choice.custom_table) {
      try {
        const table = storyData.customTables?.find(
          (t) => t.name === choice.custom_table
        );
        if (table) {
          const totalWeight = table.entries.reduce(
            (sum, e) => sum + e.weight,
            0
          );
          const roll = Math.random() * totalWeight;
          let cumulative = 0;
          let result: { text: string; weight: number } | undefined;
          for (const entry of table.entries) {
            cumulative += entry.weight;
            if (roll <= cumulative) {
              result = entry;
              break;
            }
          }
          if (result) {
            mythicDetails.push(`[${table.name}: ${result.text}]`);
            logger.action("Custom table roll from choice", {
              table: table.name,
              result: result.text,
              weight: result.weight,
            });
          }
        }
      } catch (error) {
        console.error("Error processing custom_table:", error);
      }
    }

    //Trackstatechangesfordisplay
    let itemQuantityBefore = 0;
    let itemQuantityAfter = 0;
    let itemBroken = false;
    let resourceUsedBefore = 0;
    let resourceUsedAfter = 0;
    let insufficientResource = false;
    let skillCheckResult = "";

    // YZE: Panic data for user message
    // Explosive: Explosion data for user message
    let yzeData: {
      baseDice?: number[];
      stressDice?: number[];
      successes?: number;
      panicTriggered?: boolean;
      panicEffect?: string;
      stressLevel?: number;
      stressRelief?: boolean;
      explosions?: number; // For explosive system
      dieSize?: number; // For explosive system
    } = {};

    // Track roll outcome for AI context
    let rollTotal = 0; // Final total (roll + modifier)
    let rollDC = 0; // DC used for check

    //Processitemusage
    if (choice.item_used) {
      // Try fuzzy matching first
      const matchResult = findItemMatch(choice.item_used, storyData.inventory);
      const item = matchResult?.item;
      const item_exists = item !== undefined;

      // Log fuzzy match result
      if (matchResult && !matchResult.isExact) {
        logger.info("Fuzzy matched item", {
          aiProvided: choice.item_used,
          matched: matchResult.name,
          score: matchResult.score,
        });
        addNotification(
          `?? Matched "${choice.item_used}" ? "${
            matchResult.name
          }" (${Math.round(matchResult.score * 100)}% match)`,
          "info"
        );
        // Update choice to use the exact matched name
        choice.item_used = matchResult.name;
      }

      if (item_exists && item) {
        itemQuantityBefore = item.quantity;
        const itemType = item.type || "normal";

        //Handle advantage based on item type
        if (itemType === "misc") {
          //Misc items don't give advantage, but prevent disadvantage
          addNotification(
            `Used item: ${choice.item_used} (No disadvantage)`,
            "info"
          );
        } else {
          //Normal, consumable, and story items give advantage
          advantageCount++;
          advantageSources.push(choice.item_used);
          addNotification(
            `Used item: ${choice.item_used} (Advantage!)`,
            "info"
          );
        }

        // Handle item consumption based on type
        // Consumable: Always consumed when used
        if (itemType === "consumable") {
          const itemIndex = storyData.inventory.findIndex(
            (i) => i.name === choice.item_used
          );
          if (itemIndex !== -1) {
            if (storyData.inventory[itemIndex].quantity > 1) {
              storyData.inventory[itemIndex].quantity--;
              itemQuantityAfter = storyData.inventory[itemIndex].quantity;
            } else {
              storyData.inventory.splice(itemIndex, 1);
              itemQuantityAfter = 0;
              itemBroken = true;
            }
          }
        } else {
          //Normal,story,misc:Notconsumedonuse(butnormalcanbreakonfailure)
          itemQuantityAfter = itemQuantityBefore;
        }
      } else {
        //Item missing - disadvantage
        disadvantageCount++;
        disadvantageSources.push(`missing ${choice.item_used}`);
        addNotification(
          `Missing item: ${choice.item_used} (Disadvantage!)`,
          "warning"
        );
      }
    }

    // Track momentum reroll as advantage (for all cases: with item, missing item, no item)
    if (
      momentumMode === "reroll" &&
      rpgSystem.id !== "yze" &&
      rpgSystem.id !== "explosive"
    ) {
      advantageCount++;
      advantageSources.push("momentum reroll");
    }

    //Processresourceusage(resourceisautomaticallyatriskonskillcheckfailure)
    let matchedResource: Resource | null = null;
    if (choice.resource_used) {
      // Try fuzzy matching first
      const matchResult = findResourceMatch(
        choice.resource_used,
        storyData.resources
      );
      matchedResource = matchResult ? (matchResult.item as Resource) : null;

      // Log fuzzy match result
      if (matchResult && !matchResult.isExact) {
        logger.info("Fuzzy matched resource", {
          aiProvided: choice.resource_used,
          matched: matchResult.name,
          score: matchResult.score,
        });
        addNotification(
          `?? Matched "${choice.resource_used}" ? "${
            matchResult.name
          }" (${Math.round(matchResult.score * 100)}% match)`,
          "info"
        );
        // Update choice to use the exact matched name
        choice.resource_used = matchResult.name;
      }

      if (matchedResource) {
        // Ensure resource.value is a valid number (prevent NaN)
        if (
          typeof matchedResource.value !== "number" ||
          isNaN(matchedResource.value)
        ) {
          matchedResource.value = 0;
        }

        const dc = choice.skill_dc || 0;
        const resourceReqs = calculateResourceRequirements(rpgSystem, dc);
        const requiredAmount = resourceReqs.required;

        resourceUsedBefore = matchedResource.value;

        //Check if player has enough resource
        if (matchedResource.value < requiredAmount) {
          insufficientResource = true;
          insufficientResourceDisadvantage = true; // Set disadvantage flag
          disadvantageCount++;
          disadvantageSources.push(`insufficient ${matchedResource.name}`);
          logger.action("Insufficient resource", {
            resource: choice.resource_used,
            required: requiredAmount,
            available: matchedResource.value,
            disadvantage: true,
          });
          addNotification(
            `?? Insufficient ${matchedResource.name}! Need ${requiredAmount}, have ${matchedResource.value}. Disadvantage on roll!`,
            "warning"
          );
        }
      } else {
        logger.warn("Resource not found", { resource: choice.resource_used });
        addNotification(
          `?? Resource not found: ${choice.resource_used}`,
          "warning"
        );
      }
    }

    // Apply stacking advantage/disadvantage system.
    // - PbtA: each net advantage adds +1 to modifier; each net disadvantage adds -1 (no extra rolls).
    // - Other non-YZE/non-Explosive systems: roll extra sets equal to |netAdvantage| and pick best/worst.
    let pbtaPenalty = 0; // Negative for advantage (adds), positive for disadvantage (subtracts)
    if (rpgSystem.id === "pbta") {
      const netAdvantage = advantageCount - disadvantageCount;
      if (netAdvantage !== 0) {
        // Convert net advantage into modifier shift.
        pbtaPenalty = -netAdvantage; // penalty negative => increases modifier
        const isAdvantage = netAdvantage > 0;
        const sourcesList = isAdvantage
          ? advantageSources.join(", ")
          : disadvantageSources.join(", ");
        const stackText =
          Math.abs(netAdvantage) > 1
            ? ` (x${Math.abs(netAdvantage)} stacked)`
            : "";
        addNotification(
          `${isAdvantage ? "? Advantage" : "?? Disadvantage"}${stackText}: ${
            isAdvantage ? "+" : "-"
          }${Math.abs(netAdvantage)} modifier from ${sourcesList}`,
          isAdvantage ? "success" : "warning"
        );
        logger.action("PbtA modifier shift from advantage/disadvantage", {
          netAdvantage,
          pbtaPenalty,
          sources: sourcesList,
        });
      }
    } else if (rpgSystem.id !== "yze" && rpgSystem.id !== "explosive") {
      const netAdvantage = advantageCount - disadvantageCount;
      if (netAdvantage !== 0) {
        const isAdvantage = netAdvantage > 0;
        const sourcesList = isAdvantage
          ? advantageSources.join(", ")
          : disadvantageSources.join(", ");
        // 3d6 special handling: add extra dice to a single pool and keep best/worst 3
        if (rpgSystem.id === "3d6") {
          const extraDiceCount = Math.abs(netAdvantage); // number of additional dice beyond base 3
          // Roll extra individual dice
          const pool: number[] = [...diceResult.rolls]; // base 3 dice from initial roll
          for (let i = 0; i < extraDiceCount; i++) {
            const die = Math.floor(Math.random() * 6) + 1;
            pool.push(die);
          }
          // Determine selected dice indices
          const sortedIndices = pool
            .map((v, idx) => ({ v, idx }))
            .sort((a, b) => (isAdvantage ? b.v - a.v : a.v - b.v))
            .slice(0, 3) // keep best or worst 3
            .map((o) => o.idx);
          // Compute final total from selected dice
          const selectedDice = sortedIndices.map((i) => pool[i]);
          dice_roll = selectedDice.reduce((a, b) => a + b, 0);
          // Overwrite diceResult.rolls with the chosen 3 for downstream success calc
          diceResult.rolls = selectedDice;
          // Store full pool (for visualization). Replace first entry in allDiceDetails.
          allDiceDetails[0] = pool;
          allDiceRolls[0] = dice_roll; // update displayed base roll value
          logger.action("3d6 pooled advantage/disadvantage", {
            netAdvantage,
            isAdvantage,
            pool,
            selectedDice,
            finalTotal: dice_roll,
            sources: sourcesList,
          });
          const stackText =
            extraDiceCount > 1 ? ` (+${extraDiceCount} dice)` : " (+1 die)";
          addNotification(
            `${
              isAdvantage ? "? Advantage" : "?? Disadvantage"
            }${stackText}: kept ${selectedDice.join(",")} from [${pool.join(
              ","
            )}]`,
            isAdvantage ? "success" : "warning"
          );
        } else {
          // Existing multi-roll set logic for other systems
          const rollsToMake = Math.abs(netAdvantage);
          logger.action(
            `${isAdvantage ? "Advantage" : "Disadvantage"} stacking`,
            {
              advantageCount,
              disadvantageCount,
              netAdvantage,
              advantageSources,
              disadvantageSources,
              rollsToMake,
            }
          );
          for (let i = 0; i < rollsToMake; i++) {
            const extraResult = rollDice(rpgSystem);
            const extraRoll = extraResult.total;
            allDiceRolls.push(extraRoll);
            allDiceDetails.push(extraResult.rolls);
            if (isAdvantage) {
              if (rpgSystem.rollUnder) {
                if (extraRoll < dice_roll) dice_roll = extraRoll;
              } else {
                if (extraRoll > dice_roll) dice_roll = extraRoll;
              }
            } else {
              if (rpgSystem.rollUnder) {
                if (extraRoll > dice_roll) dice_roll = extraRoll;
              } else {
                if (extraRoll < dice_roll) dice_roll = extraRoll;
              }
            }
          }
          const stackText =
            Math.abs(netAdvantage) > 1
              ? ` (x${Math.abs(netAdvantage)} stacked)`
              : "";
          addNotification(
            `${
              isAdvantage ? "? Advantage" : "?? Disadvantage"
            }${stackText} from: ${sourcesList}`,
            isAdvantage ? "success" : "warning"
          );
        }
      }
    }

    //Handleskillcheck
    if (choice.skill_used) {
      // Try fuzzy matching first
      const matchResult = findStatMatch(choice.skill_used, storyData.stats);
      // If skill not found, treat as if player has 1 stat point in it
      const statValue = matchResult?.item.value ?? 1;

      // Check for applicable conditions and apply penalties
      let conditionPenaltyModifier = 0;
      let conditionAutoFail = false;
      let conditionGameOver = false;
      let appliedCondition: {
        name: string;
        tier: number;
        penaltyType: string;
      } | null = null;

      if (storyData.conditions && storyData.conditions.length > 0) {
        // Find the most severe applicable condition
        // Priority: affectsAll conditions, then conditions that affect this specific skill
        const skillNameLower = (
          matchResult?.name || choice.skill_used
        ).toLowerCase();

        const applicableConditions = storyData.conditions.filter((c) => {
          if (c.affectsAll) return true;
          return c.affects.some((a) => a.toLowerCase() === skillNameLower);
        });

        if (applicableConditions.length > 0) {
          // Find highest tier condition
          const highestTierCondition = applicableConditions.reduce((max, c) =>
            c.tier > max.tier ? c : max
          );

          const penalty = getConditionPenalty(
            storyData.rpgSystem,
            highestTierCondition.tier
          );

          appliedCondition = {
            name: highestTierCondition.name,
            tier: highestTierCondition.tier,
            penaltyType: penalty.type,
          };

          const tierLabel = ["I", "II", "III", "IV", "V", "VI"][
            highestTierCondition.tier - 1
          ];

          switch (penalty.type) {
            case "modifier":
              conditionPenaltyModifier = penalty.value;
              disadvantageCount++;
              disadvantageSources.push(
                `${highestTierCondition.name} (Tier ${tierLabel})`
              );
              addNotification(
                `?? Condition penalty: ${highestTierCondition.name} (Tier ${tierLabel}) ? ${penalty.value} to roll`,
                "warning"
              );
              break;
            case "auto-fail":
            case "auto-miss":
            case "taken-out":
              conditionAutoFail = true;
              addNotification(
                `?? Condition: ${highestTierCondition.name} (Tier ${tierLabel}) ? Auto-fail!`,
                "failure"
              );
              break;
            case "game-over":
              conditionGameOver = true;
              addNotification(
                `?? PERMANENT CONDITION: ${highestTierCondition.name} (Tier ${tierLabel}) ? The story may end here.`,
                "failure"
              );
              break;
            case "die-size-down":
              // For explosive system: reduce die size
              // This is handled specially in the explosive dice section
              disadvantageCount += penalty.value; // Each step down counts as disadvantage
              disadvantageSources.push(
                `${highestTierCondition.name} (Tier ${tierLabel})`
              );
              addNotification(
                `?? Condition: ${highestTierCondition.name} (Tier ${tierLabel}) ? Die size reduced by ${penalty.value}`,
                "warning"
              );
              break;
            case "d4-only":
              // For explosive system: force d4
              disadvantageCount += 4; // Severe penalty
              disadvantageSources.push(
                `${highestTierCondition.name} (Tier ${tierLabel})`
              );
              addNotification(
                `?? Severe Condition: ${highestTierCondition.name} (Tier ${tierLabel}) ? Forced to use d4!`,
                "failure"
              );
              break;
            case "none":
              // No mechanical effect (narrative system)
              break;
          }

          logger.action("Condition penalty applied", {
            condition: highestTierCondition.name,
            tier: highestTierCondition.tier,
            penaltyType: penalty.type,
            penaltyValue: penalty.value,
            skill: choice.skill_used,
          });
        }
      }

      // Handle auto-fail from conditions
      if (conditionAutoFail) {
        skillCheckResult = "failure";

        // Show dice visualizer with auto-fail
        setDiceRoll({
          show: true,
          rolls: [0],
          finalRoll: 0,
          skillName: choice.skill_used,
          skillBonus: statValue,
          dc: choice.skill_dc || 0,
          isSuccess: false,
          isCritical: false,
          hasAdvantage: false,
          hasDisadvantage: true,
          advantageCount: 0,
          disadvantageCount: 1,
          netAdvantage: -1,
          advantageSources: "",
          disadvantageSources: appliedCondition?.name || "Condition",
          diceRolls: [[0]],
          rpgSystem: storyData.rpgSystem || "3d6",
          conditionAutoFail: true,
          conditionName: appliedCondition?.name,
        });

        // Skip normal dice rolling and success calculation
        // Continue to choice details generation
      } else if (conditionGameOver) {
        // Game over condition - still roll but mark as game over potential
        skillCheckResult = "failure";

        // Don't trigger game_over immediately - let the AI decide based on the narrative
        // The tool stage will handle game_over if appropriate
      }

      // Skip dice rolling if condition auto-fail
      if (!conditionAutoFail) {
        // For YZE: Roll dice NOW using stat value
        // For Explosive: Roll dice NOW using stat value to determine die size
        if (rpgSystem.id === "yze") {
          const baseDiceCount = Math.floor(statValue / 20); // 0-5 base dice from stat
          const stressDiceCount = yzeStressDiceChoice; // Use player's choice
          const totalDiceCount = baseDiceCount + stressDiceCount;

          // Roll all dice (base + stress)
          const rolls: number[] = [];
          for (let i = 0; i < totalDiceCount; i++) {
            rolls.push(Math.floor(Math.random() * 6) + 1);
          }

          // Add stress to character
          if (stressDiceCount > 0) {
            const currentStress = storyData.stress || 0;
            storyData.stress = Math.min(10, currentStress + stressDiceCount);
            addNotification(
              `Added ${stressDiceCount} stress dice (+${stressDiceCount} stress ? ${storyData.stress}/10)`,
              "warning"
            );
          }

          logger.action("YZE dice roll", {
            system: "yze",
            baseDice: baseDiceCount,
            stressDice: stressDiceCount,
            rolls,
            stat: statValue,
          });

          // Ensure dice visualizer gets the actual dice rolled for YZE
          if (Array.isArray(allDiceDetails) && allDiceDetails.length > 0) {
            allDiceDetails[0] = rolls;
          }

          diceResult = { rolls, total: 0 }; // Total doesn't matter for YZE
          dice_roll = 0; // Not used for YZE

          // Reset YZE state
          setYzeAwaitingStressChoice(false);
          setYzePendingChoice(null);
        } else if (rpgSystem.id === "explosive") {
          // Explosive dice: Determine die size from stat
          const dieSize = rpgSystem.statToDieSize
            ? rpgSystem.statToDieSize(statValue)
            : 20;
          yzeData.dieSize = dieSize;

          // Check if we have item advantage
          const hasItemForAdvantage =
            choice.item_used &&
            storyData.inventory.find((i) => i.name === choice.item_used);
          const itemType = hasItemForAdvantage
            ? hasItemForAdvantage.type || "normal"
            : null;
          const hasAdvantage =
            hasItemForAdvantage && itemType && itemType !== "misc";
          const hasDisadvantage = choice.item_used && !hasItemForAdvantage;

          // Roll initial die with explosions
          diceResult = rollDice(rpgSystem, dieSize);
          dice_roll = diceResult.total;
          explosionCount = diceResult.explosions || 0;

          logger.action("Explosive dice roll", {
            system: "explosive",
            dieSize,
            rolls: diceResult.rolls,
            total: dice_roll,
            explosions: explosionCount,
            stat: statValue,
          });

          // Handle advantage (roll second die, take higher)
          if (hasAdvantage) {
            const secondResult = rollDice(rpgSystem, dieSize);
            const second_roll = secondResult.total;
            allDiceRolls.push(dice_roll, second_roll);
            allDiceDetails.push(diceResult.rolls, secondResult.rolls);

            logger.action("Explosive advantage roll from item", {
              item: choice.item_used,
              firstRoll: dice_roll,
              firstExplosions: explosionCount,
              secondRoll: second_roll,
              secondExplosions: secondResult.explosions || 0,
            });

            if (second_roll > dice_roll) {
              dice_roll = second_roll;
              explosionCount = secondResult.explosions || 0;
              diceResult = secondResult;
            }
          } else if (hasDisadvantage) {
            // Disadvantage: roll second die, take lower
            const secondResult = rollDice(rpgSystem, dieSize);
            const second_roll = secondResult.total;
            allDiceRolls.push(dice_roll, second_roll);
            allDiceDetails.push(diceResult.rolls, secondResult.rolls);

            logger.action("Explosive disadvantage roll from missing item", {
              item: choice.item_used,
              firstRoll: dice_roll,
              secondRoll: second_roll,
            });

            if (second_roll < dice_roll) {
              dice_roll = second_roll;
              explosionCount = secondResult.explosions || 0;
              diceResult = secondResult;
            }
          } else {
            // No advantage/disadvantage
            allDiceRolls.push(dice_roll);
            allDiceDetails.push(diceResult.rolls);
          }

          // Handle momentum reroll for explosive
          if (momentumMode === "reroll") {
            const reroll1Result = rollDice(rpgSystem, dieSize);
            const reroll2Result = rollDice(rpgSystem, dieSize);
            const reroll1 = reroll1Result.total;
            const reroll2 = reroll2Result.total;
            allDiceRolls.push(reroll1, reroll2);
            allDiceDetails.push(reroll1Result.rolls, reroll2Result.rolls);

            const oldRoll = dice_roll;
            const bestRoll = Math.max(dice_roll, reroll1, reroll2);
            if (bestRoll === reroll1) {
              dice_roll = reroll1;
              explosionCount = reroll1Result.explosions || 0;
              diceResult = reroll1Result;
            } else if (bestRoll === reroll2) {
              dice_roll = reroll2;
              explosionCount = reroll2Result.explosions || 0;
              diceResult = reroll2Result;
            }

            logger.action("Explosive momentum reroll", {
              oldRoll,
              reroll1,
              reroll2,
              finalRoll: dice_roll,
              finalExplosions: explosionCount,
            });

            addNotification(
              `? Reroll Used! Rolls: ${oldRoll}, ${reroll1}, ${reroll2} ? Best: ${dice_roll}`,
              "success"
            );
          }

          yzeData.explosions = explosionCount;
        }

        // Log fuzzy match result
        if (matchResult && !matchResult.isExact) {
          logger.info("Fuzzy matched skill", {
            aiProvided: choice.skill_used,
            matched: matchResult.name,
            score: matchResult.score,
          });
          addNotification(
            `?? Matched "${choice.skill_used}" ? "${
              matchResult.name
            }" (${Math.round(matchResult.score * 100)}% match)`,
            "info"
          );
          // Update choice to use the exact matched name
          choice.skill_used = matchResult.name;
        } else if (!matchResult) {
          // No match found - log warning
          logger.warn("Skill not found or no fuzzy match", {
            skill: choice.skill_used,
          });
          addNotification(
            `?? Skill not found: ${choice.skill_used}`,
            "warning"
          );
        }

        const dc = choice.skill_dc || 0;

        //Calculate resource requirements based on RPG system
        const resourceReqs = calculateResourceRequirements(rpgSystem, dc);

        //Handleguaranteedsuccess
        if (momentumMode === "guarantee") {
          skillCheckResult = "success";
          logger.action("Skill check (Guaranteed)", {
            skill: choice.skill_used,
            dc,
          });
          addNotification(
            `? Guaranteed Success! (${choice.skill_used}: Auto-success with 2 Momentum)`,
            "success"
          );
        } else {
          let dc_passed: boolean;
          let isCritical: boolean;
          let total: number;

          // For YZE: calculate success count and panic FIRST
          if (rpgSystem.id === "yze" && allDiceDetails.length > 0) {
            const lastRoll = allDiceDetails[allDiceDetails.length - 1];
            const currentStress = storyData.stress || 0;
            const stressDiceCount = yzeStressDiceChoice; // Use player's chosen stress dice

            // Split dice into base and stress dice
            const baseDiceCount = lastRoll.length - stressDiceCount;
            yzeData.baseDice = lastRoll.slice(0, baseDiceCount);
            yzeData.stressDice =
              stressDiceCount > 0 ? lastRoll.slice(baseDiceCount) : [];

            // Calculate success using checkSuccess (pass rolls array)
            const successResult = checkSuccess(
              rpgSystem,
              dice_roll,
              statValue,
              dc,
              conditionPenaltyModifier, // Apply condition penalty (YZE uses dice pool reduction)
              lastRoll
            );

            yzeData.successes = successResult.successes;
            yzeData.stressRelief = successResult.stressRelief;
            yzeData.stressLevel = currentStress;

            // For YZE: use success count to determine if check passed
            dc_passed = successResult.success;
            isCritical = successResult.critical;
            total = successResult.successes || 0;

            // Store for AI context
            rollTotal = total;
            rollDC = dc;

            // Check for panic (1s on stress dice)
            if (stressDiceCount > 0 && yzeData.stressDice) {
              const hasOnes = yzeData.stressDice.some((die) => die === 1);
              if (hasOnes) {
                yzeData.panicTriggered = true;
                // Roll panic: d6 + stress
                const panicRoll =
                  Math.floor(Math.random() * 6) + 1 + currentStress;
                // Find panic effect from table
                if (rpgSystem.panicTable) {
                  const panicEntry = rpgSystem.panicTable.find(
                    (entry) => panicRoll >= entry.min && panicRoll <= entry.max
                  );
                  if (panicEntry) {
                    yzeData.panicEffect = `${panicEntry.effect}: ${panicEntry.description}`;
                  }
                }
              }
            }
          } else {
            // All other systems: use checkSuccess function
            const successResult = checkSuccess(
              rpgSystem,
              dice_roll,
              statValue,
              dc,
              (rpgSystem.id === "pbta" ? pbtaPenalty : 0) +
                conditionPenaltyModifier // PbtA uses +/-1 per net advantage/disadv; add condition penalty
            );

            dc_passed = successResult.success;
            isCritical = successResult.critical;
            total = successResult.total;

            // Store for AI context
            rollTotal = total;
            rollDC = dc;

            // Store partial success for PbtA
            if (successResult.partial) {
              // PbtA partial success counts as "success" for progression but with complications
              dc_passed = true;
              skillCheckResult = "partial";
            }

            // Store Fate-specific outcomes (tie, style)
            if (rpgSystem.id === "fate") {
              if (successResult.tie) {
                skillCheckResult = "tie";
                dc_passed = true; // Ties count as partial success
              } else if (successResult.style) {
                skillCheckResult = "style";
              }
            }
          }

          logger.action("Skill check result", {
            skill: choice.skill_used,
            dc,
            roll: dice_roll,
            stat: statValue,
            total,
            passed: dc_passed,
          });

          // Track skill check for Mythic chaos adjustment
          if (storyData.mythicState && choice.skill_used) {
            const { addSkillCheckResult } = await import(
              "@/app/misc/mythicChaos"
            );
            const skillResult = {
              sceneNumber: storyData.mythicState.sceneCount,
              success: dc_passed,
              skill: choice.skill_used,
              difficulty: dc,
              margin: total - dc,
              timestamp: Date.now(),
            };
            storyData.mythicState = addSkillCheckResult(
              storyData.mythicState,
              skillResult
            );
          }

          // Show dice visualizer
          const usedItem = choice.item_used
            ? storyData.inventory.find((i) => i.name === choice.item_used)
            : null;
          const hasItemAdvantage =
            !!usedItem && (usedItem.type || "normal") !== "misc";
          const hasItemDisadvantage = !!(choice.item_used && !usedItem);

          // For display: use modifier instead of raw stat for systems with statToModifier
          const baseDisplayBonus = rpgSystem.statToModifier
            ? rpgSystem.statToModifier(statValue)
            : statValue;
          const displayBonus =
            rpgSystem.id === "pbta"
              ? baseDisplayBonus - pbtaPenalty
              : baseDisplayBonus; // pbtaPenalty negative increases modifier

          // Calculate net advantage/disadvantage for display
          const netAdvantage = advantageCount - disadvantageCount;

          setDiceRoll({
            show: true,
            rolls: allDiceRolls,
            finalRoll: dice_roll,
            skillName: choice.skill_used,
            skillBonus: displayBonus,
            dc,
            isSuccess: dc_passed,
            isCritical: isCritical,
            hasAdvantage: hasItemAdvantage,
            hasDisadvantage: hasItemDisadvantage,
            advantageCount,
            disadvantageCount,
            netAdvantage,
            advantageSources: advantageSources.join(", "),
            disadvantageSources: disadvantageSources.join(", "),
            diceRolls: allDiceDetails, // Individual dice for each roll
            rpgSystem: storyData.rpgSystem || "3d6", // Pass system type
            ...yzeData, // Spread YZE-specific data
          });

          // Process result - dice visualizer shows all check details
          if (dc_passed) {
            // Only set to "success" if not already set to partial/tie/style
            if (
              skillCheckResult !== "partial" &&
              skillCheckResult !== "tie" &&
              skillCheckResult !== "style"
            ) {
              skillCheckResult = "success";
            }

            // YZE stress relief on strong success
            if (rpgSystem.id === "yze" && yzeData.stressRelief) {
              if (storyData.stress && storyData.stress > 0) {
                storyData.stress--;
              }
            }

            // Recover resource on success
            if (choice.resource_used && matchedResource) {
              // Ensure resource.value is a valid number (prevent NaN)
              if (
                typeof matchedResource.value !== "number" ||
                isNaN(matchedResource.value)
              ) {
                matchedResource.value = 0;
              }

              const recovery = resourceReqs.recovery;
              matchedResource.value = Math.min(
                matchedResource.maxValue,
                matchedResource.value + recovery
              );
              resourceUsedAfter = matchedResource.value;
              logger.action("Resource recovered", {
                resource: choice.resource_used,
                amount: recovery,
                newTotal: matchedResource.value,
              });
            }

            // Earn momentum on success (not when using guarantee or reroll)
            if (momentumMode === "none") {
              if (isCritical) {
                // Critical success: Earn 2 momentum
                if (storyData.momentum < storyData.maxMomentum) {
                  const earned = Math.min(
                    2,
                    storyData.maxMomentum - storyData.momentum
                  );
                  storyData.momentum += earned;
                  logger.action("Momentum earned (Critical Success)", {
                    earned,
                    newTotal: storyData.momentum,
                  });
                }
              } else if (!rpgSystem.rollUnder && total >= dc + 20) {
                // Strong success (beat DC by 20+): earn 1 momentum (only for roll-over systems)
                if (storyData.momentum < storyData.maxMomentum) {
                  storyData.momentum++;
                  logger.action("Momentum earned (Strong Success)", {
                    earned: 1,
                    newTotal: storyData.momentum,
                  });
                }
              }
            }
          } else {
            skillCheckResult = "failure";

            // On failure: Lose additional resource if one was used (DC-based penalty)
            if (choice.resource_used && matchedResource) {
              // Ensure resource.value is a valid number (prevent NaN)
              if (
                typeof matchedResource.value !== "number" ||
                isNaN(matchedResource.value)
              ) {
                matchedResource.value = 0;
              }

              const penalty = resourceReqs.loss;
              matchedResource.value = Math.max(
                0,
                matchedResource.value - penalty
              );
              logger.action("Resource lost (Failure)", {
                resource: choice.resource_used,
                penalty,
                newTotal: matchedResource.value,
              });
            }

            // Handle item breakage on failure (only for 'normal' type items)
            if (choice.item_used) {
              const item = storyData.inventory.find(
                (i) => i.name === choice.item_used
              );
              const itemType = item?.type || "normal";

              // Only normal items break on failure (not consumable, story, or misc)
              if (itemType === "normal" && item) {
                const itemIndex = storyData.inventory.findIndex(
                  (i) => i.name === choice.item_used
                );
                if (
                  itemIndex !== -1 &&
                  itemQuantityAfter === itemQuantityBefore
                ) {
                  // Only break if not already consumed
                  if (storyData.inventory[itemIndex].quantity > 1) {
                    storyData.inventory[itemIndex].quantity--;
                    itemQuantityAfter = storyData.inventory[itemIndex].quantity;
                  } else {
                    storyData.inventory.splice(itemIndex, 1);
                    itemQuantityAfter = 0;
                    itemBroken = true;
                  }
                  logger.action("Item broken (Failure)", {
                    item: choice.item_used,
                  });
                }
              }
            }
          }
        }
      } // End of if (!conditionAutoFail)

      //Buildskillcheckline
      const insufficientText = insufficientResource ? " (no skill bonus)" : "";
      let skillCheckLine = `[Skill check (${choice.skill_used})`;

      // Add system-specific context for AI
      if (rpgSystem.id === "pbta" && skillCheckResult === "partial") {
        // PbtA: Partial success (7-9) - AI should add complications
        skillCheckLine += `: partial success (7-9)`;
      } else if (rpgSystem.id === "fate") {
        // Fate: Include tie/style outcomes and margin
        const margin = rollTotal - rollDC;
        if (skillCheckResult === "tie") {
          skillCheckLine += `: tie (margin 0)`;
        } else if (skillCheckResult === "style") {
          skillCheckLine += `: success with style (+${margin})`;
        } else if (skillCheckResult === "success") {
          skillCheckLine += `: success (margin +${margin})`;
        } else {
          skillCheckLine += `: ${skillCheckResult}`;
        }
      } else if (rpgSystem.id === "explosive") {
        // Explosive: Include explosion count and die size
        const dieSize = yzeData.dieSize || 20;
        const explosions = yzeData.explosions || 0;
        if (explosions > 0) {
          skillCheckLine += `: ${skillCheckResult} (d${dieSize} exploded x${explosions})`;
        } else {
          skillCheckLine += `: ${skillCheckResult} (d${dieSize})`;
        }
      } else if (rpgSystem.id === "yze") {
        // YZE: Include success count
        const successes = yzeData.successes || 0;
        skillCheckLine += `: ${skillCheckResult} (${successes} successes vs ${rollDC})`;
      } else {
        // Standard systems: capitalize first letter for readability
        const formattedResult =
          skillCheckResult.charAt(0).toUpperCase() + skillCheckResult.slice(1);
        skillCheckLine += `: ${formattedResult}`;
      }

      skillCheckLine += `${insufficientText}]`;
      choiceDetails.push(skillCheckLine);

      // YZE: Add panic details if triggered
      if (
        rpgSystem.id === "yze" &&
        yzeData.panicTriggered &&
        yzeData.panicEffect
      ) {
        choiceDetails.push(`[PANIC! ${yzeData.panicEffect}]`);
      }
    }

    //Builditemusageline
    if (choice.item_used && itemQuantityBefore > 0) {
      if (itemBroken) {
        choiceDetails.push(
          `[Item Used: ${choice.item_used}; x${itemQuantityBefore}? broken]`
        );
      } else if (choice.item_loss) {
        choiceDetails.push(
          `[Item Used: ${choice.item_used}; x${itemQuantityBefore}? ${itemQuantityAfter}]`
        );
      } else {
        choiceDetails.push(
          `[Item Used: ${choice.item_used}; x${itemQuantityBefore}]`
        );
      }
    }

    //Buildresourceusageline(includesanyadditionallossfromfailure)
    if (choice.resource_used && resourceUsedBefore > 0 && matchedResource) {
      const maxValue = matchedResource.maxValue || 100;
      const currentValue = matchedResource.value || 0;
      choiceDetails.push(
        `[Resource: ${matchedResource.name} used; ${resourceUsedBefore} -> ${currentValue}/${maxValue}]`
      );
    }

    // Add mythic details at the beginning (less important info first)
    if (mythicDetails.length > 0) {
      choiceDetails = [...mythicDetails, ...choiceDetails];
    }

    // Process custom table rolls
    if (choice.custom_table && storyData.customTables) {
      try {
        const { getTableByName, rollOnCustomTable } = await import(
          "../misc/tableRoller"
        );
        const table = getTableByName(
          storyData.customTables,
          choice.custom_table
        );

        if (table) {
          const result = rollOnCustomTable(table);
          if (result) {
            choiceDetails.push(`[${table.name}: ${result.text}]`);
            logger.action("Custom table roll from choice", {
              table: table.name,
              result: result.text,
            });
          } else {
            addNotification(`?? Table "${table.name}" is empty`, "warning");
          }
        } else {
          addNotification(
            `?? Table not found: ${choice.custom_table}`,
            "warning"
          );
          logger.action("Custom table not found", {
            requestedTable: choice.custom_table,
          });
        }
      } catch (error) {
        console.error("Error processing custom_table:", error);
      }
    }

    //Assemblechoicetext
    let text = "";
    if (choiceDetails.length > 0) {
      text = choiceDetails.join("\n") + "\n";
    }
    // Add STT disclaimer if voice input was used
    if (choice.stt_input) {
      text += "[Voice Input - may contain transcription errors]\n";
    }
    text += ">" + choice.text;
    console.log("Final choice text:", text);
    //Resetmomentummodeafteruse
    setMomentumMode("none");

    storyData.scene.parts.push({
      content: text,
      imageUrl: "",
      user: true,
      role: "user",
      choices: [], // User parts don't have choices - choices come from AI response
    });

    setChoices({ choices: [] });

    //ProcessLoretriggersafteruserchoice
    processLoreTriggers(storyData, addNotification);

    const { storyModel, toolsModel, choicesModel } = getModelsFromPreset();
    const toolCallingEnabled =
      typeof window !== "undefined"
        ? localStorage.getItem("toolCallingEnabled") !== "false"
        : true;

    logger.ai_request("Starting generation (choice)", {
      storyModel,
      toolsModel,
      choicesModel,
      toolCallingEnabled,
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
        ? parseInt(localStorage.getItem("maxToolLoops") || "1", 10)
        : 1;

    // Track parallel completion of tools and choices
    let toolsComplete = !toolCallingEnabled; // If tools disabled, mark as complete
    let choicesComplete = !!actionChoice; // If freeform action, choices will be skipped

    const checkBothComplete = () => {
      if (toolsComplete && choicesComplete) {
        setLoadingStage(null);
      }
    };

    // Create dice animation promise (if dice roll is showing)
    // Animation runs in parallel with generation - don't block on it
    const diceAnimationPromise = diceRoll?.show
      ? new Promise<void>((resolve) => {
          // Total phases: rolling (1800ms) + stopped (800ms) + calculating (1200ms) + result hold (5000ms) = 8800ms
          setTimeout(() => {
            setDiceRoll(null);
            resolve();
          }, 9000);
        })
      : Promise.resolve();

    try {
      // Run generation and dice animation in parallel
      await Promise.all([
        generateStoryTurn(
          storyData,
          "", // User choice already in storyData.scene.parts
          {
            storyModel,
            toolsModel,
            choicesModel,
            enableTools: toolCallingEnabled,
            maxToolLoops,
            skipChoices: !!actionChoice, // Skip choices generation in freeform action mode
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
              setStoryData({ ...storyData });
              setLoading(false); // Let player read while tools/choices generate
            },
            onStoryComplete: (content: string, usage: any) => {
              setLoadingStage("tools");
              logger.ai_response("Story narration complete", {
                length: content.length,
                usage,
              });
            },
            onToolsStart: () => {
              // Keep showing tools stage while either is running
            },
            onToolsComplete: (toolCalls, toolResponses, usage) => {
              // Update the last part with tool data
              const lastPartIndex = storyData.scene.parts.length - 1;
              if (lastPartIndex >= 0) {
                storyData.scene.parts[lastPartIndex] = {
                  ...storyData.scene.parts[lastPartIndex],
                  toolCalls,
                  toolResponses,
                };
              }

              // Store tool responses for AI feedback in next turn
              setPendingCommandResponses(toolResponses);

              setStoryData({ ...storyData });
              toolsComplete = true;
              checkBothComplete();

              logger.ai_response("Tools complete", {
                toolCallsCount: toolCalls.length,
                responsesCount: toolResponses.length,
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

              logger.ai_response("Choices complete", {
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
                if (
                  !storyData.earnedPointsFromChapters.includes(currentChapter)
                ) {
                  storyData.earnedPointsFromChapters.push(currentChapter);
                  storyData.points += UPGRADE_COSTS.CHAPTER_REWARD;
                  addNotification(
                    `? Chapter ${currentChapter} Complete! Earned ${UPGRADE_COSTS.CHAPTER_REWARD} points! Total: ${storyData.points}`,
                    "success"
                  );
                }
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
                "Saving story - last part choices:",
                lastPartForSave.choices?.length || 0,
                "choices"
              );
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
            : undefined
        ),
        diceAnimationPromise, // Wait for dice animation to complete too
      ]);
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

    //RemovethelastAIresponse
    storyData.scene.parts.pop();

    //Gettheuserchoicepart
    const userChoicePart =
      storyData.scene.parts[storyData.scene.parts.length - 1];

    //Restorechoicesfromuser'schoicepart
    if (userChoicePart.choices) {
      setChoices({ choices: userChoicePart.choices });
    }

    addNotification("Regenerating response...", "info");
    logger.action("User requested retry");

    const { storyModel, toolsModel, choicesModel } = getModelsFromPreset();
    const toolCallingEnabled =
      typeof window !== "undefined"
        ? localStorage.getItem("toolCallingEnabled") !== "false"
        : true;

    logger.ai_request("Starting generation (retry)", {
      storyModel,
      toolsModel,
      choicesModel,
      toolCallingEnabled,
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
        ? parseInt(localStorage.getItem("maxToolLoops") || "1", 10)
        : 1;

    // Track parallel completion of tools and choices
    let toolsComplete = !toolCallingEnabled; // If tools disabled, mark as complete
    let choicesComplete = false;

    const checkBothComplete = () => {
      if (toolsComplete && choicesComplete) {
        setLoadingStage(null);
      }
    };

    try {
      await generateStoryTurn(
        storyData,
        "", // The context is already in storyData.scene.parts
        {
          storyModel,
          toolsModel,
          choicesModel,
          enableTools: toolCallingEnabled,
          maxToolLoops,
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
            setStoryData({ ...storyData });
            setLoading(false); // Let player read while tools/choices generate
          },
          onStoryComplete: (content: string, usage: any) => {
            setLoadingStage("tools");
            logger.ai_response("Story narration complete (retry)", {
              length: content.length,
              usage,
            });
          },
          onToolsStart: () => {
            // Keep showing tools stage while either is running
          },
          onToolsComplete: (toolCalls, toolResponses, usage) => {
            // Update the last part with tool data
            const lastPartIndex = storyData.scene.parts.length - 1;
            if (lastPartIndex >= 0) {
              storyData.scene.parts[lastPartIndex] = {
                ...storyData.scene.parts[lastPartIndex],
                toolCalls,
                toolResponses,
              };
            }

            // Store tool responses for AI feedback in next turn
            setPendingCommandResponses(toolResponses);

            setStoryData({ ...storyData });
            toolsComplete = true;
            checkBothComplete();

            logger.ai_response("Tools complete (retry)", {
              toolCallsCount: toolCalls.length,
              responsesCount: toolResponses.length,
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
              if (
                !storyData.earnedPointsFromChapters.includes(currentChapter)
              ) {
                storyData.earnedPointsFromChapters.push(currentChapter);
                storyData.points += UPGRADE_COSTS.CHAPTER_REWARD;
                addNotification(
                  `?? Chapter ${currentChapter} Complete! Earned ${UPGRADE_COSTS.CHAPTER_REWARD} points! Total: ${storyData.points}`,
                  "success"
                );
              }
            }

            // Process lore triggers based on new content
            processLoreTriggers(storyData, addNotification);

            setCanRetry(true);
            setCanUndo(true);
            setLoadingStage(null);

            // Clear command responses after successful generation
            setPendingCommandResponses([]);

            setStoryData({ ...storyData });

            // Save progress
            saveProgress(storyData);

            addNotification("? Response regenerated", "success");

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
        pendingCommandResponses.length > 0 ? pendingCommandResponses : undefined
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
          {} as Record<string, boolean>
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

    // Update only the content field, preserve all other data
    storyData.scene.parts[partIndex] = {
      ...partToEdit,
      content: editedText,
      // Explicitly preserve these fields:
      // - choices: AI-generated choices remain unchanged
      // - toolCalls: AI tool usage history preserved
      // - toolResponses: Command execution results preserved
      // - imageUrl: Story images preserved
      // - user: false (still AI response)
      // - role: "assistant" (still AI role)
    };

    // Update UI if this is the current/last part
    if (partIndex === storyData.scene.parts.length - 1) {
      setStoryText(editedText);
      // Choices remain unchanged - don't update them
    }

    setStoryData({ ...storyData });
    addNotification("Story narration edited successfully", "success");

    // Save progress to database
    await saveProgress(storyData);
  }

  async function handlePurchase(cost: number, callback: () => void) {
    if (!storyData) return;

    if (storyData.points >= cost) {
      storyData.points -= cost;
      callback(); //Execute the upgrade
      setStoryData({ ...storyData });
      addNotification(
        `? Upgrade purchased! (${storyData.points} points remaining)`,
        "success"
      );
      await saveProgress(storyData);
    } else {
      addNotification(
        `? Not enough points! Need ${cost}, have ${storyData.points}`,
        "failure"
      );
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
              onClick={() => router.push("/explorer")}
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
      (a) => a.dateAchieved
    ).length;
    const totalAchievements = storyData.achievements.length;
    const completedBeats = storyData.plot_beats.filter(
      (b) => b.fulfilled
    ).length;
    const totalBeats = storyData.plot_beats.length;
    const completedQuests =
      storyData.quests?.filter((q) => q.fulfilled).length || 0;
    const totalQuests = storyData.quests?.length || 0;

    return (
      <div className="min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 py-6 px-4">
        <div className="max-w-3xl mx-auto">
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

              <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/30">
                <div className="flex items-center gap-2 mb-1">
                  <DynamicIcon
                    name="BookOpen"
                    className="w-5 h-5 text-blue-400"
                  />
                  <span className="text-sm font-medium text-white">
                    Story Beats
                  </span>
                </div>
                <div className="text-2xl font-bold text-blue-400">
                  {completedBeats}/{totalBeats}
                </div>
                <div className="text-xs text-blue-200/40">
                  {totalBeats > 0
                    ? Math.round((completedBeats / totalBeats) * 100)
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
                        const {
                          data: { session },
                        } = await supabase.auth.getSession();
                        if (!session) {
                          addNotification(
                            "Please sign in to replay",
                            "warning"
                          );
                          return;
                        }

                        //Resetstorytoinitialstatebutkeepadventuretemplate
                        const resetStoryData: StoryData = {
                          ...storyData,
                          scene: { parts: [] },
                          memory: [],
                          currentChapter: 0,
                          chapters: [],
                          momentum: storyData.momentum,
                          points: 0,
                          earnedPointsFromBeats: [],
                          earnedPointsFromChapters: [],
                          earnedPointsFromQuests: [],
                          plot_beats: storyData.plot_beats.map((b) => ({
                            ...b,
                            fulfilled: false,
                          })),
                          achievements: storyData.achievements.map((a) => ({
                            ...a,
                            dateAchieved: null,
                          })),
                          quests:
                            storyData.quests?.map((q) => ({
                              ...q,
                              fulfilled: false,
                              active: false,
                            })) || [],
                          lore: storyData.lore.map((l) => ({
                            ...l,
                            on:
                              l.on_triggers && l.on_triggers.length > 0
                                ? false
                                : true,
                          })),
                        };

                        // Encrypt before saving
                        const password = getEncryptionPassword();
                        const email = user?.email;
                        if (!password || !email) {
                          addNotification(
                            "Please sign out and sign back in to save encrypted stories",
                            "warning"
                          );
                          return;
                        }
                        const encryptedData = await encryptStoryData(
                          resetStoryData,
                          email,
                          password
                        );

                        await fetch(`/api/stories/${storyDbId}`, {
                          method: "PATCH",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${session.access_token}`,
                          },
                          body: JSON.stringify({ storyData: encryptedData }),
                        });

                        addNotification(
                          "Story reset! Starting fresh...",
                          "success"
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
                        const {
                          data: { session },
                        } = await supabase.auth.getSession();
                        if (!session) {
                          addNotification(
                            "Please sign in for New Game Plus",
                            "warning"
                          );
                          return;
                        }

                        const ngPlusCount =
                          (storyData.newGamePlusCount || 0) + 1;
                        const bonusPoints = ngPlusCount * 50; //50pointsperNG+run
                        const bonusMomentum = Math.min(ngPlusCount, 3); //Upto+3maxmomentum

                        //Resetstorybutkeepachievements,stats,resources,andinventory
                        const ngPlusStoryData: StoryData = {
                          ...storyData,
                          scene: { parts: [] },
                          memory: [],
                          currentChapter: 0,
                          chapters: [],
                          momentum: storyData.momentum,
                          maxMomentum: storyData.maxMomentum + bonusMomentum,
                          points: bonusPoints, //Startwithbonuspoints
                          earnedPointsFromBeats: [],
                          earnedPointsFromChapters: [],
                          earnedPointsFromQuests: [],
                          plot_beats: storyData.plot_beats.map((b) => ({
                            ...b,
                            fulfilled: false,
                          })),
                          //Keepachievements,stats,resources,andinventory!
                          achievements: storyData.achievements,
                          stats: storyData.stats, //Keepstats
                          resources: storyData.resources, //Keepresources
                          inventory: storyData.inventory, //Keepinventory
                          quests:
                            storyData.quests?.map((q) => ({
                              ...q,
                              fulfilled: false,
                              active: false,
                            })) || [],
                          lore: storyData.lore.map((l) => ({
                            ...l,
                            on:
                              l.on_triggers && l.on_triggers.length > 0
                                ? false
                                : true,
                          })),
                          newGamePlusCount: ngPlusCount,
                          newGamePlusMode: true,
                        };

                        // Encrypt before saving
                        const password = getEncryptionPassword();
                        const email = user?.email;
                        if (!password || !email) {
                          addNotification(
                            "Please sign out and sign back in to save encrypted stories",
                            "warning"
                          );
                          return;
                        }
                        const encryptedData = await encryptStoryData(
                          ngPlusStoryData,
                          email,
                          password
                        );

                        await fetch(`/api/stories/${storyDbId}`, {
                          method: "PATCH",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${session.access_token}`,
                          },
                          body: JSON.stringify({ storyData: encryptedData }),
                        });

                        addNotification(
                          `New Game Plus ${ngPlusCount} activated! +${bonusPoints} points, +${bonusMomentum} max momentum`,
                          "success"
                        );
                        router.push(`/story?storyId=${storyDbId}`);
                        window.location.reload();
                      } catch (error) {
                        console.error("Error starting NG+:", error);
                        addNotification(
                          "Failed to start New Game Plus",
                          "failure"
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
                onClick={() => router.push("/explorer")}
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
      <div className="min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 py-6 px-4">
        <div className="max-w-3xl mx-auto">
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
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 py-4 px-4 pb-20">
      <main className="flex gap-4 w-full max-w-4xl mx-auto flex-col">
        {/* Compact Story Header */}
        <div className="bg-blue-950/50 rounded-xl border border-blue-800/30 px-4 py-3">
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
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-blue-950/50 rounded-xl border border-blue-800/30 p-2">
          <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-1">
            {[
              { state: StoryState.STORY, icon: "BookOpen", label: "Story" },
              { state: StoryState.STATS, icon: "BarChart2", label: "Stats" },
              { state: StoryState.LORE, icon: "Scroll", label: "Lore" },
              { state: StoryState.QUESTS, icon: "Target", label: "Quests" },
              {
                state: StoryState.UPGRADES,
                icon: "ShoppingCart",
                label: "Upgrades",
              },
              { state: StoryState.MENU, icon: "Settings", label: "Menu" },
            ].map(({ state, icon, label }) => (
              <button
                key={state}
                onClick={() => setCurrentState(state)}
                className={`px-4 py-3 sm:px-3 sm:py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-1.5 touch-manipulation ${
                  currentState === state
                    ? "bg-blue-600 text-white"
                    : "text-blue-200/70 hover:bg-blue-900/50 hover:text-white active:bg-blue-800/50"
                }`}
              >
                <DynamicIcon name={icon} className="w-5 h-5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/*Rendercurrentpage*/}
        {currentState === StoryState.STORY && (
          <Story
            storyData={storyData}
            storyText={storyText}
            choices={choices}
            input={input}
            loading={loading}
            loadingStage={loadingStage}
            momentumMode={momentumMode}
            onMomentumModeChange={setMomentumMode}
            handleChoice={handleChoice}
            handleSelect={handleSelect}
            onCustomInput={handleCustomInput}
            onActionSubmit={handleActionSubmit}
            onActionConfirm={handleActionConfirm}
            onRetry={handleRetry}
            canRetry={canRetry}
            onUndo={handleUndo}
            canUndo={canUndo}
            onEdit={handleEdit}
            viewingPartIndex={viewingPartIndex}
            onNavigateLeft={handleNavigateLeft}
            onNavigateRight={handleNavigateRight}
            onResetToCurrentPart={resetToCurrentPart}
            syncStatus={syncStatus}
          />
        )}
        {currentState === StoryState.STATS && <StatsPage {...storyData} />}
        {currentState === StoryState.LORE && <LorePage {...storyData} />}
        {currentState === StoryState.QUESTS && <QuestsPage {...storyData} />}
        {currentState === StoryState.UPGRADES && (
          <UpgradesPage storyData={storyData} onPurchase={handlePurchase} />
        )}
        {currentState === StoryState.MENU && (
          <MenuPage
            {...storyData}
            storyDbId={storyDbId}
            onSaveProgress={() => saveProgress(storyData)}
            onUpdateStoryData={updateStoryData}
            onViewLogs={() => setCurrentState(StoryState.LOGS)}
            onViewContext={() => setCurrentState(StoryState.CONTEXT)}
          />
        )}
        {currentState === StoryState.LOGS && <LogViewer />}
        {currentState === StoryState.CONTEXT && (
          <ContextViewer storyData={storyData} />
        )}
      </main>

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
              "success"
            );
          }}
          onKeepServer={async () => {
            // Keep server version - update local
            if (syncConflict.serverData && storyDbId) {
              const { saveLocalStory } = await import(
                "@/app/misc/localStoryManager"
              );
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

      {/* YZE: Stress Dice Selection UI */}
      {yzeAwaitingStressChoice && yzePendingChoice && storyData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-linear-to-br from-gray-900 via-red-950 to-gray-900 border-4 border-red-600 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center justify-center gap-3 mb-6">
              <DynamicIcon name="Skull" className="w-10 h-10 text-red-400" />
              <h2 className="text-3xl font-black text-red-100 uppercase tracking-wide">
                Add Stress Dice?
              </h2>
            </div>

            <div className="bg-gray-950/50 rounded-lg p-4 mb-6 border border-red-900">
              <p className="text-white text-center mb-4">
                <span className="font-bold text-red-300">Skill:</span>{" "}
                {yzePendingChoice.skill_used}
              </p>
              <p className="text-gray-300 text-sm text-center mb-2">
                Base Dice:{" "}
                <span className="font-bold text-blue-400">
                  {Math.floor(
                    (storyData.stats.find(
                      (s) => s.name === yzePendingChoice.skill_used
                    )?.value || 0) / 20
                  )}
                </span>
              </p>
              <p className="text-gray-300 text-sm text-center mb-4">
                Current Stress:{" "}
                <span
                  className={`font-bold ${
                    (storyData.stress || 0) >= 8
                      ? "text-red-400 animate-pulse"
                      : "text-yellow-400"
                  }`}
                >
                  {storyData.stress || 0}/10
                </span>
              </p>
              <p className="text-gray-400 text-xs text-center border-t border-gray-700 pt-3">
                ?? Stress dice increase your chances (count 6s) but add stress
                and risk PANIC on 1s!
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-white font-bold mb-3 text-center">
                Stress Dice:{" "}
                <span className="text-red-400 text-2xl">
                  {yzeStressDiceChoice}
                </span>
              </label>
              <input
                type="range"
                min="0"
                max={Math.min(5, 10 - (storyData.stress || 0))}
                value={yzeStressDiceChoice}
                onChange={(e) =>
                  setYzeStressDiceChoice(parseInt(e.target.value))
                }
                className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-600"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>0 (Safe)</span>
                <span>{Math.min(5, 10 - (storyData.stress || 0))} (Max)</span>
              </div>
            </div>

            {yzeStressDiceChoice > 0 && (
              <div className="bg-red-950/30 border border-red-800 rounded-lg p-3 mb-6">
                <p className="text-red-200 text-sm text-center">
                  +{yzeStressDiceChoice} stress ?{" "}
                  <span className="font-bold">
                    {(storyData.stress || 0) + yzeStressDiceChoice}/10
                  </span>
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setYzeAwaitingStressChoice(false);
                  setYzePendingChoice(null);
                  setYzeStressDiceChoice(0);
                }}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleChoice(); // Resume with chosen stress dice
                }}
                className="flex-1 bg-linear-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-lg"
              >
                Roll!
              </button>
            </div>
          </div>
        </div>
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
          rpgSystem={diceRoll.rpgSystem}
          baseDice={diceRoll.baseDice}
          stressDice={diceRoll.stressDice}
          successes={diceRoll.successes}
          panicTriggered={diceRoll.panicTriggered}
          panicEffect={diceRoll.panicEffect}
          stressLevel={diceRoll.stressLevel}
          stressRelief={diceRoll.stressRelief}
          onComplete={() => setDiceRoll(null)}
        />
      )}
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
