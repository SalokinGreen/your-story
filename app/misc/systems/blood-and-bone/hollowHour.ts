/**
 * The Hollow Hour: Blood & Bone's starter adventure (design 5.10). One night,
 * Troublesome-to-Dangerous. Original text. The template carries copies of
 * both packs' notes, each with its built-in id as `libraryNoteId`, so
 * `resolveSystem` finds the system and the GM is offered the system tools.
 * It relies on no template field the Designer's draft drops (a copy opened in
 * the Designer keeps its notes, NPCs, meters and tracks; `sessionZeroActive`
 * is lost, which the "Running it" note covers).
 */
import type { Adventure, NPC, StoryLore } from "../../structs";
import { createCharacterSheetTemplate } from "../../characterSheetTemplate";
import { createMeter, createTrack } from "../../metersAndTracks";
import type { BuiltinAdventure, BuiltinNote } from "../types";
import { BLOOD_AND_BONE_METER_SETS } from "./meterSets";
import { BLOOD_AND_BONE_SHEET_TEMPLATE } from "./sheet";

const STARTED_AT = Date.parse("2026-01-01T00:00:00.000Z");

export const HOLLOW_HOUR_ID = "builtin:blood-and-bone:hollow-hour";

function noteToLore(n: BuiltinNote): StoryLore {
  return {
    title: n.title,
    content: n.content,
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: n.type === "secret",
    keys: n.keys ?? [],
    type: n.type,
    on: true,
    tags: n.tags ?? [],
    libraryNoteId: n.id,
    ...(n.visibility ? { visibility: n.visibility } : {}),
  };
}

const PREMISE =
  "Eleven days ago a body was found in the service tunnels under a disused Underground station. Mortal police wrote it up as an overdose. It was not: it had been drained, badly, by something that did not know what it was doing. Four more have followed. The city's Heat has climbed to 3, the local factions are furious, and a Vigil hunter is a night from finding whoever is doing it. You are a Cohort, bound by a reason you chose before play, and tonight the problem is yours.";

const INTRO =
  "The tunnel smells of wet brick and something sweeter underneath it. Somebody has been sleeping here: a nest of stolen coats against the wall, a charger plugged into a dead socket, a phone face-down with a cracked screen. It buzzes once, twice, and goes still. Two hundred unanswered messages, the last one from \"Mum\". Behind you, far up the line, a torch beam sweeps the arch and is gone.\n\nYou are not the first to find this place tonight. What do you do?";

const RUNNING_IT = `# The Hollow Hour — Running it

One night, Troublesome to Dangerous. Run it with any Cohort and any mix of Kinds. If there is no Campaign Plan note yet, write one from the four endings below (read the secret first) and call start_game; session zero builds the characters (B&B — Character creation), then play.

The situation. Runa Sandhu (Troublesome, wants to stop being hungry and be told what she is) is a fledgling abandoned six weeks ago; she is feral, fast, untrained and sleeping in the tunnels. Callum Reyes (Dangerous, wants the killing to stop tonight) is a competent Vigil hunter working alone, three tunnels from her, who will listen to a Hunter and not to a monster. Margot Severin (Formidable, wants Heat down and credit for it) is the local authority who gave the order "fix this before Heat hits 4"; she stays offstage unless the Cohort makes her appear. Heat starts at 3; it is the clock: every masquerade breach pushes it toward 4, where Margot becomes an on-screen problem.

How to run it. Open in motion: the Cohort is already in the tunnels or already told to handle it. Make Runa sympathetic before she is dangerous: let them find her nest before they meet her. Callum arrives at the worst moment, ideally while they decide. A fight with Runa should not be a fight; if it becomes one, it is a Rule of 3 against a Troublesome.

Tracks. The Cohort's shared Vows are in Meters & tracks: Find Runa before Callum does (Dangerous), Resolve the situation without raising Heat (Dangerous), Identify and locate her maker (Formidable). Mark them when the fiction earns it.

The question has four endings and no clean one:
1. Kill Runa: fast, clean, Margot is satisfied and Heat drops. Every character who takes part raises Beast by 1.
2. Teach her: someone takes responsibility for a dependent, dangerous, visible fledgling. They gain a Companion and a permanent Connection; the deaths were still real.
3. Hand her to Callum: neat and deniable, and it means trusting a hunter with a monster. The Vigil learns the Cohort will deal.
4. Find her maker: the hard option and the only one that solves the real problem. A Formidable thread that turns a night into a campaign.

If they kill a frightened teenager to keep the peace, the game worked. If they adopt her, the game also worked, and now they have a problem with a name.`;

