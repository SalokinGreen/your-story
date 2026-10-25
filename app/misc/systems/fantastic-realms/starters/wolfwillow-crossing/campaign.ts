/**
 * Wolfwillow Crossing's campaign record (docs/campaign-format-design.md
 * section 9, decision 224): an adventure path. Seven beats laid over Lantern
 * Week, the barrow king's front and the goblins' flight, the secrets that
 * explain both, and the endings the heroes can earn. Original text
 * (decision 3). Fantastic Realms offers `take_rest` and `end_session`, so the
 * barrow's clock ticks on rests (a night by a fire with a full meal).
 */
import type { CampaignRecord } from "../../../../campaign/types";
import {
  starterBeats,
  starterClock,
  starterFaction,
  starterFront,
  starterLocation,
  starterPerson,
  starterRecord,
  starterSecret,
} from "../../../../campaign/starterKit";

export function wolfwillowCampaign(): CampaignRecord {
  return starterRecord("adventure_path", {
    pitch: {
      premise:
        "On Lantern Eve a folk-frontier village begins a week of paper lanterns, cider and a fair on the green. Nothing is wrong yet, but the new dam at Oakhallow Mill has changed the water, the goblins are early this year, and the barrow on Greyhill has been quiet a very long time.",
      tone: ["homely", "brave", "funny"],
    },
    factions: [
      starterFaction({
        id: "fac_ww_goblins",
        name: "The goblins",
        goal: "Get south, away from whatever is stirring under Greyhill.",
        methods: "Early raids, scouts who steal pies, and a Warchief who will go through any farm to save his people.",
      }),
      starterFaction({
        id: "fac_ww_hedge",
        name: "The hedge-folk",
        goal: "Keep the hill left alone.",
        methods: "Polite messages, riddles, and knowing everything.",
      }),
      starterFaction({
        id: "fac_ww_wardens",
        name: "The Wardens of the Marches",
        goal: "Hold a hundred miles of woods with six rangers.",
        methods: "Patrols, favours asked of travellers, and Captain Thistledown's dry honesty.",
      }),
    ],
    fronts: [
      starterFront({
        id: "frt_ww_king",
        name: "The barrow on Greyhill",
        doom: "On the night of the last lantern the barrow opens, and Hollin Greycrown, a king buried alive by his own people, rises to come home.",
        dangers: [
          { name: "Hollin Greycrown", impulse: "to be remembered, and to come home" },
          { name: "The Barrow Wights", impulse: "to guard the king's door against everyone" },
        ],
        portents: [
          [2, "The lantern on the bridge's middle post gutters though there is no wind."],
          [4, "The Sallow runs low and the barrow's moat shows its stones."],
          [6, "Every dog in the valley faces Greyhill at dusk and will not be called away."],
          [7, "A light walks on Greyhill, carrying nothing."],
        ],
        stakes: [
          "What is stirring on Greyhill?",
          "Will the village be ready for whatever it is?",
        ],
        clockId: "clk_ww_king",
      }),
      starterFront({
        id: "frt_ww_goblins",
        name: "Goblins in the orchards",
        doom: "The goblins, fleeing the hill, raid Oakhallow Mill under their Warchief; the dam cracks and the barrow's moat starts to drain.",
        dangers: [
          { name: "The Goblin Warchief", impulse: "to get his people south, over any farm that stands in the way" },
        ],
        portents: [
          [1, "A goblin scout is caught stealing a pie, and is afraid rather than hungry."],
          [3, "Sheep go missing and a cart, and the tracks lead into the Hushwood."],
          [5, "Smoke rises over Oakhallow Mill at dusk."],
        ],
        stakes: [
          "Why are the goblins early this year?",
          "Will the heroes stop the raids, or understand them?",
        ],
        clockId: "clk_ww_goblins",
      }),
    ],
    clocks: [
      starterClock({
        id: "clk_ww_king",
        name: "The barrow wakes",
        segments: 8,
        triggers: ["rest"],
        link: { kind: "front", id: "frt_ww_king" },
        onFill: "The barrow opens on the night of the last lantern. Hollin Greycrown rises, whether or not anyone is ready.",
        visible: false,
      }),
      starterClock({
        id: "clk_ww_goblins",
        name: "The goblins grow bold",
        segments: 8,
        triggers: ["scene"],
        link: { kind: "front", id: "frt_ww_goblins" },
        onFill: "The Warchief leads a real raid on Oakhallow Mill by night.",
        visible: true,
      }),
    ],
    people: [
      starterPerson({
        npcId: "npc-orrin-fash",
        want: "The lantern on the bridge kept lit, and nobody asking why.",
        secret: "His grandfather swore the village to keep a lantern on the bridge so the king would know the way home and not come looking.",
        voice: "Careful and courteous. Counts as he talks.",
      }),
      starterPerson({
        npcId: "npc-hettie-marlow",
        want: "A fair that goes off without a hitch.",
        secret: "She wants the captured goblin scout kept quiet so as not to frighten the fair.",
        voice: "Loud and warm. Feeds you before she asks who you are.",
      }),
      starterPerson({
        npcId: "npc-wynn-alderby",
        want: "His new dam left alone and admired.",
        secret: "He does not know the dam woke anything, and will be crushed when he finds out.",
        voice: "Stiff and proud. Hears criticism in every sentence.",
      }),
      starterPerson({
        npcId: "npc-maeve-oakhallow",
        want: "Another pot of tea, and to be consulted before anyone does anything.",
        secret: "She has guessed there is a king under the hill, and has told no one in case she is wrong.",
        voice: "Vague and kind, with a riddle when she is tired.",
      }),
      starterPerson({
        npcId: "npc-tobin-sparrowgate",
        want: "To be useful to the strangers.",
        voice: "Breathless. Tells everything he knows in the wrong order.",
      }),
      starterPerson({
        npcId: "npc-granny-eskel",
        want: "To tell the whole story, once, to someone who will not interrupt.",
        secret: "She has the king's name, Hollin, and the old song that goes with it.",
        voice: "Slow and wry. Never tells a story the same way twice.",
      }),
      starterPerson({
        npcId: "npc-rue-thistledown",
        want: "Willing hands to watch the marches.",
        voice: "Dry and short. Asks favours as if they were orders she is sorry to give.",
      }),
    ],
    secrets: [
      starterSecret({
        id: "sec_ww_king",
        title: "The king under Greyhill",
        truth:
          "Hollin Greycrown, a king buried alive by his own people, lies in the barrow on Greyhill and is waking. The new dam at Oakhallow Mill has changed the water, and the river no longer fills the barrow's moat. The Redthistle goblins have always known he was there, and are fleeing south from his stirring. He can be fought, laid to rest by giving him back his name and a funeral, or bargained with.",
        keyPhrases: ["Hollin", "Greycrown", "king"],
        clues: [
          [
            "clu_ww_king_1",
            "Tobin saw a light on Greyhill, and it did not move like a lantern.",
            "Tobin Sparrowgate, anywhere in the village",
          ],
          [
            "clu_ww_king_2",
            "The goblin scout stealing pies is afraid, not hungry, and keeps looking back at the hill.",
            "The green, during the fair",
          ],
          [
            "clu_ww_king_3",
            "The Sallow runs lower each day at the ford, and the barrow's moat shows its stones.",
            "The ford and Greyhill",
          ],
        ],
      }),
      starterSecret({
        id: "sec_ww_lantern",
        title: "The lantern promise",
        truth:
          "Orrin Fash's grandfather swore the village to keep a lantern on the bridge so that the king, if he ever woke, would know the way home and not come looking. The village has kept the promise as a custom and forgotten the reason. The best endings give the king what the promise only postponed: his name, a light and a burial done right.",
        keyPhrases: ["lantern promise", "grandfather"],
        clues: [
          [
            "clu_ww_lantern_1",
            "One lantern, on the bridge's middle post, is never lit, and Orrin's eyes go to it whenever strangers mention the hill.",
            "The bridge and the ferry-house",
          ],
          [
            "clu_ww_lantern_2",
            "The hedge-folk send a polite message, in a rhyme: leave the hill alone, and keep the light by the water.",
            "The Hushwood, or a message left on the bridge",
          ],
          [
            "clu_ww_lantern_3",
            "Granny Eskel has the other half of the story: a king's name, Hollin, and the verses of the old song.",
            "A chair by the green, once she trusts you",
          ],
        ],
      }),
    ],
    locations: [
      starterLocation({
        id: "loc_ww_bridge",
        name: "The bridge",
        features: [
          "Long, wooden and hung with paper lanterns",
          "A paper lantern hung from every post along the rails",
          "The old willow leaning from the far bank",
        ],
        npcIds: ["npc-tobin-sparrowgate"],
      }),
      starterLocation({
        id: "loc_ww_ferry",
        name: "The ferry-house",
        features: [
          "Every window lit and a visitors' book by the door",
          "A bed for guests and an old man counting faces",
          "A hand-painted sign: please sign the book",
        ],
        npcIds: ["npc-orrin-fash"],
      }),
      starterLocation({
        id: "loc_ww_barn",
        name: "The Cider Barn",
        features: [
          "Beds, supper and the smell of baked apples",
          "A fiddle on the green outside",
          "Hettie's ledger of favours owed",
        ],
        npcIds: ["npc-hettie-marlow", "npc-granny-eskel"],
      }),
      starterLocation({
        id: "loc_ww_mill",
        name: "Oakhallow Mill",
        features: [
          "A new dam, a mile upriver",
          "A millrace that runs strange and low",
          "A miller who answers questions with his chin raised",
        ],
        npcIds: ["npc-wynn-alderby"],
      }),
      starterLocation({
        id: "loc_ww_greyhill",
        name: "Greyhill",
        features: [
          "A green hill above the village with a standing stone",
          "A barrow ringed by an old moat",
          "A silence where the birds should be",
        ],
        npcIds: [],
      }),
    ],
    beats: starterBeats([
      [
        "bt_ww_1",
        "Lantern Eve",
        "The heroes arrive. A supper, a bed, the visitors' book, and a quarrel about the dam. Nothing is wrong yet; plant Orrin's careful look, the unlit lantern and Tobin's story of a light on Greyhill.",
      ],
      [
        "bt_ww_2",
        "The Fair",
        "A day of games, contests and gossip. A goblin scout is caught stealing a pie and Hettie wants it kept quiet. Maeve reads a sign. A first small fight.",
      ],
      [
        "bt_ww_3",
        "Stolen Things",
        "Sheep missing, a cart gone, a farmer's boy lost for a night. Tracks lead into the Hushwood, and the hedge-folk send a polite message.",
      ],
      [
        "bt_ww_4",
        "The Raid on the Mill",
        "A real goblin raid at Oakhallow at night, with the Warchief. The mill is damaged, the dam cracks and the barrow's moat starts to drain.",
      ],
      [
        "bt_ww_5",
        "What Orrin Knows",
        "Orrin tells the story of the king, the lantern and the promise, and Granny Eskel tells the other half. The heroes learn what the barrow needs.",
      ],
      [
        "bt_ww_6",
        "Greyhill",
        "The barrow opens on the night of the last lantern. Wights, then Hollin Greycrown himself, who can be fought, laid to rest by name, or bargained with.",
      ],
      [
        "bt_ww_7",
        "The Last Lantern",
        "The lanterns go down the river, one more than there were. The village changes, and an old coin arrives from the Waymeet with a message for a hero: a road, if they want it.",
      ],
    ]),
    endStates: [
      {
        id: "end_ww_rest",
        text: "The king is laid to rest. He gets his name back and a funeral done right, the light stays lit, and the barrow is quiet for a better reason.",
      },
      {
        id: "end_ww_fight",
        text: "The king is fought and felled. It costs more than anyone has, and the village remembers who paid.",
      },
      {
        id: "end_ww_bargain",
        text: "A bargain is struck with the king. He does not come down the hill, and the village owes him something it does not yet know how to pay.",
      },
      {
        id: "end_ww_wake",
        text: "The heroes are elsewhere. The lanterns go out one by one, the barrow opens on the last night anyway, and the village meets its king unprepared.",
      },
    ],
  });
}
