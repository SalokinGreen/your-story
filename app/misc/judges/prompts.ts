/**
 * The combined judge call's prompt (docs/judge-layer-v2-design.md section 4,
 * plan slice 2). Written to the prompt rules the design adopts:
 *
 * - each judge is a decision chain: numbered questions in causal order, each
 *   with its arms, and a fact the verdict depends on is asked before the verdict;
 * - the engine's facts come first, each in its own named field, and the narration
 *   comes last, so nothing is judged before the facts are read;
 * - the JSON asks for the facts-shaped fields and the reasoning before the
 *   verdict, and a reasoning line states what the input shows, then the answer;
 * - every judge carries one minimal pair of invented examples: the same surface,
 *   opposite verdicts;
 * - a prompt describes the thing and never its history (no decision numbers,
 *   dates or "used to"), and no sentence is broken across lines. Rationale
 *   lives in these comments.
 *
 * Nothing here calls a model, and nothing is truncated: when a turn carries too
 * many facts for one call, combined.ts narrows the call to fewer judges.
 */
import type { Fact, JudgeId } from "./types";

/**
 * The agency chain, shared. The judge reads it as a test of the narration; the
 * GM prompt (gm-prompt-design.md section 2.3, slice 2 of that plan) reads the
 * same steps as a rule for writing it. Step 2 limits the spans to the player
 * character, so an NPC's lines and the world's answer are never spans.
 */
export const AGENCY_CHAIN: readonly string[] = [
  "1. What did the player declare this turn? Write it as DECLARED. If the player line is empty, there is nothing to judge: the severity is none.",
  "2. Quote each span of the narration where the player character speaks, chooses, feels or acts. Write them as SPANS. What NPCs say and do, and what the world does to the character, are not spans.",
  "3. For each span: is it the declared action, or a step the declared action plainly implies? YES: it is fine. NO: continue.",
  "4. Is the span new dialogue, a significant choice, a decided feeling, or a new action? YES: it is a violation, and that span is the evidence. NO: it is fine.",
];

interface Rubric {
  /** A short name for the judge's question. */
  title: string;
  /** Extra fields the JSON carries before the verdict (named facts the chain produces). */
  fields: readonly string[];
  chain: readonly string[];
  /** The minimal pair: same surface, opposite verdicts. */
  pair: readonly [string, string];
}

