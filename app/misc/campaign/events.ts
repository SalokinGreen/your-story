/**
 * Turn events from typed results (plan, "Revised after Codex's review",
 * finding 1). A graded miss comes back with `success: false`, so `success` says
 * nothing here: the result's own type and outcome do. A result whose text opens
 * with `[ERROR` (a refused or malformed call) is no event.
 */

import type { ClockTrigger } from "./types";

interface ResultLike {
  toolName: string;
  success: boolean;
  result?: unknown;
  contextForStory?: string;
}

function isErrorText(r: ResultLike): boolean {
  const text = r.contextForStory ?? "";
  return text.startsWith("[ERROR") || text.startsWith("[State Failed");
}

/** The clock triggers one tool result earns, in the order they should tick. */
export function turnEventsFrom(r: ResultLike): ClockTrigger[] {
  if (isErrorText(r)) return [];
  const res = r.result as
    | { type?: string; action?: string; outcome?: string }
    | undefined;
  switch (res?.type) {
    case "action_roll":
    case "feat_roll":
      return res.outcome === "miss" ? ["miss"] : [];
    case "manage_track":
      return res.action === "progress_roll" && res.outcome === "miss" ? ["miss"] : [];
    case "record_challenge_result":
      return res.outcome === "failure" || res.outcome === "miss" ? ["miss"] : [];
    case "take_rest":
      return r.success ? ["rest"] : [];
    case "end_session":
      return r.success ? ["session"] : [];
    default:
      break;
  }
  // increment_scene is a state tool: its result is a plain state change.
  if (r.toolName === "increment_scene" && r.success) return ["scene"];
  return [];
}
