/**
 * The dice drawer (randomness plan R3, design 3.1, decision 259): a very light
 * handful of rolled material the GM may use this turn and may ignore: three
 * names and one meaning pair. Drawn once per turn by generateStoryTurnOnce and
 * printed in the live block only. Never stored in StoryData (the names reach
 * the ledger), never in a tool result, never in the narration context.
 */
import type { StoryData } from "./structs";
import { rollNames } from "./names/roll";
import { drawMeaningPair } from "./mythic";

export interface DiceDrawer {
  names: string[];
  meaning: { action: string; description: string };
}

export function drawDrawer(story: StoryData, rng: () => number = Math.random): DiceDrawer {
  return {
    names: rollNames(story, "person", 3, { rng }),
    meaning: drawMeaningPair(rng),
  };
}

export function formatDrawer(d: DiceDrawer | "preview"): string {
  const head = "DICE DRAWER (rolled by the engine; use only what this turn needs)";
  if (d === "preview") return `${head}\n(rolled when a turn starts)`;
  return `${head}\nNames: ${d.names.join(" · ")}   Meaning: ${d.meaning.action} / ${d.meaning.description}`;
}
