import { StoryData } from "./structs";

export interface ObjectiveSummary {
  key: string;
  title: string;
  kind: "quest" | "thread";
  detail?: string; // e.g. "25 pts" or thread priority
}

/**
 * Active quests + active story threads, combined into one glanceable list
 * for a compact "Objectives" strip - the full Journal page (quests.tsx)
 * still has the detailed view with descriptions, completed/abandoned
 * history, etc. This is just "what's currently open".
 */
export function getActiveObjectives(storyData: StoryData): ObjectiveSummary[] {
  const quests: ObjectiveSummary[] = (storyData.quests || [])
    .filter((q) => q.active && !q.fulfilled)
    .map((q) => ({
      key: `quest-${q.id}`,
      title: q.title,
      kind: "quest" as const,
      detail: q.points ? `${q.points} pts` : undefined,
    }));

  const threads: ObjectiveSummary[] = (storyData.threads || [])
    .filter((t) => t.status === "active")
    .map((t) => ({
      key: `thread-${t.id}`,
      title: t.title,
      kind: "thread" as const,
      detail: t.priority,
    }));

  return [...quests, ...threads];
}