const SECRET = `The truth about Runa

Runa Sandhu is nineteen and was a mortal six weeks ago. Her maker, an old Vampire (Formidable) who has not been named and who is in this city for reasons of their own, turned her and left her to die or learn. She does not know she was abandoned; she thinks she was left behind by accident and that her maker will come back. She has fed on five people, badly, because no one taught her how. She sleeps in the service tunnels because sunlight hurts, and she keeps calling her mother's number without being able to speak.

Her maker's trail: a flat in the district with a bloodless cat and no tenant name, a hospital porter who remembers Runa being driven away by a woman with a very old coat, and a Salon invitation card. Whoever follows it finds a power that wanted a fledgling to make noise, and is watching how the city reacts.

Callum will not ask questions first. Margot does not care who Runa is.`;

const RUNA_PUBLIC =
  "Nineteen, last seen six weeks ago. Her mother keeps ringing a phone nobody answers. People who go into the tunnels at night say they were not alone.";

const NPCS: NPC[] = [
  {
    id: "npc-runa-sandhu",
    name: "Runa Sandhu",
    description: RUNA_PUBLIC,
    role: "Person of interest",
    status: "unknown",
    relationship: "Not yet met",
    attitude: "neutral",
    lastSeen: "The service tunnels",
    symbol: "🕯️",
    createdAt: STARTED_AT,
  },
  {
    id: "npc-callum-reyes",
    name: "Callum Reyes",
    description:
      "A Vigil hunter working alone, well-supplied and tired. He has the police file, a daylight life and a list of three tunnels. He will listen to a Hunter and not to a monster.",
    role: "Vigil hunter",
    status: "alive",
    relationship: "Unknown to you",
    attitude: "unfriendly",
    lastSeen: "Above the tunnels",
    faction: "The Vigil",
    symbol: "🔦",
    createdAt: STARTED_AT,
  },
  {
    id: "npc-margot-severin",
    name: "Margot Severin",
    description:
      "The local authority who ordered this fixed before Heat reaches 4. She rewards efficiency and punishes attention, and she can make the mortal investigation stop or your problems permanent.",
    role: "Local authority",
    status: "alive",
    relationship: "Your superior, or someone you answer to",
    attitude: "neutral",
    faction: "The local Court",
    symbol: "🥀",
    createdAt: STARTED_AT,
  },
];

function heat() {
  const def = BLOOD_AND_BONE_METER_SETS.find((s) => s.name === "City")?.meters[0];
  if (!def) throw new Error("City meter set missing");
  return createMeter({ ...def, start: 3 }, "world");
}

export function buildHollowHour(packNotes: BuiltinNote[]): BuiltinAdventure {
  const lore: StoryLore[] = [
    ...packNotes.map(noteToLore),
    {
      title: "The Hollow Hour — Running it",
      content: RUNNING_IT,
      relatedCharacters: ["Runa Sandhu", "Callum Reyes", "Margot Severin"],
      relatedLocations: [],
      secrtet: false,
      keys: [],
      type: "dm_instructions",
      on: true,
    },
    {
      title: "The truth about Runa",
      content: SECRET,
      relatedCharacters: ["Runa Sandhu"],
      relatedLocations: [],
      secrtet: true,
      keys: ["Runa", "maker"],
      type: "secret",
      visibility: "hidden",
      on: true,
    },
  ];

  const adventure: Partial<Adventure> = {
    title: "The Hollow Hour",
    shortDescription:
      "One night in the tunnels: a starving fledgling, a hunter one night behind her, and a city that wants it fixed.",
    description:
      "A Blood & Bone starter. Five bodies in the service tunnels, a Vigil hunter closing in, and an order from above to fix it before the city's Heat reaches 4. There is no clean ending, and every choice shows how the game works: Stress while you work, a fight that should not be a fight, Exposure in every move, and a Beast cost on the easy way out.",
    author: "Your Story",
    tags: ["supernatural", "horror", "one-shot", "Blood & Bone"],
    difficulty: "medium",
    estimatedDuration: "One night (2-3 hours)",
    nsfw: false,
    isPublished: false,
    isFeatured: false,
    storyTemplate: {
      story_name: "The Hollow Hour",
      premise: PREMISE,
      intro: INTRO,
      memory: [],
      currentChapter: 0,
      chapters: [],
      scene: { parts: [] },
      lore,
      npcs: NPCS,
      goals: [],
      sessionZeroActive: true,
      meters: [heat()],
      progressTracks: [
        createTrack("Cohort", "Find Runa before Callum does", "vow", "dangerous"),
        createTrack(
          "Cohort",
          "Resolve the situation without raising Heat",
          "vow",
          "dangerous",
        ),
        createTrack("Cohort", "Identify and locate her maker", "vow", "formidable"),
      ],
    },
    characterSheetTemplate: createCharacterSheetTemplate(
      BLOOD_AND_BONE_SHEET_TEMPLATE,
    ),
  };

  return { id: HOLLOW_HOUR_ID, adventure };
}
