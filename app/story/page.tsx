"use client";

import {
  Scene,
  StoryData,
  Choices,
  Choice,
  UPGRADE_COSTS,
  Preset,
} from "../misc/structs";
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
import { DEFAULT_PRESET } from "../misc/presets";
import ConfirmDialog from "../components/ConfirmDialog";
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
  findItemMatch,
  findResourceMatch,
  findStatMatch,
  findAchievementMatch,
  findQuestMatch,
  findRelationshipMatch,
} from "../misc/fuzzyMatch";

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
        addNotification(
          `Added ${quantity} ${itemName} (${existingItem.quantity} total)`,
          "info"
        );
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
        addNotification(
          `Added ${quantity} ${itemName} to inventory`,
          "success"
        );
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
          addNotification(`Removed ${itemName} from inventory`, "info");
        } else {
          logger.action("Item quantity modified via command", {
            itemName,
            amount,
            newTotal: storyData.inventory[itemIndex].quantity,
          });
          addNotification(
            `${amount > 0 ? "Added" : "Removed"} ${Math.abs(
              amount
            )} ${itemName}`,
            "info"
          );
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
        addNotification(`Added ${amount} ${itemName} to inventory`, "info");
      }
      continue;
    }

    // /trigger_achievement: achievement title
    const achievementMatch = trimmed.match(/^\/trigger_achievement:\s*(.+)$/i);
    if (achievementMatch) {
      const achievementTitle = achievementMatch[1].trim();

      // Try fuzzy matching first
      const matchResult = findAchievementMatch(
        achievementTitle,
        storyData.achievements
      );
      const existing = matchResult?.item;

      // Log fuzzy match result
      if (matchResult && !matchResult.isExact) {
        logger.info("Fuzzy matched achievement", {
          aiProvided: achievementTitle,
          matched: matchResult.name,
          score: matchResult.score,
        });
        addNotification(
          `📝 Matched "${achievementTitle}" → "${
            matchResult.name
          }" (${Math.round(matchResult.score * 100)}% match)`,
          "info"
        );
      }

      if (existing && !existing.dateAchieved) {
        existing.dateAchieved = new Date();
        storyData.points += existing.points;
        logger.action("Achievement unlocked via command", {
          title: existing.title,
          points: existing.points,
        });
        addNotification(
          `🏆 Achievement Unlocked: ${existing.title}`,
          "success"
        );
        addNotification(
          `✨ Earned ${existing.points} points! Total: ${storyData.points}`,
          "success"
        );
      } else if (!existing) {
        logger.warn("Achievement not found or no fuzzy match", {
          achievement: achievementTitle,
        });
        addNotification(
          `⚠️ Achievement not found: ${achievementTitle}`,
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
      addNotification(
        `? Momentum: ${oldValue} ? ${storyData.momentum}/${storyData.maxMomentum}`,
        amount > 0 ? "success" : "warning"
      );
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
        addNotification(`✨ Story beat ${beatIndex + 1} completed`, "success");

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
      addNotification(`✨ New quest: ${title}`, "success");
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
        addNotification(
          `📝 Matched "${questTitle}" → "${matchResult.name}" (${Math.round(
            matchResult.score * 100
          )}% match)`,
          "info"
        );
      }

      if (quest) {
        quest.active = true;
        logger.action("Quest activated via command", { title: quest.title });
        addNotification(`✨ Quest activated: ${quest.title}`, "info");
      } else {
        logger.warn("Quest not found or no fuzzy match", {
          quest: questTitle,
        });
        addNotification(`⚠️ Quest not found: ${questTitle}`, "warning");
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
        addNotification(
          `📝 Matched "${questTitle}" → "${matchResult.name}" (${Math.round(
            matchResult.score * 100
          )}% match)`,
          "info"
        );
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
          addNotification(`✅ Quest completed: ${quest.title}`, "success");
          addNotification(
            `✨ Earned ${quest.points} points! Total: ${storyData.points}`,
            "success"
          );
        } else {
          addNotification(`✅ Quest completed: ${quest.title}`, "success");
        }
      } else if (!quest) {
        logger.warn("Quest not found or no fuzzy match", {
          quest: questTitle,
        });
        addNotification(`⚠️ Quest not found: ${questTitle}`, "warning");
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
        addNotification(
          `📝 Matched "${questTitle}" → "${matchResult.name}" (${Math.round(
            matchResult.score * 100
          )}% match)`,
          "info"
        );
      }

      if (quest) {
        quest.active = false;
        logger.action("Quest deactivated via command", { title: quest.title });
        addNotification(`✨ Quest deactivated: ${quest.title}`, "info");
      } else {
        logger.warn("Quest not found or no fuzzy match", {
          quest: questTitle,
        });
        addNotification(`⚠️ Quest not found: ${questTitle}`, "warning");
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
        addNotification(`⚠️ Lore "${loreTitle}" already exists`, "warning");
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
        addNotification(`✨ New lore entry created: ${loreTitle}`, "success");
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
        addNotification(`⚠️ Lore "${loreTitle}" not found`, "warning");
        logger.warn("Lore replace failed: entry not found", {
          title: loreTitle,
        });
      } else if (!loreEntry.content.includes(oldText)) {
        addNotification(`⚠️ Text not found in lore "${loreTitle}"`, "warning");
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
        addNotification(`✨ Lore "${loreTitle}" content updated`, "success");
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
        addNotification(`⚠️ Lore "${loreTitle}" not found`, "warning");
        logger.warn("Lore add failed: entry not found", { title: loreTitle });
      } else {
        loreEntry.content = loreEntry.content.trim() + "\n" + newText;
        logger.action("Content added to lore via command", {
          title: loreTitle,
          addedText: newText,
        });
        addNotification(`✨ Content added to lore "${loreTitle}"`, "success");
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
        addNotification(`⚠️ Lore "${loreTitle}" not found`, "warning");
        logger.warn("Lore delete failed: entry not found", {
          title: loreTitle,
        });
      } else if (!loreEntry.content.includes(textToDelete)) {
        addNotification(`⚠️ Text not found in lore "${loreTitle}"`, "warning");
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
        addNotification(
          `✨ Content removed from lore "${loreTitle}"`,
          "success"
        );
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
        addNotification(`⚠️ Item "${itemName}" not found`, "warning");
        logger.warn("Item removal failed: item not found", { itemName });
      } else if (item.quantity < quantity) {
        addNotification(
          `⚠️ Not enough "${item.name}" (have ${item.quantity}, need ${quantity})`,
          "warning"
        );
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
          addNotification(`✨ Removed all ${item.name}`, "success");
        } else {
          logger.action("Item quantity reduced via command", {
            itemName: item.name,
            quantityRemoved: quantity,
            remaining: item.quantity,
          });
          addNotification(
            `✨ Removed ${quantity} ${item.name} (${item.quantity} left)`,
            "success"
          );
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
        addNotification(`⚠️ Item "${itemName}" not found`, "warning");
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
          addNotification(`✨ ${item.name} depleted`, "success");
        } else {
          item.quantity = newQuantity;
          logger.action("Item quantity modified via command", {
            itemName: item.name,
            delta: actualDelta,
            newQuantity,
          });
          addNotification(
            `✨ ${item.name}: ${
              actualDelta > 0 ? "+" : ""
            }${actualDelta} (now ${newQuantity})`,
            "success"
          );
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
        addNotification(`⚠️ Item "${oldItemName}" not found`, "warning");
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
        addNotification(
          `✨ ${oldItem.name} → ${newItemName} (×${quantity})`,
          "success"
        );
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
        addNotification(`⚠️ Resource "${name}" already exists`, "warning");
        logger.warn("Resource addition failed: already exists", { name });
      } else {
        storyData.resources.push({
          name,
          value: current,
          maxValue: max,
          description,
          symbol: "💎",
          custom_symbol_url: undefined,
        });
        logger.action("Resource added via command", { name, current, max });
        addNotification(`✨ New resource: ${name}`, "success");
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
        addNotification(`⚠️ Resource "${name}" not found`, "warning");
        logger.warn("Resource modification failed: resource not found", {
          name,
        });
      } else {
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
        addNotification(
          `✨ ${resource.name}: ${resource.value}/${resource.maxValue} (${
            currentDelta > 0 ? "+" : ""
          }${currentDelta}/${maxDelta > 0 ? "+" : ""}${maxDelta})`,
          "success"
        );
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
        addNotification(`⚠️ Resource "${name}" not found`, "warning");
        logger.warn("Resource removal failed: resource not found", { name });
      } else {
        storyData.resources = storyData.resources.filter(
          (r) => r.name !== resource.name
        );
        logger.action("Resource removed via command", {
          name: resource.name,
        });
        addNotification(`✨ Removed resource: ${resource.name}`, "success");
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
        addNotification(`⚠️ Stat "${name}" already exists`, "warning");
        logger.warn("Stat addition failed: already exists", { name });
      } else {
        storyData.stats.push({
          name,
          value,
          description,
          symbol: "⭐",
          custom_symbol_url: undefined,
        });
        logger.action("Stat added via command", { name, value });
        addNotification(`✨ New stat: ${name}`, "success");
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
        addNotification(`⚠️ Stat "${name}" not found`, "warning");
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
        addNotification(
          `✨ ${stat.name}: ${oldValue} → ${stat.value} (${
            valueDelta > 0 ? "+" : ""
          }${valueDelta})`,
          "success"
        );
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
        addNotification(`⚠️ Stat "${name}" not found`, "warning");
        logger.warn("Stat removal failed: stat not found", { name });
      } else {
        storyData.stats = storyData.stats.filter((s) => s.name !== stat.name);
        logger.action("Stat removed via command", { name: stat.name });
        addNotification(`✨ Removed stat: ${stat.name}`, "success");
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
        addNotification(`⚠️ Quest "${questTitle}" not found`, "warning");
        logger.warn("Quest description update failed: quest not found", {
          title: questTitle,
        });
      } else {
        quest.description = newDescription;
        logger.action("Quest description updated via command", {
          title: quest.title,
          newDescription,
        });
        addNotification(
          `✨ Quest "${quest.title}" description updated`,
          "success"
        );
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
        addNotification(`⚠️ Quest "${questTitle}" not found`, "warning");
        logger.warn("Quest short description update failed: quest not found", {
          title: questTitle,
        });
      } else {
        quest.shortDescription = newShortDescription;
        logger.action("Quest short description updated via command", {
          title: quest.title,
          newShortDescription,
        });
        addNotification(`✨ Quest "${quest.title}" summary updated`, "success");
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
        addNotification(`⚠️ Relationship name cannot be empty`, "warning");
        logger.warn("Relationship add failed: empty name");
        continue;
      }

      // Check for duplicates
      const existing = storyData.relationships.find(
        (r) => r.name.toLowerCase() === name.toLowerCase()
      );

      if (existing) {
        addNotification(`⚠️ Relationship "${name}" already exists`, "warning");
        logger.warn("Relationship add failed: already exists", { name });
      } else if (value < -100 || value > 100) {
        addNotification(
          `⚠️ Relationship value must be between -100 and 100`,
          "warning"
        );
        logger.warn("Relationship add failed: invalid value", {
          name,
          value,
        });
      } else {
        // Determine symbol based on relationship value
        let symbol = "🤝"; // Default neutral
        if (value >= 75) symbol = "💚"; // Strong ally
        else if (value >= 50) symbol = "💙"; // Ally
        else if (value >= 25) symbol = "😊"; // Friend
        else if (value >= 0) symbol = "🤝"; // Neutral/Acquaintance
        else if (value >= -25) symbol = "😐"; // Slight tension
        else if (value >= -50) symbol = "😠"; // Unfriendly
        else if (value >= -75) symbol = "💔"; // Enemy
        else symbol = "⚔️"; // Hostile

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
        addNotification(`✨ New relationship: ${name} (${value})`, "success");
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
        addNotification(`⚠️ Relationship "${name}" not found`, "warning");
        logger.warn("Relationship modify failed: not found", { name });
      } else {
        const oldValue = relationship.value;
        relationship.value = Math.max(-100, Math.min(100, oldValue + delta));

        // Update symbol based on new value
        if (relationship.value >= 75) relationship.symbol = "💚";
        else if (relationship.value >= 50) relationship.symbol = "💙";
        else if (relationship.value >= 25) relationship.symbol = "😊";
        else if (relationship.value >= 0) relationship.symbol = "🤝";
        else if (relationship.value >= -25) relationship.symbol = "😐";
        else if (relationship.value >= -50) relationship.symbol = "😠";
        else if (relationship.value >= -75) relationship.symbol = "💔";
        else relationship.symbol = "⚔️";

        logger.action("Relationship modified via command", {
          name: relationship.name,
          oldValue,
          newValue: relationship.value,
          delta,
        });
        addNotification(
          `${delta > 0 ? "📈" : "📉"} ${relationship.name}: ${oldValue} → ${
            relationship.value
          }`,
          "success"
        );
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
        addNotification(`⚠️ Relationship "${name}" not found`, "warning");
        logger.warn("Relationship remove failed: not found", { name });
      } else {
        storyData.relationships = storyData.relationships.filter(
          (r) => r !== relationship
        );
        logger.action("Relationship removed via command", {
          name: relationship.name,
          value: relationship.value,
        });
        addNotification(
          `🗑️ Relationship with ${relationship.name} removed`,
          "success"
        );
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
        addNotification(`⚠️ Relationship "${name}" not found`, "warning");
        logger.warn("Relationship description update failed: not found", {
          name,
        });
      } else {
        relationship.description = newDescription;
        logger.action("Relationship description updated via command", {
          name: relationship.name,
          newDescription,
        });
        addNotification(
          `✨ Relationship with ${relationship.name} updated`,
          "success"
        );
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
        addNotification(`✨ Story beat ${beatIndex + 1} title updated`, "info");
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
        addNotification(
          `✨ Story beat ${beatIndex + 1} content updated`,
          "info"
        );
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
      addNotification(`✨ New story beat added: ${title}`, "success");
      continue;
    }

    ///remove_beat:beatindex
    const removeBeatMatch = trimmed.match(/^\/remove_beat:\s*(\d+)$/i);
    if (removeBeatMatch) {
      const beatIndex = parseInt(removeBeatMatch[1], 10);
      if (beatIndex >= 0 && beatIndex < storyData.plot_beats.length) {
        const removed = storyData.plot_beats.splice(beatIndex, 1)[0];
        addNotification(`✨ Story beat removed: ${removed.content}`, "warning");
      }
      continue;
    }
  }
}

