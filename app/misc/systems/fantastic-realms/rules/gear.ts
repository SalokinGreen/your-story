/**
 * Fantastic Realms: FR — Gear (docs/fr-expansion-design.md section 3,
 * decision 248, plan E1's twelve qualities). Original text (decision 3).
 */
import type { BuiltinNote } from "../../types";

export const GEAR_NOTE: BuiltinNote = {
  id: "builtin:fantastic-realms:gear",
  title: "FR — Gear",
  type: "mechanics",
  tags: ["Fantastic Realms", "gear"],
  content: `# FR — Gear

## A good item is a feat you carry
*Grandmother's Lantern*, *Dwarf-Forged Axe*, *Cloak of Thistledown*. Add it with manage_feats add, kind "item", and up to two qualities (the lowercase words below). It adds a die when it fits, like any feat, and burns like one. Plain gear (rope, torches, a meal, a knife) is fiction with no dice: do not make a feat of it.

## Lost, broken, stolen
Taking an item is a cost the GM may pick on a miss or a weak hit instead of a heart. It spends the roll's harm budget like any cost.
- **Broken:** manage_feats break. It stays on the sheet, keeps its qualities and cannot be named in any roll, initiative or help. manage_feats mend puts it right: at a rest with the right help, or in downtime (FR — Downtime). Mending does not un-burn it.
- **Lost or stolen:** manage_feats lose. It keeps its place and qualities, and cannot be named. Getting it back is a story (a chase, a bargain, a debt), and then manage_feats recover.
- A broken or lost item refuses a counted use. A burned one does not: Warded and Bright are not dice.

## The twelve qualities
The engine changes numbers for **Keen** and **Swift** only. For the counted ones, call manage_feats use with the item as feat; if it is refused, the use is spent.
- **Keen.** A strong hit with it does +1 damage. The engine adds it.
- **Sturdy.** A single miss cannot break it. Only a strong foe's deliberate blow can.
- **Warded.** Turns aside one condition a scene: before you add a condition to its bearer, manage_feats use per scene. If it is allowed, the condition does not land.
- **Swift.** It also counts as an edge feat for initiative. The engine counts it for you.
- **Bright.** Reveals one hidden thing per scene: manage_feats use per scene, then tell what it shows.
- **Cursed.** Adds its die like any item. On a miss, its price is the roll's cost: it spends the harm budget, and the price is its own (a whisper, a hunger, a debt).
- **Hardy.** Once per rest it takes a hit for the bearer: manage_feats use per rest, and one heart of harm on a miss does not land.
- **Silent.** Nothing it does is heard. Sneaking with it is never undone by its own noise.
- **Blessed.** Holy or kindly made. It troubles the undead and the cursed, and a blessing cannot be turned against its bearer.
- **Returning.** It comes back to the hand. It cannot be lost by disarming or by being thrown; only by theft or by the bearer giving it up.
- **Masterwork.** The best of its kind. No ordinary wear breaks it, and a smith will want to see it.
- **Heirloom.** It carries a family's story. If it is lost or broken, there is always a road back to it: leave one open.

## Treasure
- **Coin** is story only: spent on plain gear and favours, never counted.
- **Items** are new item feats, with a quality when they are special.
- **Wonders** are an item with two qualities, or a one-use marvel that burns away once used.
Its XP is its printed worth on the realm's treasure table (award_xp, once). Read FR — Treasure and roll it with formula_roll rather than inventing a find.

## Buying
A town sells plain gear and, rarely, a plain item feat; name the price in the fiction, never in a number the engine tracks.
- **Small:** a meal, a night's bed, a torch, a cheap knife. A few coppers; ask nothing.
- **Fair:** a good blade, a warm cloak, a mule. A silver or two, or a favour.
- **Dear:** a horse, a boat, armour made to fit. A purse worth a season's work, and a story reason to have it.
- **Wonders** are never for sale. They are found, won, given or owed.
A hero who has none of it may try: feat_roll with a feat like *Haggler* or *Well-Liked*, DC 2 to 4.`,
};
