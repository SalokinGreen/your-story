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

import type { StoryData, CommandResponse, LoreType } from "./structs";
import {
  findResourceMatch,
  findStatMatch,
  findAchievementMatch,
  findQuestMatch,
  findRelationshipMatch,
  findLoreMatch,
  findAbilityMatch,
  findBestMatch,
} from "./fuzzyMatch";
import { logger } from "./logger";
import { ABILITY_GRADE_ORDER, initializeAbility } from "./abilitySystem";
import { calculateLevel } from "./leveling";

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

  // === ABILITY COMMANDS ===

  // /add_ability: name | description | grade | stat | costs | maxCooldown
  // costs format: "resource:Health:10,variable:ManaSpent:5" or empty string
  const addAbilityMatch = trimmed.match(
    /^\/add_ability:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(novice|apprentice|adept|expert|master|legendary)\s*(?:\|\s*(.+?))?\s*(?:\|\s*(.+?))?\s*(?:\|\s*(\d+))?$/i
  );
  if (addAbilityMatch) {
    const name = addAbilityMatch[1].trim();
    const description = addAbilityMatch[2].trim();
    const grade = addAbilityMatch[3].toLowerCase() as
      | "novice"
      | "apprentice"
      | "adept"
      | "expert"
      | "master"
      | "legendary";
    const stat = addAbilityMatch[4]?.trim() || undefined;
    const costsStr = addAbilityMatch[5]?.trim() || "";
    const maxCooldown = addAbilityMatch[6]
      ? parseInt(addAbilityMatch[6], 10)
      : 0;

    // Initialize abilities array if needed
    if (!storyData.abilities) {
      storyData.abilities = [];
    }

    const existing = storyData.abilities.find(
      (a) => a.name.toLowerCase() === name.toLowerCase()
    );
    if (existing) {
      return {
        command: trimmed,
        success: false,
        message: `Ability "${name}" already exists`,
        timestamp,
      };
    }

    // Parse costs string
    const costs: Array<{
      type: "resource" | "variable";
      name: string;
      amount: number;
    }> = [];
    if (costsStr) {
      const costParts = costsStr.split(",");
      for (const part of costParts) {
        const [typeStr, costName, amountStr] = part.trim().split(":");
        if (typeStr && costName && amountStr) {
          const type = typeStr.toLowerCase() as "resource" | "variable";
          if (type === "resource" || type === "variable") {
            costs.push({
              type,
              name: costName.trim(),
              amount: parseInt(amountStr, 10),
            });
          }
        }
      }
    }

    // Validate stat exists if specified
    if (
      stat &&
      !storyData.stats.find((s) => s.name.toLowerCase() === stat.toLowerCase())
    ) {
      return {
        command: trimmed,
        success: "partial" as const,
        message: `Added ability "${name}" but stat "${stat}" not found (ability will work with any skill check)`,
        timestamp,
      };
    }

    const ability = initializeAbility({
      name,
      description,
      grade,
      stat,
      cost: costs,
      cooldown: maxCooldown,
      symbol: "✨",
    });

    storyData.abilities.push(ability);

    logger.action("Ability added via command response", {
      name,
      grade,
      costs,
      maxCooldown,
    });

    const costDesc =
      costs.length > 0
        ? ` (costs: ${costs.map((c) => `${c.amount} ${c.name}`).join(", ")})`
        : "";
    const cooldownDesc =
      maxCooldown > 0 ? `, ${maxCooldown} turn cooldown` : "";

    return {
      command: trimmed,
      success: true,
      message: `Added ${grade} ability "${name}"${costDesc}${cooldownDesc}`,
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
    if (typeof resource.value !== "number" || isNaN(resource.value)) {
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

  // === NOTE COMMANDS ===

  // /create_note: title | content | type
  const createNoteMatch = trimmed.match(
    /^\/create_note:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.*)$/i
  );
  if (createNoteMatch) {
    const noteTitle = createNoteMatch[1].trim();
    const noteContent = createNoteMatch[2].trim();
    const noteType = createNoteMatch[3].trim() as LoreType;

    if (!storyData.lore) storyData.lore = [];

    const existingNote = storyData.lore.find((l) => l.title === noteTitle);
    if (existingNote) {
      return {
        command: trimmed,
        success: false,
        message: `Note "${noteTitle}" already exists`,
        timestamp,
      };
    }

    storyData.lore.push({
      title: noteTitle,
      content: noteContent,
      relatedCharacters: [],
      relatedLocations: [],
      secrtet: false,
      keys: [],
      type: noteType || "lore",
      on: true, // Agentic notes are visible by default
      alwaysOn: true, // No more triggers needed with read_notes
      embedded: false, // New entry needs embedding
    });

    // Mark lore embeddings as dirty for re-sync
    storyData.loreEmbeddingsDirty = true;

    logger.action("New note created via command response", {
      title: noteTitle,
    });

    return {
      command: trimmed,
      success: true,
      message: `Created note entry "${noteTitle}"`,
      timestamp,
    };
  }

  // /note_show: note title (also handles legacy /lore_show)
  const noteShowMatch = trimmed.match(/^\/(note_show|lore_show):\s*(.+)$/i);
  if (noteShowMatch) {
    const noteTitle = noteShowMatch[2].trim();

    if (!storyData.lore) storyData.lore = [];

    const matchResult = findLoreMatch(noteTitle, storyData.lore);
    const noteEntry = matchResult?.item;

    if (!noteEntry) {
      return {
        command: trimmed,
        success: false,
        message: `Note "${noteTitle}" not found`,
        timestamp,
      };
    }

    if (noteEntry.on === true) {
      const fuzzyNote =
        matchResult && !matchResult.isExact
          ? ` (matched "${noteTitle}" → "${noteEntry.title}", ${Math.round(
              matchResult.score * 100
            )}%)`
          : "";
      return {
        command: trimmed,
        success: "partial",
        message: `Note "${noteEntry.title}" was already visible${fuzzyNote}`,
        timestamp,
      };
    }

    noteEntry.on = true;
    noteEntry.lastTriggeredIndex = storyData.scene.parts.length;

    // Add to revealedLore on the last scene part (or create one if needed)
    const lastPart = storyData.scene.parts[storyData.scene.parts.length - 1];
    if (lastPart) {
      if (!lastPart.revealedLore) lastPart.revealedLore = [];
      if (!lastPart.revealedLore.includes(noteEntry.title)) {
        lastPart.revealedLore.push(noteEntry.title);
      }
    }

    logger.action("Note revealed via command response", {
      title: noteEntry.title,
    });

    const fuzzyNote =
      matchResult && !matchResult.isExact
        ? ` (matched "${noteTitle}" → "${noteEntry.title}", ${Math.round(
            matchResult.score * 100
          )}%)`
        : "";

    return {
      command: trimmed,
      success: true,
      message: `Revealed note "${noteEntry.title}"${fuzzyNote}`,
      timestamp,
    };
  }

  // /note_hide: note title (also handles legacy /lore_hide)
  const noteHideMatch = trimmed.match(/^\/(note_hide|lore_hide):\s*(.+)$/i);
  if (noteHideMatch) {
    const noteTitle = noteHideMatch[2].trim();

    if (!storyData.lore) storyData.lore = [];

    const matchResult = findLoreMatch(noteTitle, storyData.lore);
    const noteEntry = matchResult?.item;

    if (!noteEntry) {
      return {
        command: trimmed,
        success: false,
        message: `Note "${noteTitle}" not found`,
        timestamp,
      };
    }

    if (noteEntry.on === false) {
      const fuzzyNote =
        matchResult && !matchResult.isExact
          ? ` (matched "${noteTitle}" → "${noteEntry.title}", ${Math.round(
              matchResult.score * 100
            )}%)`
          : "";
      return {
        command: trimmed,
        success: "partial",
        message: `Note "${noteEntry.title}" was already hidden${fuzzyNote}`,
        timestamp,
      };
    }

    noteEntry.on = false;

    logger.action("Note hidden via command response", {
      title: noteEntry.title,
    });

    const fuzzyNote =
      matchResult && !matchResult.isExact
        ? ` (matched "${noteTitle}" → "${noteEntry.title}", ${Math.round(
            matchResult.score * 100
          )}%)`
        : "";

    return {
      command: trimmed,
      success: true,
      message: `Hidden note "${noteEntry.title}"${fuzzyNote}`,
      timestamp,
    };
  }

  // /note_update: title | newTitle | content | type
  const noteUpdateMatch = trimmed.match(
    /^\/note_update:\s*(.+?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*)$/i
  );
  if (noteUpdateMatch) {
    const title = noteUpdateMatch[1].trim();
    const newTitle = noteUpdateMatch[2].trim();
    const content = noteUpdateMatch[3].trim();
    const type = noteUpdateMatch[4].trim() as LoreType;

    const existing = (storyData.lore || []).find(
      (l) => l.title.toLowerCase() === title.toLowerCase()
    );
    if (!existing) {
      return {
        command: trimmed,
        success: false,
        message: `Note "${title}" not found`,
        timestamp,
      };
    }

    if (newTitle) existing.title = newTitle;
    if (content) {
      existing.content = content;
      existing.embedded = false; // Re-sync if content changes
      storyData.loreEmbeddingsDirty = true;
    }
    if (type) existing.type = type;

    // Agentic notes are always on
    existing.on = true;
    existing.alwaysOn = true;
    existing.on_triggers = [];
    existing.off_triggers = [];

    return {
      command: trimmed,
      success: true,
      message: `Updated note "${title}"`,
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

    const matchResult = findLoreMatch(loreTitle, storyData.lore);
    const loreEntry = matchResult?.item;

    if (!loreEntry) {
      return {
        command: trimmed,
        success: false,
        message: `Lore "${loreTitle}" not found`,
        timestamp,
      };
    }

    loreEntry.content = loreEntry.content.trim() + "\n" + newText;
    loreEntry.embedded = false; // Content changed, needs re-embedding

    // Mark lore embeddings as dirty for re-sync
    storyData.loreEmbeddingsDirty = true;

    logger.action("Content added to lore via command response", {
      title: loreEntry.title,
      addedText: newText,
    });

    const fuzzyNote =
      matchResult && !matchResult.isExact
        ? ` (matched "${loreTitle}" → "${loreEntry.title}", ${Math.round(
            matchResult.score * 100
          )}%)`
        : "";

    return {
      command: trimmed,
      success: true,
      message: `Added content to lore "${loreEntry.title}"${fuzzyNote}`,
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

    const matchResult = findLoreMatch(loreTitle, storyData.lore);
    const loreEntry = matchResult?.item;

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
    loreEntry.embedded = false; // Content changed, needs re-embedding

    // Mark lore embeddings as dirty for re-sync
    storyData.loreEmbeddingsDirty = true;

    logger.action("Lore content replaced via command response", {
      title: loreEntry.title,
      oldText,
      newText,
    });

    const fuzzyNote =
      matchResult && !matchResult.isExact
        ? ` (matched "${loreTitle}" → "${loreEntry.title}", ${Math.round(
            matchResult.score * 100
          )}%)`
        : "";

    return {
      command: trimmed,
      success: true,
      message: `Replaced content in lore "${loreEntry.title}"${fuzzyNote}`,
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

    const matchResult = findLoreMatch(loreTitle, storyData.lore);
    const loreEntry = matchResult?.item;

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
    loreEntry.embedded = false; // Content changed, needs re-embedding

    // Mark lore embeddings as dirty for re-sync
    storyData.loreEmbeddingsDirty = true;

    logger.action("Content deleted from lore via command response", {
      title: loreEntry.title,
      deletedText: textToDelete,
    });

    const fuzzyNote =
      matchResult && !matchResult.isExact
        ? ` (matched "${loreTitle}" → "${loreEntry.title}", ${Math.round(
            matchResult.score * 100
          )}%)`
        : "";

    return {
      command: trimmed,
      success: true,
      message: `Deleted content from lore "${loreEntry.title}"${fuzzyNote}`,
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
      // Provide helpful error with available relationships
      const availableNames = storyData.relationships
        .map((r) => r.name)
        .join(", ");
      const helpText = availableNames
        ? ` (available: ${availableNames})`
        : " (no relationships exist yet - use add_relationship to create one)";
      return {
        command: trimmed,
        success: false,
        message: `Relationship "${name}" not found${helpText}`,
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

  // === Advanced RPG Tools COMMANDS ===

  // DEPRECATED: AGMT thread commands - use StoryThread tools instead
  // These handlers return no-op success for backwards compatibility
  const addThreadMatch = trimmed.match(/^\/add_thread:\s*(.+)$/i);
  if (addThreadMatch) {
    return {
      command: trimmed,
      success: true,
      message: `AGMT threads deprecated - use create_thread for StoryThreads`,
      timestamp,
    };
  }

  const updateThreadMatch = trimmed.match(
    /^\/update_thread:\s*(.+?)\s*→\s*(.+)$/i
  );
  if (updateThreadMatch) {
    return {
      command: trimmed,
      success: true,
      message: `AGMT threads deprecated - use update_thread for StoryThreads`,
      timestamp,
    };
  }

  const resolveThreadMatch = trimmed.match(/^\/resolve_thread:\s*(.+)$/i);
  if (resolveThreadMatch) {
    return {
      command: trimmed,
      success: true,
      message: `AGMT threads deprecated - use resolve_thread for StoryThreads`,
      timestamp,
    };
  }

  const closeThreadMatch = trimmed.match(/^\/close_thread:\s*(.+)$/i);
  if (closeThreadMatch) {
    return {
      command: trimmed,
      success: true,
      message: `AGMT threads deprecated - use resolve_thread for StoryThreads`,
      timestamp,
    };
  }

  const reopenThreadMatch = trimmed.match(/^\/reopen_thread:\s*(.+)$/i);
  if (reopenThreadMatch) {
    return {
      command: trimmed,
      success: true,
      message: `AGMT threads deprecated - StoryThreads don't support reopen`,
      timestamp,
    };
  }

  // /adjust_chaos: delta
  const adjustChaosMatch = trimmed.match(/^\/adjust_chaos:\s*([+-]?\d+)$/i);
  if (adjustChaosMatch) {
    const delta = parseInt(adjustChaosMatch[1], 10);

    if (!storyData.agmtState) {
      return {
        command: trimmed,
        success: false,
        message: "Advanced RPG Tools not enabled",
        timestamp,
      };
    }

    const oldValue = storyData.agmtState.chaosFactor;
    storyData.agmtState.chaosFactor = Math.max(
      1,
      Math.min(9, oldValue + delta)
    );

    logger.action("Chaos factor adjusted via command response", {
      oldValue,
      newValue: storyData.agmtState.chaosFactor,
      delta,
    });

    return {
      command: trimmed,
      success: true,
      message: `Chaos factor: ${oldValue} → ${storyData.agmtState.chaosFactor}`,
      timestamp,
    };
  }

  // /increment_scene: (with optional new value)
  const incrementSceneMatch = trimmed.match(
    /^\/increment_scene:\s*(\d+)\s*→\s*(\d+)$/i
  );
  if (incrementSceneMatch) {
    const newValue = parseInt(incrementSceneMatch[2], 10);

    if (!storyData.agmtState) {
      storyData.agmtState = {
        chaosFactor: 5,
        threads: [],
        sceneCount: 0,
        skillCheckHistory: [],
        currentStreak: 0,
        lastChaosAdjustment: -999,
      };
    }

    const oldValue = storyData.agmtState.sceneCount || 0;
    storyData.agmtState.sceneCount = newValue;

    logger.action("Scene count updated via command response", {
      oldValue,
      newValue,
    });

    return {
      command: trimmed,
      success: true,
      message: `Scene count: ${oldValue} → ${newValue}`,
      timestamp,
    };
  }

  // Simple /increment_scene command
  const simpleIncrementSceneMatch = trimmed.match(/^\/increment_scene$/i);
  if (simpleIncrementSceneMatch) {
    if (!storyData.agmtState) {
      storyData.agmtState = {
        chaosFactor: 5,
        threads: [],
        sceneCount: 0,
        skillCheckHistory: [],
        currentStreak: 0,
        lastChaosAdjustment: -999,
      };
    }

    const oldValue = storyData.agmtState.sceneCount || 0;
    storyData.agmtState.sceneCount = oldValue + 1;

    logger.action("Scene count incremented via command response", {
      oldValue,
      newValue: storyData.agmtState.sceneCount,
    });

    return {
      command: trimmed,
      success: true,
      message: `Scene count: ${oldValue} → ${storyData.agmtState.sceneCount}`,
      timestamp,
    };
  }

  // Command not recognized
  return null;
}

// === DIRECT TYPED TOOL DISPATCH ===
//
// The functions below implement the same logic that used to live behind
// `/command: args` regex blocks above, but take the already-parsed tool
// `args` object directly instead of round-tripping through a pipe-delimited
// command string. See toolExecutor.ts's TOOL_DISPATCH table for wiring.

/**
 * /complete_quest: quest title
 */
export function applyCompleteQuest(
  args: Record<string, unknown>,
  storyData: StoryData
): Omit<CommandResponse, "toolCallId"> | null {
  const timestamp = Date.now();
  const questTitle = String(args.title ?? "").trim();
  const command = `/complete_quest: ${questTitle}`;

  if (!storyData.quests) storyData.quests = [];
  if (!storyData.earnedPointsFromQuests) storyData.earnedPointsFromQuests = [];

  const matchResult = findQuestMatch(questTitle, storyData.quests);
  const quest = matchResult?.item;

  if (!quest) {
    return {
      command,
      success: false,
      message: `Quest "${questTitle}" not found`,
      timestamp,
    };
  }

  if (quest.fulfilled) {
    return {
      command,
      success: "partial",
      message: `Quest "${quest.title}" was already completed`,
      timestamp,
    };
  }

  quest.fulfilled = true;

  // Award XP if not already awarded
  const alreadyAwarded = storyData.earnedPointsFromQuests.includes(quest.id);
  let leveledUp = false;
  let newLevel = storyData.level || 1;
  if (!alreadyAwarded) {
    storyData.earnedPointsFromQuests.push(quest.id);
    storyData.points = (storyData.points || 0) + quest.points;
    const oldLevel = storyData.level || 1;
    const level = calculateLevel(
      storyData.points || 0,
      storyData.levelingSettings
    );
    storyData.level = level;
    newLevel = level;
    leveledUp = level > oldLevel;
  }

  logger.action("Quest completed via tool dispatch", {
    title: quest.title,
    xpAwarded: alreadyAwarded ? 0 : quest.points,
  });

  const fuzzyNote =
    matchResult && !matchResult.isExact
      ? ` (matched "${questTitle}" → "${quest.title}", ${Math.round(
          matchResult.score * 100
        )}%)`
      : "";

  return {
    command,
    success: true,
    message: `Completed quest "${quest.title}"${
      alreadyAwarded
        ? ""
        : ` (+${quest.points} XP${
            leveledUp ? `, Level Up to ${newLevel}!` : ""
          })`
    }${fuzzyNote}`,
    timestamp,
  };
}

/**
 * /fail_quest: quest title
 */
export function applyFailQuest(
  args: Record<string, unknown>,
  storyData: StoryData
): Omit<CommandResponse, "toolCallId"> | null {
  const timestamp = Date.now();
  const questTitle = String(args.title ?? "").trim();
  const command = `/fail_quest: ${questTitle}`;

  if (!storyData.quests) storyData.quests = [];

  const matchResult = findQuestMatch(questTitle, storyData.quests);
  const quest = matchResult?.item;

  if (!quest) {
    return {
      command,
      success: false,
      message: `Quest "${questTitle}" not found`,
      timestamp,
    };
  }

  if (quest.fulfilled) {
    return {
      command,
      success: "partial",
      message: `Quest "${quest.title}" was already completed (cannot fail)`,
      timestamp,
    };
  }

  // Mark quest as inactive (failed) - no points awarded
  quest.active = false;

  logger.action("Quest failed via tool dispatch", {
    title: quest.title,
  });

  const fuzzyNote =
    matchResult && !matchResult.isExact
      ? ` (matched "${questTitle}" → "${quest.title}", ${Math.round(
          matchResult.score * 100
        )}%)`
      : "";

  return {
    command,
    success: true,
    message: `Failed quest "${quest.title}"${fuzzyNote}`,
    timestamp,
  };
}

/**
 * /update_quest: quest title | description? | shortDescription?
 * Updates whichever of description/shortDescription are present, in a
 * single pass (replaces the old two-command sequential special case).
 */
export function applyUpdateQuest(
  args: Record<string, unknown>,
  storyData: StoryData
): Omit<CommandResponse, "toolCallId"> | null {
  const timestamp = Date.now();
  const questTitle = String(args.title ?? "").trim();
  const command = `/update_quest: ${questTitle}`;

  if (!storyData.quests) storyData.quests = [];

  const matchResult = findQuestMatch(questTitle, storyData.quests);
  const quest = matchResult?.item;

  if (!quest) {
    return {
      command,
      success: false,
      message: `Quest "${questTitle}" not found`,
      timestamp,
    };
  }

  const changes: string[] = [];
  if (args.description !== undefined) {
    quest.description = String(args.description);
    changes.push("description");
  }
  if (args.shortDescription !== undefined) {
    quest.shortDescription = String(args.shortDescription);
    changes.push("short description");
  }

  if (changes.length === 0) {
    return {
      command,
      success: false,
      message: `No updates provided for quest "${quest.title}" (need description and/or shortDescription)`,
      timestamp,
    };
  }

  logger.action("Quest updated via tool dispatch", {
    title: quest.title,
    changes,
  });

  const fuzzyNote =
    matchResult && !matchResult.isExact
      ? ` (matched "${questTitle}" → "${quest.title}", ${Math.round(
          matchResult.score * 100
        )}%)`
      : "";

  return {
    command,
    success: true,
    message: `Updated quest "${quest.title}": ${changes.join(", ")} updated${fuzzyNote}`,
    timestamp,
  };
}

/**
 * /delete_quest: quest title
 *
 * NOTE: previously this tool built a `/delete_quest: ...` command string
 * that had no matching regex handler anywhere in this file, so every call
 * silently failed with "Command execution returned null". This is the
 * first real implementation, modeled on applyRemoveAbility's find-and-splice
 * pattern.
 */
export function applyDeleteQuest(
  args: Record<string, unknown>,
  storyData: StoryData
): Omit<CommandResponse, "toolCallId"> | null {
  const timestamp = Date.now();
  const questTitle = String(args.title ?? "").trim();
  const command = `/delete_quest: ${questTitle}`;

  if (!storyData.quests || storyData.quests.length === 0) {
    return {
      command,
      success: false,
      message: `No quests exist to delete`,
      timestamp,
    };
  }

  const matchResult = findQuestMatch(questTitle, storyData.quests);
  const quest = matchResult?.item;

  if (!quest) {
    return {
      command,
      success: false,
      message: `Quest "${questTitle}" not found`,
      timestamp,
    };
  }

  const index = storyData.quests.findIndex((q) => q.id === quest.id);
  if (index !== -1) {
    storyData.quests.splice(index, 1);
  }

  logger.action("Quest deleted via tool dispatch", {
    title: quest.title,
  });

  const fuzzyNote =
    matchResult && !matchResult.isExact
      ? ` (matched "${questTitle}" → "${quest.title}", ${Math.round(
          matchResult.score * 100
        )}%)`
      : "";

  return {
    command,
    success: true,
    message: `Deleted quest "${quest.title}"${fuzzyNote}`,
    timestamp,
  };
}

/**
 * /trigger_achievement: achievement title
 */
export function applyTriggerAchievement(
  args: Record<string, unknown>,
  storyData: StoryData
): Omit<CommandResponse, "toolCallId"> | null {
  const timestamp = Date.now();
  const achievementTitle = String(args.title ?? "").trim();
  const command = `/trigger_achievement: ${achievementTitle}`;

  const matchResult = findAchievementMatch(
    achievementTitle,
    storyData.achievements
  );
  const existing = matchResult?.item;

  if (!existing) {
    return {
      command,
      success: false,
      message: `Achievement "${achievementTitle}" not found`,
      timestamp,
    };
  }

  if (existing.dateAchieved) {
    return {
      command,
      success: "partial",
      message: `Achievement "${existing.title}" was already unlocked`,
      timestamp,
    };
  }

  existing.dateAchieved = new Date();
  storyData.points = (storyData.points || 0) + existing.points;

  const oldLevel = storyData.level || 1;
  const level = calculateLevel(
    storyData.points || 0,
    storyData.levelingSettings
  );
  storyData.level = level;
  const leveledUp = level > oldLevel;

  logger.action("Achievement unlocked via tool dispatch", {
    title: existing.title,
    xp: existing.points,
  });

  const fuzzyNote =
    matchResult && !matchResult.isExact
      ? ` (matched "${achievementTitle}" → "${existing.title}", ${Math.round(
          matchResult.score * 100
        )}%)`
      : "";

  return {
    command,
    success: true,
    message: `Unlocked achievement "${existing.title}" (+${
      existing.points
    } XP${leveledUp ? `, Level Up to ${level}!` : ""})${fuzzyNote}`,
    timestamp,
  };
}

/**
 * /delete_note: note title
 *
 * NOTE: previously this tool built a `/note_delete: ...` command string
 * that had no matching regex handler anywhere in this file, so every call
 * silently failed with "Command execution returned null". This is the
 * first real implementation, modeled on toolExecutor.ts's toggle_lore
 * inline handler's find-by-fuzzy-match pattern, but splicing the entry out
 * instead of toggling it.
 */
export function applyDeleteNote(
  args: Record<string, unknown>,
  storyData: StoryData
): Omit<CommandResponse, "toolCallId"> | null {
  const timestamp = Date.now();
  const noteTitle = String(args.title ?? "").trim();
  const command = `/delete_note: ${noteTitle}`;

  if (!storyData.lore || storyData.lore.length === 0) {
    return {
      command,
      success: false,
      message: `No note entries defined`,
      timestamp,
    };
  }

  const match = findBestMatch(noteTitle, storyData.lore, (l) => l.title);
  if (!match) {
    return {
      command,
      success: false,
      message: `Note "${noteTitle}" not found`,
      timestamp,
    };
  }

  const noteEntry = match.item;
  const index = storyData.lore.indexOf(noteEntry);
  if (index !== -1) {
    storyData.lore.splice(index, 1);
  }

  logger.action("Note deleted via tool dispatch", {
    title: noteEntry.title,
  });

  const fuzzyNote =
    !match.isExact
      ? ` (matched "${noteTitle}" → "${noteEntry.title}", ${Math.round(
          match.score * 100
        )}%)`
      : "";

  return {
    command,
    success: true,
    message: `Deleted note "${noteEntry.title}"${fuzzyNote}`,
    timestamp,
  };
}

/**
 * /remove_ability: name
 */
export function applyRemoveAbility(
  args: Record<string, unknown>,
  storyData: StoryData
): Omit<CommandResponse, "toolCallId"> | null {
  const timestamp = Date.now();
  const abilityName = String(args.name ?? "").trim();
  const command = `/remove_ability: ${abilityName}`;

  if (!storyData.abilities || storyData.abilities.length === 0) {
    return {
      command,
      success: false,
      message: `No abilities exist to remove`,
      timestamp,
    };
  }

  const matchResult = findAbilityMatch(abilityName, storyData.abilities);
  const ability = matchResult?.item;

  if (!ability) {
    return {
      command,
      success: false,
      message: `Ability "${abilityName}" not found`,
      timestamp,
    };
  }

  const index = storyData.abilities.findIndex((a) => a.name === ability.name);
  if (index !== -1) {
    storyData.abilities.splice(index, 1);
  }

  logger.action("Ability removed via tool dispatch", {
    name: ability.name,
  });

  const fuzzyNote =
    matchResult && !matchResult.isExact
      ? ` (matched "${abilityName}" → "${ability.name}")`
      : "";

  return {
    command,
    success: true,
    message: `Removed ability "${ability.name}"${fuzzyNote}`,
    timestamp,
  };
}

/**
 * /modify_ability: name | description? | stat? | costs? | maxCooldown?
 * Applies whichever fields are present independently (the old code only
 * ever set one field per call via a `field` switch; tool args may include
 * any combination, so each field is checked and applied independently).
 */
export function applyModifyAbility(
  args: Record<string, unknown>,
  storyData: StoryData
): Omit<CommandResponse, "toolCallId"> | null {
  const timestamp = Date.now();
  const abilityName = String(args.name ?? "").trim();
  const command = `/modify_ability: ${abilityName}`;

  if (!storyData.abilities || storyData.abilities.length === 0) {
    return {
      command,
      success: false,
      message: `No abilities exist to modify`,
      timestamp,
    };
  }

  const matchResult = findAbilityMatch(abilityName, storyData.abilities);
  const ability = matchResult?.item;

  if (!ability) {
    return {
      command,
      success: false,
      message: `Ability "${abilityName}" not found`,
      timestamp,
    };
  }

  const fuzzyNote =
    matchResult && !matchResult.isExact
      ? ` (matched "${abilityName}" → "${ability.name}")`
      : "";

  const changes: string[] = [];

  if (args.description !== undefined) {
    ability.description = String(args.description);
    changes.push("description");
  }

  if (args.stat !== undefined) {
    const statValue = String(args.stat ?? "").trim();
    ability.stat =
      statValue.toLowerCase() === "none" || statValue === ""
        ? undefined
        : statValue;
    changes.push("stat");
  }

  if (args.costs !== undefined) {
    const newCosts: Array<{
      type: "resource" | "variable";
      name: string;
      amount: number;
    }> = Array.isArray(args.costs)
      ? (args.costs as Array<{
          type: "resource" | "variable";
          name: string;
          amount: number;
        }>)
      : [];
    ability.costs = newCosts;
    changes.push("costs");
  }

  if (args.maxCooldown !== undefined) {
    const newCooldown = Number(args.maxCooldown);
    ability.maxCooldown = newCooldown;
    // Reset current cooldown if reducing max below current
    if (ability.cooldown > newCooldown) {
      ability.cooldown = newCooldown;
    }
    changes.push("maxCooldown");
  }

  if (changes.length === 0) {
    return {
      command,
      success: false,
      message: `No modifications specified for ability "${ability.name}" (provide description, stat, costs, and/or maxCooldown)`,
      timestamp,
    };
  }

  logger.action("Ability modified via tool dispatch", {
    name: ability.name,
    changes,
  });

  return {
    command,
    success: true,
    message: `Modified ${ability.name}: ${changes.join(", ")} updated${fuzzyNote}`,
    timestamp,
  };
}

/**
 * /upgrade_ability: name
 */
export function applyUpgradeAbility(
  args: Record<string, unknown>,
  storyData: StoryData
): Omit<CommandResponse, "toolCallId"> | null {
  const timestamp = Date.now();
  const abilityName = String(args.name ?? "").trim();
  const command = `/upgrade_ability: ${abilityName}`;

  if (!storyData.abilities || storyData.abilities.length === 0) {
    return {
      command,
      success: false,
      message: `No abilities exist to upgrade`,
      timestamp,
    };
  }

  const matchResult = findAbilityMatch(abilityName, storyData.abilities);
  const ability = matchResult?.item;

  if (!ability) {
    return {
      command,
      success: false,
      message: `Ability "${abilityName}" not found`,
      timestamp,
    };
  }

  const currentGradeIndex = ABILITY_GRADE_ORDER.indexOf(
    ability.grade || "novice"
  );
  if (currentGradeIndex >= ABILITY_GRADE_ORDER.length - 1) {
    return {
      command,
      success: "partial" as const,
      message: `${ability.name} is already at Legendary grade (max)`,
      timestamp,
    };
  }

  const newGrade = ABILITY_GRADE_ORDER[currentGradeIndex + 1];
  const oldGrade = ability.grade;
  ability.grade = newGrade;

  logger.action("Ability upgraded via tool dispatch", {
    name: ability.name,
    oldGrade,
    newGrade,
  });

  const fuzzyNote =
    matchResult && !matchResult.isExact
      ? ` (matched "${abilityName}" → "${ability.name}")`
      : "";
  const newGradeLabel = newGrade.charAt(0).toUpperCase() + newGrade.slice(1);

  return {
    command,
    success: true,
    message: `Upgraded ${ability.name} to ${newGradeLabel}!${fuzzyNote}`,
    timestamp,
  };
}

/**
 * /reset_ability_cooldown: name (also used for the identical refresh_ability tool)
 */
export function applyResetAbilityCooldown(
  args: Record<string, unknown>,
  storyData: StoryData
): Omit<CommandResponse, "toolCallId"> | null {
  const timestamp = Date.now();
  const abilityName = String(args.name ?? "").trim();
  const command = `/reset_ability_cooldown: ${abilityName}`;

  if (!storyData.abilities || storyData.abilities.length === 0) {
    return {
      command,
      success: false,
      message: `No abilities exist`,
      timestamp,
    };
  }

  const matchResult = findAbilityMatch(abilityName, storyData.abilities);
  const ability = matchResult?.item;

  if (!ability) {
    return {
      command,
      success: false,
      message: `Ability "${abilityName}" not found`,
      timestamp,
    };
  }

  if (ability.cooldown === 0) {
    return {
      command,
      success: "partial" as const,
      message: `${ability.name} is already ready`,
      timestamp,
    };
  }

  const oldCooldown = ability.cooldown;
  ability.cooldown = 0;

  logger.action("Ability refreshed via tool dispatch", {
    name: ability.name,
    oldCooldown,
  });

  const fuzzyNote =
    matchResult && !matchResult.isExact
      ? ` (matched "${abilityName}" → "${ability.name}")`
      : "";

  return {
    command,
    success: true,
    message: `Refreshed ${ability.name} (was ${oldCooldown} turns remaining)${fuzzyNote}`,
    timestamp,
  };
}

/**
 * /reduce_cooldown: name | amount
 */
export function applyReduceCooldown(
  args: Record<string, unknown>,
  storyData: StoryData
): Omit<CommandResponse, "toolCallId"> | null {
  const timestamp = Date.now();
  const abilityName = String(args.name ?? "").trim();
  const amount = Number(args.amount ?? 0);
  const command = `/reduce_cooldown: ${abilityName} | ${amount}`;

  if (!storyData.abilities || storyData.abilities.length === 0) {
    return {
      command,
      success: false,
      message: `No abilities exist`,
      timestamp,
    };
  }

  const matchResult = findAbilityMatch(abilityName, storyData.abilities);
  const ability = matchResult?.item;

  if (!ability) {
    return {
      command,
      success: false,
      message: `Ability "${abilityName}" not found`,
      timestamp,
    };
  }

  if (ability.cooldown === 0) {
    return {
      command,
      success: "partial" as const,
      message: `${ability.name} is not on cooldown`,
      timestamp,
    };
  }

  const oldCooldown = ability.cooldown;
  ability.cooldown = Math.max(0, ability.cooldown - amount);

  logger.action("Ability cooldown reduced via tool dispatch", {
    name: ability.name,
    oldCooldown,
    newCooldown: ability.cooldown,
    reduced: amount,
  });

  const fuzzyNote =
    matchResult && !matchResult.isExact
      ? ` (matched "${abilityName}" → "${ability.name}")`
      : "";

  return {
    command,
    success: true,
    message: `Reduced ${ability.name} cooldown by ${amount} (${oldCooldown} → ${ability.cooldown})${fuzzyNote}`,
    timestamp,
  };
}

/**
 * /adjust_resource: resource name | delta
 */
export function applyAdjustResource(
  args: Record<string, unknown>,
  storyData: StoryData
): Omit<CommandResponse, "toolCallId"> | null {
  const timestamp = Date.now();
  const resourceName = String(args.name ?? "").trim();
  const delta = Number(args.delta ?? 0);
  const command = `/adjust_resource: ${resourceName} | ${delta}`;

  const matchResult = findResourceMatch(resourceName, storyData.resources);
  const resource = matchResult?.item;

  if (!resource) {
    return {
      command,
      success: false,
      message: `Resource "${resourceName}" not found`,
      timestamp,
    };
  }

  // Ensure resource.value is a valid number (prevent NaN)
  if (typeof resource.value !== "number" || isNaN(resource.value)) {
    resource.value = 0;
  }

  const oldValue = resource.value;
  resource.value = Math.max(
    0,
    Math.min(resource.maxValue, resource.value + (isNaN(delta) ? 0 : delta))
  );
  const actualDelta = resource.value - oldValue;

  logger.action("Resource adjusted via tool dispatch", {
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
    command,
    success: true,
    message: `${resource.name}: ${oldValue} → ${resource.value}/${
      resource.maxValue
    } (${actualDelta > 0 ? "+" : ""}${actualDelta})${fuzzyNote}`,
    timestamp,
  };
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
