/**
 * The Hollow Hour's campaign record (docs/campaign-format-design.md section 9,
 * decision 224): a one-night mystery. Two secrets with three clues each, a
 * front for the hunter's approach and one for the Heat, and the four endings.
 * Original text (decision 3). Ids are fixed (a starter is built in memory).
 *
 * The people join the NPCs in `hollowHour.ts` by id. Clocks use triggers the
 * system's tools fire: `scene` (increment_scene), `miss` (action_roll and
 * the challenge tools) and `manual`.
 */
import type { CampaignRecord } from "../../campaign/types";
import {
  starterClock,
  starterFaction,
  starterFront,
  starterLocation,
  starterPerson,
  starterRecord,
  starterSecret,
} from "../../campaign/starterKit";

export function hollowHourCampaign(): CampaignRecord {
  return starterRecord("mystery", {
    pitch: {
      premise:
        "Five people have been drained in the service tunnels under a disused Underground station, and the police wrote them up as overdoses. The city's Heat stands at 3, a Vigil hunter is a night from finding the culprit, and you are the Cohort the local authority has told to fix it before the Heat reaches 4.",
      tone: ["dread", "pity", "urgency"],
    },
    factions: [
      starterFaction({
        id: "fac_hh_vigil",
        name: "The Vigil",
        goal: "End whatever is feeding in the tunnels, quietly, before the mortal press gives it a name.",
        methods: "One tired hunter, a copy of the police file, a daylight life and a list of three tunnels.",
      }),
      starterFaction({
        id: "fac_hh_court",
        name: "The local Court",
        goal: "Bring the Heat down and be seen to have done it.",
        methods: "Orders, favours, and a Cohort that can be blamed if the night goes badly.",
      }),
    ],
    fronts: [
      starterFront({
        id: "frt_hh_hunter",
        name: "A night running out",
        doom: "Callum finds Runa before the Cohort does and ends her, and the Vigil learns who was too slow.",
        dangers: [
          { name: "Callum Reyes", impulse: "to end the killing tonight, by whatever means is closest to hand" },
        ],
        portents: [
          [2, "A torch beam sweeps a tunnel mouth two streets from the nest."],
          [4, "A door the Cohort left shut is found open, with a hunter's chalk mark beside it."],
          [5, "Three flashes of light come up the shaft: Callum has her scent."],
        ],
        stakes: [
          "Will the Cohort find what is feeding in the tunnels before someone else does?",
          "What will they do with it when they do?",
        ],
        clockId: "clk_hh_hunter",
      }),
      starterFront({
        id: "frt_hh_heat",
        name: "The Heat",
        doom: "The Heat reaches 4 and Margot Severin steps on stage herself; the Cohort's problem becomes her solution.",
        dangers: [
          { name: "Margot Severin", impulse: "to make the mortal investigation stop and take the credit for it" },
          { name: "The maker", impulse: "to watch how the city reacts to the noise, unseen" },
        ],
        portents: [
          [1, "A mortal reporter is asking after the five overdoses."],
          [2, "A black car idles outside the café, and Margot's runner is in it."],
          [3, "A second message arrives from Margot: a time, not a request."],
        ],
        stakes: ["Who will Margot reward, and who will she remember?"],
        clockId: "clk_hh_heat",
      }),
    ],
    clocks: [
      starterClock({
        id: "clk_hh_hunter",
        name: "Callum reaches the nest",
        segments: 6,
        triggers: ["scene"],
        link: { kind: "front", id: "frt_hh_hunter" },
        onFill:
          "Callum finds Runa first. Unless the Cohort stands between them, she is dead or caged before dawn and he holds a file that points at the Cohort.",
        visible: false,
      }),
      starterClock({
        id: "clk_hh_heat",
        name: "Margot loses patience",
        segments: 4,
        triggers: ["manual"],
        link: { kind: "front", id: "frt_hh_heat" },
        onFill:
          "Margot walks into the scene herself. The Heat is no longer the Cohort's to manage, and what she asks for next is an order.",
        visible: false,
      }),
    ],
    people: [
      starterPerson({
        npcId: "npc-runa-sandhu",
        want: "To stop being hungry, and to be told what she is.",
        secret: "She believes her maker will come back for her and has been waiting where she was left.",
        voice: "Quick, broken sentences. Says sorry before she says anything else.",
      }),
      starterPerson({
        npcId: "npc-callum-reyes",
        want: "For the killing to stop tonight.",
        secret: "He reached the fifth body a minute too late and has not forgiven himself.",
        voice: "Flat, tired and polite. Answers a question with a question about what you saw.",
      }),
      starterPerson({
        npcId: "npc-margot-severin",
        want: "The Heat down, and credit for bringing it down.",
        secret: "She does not care who the culprit is and will hand the Court whichever Cohort member is easiest to give up.",
        voice: "Warm, unhurried, never raises her voice. Every kindness arrives with a price.",
      }),
    ],
    secrets: [
      starterSecret({
        id: "sec_hh_runa",
        title: "The truth about Runa",
        truth:
          "Runa Sandhu is nineteen and was mortal six weeks ago. An old Vampire turned her and left her to die or learn. She has fed on five people, badly, because no one taught her how. She sleeps in the tunnels because sunlight hurts, and keeps ringing her mother's number without being able to speak.",
        keyPhrases: ["Runa", "fledgling", "nineteen"],
        clues: [
          [
            "clu_hh_runa_1",
            "A nest of coats and water bottles behind a service door, and a dead phone whose last call went to a number saved as Mum.",
            "The service tunnels, behind the third maintenance door",
          ],
          [
            "clu_hh_runa_2",
            "In the police photographs, the same two shallow, ragged punctures on each of the five: made by a mouth that did not know where to bite.",
            "The photographs in Margot's envelope",
          ],
          [
            "clu_hh_runa_3",
            "A six-week-old missing-person flyer for Runa Sandhu, nineteen, with a number that matches the one on the dead phone.",
            "A lamppost near the station, half torn down",
          ],
        ],
      }),
      starterSecret({
        id: "sec_hh_maker",
        title: "Who made her",
        truth:
          "An old Vampire, Formidable, who has not been named and is in this city for reasons of their own, turned Runa and left her to make noise. They are watching how the city reacts, and have no intention of coming back for her.",
        keyPhrases: ["maker", "Salon"],
        clues: [
          [
            "clu_hh_maker_1",
            "A flat with no tenant name and a bloodless cat, rented in cash for exactly as long as Runa has been missing.",
            "A flat in the district around the hospital",
          ],
          [
            "clu_hh_maker_2",
            "A hospital porter remembers a nineteen-year-old driven away at night by a woman in a very old coat.",
            "The hospital's night entrance",
          ],
          [
            "clu_hh_maker_3",
            "A Salon invitation card with Runa's name on the back in a steady, old-fashioned hand.",
            "Sewn into the lining of a coat in the nest",
          ],
        ],
      }),
    ],
    locations: [
      starterLocation({
        id: "loc_hh_cafe",
        name: "The all-night café",
        features: [
          "Shutters half down and one light on",
          "A table at the back that was cleared before you sat",
          "An owner who never looks up",
        ],
        npcIds: [],
      }),
      starterLocation({
        id: "loc_hh_station",
        name: "The disused station",
        features: [
          "Boarded entrances with one fresh padlock",
          "A tiled platform where sound arrives late",
          "A hand-drawn map that is wrong in exactly one place",
        ],
        npcIds: ["npc-callum-reyes"],
      }),
      starterLocation({
        id: "loc_hh_tunnels",
        name: "The service tunnels",
        features: [
          "A slow drip, and under it a faint tapping",
          "Doors painted with numbers older than the lines",
          "Fresh footprints that stop at a blank wall",
        ],
        npcIds: ["npc-runa-sandhu"],
      }),
    ],
    endStates: [
      {
        id: "end_hh_1",
        text: "Runa is killed. It is fast and clean, Margot is satisfied and the Heat drops; every character who took part raises Beast by 1.",
      },
      {
        id: "end_hh_2",
        text: "Someone takes Runa on. She is a dependent, dangerous and visible fledgling, and the five deaths were still real.",
      },
      {
        id: "end_hh_3",
        text: "Runa is handed to Callum. It is neat and deniable, and the Vigil learns that this Cohort will deal.",
      },
      {
        id: "end_hh_4",
        text: "The Cohort finds the maker, the only answer that solves the real problem, and a night becomes a campaign.",
      },
    ],
  });
}
