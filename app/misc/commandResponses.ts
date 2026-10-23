/**
 * Command response generation for AI feedback loop.
 *
 * When the AI sends commands like `/complete_goal`,
 * this module executes them and generates responses describing what happened.
 * These responses are sent back to the AI in the next message, allowing it to:
 * - See if commands succeeded or failed
 * - Self-correct typos or invalid references
 * - Adjust narrative based on actual game state changes
 * - Understand validation results (fuzzy matching, resource checks, etc.)
 */

import type { StoryData, CommandResponse } from "./structs";
import { findGoalMatch, findBestMatch } from "./fuzzyMatch";
import { logger } from "./logger";

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
 * first real implementation: a find-by-fuzzy-match, then splicing the entry
 * out.
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
