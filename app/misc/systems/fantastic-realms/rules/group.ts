/**
 * Fantastic Realms: FR — Group play (docs/fr-expansion-design.md section 9,
 * decision 255, section 14). Original text (decision 3).
 */
import type { BuiltinNote } from "../../types";

export const GROUP_NOTE: BuiltinNote = {
  id: "builtin:fantastic-realms:group",
  title: "FR — Group play",
  type: "mechanics",
  tags: ["Fantastic Realms", "group"],
  content: `# FR — Group play

## Who joins a roll
At most the roller, one helper and one team burn. Every contributor is a different hero who owns the named feat, is not down and has that feat unburned and unbroken. The team-burn partner is a third hero or the helper (with another feat), never the roller.

## Helping
An ally whose feat fits adds one die to another hero's roll: feat_roll with help { hero, feat }.
- The helper names the feat. At most one helper per roll.
- The helper's feat is not burned and does not count as theirs. It cannot be burned for someone else's roll.
- The helper shares the outcome. On a miss, the cost may fall on the helper instead of the roller, or be split. A split never doubles it: the roll still has one harm budget.
- A hero who is down cannot help.

## A team burn
Twice per party rest, two heroes may each burn a feat on the same roll: feat_roll with team_burn { hero, feat, own_feat }. The roll gets two sure successes, and neither burned feat adds its usual die. It lands a hit; a strong hit still needs the dice. Both feats are burned.
- The team burn takes the place of the roller's own burn on that roll.
- The two team burns renew only at a **party rest**: a take_rest that includes every hero in the story. A partial rest does not renew them. The result says which kind it was.
- A hero who died or left is out of the count: manage_feats retire.

## Hindrances in a group
Each hero's conditions hinder only their own rolls. A helper's condition does not matter unless it stops the help (a gagged bard cannot sing).

## Initiative for many
initiative_roll takes every hero at once, with each hero's edge_feats. Foes' numbers are stated once per fight. The heroes' order after that is the table's: whoever has the spotlight next.

## The spotlight
When a hero has had no roll or scene in their name for three turns, turn to them next. Ask what they do, and let a feat of theirs fit the problem. A quiet player is a signal, not a request to be left alone.

## Splitting up
When the party splits, run short cuts between scenes and keep each scene to one or two beats. A hero who is down is out of the scene, not out of the story: give them something to do at the edge of it, or a way to be found.

## Down heroes and the others
A hero who is down can be lifted by a healing spell (to 1 heart), a rest, or a condition cleared. The others may spend a scene to carry or guard them. Never leave a down hero as only a casualty list: a scar is the story's way of saying they were there.`,
};
