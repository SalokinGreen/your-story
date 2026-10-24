/**
 * Grave Watcher: a Blood & Bone campaign starter (docs/bb-starters-design.md
 * section 3, decisions 163-172). Masquerade off, slice of life first, a
 * season in Hollins Ferry beside the Long Acre. Original text (decision 3).
 * The setting id "grave-watch" keeps Europe by Night's cross-setting notes
 * from being pushed to it (decision 173).
 */
import type { Adventure, StoryLore } from "../../../../structs";
import { createCharacterSheetTemplate } from "../../../../characterSheetTemplate";
import { createMeter, createTrack } from "../../../../metersAndTracks";
import type { BuiltinAdventure, BuiltinNote } from "../../../types";
import { BLOOD_AND_BONE_SHEET_TEMPLATE } from "../../sheet";
import { builtinToLore, ownWorldRulesNotes } from "../shared";
import { GW_REGULARS_NOTE, GW_REGULARS_NPCS, GW_VISITORS_NOTES } from "./people";
import { GW_PRESETS, GW_ROSTER_NOTE } from "./roster";
import { GW_TOWN_TABLES } from "./townTables";
import { GW_WORLD_NOTES } from "./world";

export const GRAVE_WATCHER_ID = "builtin:blood-and-bone:grave-watcher";

const PREMISE =
  "Everyone knows the dead do not all stay down. What nobody likes are the yards: great old cemeteries where enough grief and old burial draws dark magic the way a low field draws water. The Long Acre is one, two hundred years of graves across a valley, ringed by nine lookout towers and a radio net. Down the road is Hollins Ferry, a small town where everyone knows everyone's business, where the diner keeps you a booth and the selectman signs every door. You crew Tower Nine this season. Most days are town. Most nights the radio is gossip. Underneath, something in the Old Lot has started to count.";

const INTRO =
  "The radio wakes you before the alarm does. \"Nine, this is Four. Nine, you up?\" The stove has gone out. Below the tower the Long Acre is a sea of fog with headstones standing in it like people waiting for a bus, and out past the Catholic Rise there is a light where no light should be: low, green, moving slowly between the graves the way a person walks when they're looking for a name. \"Nine. Four. I've got it too. You going down, or am I?\"";

function unrest() {
  return createMeter(
    {
      name: "Unrest",
      min: 0,
      max: 6,
      start: 1,
      description:
        "How restless the Long Acre is. Rises when a working is left to grow, a grave is robbed or a tower is abandoned; falls when a working is broken or a section laid quiet.",
      thresholds: [
        { at: 3, label: "The dead walk", note: "The dead walk on ordinary nights; patrols meet them." },
        { at: 4, label: "The county takes notice", note: "The county sends an inspector and threatens to bring in the Board of Wardens." },
        { at: 5, label: "The town is in danger", note: "Things from the yard reach Main Street; the town knows." },
        { at: 6, label: "The fences break", note: "The yard breaks its fences. The season is a crisis now." },
      ],
    },
    "world",
  );
}

export function buildGraveWatcher(packNotes: BuiltinNote[]): BuiltinAdventure {
  const lore: StoryLore[] = [
    ...ownWorldRulesNotes(packNotes).map(builtinToLore),
    ...GW_WORLD_NOTES,
    GW_ROSTER_NOTE,
    GW_REGULARS_NOTE,
    ...GW_VISITORS_NOTES,
    ...GW_TOWN_TABLES,
  ];

  const adventure: Partial<Adventure> = {
    title: "Grave Watcher",
    shortDescription:
      "A season in a small valley town beside a vast graveyard: coffee, gossip and a radio net, with something counting in the Old Lot.",
    description:
      "A Blood & Bone campaign starter with the Masquerade off. The supernatural is ordinary; the dark that gathers in great old cemeteries is not. You are a Grave Watcher on Tower Nine of the Long Acre, with a roster of eight to play or to fill your team. Slice of life first: the diner, the town meetings, the festivals, who is speaking to whom. The yard is the weather of the place, until it is not. Pre-made Watchers, twenty-five townspeople, a town calendar and a secret that the season is slowly turning toward.",
    author: "Your Story",
    tags: ["supernatural", "slice of life", "campaign", "Blood & Bone"],
    difficulty: "medium",
    estimatedDuration: "A season (many sessions)",
    nsfw: false,
    isPublished: false,
    isFeatured: false,
    presets: GW_PRESETS,
    storyTemplate: {
      story_name: "Grave Watcher",
      premise: PREMISE,
      intro: INTRO,
      memory: [],
      currentChapter: 0,
      chapters: [],
      scene: { parts: [] },
      lore,
      npcs: GW_REGULARS_NPCS,
      goals: [],
      presets: GW_PRESETS,
      sessionZeroActive: true,
      systemState: { sessionCount: 0, dedupKeys: [], setting: "grave-watch" },
      meters: [unrest()],
      progressTracks: [
        createTrack("Watch", "Get through the season", "vow", "extreme"),
        createTrack("Watch", "Name the dead of the Old Lot", "vow", "extreme"),
      ],
    },
    characterSheetTemplate: createCharacterSheetTemplate(
      BLOOD_AND_BONE_SHEET_TEMPLATE,
    ),
  };

  return { id: GRAVE_WATCHER_ID, adventure };
}
