/**
 * Fantastic Realms: FR — Legends (docs/fr-expansion-design.md sections 7 and
 * 14). A stub: slice E4 fills it with the six legends. Original text
 * (decision 3).
 */
import type { BuiltinNote } from "../../types";

export const LEGENDS_NOTE: BuiltinNote = {
  id: "builtin:fantastic-realms:legends",
  title: "FR — Legends",
  type: "mechanics",
  tags: ["Fantastic Realms", "foes"],
  content: `# FR — Legends

A legend is the one foe a story is about: a wyrm in a mountain, a queen under a lake. It is a scene of its own, never a random roll. The six legends, one for each realm, are written for this note in a later release. Until then, build one yourself.

## Building a legend
1. **Name it and its lair.** The lair is half the fight: a bridge to cut, a bell to ring, a flame to drown.
2. **Give it two or three phases,** each a stat line with its own DC (2 to 6) and words, and a threat worse than the last. The first phase is DC 4 or 5; the last is DC 6 only when the heroes have a way to bring it to 5.
3. **Set the marks.** The legend has 5 or more hearts. A phase starts when its hearts fall to the mark (6 hearts: phase 2 at 4, phase 3 at 2). Damage is never capped at a mark; a crossed phase is skipped.
4. **Give it a weakness the fiction can find:** a name, a token, a place, an oath. Put the way to learn it three scenes away.
5. **XP is DC x 1,000** on the first phase's line.

## Running it
Narrate the change at every mark. The legend's turn is a threat to several heroes at once. At 0 hearts it falls, flees or yields as its nature allows, with no free threat. See FR — Bestiary for phases and for the twenty words.`,
};
