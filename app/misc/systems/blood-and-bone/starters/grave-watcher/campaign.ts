/**
 * Grave Watcher's campaign record (docs/campaign-format-design.md section 9,
 * decision 224): slice of life. A season clock that runs on played sessions,
 * the town's regulars with their wants, the places the season visits, and
 * underneath two slow fronts (the Tally and Tower Six) the GM ticks as the
 * calendar reaches them. Original text (decision 3). Blood & Bone has no
 * `take_rest`, so no clock here uses the `rest` trigger.
 */
import type { CampaignRecord } from "../../../../campaign/types";
import {
  starterClock,
  starterFaction,
  starterFront,
  starterLocation,
  starterPerson,
  starterRecord,
  starterSecret,
} from "../../../../campaign/starterKit";

export function graveWatcherCampaign(): CampaignRecord {
  return starterRecord("slice_of_life", {
    pitch: {
      premise:
        "A season on Tower Nine of the Long Acre, the valley's great graveyard, and in Hollins Ferry, the town below it. Most days are errands, gossip and festivals; most nights the radio is jokes. Underneath, something in the Old Lot has started to count.",
      tone: ["warm", "funny", "uneasy"],
    },
    factions: [
      starterFaction({
        id: "fac_gw_board",
        name: "The Board of Wardens",
        goal: "Keep the Long Acre's rating from failing, and condemn the yard if it does.",
        methods: "Forms, inspections, the monthly letter, and Owen Lister with a clipboard.",
      }),
      starterFaction({
        id: "fac_gw_ashcombe",
        name: "Ashcombe Holdings",
        goal: "Recover the buried strongbox and the old waterfront deed, then buy the valley's land.",
        methods: "Cash through a nervous local man, patience, and a lawyer rather than a gun.",
        clockId: "clk_gw_ashcombe",
      }),
    ],
    fronts: [
      starterFront({
        id: "frt_gw_tally",
        name: "The Tally",
        doom: "On Ferry Day the count reaches sixty-three and the dead rise and walk home along the old picnic route, to the houses on Main Street, asking for supper.",
        dangers: [
          { name: "The Tally", impulse: "to count every unrecorded name until each has been spoken aloud" },
          { name: "The dig at the Hendricks place", impulse: "to open one more grave and wake one more name" },
        ],
        portents: [
          [2, "A blank headstone in the Catholic Rise carries a name by morning."],
          [4, "A child's chalk on the yard gate, and a name said on the radio by nobody."],
          [6, "The names come faster: the count passes fifty."],
          [7, "The green light stops walking. The Tally is waiting for the last name."],
        ],
        stakes: [
          "Will the town admit what it buried?",
          "Will Teddy Vance be turned, or caught?",
          "What does the Watch owe sixty-three people nobody wrote down?",
        ],
        clockId: "clk_gw_tally",
      }),
      starterFront({
        id: "frt_gw_six",
        name: "Tower Six keeps its watch",
        doom: "The dead channel reaches the rest of the net, June's silence breaks, and the Board closes Six for good.",
        dangers: [
          { name: "The 2:11 call", impulse: "to be answered, by anyone, and to ask for Ines" },
        ],
        portents: [
          [1, "On a bad night at 2:11 the channel says 'Six, all quiet' in a voice that is not the Watcher on it."],
          [2, "The voice asks, very politely, for Ines."],
          [3, "June changes the subject twice in one evening, and a second logbook goes missing from her desk."],
        ],
        stakes: [
          "Who will answer the channel, and what will they promise?",
          "Will June be forgiven for what she logged?",
        ],
        clockId: "clk_gw_six",
      }),
    ],
    clocks: [
      starterClock({
        id: "clk_gw_season",
        name: "The season turns",
        segments: 8,
        triggers: ["session"],
        onFill: "Ferry Day arrives. The season is over, and what the town does that day is the ending.",
        visible: true,
      }),
      starterClock({
        id: "clk_gw_tally",
        name: "The count",
        segments: 8,
        triggers: ["manual"],
        link: { kind: "front", id: "frt_gw_tally" },
        onFill: "The count reaches the last name. The dead stand up in the Old Lot and start for home.",
        visible: false,
      }),
      starterClock({
        id: "clk_gw_six",
        name: "The 2:11 call",
        segments: 4,
        triggers: ["manual"],
        link: { kind: "front", id: "frt_gw_six" },
        onFill: "Pell's call is answered, or heard by the whole net at once, and Tower Six can no longer be written off as radio trouble.",
        visible: false,
      }),
      starterClock({
        id: "clk_gw_ashcombe",
        name: "Ashcombe's lawyer arrives",
        segments: 4,
        triggers: ["manual"],
        link: { kind: "faction", id: "fac_gw_ashcombe" },
        onFill: "A lawyer in a good coat comes up the Main Street steps with a claim on the waterfront and a patient smile.",
        visible: false,
      }),
    ],
    people: [
      starterPerson({
        npcId: "npc-marisol-ochoa",
        want: "Everyone talking to everyone, at her counter, phones away.",
        secret: "A postcard with no return address arrives every month from Ines Calloway, and she has told nobody.",
        voice: "Brisk and teasing. Remembers how you take your coffee and what you left out.",
      }),
      starterPerson({
        npcId: "npc-walt-pruitt",
        want: "A motion passed, preferably about parking.",
        secret: "He signed last Halloween's hayride permit, and the fence it crossed had been moved in forty feet.",
        voice: "Booming and formal. Talks in motions even at breakfast.",
      }),
      starterPerson({
        npcId: "npc-cora-pruitt",
        want: "One committee meeting that ends on time, and Walt's name kept clean.",
        secret: "She is hiding last year's Halloween committee minutes because they mention the Old Lot.",
        voice: "Efficient and warm. Deflects with a clipboard.",
      }),
      starterPerson({
        npcId: "npc-june-abernathy",
        want: "Every tower checking in on time and nobody lost on her watch.",
        secret: "She logged Six's night as radio failure on the Board's orders, and keeps the real 2:11 calls in a second book at home.",
        voice: "Dry and gentle. Never talks over anyone on the net.",
      }),
      starterPerson({
        npcId: "npc-lyle-greaves",
        want: "To retire without anyone looking through his father's files.",
        secret: "He carries his father's confession and the key to the strongbox.",
        voice: "Soft and formal. Apologises for the weather.",
      }),
      starterPerson({
        npcId: "npc-teddy-vance",
        want: "To clear his debt and be done.",
        secret: "He is digging the Old Lot at night for Ashcombe Holdings, and every grave he opens makes a name surface.",
        voice: "Over-polite and eager. The salesman's smile slips when it goes quiet.",
      }),
      starterPerson({
        npcId: "npc-owen-lister",
        want: "A clean report and a Watch that looks good in it.",
        secret: "He will fight for the town the day he learns who Ashcombe is; until then he is only charming.",
        voice: "Relaxed and charming. Says 'between us' too often.",
      }),
      starterPerson({
        npcId: "npc-wendell-boone",
        want: "To be left on his bench, and for someone to ask him about the old graves.",
        secret: "As a young man he dug in the Old Lot and found rows of small bones with ferry tags and an iron box under a plain stone. He filled it in and never spoke of it.",
        voice: "Slow and rambling. Answers the question you asked last Thursday.",
      }),
      starterPerson({
        npcId: "npc-bea-lindqvist",
        want: "The Old Lot's records, which do not exist.",
        secret: "She has noticed the 1911 case in the Ferry Day exhibit is empty and has started a list of what the registry is missing.",
        voice: "Answers a question with the book and the page.",
      }),
      starterPerson({
        npcId: "npc-eli-sandoval",
        want: "The net kept alive, and the last transmission from Tower Six understood.",
        secret: "He still has the tape of Six's last night and hears it in his sleep.",
        voice: "A late-night DJ baritone with soldering-iron asides.",
      }),
      starterPerson({
        npcId: "npc-ingrid-moss",
        want: "Her herbs paid for and her craft left alone.",
        secret: "She could unmake the Old Lot's working with a cold rite, at a price she has not told the Watch.",
        voice: "Dry. Everything is a plant metaphor. Smells of rosemary and rain.",
      }),
      starterPerson({
        npcId: "npc-hal-brewer",
        want: "A quiet town to pastor, and a vigil held if the dead ever walk.",
        secret: "The chapel's burial book has no entries for May 1911, and he has always assumed the page was lost.",
        voice: "Gentle and long-winded. The sermon runs over.",
      }),
    ],
    secrets: [
      starterSecret({
        id: "sec_gw_tally",
        title: "The Tally",
        truth:
          "On 4 May 1911 the excursion steamer Annabel Hollins went down at the landing, and sixty-three died. The owner paid the undertaker to bury them that night, unrecorded, in the field now called the Old Lot. A grieving Witch among the families laid a counting on the ground: it counts the unrecorded until every one is named aloud. It slept 114 years, and woke when someone started digging. The green light is her lantern, looking for the next name.",
        keyPhrases: ["Tally", "Old Lot", "sixty-three", "Annabel Hollins"],
        clues: [
          [
            "clu_gw_tally_1",
            "A blank headstone in the Catholic Rise that carried a name by morning.",
            "The Catholic Rise, the morning after a green light",
          ],
          [
            "clu_gw_tally_2",
            "Wendell Boone's old story: rows of small bones with ferry tags, and an iron box under a plain stone.",
            "The bench outside Brandt Hardware, once he trusts you",
          ],
          [
            "clu_gw_tally_3",
            "The town registry has no Old Lot records at all, and one case in the Ferry Day exhibit has been empty for years.",
            "The library and historical society",
          ],
          [
            "clu_gw_tally_4",
            "Last Halloween's minutes: the hayride crossed the Old Lot fence, Walt signed the permit, and the fence had been moved in forty feet.",
            "Cora Pruitt's hidden committee notes",
          ],
        ],
      }),
      starterSecret({
        id: "sec_gw_dig",
        title: "Who is digging",
        truth:
          "Teddy Vance works for Ashcombe Holdings, an out-of-county buyer who wants the strongbox Amos Greaves buried with the Hollins ledger: it holds the original waterfront deed and the passenger list. Teddy took the job at Greaves & Sons for the old files and bought the Hendricks place, which backs onto the Old Lot fence, for a base. He digs by night with two hired hands. He thinks the only danger is getting caught.",
        keyPhrases: ["Teddy", "Ashcombe", "strongbox", "Hendricks"],
        clues: [
          [
            "clu_gw_dig_1",
            "Lights at the Hendricks place at three in the morning, and digging heard at the Old Lot fence.",
            "The Old Lot fence at night, or the radio",
          ],
          [
            "clu_gw_dig_2",
            "Teddy paid cash for the Hendricks place from a Greaves & Sons deposit bag.",
            "Gossip at the Lamplight, or the county records",
          ],
          [
            "clu_gw_dig_3",
            "Teddy's hearse on the ferry road after dark, with no funeral scheduled.",
            "The ferry road, any night",
          ],
        ],
      }),
      starterSecret({
        id: "sec_gw_six",
        title: "What happened at Tower Six",
        truth:
          "Last March the crew of Six, Ines Calloway and Pell Garrity, went to the Old Lot fence at 2:11 a.m. to see why there were lights. Pell went down into a freshly dug grave and died there; he was the great-grandson of one of the Tally's names. Ines fled the valley at dawn. June logged it as radio failure on the Board's instruction. Pell keeps watch on the dead channel and asks for Ines.",
        keyPhrases: ["Tower Six", "Ines", "Pell", "2:11"],
        clues: [
          [
            "clu_gw_six_1",
            "At 2:11 on a bad night the dead channel says 'Six, all quiet' in a voice that is not the Watcher on it.",
            "The Watch net, any bad night",
          ],
          [
            "clu_gw_six_2",
            "Eli Sandoval still has the tape of Six's last transmission: 'he's in the roll', and then silence.",
            "Eli's radio shed, if he trusts you",
          ],
          [
            "clu_gw_six_3",
            "A monthly postcard to the Lamplight with no return address, signed with a single initial.",
            "Marisol Ochoa's till",
          ],
          [
            "clu_gw_six_4",
            "June's second logbook, which records every 2:11 call since the autumn.",
            "June Abernathy's house, if asked gently",
          ],
        ],
      }),
    ],
    locations: [
      starterLocation({
        id: "loc_gw_lamplight",
        name: "The Lamplight",
        features: [
          "Booth nine, kept for the Watch",
          "A chalkboard, no Wi-Fi, and a counter where gossip is currency",
          "Marisol's pencil, which she never uses",
        ],
        npcIds: ["npc-marisol-ochoa", "npc-tommy-reyes"],
      }),
      starterLocation({
        id: "loc_gw_tower_nine",
        name: "Tower Nine",
        features: [
          "Forty steps up a ladder to a trapdoor",
          "A stove with a name, and a logbook back to the 1970s",
          "A window box of basil that is alive out of spite",
        ],
        npcIds: [],
      }),
      starterLocation({
        id: "loc_gw_town_hall",
        name: "The town hall and the dispatch room",
        features: [
          "Walt's war room with a map of the parking",
          "June's dispatch room upstairs with the base radio",
          "A gavel that is never where it was left",
        ],
        npcIds: ["npc-walt-pruitt", "npc-june-abernathy", "npc-cora-pruitt"],
      }),
      starterLocation({
        id: "loc_gw_library",
        name: "The library and historical society",
        features: [
          "One room, one librarian, every record that exists",
          "A Ferry Day exhibit case that has been empty for years",
          "A registry with a hole where the Old Lot should be",
        ],
        npcIds: ["npc-bea-lindqvist"],
      }),
      starterLocation({
        id: "loc_gw_hendricks",
        name: "The Hendricks place",
        features: [
          "A big house, empty for years, lit at three in the morning",
          "A cellar that backs onto the Old Lot fence",
          "A hearse in the drive on some nights",
        ],
        npcIds: ["npc-teddy-vance"],
      }),
      starterLocation({
        id: "loc_gw_old_lot",
        name: "The Old Lot",
        features: [
          "No records at all; it is quiet, and that is the problem",
          "A rusted fence always a little further in than it was",
          "Ground that sinks in rows after rain",
        ],
        npcIds: [],
      }),
    ],
    endStates: [
      {
        id: "end_gw_name",
        text: "Name them. All sixty-three are written into the town record and spoken aloud on Ferry Day. The Tally closes; the cost is that the town admits what it buried and Lyle Greaves testifies.",
      },
      {
        id: "end_gw_feed",
        text: "Feed them. Ferry Day becomes a supper with sixty-three places. It works for a night; the working stays open and next year there is another supper, a tradition now.",
      },
      {
        id: "end_gw_break",
        text: "Break it. Ingrid Moss unmakes the working with a cold rite and the dead are scattered unnamed. Unrest drops, and the Tally takes one last name: someone who did it.",
      },
    ],
  });
}
