/**
 * Fantastic Realms: FR — Legends (docs/fr-expansion-design.md sections 7 and
 * 14, slice E4): how a legend is built and run, and the six legends, one per
 * realm. Each legend's first line is the stat line its realm note prints; the
 * later phases are "**Name, Phase n** — DC n · Words · Hearts mark (m) ·
 * Threat: ..." with the marks descending. Original text (decision 3).
 */
import type { BuiltinNote } from "../../types";

export const LEGENDS_NOTE: BuiltinNote = {
  id: "builtin:fantastic-realms:legends",
  title: "FR — Legends",
  type: "mechanics",
  tags: ["Fantastic Realms", "foes"],
  content: `# FR — Legends

A legend is the one foe a story is about: a wyrm in a mountain, a queen under a lake. It is a scene of its own, never a random roll. Read the realm's note for its place in the world and this note for its phases and its lair.

## Running a legend
- **Hearts decide the phase.** A phase starts when the legend's remaining hearts fall to its mark. Damage is never capped at a mark; a blow that crosses two marks skips the middle phase. Narrate the change, then use the new phase's DC and threat.
- **Each phase has its own DC and threat,** each worse to face than the last. A later phase may be easier to hit (its armour cracked) and still deadlier.
- **It falls at 0 hearts,** flees or yields as its nature allows, with no free threat. Award its XP with award_xp.
- **The lair is half the fight.** Name its features when the heroes arrive. The weakness is a thing the fiction can find, put three scenes away, and it lowers the legend's DC by 1 for a scene (never under 2) or ends a threat.
- The legend's turn is a threat to several heroes at once. A miss costs the roll's one harm budget as usual. The words are in FR — Bestiary.

## Emberwing, the Gold Dragon (Aurelane)
**Lair:** the Beacon on Mount Halcyon: a bowl of gold, a bronze bell on a chain, a ledge over a long drop. **Weakness:** a song she has never heard, or a truth said in front of her court.
**Emberwing, the Gold Dragon** — DC 6 · Flying, Fire-Breath, Armored, Proud · Hearts 6 · XP 6000
Threat: insults the heroes, then sweeps flame across the whole party.
**Emberwing, Phase 2** — DC 5 · Fire-Breath, Proud, Furious · Hearts mark (4) · Threat: grounded by a torn wing, she lashes tail and breath and the ledge cracks under the heroes' feet.
**Emberwing, Phase 3** — DC 6 · Flying, Fire-Breath, Reckless · Hearts mark (2) · Threat: she takes to the sky over the city and burns a tower; the heroes must save people and strike at once.

## Hollin Greycrown, the Barrow King (Larkenfell)
**Lair:** the barrow under Greyhill: a long hall of oath-stones, a throne of roots, a lantern in the wall. **Weakness:** the oath he was killed to keep, spoken aloud, or the lantern's song.
**Hollin Greycrown, the Barrow King** — DC 6 · Armored, Cursed Touch, Frightening, Tireless · Hearts 6 · XP 6000
Threat: walks straight at whoever woke him and speaks of oaths; his touch marks.
**Hollin, Phase 2** — DC 5 · Cursed Touch, Frightening, Pack · Hearts mark (4) · Threat: the barrow-guard rise at his call; two heroes must fend off the guards while he presses a third.
**Hollin, Phase 3** — DC 4 · Cursed Touch, Grieving · Hearts mark (2) · Threat: he stops and asks for his oath; a wrong answer is a curse on every hero in the hall.

## The Weeping Colossus (Gloamreach)
**Lair:** a bell-less cathedral buried to its windows in ash, with a face in the nave. **Weakness:** a lit lamp held to its weeping face, or the name of the one it mourns.
**The Weeping Colossus** — DC 6 · Crushing, Armored, Tireless · Hearts 6 · XP 6000
Threat: it walks and does not stop; the roof comes down where it passes.
**The Weeping Colossus, Phase 2** — DC 5 · Crushing, Weeping, Tireless · Hearts mark (3) · Threat: its tears scald and its fists fall on a hero who tries to reason with it; a spoken name stops one round.

## Maurelle, the Drowned Queen (Thornmere)
**Lair:** the sunken throne room under Lake Vael, reached by the Bell-Stair: a table laid for a feast, tall windows of black water, a crown missing one pearl. **Weakness:** the missing pearl, returned, or a bell struck in the right key.
**Maurelle, the Drowned Queen** — DC 6 · Cursed Touch, Frightening, Cunning, Tireless · Hearts 6 · XP 6000
Threat: she greets the heroes kindly and offers a seat; the table drowns whoever sits.
**Maurelle, Phase 2** — DC 5 · Cursed Touch, Cunning, Furious · Hearts mark (4) · Threat: the windows break and the water rises; every hero must hold on or be swept to the stair.
**Maurelle, Phase 3** — DC 4 · Cursed Touch, Frightening, Grieving · Hearts mark (2) · Threat: the drowned court rises and kneels to her; each hero is offered their dearest wish and a place at the table.

## Vulgrim Cinderhide, the Unquenched (Emberhold)
**Lair:** the Great Forge: a hall of anvils, a river of molten ore, a gantry above, and the Quenching Pool at the far wall. **Weakness:** the Quenching Pool, whose water puts out his fire, or the vow he broke, spoken.
**Vulgrim Cinderhide, the Unquenched** — DC 6 · Fire-Breath, Armored, Frightening, Tireless · Hearts 6 · XP 6000
Threat: he heats the hall and walks through the fire; flame fills the nearest half of it.
**Vulgrim, Phase 2** — DC 5 · Fire-Breath, Crushing, Furious · Hearts mark (4) · Threat: he hurls a glowing anvil, and the floor-grating buckles over the molten ore.
**Vulgrim, Phase 3** — DC 6 · Fire-Breath, Frightening, Reckless · Hearts mark (2) · Threat: the whole forge ignites; each hero must reach cover or the pool, or burn.

## Ouranth, the Stormwhale (the Hollow Sky)
**Lair:** the cloud-roads round the Eye of the sky-wheel: drifting islands, a lightning-lit gullet of cloud, and old tether-chains that can be cut or swung. **Weakness:** the still air of the Eye, which drives it off, or the hook-song of the old rigger.
**Ouranth, the Stormwhale** — DC 6 · Flying, Crushing, Frightening, Tireless · Hearts 6 · XP 6000
Threat: it surfaces and swallows the nearest island or skiff whole.
**Ouranth, Phase 2** — DC 5 · Flying, Crushing, Furious · Hearts mark (4) · Threat: it thrashes the tether-chains; one mooring tears loose and heroes must grab a line or fall.
**Ouranth, Phase 3** — DC 4 · Flying, Fire-Breath, Reckless · Hearts mark (2) · Threat: lightning runs along its back and strikes the highest hero and the metal near them.

## Building another
1. Name it and its lair. 2. Give it two or three phases, each with a DC (2 to 6), words and a threat worse than the last. 3. Set marks that fall as hearts fall (6 hearts: 4 and 2; or one at 3). 4. Give it a weakness the fiction can find. 5. XP is the DC of its first line x 1,000, written on it.`,
};
