/**
 * The Last Resort: Blood & Bone's haunted-hotel campaign starter (design
 * docs/bb-starters-design.md 4, decisions 165, 167-169). A family inherits a
 * broke hotel full of the dead and something in the boiler room. Comedy and
 * horror from the same place. Set in its own world, not Europe by Night, so
 * it copies the Rules pack's own-world notes only (`ownWorldRulesNotes`) and
 * carries `systemState.setting = "last-resort"`. Original text (decision 3).
 */
import type { Adventure, StoryLore } from "../../../../structs";
import { createCharacterSheetTemplate } from "../../../../characterSheetTemplate";
import { createMeter, createTrack } from "../../../../metersAndTracks";
import type { BuiltinAdventure, BuiltinNote } from "../../../types";
import { BLOOD_AND_BONE_SHEET_TEMPLATE } from "../../sheet";
import { builtinToLore, ownWorldRulesNotes } from "../shared";
import { LR_FAMILY_NOTE, LR_PRESETS } from "./family";
import { LR_NOTES } from "./notes";
import { LR_NPCS } from "./people";

export const LAST_RESORT_ID = "builtin:blood-and-bone:last-resort";

const PREMISE =
  "Somebody in the family died and left you a hotel. It is in a small town in the hills, it is in debt, and it is full of the dead: guests who checked in and never left, staff who never clocked off, and something in the boiler room that the will asked you, in writing, not to feed. You have one season to make it pay, or the bank takes it, and the dead have opinions about that.";

const INTRO =
  "The lawyer leaves before you have finished reading the will, which is the first bad sign. The second is the hotel's bell, ringing by itself at the empty front desk. The third is the old man behind it, who was not there a moment ago and is see-through at the edges. \"Checking in?\" he says, and then, looking at your face: \"Oh. Oh, you're *family*. Well. Nobody tell the basement.\"";

function vacancy() {
  return createMeter(
    {
      name: "Vacancy",
      min: 0,
      max: 6,
      start: 3,
      description:
        "How close the Belhaven is to closing. Up for refunds, bad reviews, a guest who flees, an unpaid bill; down for a full house, a wedding that goes well, a review that says charming.",
      thresholds: [
        {
          at: 3,
          label: "The bank sends a letter",
          note: "A letter from the Bend Savings & Loan: the loan is called in on 1 November unless the hotel stays open through October.",
        },
        {
          at: 4,
          label: "The bank sends a man",
          note: "Thaddeus Orme comes in person for a courtesy visit; bring the audit forward and make the books a scene.",
        },
        {
          at: 5,
          label: "A buyer is circling",
          note: "Someone is touring the grounds and asking about the land. Corbin & Vane Hospitality: the offer is real and would clear the loan.",
        },
        {
          at: 6,
          label: "The doors close",
          note: "The hotel closes. The season ends: play the consequences, the dead and the family in the empty building.",
        },
      ],
    },
    "world",
  );
}

export function buildLastResort(packNotes: BuiltinNote[]): BuiltinAdventure {
  const lore: StoryLore[] = [
    ...ownWorldRulesNotes(packNotes).map(builtinToLore),
    ...LR_NOTES,
    LR_FAMILY_NOTE,
  ];

  const adventure: Partial<Adventure> = {
    title: "The Last Resort",
    shortDescription:
      "A family inherits a broke 1920s hotel in a small town. It is full of the dead, and something in the boiler room.",
    description:
      "A Blood & Bone campaign starter, comedy-horror. A season at the Belhaven: each week a booking, a problem with the dead, and the bills. Five pre-made relatives, including the one who died and left the hotel (playable as a Ghost), eight residents with a want and a rule apiece, a town that half-knows, and a will that asks you in writing not to feed the basement. Vacancy is the clock; Exposure is the guests noticing.",
    author: "Endless Adventure",
    tags: ["supernatural", "comedy", "horror", "campaign", "Blood & Bone"],
    difficulty: "medium",
    estimatedDuration: "A season (many sessions)",
    nsfw: false,
    isPublished: false,
    isFeatured: false,
    presets: LR_PRESETS,
    storyTemplate: {
      story_name: "The Last Resort",
      premise: PREMISE,
      intro: INTRO,
      memory: [],
      currentChapter: 0,
      chapters: [],
      scene: { parts: [] },
      lore,
      npcs: LR_NPCS,
      goals: [],
      presets: LR_PRESETS,
      systemState: { sessionCount: 0, dedupKeys: [], setting: "last-resort" },
      sessionZeroActive: true,
      meters: [vacancy()],
      progressTracks: [
        createTrack("Family", "Keep the doors open", "vow", "epic"),
        createTrack("Family", "Why did they die?", "vow", "formidable"),
      ],
    },
    characterSheetTemplate: createCharacterSheetTemplate(
      BLOOD_AND_BONE_SHEET_TEMPLATE,
    ),
  };

  return { id: LAST_RESORT_ID, adventure };
}
