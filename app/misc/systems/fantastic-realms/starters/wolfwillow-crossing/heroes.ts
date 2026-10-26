/**
 * Wolfwillow Crossing: three pre-made heroes as presets. Each follows a
 * calling (FR — Callings): the signature feat plus three from the calling's
 * kit, and the calling's once-per-rest move noted on the sheet. Each has a
 * one-line concept, four feats and a sheet in the Fantastic Realms template.
 * Feats are separated with semicolons on the "Feats" line; the first is the
 * signature. An item feat is listed in `items` with its quality words.
 * Original text (decision 3).
 */
import type { Preset } from "../../../../structs";

interface HeroSheet {
  name: string;
  concept: string;
  /** The signature feat first, then three from the calling's kit. */
  feats: [string, string, string, string];
  /** One of the twelve callings (FR — Callings). */
  calling: string;
  move: { name: string; effect: string };
  /** Item feats among the four, with their quality words (at most two each). */
  items: { feat: string; qualities: string[] }[];
  gear: string;
  tie: string;
  before: string;
  wants: string;
}

/** The Fantastic Realms sheet (sheet.ts), every field filled in. */
function sheet(h: HeroSheet): string {
  const items = h.items.length
    ? h.items.map((i) => `${i.feat} (${i.qualities.join(", ")})`).join("; ")
    : "none";
  return `# ${h.name}
**Concept:** ${h.concept}

## Feats (four to start; every level adds one)
${h.feats.join("; ")}
**Calling:** ${h.calling}. Signature feat: ${h.feats[0]}.
**Calling move (once per rest; not a feat, adds no die):** *${h.move.name}*, ${h.move.effect}.

## How you stand
**Hearts:** 3 | **Level:** 1 | **XP:** 0

## Gear
${h.gear}
**Items (feats you carry, with qualities):** ${items}

## Conditions and scars
**Conditions:** none
**Scars:** none

## Background
**Realm tie:** ${h.tie}
**Before:** ${h.before}
**You want:** ${h.wants}
`;
}

export interface WolfwillowHero extends HeroSheet {
  id: string;
  icon: string;
  blurb: string;
}

export const WOLFWILLOW_HEROES: WolfwillowHero[] = [
  {
    id: "wc-maro-quillfeather",
    icon: "Shield",
    name: "Maro Quillfeather",
    concept: "A retired caravan guard with a bad knee and a good shield",
    feats: ["Veteran", "Battered Shield", "Tough", "Hard Eyes"],
    calling: "Sellsword",
    move: { name: "Hold the Line", effect: "take a miss's cost for an ally, once" },
    items: [{ feat: "Battered Shield", qualities: ["sturdy"] }],
    gear: "A dented round shield painted with a faded stag, a short spear, a walking stick he denies needing, a tin of liniment",
    tie: "Maro is here to repay a debt: Hettie Marlow once fed his whole caravan through a hard winter, and she has written that she could use a strong back for Lantern Week.",
    before:
      "Twenty years guarding wagons between Thornwick and the coast; never lost one, never slept through a night. Half the road knows his name and he knows every mile of it.",
    wants: "A quiet chair by a fire, and one last job done properly.",
    blurb:
      "A big, tired caravan guard who wants a chair by a fire and will not leave a friend in trouble. Calling: Sellsword (move: Hold the Line). Feats: Veteran; Battered Shield; Tough; Hard Eyes.",
  },
  {
    id: "wc-ilsabet-thorn",
    icon: "Wand",
    name: "Ilsabet Thorn",
    concept: "A herbalist's apprentice who talks to birds and bargains with hedges",
    feats: ["Hedge-Craft", "Herbs and Brews", "Familiar", "Cunning"],
    calling: "Witch",
    move: { name: "Brew", effect: "one sip clears a condition that names no cure, once" },
    items: [{ feat: "Herbs and Brews", qualities: ["blessed"] }],
    gear: "A satchel of dried herbs and little jars, a hooked knife, a notebook of recipes, and Pennywhistle the jackdaw, her familiar",
    tie: "Her teacher, Maeve Oakhallow, has asked her to come and help with the autumn cures, and to bring the jackdaw, who has been behaving strangely.",
    before: "Raised in a marsh cottage by an aunt who read the weather in teacups; left for the hills to learn real medicine.",
    wants: "To be good enough that her teacher stops adding things to her list.",
    blurb:
      "A gentle herbalist with a jackdaw on her shoulder and a way with hedges. Calling: Witch (move: Brew). Feats: Hedge-Craft; Herbs and Brews; Familiar; Cunning.",
  },
  {
    id: "wc-jory-wick",
    icon: "Star",
    name: "Jory Wick",
    concept: "A young fiddler and part-time thief who steals only things people have stopped loving",
    feats: ["Silver Tongue", "Fiddle", "Quick Wit", "Charming"],
    calling: "Bard",
    move: { name: "Encore", effect: "the DC of an ally's next roll this scene is one lower (never under 2)" },
    items: [{ feat: "Fiddle", qualities: ["returning"] }],
    gear: "A battered fiddle in a patched case that always seems to find its way back to him, a set of picks, three borrowed coats worn at once, a coin that is not his",
    tie: "Jory heard there would be a fair, a crowd and a lot of unguarded pockets. Also, a ferry-keeper in Wolfwillow Crossing owes him a favour.",
    before: "Grew up in the back of a travelling show, left when the owner started counting him as stock.",
    wants: "To play for a crowd that did not lose its purse first.",
    blurb:
      "A quick, charming fiddler who lifts the odd thing and talks his way out of it. Calling: Bard (move: Encore). Feats: Silver Tongue; Fiddle; Quick Wit; Charming.",
  },
];

/** The authorNotes line: the engine calls the GM makes for this hero. */
function authorNotes(h: WolfwillowHero): string {
  const items = h.items
    .map((i) => `${i.feat} as kind "item" with quality ${i.qualities.join(", ")}`)
    .join("; ");
  return `Pre-made hero. Level 1, 3 hearts, 0 XP. Before the first roll, manage_meter create_set "Fantastic Realms hero" (owner = ${h.name}) and manage_feats add each of the four feats: ${h.feats.join("; ")}${items ? ` (${items})` : ""}. Calling: ${h.calling}; the move ${h.move.name} is played with manage_feats use (feat "${h.move.name}", per rest). Arrives at Wolfwillow Crossing for Lantern Eve.`;
}

export const WOLFWILLOW_PRESETS: Preset[] = WOLFWILLOW_HEROES.map((h) => ({
  id: h.id,
  name: h.name,
  description: `${h.concept}. ${h.blurb}`,
  icon: h.icon,
  characterSheet: sheet(h),
  authorNotes: authorNotes(h),
}));
