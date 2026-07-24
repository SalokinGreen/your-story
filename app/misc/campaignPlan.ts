/**
 * Campaign Plan — Phase 2 (deterministic re-planning gate) + Phase 3 (spine
 * presets by campaign length).
 *
 * Phase 1 (docs/gm-plan-notes-design.md) is prompt-only: the GM is *told* to
 * keep its `gm_plan` spine one beat ahead. Phase 2 adds the structural
 * enforcement, mirroring the M2 roll-invariant gate in reasoningTiers.ts /
 * generation.ts. A lightweight `PlanState` tracks which fixed beat is being
 * run and whether the GM has marked it complete without yet detailing the
 * next one; when it has, `isPlanAwaitingNextBeat` is true and the GM-stage
 * loop refuses to end the turn on prose alone until `advance_plan` writes the
 * next beat. Fail-open, same as M2: it nudges, it never hard-blocks play.
 *
 * The beat NAMES within a preset are fixed (a product decision - see the
 * design doc) so the gate has stable identifiers to advance through, and so
 * campaigns of a given length share a recognizable dramatic spine instead of
 * bespoke per-story naming. Phase 3 adds three presets (short/medium/long) so
 * a one-shot and a long campaign don't share the same beat count - the GM
 * picks one at spine-note creation time based on the campaign's scope.
 */
import type { StoryData, StoryLore, PlanState, SpineLength } from "./structs";

/** One-shot / short-arc spine: a few sessions, no room for a slow build. */
export const CAMPAIGN_SPINE_SHORT = [
  "Opening Image (Session 0)",
  "Inciting Incident",
  "Rising Action",
  "Climax",
  "Resolution",
] as const;

/** Default spine for an ordinary multi-session campaign. */
export const CAMPAIGN_SPINE_MEDIUM = [
  "Opening Image (Session 0)",
  "Inciting Incident (Session 1)",
  "Rising Complications",
  "Midpoint Turn",
  "Crisis",
  "Climax",
  "Resolution",
] as const;

/** Extended-campaign spine: a fuller Save-the-Cat-style beat sheet, for
 * long-form campaigns that need more medium-horizon texture than the medium
 * preset's single "Rising Complications" catch-all beat provides. */
export const CAMPAIGN_SPINE_LONG = [
  "Opening Image (Session 0)",
  "Setup / Ordinary World",
  "Theme Stated",
  "Inciting Incident (Session 1)",
  "Debate",
  "Break Into Rising Action",
  "B-Story (Allies & Relationships)",
  "Fun and Games (Early Wins)",
  "Midpoint Turn",
  "Bad Guys Close In (Escalating Complications)",
  "All Is Lost",
  "Dark Night of the Soul",
  "Break Into Finale",
  "Climax",
  "Resolution (Final Image)",
] as const;

/** @deprecated Use CAMPAIGN_SPINE_MEDIUM (same beats) or CAMPAIGN_SPINE_PRESETS. */
export const CAMPAIGN_SPINE_BEATS = CAMPAIGN_SPINE_MEDIUM;

export const CAMPAIGN_SPINE_PRESETS: Record<SpineLength, readonly string[]> = {
  short: CAMPAIGN_SPINE_SHORT,
  medium: CAMPAIGN_SPINE_MEDIUM,
  long: CAMPAIGN_SPINE_LONG,
};

/** The gm_plan note that is the campaign spine (as opposed to a per-player arc
 * note or a side-beat note). Prefers the title captured in planState, then a
 * title matching "Campaign Plan", then the first gm_plan note that isn't the
 * active side beat. */
export function findSpinePlanNote(state: StoryData): StoryLore | undefined {
  const plans = (state.lore || []).filter(
    (l) => l.enabled !== false && l.type === "gm_plan",
  );
  if (plans.length === 0) return undefined;

  const capturedTitle = state.planState?.spineNoteTitle;
  if (capturedTitle) {
    const match = plans.find((l) => l.title === capturedTitle);
    if (match) return match;
  }
  const named = plans.find((l) => /campaign plan/i.test(l.title));
  if (named) return named;
  return plans.find((l) => l.title !== state.activeSideBeatTitle);
}

/** Build a fresh PlanState anchored to a spine note, using the beat preset
 * for the given campaign length (defaults to "medium" when unspecified or
 * unrecognized). */
export function initPlanState(
  spineNoteTitle: string,
  spineLength: SpineLength = "medium",
): PlanState {
  const beats = CAMPAIGN_SPINE_PRESETS[spineLength] ?? CAMPAIGN_SPINE_MEDIUM;
  return {
    beats: [...beats],
    currentBeatIndex: 0,
    spineNoteTitle,
    spineLength,
  };
}

/** The name of the beat currently being run, or undefined if state is absent/exhausted. */
export function currentBeatName(state: StoryData): string | undefined {
  const ps = state.planState;
  if (!ps) return undefined;
  return ps.beats[ps.currentBeatIndex];
}

/**
 * Plan-advance gate: the GM marked the current beat complete
 * (advance_plan action:"complete_current") but has not yet written and moved
 * to the next beat (action:"write_next"). While true, the turn must not end
 * on prose - the plan would be left a beat behind itself.
 */
export function isPlanAwaitingNextBeat(state: StoryData): boolean {
  return !!state.planState?.awaitingNextBeat;
}
