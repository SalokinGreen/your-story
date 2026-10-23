/**
 * What the session-zero strip shows (docs/session-zero-design.md 3.2 and 3.8),
 * worked out from the story alone so it can be tested without a DOM.
 */
import { getSetupNotes, getSetupProgress } from "./campaignPlan";
import type { StoryData } from "./structs";

export type SetupStripStepId = "concept" | "character" | "campaign" | "start";

export interface SetupStripStep {
  id: SetupStripStepId;
  label: string;
  done: boolean;
  /** Title of the note this step opens on the Notes page, when it has one. */
  noteTitle?: string;
}

export type SetupStripState =
  | { kind: "hidden" }
  /** No style chosen yet: the two buttons. */
  | { kind: "choose" }
  | {
      kind: "checklist";
      steps: SetupStripStep[];
      /** The plan and sheet are done and only the player's OK is missing. */
      awaitingApproval: boolean;
    };

export const SETUP_STYLE_LINES = {
  quick: "Let's do a quick setup.",
  full: "Let's build my character step by step.",
} as const;

export function setupStripState(
  story: StoryData,
  players?: ReadonlyArray<{ id: string; name: string }>,
): SetupStripState {
  if (story.sessionZeroActive !== true) return { kind: "hidden" };
  if (!story.setup?.mode) return { kind: "choose" };

  const progress = getSetupProgress(story, players);
  const { sheets, plan } = getSetupNotes(story);
  return {
    kind: "checklist",
    awaitingApproval: progress.character && progress.campaign && !progress.approved,
    steps: [
      { id: "concept", label: "Concept", done: progress.concept },
      {
        id: "character",
        label: "Character",
        done: progress.character,
        noteTitle: sheets[0]?.title,
      },
      {
        id: "campaign",
        label: "Campaign",
        done: progress.campaign,
        noteTitle: plan?.title,
      },
      { id: "start", label: "Start", done: progress.approved },
    ],
  };
}
