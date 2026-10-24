/**
 * The Last Resort: the eight residents of the Belhaven and eight faces of
 * Cutler's Bend as NPCs. The fuller notes are in notes.ts (the residents and
 * the town); these are the cards the GM and the player see. Original text
 * (decision 3).
 */
import type { NPC } from "../../../../structs";

const STARTED_AT = Date.parse("2026-01-01T00:00:00.000Z");

function npc(
  slug: string,
  fields: Omit<NPC, "id" | "createdAt">,
): NPC {
  return { id: `npc-${slug}`, createdAt: STARTED_AT, ...fields };
}

export const LR_NPCS: NPC[] = [
  npc("ambrose-pell", {
    name: "Mr. Ambrose Pell",
    description:
      "The front desk. Died in 1961 at his post and has not taken a day off since. Polite, tireless, appalled by the new card machine. Wants the hotel run properly, which means the way it was in 1961. He cannot leave the lobby, and he cannot lie about a room.",
    role: "Front desk (ghost)",
    status: "dead",
    relationship: "Has decided you are the new management",
    attitude: "friendly",
    lastSeen: "The front desk",
    faction: "The residents",
    symbol: "🛎️",
    aliases: ["Pell", "Ambrose"],
  }),
  npc("lucille-grandison", {
    name: "Mrs. Lucille Grandison",
    description:
      "Room 214, since 1983. Dictates her memoirs to anyone with a pen (\"When I was in Havana…\", and Havana changes every time). Solid only while someone writes down what she says. Every anecdote has a different husband.",
    role: "Long-stay resident (ghost)",
    status: "dead",
    relationship: "Needs a typist",
    attitude: "friendly",
    lastSeen: "Room 214",
    faction: "The residents",
    symbol: "⌨️",
    aliases: ["Mrs. Grandison", "Lucille"],
  }),
  npc("pip-dunmore", {
    name: "Pip Dunmore",
    description:
      "Bellhop, died 1938 at nineteen in the dumbwaiter shaft. Travels only by service routes. Wants a tip: a real silver dollar, not a promise. Says \"I'll take that\" and delivers things to the wrong room. President of the Dumbwaiter Society, which has two members.",
    role: "Bellhop (ghost)",
    status: "dead",
    relationship: "Has a club",
    attitude: "friendly",
    lastSeen: "The dumbwaiter",
    faction: "The residents",
    symbol: "🧳",
    aliases: ["Pip"],
  }),
  npc("delphine-corvin", {
    name: "Delphine Corvin",
    description:
      "Singer of the Gala of '58, the party that never ended in the Silver Room. Wants the last number played; the drummer never got to it. A mortal who enters must dance one dance to leave. Calls everyone \"darling\" and takes requests.",
    role: "Bandleader (ghost)",
    status: "dead",
    relationship: "Wants to dance with you",
    attitude: "friendly",
    lastSeen: "The Silver Room",
    faction: "The residents",
    symbol: "🎷",
    aliases: ["Delphine", "the Gala of '58"],
  }),
  npc("odile-marrow", {
    name: "Miss Odile Marrow",
    description:
      "The Belhaven's seamstress and hairdresser, died 1952. Appears only in mirrors, sees what is reflected (including behind you) and cannot lie in glass. Wants to be looked at properly. Gives a verdict on everyone's posture, hair and shoes.",
    role: "Mirror resident (ghost)",
    status: "dead",
    relationship: "Has opinions about your hair",
    attitude: "neutral",
    lastSeen: "Room 305, the tall glass",
    faction: "The residents",
    symbol: "🪞",
    aliases: ["Odile"],
  }),
  npc("anselm-rooke", {
    name: "Chef Anselm Rooke",
    description:
      "The kitchen. Died in the cold store in 1974. Wants one perfect service. Cooks only when someone calls orders; his food tastes of the best day of a life and of nothing by morning. Tickets arrive from nowhere (\"table nine, two Wellingtons, now\").",
    role: "Chef (ghost)",
    status: "dead",
    relationship: "Awaiting your orders",
    attitude: "neutral",
    lastSeen: "The kitchen",
    faction: "The residents",
    symbol: "🍳",
    aliases: ["Rooke", "the Chef"],
  }),
  npc("barnaby-strand", {
    name: "Colonel Barnaby Strand",
    description:
      "Room 301. Died in the bath in 1947 and thinks it still is; the hotel is under new, shoddy staff. Wants his bill settled ($11.40). A living person cannot tell him he is dead without his going cold and loud. Complains about the radio, which plays 1947.",
    role: "Long-stay guest (ghost)",
    status: "dead",
    relationship: "Disapproves of the staff",
    attitude: "unfriendly",
    lastSeen: "Room 301",
    faction: "The residents",
    symbol: "🎖️",
    aliases: ["the Colonel", "Strand"],
  }),
  npc("hester-quill", {
    name: "Hester Quill",
    description:
      "Night maid, died 1996 and never clocked off. Appears only between midnight and five, and can lock any door in the building but one. Leaves a chocolate and a passive-aggressive note on every pillow. Guards the green door in the basement. Fond of Winnie, and says so only in notes.",
    role: "Night maid (ghost)",
    status: "dead",
    relationship: "Watching to see what you do",
    attitude: "neutral",
    lastSeen: "The laundry, after midnight",
    faction: "The residents",
    symbol: "🧺",
    aliases: ["Hester"],
  }),
  npc("odessa-brill", {
    name: "Odessa Brill",
    description:
      "Mayor of Cutler's Bend, 63. Runs the Founders' Weekend, the hotel's last full house. Wants it to go smoothly and quietly. Will do almost anything, except mention the hotel's reputation.",
    role: "Mayor",
    status: "alive",
    relationship: "Wants a quiet weekend",
    attitude: "neutral",
    lastSeen: "Town hall",
    faction: "Cutler's Bend",
    symbol: "🎗️",
    aliases: ["Mayor Brill"],
  }),
  npc("amos-fenn", {
    name: "Sheriff Amos Fenn",
    description:
      "Writes \"natural causes\" on everything. Wants retirement in March. Wants no loose ends.",
    role: "Sheriff",
    status: "alive",
    relationship: "Would rather you left it",
    attitude: "unfriendly",
    lastSeen: "The sheriff's office",
    faction: "Cutler's Bend",
    symbol: "⭐",
    aliases: ["the Sheriff", "Fenn"],
  }),
  npc("imelda-tuck", {
    name: "Dr. Imelda Tuck",
    description:
      "Coroner and large-animal vet. Signed Winnie's death certificate. Brisk, and goes quiet when the service stairs come up. Wants to be left out of it.",
    role: "Coroner",
    status: "alive",
    relationship: "Nervous around you",
    attitude: "neutral",
    lastSeen: "Her surgery",
    faction: "Cutler's Bend",
    symbol: "🩺",
    aliases: ["Dr. Tuck", "Tuck"],
  }),
  npc("thaddeus-orme", {
    name: "Thaddeus Orme",
    description:
      "Manager of the Bend Savings & Loan. Thin, polite, a reader of fine print. Wants the loan repaid or the property sold. Courtesy visits are never courtesy.",
    role: "Bank manager",
    status: "alive",
    relationship: "Holds the loan",
    attitude: "neutral",
    lastSeen: "Bend Savings & Loan",
    faction: "Bend Savings & Loan",
    symbol: "🏦",
    aliases: ["Orme", "Mr. Orme"],
  }),
  npc("mags-haskell", {
    name: "Marguerite \"Mags\" Haskell",
    description:
      "Haskell's Hardware. Wants her salt account paid. Delivers anything to the hotel's kitchen door and will never come in. Sells salt by the sack and asks no questions.",
    role: "Hardware store owner",
    status: "alive",
    relationship: "Supplier",
    attitude: "friendly",
    lastSeen: "Haskell's Hardware",
    faction: "Cutler's Bend",
    symbol: "🧂",
    aliases: ["Mags"],
  }),
  npc("lowell-quist", {
    name: "Reverend Lowell Quist",
    description:
      "Seventy, the minister. Will not bury the hotel's dead and will not say why. Stands outside the Belhaven on Sundays and says nothing. Wants to be asked the right question.",
    role: "Minister",
    status: "alive",
    relationship: "Watching from the road",
    attitude: "neutral",
    lastSeen: "Outside the front gate",
    faction: "Cutler's Bend",
    symbol: "⛪",
    aliases: ["Quist", "the Reverend"],
  }),
  npc("bernie-kowalczyk", {
    name: "Bernadette \"Bernie\" Kowalczyk",
    description:
      "Firstlight Bakery. Supplies the hotel's breakfast and a running commentary. Holds Winnie's last unpaid order, folded very small. Wants it paid and the news.",
    role: "Baker",
    status: "alive",
    relationship: "Wants the gossip",
    attitude: "friendly",
    lastSeen: "Firstlight Bakery",
    faction: "Cutler's Bend",
    symbol: "🥐",
    aliases: ["Bernie"],
  }),
  npc("dev-raman", {
    name: "Dev Raman",
    description:
      "Seventeen, line cook at the Marlow Diner. Talks to anyone. Wants out of Cutler's Bend, and a good story to take with him. Sees through Wren in about a minute.",
    role: "Line cook",
    status: "alive",
    relationship: "Curious",
    attitude: "friendly",
    lastSeen: "The Marlow Diner",
    faction: "Cutler's Bend",
    symbol: "🍔",
    aliases: ["Dev"],
  }),
];