export const RUBRICS: Readonly<Record<JudgeId, Rubric>> = {
  length: {
    title: "Is the length earned?",
    fields: ["padding"],
    chain: [
      "1. List what the turn had to narrate: the action the player declared, and each engine result in the facts.",
      "2. Quote each span of the narration that answers none of those: scenery nobody asked about, a beat already narrated, banter, or a second scene chained on. Write them as PADDING.",
      "3. Is the turn doing work that takes words: setup material, an out-of-character answer to a question the player asked, a pivotal reveal, several results resolved at once, or a time skip the player asked for? YES: the length is earned, and the severity is none. NO: continue.",
      "4. Do the PADDING spans make up a large part of the turn? YES: major, and the evidence is the first PADDING span. NO: minor.",
    ],
    pair: [
      'Player line: "How does the rite work, and what are my choices?" The narration runs 600 words and explains the rite step by step, then lays out three choices. Severity: none.',
      'Player line: "I knock." The narration runs 600 words on the wallpaper, the rain, a quarrel next door and the stairwell\'s smell before the door opens. Severity: major, with the wallpaper span as evidence.',
    ],
  },
  agency: {
    title: "Did the narration take a decision away from the player?",
    fields: ["declared", "spans"],
    chain: AGENCY_CHAIN,
    pair: [
      'Player line: "I climb down." The narration says: you take the ladder, rung by rung, and drop to the cellar floor. Severity: none.',
      'Player line: "I climb down." The narration says: you take the ladder and tell her you will stay. Severity: major, with the spoken promise as evidence.',
    ],
  },
  outcome: {
    title: "Does the narration agree with the engine's ruling?",
    fields: ["rulings", "spans"],
    chain: [
      "1. For each numbered RESULT, write what the ruling lets the character have. STRONG HIT, HIT and SUCCESS give the whole goal. WEAK HIT gives the goal at a cost, with a complication, or only partway. MISS and FAILURE withhold the goal. Write them as RULINGS. If the adventure's rules define another tier, apply those rules.",
      "2. Quote the span of the narration that settles each result's goal. Write them as SPANS.",
      "3. Does each span give the whole goal, part of it, or none of it?",
      "4. Does that match the RULING? YES: it is fine, and a cost or complication added on top of a matching outcome is fine too. NO: it is a direct reversal, and that span is the evidence. Judge each numbered result on its own.",
    ],
    pair: [
      "RESULT 1 is a MISS on climbing the wall. The narration says: your fingers find the ledge and you haul yourself over the top. Severity: major, with that span as evidence.",
      "RESULT 1 is a MISS on climbing the wall. The narration says: your fingers find the ledge, the stone crumbles, and you fall back to the street. Severity: none.",
    ],
  },
  world_consistency: {
    title: "Does the narration keep to the world's facts?",
    fields: ["named", "stated"],
    chain: [
      "1. List each person, place or item the narration names that also appears in the FACTS. Write them as NAMED.",
      "2. For each NAMED, write what the FACTS say about its status, place and owner. Write them as STATED.",
      "3. Does a span of the narration have it do, be or stand somewhere its STATED fact rules out: a dead person who speaks or moves, a departed person who is present, a person away from the place the record gives, a possession the sheet does not list? YES: major, and that span is the evidence. NO: continue.",
      "4. Does a span only strain a STATED fact without ruling it out? YES: minor. NO: none. A memory, a corpse, a grave or a name spoken in conversation is not presence.",
    ],
    pair: [
      "FACT: Marta is dead. The narration says: Marta sets the lamp down and tells you to hurry. Severity: major, with that span as evidence.",
      "FACT: Marta is dead. The narration says: you pick up the lamp Marta left behind and hurry. Severity: none.",
    ],
  },
  secret_leak: {
    title: "Did the narrator reveal a secret the story has not revealed?",
    fields: ["truths", "spans"],
    chain: [
      "1. For each unrevealed secret in the FACTS, write its truth in a few words. Write them as TRUTHS.",
      "2. Quote each span of the narration that states a TRUTH as true, or names it outright: who did it, what is hidden, or why. Write them as SPANS. The PHRASE HITS list the spans the engine already found, for you to read in context.",
      "3. Is the span the narrator telling the player the truth, or the player character noticing something the truth would explain, such as a tremor, a lie or an odd object? The narrator telling: continue. The character noticing: it is fine.",
      "4. Does the span give the player something they could not yet know? YES: major, and that span is the evidence. NO: minor if it comes close, otherwise none.",
    ],
    pair: [
      "TRUTH: the warden killed the clerk. The narration says: the warden locks the door behind you, and his hands are not quite steady. Severity: none.",
      "TRUTH: the warden killed the clerk. The narration says: the warden, who killed the clerk three nights ago, locks the door behind you. Severity: major, with that span as evidence.",
    ],
  },
  lines_veils: {
    title: "Does the narration cross a line or show a veil on screen?",
    fields: ["covered", "spans"],
    chain: [
      "1. For each LINE and VEIL in the FACTS, write the content it covers in a few words. Write them as COVERED.",
      "2. Quote each span of the narration that depicts or describes COVERED content. Write them as SPANS. Content named in passing, with no depiction, is not a span.",
      "3. Does a span depict content a LINE covers? YES: major, because a line stays out of the game entirely, and that span is the evidence. NO: continue.",
      "4. Does a span depict content a VEIL covers, on screen and in detail, rather than closing the door, cutting away, or summarising it in a clause? YES: major, and that span is the evidence. NO: none.",
    ],
    pair: [
      "VEIL: violence against animals happens off screen. The narration says: the door shuts, and later the kennel is quiet. Severity: none.",
      "VEIL: violence against animals happens off screen. The narration says: you watch him wring the dog's neck, its legs jerking. Severity: major, with that span as evidence.",
    ],
  },
  oracle_gap: {
    title: "Did the narration invent an uncertain answer instead of consulting an oracle or table?",
    fields: ["settled"],
    chain: [
      "1. List each fact about the world that the narration settles this turn, such as whether a door is locked, who is inside, or whether a guard noticed. Write them as SETTLED.",
      "2. For each SETTLED fact: is it something the character already knows or plainly sees? YES: it is fine. NO: continue.",
      "3. Is it uncertain in a way that changes what the player can do next, and did no oracle or table settle it? YES: minor, and the evidence is the span that settles it. NO: none. If the adventure's rules give their own oracle or table, judge by those rules.",
    ],
    pair: [
      "The player tries a door nobody has described. The narration says: the handle turns, but the door is locked. No oracle was consulted. Severity: minor.",
      "The player tries the door they locked an hour ago. The narration says: the handle turns, but the door stays shut. Severity: none.",
    ],
  },
  tier_gap: {
    title: "Did the turn need a higher reasoning tier than it ran at?",
    fields: ["current", "decided"],
    chain: [
      "1. Write what the current tier is reserved for. Write it as CURRENT.",
      "2. Quote the span of the player's line or the narration that shows what this turn decided: a pivotal decision, a multi-step consequence, or a ruling that needs a careful reading of the rules. Write it as DECIDED.",
      "3. Does DECIDED match the work a higher tier is reserved for, rather than the work CURRENT is reserved for? YES: major, and DECIDED is the evidence. NO: none.",
    ],
    pair: [
      'CURRENT is ordinary scenes. The player line is: "I look around the market." Severity: none.',
      'CURRENT is ordinary scenes. A higher tier is reserved for pivotal confrontations. The player line is: "I accuse the duke before his whole court and call the guards to witness." Severity: major, with that line as evidence.',
    ],
  },
};

