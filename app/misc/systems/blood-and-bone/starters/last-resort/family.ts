/**
 * The Last Resort: the five relatives (design 4.3, decision 168) as pre-made
 * characters, and the note the GM plays the unpicked ones from. Each sheet is
 * the Blood & Bone sheet template (../../sheet.ts) filled in by the rules:
 * stats 3, 2, 2, 1, 1; a real Kind and Archetype; a Path and its first
 * ability; one free Power and its first ability; two Connections; a Burden
 * none or one; two or three pieces of gear. Original text (decision 3).
 */
import type { Preset, StoryLore } from "../../../../structs";
import { starterNote } from "../shared";

interface Sheet {
  name: string;
  kind: string;
  archetype: string;
  path: string;
  stats: [nerve: number, heart: number, bone: number, shadow: number, wits: number];
  triggers: string;
  recover: string;
  weakness: string;
  xp: string;
  connections: string;
  burdens: string;
  power: string;
  pathAbility: string;
  other: string;
  gear: string;
  before: string;
  moment: string;
  whoKnows: string;
}

/** The sheet template with every field filled in; no `{{` is left. */
function sheet(s: Sheet): string {
  const [nerve, heart, bone, shadow, wits] = s.stats;
  return `# ${s.name}
**Kind:** ${s.kind}
**Archetype:** ${s.archetype}
**Path:** ${s.path}

## Stats (each 1-3; assign 3, 2, 2, 1, 1)
Nerve ${nerve} | Heart ${heart} | Bone ${bone} | Shadow ${shadow} | Wits ${wits}
Adds cap at +2 per roll; the action score caps at 10.

## Your Kind
**Stress triggers:** ${s.triggers}
**Recover move:** ${s.recover}
**Weakness:** ${s.weakness}
**XP triggers in play:** ${s.xp}

## Connections (Weak, Steady or Strong)
${s.connections}

## Burdens
${s.burdens}

## Assets (abilities taken)
**Power:** ${s.power}
**Path ability:** ${s.pathAbility}
**Other assets:** ${s.other}
**Gear:** ${s.gear}
**Used tonight:** None

## Background
**Before:** ${s.before}
**The moment:** ${s.moment}
**Who knows:** ${s.whoKnows}
`;
}

const HUNTER_TRIGGERS =
  "A hunt goes wrong; being forced to work with or spare a monster; seeing how close you have come to becoming what you hunt";
const HUNTER_RECOVER =
  "Steel the Resolve: confide in an ally, return to a place of safety or finish a hunt clean (Heart if leaning on a connection, Wits if on routine)";
const HUNTER_WEAKNESS =
  "No supernatural healing and no Sate the Beast shortcut; recovery is time, medicine and other people";

const DARA = sheet({
  name: "Dara Alder",
  kind: "Hunter",
  archetype: "The Zealot",
  path: "Fixer",
  stats: [2, 2, 1, 1, 3],
  triggers: `${HUNTER_TRIGGERS}. Showing a monster mercy costs 1 Stress even when it earns XP`,
  recover: `${HUNTER_RECOVER}; +1 when it follows a hunt finished clean`,
  weakness: HUNTER_WEAKNESS,
  xp: "Archetype XP",
  connections:
    "Wren, her daughter (Steady); Mr. Ambrose Pell, who has decided she is the new management (Weak)",
  burdens: "None",
  power: "Steady Hands 1 (when you Face Danger against something that should terrify you, add +1)",
  pathAbility:
    "Fixer 1 (once per session, produce a mundane item, document or introduction you shouldn't reasonably have)",
  other: "None yet",
  gear: "The Belhaven's ring of master keys, a clipboard with the fire-code checklist, a laminated inspector's badge from her old job (expired)",
  before: "A claims adjuster for a regional insurer, until the layoffs. She knows exactly what a bad building costs.",
  moment: "Reading the will in the lobby, when the bell rang by itself and nobody was at the desk.",
  whoKnows:
    "Her kids and now Mr. Pell. She does not intend to tell her sister, or the bank. She has made a laminated list of house rules for the dead.",
});

const WREN = sheet({
  name: "Wren Alder",
  kind: "Hunter",
  archetype: "The Pragmatist",
  path: "Journalist",
  stats: [1, 3, 1, 2, 2],
  triggers: `${HUNTER_TRIGGERS}. As a Pragmatist, working with a monster is not a trigger by itself; betrayal or harm is`,
  recover: HUNTER_RECOVER,
  weakness: HUNTER_WEAKNESS,
  xp: "Archetype XP",
  connections:
    "Otto, her little brother (Steady); Dev Raman at the Marlow Diner, who thinks she makes things up (Weak)",
  burdens: "None",
  power: "Monster Lore 1 (when you Gather Information about a supernatural creature, add +1)",
  pathAbility:
    "Journalist 1 (when you Gather Information through interview or conversation, add +2)",
  other: "None yet",
  gear: "Winnie's hand mirror (from the will; it tells the truth if you ask politely), her mother's old phone with a voice-memo app, a notebook of the dead's names",
  before: "Sixteen, the school newspaper, a podcast with eleven listeners.",
  moment:
    "Age eight, in a grandmother's kitchen, when the person who had been talking to her turned out not to be there. She has heard them ever since.",
  whoKnows:
    "Otto thinks it is brilliant. Mr. Pell thinks it is rude not to say hello. Her mother thinks it is a phase.",
});

