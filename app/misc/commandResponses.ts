/**
 * Command response generation for AI feedback loop.
 *
 * When the AI sends commands like `/add_quest`, `/give_item`, etc.,
 * this module executes them and generates responses describing what happened.
 * These responses are sent back to the AI in the next message, allowing it to:
 * - See if commands succeeded or failed
 * - Self-correct typos or invalid references
 * - Adjust narrative based on actual game state changes
 * - Understand validation results (fuzzy matching, resource checks, etc.)
 */

import type { StoryData, CommandResponse } from "./structs";
import {
  findItemMatch,
  findResourceMatch,
  findStatMatch,
  findAchievementMatch,
  findQuestMatch,
  findRelationshipMatch,
} from "./fuzzyMatch";
import { logger } from "./logger";

/**
 * Execute a single command and generate a response.
 * Returns CommandResponse with success status and human-readable message.
 */
export function executeCommandWithResponse(
  command: string,
  storyData: StoryData
): CommandResponse | null {
  const trimmed = command.trim();
  const timestamp = Date.now();

  // === QUEST COMMANDS ===

  // /create_quest: title | short description | full description | points
  const createQuestMatch = trimmed.match(
    /^\/create_quest:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(\d+)$/i
  );
  if (createQuestMatch) {
    const title = createQuestMatch[1].trim();
    const shortDesc = createQuestMatch[2].trim();
    const points = parseInt(createQuestMatch[4], 10);

    if (!storyData.quests) storyData.quests = [];

    const existing = storyData.quests.find((q) => q.title === title);
    if (existing) {
      return {
        command: trimmed,
        success: false,
        message: `Quest "${title}" already exists`,
        timestamp,
      };
    }

    const newQuest = {
      id: `quest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title,
      shortDescription: shortDesc,
      description: createQuestMatch[3].trim(),
      active: true,
      fulfilled: false,
      points,
      createdAt: new Date(),
    };

    storyData.quests.push(newQuest);
    logger.action("Quest created via command response", { title, points });

    return {
      command: trimmed,
      success: true,
      message: `Created quest "${title}" (${points} points)`,
      timestamp,
    };
  }

  // /activate_quest: quest title
  const activateQuestMatch = trimmed.match(/^\/activate_quest:\s*(.+)$/i);
  if (activateQuestMatch) {
    const questTitle = activateQuestMatch[1].trim();
    if (!storyData.quests) storyData.quests = [];

    const matchResult = findQuestMatch(questTitle, storyData.quests);
    const quest = matchResult?.item;

    if (!quest) {
      return {
        command: trimmed,
        success: false,
        message: `Quest "${questTitle}" not found`,
        timestamp,
      };
    }

    if (quest.active) {
      return {
        command: trimmed,
        success: "partial",
        message: `Quest "${quest.title}" was already active`,
        timestamp,
      };
    }

    quest.active = true;
    logger.action("Quest activated via command response", {
      title: quest.title,
    });

    const fuzzyNote =
      matchResult && !matchResult.isExact
        ? ` (matched "${questTitle}" → "${quest.title}", ${Math.round(
            matchResult.score * 100
          )}%)`
        : "";

    return {
      command: trimmed,
      success: true,
      message: `Activated quest "${quest.title}"${fuzzyNote}`,
      timestamp,
    };
  }

  // /complete_quest: quest title
  const completeQuestMatch = trimmed.match(/^\/complete_quest:\s*(.+)$/i);
  if (completeQuestMatch) {
    const questTitle = completeQuestMatch[1].trim();
    if (!storyData.quests) storyData.quests = [];
    if (!storyData.earnedPointsFromQuests)
      storyData.earnedPointsFromQuests = [];

    const matchResult = findQuestMatch(questTitle, storyData.quests);
    const quest = matchResult?.item;

    if (!quest) {
      return {
        command: trimmed,
        success: false,
        message: `Quest "${questTitle}" not found`,
        timestamp,
      };
    }

    if (quest.fulfilled) {
      return {
        command: trimmed,
        success: "partial",
        message: `Quest "${quest.title}" was already completed`,
        timestamp,
      };
    }

    quest.fulfilled = true;

    // Award points if not already awarded
    const alreadyAwarded = storyData.earnedPointsFromQuests.includes(quest.id);
    if (!alreadyAwarded) {
      storyData.earnedPointsFromQuests.push(quest.id);
      storyData.points += quest.points;
    }

    logger.action("Quest completed via command response", {
      title: quest.title,
      pointsAwarded: alreadyAwarded ? 0 : quest.points,
    });

    const fuzzyNote =
      matchResult && !matchResult.isExact
        ? ` (matched "${questTitle}" → "${quest.title}", ${Math.round(
            matchResult.score * 100
          )}%)`
        : "";

    return {
      command: trimmed,
      success: true,
      message: `Completed quest "${quest.title}"${
        alreadyAwarded ? "" : ` (+${quest.points} points)`
      }${fuzzyNote}`,
      timestamp,
    };
  }

  // /deactivate_quest: quest title
  const deactivateQuestMatch = trimmed.match(/^\/deactivate_quest:\s*(.+)$/i);
  if (deactivateQuestMatch) {
    const questTitle = deactivateQuestMatch[1].trim();
    if (!storyData.quests) storyData.quests = [];

    const matchResult = findQuestMatch(questTitle, storyData.quests);
    const quest = matchResult?.item;

    if (!quest) {
      return {
        command: trimmed,
        success: false,
        message: `Quest "${questTitle}" not found`,
        timestamp,
      };
    }

    if (!quest.active) {
      return {
        command: trimmed,
        success: "partial",
        message: `Quest "${quest.title}" was already inactive`,
        timestamp,
      };
    }

    quest.active = false;
    logger.action("Quest deactivated via command response", {
      title: quest.title,
    });

    const fuzzyNote =
      matchResult && !matchResult.isExact
        ? ` (matched "${questTitle}" → "${quest.title}", ${Math.round(
            matchResult.score * 100
          )}%)`
        : "";

    return {
      command: trimmed,
      success: true,
      message: `Deactivated quest "${quest.title}"${fuzzyNote}`,
      timestamp,
    };
  }

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

    if (!quest) {
      return {
        command: trimmed,
        success: false,
        message: `Quest "${questTitle}" not found`,
        timestamp,
      };
    }

    quest.description = newDescription;

    logger.action("Quest description updated via command response", {
      title: quest.title,
      newDescription,
    });

    const fuzzyNote =
      matchResult && !matchResult.isExact
        ? ` (matched "${questTitle}" → "${quest.title}", ${Math.round(
            matchResult.score * 100
          )}%)`
        : "";

    return {
      command: trimmed,
      success: true,
      message: `Updated quest "${quest.title}" description${fuzzyNote}`,
      timestamp,
    };
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

    if (!quest) {
      return {
        command: trimmed,
        success: false,
        message: `Quest "${questTitle}" not found`,
        timestamp,
      };
    }

    quest.shortDescription = newShortDescription;

    logger.action("Quest short description updated via command response", {
      title: quest.title,
      newShortDescription,
    });

    const fuzzyNote =
      matchResult && !matchResult.isExact
        ? ` (matched "${questTitle}" → "${quest.title}", ${Math.round(
            matchResult.score * 100
          )}%)`
        : "";

    return {
      command: trimmed,
      success: true,
      message: `Updated quest "${quest.title}" short description${fuzzyNote}`,
      timestamp,
    };
  }

  // === ITEM COMMANDS ===

  // /modify_item: item name(amount) - legacy command
  const itemMatch = trimmed.match(/^\/modify_item:\s*(.+?)\(([+-]?\d+)\)$/i);
  if (itemMatch) {
    const itemName = itemMatch[1].trim();
    const amount = parseInt(itemMatch[2], 10);

    const itemIndex = storyData.inventory.findIndex((i) => i.name === itemName);

    if (itemIndex !== -1) {
      const oldQuantity = storyData.inventory[itemIndex].quantity;
      storyData.inventory[itemIndex].quantity += amount;

      if (storyData.inventory[itemIndex].quantity <= 0) {
        storyData.inventory.splice(itemIndex, 1);
        logger.action("Item removed via legacy command response", {
          itemName,
          amount,
        });

        return {
          command: trimmed,
          success: true,
          message: `Removed ${itemName} from inventory`,
          timestamp,
        };
      } else {
        logger.action("Item quantity modified via legacy command response", {
          itemName,
          amount,
          newTotal: storyData.inventory[itemIndex].quantity,
        });

        return {
          command: trimmed,
          success: true,
          message: `${itemName}: ${oldQuantity} → ${
            storyData.inventory[itemIndex].quantity
          } (${amount > 0 ? "+" : ""}${amount})`,
          timestamp,
        };
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
      logger.action("New item added via legacy command response", {
        itemName,
        amount,
      });

      return {
        command: trimmed,
        success: true,
        message: `Added ${amount} ${itemName} to inventory`,
        timestamp,
      };
    } else {
      return {
        command: trimmed,
        success: false,
        message: `Item "${itemName}" not found and amount is not positive`,
        timestamp,
      };
    }
  }

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
      logger.action("Item quantity increased via command response", {
        itemName,
        quantity,
        newTotal: existingItem.quantity,
      });

      return {
        command: trimmed,
        success: true,
        message: `Added ${quantity} ${itemName} (now ${existingItem.quantity} total)`,
        timestamp,
      };
    }

    storyData.inventory.push({
      name: itemName,
      quantity: quantity,
      description: description,
      type: itemType,
      stat: "",
      resource: "",
      symbol: "??",
    });
    logger.action("New item added via command response", {
      itemName,
      quantity,
      type: itemType,
    });

    return {
      command: trimmed,
      success: true,
      message: `Added ${quantity} ${itemName} to inventory`,
      timestamp,
    };
  }

  // /remove_item: item name | quantity
  const removeItemMatch = trimmed.match(
    /^\/remove_item:\s*(.+?)\s*\|\s*(\d+)$/i
  );
  if (removeItemMatch) {
    const itemName = removeItemMatch[1].trim();
    const quantity = parseInt(removeItemMatch[2], 10);

    const matchResult = findItemMatch(itemName, storyData.inventory);
    const item = matchResult?.item;

    if (!item) {
      return {
        command: trimmed,
        success: false,
        message: `Item "${itemName}" not found in inventory`,
        timestamp,
      };
    }

    if (item.quantity < quantity) {
      return {
        command: trimmed,
        success: false,
        message: `Insufficient "${item.name}" (have ${item.quantity}, need ${quantity})`,
        timestamp,
      };
    }

    item.quantity -= quantity;
    const depleted = item.quantity === 0;

    if (depleted) {
      storyData.inventory = storyData.inventory.filter(
        (i) => i.name !== item.name
      );
      logger.action("Item removed (depleted) via command response", {
        itemName: item.name,
        quantityRemoved: quantity,
      });
    } else {
      logger.action("Item quantity reduced via command response", {
        itemName: item.name,
        quantityRemoved: quantity,
        remaining: item.quantity,
      });
    }

    const fuzzyNote =
      matchResult && !matchResult.isExact
        ? ` (matched "${itemName}" → "${item.name}", ${Math.round(
            matchResult.score * 100
          )}%)`
        : "";

    return {
      command: trimmed,
      success: true,
      message: `Removed ${quantity} ${item.name}${
        depleted ? " (depleted)" : ` (${item.quantity} left)`
      }${fuzzyNote}`,
      timestamp,
    };
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

    if (!item) {
      return {
        command: trimmed,
        success: false,
        message: `Item "${itemName}" not found in inventory`,
        timestamp,
      };
    }

    const oldQuantity = item.quantity;
    const newQuantity = Math.max(0, item.quantity + quantityDelta);
    const actualDelta = newQuantity - oldQuantity;

    if (newQuantity === 0) {
      storyData.inventory = storyData.inventory.filter(
        (i) => i.name !== item.name
      );
      logger.action("Item depleted via quantity modification response", {
        itemName: item.name,
        delta: actualDelta,
      });
    } else {
      item.quantity = newQuantity;
      logger.action("Item quantity modified via command response", {
        itemName: item.name,
        delta: actualDelta,
        newQuantity,
      });
    }

    const fuzzyNote =
      matchResult && !matchResult.isExact
        ? ` (matched "${itemName}" → "${item.name}", ${Math.round(
            matchResult.score * 100
          )}%)`
        : "";

    return {
      command: trimmed,
      success: true,
      message: `${item.name}: ${
        actualDelta > 0 ? "+" : ""
      }${actualDelta} (now ${newQuantity})${fuzzyNote}`,
      timestamp,
    };
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

    if (!oldItem) {
      return {
        command: trimmed,
        success: false,
        message: `Item "${oldItemName}" not found for transformation`,
        timestamp,
      };
    }

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

    logger.action("Item transformed via command response", {
      oldItem: oldItem.name,
      newItem: newItemName,
      type: newType,
      quantity,
    });

    const fuzzyNote =
      matchResult && !matchResult.isExact
        ? ` (matched "${oldItemName}" → "${oldItem.name}", ${Math.round(
            matchResult.score * 100
          )}%)`
        : "";

    return {
      command: trimmed,
      success: true,
      message: `Transformed ${oldItem.name} → ${newItemName} (×${quantity})${fuzzyNote}`,
      timestamp,
    };
  }

  // === STAT COMMANDS ===

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
      return {
        command: trimmed,
        success: false,
        message: `Stat "${name}" already exists`,
        timestamp,
      };
    }

    storyData.stats.push({
      name,
      value,
      description,
      symbol: "⭐",
      custom_symbol_url: undefined,
    });

    logger.action("Stat added via command response", { name, value });

    return {
      command: trimmed,
      success: true,
      message: `Added stat "${name}" (${value})`,
      timestamp,
    };
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

    if (!stat) {
      return {
        command: trimmed,
        success: false,
        message: `Stat "${name}" not found`,
        timestamp,
      };
    }

    const oldValue = stat.value;
    stat.value = Math.max(0, stat.value + valueDelta);
    const actualDelta = stat.value - oldValue;

    logger.action("Stat modified via command response", {
      name: stat.name,
      valueDelta,
      oldValue,
      newValue: stat.value,
    });

    const fuzzyNote =
      matchResult && !matchResult.isExact
        ? ` (matched "${name}" → "${stat.name}", ${Math.round(
            matchResult.score * 100
          )}%)`
        : "";

    return {
      command: trimmed,
      success: true,
      message: `${stat.name}: ${oldValue} → ${stat.value} (${
        actualDelta > 0 ? "+" : ""
      }${actualDelta})${fuzzyNote}`,
      timestamp,
    };
  }

  // /adjust_stat: stat name | delta
  const adjustStatMatch = trimmed.match(
    /^\/adjust_stat:\s*(.+?)\s*\|\s*(-?\d+)$/i
  );
  if (adjustStatMatch) {
    const statName = adjustStatMatch[1].trim();
    const delta = parseInt(adjustStatMatch[2], 10);

    const matchResult = findStatMatch(statName, storyData.stats);
    const stat = matchResult?.item;

    if (!stat) {
      return {
        command: trimmed,
        success: false,
        message: `Stat "${statName}" not found`,
        timestamp,
      };
    }

    const oldValue = stat.value;
    stat.value += delta;

    logger.action("Stat adjusted via command response", {
      statName: stat.name,
      delta,
      oldValue,
      newValue: stat.value,
    });

    const fuzzyNote =
      matchResult && !matchResult.isExact
        ? ` (matched "${statName}" → "${stat.name}", ${Math.round(
            matchResult.score * 100
          )}%)`
        : "";

    return {
      command: trimmed,
      success: true,
      message: `${stat.name}: ${oldValue} → ${stat.value} (${
        delta > 0 ? "+" : ""
      }${delta})${fuzzyNote}`,
      timestamp,
    };
  }

  // /remove_stat: stat name
  const removeStatMatch = trimmed.match(/^\/remove_stat:\s*(.+)$/i);
  if (removeStatMatch) {
    const name = removeStatMatch[1].trim();

    const matchResult = findStatMatch(name, storyData.stats);
    const stat = matchResult?.item;

    if (!stat) {
      return {
        command: trimmed,
        success: false,
        message: `Stat "${name}" not found`,
        timestamp,
      };
    }

    storyData.stats = storyData.stats.filter((s) => s.name !== stat.name);

    logger.action("Stat removed via command response", { name: stat.name });

    const fuzzyNote =
      matchResult && !matchResult.isExact
        ? ` (matched "${name}" → "${stat.name}", ${Math.round(
            matchResult.score * 100
          )}%)`
        : "";

    return {
      command: trimmed,
      success: true,
      message: `Removed stat "${stat.name}"${fuzzyNote}`,
      timestamp,
    };
  }

  // === RESOURCE COMMANDS ===

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
      return {
        command: trimmed,
        success: false,
        message: `Resource "${name}" already exists`,
        timestamp,
      };
    }

    storyData.resources.push({
      name,
      value: current,
      maxValue: max,
      description,
      symbol: "??",
    });

    logger.action("Resource added via command response", {
      name,
      current,
      max,
    });

    return {
      command: trimmed,
      success: true,
      message: `Added resource "${name}" (${current}/${max})`,
      timestamp,
    };
  }

  // /adjust_resource: resource name | delta
  const adjustResourceMatch = trimmed.match(
    /^\/adjust_resource:\s*(.+?)\s*\|\s*(-?\d+)$/i
  );
  if (adjustResourceMatch) {
    const resourceName = adjustResourceMatch[1].trim();
    const delta = parseInt(adjustResourceMatch[2], 10);

    const matchResult = findResourceMatch(resourceName, storyData.resources);
    const resource = matchResult?.item;

    if (!resource) {
      return {
        command: trimmed,
        success: false,
        message: `Resource "${resourceName}" not found`,
        timestamp,
      };
    }

    // Ensure resource.value is a valid number (prevent NaN)
    if (typeof resource.value !== 'number' || isNaN(resource.value)) {
      resource.value = 0;
    }

    const oldValue = resource.value;
    resource.value = Math.max(
      0,
      Math.min(resource.maxValue, resource.value + delta)
    );
    const actualDelta = resource.value - oldValue;

    logger.action("Resource adjusted via command response", {
      resourceName: resource.name,
      delta,
      oldValue,
      newValue: resource.value,
    });

    const fuzzyNote =
      matchResult && !matchResult.isExact
        ? ` (matched "${resourceName}" → "${resource.name}", ${Math.round(
            matchResult.score * 100
          )}%)`
        : "";

    return {
      command: trimmed,
      success: true,
      message: `${resource.name}: ${oldValue} → ${resource.value}/${
        resource.maxValue
      } (${actualDelta > 0 ? "+" : ""}${actualDelta})${fuzzyNote}`,
      timestamp,
    };
  }

  // /set_resource_max: resource name | new max
  const setResourceMaxMatch = trimmed.match(
    /^\/set_resource_max:\s*(.+?)\s*\|\s*(\d+)$/i
  );
  if (setResourceMaxMatch) {
    const resourceName = setResourceMaxMatch[1].trim();
    const newMax = parseInt(setResourceMaxMatch[2], 10);

    const matchResult = findResourceMatch(resourceName, storyData.resources);
    const resource = matchResult?.item;

    if (!resource) {
      return {
        command: trimmed,
        success: false,
        message: `Resource "${resourceName}" not found`,
        timestamp,
      };
    }

    // Ensure resource.value is a valid number (prevent NaN)
    if (typeof resource.value !== 'number' || isNaN(resource.value)) {
      resource.value = 0;
    }

    const oldMax = resource.maxValue;
    resource.maxValue = newMax;

    // Clamp current value if it exceeds new max
    if (resource.value > newMax) {
      resource.value = newMax;
    }

    logger.action("Resource max set via command response", {
      resourceName: resource.name,
      oldMax,
      newMax,
    });

    const fuzzyNote =
      matchResult && !matchResult.isExact
        ? ` (matched "${resourceName}" → "${resource.name}", ${Math.round(
            matchResult.score * 100
          )}%)`
        : "";

    return {
      command: trimmed,
      success: true,
      message: `${resource.name} max: ${oldMax} → ${newMax}${fuzzyNote}`,
      timestamp,
    };
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

    if (!resource) {
      return {
        command: trimmed,
        success: false,
        message: `Resource "${name}" not found`,
        timestamp,
      };
    }

    // Ensure resource.value is a valid number (prevent NaN)
    if (typeof resource.value !== 'number' || isNaN(resource.value)) {
      resource.value = 0;
    }

    const oldValue = resource.value;
    const oldMax = resource.maxValue;

    resource.maxValue = Math.max(1, resource.maxValue + maxDelta);
    resource.value = Math.max(
      0,
      Math.min(resource.maxValue, resource.value + currentDelta)
    );

    logger.action("Resource modified via command response", {
      name: resource.name,
      currentDelta,
      maxDelta,
      oldValue,
      newValue: resource.value,
      oldMax,
      newMax: resource.maxValue,
    });

    const fuzzyNote =
      matchResult && !matchResult.isExact
        ? ` (matched "${name}" → "${resource.name}", ${Math.round(
            matchResult.score * 100
          )}%)`
        : "";

    return {
      command: trimmed,
      success: true,
      message: `${resource.name}: ${oldValue}/${oldMax} → ${resource.value}/${resource.maxValue}${fuzzyNote}`,
      timestamp,
    };
  }

  // /remove_resource: resource name
  const removeResourceMatch = trimmed.match(/^\/remove_resource:\s*(.+)$/i);
  if (removeResourceMatch) {
    const name = removeResourceMatch[1].trim();

    const matchResult = findResourceMatch(name, storyData.resources);
    const resource = matchResult?.item;

    if (!resource) {
      return {
        command: trimmed,
        success: false,
        message: `Resource "${name}" not found`,
        timestamp,
      };
    }

    storyData.resources = storyData.resources.filter(
      (r) => r.name !== resource.name
    );

    logger.action("Resource removed via command response", {
      name: resource.name,
    });

    const fuzzyNote =
      matchResult && !matchResult.isExact
        ? ` (matched "${name}" → "${resource.name}", ${Math.round(
            matchResult.score * 100
          )}%)`
        : "";

    return {
      command: trimmed,
      success: true,
      message: `Removed resource "${resource.name}"${fuzzyNote}`,
      timestamp,
    };
  }

  // === ACHIEVEMENT COMMANDS ===

  // /trigger_achievement: achievement title
  const achievementMatch = trimmed.match(/^\/trigger_achievement:\s*(.+)$/i);
  if (achievementMatch) {
    const achievementTitle = achievementMatch[1].trim();

    // Use exact match only - no fuzzy matching for achievements
    const existing = storyData.achievements.find(
      (a) => a.title.toLowerCase() === achievementTitle.toLowerCase()
    );

    if (!existing) {
      return {
        command: trimmed,
        success: false,
        message: `Achievement "${achievementTitle}" not found (exact match required)`,
        timestamp,
      };
    }

    if (existing.dateAchieved) {
      return {
        command: trimmed,
        success: "partial",
        message: `Achievement "${existing.title}" was already unlocked`,
        timestamp,
      };
    }

    existing.dateAchieved = new Date();
    storyData.points += existing.points;

    logger.action("Achievement unlocked via command response", {
      title: existing.title,
      points: existing.points,
    });

    return {
      command: trimmed,
      success: true,
      message: `Unlocked achievement "${existing.title}" (+${existing.points} points)`,
      timestamp,
    };
  }

  // === LORE COMMANDS ===

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

    const existingLore = storyData.lore.find((l) => l.title === loreTitle);
    if (existingLore) {
      return {
        command: trimmed,
        success: false,
        message: `Lore "${loreTitle}" already exists`,
        timestamp,
      };
    }

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

    logger.action("New lore created via command response", {
      title: loreTitle,
    });

    return {
      command: trimmed,
      success: true,
      message: `Created lore entry "${loreTitle}"`,
      timestamp,
    };
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
      return {
        command: trimmed,
        success: false,
        message: `Lore "${loreTitle}" not found`,
        timestamp,
      };
    }

    loreEntry.content = loreEntry.content.trim() + "\n" + newText;
    logger.action("Content added to lore via command response", {
      title: loreTitle,
      addedText: newText,
    });

    return {
      command: trimmed,
      success: true,
      message: `Added content to lore "${loreTitle}"`,
      timestamp,
    };
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
      return {
        command: trimmed,
        success: false,
        message: `Lore "${loreTitle}" not found`,
        timestamp,
      };
    }

    if (!loreEntry.content.includes(oldText)) {
      return {
        command: trimmed,
        success: false,
        message: `Text not found in lore "${loreTitle}"`,
        timestamp,
      };
    }

    loreEntry.content = loreEntry.content.replace(oldText, newText);
    logger.action("Lore content replaced via command response", {
      title: loreTitle,
      oldText,
      newText,
    });

    return {
      command: trimmed,
      success: true,
      message: `Replaced content in lore "${loreTitle}"`,
      timestamp,
    };
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
      return {
        command: trimmed,
        success: false,
        message: `Lore "${loreTitle}" not found`,
        timestamp,
      };
    }

    if (!loreEntry.content.includes(textToDelete)) {
      return {
        command: trimmed,
        success: false,
        message: `Text not found in lore "${loreTitle}"`,
        timestamp,
      };
    }

    loreEntry.content = loreEntry.content.replace(textToDelete, "").trim();
    // Clean up multiple spaces and newlines
    loreEntry.content = loreEntry.content.replace(/  +/g, " ");
    loreEntry.content = loreEntry.content.replace(/\n{3,}/g, "\n\n");

    logger.action("Content deleted from lore via command response", {
      title: loreTitle,
      deletedText: textToDelete,
    });

    return {
      command: trimmed,
      success: true,
      message: `Deleted content from lore "${loreTitle}"`,
      timestamp,
    };
  }

  // === PLOT BEAT COMMANDS ===

  // /mark_beat: beat index
  const markBeatMatch = trimmed.match(/^\/mark_beat:\s*(\d+)$/i);
  if (markBeatMatch) {
    const beatIndex = parseInt(markBeatMatch[1], 10) - 1;

    if (beatIndex < 0 || beatIndex >= storyData.plot_beats.length) {
      return {
        command: trimmed,
        success: false,
        message: `Beat index ${beatIndex + 1} out of range (1-${
          storyData.plot_beats.length
        })`,
        timestamp,
      };
    }

    const beat = storyData.plot_beats[beatIndex];

    if (beat.fulfilled) {
      return {
        command: trimmed,
        success: "partial",
        message: `Beat ${beatIndex + 1} ("${
          beat.title
        }") was already completed`,
        timestamp,
      };
    }

    beat.fulfilled = true;

    // Award points for completing a new beat
    const alreadyAwarded = storyData.earnedPointsFromBeats.includes(beatIndex);
    if (!alreadyAwarded) {
      storyData.earnedPointsFromBeats.push(beatIndex);
      const pointsAwarded = beat.points ?? 50; // Default from UPGRADE_COSTS.BEAT_REWARD
      storyData.points += pointsAwarded;

      logger.action("Beat completed with points via command response", {
        beatIndex: beatIndex + 1,
        title: beat.title,
        pointsAwarded,
      });

      return {
        command: trimmed,
        success: true,
        message: `Completed beat ${beatIndex + 1} ("${
          beat.title
        }") (+${pointsAwarded} points)`,
        timestamp,
      };
    }

    logger.action("Beat completed (no points) via command response", {
      beatIndex: beatIndex + 1,
      title: beat.title,
    });

    return {
      command: trimmed,
      success: true,
      message: `Completed beat ${beatIndex + 1} ("${beat.title}")`,
      timestamp,
    };
  }

  // /edit_beat_title: new title(index)
  const editBeatTitleMatch = trimmed.match(
    /^\/edit_beat_title:\s*(.+?)\((\d+)\)$/i
  );
  if (editBeatTitleMatch) {
    const newTitle = editBeatTitleMatch[1].trim();
    const beatIndex = parseInt(editBeatTitleMatch[2], 10);

    if (beatIndex < 0 || beatIndex >= storyData.plot_beats.length) {
      return {
        command: trimmed,
        success: false,
        message: `Beat index ${beatIndex} out of range (0-${
          storyData.plot_beats.length - 1
        })`,
        timestamp,
      };
    }

    const oldTitle = storyData.plot_beats[beatIndex].title;
    storyData.plot_beats[beatIndex].title = newTitle;

    logger.action("Beat title edited via command response", {
      beatIndex,
      oldTitle,
      newTitle,
    });

    return {
      command: trimmed,
      success: true,
      message: `Updated beat ${beatIndex} title: "${oldTitle}" → "${newTitle}"`,
      timestamp,
    };
  }

  // /edit_beat_content: new content(index)
  const editBeatContentMatch = trimmed.match(
    /^\/edit_beat_content:\s*(.+?)\((\d+)\)$/i
  );
  if (editBeatContentMatch) {
    const newContent = editBeatContentMatch[1].trim();
    const beatIndex = parseInt(editBeatContentMatch[2], 10);

    if (beatIndex < 0 || beatIndex >= storyData.plot_beats.length) {
      return {
        command: trimmed,
        success: false,
        message: `Beat index ${beatIndex} out of range (0-${
          storyData.plot_beats.length - 1
        })`,
        timestamp,
      };
    }

    storyData.plot_beats[beatIndex].content = newContent;

    logger.action("Beat content edited via command response", {
      beatIndex,
      newContent: newContent.substring(0, 50) + "...",
    });

    return {
      command: trimmed,
      success: true,
      message: `Updated beat ${beatIndex} content`,
      timestamp,
    };
  }

  // /add_beat: title|content
  const addBeatMatch = trimmed.match(/^\/add_beat:\s*(.+?)\|(.+)$/i);
  if (addBeatMatch) {
    const title = addBeatMatch[1].trim();
    const content = addBeatMatch[2].trim();

    storyData.plot_beats.push({
      title,
      content,
      fulfilled: false,
    });

    logger.action("Beat added via command response", { title, content });

    return {
      command: trimmed,
      success: true,
      message: `Added new story beat: "${title}"`,
      timestamp,
    };
  }

  // /remove_beat: beat index
  const removeBeatMatch = trimmed.match(/^\/remove_beat:\s*(\d+)$/i);
  if (removeBeatMatch) {
    const beatIndex = parseInt(removeBeatMatch[1], 10);

    if (beatIndex < 0 || beatIndex >= storyData.plot_beats.length) {
      return {
        command: trimmed,
        success: false,
        message: `Beat index ${beatIndex} out of range (0-${
          storyData.plot_beats.length - 1
        })`,
        timestamp,
      };
    }

    const removed = storyData.plot_beats.splice(beatIndex, 1)[0];

    logger.action("Beat removed via command response", {
      beatIndex,
      title: removed.title,
    });

    return {
      command: trimmed,
      success: true,
      message: `Removed beat ${beatIndex}: "${removed.title}"`,
      timestamp,
    };
  }

  // === MOMENTUM COMMANDS ===

  // /modify_momentum: amount
  const momentumMatch = trimmed.match(/^\/modify_momentum:\s*([+-]?\d+)$/i);
  if (momentumMatch) {
    const amount = parseInt(momentumMatch[1], 10);
    const oldValue = storyData.momentum;
    storyData.momentum = Math.max(
      0,
      Math.min(storyData.maxMomentum, storyData.momentum + amount)
    );
    const actualDelta = storyData.momentum - oldValue;

    logger.action("Momentum modified via command response", {
      amount,
      oldValue,
      newValue: storyData.momentum,
    });

    return {
      command: trimmed,
      success: true,
      message: `Momentum: ${oldValue} → ${storyData.momentum}/${
        storyData.maxMomentum
      } (${actualDelta > 0 ? "+" : ""}${actualDelta})`,
      timestamp,
    };
  }

  // === RELATIONSHIP COMMANDS ===

  // /add_relationship: name | value | description
  const addRelationshipMatch = trimmed.match(
    /^\/add_relationship:\s*(.+?)\s*\|\s*(-?\d+)\s*\|\s*(.+)$/i
  );
  if (addRelationshipMatch) {
    const name = addRelationshipMatch[1].trim();
    const value = parseInt(addRelationshipMatch[2], 10);
    const description = addRelationshipMatch[3].trim();

    if (!storyData.relationships) storyData.relationships = [];

    if (!name) {
      return {
        command: trimmed,
        success: false,
        message: `Relationship name cannot be empty`,
        timestamp,
      };
    }

    const existing = storyData.relationships.find(
      (r) => r.name.toLowerCase() === name.toLowerCase()
    );

    if (existing) {
      return {
        command: trimmed,
        success: false,
        message: `Relationship "${name}" already exists`,
        timestamp,
      };
    }

    if (value < -100 || value > 100) {
      return {
        command: trimmed,
        success: false,
        message: `Relationship value must be between -100 and 100 (got ${value})`,
        timestamp,
      };
    }

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

    logger.action("Relationship added via command response", {
      name,
      value,
      description,
    });

    return {
      command: trimmed,
      success: true,
      message: `Added relationship "${name}" (${value}) ${symbol}`,
      timestamp,
    };
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

    if (!relationship) {
      return {
        command: trimmed,
        success: false,
        message: `Relationship "${name}" not found`,
        timestamp,
      };
    }

    const oldValue = relationship.value;
    relationship.value = Math.max(-100, Math.min(100, oldValue + delta));
    const actualDelta = relationship.value - oldValue;

    // Update symbol based on new value
    if (relationship.value >= 75) relationship.symbol = "💚";
    else if (relationship.value >= 50) relationship.symbol = "💙";
    else if (relationship.value >= 25) relationship.symbol = "😊";
    else if (relationship.value >= 0) relationship.symbol = "🤝";
    else if (relationship.value >= -25) relationship.symbol = "😐";
    else if (relationship.value >= -50) relationship.symbol = "😠";
    else if (relationship.value >= -75) relationship.symbol = "💔";
    else relationship.symbol = "⚔️";

    logger.action("Relationship modified via command response", {
      name: relationship.name,
      delta,
      oldValue,
      newValue: relationship.value,
    });

    const fuzzyNote =
      matchResult && !matchResult.isExact
        ? ` (matched "${name}" → "${relationship.name}", ${Math.round(
            matchResult.score * 100
          )}%)`
        : "";

    return {
      command: trimmed,
      success: true,
      message: `${relationship.name}: ${oldValue} → ${relationship.value} (${
        actualDelta > 0 ? "+" : ""
      }${actualDelta}) ${relationship.symbol}${fuzzyNote}`,
      timestamp,
    };
  }

  // /remove_relationship: relationship name
  const removeRelationshipMatch = trimmed.match(
    /^\/remove_relationship:\s*(.+)$/i
  );
  if (removeRelationshipMatch) {
    const name = removeRelationshipMatch[1].trim();

    if (!storyData.relationships) storyData.relationships = [];

    const matchResult = findRelationshipMatch(name, storyData.relationships);
    const relationship = matchResult?.item;

    if (!relationship) {
      return {
        command: trimmed,
        success: false,
        message: `Relationship "${name}" not found`,
        timestamp,
      };
    }

    storyData.relationships = storyData.relationships.filter(
      (r) => r !== relationship
    );

    logger.action("Relationship removed via command response", {
      name: relationship.name,
      value: relationship.value,
    });

    const fuzzyNote =
      matchResult && !matchResult.isExact
        ? ` (matched "${name}" → "${relationship.name}", ${Math.round(
            matchResult.score * 100
          )}%)`
        : "";

    return {
      command: trimmed,
      success: true,
      message: `Removed relationship "${relationship.name}"${fuzzyNote}`,
      timestamp,
    };
  }

  // /update_relationship_description: relationship name | new description
  const updateRelationshipDescMatch = trimmed.match(
    /^\/update_relationship_description:\s*(.+?)\s*\|\s*(.+)$/i
  );
  if (updateRelationshipDescMatch) {
    const name = updateRelationshipDescMatch[1].trim();
    const newDescription = updateRelationshipDescMatch[2].trim();

    if (!storyData.relationships) storyData.relationships = [];

    const matchResult = findRelationshipMatch(name, storyData.relationships);
    const relationship = matchResult?.item;

    if (!relationship) {
      return {
        command: trimmed,
        success: false,
        message: `Relationship "${name}" not found`,
        timestamp,
      };
    }

    relationship.description = newDescription;

    logger.action("Relationship description updated via command response", {
      name: relationship.name,
      newDescription,
    });

    const fuzzyNote =
      matchResult && !matchResult.isExact
        ? ` (matched "${name}" → "${relationship.name}", ${Math.round(
            matchResult.score * 100
          )}%)`
        : "";

    return {
      command: trimmed,
      success: true,
      message: `Updated relationship "${relationship.name}" description${fuzzyNote}`,
      timestamp,
    };
  }

  // Command not recognized
  return null;
}