// Utility: Trim scene history to prevent bloat
function trimStoryData(data: StoryData): StoryData {
  const MAX_PERSISTED_PARTS = 10; // Keep last 10 scene parts
  return {
    ...data,
    scene: {
      ...data.scene,
      parts: data.scene.parts.slice(-MAX_PERSISTED_PARTS),
    },
  };
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
  const [momentumMode, setMomentumMode] = useState<
    "none" | "reroll" | "guarantee"
  >("none");
  const [pendingChoice, setPendingChoice] = useState<number | null>(null);
  const [loadingStory, setLoadingStory] = useState(true);
  const [started, setStarted] = useState(false);
  const [canRetry, setCanRetry] = useState(false);
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
    isCritical: boolean;
    hasAdvantage: boolean;
    hasDisadvantage: boolean;
  } | null>(null);

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

  // Load story from database on mount
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

    async function loadStory() {
      try {
        //Checkifthisisalocalstory
        if (storyId?.startsWith("local_")) {
          const { getLocalStory } = await import(
            "@/app/misc/localStoryManager"
          );
          const localStory = await getLocalStory(storyId);

          if (!localStory) {
            throw new Error("Localstorynotfound");
          }

          console.log("Local story loaded:", localStory);
          setStoryDbId(localStory.id);
          setStoryData(localStory.storyData);

          //Initializestoryifnopartsyet-showpresetselection
          if (localStory.storyData.scene.parts.length === 0) {
            setShowPresetSelection(true);
            setLoadingStory(false);
            return;
          }

          //SetupUIstatefromloadedstory
          const lastPart =
            localStory.storyData.scene.parts[
              localStory.storyData.scene.parts.length - 1
            ];
          setStoryText(lastPart.content);
          setChoices({ choices: lastPart.choices || [] });

          const inputs =
            lastPart.choices?.reduce(
              (acc, choice) => ({ ...acc, [choice.text]: false }),
              {} as Record<string, boolean>
            ) || {};
          setInput(inputs);
          setStarted(true);
          setLoadingStory(false);
          return;
        }

        //Getauthtoken
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
          const errorData = await response
            .json()
            .catch(() => ({ error: "Unknown error" }));
          console.error("Story fetch failed:", errorData);
          throw new Error(errorData.error || "Failed to load story");
        }

        const { story } = await response.json();
        console.log("Story loaded:", story);
        setStoryDbId(story.id);

        //Checkifstorydataisencrypted
        let loadedStoryData: StoryData;
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
            loadedStoryData = await decryptStoryData(
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
          loadedStoryData = story.storyData;
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
          return;
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

    const updatedStoryData = { ...storyData };

    //Applypresettostorydata(skipifcustom)
    if (preset.id !== "custom") {
      if (preset.playerSummary)
        updatedStoryData.player_summary = preset.playerSummary;
      if (preset.stats.length > 0)
        updatedStoryData.stats = JSON.parse(JSON.stringify(preset.stats));
      if (preset.resources.length > 0)
        updatedStoryData.resources = JSON.parse(
          JSON.stringify(preset.resources)
        );
      if (preset.inventory.length > 0)
        updatedStoryData.inventory = JSON.parse(
          JSON.stringify(preset.inventory)
        );
      if (preset.authorNotes)
        updatedStoryData.author_notes = preset.authorNotes;
    }

    //Addstartingscenepart
    updatedStoryData.scene.parts.push({
      content: updatedStoryData.intro,
      imageUrl: "",
      user: false,
      role: "assistant",
      choices: [{ text: "StartStory" }],
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
          }
        }
      } catch (error) {
        console.error("Error saving preset:", error);
      }
    }

    //Updatelocalstate
    setStoryData(updatedStoryData);
    setStoryText(updatedStoryData.intro);
    setChoices({ choices: [{ text: "Start Story" }] });
    setInput({ StartStory: false });
    setStarted(true);
    setShowPresetSelection(false);
    setSelectedPreset(preset);

    addNotification(`Character preset "${preset.name}" applied! ✨`, "success");
  };

  //Savestoryprogresstodatabase(debounced)
  async function saveProgress(updatedStoryData: StoryData) {
    if (!storyDbId) return;

    //Clearexistingtimeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce: Only save after 3 seconds of no activity
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        logger.info("Saving story progress...");
        //Handlelocalstorysaving
        if (storyDbId.startsWith("local_")) {
          const { saveLocalStory } = await import(
            "@/app/misc/localStoryManager"
          );
          //Trimscenehistorybeforesavingtoreducedatasize
          const trimmedData = trimStoryData(updatedStoryData);
          await saveLocalStory(storyDbId, trimmedData);
          console.log("Local story saved");
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
            "⚠️ Please sign out and sign back in to enable encrypted story saving",
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
            "⚠ Failed to encrypt story data. Please sign out and sign back in.",
            "failure"
          );
          return; //Abortsaveonencryptionfailure
        }

        await fetch(`/api/stories/${storyDbId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            storyData: dataToSave,
          }),
        });
      } catch (error) {
        console.error("Error saving progress:", error);
        addNotification(
          "Failed to save story progress. Please try again.",
          "failure"
        );
      }
    }, 3000); //3seconddebounce
  }

  //Updatestorydatainstate
  function updateStoryData(updates: Partial<StoryData>) {
    if (!storyData) return;

    //Getcurrentmodelconfigfordynamicmemorycap
    const modelKey =
      typeof window !== "undefined"
        ? localStorage.getItem("aiModel") || "deep-seek/deepseek-chat"
        : "deep-seek/deepseek-chat";
    const modelConfig = getModelConfig(modelKey);

    // Dynamic memory cap: 1/4 of context window (approx 4 chars per token)
    const CHARS_PER_TOKEN = 4;
    const memory_cap = modelConfig.maxTokens * 0.25 * CHARS_PER_TOKEN;

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

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      addNotification("Session expired. Please sign in again.", "failure");
      setLoading(false);
      return;
    }

    //Build minimal payload for AI
    const MAX_CONTENT_LENGTH = 50000; //Increased limit per part

    //Getcurrentmodelconfigtoestimateneededcontext
    const modelKey =
      typeof window !== "undefined"
        ? localStorage.getItem("aiModel") || "deep-seek/deepseek-chat"
        : "deep-seek/deepseek-chat";
    const modelConfig = getModelConfig(modelKey);

    //Estimateneededcharacters(tokens*4).Sendabitmoretobesafe.
    const neededChars = modelConfig.maxTokens * 5;

    let currentChars = 0;
    const partsToSend = [];

    //Iteratebackwardstogatherenoughcontext
    for (let i = storyData.scene.parts.length - 1; i >= 0; i--) {
      const part = storyData.scene.parts[i];
      const content = part.content.substring(0, MAX_CONTENT_LENGTH);

      partsToSend.unshift({
        content: content,
        user: part.user,
        role: part.role,
        raw: part.raw,
      });

      currentChars += content.length;
      if (currentChars > neededChars) break;
    }

    const minimalStoryData: any = {
      story_name: storyData.story_name,
      premise: storyData.premise?.substring(0, 1500) || "",
      player_name: storyData.player_name,
      player_summary: storyData.player_summary?.substring(0, 800) || "",
      intro: storyData.intro?.substring(0, 1500) || "",
      stats: storyData.stats,
      resources: storyData.resources,
      inventory: storyData.inventory,
      achievements: storyData.achievements,
      momentum: storyData.momentum,
      maxMomentum: storyData.maxMomentum,
      points: storyData.points,
      plot_beats: storyData.plot_beats.map((beat) => ({
        title: beat.title.substring(0, 100),
        content: beat.content.substring(0, 300),
        fulfilled: beat.fulfilled,
      })),
      memory: storyData.memory, //Sendfullmemory,servertruncates
      lore: storyData.lore
        .filter((l) => l.on !== false)
        .map((l) => ({
          title: l.title.substring(0, 100),
          content: l.content.substring(0, 500),
          on: l.on,
        })),
      author_notes: storyData.author_notes?.substring(0, 1500) || "",
      player_notes: storyData.player_notes?.substring(0, 800) || "",
      chapters: storyData.chapters,
      currentChapter: storyData.currentChapter,
      scene: {
        parts: partsToSend,
      },
    };

    const payload = {
      storyData: minimalStoryData,
      userChoice: null, //Nospecificchoice,justcustomtext
      model:
        typeof window !== "undefined"
          ? localStorage.getItem("aiModel") || undefined
          : undefined,
      useRawContext:
        typeof window !== "undefined"
          ? localStorage.getItem("useRawContext") === "true"
          : false,
      openRouterKey:
        typeof window !== "undefined"
          ? localStorage.getItem("openRouterKey") || undefined
          : undefined,
    };

    const payloadSize = JSON.stringify(payload).length;
    console.log(
      `Custom input payload size: ${(payloadSize / 1024).toFixed(2)} KB`
    );
    logger.ai_request("Sending custom input to AI", {
      model: payload.model,
      payloadSize,
    });

    if (payloadSize > 4 * 1024 * 1024) {
      addNotification("⚠ Story data too large for generation.", "failure");
      console.error("Payload exceeds 4MB limit:", payloadSize);
      setLoading(false);
      return;
    }

    await fetch("/api/story/next", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          addNotification(
            `?Invalidresponsefromserver(expectedJSON)`,
            "failure"
          );
          setLoading(false);
          return;
        }

        const text = await res.text();
        if (!text || text.trim() === "") {
          addNotification(`⚠ Empty response from server`, "failure");
          setLoading(false);
          return;
        }

        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          console.error("Failed to parse response:", text);
          addNotification(`⚠ Invalid JSON response from server`, "failure");
          setLoading(false);
          return;
        }

        if (res.status === 402) {
          addNotification(`⚠ ${data.error}`, "failure");
          if (data.balance) {
            addNotification(
              `Your balance: ${data.balance.tradable} tradable, ${data.balance.locked} locked`,
              "info"
            );
          }
          setLoading(false);
          return;
        }

        if (res.status === 401) {
          addNotification(
            `??${data.error || "Authenticationrequired"}`,
            "failure"
          );
          setLoading(false);
          return;
        }

        if (!res.ok) {
          logger.error("AIrequestfailed", {
            status: res.status,
            error: data.error,
          });
          addNotification(
            `Error: ${data.error || "Failed to generate story"}`,
            "failure"
          );
          setLoading(false);
          return;
        }

        logger.ai_response("AI response received", {
          tokensDeducted: data.meta?.tokensDeducted,
          partLength: data.part.content.length,
          raw: data.part.raw || data.part.content,
          parsed: {
            content: data.part.content,
            choices: data.part.choices?.length || 0,
            commands: data.part.commands?.length || 0,
            memoryEntries: data.part.memoryEntries?.length || 0,
          },
        });

        if (data.meta?.tokensDeducted) {
          addNotification(
            `✨ Used ${data.meta.tokensDeducted} tokens`,
            "success"
          );
          if (data.meta.remainingBalance) {
            addNotification(
              `Balance:${data.meta.remainingBalance.total}tokensremaining(${data.meta.remainingBalance.tradable}tradable)`,
              "info"
            );
          }
        }

        if (data.part.commands && data.part.commands.length > 0) {
          processCommands(data.part.commands, storyData, addNotification);
        }

        if (data.part.memoryEntries && data.part.memoryEntries.length > 0) {
          logger.action("Memory entries added", {
            count: data.part.memoryEntries.length,
            entries: data.part.memoryEntries,
          });
          storyData.memory.push(...data.part.memoryEntries);
        }

        processLoreTriggers(storyData, addNotification);

        storyData.scene.parts.push(data.part);
        setStoryData({ ...storyData });
        setStoryText(data.part.content);
        setCanRetry(true);
        setChoices({ choices: data.part.choices || [] });
        setLoading(false);

        await saveProgress(storyData);
      })
      .catch((err) => {
        console.error("Custom input error:", err);
        addNotification(`⚠ Error generating story: ${err.message}`, "failure");
        setLoading(false);
      });
  }

  async function handleChoice() {
    if (!storyData) return;
    const choice = choices.choices.find((c) => input[c.text]);
    if (!choice) return;
    const key = choices.choices.indexOf(choice);

    logger.action("User selected choice", { choice: choice.text, index: key });

    if (!user) {
      addNotification("Please sign in to continue the story", "warning");
      return;
    }

    setLoading(true);

    //Handlemomentumspending
    if (momentumMode === "reroll" && storyData.momentum >= 1) {
      storyData.momentum--;
      logger.action("Momentum spent", {
        mode: "reroll",
        cost: 1,
        remaining: storyData.momentum,
      });
      addNotification(
        `⚡ Spent 1 Momentum for Reroll! (${storyData.momentum}/${storyData.maxMomentum} remaining)`,
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
        `⚡ Spent 2 Momentum for Guaranteed Success! (${storyData.momentum}/${storyData.maxMomentum} remaining)`,
        "success"
      );
    }

    let dice_roll = getSecureRandomInt(1, 100);
    logger.action("Initial dice roll", { roll: dice_roll });

    //Track all dice rolls for visualization
    const allDiceRolls: number[] = [dice_roll];

    //BuilddetailedRPG-stylechoicetextwithbrackets
    let choiceDetails: string[] = [];

    //Trackstatechangesfordisplay
    let itemQuantityBefore = 0;
    let itemQuantityAfter = 0;
    let itemBroken = false;
    let resourceUsedBefore = 0;
    let resourceUsedAfter = 0;
    let insufficientResource = false;
    let skillCheckResult = "";

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
          `📝 Matched "${choice.item_used}" → "${
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
          addNotification(
            `Used item: ${choice.item_used} (Advantage!)`,
            "info"
          );
          const second_roll = getSecureRandomInt(1, 100);
          allDiceRolls.push(second_roll);
          logger.action("Advantage roll from item", {
            item: choice.item_used,
            firstRoll: dice_roll,
            secondRoll: second_roll,
          });
          if (second_roll > dice_roll) {
            dice_roll = second_roll;
          }
        }

        if (momentumMode === "reroll") {
          // Reroll: Roll two more times and take the best
          const reroll1 = getSecureRandomInt(1, 100);
          const reroll2 = getSecureRandomInt(1, 100);
          allDiceRolls.push(reroll1, reroll2);
          const oldRoll = dice_roll;
          dice_roll = Math.max(dice_roll, reroll1, reroll2);
          logger.action("Momentum reroll (with item)", {
            oldRoll,
            reroll1,
            reroll2,
            finalRoll: dice_roll,
          });
          addNotification(
            `⚡ Reroll Used! Rolls: ${oldRoll}, ${reroll1}, ${reroll2} → Best: ${dice_roll}`,
            "success"
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
        addNotification(
          `Missing item: ${choice.item_used} (Disadvantage!)`,
          "warning"
        );
        const second_roll = getSecureRandomInt(1, 100);
        allDiceRolls.push(second_roll);
        logger.action("Disadvantage roll (missing item)", {
          item: choice.item_used,
          firstRoll: dice_roll,
          secondRoll: second_roll,
        });
        if (second_roll < dice_roll) {
          dice_roll = second_roll;
        }
        if (momentumMode === "reroll") {
          //Rerollstillhelpswithdisadvantage
          const reroll1 = getSecureRandomInt(1, 100);
          const reroll2 = getSecureRandomInt(1, 100);
          allDiceRolls.push(reroll1, reroll2);
          const oldRoll = dice_roll;
          dice_roll = Math.max(dice_roll, reroll1, reroll2);
          logger.action("Momentum reroll (missing item)", {
            oldRoll,
            reroll1,
            reroll2,
            finalRoll: dice_roll,
          });
          addNotification(
            `⚡ Reroll Used! Rolls: ${oldRoll}, ${reroll1}, ${reroll2} → Best: ${dice_roll}`,
            "success"
          );
        }
      }
    } else if (momentumMode === "reroll") {
      //Noitem-justreroll
      const reroll = getSecureRandomInt(1, 100);
      allDiceRolls.push(reroll);
      const oldRoll = dice_roll;
      if (reroll > dice_roll) {
        dice_roll = reroll;
      }
      logger.action("Momentum reroll (no item)", {
        oldRoll,
        reroll,
        finalRoll: dice_roll,
      });
      addNotification(
        `⚡ Reroll Used! Rolls: ${oldRoll}, ${reroll} → Best: ${dice_roll}`,
        "success"
      );
    }

    //Processresourceusage(resourceisautomaticallyatriskonskillcheckfailure)
    if (choice.resource_used) {
      // Try fuzzy matching first
      const matchResult = findResourceMatch(
        choice.resource_used,
        storyData.resources
      );
      const resource = matchResult?.item;

      // Log fuzzy match result
      if (matchResult && !matchResult.isExact) {
        logger.info("Fuzzy matched resource", {
          aiProvided: choice.resource_used,
          matched: matchResult.name,
          score: matchResult.score,
        });
        addNotification(
          `📝 Matched "${choice.resource_used}" → "${
            matchResult.name
          }" (${Math.round(matchResult.score * 100)}% match)`,
          "info"
        );
        // Update choice to use the exact matched name
        choice.resource_used = matchResult.name;
      }

      if (resource) {
        const dc = choice.skill_dc || 0;
        const requiredAmount = Math.max(5, Math.floor(dc / 10)); //DCï¿½10,minimum5

        resourceUsedBefore = resource.value;

        //Checkifplayerhasenoughresource
        if (resource.value < requiredAmount) {
          insufficientResource = true;
          const penalty = Math.max(5, Math.floor(dc / 10)); //DCï¿½10,minimum5
          logger.action("Insufficient resource", {
            resource: choice.resource_used,
            required: requiredAmount,
            available: resource.value,
            penalty,
          });
          addNotification(
            `⚠️ Insufficient ${resource.name}! Need ${requiredAmount}, have ${resource.value}. Roll penalty: -${penalty}`,
            "warning"
          );
        }
      } else {
        logger.warn("Resource not found", { resource: choice.resource_used });
        addNotification(
          `⚠️ Resource not found: ${choice.resource_used}`,
          "warning"
        );
      }
    }

    //Handleskillcheck
    if (choice.skill_used) {
      // Try fuzzy matching first
      const matchResult = findStatMatch(choice.skill_used, storyData.stats);
      const statValue = matchResult?.item.value || 0;

      // Log fuzzy match result
      if (matchResult && !matchResult.isExact) {
        logger.info("Fuzzy matched skill", {
          aiProvided: choice.skill_used,
          matched: matchResult.name,
          score: matchResult.score,
        });
        addNotification(
          `📝 Matched "${choice.skill_used}" → "${
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
        addNotification(`⚠️ Skill not found: ${choice.skill_used}`, "warning");
      }

      const dc = choice.skill_dc || 0;

      //Calculatedicepenaltyifinsufficientresource
      const dicePenalty = insufficientResource
        ? Math.max(5, Math.floor(dc / 10))
        : 0;
      const effectiveDiceRoll = Math.max(1, dice_roll - dicePenalty);

      //Handleguaranteedsuccess
      if (momentumMode === "guarantee") {
        skillCheckResult = "success";
        logger.action("Skill check (Guaranteed)", {
          skill: choice.skill_used,
          dc,
        });
        addNotification(
          `✓ Guaranteed Success! (${choice.skill_used}: Auto-success with 2 Momentum)`,
          "success"
        );
      } else {
        const total = effectiveDiceRoll + statValue;
        const dc_passed = dice_roll === 100 || total >= dc;

        logger.action("Skill check result", {
          skill: choice.skill_used,
          dc,
          roll: dice_roll,
          stat: statValue,
          penalty: dicePenalty,
          total,
          passed: dc_passed,
        });

        // Show dice visualizer
        const usedItem = choice.item_used
          ? storyData.inventory.find((i) => i.name === choice.item_used)
          : null;
        const hasItemAdvantage =
          !!usedItem && (usedItem.type || "normal") !== "misc";
        const hasItemDisadvantage = !!(choice.item_used && !usedItem);

        setDiceRoll({
          show: true,
          rolls: allDiceRolls,
          finalRoll: dice_roll,
          skillName: choice.skill_used,
          skillBonus: statValue,
          dc,
          isSuccess: dc_passed,
          isCritical: dice_roll === 100,
          hasAdvantage: hasItemAdvantage,
          hasDisadvantage: hasItemDisadvantage,
        });

        // Wait for animation to complete before showing notification
        await new Promise((resolve) => setTimeout(resolve, 4000));
        setDiceRoll(null);

        if (dc_passed) {
          skillCheckResult = "success";
          const penaltyText = insufficientResource
            ? ` (-${dicePenalty} dice penalty from insufficient resource)`
            : "";
          addNotification(
            `✓ Check Passed! (${choice.skill_used}: ${dice_roll}${
              insufficientResource ? ` - ${dicePenalty}` : ""
            } + ${statValue} = ${total} ≥ ${dc})${penaltyText}`,
            "success"
          );

          //Recoverresourceonsuccess
          if (choice.resource_used) {
            const resource = storyData.resources.find(
              (r) => r.name === choice.resource_used
            );
            if (resource) {
              const recovery = Math.max(1, Math.floor(dc / 20)); //DCï¿½20,minimum1
              const beforeRecovery = resource.value;
              resource.value = Math.min(
                resource.maxValue,
                resource.value + recovery
              );
              resourceUsedAfter = resource.value;
              logger.action("Resource recovered", {
                resource: choice.resource_used,
                amount: recovery,
                newTotal: resource.value,
              });
              addNotification(
                `✓ ${resource.name} recovered: ${beforeRecovery} → ${resourceUsedAfter} (+${recovery})`,
                "success"
              );
            }
          }

          //Earnmomentumonsuccess(notwhenusingguaranteeorreroll)
          if (momentumMode === "none") {
            if (dice_roll === 100) {
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
                addNotification(
                  `✨ Critical Success! Earned ${earned} Momentum! (${storyData.momentum}/${storyData.maxMomentum})`,
                  "success"
                );
              }
            } else if (total >= dc + 20) {
              //Strongsuccess(beatDCby20+):earn1momentum
              if (storyData.momentum < storyData.maxMomentum) {
                storyData.momentum++;
                logger.action("Momentum earned (Strong Success)", {
                  earned: 1,
                  newTotal: storyData.momentum,
                });
                addNotification(
                  `✓ Strong Success! Earned 1 Momentum! (${storyData.momentum}/${storyData.maxMomentum})`,
                  "success"
                );
              }
            }
          }
        } else {
          skillCheckResult = "failure";
          const penaltyText = insufficientResource
            ? ` (-${dicePenalty} dice penalty from insufficient resource)`
            : "";
          addNotification(
            `✗ Check Failed! (${choice.skill_used}: ${dice_roll}${
              insufficientResource ? ` - ${dicePenalty}` : ""
            } + ${statValue} = ${total} < ${dc})${penaltyText}`,
            "failure"
          );

          // On failure: Lose additional resource if one was used (DC-based penalty)
          if (choice.resource_used) {
            const resource = storyData.resources.find(
              (r) => r.name === choice.resource_used
            );
            if (resource) {
              const lossBefore = resource.value;
              const penalty = Math.max(5, Math.floor(dc / 10)); //DCï¿½10,minimum5
              resource.value = Math.max(0, resource.value - penalty);
              const lossAfter = resource.value;
              logger.action("Resource lost (Failure)", {
                resource: choice.resource_used,
                penalty,
                newTotal: resource.value,
              });
              addNotification(
                `⚠️ ${resource.name} lost from failure: ${lossBefore} → ${lossAfter} (-${penalty})`,
                "failure"
              );
            }
          }

          //Handleitembreakageonfailure(onlyfor'normal'typeitems)
          if (choice.item_used) {
            const item = storyData.inventory.find(
              (i) => i.name === choice.item_used
            );
            const itemType = item?.type || "normal";

            //Onlynormalitemsbreakonfailure(notconsumable,story,ormisc)
            if (itemType === "normal" && item) {
              const itemIndex = storyData.inventory.findIndex(
                (i) => i.name === choice.item_used
              );
              if (
                itemIndex !== -1 &&
                itemQuantityAfter === itemQuantityBefore
              ) {
                //Onlybreakifnotalreadyconsumed
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
                addNotification(
                  `${choice.item_used}brokefromfailure!`,
                  "failure"
                );
              }
            }
          }
        }
      }

      //Buildskillcheckline
      const insufficientText = insufficientResource ? "??NOSKILLBONUS" : "";
      choiceDetails.push(
        `[${choice.skill_used}:${skillCheckResult}${insufficientText}]`
      );
    }

    //Builditemusageline
    if (choice.item_used && itemQuantityBefore > 0) {
      if (itemBroken) {
        choiceDetails.push(
          `[ItemUsed:${choice.item_used};x${itemQuantityBefore}?broken]`
        );
      } else if (choice.item_loss) {
        choiceDetails.push(
          `[ItemUsed:${choice.item_used};x${itemQuantityBefore}?${itemQuantityAfter}]`
        );
      } else {
        choiceDetails.push(
          `[ItemUsed:${choice.item_used};x${itemQuantityBefore}]`
        );
      }
    }

    //Buildresourceusageline(includesanyadditionallossfromfailure)
    if (choice.resource_used && resourceUsedBefore > 0) {
      const resource = storyData.resources.find(
        (r) => r.name === choice.resource_used
      );
      const maxValue = resource?.maxValue || 100;
      const currentValue = resource?.value || 0;
      choiceDetails.push(
        `[Resource:${choice.resource_used}${resourceUsedBefore}?${currentValue}/${maxValue}]`
      );
    }

    //  const ructfinalchoicetext
    let text = "";
    if (choiceDetails.length > 0) {
      text = choiceDetails.join("\n") + "\n";
    }
    text += ">" + choices.choices[key].text;
    console.log("Final choice text:", text);
    //Resetmomentummodeafteruse
    setMomentumMode("none");

    storyData.scene.parts.push({
      content: text,
      imageUrl: "",
      user: true,
      role: "user",
      choices: [...choices.choices],
    });

    setChoices({ choices: [] });

    //ProcessLoretriggersafteruserchoice
    processLoreTriggers(storyData, addNotification);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      addNotification("Session expired. Please sign in again.", "failure");
      setLoading(false);
      return;
    }

    //Build minimal payload - only send what the AI needs to generate the next part
    //TheAIusesbuildMessages()whichonlyneedsrecentcontext+currentstate
    const MAX_CONTENT_LENGTH = 50000;

    //Getcurrentmodelconfigtoestimateneededcontext
    const modelKey =
      typeof window !== "undefined"
        ? localStorage.getItem("aiModel") || "deep-seek/deepseek-chat"
        : "deep-seek/deepseek-chat";
    const modelConfig = getModelConfig(modelKey);

    //Estimateneededcharacters(tokens*4).Sendabitmoretobesafe.
    const neededChars = modelConfig.maxTokens * 5;

    let currentChars = 0;
    const partsToSend = [];

    //Iteratebackwardstogatherenoughcontext
    for (let i = storyData.scene.parts.length - 1; i >= 0; i--) {
      const part = storyData.scene.parts[i];
      const content = part.content.substring(0, MAX_CONTENT_LENGTH);

      partsToSend.unshift({
        content: content,
        user: part.user,
        role: part.role,
        raw: part.raw,
      });

      currentChars += content.length;
      if (currentChars > neededChars) break;
    }

    //Buildminimalstorydataobject
    const minimalStoryData: any = {
      story_name: storyData.story_name,
      premise: storyData.premise?.substring(0, 1500) || "",
      player_name: storyData.player_name,
      player_summary: storyData.player_summary?.substring(0, 800) || "",
      intro: storyData.intro?.substring(0, 1500) || "",
      //Currentgamestate-sendas-is
      stats: storyData.stats,
      resources: storyData.resources,
      inventory: storyData.inventory,
      achievements: storyData.achievements,
      momentum: storyData.momentum,
      maxMomentum: storyData.maxMomentum,
      points: storyData.points,
      //Trimmednarrativecontext
      plot_beats: storyData.plot_beats.map((beat) => ({
        title: beat.title.substring(0, 100),
        content: beat.content.substring(0, 300),
        fulfilled: beat.fulfilled,
      })),
      memory: storyData.memory, //Sendfullmemory
      lore: storyData.lore
        .filter((l) => l.on !== false) //OnlysendLorethatisON
        .map((l) => ({
          title: l.title.substring(0, 100),
          content: l.content.substring(0, 500),
          on: l.on,
        })),
      author_notes: storyData.author_notes?.substring(0, 1500) || "",
      player_notes: storyData.player_notes?.substring(0, 800) || "",
      //Chapterinfo
      chapters: storyData.chapters,
      currentChapter: storyData.currentChapter,
      //Recentscenepartsonly
      scene: {
        parts: partsToSend,
      },
    };

    const payload = {
      storyData: minimalStoryData,
      userChoice: null, //Nospecificchoice,justcustomtext
      model:
        typeof window !== "undefined"
          ? localStorage.getItem("aiModel") || undefined
          : undefined,
      useRawContext:
        typeof window !== "undefined"
          ? localStorage.getItem("useRawContext") === "true"
          : false,
      openRouterKey:
        typeof window !== "undefined"
          ? localStorage.getItem("openRouterKey") || undefined
          : undefined,
    };

    const payloadSize = JSON.stringify(payload).length;
    console.log(`Payload size: ${(payloadSize / 1024).toFixed(2)} KB`);
    logger.ai_request("Sending choice to AI", {
      model: payload.model,
      payloadSize,
    });

    if (payloadSize > 4 * 1024 * 1024) {
      addNotification("⚠ Story data too large for generation.", "failure");
      console.error("Payload exceeds 4MB limit:", payloadSize);
      setLoading(false);
      return;
    }

    await fetch("/api/story/next", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        //CheckifresponsehascontentbeforeparsingJSON
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          addNotification(
            `?Invalidresponsefromserver(expectedJSON)`,
            "failure"
          );
          setLoading(false);
          setChoices({
            choices:
              storyData.scene.parts[storyData.scene.parts.length - 1].choices ||
              [],
          });
          return;
        }

        const text = await res.text();
        if (!text || text.trim() === "") {
          addNotification(`⚠ Empty response from server`, "failure");
          setLoading(false);
          setChoices({
            choices:
              storyData.scene.parts[storyData.scene.parts.length - 1].choices ||
              [],
          });
          return;
        }

        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          addNotification(`⚠ Invalid JSON response`, "failure");
          setLoading(false);
          setChoices({
            choices:
              storyData.scene.parts[storyData.scene.parts.length - 1].choices ||
              [],
          });
          return;
        }

        if (!res.ok) {
          addNotification(
            `Error: ${data.error || "Failed to generate story"}`,
            "failure"
          );
          setLoading(false);
          setCanRetry(true);
          setChoices({
            choices:
              storyData.scene.parts[storyData.scene.parts.length - 1].choices ||
              [],
          });
          return;
        }

        //Updatetokenbalance
        if (data.meta?.remainingBalance?.total !== undefined) {
          setTokenBalance(data.meta.remainingBalance.total);
        }

        logger.ai_response("AI response received (choice)", {
          tokensDeducted: data.meta?.tokensDeducted,
          partLength: data.part.content.length,
          raw: data.part.raw || data.part.content,
          parsed: {
            content: data.part.content,
            choices: data.part.choices?.length || 0,
            commands: data.part.commands?.length || 0,
            memoryEntries: data.part.memoryEntries?.length || 0,
          },
        });

        if (data.part.commands && data.part.commands.length > 0) {
          processCommands(data.part.commands, storyData, addNotification);
        }

        if (data.part.memoryEntries && data.part.memoryEntries.length > 0) {
          logger.action("Memory entries added", {
            count: data.part.memoryEntries.length,
            entries: data.part.memoryEntries,
          });
          storyData.memory.push(...data.part.memoryEntries);
        }

        //ProcessLoretriggersbasedonnew content
        processLoreTriggers(storyData, addNotification);

        storyData.scene.parts.push(data.part);

        //Checkforchaptercompletionandawardpoints
        if (data.part.content.includes("!!!ENDCHAPTER!!!")) {
          const currentChapter = storyData.chapters.length;
          if (!storyData.earnedPointsFromChapters.includes(currentChapter)) {
            storyData.earnedPointsFromChapters.push(currentChapter);
            storyData.points += UPGRADE_COSTS.CHAPTER_REWARD;
            addNotification(
              `??Chapter${currentChapter}Complete!Earned${UPGRADE_COSTS.CHAPTER_REWARD}points!Total:${storyData.points}`,
              "success"
            );
          }
        }

        setStoryData({ ...storyData });
        setStoryText(data.part.content);
        setChoices({ choices: data.part.choices || [] });
        setLoading(false);
        setCanRetry(true); //EnableretryaftersuccessfulAIresponse

        //Saveprogresstodatabase
        await saveProgress(storyData);
      })
      .catch((error) => {
        console.error("Error fetching next story part:", error);
        addNotification("Network error. Please try again.", "failure");
        setLoading(false);
        setChoices({
          choices:
            storyData.scene.parts[storyData.scene.parts.length - 1].choices ||
            [],
        });
      });
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

    //Regeneratefromcurrentstate
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      addNotification("Session expired. Please sign in again.", "failure");
      setLoading(false);
      return;
    }

    //Build minimal payload
    const MAX_CONTENT_LENGTH = 50000;

    //Getcurrentmodelconfigtoestimateneededcontext
    const modelKey =
      typeof window !== "undefined"
        ? localStorage.getItem("aiModel") || "deep-seek/deepseek-chat"
        : "deep-seek/deepseek-chat";
    const modelConfig = getModelConfig(modelKey);

    //Estimateneededcharacters(tokens*4).Sendabitmoretobesafe.
    const neededChars = modelConfig.maxTokens * 5;

    let currentChars = 0;
    const partsToSend = [];

    //Iteratebackwardstogatherenoughcontext
    for (let i = storyData.scene.parts.length - 1; i >= 0; i--) {
      const part = storyData.scene.parts[i];
      const content = part.content.substring(0, MAX_CONTENT_LENGTH);

      partsToSend.unshift({
        content: content,
        user: part.user,
        role: part.role,
        raw: part.raw,
      });

      currentChars += content.length;
      if (currentChars > neededChars) break;
    }

    const minimalStoryData: any = {
      story_name: storyData.story_name,
      premise: storyData.premise?.substring(0, 1500) || "",
      player_name: storyData.player_name,
      player_summary: storyData.player_summary?.substring(0, 800) || "",
      intro: storyData.intro?.substring(0, 1500) || "",
      stats: storyData.stats,
      resources: storyData.resources,
      inventory: storyData.inventory,
      achievements: storyData.achievements,
      momentum: storyData.momentum,
      maxMomentum: storyData.maxMomentum,
      points: storyData.points,
      plot_beats: storyData.plot_beats.map((beat) => ({
        title: beat.title.substring(0, 100),
        content: beat.content.substring(0, 300),
        fulfilled: beat.fulfilled,
      })),
      memory: storyData.memory, //Sendfullmemory
      lore: storyData.lore
        .filter((l) => l.on !== false) //OnlysendLorethatisON
        .map((l) => ({
          title: l.title.substring(0, 100),
          content: l.content.substring(0, 500),
          on: l.on,
        })),
      author_notes: storyData.author_notes?.substring(0, 1500) || "",
      player_notes: storyData.player_notes?.substring(0, 800) || "",
      chapters: storyData.chapters,
      currentChapter: storyData.currentChapter,
      scene: { parts: partsToSend },
    };

    const payload = {
      storyData: minimalStoryData,
      model:
        typeof window !== "undefined"
          ? localStorage.getItem("aiModel") || undefined
          : undefined,
      useRawContext:
        typeof window !== "undefined"
          ? localStorage.getItem("useRawContext") === "true"
          : false,
    };

    await fetch("/api/story/next", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          addNotification(`⚠ Invalid response from server`, "failure");
          setLoading(false);
          setCanRetry(true);
          return;
        }

        const text = await res.text();
        if (!text || text.trim() === "") {
          addNotification(`⚠ Empty response from server`, "failure");
          setLoading(false);
          setCanRetry(true);
          return;
        }

        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          addNotification(`⚠ Invalid JSON response`, "failure");
          setLoading(false);
          setCanRetry(true);
          return;
        }

        if (!res.ok) {
          addNotification(
            `Error: ${data.error || "Failed to generate story"}`,
            "failure"
          );
          setLoading(false);
          setCanRetry(true);
          return;
        }

        //Updatetokenbalance
        if (data.meta?.remainingBalance?.total !== undefined) {
          setTokenBalance(data.meta.remainingBalance.total);
        }

        logger.ai_response("AI response received (retry)", {
          tokensDeducted: data.meta?.tokensDeducted,
          partLength: data.part.content.length,
          raw: data.part.raw || data.part.content,
          parsed: {
            content: data.part.content,
            choices: data.part.choices?.length || 0,
            commands: data.part.commands?.length || 0,
            memoryEntries: data.part.memoryEntries?.length || 0,
          },
        });

        if (data.part.commands && data.part.commands.length > 0) {
          processCommands(data.part.commands, storyData, addNotification);
        }

        if (data.part.memoryEntries && data.part.memoryEntries.length > 0) {
          logger.action("Memory entries added", {
            count: data.part.memoryEntries.length,
            entries: data.part.memoryEntries,
          });
          storyData.memory.push(...data.part.memoryEntries);
        }

        //ProcessLoretriggersbasedonnew content
        processLoreTriggers(storyData, addNotification);
        storyData.scene.parts.push(data.part);

        if (data.part.content.includes("!!!ENDCHAPTER!!!")) {
          const currentChapter = storyData.chapters.length;
          if (!storyData.earnedPointsFromChapters.includes(currentChapter)) {
            storyData.earnedPointsFromChapters.push(currentChapter);
            storyData.points += UPGRADE_COSTS.CHAPTER_REWARD;
            addNotification(
              `??Chapter${currentChapter}Complete!Earned${UPGRADE_COSTS.CHAPTER_REWARD}points!Total:${storyData.points}`,
              "success"
            );
          }
        }

        setStoryData({ ...storyData });
        setStoryText(data.part.content);
        setChoices({ choices: data.part.choices || [] });
        setLoading(false);
        setCanRetry(true);
        addNotification("✓ Response regenerated", "success");

        await saveProgress(storyData);
      })
      .catch((error) => {
        console.error("Error retrying story:", error);
        addNotification("Network error. Please try again.", "failure");
        setLoading(false);
        setCanRetry(true);
      });
  }

  async function handlePurchase(cost: number, callback: () => void) {
    if (!storyData) return;

    if (storyData.points >= cost) {
      storyData.points -= cost;
      callback(); //Execute the upgrade
      setStoryData({ ...storyData });
      addNotification(
        `✓ Upgrade purchased! (${storyData.points} points remaining)`,
        "success"
      );
      await saveProgress(storyData);
    } else {
      addNotification(
        `⚠ Not enough points! Need ${cost}, have ${storyData.points}`,
        "failure"
      );
    }
  }

  if (loadingStory) {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900 font-sans py-8 px-4 sm:px-8">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-600 mx-auto"></div>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
              Loading your story...
            </p>
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
      <div className="min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900 font-sans py-8 px-4 sm:px-8">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Story not found
            </p>
            <button
              onClick={() => router.push("/explorer")}
              className="mt-4 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
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
      <div className="min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900 font-sans py-8 px-4 sm:px-8">
        <div className="max-w-4xl mx-auto">
          {/*GameOverHeader*/}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-gray-700 mb-6 text-center">
            <h1 className="text-5xl font-bold mb-4 flex items-center justify-center gap-4">
              <DynamicIcon name="Skull" className="w-12 h-12" />
              Game Over{""}
              <DynamicIcon name="Skull" className="w-12 h-12" />
            </h1>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              {storyData.story_name}
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              {storyData.player_name}'s journey has concluded
            </p>
          </div>

          {/*StatsSummary*/}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-gray-700 mb-6">
            <h3 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-2">
              <DynamicIcon name="BarChart2" className="w-8 h-8" />
              Final Statistics
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                <div className="flex items-center gap-2 mb-2">
                  <DynamicIcon name="Trophy" className="w-8 h-8" />
                  <span className="text-lg font-semibold text-gray-900 dark:text-white">
                    Achievements
                  </span>
                </div>
                <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                  {achievedCount}/{totalAchievements}
                </div>
                <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  {totalAchievements > 0
                    ? Math.round((achievedCount / totalAchievements) * 100)
                    : 0}
                  %Complete
                </div>
              </div>

              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-2">
                  <DynamicIcon name="BookOpen" className="w-8 h-8" />
                  <span className="text-lg font-semibold text-gray-900 dark:text-white">
                    Story Beats
                  </span>
                </div>
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                  {completedBeats}/{totalBeats}
                </div>
                <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  {totalBeats > 0
                    ? Math.round((completedBeats / totalBeats) * 100)
                    : 0}
                  %Complete
                </div>
              </div>

              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2 mb-2">
                  <DynamicIcon name="Target" className="w-8 h-8" />
                  <span className="text-lg font-semibold text-gray-900 dark:text-white">
                    Quests
                  </span>
                </div>
                <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                  {completedQuests}/{totalQuests}
                </div>
                <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  {totalQuests > 0
                    ? Math.round((completedQuests / totalQuests) * 100)
                    : 0}
                  %Complete
                </div>
              </div>

              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <div className="flex items-center gap-2 mb-2">
                  <DynamicIcon name="Coins" className="w-8 h-8" />
                  <span className="text-lg font-semibold text-gray-900 dark:text-white">
                    Total Points
                  </span>
                </div>
                <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">
                  {storyData.points}
                </div>
                <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  Progression Points Earned
                </div>
              </div>
            </div>
          </div>

          {/*RecentAchievements*/}
          {achievedCount > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-gray-700 mb-6">
              <h3 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-2">
                <DynamicIcon name="Trophy" className="w-8 h-8" />
                Achievements Earned
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {storyData.achievements
                  .filter((a) => a.dateAchieved)
                  .map((achievement, idx) => (
                    <div
                      key={idx}
                      className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800"
                    >
                      <div className="flex items-start gap-3">
                        <DynamicIcon
                          name={achievement.symbol}
                          className="w-8 h-8"
                        />
                        <div>
                          <div className="font-bold text-gray-900 dark:text-white">
                            {achievement.title}
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            {achievement.description}
                          </div>
                          <div className="text-xs text-amber-600 dark:text-amber-400 font-semibold mt-1">
                            +{achievement.points} points
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/*ActionButtons*/}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-gray-700">
            <h3 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white text-center">
              What'sNext?
            </h3>
            <div className="gridgrid-cols-1sm:grid-cols-2gap-4">
              <button
                onClick={() => {
                  setConfirmDialog({
                    isOpen: true,
                    title: "ReplayStory",
                    message:
                      "Startthisadventurefromthebeginning?Allprogresswillbelost.",
                    icon: "RotateCcw",
                    confirmText: "Replay",
                    confirmButtonClass: "bg-blue-600hover:bg-blue-700",
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

                        await fetch(`/api/stories/${storyDbId}`, {
                          method: "PATCH",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${session.access_token}`,
                          },
                          body: JSON.stringify({ storyData: resetStoryData }),
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
                className="px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-md flex items-center justify-center gap-2"
              >
                <DynamicIcon name="RotateCcw" className="w-8 h-8" />
                <div className="text-left">
                  <div>Replay Story</div>
                  <div className="text-xs opacity-80">
                    Start from the beginning
                  </div>
                </div>
              </button>

              <button
                onClick={() => {
                  setConfirmDialog({
                    isOpen: true,
                    title: "New Game Plus",
                    message:
                      "Start a New Game Plus run? You'll keep all achievements, stats, resources, and items, plus earn bonus rewards!",
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

                        await fetch(`/api/stories/${storyDbId}`, {
                          method: "PATCH",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${session.access_token}`,
                          },
                          body: JSON.stringify({ storyData: ngPlusStoryData }),
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
                className="px-6 py-4 bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-lg transition-colors shadow-md flex items-center justify-center gap-2"
              >
                <DynamicIcon name="Star" className="w-8 h-8" />
                <div className="text-left">
                  <div>New Game Plus</div>
                  <div className="text-xs opacity-80">
                    Keep achievements + bonuses
                  </div>
                </div>
              </button>

              <button
                onClick={() => router.push("/library")}
                className="px-6 py-4 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors shadow-md flex items-center justify-center gap-2"
              >
                <DynamicIcon name="Library" className="w-8 h-8" />
                <div className="text-left">
                  <div>Return to Library</div>
                  <div className="text-xs opacity-80">
                    View all your stories
                  </div>
                </div>
              </button>

              <button
                onClick={() => router.push("/explorer")}
                className="px-6 py-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors shadow-md flex items-center justify-center gap-2"
              >
                <DynamicIcon name="Map" className="w-8 h-8" />
                <div className="text-left">
                  <div>Explore Adventures</div>
                  <div className="text-xs opacity-80">
                    Start a new adventure
                  </div>
                </div>
              </button>
            </div>

            {storyData.newGamePlusCount && storyData.newGamePlusCount > 0 && (
              <div className="mt-6 p-4 bg-linear-to-r from-amber-50 to-purple-50 dark:from-amber-900/20 dark:to-purple-900/20 rounded-lg border border-amber-200 dark:border-amber-800 text-center">
                <div className="font-bold text-lg text-amber-900 dark:text-amber-200 flex items-center justify-center gap-2">
                  <DynamicIcon name="Star" className="w-5 h-5" />
                  New Game Plus: Run #{storyData.newGamePlusCount}
                </div>
                <div className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  Completed {storyData.newGamePlusCount}
                  {""}
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
      <div className="min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900 font-sans py-8 px-4 sm:px-8">
        <div className="max-w-4xl mx-auto">
          {/*Header*/}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700 mb-6">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2">
              {storyData.story_name}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Choose your character preset to begin your adventure
            </p>
          </div>

          {/*PresetSelection*/}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white flex items-center gap-2">
              <DynamicIcon name="Users" className="w-8 h-8" />
              Select Your Character
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Choose a character archetype to start with pre-configured stats,
              items, and resources, or create your own custom character.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {availablePresets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handlePresetSelect(preset)}
                  className={`border-2 rounded-xl p-4 text-left transition-all hover:shadow-lg ${
                    preset.id === "custom"
                      ? "border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20 hover:border-purple-400 dark:hover:border-purple-600"
                      : "border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/30 hover:border-purple-400 dark:hover:border-purple-600"
                  }`}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <DynamicIcon name={preset.icon} className="w-8 h-8" />
                    <div className="flex-1">
                      <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                        {preset.name}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {preset.description}
                      </p>
                    </div>
                  </div>

                  {preset.id !== "custom" && (
                    <div className="flex flex-wrap gap-2 text-xs">
                      {preset.stats && preset.stats.length > 0 && (
                        <span className="px-2 py-1 bg-blue-200 dark:bg-blue-800/50 text-blue-800 dark:text-blue-200 rounded-full">
                          {preset.stats.length} Stats
                        </span>
                      )}
                      {preset.resources && preset.resources.length > 0 && (
                        <span className="px-2 py-1 bg-green-200 dark:bg-green-800/50 text-green-800 dark:text-green-200 rounded-full">
                          {preset.resources.length} Resources
                        </span>
                      )}
                      {preset.inventory && preset.inventory.length > 0 && (
                        <span className="px-2 py-1 bg-yellow-200 dark:bg-yellow-800/50 text-yellow-800 dark:text-yellow-200 rounded-full">
                          {preset.inventory.length} Items
                        </span>
                      )}
                    </div>
                  )}

                  {preset.id === "custom" && (
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="px-2 py-1 bg-purple-200 dark:bg-purple-800/50 text-purple-800 dark:text-purple-200 rounded-full">
                        Default Stats
                      </span>
                      <span className="px-2 py-1 bg-purple-200 dark:bg-purple-800/50 text-purple-800 dark:text-purple-200 rounded-full">
                        Starting Items
                      </span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/*BackButton*/}
          <div className="mt-6">
            <button
              onClick={() => router.push("/library")}
              className="px-6 py-3 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 hover:border-purple-500 dark:hover:border-purple-400 text-gray-900 dark:text-white font-semibold rounded-lg transition-colors shadow-md flex items-center gap-2"
            >
              <DynamicIcon name="ArrowLeft" className="w-5 h-5" />
              Back to Library
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900 font-sans py-8 px-4 sm:px-8 pt-24">
      <main className="flex gap-6 w-full max-w-4xl mx-auto flex-col">
        {/*StoryHeader*/}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl sm:text-4xl font-bold bg-linear-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              {storyData.story_name}
            </h1>
            {tokenBalance !== null && (
              <div className="text-xl sm:text-2xl font-semibold text-yellow-500 dark:text-yellow-400 flex items-center gap-2">
                <DynamicIcon name="Coins" className="w-6 h-6" />
                <span>{tokenBalance}</span>
              </div>
            )}
          </div>
        </div>
        {/*Buttonsfornavigationandpages*/}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-4 sm:p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex flex-row flex-wrap items-center justify-center sm:justify-start gap-3">
            <button
              onClick={() => setCurrentState(StoryState.STORY)}
              className={`px-4 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-semibold rounded-lg transition-all shadow-md flex items-center gap-2 ${
                currentState === StoryState.STORY
                  ? "bg-linear-to-r from-gray-700 to-gray-900 text-white ring-2 ring-gray-400 shadow-lg"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              <DynamicIcon name="BookOpen" className="w-5 h-5" />
              Story
            </button>
            <button
              onClick={() => setCurrentState(StoryState.STATS)}
              className={`px-4 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-semibold rounded-lg transition-all shadow-md flex items-center gap-2 ${
                currentState === StoryState.STATS
                  ? "bg-linear-to-r from-blue-600 to-blue-800 text-white ring-2 ring-blue-400 shadow-lg"
                  : "bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900/50"
              }`}
            >
              <DynamicIcon name="BarChart2" className="w-5 h-5" />
              Stats
            </button>
            <button
              onClick={() => setCurrentState(StoryState.LORE)}
              className={`px-4 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-semibold rounded-lg transition-all shadow-md flex items-center gap-2 ${
                currentState === StoryState.LORE
                  ? "bg-linear-to-r from-purple-600 to-purple-800 text-white ring-2 ring-purple-400 shadow-lg"
                  : "bg-purple-50 dark:bg-purple-900/30 text-purple-900 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900/50"
              }`}
            >
              <DynamicIcon name="Scroll" className="w-5 h-5" />
              Lore
            </button>
            <button
              onClick={() => setCurrentState(StoryState.QUESTS)}
              className={`px-4 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-semibold rounded-lg transition-all shadow-md flex items-center gap-2 ${
                currentState === StoryState.QUESTS
                  ? "bg-linear-to-r from-blue-600 to-blue-800 text-white ring-2 ring-blue-400 shadow-lg"
                  : "bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900/50"
              }`}
            >
              <DynamicIcon name="Target" className="w-5 h-5" />
              Quests
            </button>
            <button
              onClick={() => setCurrentState(StoryState.UPGRADES)}
              className={`px-4 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-semibold rounded-lg transition-all shadow-md flex items-center gap-2 ${
                currentState === StoryState.UPGRADES
                  ? "bg-linear-to-r from-yellow-600 to-yellow-800 text-white ring-2 ring-yellow-400 shadow-lg"
                  : "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-900 dark:text-yellow-200 hover:bg-yellow-100 dark:hover:bg-yellow-900/50"
              }`}
            >
              <DynamicIcon name="ShoppingCart" className="w-5 h-5" />
              Upgrades
            </button>
            <button
              onClick={() => setCurrentState(StoryState.MENU)}
              className={`px-4 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-semibold rounded-lg transition-all shadow-md flex items-center gap-2 ${
                currentState === StoryState.MENU
                  ? "bg-linear-to-r from-green-600 to-green-800 text-white ring-2 ring-green-400 shadow-lg"
                  : "bg-green-50 dark:bg-green-900/30 text-green-900 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900/50"
              }`}
            >
              <DynamicIcon name="Settings" className="w-5 h-5" />
              Menu
            </button>
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
            momentumMode={momentumMode}
            onMomentumModeChange={setMomentumMode}
            handleChoice={handleChoice}
            handleSelect={handleSelect}
            onCustomInput={handleCustomInput}
            onRetry={handleRetry}
            canRetry={canRetry}
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
      {/*DiceVisualizer*/}
      {diceRoll?.show && (
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
