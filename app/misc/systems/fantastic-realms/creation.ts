/**
 * Fantastic Realms: FR — Character creation (design 2.8, decision 207).
 * Original text (decision 3).
 */
import type { BuiltinNote } from "../types";

export const CREATION_NOTE: BuiltinNote = {
  id: "builtin:fantastic-realms:character-creation",
  title: "FR — Character creation",
  type: "mechanics",
  tags: ["Fantastic Realms"],
  content: `# FR — Character creation

Read this in session zero. A hero is quick to make: a concept, four feats and a reason to be here. Keep it light and fun. Offer two to four suggestions at every step, drawn from the player's own words and the realm they start in, and always leave room for their own idea.

## What a hero starts with
- A one-line concept ("a retired caravan guard with a bad knee and a good shield").
- Four feats. At least one is about who they are, and at least one is about something they carry. A feat may be a single word or a short phrase.
- 3 hearts, level 1, 0 XP.
- A little gear that fits the concept. Gear is just words on the sheet; it is not counted or weighed.

## Good feats
- Single words that do a lot: Brave, Quick, Sneaky, Sword, Bow, Armor, Healer, Clever, Strong, Lucky.
- Short phrases that tell a story: "I hate goblins!", "Knows every road", "Quick Shot", "Friend of the river folk".
- Mix kinds: one who they are (Brave), one they carry (Old Sword), one they can do (Quick Shot), and one free choice.
- A feat helps when it fits what the hero is doing. If a feat would fit almost every roll, ask for a narrower wording. If it would almost never fit, ask for a wider one. Magic is a feat like any other: "Mind Control", "Fire Spark", "Whispers to Beasts".

## The steps
Step by step setup asks each player these, then the shared steps. Quick setup asks only for the world and the tone, and fills the rest from a short chat.
1. **Concept.** One line: who they are and what they do.
2. **Feats.** The four feats, with suggestions drawn from the concept and the realm.
3. **Realm tie.** Why the hero is in the starting realm: an errand, a debt, a flight, a promise, a curiosity. It should point at the first scene.
4. **Name and look.** A name, and two things people notice.
5. **History.** Where they come from, in three short questions: who raised them, what did they leave behind, what are they proud of.
6. **Drives.** What they want from this adventure, and one thing they will not do.

## When the feats are known
Call manage_meter create_set "Fantastic Realms hero" with owner = the hero's name, then manage_feats add once for each of the four feats, however the hero was made. Write the sheet (a character_sheet note, titled "Character: <name>" in a group) with the concept, the four feats, hearts 3, level 1, XP 0 and the gear. A pre-made hero still needs the meter set and the four feats added before the first roll. Tell the player once how a roll works: one die, plus one for each feat that fits, and a result of 2 or more successes is a clean win.

## A hero who joins later
Make them the same way, in a short chat, in the scene they arrive in. They start at level 1 even in a story that is far along; the table can agree to start them with a feat or two earned along the way.`,
};