/**
 * Batch process all commands and generate responses.
 * Returns array of CommandResponse objects for AI feedback.
 */
export function generateCommandResponses(
  commands: string[],
  storyData: StoryData
): CommandResponse[] {
  const responses: CommandResponse[] = [];

  for (const command of commands) {
    const response = executeCommandWithResponse(command, storyData);
    if (response) {
      responses.push(response);
    } else {
      // Unknown command - still generate a response for AI awareness
      responses.push({
        command: command.trim(),
        success: false,
        message: `Unknown or malformed command`,
        timestamp: Date.now(),
      });
    }
  }

  logger.info("Generated command responses", {
    totalCommands: commands.length,
    successCount: responses.filter((r) => r.success === true).length,
    partialCount: responses.filter((r) => r.success === "partial").length,
    failureCount: responses.filter((r) => r.success === false).length,
  });

  return responses;
}

/**
 * Format command responses as XML for AI prompt inclusion.
 * Returns string to prepend to user message.
 */
export function formatResponsesForAI(responses: CommandResponse[]): string {
  if (responses.length === 0) return "";

  const lines = responses.map((r) => {
    const status =
      r.success === true ? "✓" : r.success === "partial" ? "⚠" : "✗";
    return `${status} ${r.message}`;
  });

  return `<commands_response>\n${lines.join("\n")}\n</commands_response>\n\n`;
}
