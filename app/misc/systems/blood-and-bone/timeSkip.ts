/**
 * Blood & Bone, AI edition: B&B — Time Skip and the Turning.
 * Original text for the GM, condensed from the author's rulebook
 * (docs/blood-and-bone/rulebook.md). Not copied from any other product
 * (decision 3).
 */
import type { BuiltinNote } from "../types";

export const TIME_SKIP_NOTE: BuiltinNote = {
  id: "builtin:blood-and-bone:time-skip-and-the-turning",
  title: "B&B — Time Skip and the Turning",
  type: "mechanics",
  tags: ["Blood & Bone"],
  content: `# B&B — Time Skip and the Turning

Stress at its cap means a Time Skip (cap 6, or 5 or 4 once the Beast has lowered it). Beast 10 is not a Time Skip: the Successor path applies at once.

A Time Skip is survivable. It costs you years, assets, and Connections, but you come back.

### SURRENDER TO THE YEARS

When you lose control to your beast, or fall into a long despair, time marches on without you. The engine's report that Stress reached its cap starts it. Roll +Heart to see what remains when you finally awaken or sober up.

- On a **strong hit**, you claw your way back before losing everything. You suffer a minor collateral consequence.
- On a **weak hit**, years pass in a blur of blood or ruin. You suffer severe collateral damage (e.g., a destroyed haven, a lost ally) and decrease the rank of one of your Connections.
- On a **miss**, you wake up to a nightmare of your own making. Your beast committed atrocities. You immediately take on the Doomed or Indebted burden, owing a massive debt to a dangerous faction, and face an immediate, deadly threat.

## Choosing Your Fate

After a Time Skip, the player has two options:

1. **The Long Hangover:** You keep playing the character. Your Stress is reset to zero (manage_meter set), but you bear the permanent scars, debts, and enemies your beast accumulated during the missing years. **Your Beast Meter does not reset** — advance it by 1 for the years you lost.
2. **The Successor:** Your original character is too far gone. They become an Epic-ranked NPC antagonist monster roaming the city. You roll a new character — perhaps a childe, victim, or hunter connected to the original — and begin play with an **Epic-rank Vow** to deal with the monster you used to be.

**At Beast 10, you don't get the choice.** The Successor path is automatic, immediately, with no Surrender to the Years roll. The Long Hangover exists because a Time Skip is a crisis. Beast 10 is an ending.

## Powers and assets after a Time Skip
Powers survive a Time Skip. Whatever your Beast did in the missing years, it did it with everything you'd learned — and often learned more. On a **strong hit** on Surrender to the Years, you may immediately buy one new ability on a Power you already have, free of XP cost. On a **miss**, the GM may declare one of your Powers has become unreliable or twisted in some way until you address what happened.

Assets do not survive a Time Skip cleanly. On **Surrender to the Years**:

- **Strong hit:** All assets remain. You may buy one new ability on any asset free of XP cost.
- **Weak hit:** Lose one asset entirely, or reduce two assets by one ability each. Player's choice.
- **Miss:** Lose two assets entirely, GM's choice, and one surviving asset is corrupted — its abilities still function, but the fiction around them has turned against you. A Haven now belongs to someone else. A Companion resents you. A Relic has been used for something while you were gone.

Havens, Companions, and Relics are the assets the world can take. That's the point of them.

## The Turning
Every character at this table used to be something else. Sooner or later, someone will want to do to another person what was done to them — or a Hunter will cross a line they can't step back over. This is how that works.

### What Turning Costs

Making another creature is never a small act. It is, in most cities, the single most politically dangerous thing you can do: you're adding a mouth to a food supply that other people are already fighting over. The Concord treats unauthorized turning as a Concord violation. The Undersett kills for it. L'Atelier will not sell to you afterward.

Mechanically, turning someone always does three things:

1. **Increase your Exposure by 1.** Another creature exists who knows exactly what you are.
2. **Increase your Beast Meter by 1.** You've done the thing that was done to you, and something in you agreed to it.
3. **Create a Connection at Steady rank** with the person you turned, whether either of you wants it. It cannot be removed except by their destruction.

### THE MAKING

When you deliberately turn a mortal into your own Kind, roll +Heart (if they consented and you're trying to bring them through intact) or +Bone (if you're forcing it).

- **Strong hit:** They survive, and they come back *themselves*. They begin at Stress 2 and Beast 0, and they remember why they agreed — or that they didn't.
- **Weak hit:** They survive, but something is wrong. They begin at Beast 2, or they've lost something in the crossing — a memory, a relationship, a piece of who they were. You choose which.
- **Miss:** It goes badly. They die, or they come back as something that isn't what you intended and isn't stable — a Troublesome-to-Dangerous rank antagonist the GM now controls, with your face in its memory.

Not every Kind can be made. **Vampires** turn through blood. **Werewolves** turn by bite or by ritual. **Witches** are not turned but *initiated*, which uses this same move with the source of power as the other party. **Wendigos** are made by circumstance and starvation, not by another Wendigo's choice. **Gargoyles, Ghosts, and Hunters cannot be made at all** — Gargoyles are born or cursed, Ghosts are the result of a death that didn't take, and a Hunter is only ever something a person decides to become.

### The Crossing: When a PC Changes Kind

Sometimes it happens to a player character. A Hunter is turned. A dying Vampire's ghost refuses to go. A Witch's pact consumes them entirely.

When a player character becomes a different Kind, they do not roll a new character. Instead:

- **Choose the new Kind and a new Archetype.** Your old Kind's Weakness, Stress triggers, and Recover Move are replaced by the new ones immediately.
- **Keep your stats, Connections, Burdens, Conditions, Vows, and XP total.** You are the same person. You want the same things.
- **Keep every asset you've bought** — but Powers from your old Kind stop functioning. They aren't refunded; they're *lost*, and that loss should be felt. You may buy new Powers from your new Kind's list at normal cost.
- **Your Beast Meter does not reset.** Advance it by 2. Whatever you are now, you got here by losing ground.
- **Your Stress resets to 4.** You are new to this, and badly out of control.
- **Take a new Vow at Formidable rank or higher**, about what you are now.

### The Hunter's Fall

The most common crossing in this game is a Hunter becoming a monster, and it deserves its own note.

A Hunter who becomes another Kind does not lose the Hunter's Weakness — they gain a second one. They keep *no supernatural shortcut to recovery* as a scar of who they were: for that character, Sate the Beast recovers **1 less Stress** than it should, permanently, on every roll. Their body has changed. The part of them that refused this hasn't.

In exchange, they keep any Hunter Powers they'd bought. The Field Kit still works. Monster Lore still works, and now it works on them.

### Becoming a Hunter

A mortal becomes a Hunter by deciding to, and surviving the decision. There's no move for it, because there's nothing supernatural about it. It's just a person who found out, and didn't look away.

If a Companion, Connection, or NPC in your chronicle becomes a Hunter, they become a Hunter the same way any player character does — a Path, a Vow, and a very short life expectancy.`,
};
