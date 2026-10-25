/**
 * Wolfwillow Crossing: Fantastic Realms' first starter (design section 4,
 * decisions 197, 210). It opens in Larkenfell, the folk frontier, on an
 * arrival: a village getting ready for Lantern Week, nothing wrong yet. The
 * authored opening is played after setup and the briefing (decision 197), not
 * first. Original text (decision 3).
 */
import type { Adventure, StoryLore, SystemState } from "../../../../structs";
import { createCharacterSheetTemplate } from "../../../../characterSheetTemplate";
import type { BuiltinAdventure, BuiltinNote } from "../../../types";
import { builtinToLore } from "../../../blood-and-bone/starters/shared";
import { FANTASTIC_REALMS_SHEET_TEMPLATE } from "../../sheet";
import { WOLFWILLOW_NOTES } from "./notes";
import { WOLFWILLOW_PRESETS } from "./heroes";

export const WOLFWILLOW_CROSSING_ID = "builtin:fantastic-realms:wolfwillow-crossing";

export const WOLFWILLOW_PREMISE =
  "Larkenfell is a land of farms, slow rivers and old woods, where neighbours matter more than kings. Wolfwillow Crossing is a village at the long wooden bridge over the Sallow, and tonight, Lantern Eve, it begins a week of paper lanterns, cider and a fair on the green. You have come, each for your own reason. Nothing is wrong yet. But the new dam at Oakhallow Mill has changed the water, the goblins are early this year, and the barrow on Greyhill has been quiet a very long time.";

export const WOLFWILLOW_INTRO = `The road comes down out of the pines in the last gold hour of the day, and there is Wolfwillow Crossing: a dozen chimneys, a long wooden bridge over the Sallow, and a ferry-house with every window lit. Somebody has strung paper lanterns from the bridge rails to the old willow on the far bank, and the smell of woodsmoke and baked apples reaches you before the sound of a fiddle does. It is the eve of Lantern Week, and the whole valley seems to have walked in to be part of it.

Carts are lined along the green. Children dart between the wheels with fistfuls of ribbon. A broad woman in a flour-white apron is shouting that the last of the cider will go by dark, and a lean old man on the ferry-house steps is watching every new face come over the bridge, yours included, with the careful look of someone counting. A hand-painted sign above him reads WELCOME, TRAVELLERS, and below it, in smaller letters, somebody has chalked: please sign the book.

Nothing is wrong yet. There is a bed to find, a supper to eat, and a story to tell about why you came.`;

/**
 * `packNotes` is the rules pack plus the world pack, in that order. The
 * starter copies all of it: the rules, the Crossroads overview, every realm
 * and the tables, so the heroes can travel. They cannot be left to the loader:
 * a story started from an adventure is seeded as already offered every note
 * it would be given (seedBuiltinNotesOffered), so a realm not copied here
 * would never arrive. The GM sees the realms by title and reads them on demand.
 */
export function buildWolfwillowCrossing(packNotes: BuiltinNote[]): BuiltinAdventure {
  const copied = packNotes;
  const lore: StoryLore[] = [...copied.map(builtinToLore), ...WOLFWILLOW_NOTES];

  const systemState: SystemState = {
    sessionCount: 0,
    dedupKeys: [],
    systemId: "fantastic-realms",
    setting: "crossroads",
  };

  const adventure: Partial<Adventure> = {
    title: "Wolfwillow Crossing",
    shortDescription:
      "Arrive at a frontier village on Lantern Eve. Nothing is wrong yet, but the barrow on the hill has been quiet a very long time.",
    description:
      "A Fantastic Realms starter in Larkenfell, the folk frontier. You arrive at Wolfwillow Crossing on the eve of Lantern Week: paper lanterns, cider, a fiddle on the green and a ferry-keeper who counts everyone who comes. Three pre-made heroes to play or to build your own with four feats. A short campaign with a slow-burn mystery under the hill, goblins in the orchards and a choice about how it ends.",
    author: "Endless Adventure",
    tags: ["fantasy", "folk", "campaign", "Fantastic Realms"],
    difficulty: "easy",
    estimatedDuration: "A few sessions",
    nsfw: false,
    isPublished: false,
    isFeatured: false,
    presets: WOLFWILLOW_PRESETS,
    storyTemplate: {
      story_name: "Wolfwillow Crossing",
      premise: WOLFWILLOW_PREMISE,
      intro: WOLFWILLOW_INTRO,
      memory: [],
      currentChapter: 0,
      chapters: [],
      scene: { parts: [] },
      lore,
      npcs: [],
      goals: [],
      presets: WOLFWILLOW_PRESETS,
      sessionZeroActive: true,
      systemState,
    },
    characterSheetTemplate: createCharacterSheetTemplate(FANTASTIC_REALMS_SHEET_TEMPLATE),
  };

  return { id: WOLFWILLOW_CROSSING_ID, adventure };
}
