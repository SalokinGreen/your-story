/**
 * Blood & Bone, AI edition: B&B — Moves.
 * Original text for the GM, condensed from the author's rulebook
 * (docs/blood-and-bone/rulebook.md). Not copied from any other product
 * (decision 3).
 */
import type { BuiltinNote } from "../types";

export const MOVES_NOTE: BuiltinNote = {
  id: "builtin:blood-and-bone:moves",
  title: "B&B — Moves",
  type: "mechanics",
  tags: ["Blood & Bone"],
  content: `# B&B — Moves

Every move is rolled with action_roll (stat in brackets) unless it says otherwise. On a miss, pay the price with the move's table (B&B — Miss tables: ...). Not every action is a move: only roll when the outcome is in doubt and both results are interesting.

## Generic moves
**Face Danger** [best-fit stat] — a risky thing no other move covers. Strong: you do it cleanly. Weak: you do it at a cost (spotted, hurt, slower). Miss: pay the price.
**Secure an Advantage** [best-fit stat] — scouting, preparing, positioning. Strong: +2 to add to your next related roll, or +1 to two. Weak: +1 to your next related roll, and the setup is imperfect. Miss: it backfires; pay the price.
**Gather Information** [Wits] — investigating a person, place or situation. Strong: something true and useful; they ask one question and you answer honestly. Weak: incomplete, outdated or with a complication. Miss: you learn what you did not want to know, or the search draws attention; pay the price.
**Compel** [Heart for conviction, Shadow for threat and manipulation] — pushing someone to do or reveal what they would not offer. Strong: they comply on your terms. Weak: they comply but push back or want something. Miss: they refuse and know what you were after; or, if the table says so, they seem to agree or hand over the wrong thing, and the cost lands later.
**Slip Away** [Nerve] — escaping a pursuer or a scene going bad. Strong: clear, no complications. Weak: clear, but you leave something behind. Miss: you do not get away cleanly: caught, or out at a cost the table names.
**Aid Another** [best-fit stat] — you must be present and doing something specific. Strong: they add +2. Weak: they add +1 and you share whatever it costs them. Miss: they roll at -1 and you pay the price. Aid counts toward the +2 cap on adds.
**Undertake a Journey** [Wits for planning, Nerve for speed] — travel somewhere dangerous or distant. Set the journey's rank (manage_track create, kind journey), roll each leg. Strong: mark progress, no incident. Weak: mark progress, but it costs time, supplies, a Condition or attention. Miss: no progress; pay the price. To arrive, manage_track progress_roll: strong, you arrive prepared; weak, something followed or broke; miss, the situation has changed against you.
**Face Defeat** [Heart] — a Skirmish or other conflict ended in your defeat. Strong: beaten, not broken; secrets, gear and standing kept. Weak: you lose something (gear, a Connection's trust, a secret). Miss: take Doomed or Indebted (your pick as GM, from the fiction) as well as a narrative consequence.

## Beast and recovery
**Sate the Beast** [Shadow if covert, Bone if by force] — your Kind's feeding or power-gathering ritual (not Hunters). Strong: the hunger is satisfied, Stress -2. Weak: Stress -1 and a complication (a witness, a lingering body, a broken masquerade). Miss: the Beast takes over; drain the victim, attack the wrong target, or lose yourself; pay the price. A Wendigo's hit also sets the Slipping Mask to 0.
**Steel the Resolve** [Heart if leaning on a connection, Wits if on discipline] — a Hunter's recovery: confiding in an ally, a place of safety, a clean hunt. Strong: Stress -2. Weak: Stress -1 and an old wound resurfaces. Miss: your resolve cracks; pay the price.
**Resist the Hunger** [Heart] — a feeding Kind at Stress 4 or more near vulnerable prey does not mean to feed, or you say the Beast is pushing. Strong: you hold. Weak: you hold, and Stress +1. Miss: the Beast wins; use the Sate the Beast miss table. The Abstinent's +1 and The Held Line's +2 apply (capped at +2 together).
**Resisting the Change** [Heart] — a Werewolf on the night of the full moon. Strong: you keep your shape all night. Weak: you keep it, but the change shows at a bad moment (claws, eyes, voice), or take Stress +1; the player chooses. Miss: its table, as written.
**Surrender to the Years** [Heart] and **The Making** [Heart, or Bone if forcing it] are in B&B — Time Skip and the Turning.

## Masquerade and bonds
**Clean Up** [Shadow for covert work, Wits for misdirection and forgery] — destroying evidence, discrediting a witness, burying a story. Once a session. Strong: Exposure -2. Weak: Exposure -1 and it costs (a favour owed, a Connection compromised). Miss: Exposure +1 and pay the price.
**Burn a Connection** — no roll. Calling on a Connection to survive what you could not alone: it drops one rank (a Weak one is removed), and the roll that triggered it is an automatic strong hit.
**Repair a Bond** [Heart] — a downtime action. Strong: the Connection rises a rank. Weak: it holds and you learn something they hid. Miss: what is wrong between you surfaces badly.

## Progress moves (no action_roll)
Fulfil Your Vow, Clear a Condition: B&B — Progress, vows and XP. Resolve the Skirmish (the Rule of 3): the core rules. The Reckoning: the core rules.

Credit: Blood & Bone is built on the Ironsworn and Ironsworn: Starforged engine by Shawn Tomkin (Tomkin Press), licensed under Creative Commons Attribution 4.0 International (https://creativecommons.org/licenses/by/4.0/). It is not an official Ironsworn product, and is not affiliated with or endorsed by Tomkin Press.`,
};
