/**
 * Fantastic Realms: FR — Downtime (docs/fr-expansion-design.md section 8,
 * decision 256; section 14 on downtime rolls). Original text (decision 3).
 */
import type { BuiltinNote } from "../../types";

export const DOWNTIME_NOTE: BuiltinNote = {
  id: "builtin:fantastic-realms:downtime",
  title: "FR — Downtime",
  type: "mechanics",
  tags: ["Fantastic Realms", "downtime"],
  content: `# FR — Downtime

Downtime is what the heroes do between adventures, in a stretch longer than a rest: a season, a month. Each hero picks one activity and makes one feat_roll for it, at DC 3 unless you say otherwise. Whatever it is, the cure, the materials or the teacher must exist in the fiction before the roll.

## Every tier gives something
- **Strong hit:** the activity's best result.
- **Hit:** the result.
- **Weak hit:** the result, at a cost: time, coin, a favour owed.
- **Miss:** the miss line below. A downtime miss never costs hearts or a condition.

## The five activities
- **Train.** Sharpen a feat's wording (manage_feats rename, the new wording narrower or sharper, a level's feat still earned), or swap a calling kit feat for another of the calling's. Miss: nothing.
- **Craft.** An item feat (manage_feats add, kind "item"), with a quality on a strong hit. The hero names the thing and the materials. Miss: spoiled materials.
- **Mend.** Clear a lasting condition or a cure-needing one whose cure is at hand (manage_feats clear_condition), or mend a broken item (manage_feats mend). It never touches a scar. Miss: not yet.
- **Seek.** A rumour, a lead, a contact (a new NPC with a want). Miss: a rumour that is false.
- **Tend the hearth.** A hearth improvement (below). Miss: nothing.

## The hearth
An optional home base the party shares: a farmhouse, a tower, a ship. Keep a note for the place and its people (create_note, type lore); the improvements live in the engine.
- Up to five improvements: *Library*, *Stables*, *Shrine*, *Workshop*, *Watchtower*, *Cellar*, *Garden*, *Forge*. Each is a **party feat**: manage_feats add_party_feat (remove_party_feat to lose one). No hero is needed.
- Any hero may name a party feat in a roll it fits (the Workshop for a repair, the Library for a rumour). **At the hearth it is free. Away from it, it works once per adventure:** manage_feats use with hero (who names it), the improvement as feat, per adventure.
- Townsfolk at the hearth are NPCs with a want. Give them one.
- A hearth is a place to be defended. A raid on it is an adventure of its own.

## Ending downtime
Heal, un-burn and rest (take_rest) at the hearth as the realm allows. Then call increment_scene, name the new season, and let the next hook find them. When the adventure ends, end_session.`,
};
