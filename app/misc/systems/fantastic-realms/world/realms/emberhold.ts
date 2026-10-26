/**
 * Emberhold, the volcanic realm of forge-halls (docs/fr-expansion-design.md
 * sections 5-7, decision 252, slice E4): the realm note and its tables note,
 * in the shape of the original three. Original text (decision 3).
 */
import type { BuiltinNote } from "../../../types";
import { CROSSROADS_SCOPE } from "../crossroads";

export const EMBERHOLD_NOTE: BuiltinNote = {
  id: "builtin:fantastic-realms:realm-emberhold",
  title: "FR — Emberhold",
  type: "lore",
  tags: ["Fantastic Realms", "realm"],
  scope: CROSSROADS_SCOPE,
  keys: ["Emberhold", "Cindergate", "Great Forge", "Quenching Pool", "forge-hall", "Forgewright", "Ash-Delver", "Vulgrim", "caldera"],
  content: `# FR — Emberhold

**Realm id:** emberhold. **Rest:** a day at a forge-hall's hearth. A full day beside a hall's fire, fed and warmed, with the hall's welcome; a night on the ash plain or a cold camp does not count. Its tables are in FR — Emberhold tables (miscasts, treasure, the road).

## Look and tone
A realm inside a mountain that never finished erupting. Halls are carved into the caldera wall and lit by rivers of slow fire; roads are glass, bridges are cooled lava, and the sky is a dim orange lid. Every hall is a guild, every guild is a family, and every family keeps a ledger of favours and insults. Run it as proud, hot-tempered and craft-mad, with honour measured in what you make and what you owe. The danger is the fire, the debts and the things the delvers wake. Magic is work: rune and hammer, heat and name.

## People
- **High Smith Brannoch Coalhand**, master of the Great Forge. Huge, slow-spoken and forever mending a gauntlet that was never broken.
- **Dagna Ironvein**, guildmistress of the Delvers, who has not seen the surface in eleven years and does not miss it.
- **Tamsin Flux**, an apprentice runesmith whose runes hold slightly too well.
- **Old Grimble Slate**, a hearth-keeper who knows every hall's secrets by the smell of its smoke.
- **Lord Corvane Ashmark**, a debt-baron who owns a third of the realm's contracts and smiles about it.
- **Pip Cindersweep**, a flue-child who runs messages through the chimney-roads and trusts no one tall.
- **The Silent Quencher**, a robed figure who tends the Quenching Pool and answers only with a nod.

## Places
- **Cindergate**, the hall-city at the caldera's lip, striped orange and black.
- **The Great Forge**, an anvil-cavern big enough for a ship, struck once an hour.
- **The Quenching Pool**, black water in which a blade is cooled and a vow is set.
- **The Glass Road**, a ribbon of cooled lava running down to the ash plain.
- **The Deep Delve**, tunnels below the lowest hall, where the guild digs and the mountain digs back.
- **The Ember Market**, where hall-gifts and guild-debts change hands, and so do the knives.

## Troubles
- **The Great Forge has gone cold** on the hour it should have rung, and no one will say why.
- **A debt is being called** that is older than the hall that owes it.
- **Something in the Deep Delve is knocking back.**
- **A runesmith's masterwork has been stolen** from a sealed hall, and the guild blames the visitors.

## Magic here
Work-magic. A spell is a craft: hammered, burnt, branded or carved. Casters name a thing and make it so; the work leaves heat behind. Fire-work comes easily and is loud; cold-work and light-work cost effort and sweat. Every hall can tell a rune-wright's mark at a glance. Pick or roll the d12 in FR — Emberhold tables; its miscasts lean to heat, flaws in the work and the debt of an unfinished piece, and the one you choose is the whole cost of the miss.

## Local callings
Two more than the twelve in FR — Callings, in the same shape: the signature plus three of the kit is the start, and the path is for levels.

**Forgewright.** Makes the things that heroes carry, and carries their marks. Signature: *Hammer-Hand*. Kit: Smith's Hammer; Leather Apron; Rune-Punches; Portable Anvil; Knows Good Metal. Path: Temper the Edge; Mend in the Field; Rune of Binding; Heat-Reading; Unfailing Rivet; Cunning Joint; Quench at the Right Moment; Masterwork. Move *Quick Fix*: mend one broken item or repair an ally's armour in a breath, once.

**Ash-Delver.** Digs where the mountain hides things. Signature: *Pick and Lamp*. Kit: Short Pick; Safety Rope; Hooded Lamp; Soot-Stained Coat; Knows the Old Tunnels. Path: Sees the Seam; Hears the Hollow; Stone-Sense; Brace the Roof; Tunnel-Quick; Smell Gas; Heat-Proof; Dig Out. Move *Hold the Roof*: a collapse, a cave-in or a falling beam spares everyone in the scene once.

## Foes
**Ash Scrapper** — DC 2 · Pack, Sly · Hearts 1 · XP 100
*Tactics:* jumps from a slag-heap and runs with a tool; a miss is a cut and a lost tool.
**Slag Rat Swarm** — DC 3 · Swarm, Hungry · Hearts 1 · XP 150
*Tactics:* floods through a vent and strips a pack; a miss is a heart or the supplies.
**Cinder Imp** — DC 3 · Flying, Sly · Hearts 1 · XP 150
*Tactics:* spits sparks at oil and thatch; a miss sets something alight.
**Pit Bandit** — DC 3 · Ambusher, Pack · Hearts 1 · XP 150
*Tactics:* ambushes a wagon on the Glass Road; a miss costs the cargo or a heart.
**Clinker Hound** — DC 3 · Fast, Hungry · Hearts 1 · XP 150
*Tactics:* runs a hero down in the ash and bites; a miss costs a heart and the trail.
**Guild Debt-Collector** — DC 4 · Armored, Cruel, Watchful · Hearts 3 · XP 800
*Tactics:* names the sum and the deadline, then takes a pledge by force; a miss costs a heart and an item.
**Lava Salamander** — DC 4 · Fire-Breath, Armored, Hungry · Hearts 3 · XP 800
*Tactics:* lurches from a crack and breathes flame; a miss costs 2 and the water ends its burn.
**Rune-Forged Guardian** — DC 4 · Armored, Tireless, Watchful · Hearts 3 · XP 800
*Tactics:* guards a door long after its masters are dead; a miss costs a heart, and a spoken word of release ends it.
**Smoke-Wraith** — DC 4 · Ethereal, Cursed Touch, Cunning · Hearts 3 · XP 800
*Tactics:* seeps through vents and leaves a cough that never ends; a miss costs 2 and is *Cursed*, and only an iron-blessed blade touches it.
**Oathbreaker Smith** — DC 4 · Cunning, Cruel, Cursed Touch · Hearts 3 · XP 800
*Tactics:* offers to make the best blade of your life, then takes your name for payment; a miss is a bargain and a heart.
**Basalt Giant** — DC 5 · Crushing, Armored, Frightening · Hearts 5 · XP 5000
*Tactics:* walks through the wall and picks up the nearest hero like a tool; a miss costs 2, and a quenched hammer-blow cracks its armour.
**Vulgrim Cinderhide, the Unquenched** — DC 6 · Fire-Breath, Armored, Frightening, Tireless · Hearts 6 · XP 6000
*Tactics:* heats the hall itself and moves through the fire as through air; a miss costs 2, and only the Quenching Pool can put him out.`,
};