/** How strict one judge is, as the closing line of its chain. */
export function cutLine(sensitivity: number): string {
  const s = Math.max(0, Math.min(10, sensitivity));
  if (s <= 2) return "Answer major only when one reading is left. A span open to another reading is none.";
  if (s <= 4) return "Answer major for a clear case. A borderline span is none.";
  if (s <= 6) return "Answer major for a clear case and minor for a borderline span.";
  if (s <= 8) return "Answer major for a clear case, and for a borderline span most readers would call a violation. Other borderline spans are minor.";
  return "Answer major for any span that could be read as a violation.";
}

/** One engine ruling, rendered for the outcome judge (a numbered line with its fact ids). */
export interface OutcomeLine {
  label: string;
  toolName: string;
  text: string;
  factIds: string[];
}

export interface TierInput {
  used: number;
  usedNote: string;
  higher: { tier: number; note: string }[];
}

export interface JudgePromptInput {
  /** The judges this call runs, in reply order. */
  judges: readonly JudgeId[];
  /** The facts each judge reads (selectFactsFor). */
  factsByJudge: Partial<Record<JudgeId, readonly Fact[]>>;
  sensitivity: Partial<Record<JudgeId, number>>;
  narration: string;
  playerLine: string;
  lengthStats?: { words: number; ceiling: number };
  outcomeLines?: readonly OutcomeLine[];
  phraseHits?: readonly string[];
  tier?: TierInput;
  /** WHO IS WHO, for the judges that tell the player character from an NPC. */
  characterBlock?: string;
  /** The adventure's own rules note, for the judges that rule on rules. */
  mechanicsBlock?: string;
  /** The GM's account of its ruling, offered as testimony to the outcome judge. */
  reasoningBlock?: string;
}

function renderRubric(id: JudgeId): string {
  const r = RUBRICS[id];
  return [
    `JUDGE ${id}: ${r.title}`,
    ...r.chain,
    "Example pair:",
    `- ${r.pair[0]}`,
    `- ${r.pair[1]}`,
  ].join("\n");
}

function replyShape(id: JudgeId): string {
  const extra = RUBRICS[id].fields.map((f) =>
    f === "declared" || f === "current" ? `"${f}": "..."` : `"${f}": ["..."]`,
  );
  return `"${id}": {${[
    ...extra,
    '"reasoning": "..."',
    '"severity": "none|minor|major"',
    '"evidence": "..."',
    '"factIds": ["f1"]',
    '"fix": "..."',
  ].join(", ")}}`;
}

