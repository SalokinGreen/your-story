/**
 * Fantastic Realms: FR — Conditions (docs/fr-expansion-design.md section 4,
 * decisions 247, 250, 254). Original text (decision 3).
 */
import type { BuiltinNote } from "../../types";

export const CONDITIONS_NOTE: BuiltinNote = {
  id: "builtin:fantastic-realms:conditions",
  title: "FR — Conditions",
  type: "mechanics",
  tags: ["Fantastic Realms", "conditions"],
  content: `# FR — Conditions

A condition is a word on a hero: *Wounded*, *Afraid*, *Poisoned*. Give one with manage_feats add_condition (hero, condition, and cure only when a rest will not do). Each word is stored once; giving it again changes nothing.

## What a condition does
It costs one die from a roll it gets in the way of, never below one die. You say which conditions hinder a roll, the way you say which feats help: pass them as hindered_by on feat_roll, as the hero's own words. An unknown word is refused. *Afraid* hinders a charge at the dragon, not a prayer said in a quiet room.

## When to give one
- Instead of a heart, on a miss.
- As the cost of a weak hit.
- Alongside a heart, only when the danger has a harm word: that is the two of the harm budget.
Hearts and conditions together never cost more than the roll's one budget (FR — Core rules). A miscast, a cursed item and a lost item are all spent from the same budget.

## Clearing them
- **A rest** clears every condition that names no cure (take_rest does it). It never clears a scar, and it never clears *Hungry*.
- **A cure** is named when the condition is given, in plain words (cure "an antidote or a healer"). The cure must exist in the fiction before it is used. When it is applied, manage_feats clear_condition.
- **A healing spell** clears a condition that names no cure, or one whose named cure it is (FR — Magic).
- **Downtime mending** clears a condition that needs a cure when the cure is at hand (FR — Downtime).
Give a cure sparingly. A cure on every condition turns the rest rule into a shopping errand.

## Too many
A hero with three conditions that are not scars is down, as at 0 hearts. A hero who is down cannot roll, help or burn, and is out of the scene. They are up again when a rest or a healing spell lifts them (1 heart, or a condition cleared). The Down state is never stored; the hero line shows it.

## Sixteen conditions
Word: what it does; its cure (a plain rest unless named).
- **Wounded:** hurts where it hurts, in fights and climbs. Rest.
- **Afraid:** gets in the way of daring and holding ground. Rest, or a friend's rally.
- **Poisoned:** weakness and sweats in every effort. Cure: an antidote or a healer.
- **Cursed:** luck and trust sour. Cure: the curse broken (a quest, a priest, a bargain undone).
- **Exhausted:** long efforts and fine work. Rest.
- **Bleeding:** keeps costing until bound. Cure: binding the wound.
- **Lost:** gets in the way of finding anything. Cure: finding the way again.
- **Frozen:** stiffness and slowness. Cure: warmth and shelter.
- **Hungry:** everything. The engine gives it the cure "a meal". Rest does not clear it.
- **Hollow-Eyed:** a magic miscast's mark; sight and nerve. Rest.
- **Blinded:** sight, aim and reading. Cure: clean water and an hour.
- **Burning:** the clothes, the pack and the nerves. Cure: the flames put out.
- **Entangled:** movement, running and fighting. Cure: being cut or freed.
- **Charmed:** wants what the charmer wants. Cure: the charm broken.
- **Fevered:** every roll of thought and speech. Cure: a healer's care.
- **Stunned:** the next move. Rest, or clear it yourself after a breath.

## Scars
A hero who goes down may take a scar instead of the GM's cost. Use manage_feats add_scar, which works only for a hero who is down.
- A scar is a lasting word that costs a die only in its own situation: *Fear of Fire* hinders when fire is near and nowhere else. Pass it as hindered_by only then.
- Scars never clear on their own, not at a rest, and clear_condition refuses them.
- At a level, a hero may turn a scar into a feat (*Fear of Fire* into *Fireproof*): manage_feats scar_to_feat with new_wording. That is the level's new feat.
- A scar does not count toward three conditions.`,
};
