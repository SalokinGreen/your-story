/**
 * The model reading behind a turn-end check whose trigger is `kind: "judge"`
 * (GM prompt plan slice 5, decisions 183 and 238; docs/dawn-gate-design.md).
 *
 * A phrase table cannot tell "dawn breaks over the rooftops" from "we plan to
 * leave at dawn", so the system declares a yes/no question instead ("did the
 * night end in this turn's prose?") and one cheap side call answers it, with "unknown" for an unsettled text, because a false no costs more than a false yes. The
 * answer only decides whether the check is *pending*: the engine still checks
 * the tool result (`end_session`) in code, so a wrong "yes" costs one
 * conditional reminder the GM may decline, and a wrong "no" is the old
 * missed dawn.
 *
 * It runs where the phrase table runs, on the GM's final prose before the
 * narration stage (revised plan, Codex finding 8). It cannot ride the
 * Observer's combined call, which runs after the turn; it is the same kind of
 * call (one `callSideModel` on the side-agent model at an explicit effort,
 * temperature 0, a keyed JSON reply with the reasoning before the verdict) and
 * is counted as one extra side call per turn (the judge plan's ceiling: one
 * reading per check per turn; later rounds use the phrase table). Anything that is not a clean, quoted "yes" or "no" is "unknown", and
 * the caller falls back to the phrase table. A Stop passes through.
 */
import { callSideModel, type ProviderKeys } from "../sideModelCall";
import { logger } from "../logger";
import { extractJsonObject, isAbortError, type ObserverApiOptions } from "../observer";
import { quoteAppearsIn } from "./combined";

export type TurnEndAnswer = "yes" | "no" | "unknown";

export interface TurnEndJudgeInput {
  /** The check's yes/no question, written by the system. */
  question: string;
  /** The GM's visible prose this turn. */
  gmProse: string;
  /** The player's lines this turn, one entry each. */
  playerLines: string[];
}

export const TURN_END_JUDGE_SYSTEM = `You answer one yes/no question about one turn of an interactive story. You read the turn's text; you do not play, continue or judge the story.

How to decide:
1. Find what the text says HAS HAPPENED by its end. A plan, a promise, a question, a memory, a flashback or a time still to come is not something that happened.
2. Compare that with the question. Answer "yes" only if the text itself shows it happened this turn, in the prose or in what the player's line makes happen ("I sleep until dusk" does).
3. If the text clearly shows it did not happen (a plan, a question, a memory, a time still to come), answer "no". If the text does not settle it either way, answer "unknown": a wrong "no" is costlier than a wrong "yes".
4. A "yes" needs a quote: the exact words, copied from the text, that show it.

Minimal pair for "did the night end?":
- "Pale light creeps over the rooftops and the bells begin to ring." Answer yes (the quote is the whole sentence).
- "We should be back before the pale light creeps over the rooftops." Answer no (a time still to come).

Reply with one JSON object and nothing else: {"reasoning": "<one or two sentences: what has happened by the end of the text>", "answer": "yes", "no" or "unknown", "quote": "<exact words from the text, empty on no>"}`;

export function buildTurnEndJudgePrompt(input: TurnEndJudgeInput): string {
  const lines = input.playerLines.map((l) => l.trim()).filter(Boolean);
  return [
    `Question: ${input.question}`,
    lines.length > 0
      ? `The player's line(s) this turn:\n${lines.join("\n")}`
      : "The player's line this turn: (none)",
    `The story text this turn:\n${input.gmProse}`,
  ].join("\n\n");
}

/** Reads a reply. Never throws on content; anything unclear is "unknown". */
export function parseTurnEndAnswer(
  content: string,
  input: Pick<TurnEndJudgeInput, "gmProse" | "playerLines">,
): { answer: TurnEndAnswer; quote: string; reason?: string } {
  const obj = extractJsonObject(content);
  if (!obj) return { answer: "unknown", quote: "", reason: "the reply was not a JSON object" };
  const answer = typeof obj.answer === "string" ? obj.answer.trim().toLowerCase() : "";
  if (answer === "no") return { answer: "no", quote: "" };
  if (answer !== "yes") {
    return { answer: "unknown", quote: "", reason: "the answer is not yes or no" };
  }
  const quote = typeof obj.quote === "string" ? obj.quote.trim() : "";
  if (!quote) return { answer: "unknown", quote: "", reason: "a yes without a quote" };
  const haystack = `${input.gmProse}\n${input.playerLines.join("\n")}`;
  if (!quoteAppearsIn(quote, haystack)) {
    return { answer: "unknown", quote: "", reason: "the quote is not in the text" };
  }
  return { answer: "yes", quote };
}

export function turnEndJudgeMaxTokens(proseLength: number): number {
  return Math.min(1500, 200 + Math.ceil(proseLength / 6));
}

/**
 * Asks the question. `apiOptions` carries the side-agent model and its
 * explicit effort (`resolveSideCallModel`) and the six provider keys.
 */
export async function askTurnEndJudge(
  input: TurnEndJudgeInput,
  apiOptions: Pick<
    ObserverApiOptions,
    "model" | "reasoningEffort" | "abortSignal" | "costTurnId"
  > &
    ProviderKeys,
): Promise<{ answer: TurnEndAnswer; quote: string }> {
  const unknown = (reason: string) => {
    logger.action("Turn-end judge: unknown (the phrase table decides)", { reason });
    return { answer: "unknown" as const, quote: "" };
  };
  if (!input.gmProse.trim() && input.playerLines.every((l) => !l.trim())) {
    return unknown("no text");
  }
  try {
    const result = await callSideModel({
      stage: "observer",
      label: "turn-end judge",
      model: apiOptions.model,
      messages: [
        { role: "system", content: TURN_END_JUDGE_SYSTEM },
        { role: "user", content: buildTurnEndJudgePrompt(input) },
      ],
      keys: apiOptions,
      maxTokens: turnEndJudgeMaxTokens(input.gmProse.length),
      temperature: 0,
      reasoningEffort: apiOptions.reasoningEffort,
      abortSignal: apiOptions.abortSignal,
      costTurnId: apiOptions.costTurnId,
    });
    if (!result.ok) return unknown("the call failed");
    const content = (result.data.content || "").trim();
    if (!content) return unknown("the reply was empty");
    const parsed = parseTurnEndAnswer(content, input);
    if (parsed.answer === "unknown") return unknown(parsed.reason ?? "unreadable");
    return { answer: parsed.answer, quote: parsed.quote };
  } catch (error) {
    if (isAbortError(error)) throw error;
    return unknown(error instanceof Error ? error.message : String(error));
  }
}
