/**
 * The Crossroads: the overview note of Fantastic Realms' world pack. A
 * meeting place between realms that run on different rules. Original text
 * (decision 3). Scope "crossroads": pushed to every story of the default
 * setting on load (builtinNotes.ts).
 */
import type { BuiltinNote } from "../../types";

export const CROSSROADS_SCOPE = "crossroads";

export const CROSSROADS_NOTE: BuiltinNote = {
  id: "builtin:fantastic-realms:crossroads",
  title: "FR — The Crossroads",
  type: "lore",
  tags: ["Fantastic Realms", "world"],
  scope: CROSSROADS_SCOPE,
  keys: ["Crossroads", "Waymeet", "realm", "realms", "Thin Mile", "road", "travel"],
  content: `# FR — The Crossroads

The world is not one land but many realms, and they do not run on the same rules. They meet at a place called the Waymeet: a windy hill with a ring of leaning milestones, one for every road, and a well that nobody has seen the bottom of. Wanderers come to the Waymeet from every realm, trade stories, and pick a road. It is a good place to start an adventure, to end one, or to leave one for later.

## How travel works
- Each milestone marks a road to one realm. The last stretch of every road is the Thin Mile: it is quiet, a little strange, and takes about a day to walk. Nobody fights well there and nothing much happens. It is where a traveller shifts from one realm's weather to another's.
- A hero keeps everything when they cross: feats, hearts, burned feats, gear, friends. What changes is the realm. Its tone, its dangers and its **rest rule** apply from the moment they step off the Thin Mile.
- A road can be walked both ways. A traveller who turns back at the Thin Mile arrives at the Waymeet by nightfall.
- Folk from one realm are strange to another. A knight of Aurelane in Gloamreach is a rumour with a horse. A farmer of Larkenfell in Aurelane is a wonder at court. Use the difference for jokes, trouble and friendships.
- Magic is a feat in every realm, but it feels different: bright and public in Aurelane, quiet and neighbourly in Larkenfell, costly and whispered in Gloamreach.

## The three realms
- **Aurelane**, a bright, heroic realm of sun-lit cities, banners, tourneys and dragons who keep their word. Tone: swashbuckling and hopeful. Rest: **a few hours.**
- **Larkenfell**, a folk frontier of farms, woods, rivers and old barrows, where neighbours matter more than kings. Tone: homely, brave and funny, with real teeth in the dark. Rest: **a night by a fire with a full meal.**
- **Gloamreach**, a grim realm of ash, fog, plague and long memory. Tone: dark, costly and quiet, where small kindnesses count. Rest: **weeks, somewhere safe.**

When the heroes rest, call take_rest with the realm they are in: it names the condition, and the fiction decides whether they have it. A hero cannot rest in the Thin Mile or at the Waymeet's well; there is always someone watching.

## Using the Crossroads
- Start in one realm and let the others be rumours. A story can stay in one realm for a whole campaign.
- When a story turns, the next road is a good hook: a letter from a hero's past, a strange coin, a messenger in the wrong clothes.
- A quest finished is 500 to 2,000 XP. A road walked is not XP; it is a story.
- Use the realm notes for people, places, troubles and foes, and the tables (names, foes by realm, treasure, what is on the road) when you need something quickly.`,
};
