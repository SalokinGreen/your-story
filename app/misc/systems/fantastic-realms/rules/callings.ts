/**
 * Fantastic Realms: FR — Callings (docs/fr-expansion-design.md section 5,
 * decisions 249, 253; the starting kit is the signature plus three, section
 * 14). The twelve callings. Original text (decision 3).
 */
import type { BuiltinNote } from "../../types";

export const CALLINGS_NOTE: BuiltinNote = {
  id: "builtin:fantastic-realms:callings",
  title: "FR — Callings",
  type: "mechanics",
  tags: ["Fantastic Realms", "callings"],
  content: `# FR — Callings

A calling is an optional path, offered at the feats step of character creation. A hero may ignore callings and stay freeform.

## What a calling gives
- **An identity,** one line.
- **A signature feat** only that calling starts with.
- **A kit of five suggested feats.** A calling hero starts with the signature plus three from the kit: four feats, as for any hero.
- **Eight path feats,** to choose from at levels, one for each new level's feat. Taking a path feat outside your calling needs the GM's nod and a reason in the story.
- **A calling move:** a once-per-rest flourish, in words. It is not a feat and adds no die. When it is used, call manage_feats use with the move's name as feat, per rest, and play its effect.

**A freeform hero** instead picks one personal move of the same size (a once-per-rest flourish of their own, in a sentence), so neither path is worth more. It is counted the same way.

Add every feat with manage_feats add as usual (a gear feat as kind "item", a spell as "spell"). Each realm note adds two local callings in this same shape (Aurelane: Herald, Dragon-Sworn; Larkenfell: Reeve, Barrow-Warden; Gloamreach: Lamplighter, Penitent); a hero may take one in its realm.

## The twelve

**Knight.** Sworn to a lord, a code or a crown. Signature: *Oath-Bound*. Kit: Sword; Armor; Brave; Horse; Commanding Voice. Path: Shield Wall; Challenge the Champion; Unhorsing Strike; Banner-Bearer; Iron Will; Merciful; Last to Fall; Lord's Favour. Move *Rally*: every ally in the scene clears Afraid.

**Witch.** Works the old craft at the edge of the village. Signature: *Hedge-Craft*. Kit: Herbs and Brews; Familiar; Evil Eye; Cunning; Black Cat's Luck. Path: Curse-Breaker; Knows What You Need; Wind-Whistler; Moon-Drawn; Midwife's Hands; Hex of Stumbling; Talks to Crows; Cauldron Ready. Move *Brew*: one sip clears a condition that names no cure, once.

**Rogue.** Lives by quick hands and slow suspicions. Signature: *Light Fingers*. Kit: Sneaky; Lockpicks; Knife; Climber; Fast Talker. Path: Cutpurse's Eye; Shadow-Hugger; Backstab; Forger; Smuggler's Contacts; Slippery; Poisoner; Disguise Master. Move *Vanish*: slip out of any scene unseen, once.

**Bard.** Carries songs, gossip and one good instrument. Signature: *Silver Tongue*. Kit: Fiddle; Remembers Everything; Charming; Knows a Song for That; Quick Wit. Path: Rousing Anthem; Cutting Verse; Tavern Fixer; Ballad of the Fallen; Mimic; Lullaby; Knows Every Court; Fearless Fool. Move *Encore*: the DC of an ally's next roll this scene is one lower (never under 2).

**Ranger.** Reads the wild and walks it alone. Signature: *Trailwise*. Kit: Longbow; Tracker; Woodcraft; Companion Hound; Cloak of Leaves. Path: Never Lost; Quick Shot; Beast-Friend; Snare-Setter; Weather Sense; Camouflage; Hunter's Mark; Forager. Move *Mark Quarry*: one foe is marked; the DC against it is one lower this scene (never under 2).

**Priest.** Serves a power, a place or a people. Signature: *Blessed*. Kit: Holy Symbol; Healer; Comforting Word; Staff; Knows the Rites. Path: Sanctuary; Turn the Unquiet; Steady Hands; Confessor; Smite; Lay Hands; Dedicated Fast; Seer of Signs. Move *Benediction*: clear one condition that names no cure on an ally.

**Tinker.** Fixes, builds and improvises. Signature: *Gadgeteer*. Kit: Toolkit; Clever Hands; Spare Parts; Pack Mule; Knows Machines. Path: Mender; Trapmaker; Clockwork Pet; Bomb-Maker; Salvage; Lockwright; Armorer; Flying Contraption. Move *Quick Fix*: mend one broken item on the spot.

**Sellsword.** Fights for coin and keeps the contract. Signature: *Veteran*. Kit: Axe; Chain Shirt; Tough; Shield; Hard Eyes. Path: Brawler; Dirty Fighter; Bodyguard; Berserker's Rage; Siege-Hardened; Pay Up; Camp Cook; Reads Armies. Move *Hold the Line*: take a miss's cost for an ally, once.

**Scholar.** Has read about it, whatever it is. Signature: *Well-Read*. Kit: Spectacles; Languages; Notebooks; Remembers Names; Dry Humour. Path: Ancient Lore; Alchemist; Cartographer; Linguist; Scribe; Old Rival at the Academy; Counts Everything; Lab Rat. Move *I Read About This*: ask the GM one true thing about a mystery in view.

**Hedge-Walker.** Crosses between the seen and the unseen. Signature: *Spirit-Touched*. Kit: Charms; Sees Ghosts; Walking Staff; Bone Whistle; Hum of the Road. Path: Spirit Guide; Door in a Tree; Speaks to the Dead; Sleepless; Dream-Reader; Ward the Camp; Bargain with Spirits; Thin Places. Move *Step Aside*: slip into the unseen for one moment, and avoid one threat.

**Duelist.** Settles it with a blade and a bow. Signature: *Rapier-Quick*. Kit: Rapier; Parry; Poise; Fine Coat; Reputation. Path: Riposte; Disarm; Flourish; Dancing Footwork; Intimidating Salute; Fencing Master; Duel of Words; Never Surprised. Move *Flourish*: a strong hit with a blade adds an extra magnitude, once.

**Wanderer.** Goes where the road goes. Signature: *Footloose*. Kit: Walking Boots; Knows Every Road; Pack; Makes Friends; Lucky. Path: Hitchhiker's Luck; Hardy Traveller; Hospitality; Weather-Beaten; Rumourmonger; Pathfinder; Ear to the Ground; A Friend in Every Town. Move *Friendly Face*: someone in the scene helps the party for free, this once.

## Using a move
Use it only when it fits the fiction. Note it in the result of the scene so the table sees it. A move that clears a condition for an ally uses clear_condition (a condition that names no cure); a move that mends uses manage_feats mend. At a rest every move is available again.`,
};
