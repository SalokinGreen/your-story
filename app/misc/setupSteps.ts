/**
 * Creation steps: what a full "step by step" session zero must cover before the
 * setup card can open (docs/session-zero-detail-design.md 3.1-3.3).
 *
 * A step is asked and answered through ask_question's `setup_step` tag and
 * recorded in `StoryData.setup.covered` by the executor. The engine knows a
 * step was asked and answered under its tag, not that the question was good.
 *
 * (`SetupStep` in campaignPlan.ts is the coarse workflow step; this is the
 * finer list inside its "interview".)
 */
import type { StoryData } from "./structs";
import { resolveSystem } from "./systems/resolve";

export interface CreationStep {
  id: string; // "kind", "connections"...
  label: string; // "Kind", "Connections"
  group: "table" | "world" | "character" | "self";
  /** Asked once for the table, or once per player. */
  scope: "table" | "player";
  /** One line: what to ask and what it needs. Original words. */
  hint: string;
}

/** The player id used for solo play in `setup.covered.players`. */
export const SOLO_PLAYER_ID = "solo";

/** In quick mode only these steps are required. */
export const QUICK_REQUIRED_STEPS = ["setting", "tone"];

type Roster = ReadonlyArray<{ id: string; name: string }>;

const COHORT_STEP: CreationStep = {
  id: "cohort",
  label: "Why you are together",
  group: "table",
  scope: "table",
  hint: "Ask the whole table why these characters stay together: a shared threat, an organisation, found family, paid work, or their own idea.",
};

const WORLD_STEPS: CreationStep[] = [
  {
    id: "setting",
    label: "Setting",
    group: "world",
    scope: "table",
    hint: "Where and when it is set: the city or region, the era, the feel of the place.",
  },
  {
    id: "tone",
    label: "Tone",
    group: "world",
    scope: "table",
    hint: "The mood they want (horror, intrigue, action, romance, tragedy...). Multi-select; their own words welcome.",
  },
  {
    id: "campaign",
    label: "Campaign",
    group: "world",
    scope: "table",
    hint: "The kind of campaign: what they want to face, and roughly how long it should run.",
  },
];

const SELF_STEPS: CreationStep[] = [
  {
    id: "name_look",
    label: "Name and look",
    group: "self",
    scope: "player",
    hint: "Their name, how they look and how they carry themselves. Offer suggestions.",
  },
  {
    id: "history",
    label: "History",
    group: "self",
    scope: "player",
    hint: "Three questions under this one tag: what they were before, the moment things changed, who knows and how that went.",
  },
  {
    id: "drives",
    label: "Drives",
    group: "self",
    scope: "player",
    hint: "What they want, and what they fear. Offer suggestions.",
  },
];

/** A story with no system but a mechanics note gets this one step. */
const ABILITIES_STEP: CreationStep = {
  id: "abilities",
  label: "Abilities",
  group: "character",
  scope: "player",
  hint: "What they can do, drawn from the mechanics note: strengths, skills or powers it names.",
};

/** The people setup is for: the required players, else one solo player. */
export function setupParticipants(
  story: StoryData,
  players?: Roster,
): { id: string; name: string }[] {
  const required: Roster =
    players && players.length > 0
      ? players
      : (story.multiplayer?.couchPlayers?.length ?? 0) > 1
        ? (story.multiplayer?.couchPlayers ?? [])
        : [];
  if (required.length > 1) return required.map((p) => ({ id: p.id, name: p.name }));
  return [{ id: SOLO_PLAYER_ID, name: story.player_name?.trim() || "the player" }];
}

/** Every creation step this story has, in order (required or not). */
export function getCreationSteps(story: StoryData, players?: Roster): CreationStep[] {
  const steps: CreationStep[] = [];
  if (setupParticipants(story, players).length > 1) steps.push(COHORT_STEP);
  steps.push(...WORLD_STEPS);
  const system = resolveSystem(story).system;
  if (system) {
    steps.push(...(system.creationSteps ?? []));
  } else if (
    (story.lore || []).some((l) => l.type === "mechanics" && l.enabled !== false)
  ) {
    steps.push(ABILITIES_STEP);
  }
  steps.push(...SELF_STEPS);
  return steps;
}

/**
 * Whether a step must be covered before the card opens. Full mode: all of
 * them. Quick mode: setting and tone. No mode chosen yet (an old save, a bare
 * test story): none.
 */
export function isStepRequired(story: StoryData, step: CreationStep): boolean {
  const mode = story.setup?.mode;
  if (mode === "full") return true;
  if (mode === "quick") return QUICK_REQUIRED_STEPS.includes(step.id);
  return false;
}

/** The required steps, in order. */
export function getRequiredSteps(story: StoryData, players?: Roster): CreationStep[] {
  return getCreationSteps(story, players).filter((s) => isStepRequired(story, s));
}

/** Whether a pre-made character sheet covers this player's own steps. */
export function isPremade(story: StoryData, playerId: string): boolean {
  return story.setup?.premadeFor?.includes(playerId) ?? false;
}

/** Required table steps once + required player steps per player without a pre-made sheet. */
export function creationTotal(story: StoryData, players?: Roster): number {
  const people = setupParticipants(story, players);
  const n = people.filter((p) => !isPremade(story, p.id)).length;
  return getRequiredSteps(story, players).reduce(
    (sum, s) => sum + (s.scope === "table" ? 1 : n),
    0,
  );
}

/** Whether a step is covered (for the table, or for one player). */
export function isStepCovered(
  story: StoryData,
  step: CreationStep,
  playerId?: string,
): boolean {
  const covered = story.setup?.covered;
  if (!covered) return false;
  if (step.scope === "table") return covered.table?.includes(step.id) ?? false;
  if (!playerId) return false;
  return covered.players?.[playerId]?.includes(step.id) ?? false;
}

export interface MissingCreationStep {
  step: CreationStep;
  /** The player's name, for a player-scope step. */
  player?: string;
  playerId?: string;
}

export interface CreationProgress {
  covered: number;
  total: number;
  /** In step order, then player order. */
  missing: MissingCreationStep[];
}

/** How far the required steps have got. */
export function getCreationProgress(story: StoryData, players?: Roster): CreationProgress {
  const people = setupParticipants(story, players);
  const missing: MissingCreationStep[] = [];
  let covered = 0;
  let total = 0;
  for (const step of getRequiredSteps(story, players)) {
    if (step.scope === "table") {
      total++;
      if (isStepCovered(story, step)) covered++;
      else missing.push({ step });
    } else {
      for (const p of people) {
        if (isPremade(story, p.id)) continue;
        total++;
        if (isStepCovered(story, step, p.id)) covered++;
        else missing.push({ step, player: p.name, playerId: p.id });
      }
    }
  }
  return { covered, total, missing };
}

/** "Kind (Nik)" or "Setting". */
export function describeMissing(m: MissingCreationStep): string {
  return m.player ? `${m.step.label} (${m.player})` : m.step.label;
}