const OTTO = sheet({
  name: "Otto Alder",
  kind: "Hunter",
  archetype: "The Pragmatist",
  path: "Outcast",
  stats: [3, 2, 1, 2, 1],
  triggers: `${HUNTER_TRIGGERS}. As a Pragmatist, working with a monster is not a trigger by itself; betrayal or harm is`,
  recover: HUNTER_RECOVER,
  weakness: HUNTER_WEAKNESS,
  xp: "Archetype XP",
  connections:
    "Pip Dunmore, bellhop, president of the Dumbwaiter Society (Steady); Wren, his big sister (Weak)",
  burdens: "None",
  power:
    "The Uneasy Alliance 1 (you may hold Connections with supernatural creatures at Steady or Strong; when you call on one for aid, add +1)",
  pathAbility:
    "Outcast 1 (mortal systems don't track you; adults do not watch a nine-year-old; add +1 to avoid mundane surveillance)",
  other: "None yet",
  gear: "A flashlight, a pair of walkie-talkies (one lives in the dumbwaiter), a jar of silver dollars he is saving",
  before: "Nine, third grade, the one whose report card says \"quiet reader\".",
  moment: "The first afternoon, when the dumbwaiter came up with a hand in it, and the hand shook his.",
  whoKnows:
    "Pip, Wren and the club (two members, one of them dead). Mum knows he has a friend in the walls and thinks it is plumbing.",
});

const WINNIE = sheet({
  name: "Winifred \"Winnie\" Alder",
  kind: "Ghost",
  archetype: "The Seeker",
  path: "Socialite",
  stats: [1, 3, 1, 2, 2],
  triggers:
    "Confronting the manner of your death; your tether (the truth of how you died, and the Belhaven) threatened or ignored; direct contact with the living world (running water, hallowed ground, touch)",
  recover:
    "Sate the Beast: learn something true about your death from a witness, a record or a place (on a strong hit, a new lead, or the Fading's penalty lifted for the night)",
  weakness:
    "The Fading begins at Stress 4. Your tether is a discoverable thing; whoever resolves or claims it can make you move on",
  xp: "Archetype XP",
  connections:
    "Mr. Ambrose Pell, the desk (Steady); Dara, her great-niece, whom she hoped would come (Weak)",
  burdens: "None",
  power: "The Haunting 1 (you can affect a space's atmosphere: cold, sound, the feeling of being watched; when you Secure an Advantage that way, add +1)",
  pathAbility:
    "Socialite 1 (when you Compel through charm, status or social pressure, add +1)",
  other: "None yet",
  gear: "The keys she died with, her good cardigan (the shape she wears), the Belhaven register's missing page (she does not know she wants it)",
  before: "Hotelier. Forty-four years at the Belhaven, most of them on the desk beside Mr. Pell.",
  moment:
    "Waking at the front desk at the end of August, Mr. Pell saying, \"Welcome back, Miss Alder,\" and the whole night before it gone.",
  whoKnows:
    "Mr. Pell, Hester and the residents. The family does not know you are here yet. You do not know how you died.",
});

const GIDEON = sheet({
  name: "Gideon Marsh",
  kind: "Hunter",
  archetype: "The Pragmatist",
  path: "Lawyer",
  stats: [1, 2, 1, 3, 2],
  triggers: `${HUNTER_TRIGGERS}. As a Pragmatist, working with a monster is not a trigger by itself; betrayal or harm is`,
  recover: HUNTER_RECOVER,
  weakness: HUNTER_WEAKNESS,
  xp: "Archetype XP",
  connections:
    "Fenella, his wife, a field researcher away since June (Steady); a lender who settled his debts and writes every month (Weak)",
  burdens:
    "Indebted, to a lender who expects something in return (begins play at Stress 1)",
  power:
    "The Network 1 (you have contacts in one county who can provide shelter, information or a clean exit; when you Slip Away through them, add +1)",
  pathAbility:
    "Lawyer 1 (when you Compel using rules, procedure or legal threat, add +1)",
  other: "None yet",
  gear: "A leather briefcase with two phones in it, a recorder in his pen, an expired bar card",
  before: "A contracts lawyer who left a firm one step ahead of a lawsuit.",
  moment: "Reading the register's last page by flashlight and finding it already signed.",
  whoKnows:
    "Nobody knows what he owes. He does not know about the dead. He is learning, and he is fond of the family.",
});

