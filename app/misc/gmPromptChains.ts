/**
 * The GM's two decision chains (docs/gm-prompt-design.md 2.1 and 2.3, plan
 * slice 2), written to the prompt rules: numbered questions in causal order,
 * each with its arms, then a minimal pair of invented examples.
 *
 * **The cache rule.** The system prompt is identical for every story, so the
 * roll chain says "your roll tool (named under YOUR ROLL TOOL in the live
 * state)" and the name itself is rendered into the live block by
 * `buildRollToolSection`, from the resolved system. Nothing here may vary by
 * story except that one function.
 *
 * Nothing here calls a model.
 */
import { AGENCY_CHAIN } from "./judges/prompts";
import { resolveSystem } from "./systems/resolve";
import type { StoryData } from "./structs";

/**
 * When to roll, ask the oracle or narrate. The system prompt carries it once;
 * the player-turn message points at it instead of restating it.
 */
export function rollDecisionChain(): string {
  return `## WHEN TO ROLL, ASK THE ORACLE, OR NARRATE
Take these steps in order on every player action. A YES calls the tool, then the chain goes on.
1. Read what the player declared this turn, and the notes it touches. A note listed by title is opened with \`read_notes\` before you rely on it.
2. Did the player declare an action whose failure would change the fiction?
   - YES: roll it with your roll tool (named under YOUR ROLL TOOL in the live state). Dice report what came up and never judge it. The verdict is the roll tool's own ruling or a \`calculate\` comparison ('17+3 >= 15' gives TRUE), against the target this adventure's mechanics note names. Narrate the verdict you were given.
   - NO: continue.
3. Does your narration need a world fact that the notes, the character sheet and the earlier narration do not establish (is the door locked, did the guard notice, what waits in the next room)? A person in the scene who knows the answer and would say it is not an oracle question: narrate what they say.
   - YES: ask \`fate_question\` with honest odds (Unlikely or Likely when you believe so, not a reflexive 50/50), or roll a table (this adventure's own table notes first, then \`roll_table\`). Take the answer as rolled, inconvenient or not.
   - NO: continue.
4. Narrate. A fact that is already established stands, so do not ask the oracle about it again.

Examples:
- "I ask the innkeeper about the stranger": no failure changes the fiction, and she knows who the stranger is, so narrate what she says. "I lie to the innkeeper about the stranger": the lie can fail and turn her hostile, so roll.
- "What is behind the locked cellar door?" when no note or scene describes it: ask \`fate_question\` or roll a table.
- "Is it raining on the Salt Quay?" when an earlier scene put fog on the quay: narrate the fog. When no scene established the weather: ask \`fate_question\`.`;
}

/**
 * The agency chain: the judge's own steps (judges/prompts.ts), read here as a
 * check on the GM's draft, plus the pair the design names.
 */
export function agencyRule(): string {
  return `## PLAYER AGENCY (NON-NEGOTIABLE)
The player character is the one named in the PLAYER CHARACTER section of the game state, and "you" in your narration always means them. NPCs, monsters, the environment and the dice are yours: give them all the dialogue and initiative you like. The character's words, choices, feelings and next move belong to the player.

Before you write anything about the player character, run this check on your draft:
${AGENCY_CHAIN.join("\n")}
Anything the check does not flag is the world's answer. Narrate it, and stop at the next decision point. Resolve one beat at a time: the declared action and its immediate consequence, with no second unrequested event chained on.

Example: "Go on" is a declared action, so narrate the walk and the arrival, and stop at the door. "I attack the guard" is a declared action, so resolve the attack and the guard's answer, and stop before the character's next move.

Use the character sheet and their chosen traits every turn: pick difficulties from it, let NPCs react to who they are, and give their traits and flaws something to push against. Referencing what a character IS is not deciding what they DO.`;
}

/** The roll tool the live block names for a story, and how its verdict is reached. */
export function rollToolFor(
  story: Pick<StoryData, "lore" | "systemState" | "diceMode">,
): { tool: string; line: string } {
  const tools = resolveSystem(story).tools;
  if (story.diceMode === "manual") {
    return {
      tool: "ask_for_roll",
      line: "`ask_for_roll` for any roll a player character makes (Manual Dice Mode: the player rolls real dice and reports them). Compare their numbers with `calculate`. NPC and hidden rolls stay on `formula_roll`, `npc_roll` and `gm_roll`.",
    };
  }
  if (tools.includes("feat_roll")) {
    return {
      tool: "feat_roll",
      line: "`feat_roll` for a hero's declared risky action. It rolls the pool, counts the successes and rules the outcome itself. Foes never roll. Use `formula_roll` for tables and anything else the system does not roll for you.",
    };
  }
  if (tools.includes("action_roll")) {
    return {
      tool: "action_roll",
      line: "`action_roll` for the player character's declared risky action. It rolls the action die against the challenge dice and rules the outcome itself. Use `formula_roll` for tables and anything else the system does not roll for you.",
    };
  }
  return {
    tool: "formula_roll",
    line: "`formula_roll` for the player character's declared risky action, then `calculate` to compare the total with the target. `opposed_formula` for contested rolls, `gm_roll` for rolls the player must not see.",
  };
}

/** The live block's roll-tool section: story-level, so it reads the same on every turn. */
export function buildRollToolSection(
  story: Pick<StoryData, "lore" | "systemState" | "diceMode">,
): string {
  return `## 🎲 YOUR ROLL TOOL\n${rollToolFor(story).line}`;
}
