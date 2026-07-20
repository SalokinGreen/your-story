import { StoryData } from "./structs";

export interface ObjectiveSummary {
  key: string;
  title: string;
  kind: "goal" | "thread";
  detail?: string; // e.g. thread priority
}

/**
 * Active goals + active story threads, combined into one glanceable list
 * for a compact "Objectives" strip - the full Journal page (goals.tsx)
 * still has the detailed view with descriptions, completed/abandoned
 * history, etc. This is just "what's currently open".
 */
export function getActiveObjectives(storyData: StoryData): ObjectiveSummary[] {
  const goals: ObjectiveSummary[] = (storyData.goals || [])
    .filter((g) => g.active && !g.fulfilled)
    .map((g) => ({
      key: `goal-${g.id}`,
      title: g.title,
      kind: "goal" as const,
    }));

  const threads: ObjectiveSummary[] = (storyData.threads || [])
    .filter((t) => t.status === "active")
    .map((t) => ({
      key: `thread-${t.id}`,
      title: t.title,
      kind: "thread" as const,
      detail: t.priority,
    }));

  return [...goals, ...threads];
}