export const LR_PRESETS: Preset[] = [
  {
    id: "lr-dara-alder",
    name: "Dara Alder",
    description:
      "The heir the will named. Forty-one, a laid-off insurance adjuster who reads every lease and has never run a hotel. She wants to keep the doors open and the dead orderly, and is learning the dead have a say.",
    icon: "Key",
    characterSheet: DARA,
    authorNotes:
      "The named heir, a Zealot: she believes in rules, and the house's rules are not hers. Her Vow is the family's: keep the doors open. Comedy: a laminated policy against ghosts in the corridors after ten. Test: when she must show a ghost mercy. Starting Stress 2.",
  },
  {
    id: "lr-wren-alder",
    name: "Wren Alder",
    description:
      "Dara's sixteen-year-old. She has heard the dead since she was eight and is the only one in the family who is not surprised. Journalist, podcaster, Winnie's hand mirror in her pocket.",
    icon: "Search",
    characterSheet: WREN,
    authorNotes:
      "Hears the dead, which is fiction, not a Power: let her hear any ghost, and let the residents like her and bring her problems. Her risk: a ghost telling her something the living should not know. Starting Stress 2.",
  },
  {
    id: "lr-otto-alder",
    name: "Otto Alder",
    description:
      "Dara's nine-year-old. Within a day he had joined the Dumbwaiter Society, which has two members, one of them dead. He is the family's best ambassador and its worst secret-keeper.",
    icon: "Star",
    characterSheet: OTTO,
    authorNotes:
      "A child at a hotel full of ghosts: play the warmth and the real danger of the dumbwaiter shaft, the basement and the Colonel's bath. The residents protect him, and the Boarder notices. Never put him in harm for a joke. Starting Stress 2.",
  },
  {
    id: "lr-winnie-alder",
    name: "Winnie Alder (a Ghost)",
    description:
      "The relative who died and left the hotel. Seventy-four, forty-four years at the desk, and she woke in August with no memory of her last night. Play her as a Ghost, a Seeker, tethered to one question: how did she die?",
    icon: "Ghost",
    characterSheet: WINNIE,
    authorNotes:
      "A Ghost Seeker: the truth of her death is the secret How Winnie died, as a few facts held by people. Count the facts as she learns them; say when one is left. She cannot leave the Belhaven for long. If she is played, the family learns she is here early, probably in the lobby at midnight. Starting Stress 2.",
  },
  {
    id: "lr-gideon-marsh",
    name: "Gideon Marsh",
    description:
      "Dara's brother-in-law, a failed contracts lawyer who came along to help. He is charming, practical and useful, and he is hiding something from the family he is fond of. Human by default.",
    icon: "Drama",
    characterSheet: GIDEON,
    authorNotes:
      "The in-law with a secret: he owes someone, and the debt has a price (the secret What Gideon is hiding). Let the player choose when it breaks: Beat 5, the audit, is the natural moment. A Pragmatist who may still be talked into the right thing. Begins at Stress 1 (his Burden's benefit).",
  },
];

const FAMILY = `# The Last Resort — The family

The five relatives. Players pick from the pre-made sheets; the ones nobody picks are in the hotel and are yours to play, lightly. For each: what they want this season, a bit, and how to hand them to the table.

**Dara Alder**, 41, the heir. Zealot. *Wants* the books balanced and a night's sleep. *Bit:* a laminated rule for everything, including one for the dead. *Played by you:* organises, delegates, takes the bank's calls, loses a rule a week to the house. *Hand off:* ask the table what she does in the crisis.

**Wren Alder**, 16. *Wants* to be taken seriously, and to make a friend who isn't dead. *Bit:* narrates the day into her phone as if it is a podcast. Hears the dead; the residents come to her with problems. *Played by you:* the family's translator; she says what the ghosts say. *Hand off:* she knows something no one else does; offer it as a hook.

**Otto Alder**, 9. *Wants* Pip to get his tip, and a new member for the Dumbwaiter Society. *Bit:* treats the hotel's rules as a game he is winning. *Played by you:* a spark for the scene, never the cause of the danger. The residents shield him; the Boarder notices him. *Hand off:* the club has a secret meeting.

**Winnie Alder**, 74, dead. *Wants* to know what happened and to see the hotel survive; has no memory of her last night. *Bit:* an old hotelier's gentle command over everyone, living or not. *Played by you:* she wakes by Week 2, confused at the desk, tethered to the question. She asks the questions the table has not. Her death is the secret How Winnie died. *Hand off:* she can be a player at any time; offer her sheet.

**Gideon Marsh**, 44, the in-law. *Wants* to be useful, and to stop owing. *Bit:* offers to take a call and takes it in the car park. *Played by you:* helpful, charming, observant, slightly too interested in the books. His secret is in the note What Gideon is hiding: do not play it as villainy. *Hand off:* a private moment with a player, a confession.

If only one player is at the table, pair them with whichever relative they most want to travel with; the rest of the family is the supporting cast. If two, the others are the same. All five live in the hotel: the family rooms are on the fourth floor.`;

export const LR_FAMILY_NOTE: StoryLore = starterNote(
  "The Last Resort — The family",
  "lore",
  FAMILY,
  {
    keys: ["Dara", "Wren", "Otto", "Winnie", "Gideon", "family"],
    characters: ["Dara Alder", "Wren Alder", "Otto Alder", "Winnie Alder", "Gideon Marsh"],
  },
);