export function buildJudgeSystemPrompt(judges: readonly JudgeId[]): string {
  return [
    "You review one turn of a tabletop-style interactive fiction game. A Game Master AI wrote the narration. You judge it against the facts the engine supplies.",
    "The user message holds, in this order: the FACTS, the JUDGE INPUTS, the player's line, and the narration last.",
    "Run every judge below. Each judge is a numbered chain of questions. Answer them in order, because a later question depends on an earlier answer.",
    "Do not count, add or compare numbers yourself: the engine's counts and rulings are exact, and you only read the language.",
    "Write each reasoning line as what the input shows, then the answer in capitals. For example: the narration has her say she will stay, which the player did not declare: MAJOR.",
    "Evidence is a quote copied exactly from the narration, or from the player's line for the tier judge. An answer with no exact quote is discarded. When the severity is none, the evidence and the fix are empty.",
    "factIds lists the ids of the facts the answer rests on, taken only from that judge's FACTS. Use an empty list when it rests on none.",
    "fix is one sentence saying what to change in the narration.",
    "",
    judges.map(renderRubric).join("\n\n"),
    "",
    "Reply with one JSON object and nothing else. Its keys are the judge ids, in this order, and each value has these keys in this order:",
    `{${judges.map(replyShape).join(", ")}}`,
  ].join("\n");
}

function factLine(f: Fact): string {
  return `${f.id} | ${f.topic ?? f.source.kind} | ${f.when} | ${f.text}`;
}

function idList(facts: readonly Fact[] | undefined): string {
  return facts && facts.length > 0 ? facts.map((f) => f.id).join(", ") : "none";
}

/** The user message: facts first, each judge's inputs, the player's line, the narration last. */
export function buildJudgeUserPrompt(input: JudgePromptInput): string {
  const seen = new Set<string>();
  const allFacts: Fact[] = [];
  for (const id of input.judges) {
    for (const f of input.factsByJudge[id] ?? []) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      allFacts.push(f);
    }
  }
  allFacts.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));

  const parts: string[] = [];
  if (allFacts.length > 0) {
    parts.push(`FACTS (id | kind | held | text)\n${allFacts.map(factLine).join("\n")}`);
  }

  const inputs: string[] = [];
  for (const id of input.judges) {
    const cut = cutLine(input.sensitivity[id] ?? 5);
    const facts = `FACTS: ${idList(input.factsByJudge[id])}.`;
    switch (id) {
      case "length":
        inputs.push(
          `[length] WORDS: ${input.lengthStats?.words ?? 0}. CEILING: ${input.lengthStats?.ceiling ?? 0}. The narration is over the ceiling. ${facts} ${cut}`,
        );
        break;
      case "outcome": {
        const lines = (input.outcomeLines ?? []).map(
          (l, i) =>
            `${i + 1}. ${l.label} (${l.toolName})${l.factIds.length ? ` [${l.factIds.join(", ")}]` : ""}\n${l.text}`,
        );
        inputs.push(
          `[outcome] RESULTS, in the order they were resolved:\n${lines.join("\n\n")}\n${facts} ${cut}`,
        );
        break;
      }
      case "secret_leak":
        inputs.push(
          `[secret_leak] ${facts} PHRASE HITS: ${
            input.phraseHits && input.phraseHits.length > 0
              ? input.phraseHits.join(" ")
              : "none"
          } ${cut}`,
        );
        break;
      case "oracle_gap":
        inputs.push(`[oracle_gap] No oracle or table was consulted this turn. ${facts} ${cut}`);
        break;
      case "tier_gap": {
        const t = input.tier;
        inputs.push(
          `[tier_gap] CURRENT TIER: ${t?.used ?? 0}, reserved for: ${t?.usedNote ?? "default"}. HIGHER TIERS:\n${(t?.higher ?? [])
            .map((h) => `- tier ${h.tier}: ${h.note}`)
            .join("\n")}\n${cut}`,
        );
        break;
      }
      default:
        inputs.push(`[${id}] ${facts} ${cut}`);
    }
  }
  parts.push(`JUDGE INPUTS\n${inputs.join("\n")}`);

  parts.push(
    `PLAYER'S LINE\n"""\n${input.playerLine.trim() || "(none - opening scene)"}\n"""`,
  );
  if (input.characterBlock?.trim()) parts.push(input.characterBlock.trim());
  if (input.mechanicsBlock?.trim()) parts.push(input.mechanicsBlock.trim());
  if (input.reasoningBlock?.trim()) parts.push(input.reasoningBlock.trim());
  parts.push(`NARRATION\n"""\n${input.narration.trim()}\n"""`);
  return parts.join("\n\n");
}