export const EMBERHOLD_TABLES_NOTE: BuiltinNote = {
  id: "builtin:fantastic-realms:realm-emberhold-tables",
  title: "FR — Emberhold tables",
  type: "table",
  tags: ["Fantastic Realms", "table", "realm"],
  scope: CROSSROADS_SCOPE,
  keys: ["Emberhold miscast", "Emberhold treasure", "Emberhold road"],
  content: `# FR — Emberhold tables

## Emberhold miscasts (1d12)

1. Backfire. The work flares too hot: *Scorched* until a rest, and a blistered hand.
2. Backfire. The spell sets like cooling iron on the caster's skin: one heart.
3. Goes wide. The heat lands on a bystander's coat, a rope or a stack of papers.
4. Goes wide. It works on the wrong piece of metal, and the wrong lock opens.
5. Draws attention. A hall-guard turns up, asking whose mark that is.
6. Draws attention. Every bell in the district rings once, as a spark falls.
7. Draws attention. Something in the walls knocks back.
8. Leaves a mark. *Soot-Marked*: a black stain on the hands that will not wash, until a rest.
9. Leaves a mark. *Ember-Eyed*: the eyes glow red when the caster lies, until a rest.
10. Costs the spell. The work cracks in the quench; burn the spell feat.
11. Costs the spell. The spell melts into slag and is out until a rest.
12. The forge's price. It works, and a piece is owed to the hall; they will name it later, in writing.

## Emberhold treasure (1d20)

1. A bag of blackened nails, good as new. XP 100.
2. A leather apron, heavily scarred. XP 100.
3. A coil of bright copper wire. XP 150.
4. A pair of blast-goggles with a cracked lens. XP 150.
5. A soot-dark brick of tea, surprisingly good. XP 150.
6. A flask of hall-brewed ember-spirit. XP 200.
7. A hand-drawn map of the lower tunnels. XP 200.
8. A guild ledger page with a debt written off. XP 250.
9. An ingot of deep-steel, the size of a loaf. XP 250.
10. A set of runesmith's punches, well worn. XP 300.
11. A short pick of black iron; item feat *Delver's Pick (Keen)*. XP 400.
12. A forge-glove that does not burn; item feat *Fireproof Glove (Warded)*. XP 400.
13. A hooded lamp that burns blue; item feat *Delver's Lamp (Bright)*. XP 500.
14. A chain-mail shirt tight as a fish; item feat *Tight Mail (Sturdy)*. XP 500.
15. A pair of quick-boots of flame-leather; item feat *Cinderstep Boots (Swift)*. XP 600.
16. A rune-hammer that warms in the hand; item feat *Hall Hammer (Keen)*. XP 600.
17. A chest of old hall-coin stamped with a lost guild mark. XP 800.
18. A guild-master's chain of office, heavy with gems. XP 1000.
19. A wonder: *Unquenched Blade*, an item feat with Keen and Bright. XP 1500.
20. A wonder: a *Hearth-Heart*, a coal that never dies, an item feat with Warded and Bright; held to a hero who is down, it lifts them back to 1 heart, once. XP 2000.

## On the road in Emberhold (1d20)

1. A cart of ore stuck on the Glass Road, and an ox that will not move.
2. A stream of lava crossing the road, slow, with a plank laid across.
3. A hall-gate with a keeper who wants a verse before opening.
4. A runesmith carving a name into a milestone, who stops to ask yours.
5. A dust-storm of black ash, coming fast.
6. A caravan of salamanders pulling a wagon of cooled iron.
7. A well that gives warm water and a faint hum.
8. A collapsed tunnel mouth, and voices behind the stone.
9. A merchant selling cooling-charms at four times their worth.
10. A hearth-keeper with soup for anyone who tells a good story.
11. A hall-guard checking papers with a very long list.
12. A vent that coughs a plume of steam on a timer.
13. A lost apprentice carrying a package that is hot to the touch.
14. A road-shrine to the Quencher with a bowl of cold water.
15. A rock-fall just ahead, and fresh scratches that were not made by the rocks.
16. A duelling-ring set up in a market, with a smith who bets on the loser.
17. A glass bridge so clear it shows the fire below.
18. A debt-collector's wagon, empty and unguarded, chained shut.
19. Footprints in the ash that stop at a smooth patch of glass.
20. A cooled lava tube with a door at the end, and a hammer on the step.

Use when a spell goes wrong in Emberhold, a find is due, or the road needs a face. Pick when one fits; roll when it does not, with formula_roll.`,
};
