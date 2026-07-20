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
  findGoalMatch,
  findRelationshipMatch,
  findLoreMatch,
  findAbilityMatch,
  findBestMatch,
} from "./fuzzyMatch";
import { logger } from "./logger";
import { ABILITY_GRADE_ORDER, initializeAbility } from "./abilitySystem";

// === DIRECT TYPED TOOL DISPATCH ===
//
// The functions below implement the same logic that used to live behind
// `/command: args` regex blocks above, but take the already-parsed tool
// `args` object directly instead of round-tripping through a pipe-delimited
// command string. See toolExecutor.ts's TOOL_DISPATCH table for wiring.

/**
 * /complete_goal: goal title
 */
export function applyCompleteGoal(
  args: Record<string, unknown>,
  storyData: StoryData
): Omit<CommandResponse, "toolCallId"> | null {
  const timestamp = Date.now();
  const goalTitle = String(args.title ?? "").trim();
  const command = `/complete_goal: ${goalTitle}`;

  if (!storyData.goals) storyData.goals = [];

  const matchResult = findGoalMatch(goalTitle, storyData.goals);
  const goal = matchResult?.item;

  if (!goal) {
    return {
      command,
      success: false,
      message: `Goal "${goalTitle}" not found`,
      timestamp,
    };
  }

  if (goal.fulfilled) {
    return {
      command,
      success: "partial",
      message: `Goal "${goal.title}" was already completed`,
      timestamp,
    };
  }

  goal.fulfilled = true;

  logger.action("Goal completed via tool dispatch", {
    title: goal.title,
  });

  const fuzzyNote =
    matchResult && !matchResult.isExact
      ? ` (matched "${goalTitle}" → "${goal.title}", ${Math.round(
          matchResult.score * 100
        )}%)`
      : "";

  return {
    command,
    success: true,
    message: `Completed goal "${goal.title}"${fuzzyNote}`,
    timestamp,
  };
}

/**
 * /fail_goal: goal title
 */
export function applyFailGoal(
  args: Record<string, unknown>,
  storyData: StoryData
): Omit<CommandResponse, "toolCallId"> | null {
  const timestamp = Date.now();
  const goalTitle = String(args.title ?? "").trim();
  const command = `/fail_goal: ${goalTitle}`;

  if (!storyData.goals) storyData.goals = [];

  const matchResult = findGoalMatch(goalTitle, storyData.goals);
  const goal = matchResult?.item;

  if (!goal) {
    return {
      command,
      success: false,
      message: `Goal "${goalTitle}" not found`,
      timestamp,
    };
  }

  if (goal.fulfilled) {
    return {
      command,
      success: "partial",
      message: `Goal "${goal.title}" was already completed (cannot fail)`,
      timestamp,
    };
  }

  // Mark goal as inactive (failed)
  goal.active = false;

  logger.action("Goal failed via tool dispatch", {
    title: goal.title,
  });

  const fuzzyNote =
    matchResult && !matchResult.isExact
      ? ` (matched "${goalTitle}" → "${goal.title}", ${Math.round(
          matchResult.score * 100
        )}%)`
      : "";

  return {
    command,
    success: true,
    message: `Failed goal "${goal.title}"${fuzzyNote}`,
    timestamp,
  };
}

/**
 * /update_goal: goal title | description? | shortDescription?
 * Updates whichever of description/shortDescription are present, in a
 * single pass (replaces the old two-command sequential special case).
 */
export function applyUpdateGoal(
  args: Record<string, unknown>,
  storyData: StoryData
): Omit<CommandResponse, "toolCallId"> | null {
  const timestamp = Date.now();
  const goalTitle = String(args.title ?? "").trim();
  const command = `/update_goal: ${goalTitle}`;

  if (!storyData.goals) storyData.goals = [];

  const matchResult = findGoalMatch(goalTitle, storyData.goals);
  const goal = matchResult?.item;

  if (!goal) {
    return {
      command,
      success: false,
      message: `Goal "${goalTitle}" not found`,
      timestamp,
    };
  }

  const changes: string[] = [];
  if (args.description !== undefined) {
    goal.description = String(args.description);
    changes.push("description");
  }
  if (args.shortDescription !== undefined) {
    goal.shortDescription = String(args.shortDescription);
    changes.push("short description");
  }

  if (changes.length === 0) {
    return {
      command,
      success: false,
      message: `No updates provided for goal "${goal.title}" (need description and/or shortDescription)`,
      timestamp,
    };
  }

  logger.action("Goal updated via tool dispatch", {
    title: goal.title,
    changes,
  });

  const fuzzyNote =
    matchResult && !matchResult.isExact
      ? ` (matched "${goalTitle}" → "${goal.title}", ${Math.round(
          matchResult.score * 100
        )}%)`
      : "";

  return {
    command,
    success: true,
    message: `Updated goal "${goal.title}": ${changes.join(", ")} updated${fuzzyNote}`,
    timestamp,
  };
}

/**
 * /delete_goal: goal title
 */
export function applyDeleteGoal(
  args: Record<string, unknown>,
  storyData: StoryData
): Omit<CommandResponse, "toolCallId"> | null {
  const timestamp = Date.now();
  const goalTitle = String(args.title ?? "").trim();
  const command = `/delete_goal: ${goalTitle}`;

  if (!storyData.goals || storyData.goals.length === 0) {
    return {
      command,
      success: false,
      message: `No goals exist to delete`,
      timestamp,
    };
  }

  const matchResult = findGoalMatch(goalTitle, storyData.goals);
  const goal = matchResult?.item;

  if (!goal) {
    return {
      command,
      success: false,
      message: `Goal "${goalTitle}" not found`,
      timestamp,
    };
  }

  const index = storyData.goals.findIndex((g) => g.id === goal.id);
  if (index !== -1) {
    storyData.goals.splice(index, 1);
  }

  logger.action("Goal deleted via tool dispatch", {
    title: goal.title,
  });

  const fuzzyNote =
    matchResult && !matchResult.isExact
      ? ` (matched "${goalTitle}" → "${goal.title}", ${Math.round(
          matchResult.score * 100
        )}%)`
      : "";

  return {
    command,
    success: true,
    message: `Deleted goal "${goal.title}"${fuzzyNote}`,
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
