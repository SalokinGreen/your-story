/**
 * Fantastic Realms: FR — Travel (docs/fr-expansion-design.md section 6,
 * section 14 on journeys and Supplies). Original text (decision 3).
 */
import type { BuiltinNote } from "../../types";

export const TRAVEL_NOTE: BuiltinNote = {
  id: "builtin:fantastic-realms:travel",
  title: "FR — Travel",
  type: "mechanics",
  tags: ["Fantastic Realms", "travel"],
  content: `# FR — Travel

A trip that takes days is a journey. A trip that takes an afternoon is a scene.

## Supplies
Supplies is the party's meter (0 to 6). On the first journey, manage_meter create_set "Fantastic Realms party" with owner "world": it starts at 3.
- One Supply feeds the whole party for a day. A journey day costs 1, once, whatever else happens (manage_meter adjust by -1). A miss's cost may take a second.
- Buying in a town, foraging (a roll) or a host's hospitality refills it, up to 6.
- At 0 the party is **Hungry**: give *Hungry* once to each hero (manage_feats add_condition). Only a meal clears it (manage_feats clear_condition after the meal); a rest alone does not.

## A journey is a challenge
Run it with start_challenge, mode "tally", rounds = the days, 2 to 5 (a one-day trip is a single feat_roll, not a challenge). A longer trip is several legs of up to five rounds each; each leg is its own challenge.
- **Each round is one day.** One feat_roll for its hardest part (the weather, the road, getting lost) against the route's DC: 2 on a good road, 3 in rough country, 4 in wild land, 5 on a feared route.
- Record it with record_challenge_result: miss, weak_hit, hit or strong_hit. A hit counts +1, a strong hit +1, a weak hit 0, a miss -1.
- **A miss** costs a Supply, a condition (*Exhausted*, *Lost*, *Frozen*) or an encounter from the realm's road table. **A weak hit** costs the same, in a smaller way. **A strong hit** finds something: a camp, a shortcut, a friendly face, a find.
- **The total decides how the party arrives.** Above 0: well, with the day to spare. Exactly 0: worn, with one condition of the party's choice. Below 0: late, lost or hurt, at the GM's cost.
- Let any hero lead a day. Another helps (FR — Group play), and a hero with a fitting feat (*Knows Every Road*) is the natural pick.

## The road
The shared table is FR — On the road, and each realm's tables note (FR — Aurelane tables and its siblings) has a d20 of its own: roll it with formula_roll on a miss, or when a journey needs a moment. An encounter is a scene, not a roll for its own sake: a stranger, a toll, a storm, a sign.

## The Thin Mile
Where one realm gives way to the next, the road thins: a mile of mist, a ford, a gate, a stretch of burnt ground. The Thin Mile is a scene, not a roll. Say what changes when the party crosses it: the rest rule, the realm's magic and its miscasts, the local callings. The heroes keep all they carry. A condition from one realm may mean something else in the next: *Hollow-Eyed* is a sorrow in Gloamreach and a fashion in Aurelane. Call take_rest with the realm the party is resting in.`,
};
