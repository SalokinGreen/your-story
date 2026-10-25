/**
 * Wolfwillow Crossing: three pre-made heroes as presets. Each has a one-line
 * concept, four feats (one about who they are, one about something they
 * carry) and a sheet in the Fantastic Realms template. Feats are separated
 * with semicolons on the "Feats" line. Original text (decision 3).
 */
import type { Preset } from "../../../../structs";

interface HeroSheet {
  name: string;
  concept: string;
  feats: [string, string, string, string];
  gear: string;
  tie: string;
  before: string;
  wants: string;
}

/** The Fantastic Realms sheet (sheet.ts), every field filled in. */
function sheet(h: HeroSheet): string {
  return `# ${h.name}
**Concept:** ${h.concept}

## Feats (four to start; every level adds one)
${h.feats.join("; ")}

## How you stand
**Hearts:** 3 | **Level:** 1 | **XP:** 0

## Gear
${h.gear}

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
    feats: ["Steady as a Wall", "Battered Shield", "Knows Every Road", "I Owe the Marlows"],
    gear: "A dented round shield painted with a faded stag, a short spear, a walking stick he denies needing, a tin of liniment",
    tie: "Maro is here to repay a debt: Hettie Marlow once fed his whole caravan through a hard winter, and she has written that she could use a strong back for Lantern Week.",
    before: "Twenty years guarding wagons between Thornwick and the coast; never lost one, never slept through a night.",
    wants: "A quiet chair by a fire, and one last job done properly.",
    blurb:
      "A big, tired caravan guard who wants a chair by a fire and will not leave a friend in trouble. Feats: Steady as a Wall; Battered Shield; Knows Every Road; I Owe the Marlows.",
  },
  {
    id: "wc-ilsabet-thorn",
    icon: "Wand",
    name: "Ilsabet Thorn",
    concept: "A herbalist's apprentice who talks to birds and bargains with hedges",
    feats: ["Kind Hands", "Herb Satchel", "Whispers to Beasts", "Knows Every Mushroom"],
    gear: "A satchel of dried herbs and little jars, a hooked knife, a notebook of recipes, a pet jackdaw named Pennywhistle",
    tie: "Her teacher, Maeve Oakhallow, has asked her to come and help with the autumn cures, and to bring the jackdaw, who has been behaving strangely.",
    before: "Raised in a marsh cottage by an aunt who read the weather in teacups; left for the hills to learn real medicine.",
    wants: "To be good enough that her teacher stops adding things to her list.",
    blurb:
      "A gentle herbalist with a jackdaw on her shoulder and a way with beasts. Feats: Kind Hands; Herb Satchel; Whispers to Beasts; Knows Every Mushroom.",
  },
  {
    id: "wc-jory-wick",
    icon: "Star",
    name: "Jory Wick",
    concept: "A young fiddler and part-time thief who steals only things people have stopped loving",
    feats: ["Quick Fingers", "Fiddle", "Silver Tongue", "Never Caught Twice"],
    gear: "A battered fiddle in a patched case, a set of picks, three borrowed coats worn at once, a coin that is not his",
    tie: "Jory heard there would be a fair, a crowd and a lot of unguarded pockets. Also, a ferry-keeper in Wolfwillow Crossing owes him a favour.",
    before: "Grew up in the back of a travelling show, left when the owner started counting him as stock.",
    wants: "To play for a crowd that did not lose its purse first.",
    blurb:
      "A quick, charming fiddler who lifts the odd thing and talks his way out of it. Feats: Quick Fingers; Fiddle; Silver Tongue; Never Caught Twice.",
  },
];

export const WOLFWILLOW_PRESETS: Preset[] = WOLFWILLOW_HEROES.map((h) => ({
  id: h.id,
  name: h.name,
  description: `${h.concept}. ${h.blurb}`,
  icon: h.icon,
  characterSheet: sheet(h),
  authorNotes: `Pre-made hero. Level 1, 3 hearts, 0 XP. Before the first roll, manage_meter create_set "Fantastic Realms hero" (owner = ${h.name}) and manage_feats add each of the four feats: ${h.feats.join("; ")}. Arrives at Wolfwillow Crossing for Lantern Eve.`,
}));
