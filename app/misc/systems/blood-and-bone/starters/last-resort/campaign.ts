/**
 * The Last Resort's campaign record (docs/campaign-format-design.md section 9,
 * decision 224): a sandbox in one hotel. Factions among the dead and in the
 * town, a front in the boiler room and one at the bank, the four secrets the
 * season turns on (each with clues in different rooms), and the endings the
 * family can earn. Original text (decision 3). Blood & Bone has no
 * `take_rest`, so no clock uses the `rest` trigger.
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

export function lastResortCampaign(): CampaignRecord {
  return starterRecord("sandbox", {
    pitch: {
      premise:
        "A family inherits the Belhaven, a broke 1920s hotel in a small hill town, on one condition: it stays open through October. It is full of the dead, there is something in the boiler room, and the bank is already writing letters.",
      tone: ["funny", "eerie", "tender"],
    },
    factions: [
      starterFaction({
        id: "fac_lr_residents",
        name: "The residents",
        goal: "Keep the Belhaven the way it was, with the dead still on the register.",
        methods: "Rules of the house, small hauntings, and a polite refusal to be hurried.",
      }),
      starterFaction({
        id: "fac_lr_gala",
        name: "The Gala of '58",
        goal: "Play the last number, the one the drummer never reached.",
        methods: "A band of nine, a hundred dancers and an endless request list.",
      }),
      starterFaction({
        id: "fac_lr_bank",
        name: "Bend Savings & Loan",
        goal: "Have the loan repaid in full on 1 November, or the property sold.",
        methods: "Letters, a courtesy visit, an audit and fine print.",
      }),
      starterFaction({
        id: "fac_lr_corbin",
        name: "Outside interests",
        goal: "Buy the Belhaven's land and build a spa.",
        methods: "A man inside the family, a patient offer, and the bank as an ally.",
        clockId: "clk_lr_corbin",
      }),
    ],
    fronts: [
      starterFront({
        id: "frt_lr_boarder",
        name: "The cold below",
        doom: "On the last night of the season the decade falls due: a living guest is kept in the building, as the 1924 bargain requires.",
        dangers: [
          { name: "The Boarder", impulse: "to be treated as a paying guest, at last" },
          { name: "Last Dance at the Belhaven", impulse: "to be played, which is the Boarder's invitation" },
        ],
        portents: [
          [2, "The boiler rattles on a Sunday the plate is late."],
          [4, "Names are called up the stairwell at night, and a living guest goes down to answer."],
          [6, "The cold climbs the hotel floor by floor, and the dead stop speaking above a whisper."],
        ],
        stakes: [
          "What lives below the Belhaven, and what does it want?",
        ],
        clockId: "clk_lr_boarder",
      }),
      starterFront({
        id: "frt_lr_bank",
        name: "The doors close",
        doom: "The loan is called in on 1 November and the Belhaven is sold.",
        dangers: [
          { name: "Thaddeus Orme", impulse: "to recover the loan, or the property, by the book" },
        ],
        portents: [
          [2, "The bank's first letter is on the front desk, addressed to the dead woman."],
          [4, "Thaddeus Orme comes up the hill for a courtesy visit and asks to see the books."],
          [6, "A buyer tours the grounds with a measuring wheel and a very good umbrella."],
          [7, "Corbin & Vane's offer arrives in writing, and it would clear the loan."],
        ],
        stakes: [
          "Will the Belhaven stay open through October?",
          "Will the family sell to save the hotel, or keep the hotel and lose the deal?",
        ],
        clockId: "clk_lr_bank",
      }),
    ],
    clocks: [
      starterClock({
        id: "clk_lr_boarder",
        name: "The Boarder is hungry",
        segments: 6,
        triggers: ["manual"],
        link: { kind: "front", id: "frt_lr_boarder" },
        onFill: "The Boarder takes a lodger early: a living guest is kept, as if the decade had come.",
        visible: false,
      }),
      starterClock({
        id: "clk_lr_bank",
        name: "The bank's deadline",
        segments: 8,
        triggers: ["manual"],
        link: { kind: "front", id: "frt_lr_bank" },
        onFill: "Founders' Weekend ends and the month turns. The bank acts on the loan.",
        visible: true,
      }),
      starterClock({
        id: "clk_lr_corbin",
        name: "The buyer closes in",
        segments: 4,
        triggers: ["manual"],
        link: { kind: "faction", id: "fac_lr_corbin" },
        onFill: "Corbin & Vane make their offer in person, and it is a good one.",
        visible: false,
      }),
    ],
    people: [
      starterPerson({
        npcId: "npc-ambrose-pell",
        want: "The hotel run properly, the way it was in 1961.",
        secret: "He remembers exactly when Room 0 was written into the register, and cannot lie about a room.",
        voice: "Courteous and exact. 'I'll see what I can find', and then finds precisely that.",
      }),
      starterPerson({
        npcId: "npc-lucille-grandison",
        want: "A living person to type up her memoirs.",
        voice: "Grand and unreliable. Every anecdote has a different husband.",
      }),
      starterPerson({
        npcId: "npc-pip-dunmore",
        want: "A real silver dollar as a tip.",
        voice: "Quick and cheerful. 'I'll take that', and delivers it to the wrong room.",
      }),
      starterPerson({
        npcId: "npc-delphine-corvin",
        want: "The last number played.",
        secret: "She does not know that the last bar is the Boarder's invitation.",
        voice: "Warm and theatrical. Calls everyone 'darling' and takes requests.",
      }),
      starterPerson({
        npcId: "npc-odile-marrow",
        want: "To be looked at properly.",
        voice: "Merciless about posture, hair and shoes. Cannot lie in a glass.",
      }),
      starterPerson({
        npcId: "npc-anselm-rooke",
        want: "One perfect service.",
        secret: "He has kept Winnie's uneaten plate in the cold store since the night she died.",
        voice: "Barks tickets from nowhere: 'Table nine, two Wellingtons, now.'",
      }),
      starterPerson({
        npcId: "npc-barnaby-strand",
        want: "His bill settled: eleven dollars forty.",
        voice: "Loud, aggrieved and sure it is still 1947.",
      }),
      starterPerson({
        npcId: "npc-hester-quill",
        want: "The hotel clean and the family safe.",
        secret: "She leaves the Sunday plate at midnight every week, because the boiler rattled the first week she did not.",
        voice: "Quiet and exact. Passive-aggressive notes on every pillow.",
      }),
      starterPerson({
        npcId: "npc-thaddeus-orme",
        want: "The loan repaid or the property sold.",
        secret: "He is in contact with Corbin & Vane about a buyer.",
        voice: "Thin, polite, a reader of fine print. 'Just a courtesy visit.'",
      }),
      starterPerson({
        npcId: "npc-amos-fenn",
        want: "Retirement in March and no loose ends.",
        secret: "He saw the burn and the plate on the night Winnie died and wrote 'natural causes' to keep the town out of it.",
        voice: "Slow and weary. 'I'd leave it at that.'",
      }),
      starterPerson({
        npcId: "npc-imelda-tuck",
        want: "To be left out of it.",
        secret: "On the service stairs she heard her own name called, and signed 'heart' to be done with it.",
        voice: "Brisk and practical, and she goes quiet when the stairs come up.",
      }),
      starterPerson({
        npcId: "npc-lowell-quist",
        want: "To be asked the right question.",
        voice: "Mild and old. Will not say why he does not bury the hotel's dead.",
      }),
    ],
    secrets: [
      starterSecret({
        id: "sec_lr_death",
        title: "How Winnie died",
        truth:
          "Winifred Alder died of heart failure on the service stairs between the boiler room and the kitchen, carrying the Sunday plate back up, uneaten. She had decided to stop feeding the Boarder, hoping to starve it out or make it show itself. The thing downstairs called her name up the stairwell for an hour and she ran. It never touched her. It does not need to.",
        keyPhrases: ["service stairs", "Sunday plate", "counting the stairs"],
        clues: [
          [
            "clu_lr_death_1",
            "Pell saw her go down with the plate at ten, and she did not come back the way she went.",
            "The front desk, if you ask the right question",
          ],
          [
            "clu_lr_death_2",
            "Hester heard her counting the stairs aloud as she passed the laundry.",
            "The laundry, after midnight",
          ],
          [
            "clu_lr_death_3",
            "The plate was found cold on the landing, and Chef Rooke has kept it ever since.",
            "The cold store",
          ],
          [
            "clu_lr_death_4",
            "A letter under the lobby's third floor tile, written the week she died, for family standing there at midnight.",
            "The lobby, at midnight",
          ],
        ],
      }),
      starterSecret({
        id: "sec_lr_boarder",
        title: "What is in the boiler room",
        truth:
          "In 1924 Cornelius Belhaven signed a guest into Room 0, which is on no plans, and agreed a rent: one plate each Sunday, and a lodger who would not leave once every decade. The Boarder is not a demon but a guest that cannot check out. It holds every resident on the register, which is why the dead cannot leave. It can be checked out only by someone with a right to the register, and that signature is Dara's now.",
        keyPhrases: ["Boarder", "Room 0"],
        clues: [
          [
            "clu_lr_boarder_1",
            "A line for Room 0 in the old register, in Cornelius Belhaven's hand, with no name and no end date.",
            "Winnie's desk, in suite 401",
          ],
          [
            "clu_lr_boarder_2",
            "The boiler runs hot with the fuel off, and rattles when something it expects does not come.",
            "The basement, beside the Sunday door",
          ],
          [
            "clu_lr_boarder_3",
            "A small hatch beside the boiler where a covered plate was left every week.",
            "The basement, the Sunday door",
          ],
        ],
      }),
      starterSecret({
        id: "sec_lr_song",
        title: "The song",
        truth:
          "'Last Dance at the Belhaven' was the tune of the 1924 opening night, and the number the drummer never reached at the Gala of '58. Its last bar is the Boarder's invitation: the one dance it was never given. Played in full, the Boarder comes up to the Silver Room as a guest for a single dance, the one time it can be spoken to in person, and a mortal who dances it becomes the decade's lodger.",
        keyPhrases: ["Last Dance"],
        clues: [
          [
            "clu_lr_song_1",
            "Clause five of the will begs the family not to play 'Last Dance at the Belhaven', if a girl in silver asks.",
            "The will",
          ],
          [
            "clu_lr_song_2",
            "Delphine hums the first three bars and stops, every time, before the fourth.",
            "The Silver Room",
          ],
          [
            "clu_lr_song_3",
            "The gramophone warms on its own, and the boiler answers in time.",
            "The Silver Room, after midnight",
          ],
        ],
      }),
      starterSecret({
        id: "sec_lr_gideon",
        title: "What Gideon is hiding",
        truth:
          "Gideon Marsh is on the payroll of Corbin & Vane Hospitality, who want the Belhaven's land for a spa over a geothermal spring beneath the boiler room. They paid his debts and send him a retainer to report on the hotel's finances. He did not know about the dead. He is now fond of the family, frightened of the building and in too deep.",
        keyPhrases: ["Gideon", "Corbin", "Vane", "spa"],
        clues: [
          [
            "clu_lr_gideon_1",
            "A stranger at the Pickled Heron has been asking about the hotel; his card says Corbin & Vane.",
            "The Pickled Heron",
          ],
          [
            "clu_lr_gideon_2",
            "Gideon takes a call on the roof every week, the only place with signal, and comes down quiet.",
            "The roof and cupola, at the same hour each week",
          ],
          [
            "clu_lr_gideon_3",
            "Odile shows the room behind Gideon in a mirror: the room where he types his reports.",
            "Room 305, the mirror room",
          ],
        ],
      }),
    ],
    locations: [
      starterLocation({
        id: "loc_lr_lobby",
        name: "The lobby",
        features: [
          "A mural of a river that has lost two inches every decade",
          "A front desk, a bell that rings by itself, and a wall of pigeonholes",
          "A card machine that rejects things",
        ],
        npcIds: ["npc-ambrose-pell"],
      }),
      starterLocation({
        id: "loc_lr_basement",
        name: "The basement",
        features: [
          "A green steel door to the boiler room",
          "Pipes that tick after dark",
          "Heat that is flat, steady and not quite warm",
        ],
        npcIds: ["npc-hester-quill"],
      }),
      starterLocation({
        id: "loc_lr_silver_room",
        name: "The Silver Room",
        features: [
          "A sprung floor, a gramophone and chandeliers that sway to a song that is not playing",
          "A party that never ended",
          "A warm room in a cold building",
        ],
        npcIds: ["npc-delphine-corvin"],
      }),
      starterLocation({
        id: "loc_lr_suite",
        name: "Winnie's suite",
        features: [
          "Room 401, with her tea still warm on the table",
          "A desk full of her handwriting",
          "A stairwell to the roof",
        ],
        npcIds: [],
      }),
      starterLocation({
        id: "loc_lr_kitchen",
        name: "The kitchen and cold store",
        features: [
          "A range that lights at 3 a.m.",
          "A cold store with a heavy latch",
          "Tickets that arrive from nowhere",
        ],
        npcIds: ["npc-anselm-rooke"],
      }),
      starterLocation({
        id: "loc_lr_bend",
        name: "Cutler's Bend",
        features: [
          "A main street of two blocks and a town that half-knows",
          "Bend Savings & Loan, with a clerk who reads fine print",
          "The Pickled Heron, whose mirror faces the hotel",
        ],
        npcIds: ["npc-thaddeus-orme", "npc-amos-fenn"],
      }),
    ],
    endStates: [
      {
        id: "end_lr_home",
        text: "The doors stay open and the dead stay. The hotel is a home for them.",
      },
      {
        id: "end_lr_hotel",
        text: "The doors stay open and the dead move on. The hotel is only a hotel.",
      },
      {
        id: "end_lr_leave",
        text: "The doors close and the family leaves, carrying something out with them.",
      },
      {
        id: "end_lr_stay",
        text: "The doors close and the family stays, in the empty building with the dead.",
      },
    ],
  });
}
