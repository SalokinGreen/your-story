/**
 * Layer 5 hardening, active variant (see docs/five-layer-architecture-changelog.md
 * and docs/architecture-frontier.md's "adjudication" layer).
 *
 * checkNarrationConsistency (consistencyCheck.ts) is diagnostic-only: it runs
 * after narration has already streamed to the player and just records a
 * warning. This module is the active counterpart - it reviews a completed GM
 * turn for violations of rules the GM was already given, and a "major" flag
 * can trigger generateStoryTurn (generation.ts) to roll StoryData back to its
 * pre-turn snapshot and force a fresh attempt, telling the GM exactly what it
 * was flagged for. Same fail-open posture as the M2 roll-invariant gate
 * (reasoningTiers.ts/generation.ts): never block play indefinitely.
 *
 * Two checks:
 * - checkResponseLength: deterministic, free. Catches a single turn blowing
 *   way past the Reply Length setting's ceiling. pacingFeedback.ts already
 *   nudges based on a trailing 3-turn average; this catches one egregious
 *   turn on the spot instead of waiting for the average to drift.
 * - checkPlayerAgencyViolation: an actual LLM call (same fetch("/api/generate")
 *   pattern as reflection.ts's callReflectionApi) that judges whether the GM
 *   decided/narrated what the player character says, thinks, or does beyond
 *   what the player declared - the "PLAYER AGENCY (NON-NEGOTIABLE)" rule
 *   already in ai_staged.ts's GM system prompt. Regex can't reliably judge
 *   this; it needs actual reading comprehension.
 */

import { ObserverFlag } from "./structs";
import { ReplyLength } from "./ai_staged";
import { PACING_BANDS, countNarrationWords } from "./pacingFeedback";
import { getCustomModelIfUUID } from "./user_settings";

// A single turn has to run at least this multiple of the trailing-average
// "high" band before it's flagged as a standalone blowout, not just a
// legitimately long climax beat.
const SINGLE_TURN_OVERAGE_MULTIPLIER = 2;

export function checkResponseLength(
  narration: string,
  replyLength: ReplyLength = "medium",
): ObserverFlag | null {
  const words = countNarrationWords(narration);
  if (words === 0) return null;

  const band = PACING_BANDS[replyLength] ?? PACING_BANDS.medium;
  const ceiling = band.high * SINGLE_TURN_OVERAGE_MULTIPLIER;
  if (words <= ceiling) return null;

  return {
    type: "response_length",
    severity: "major",
    detail: `This turn ran ${words} words, well past the "${replyLength}" reply-length setting's usual ceiling (~${band.high} words).`,
    correctivePrompt: `Your previous attempt at this turn was reset because it was far too long for the "${replyLength}" reply-length setting (${words} words, vs. a usual ceiling of ~${band.high}). Rewrite this turn much shorter - state the outcome and stop, per the LENGTH & PACING rules you were already given.`,
  };
}

export interface ObserverApiOptions {
  model: string;
  token: string | null;
  openRouterKey?: string;
  deepseekKey?: string;
  googleKey?: string;
  mistralKey?: string;
  deepinfraKey?: string;
  abortSignal?: AbortSignal;
}

interface AgencyCheckResult {
  violation: boolean;
  severity: "minor" | "major";
  reason: string;
}

/** Strips a ```json ... ``` fence if present and parses the first {...} block. */
function extractAgencyCheckJson(content: string): AgencyCheckResult | null {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : content;
  const braceMatch = candidate.match(/\{[\s\S]*\}/);
  if (!braceMatch) return null;

  try {
    const parsed = JSON.parse(braceMatch[0]);
    if (typeof parsed.violation !== "boolean") return null;
    return {
      violation: parsed.violation,
      severity: parsed.severity === "major" ? "major" : "minor",
      reason: typeof parsed.reason === "string" ? parsed.reason.trim() : "",
    };
  } catch {
    return null;
  }
}

async function callAgencyCheckApi(
  playerChoice: string,
  narration: string,
  apiOptions: ObserverApiOptions,
): Promise<AgencyCheckResult | null> {
  const system = `You are a strict but fair reviewer for a tabletop-style interactive fiction game. The Game Master AI you're reviewing was given this non-negotiable rule:

"NEVER decide what the player character says, thinks, feels, or does next. You resolve outcomes for the action they already declared - you don't invent their next action."

Given the player's declared action and the GM's narration written in response, decide whether the GM violated this rule by putting new dialogue, thoughts, feelings, or actions into the player character that the player didn't declare. Resolving the CONSEQUENCES of the player's stated action (what happens around them, how NPCs react, dice outcomes) is fine and expected - that is not a violation.

Respond with ONLY a JSON object, no other text:
{"violation": true|false, "severity": "minor"|"major", "reason": "<one sentence, empty string if no violation>"}

"major" = the GM clearly wrote new dialogue, a new decision, or a new action for the player character that the player never declared. "minor" = borderline/ambiguous phrasing that leans that way but could reasonably be read as just narrating the player's own stated action.`;

  const user = `Player's declared action:\n"""\n${playerChoice.trim() || "(none - opening scene)"}\n"""\n\nGM's narration in response:\n"""\n${narration.trim()}\n"""`;

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiOptions.token}`,
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        model: apiOptions.model,
        maxTokens: 200,
        temperature: 0,
        openRouterKey: apiOptions.openRouterKey,
        deepseekKey: apiOptions.deepseekKey,
        googleKey: apiOptions.googleKey,
        mistralKey: apiOptions.mistralKey,
        deepinfraKey: apiOptions.deepinfraKey,
        customModel: getCustomModelIfUUID(apiOptions.model),
      }),
      signal: apiOptions.abortSignal,
    });

    if (!response.ok) return null;

    const data = await response.json();
    const content = (data.content || "").trim();
    if (!content) return null;

    return extractAgencyCheckJson(content);
  } catch {
    return null;
  }
}

export async function checkPlayerAgencyViolation(
  playerChoice: string,
  narration: string,
  apiOptions: ObserverApiOptions,
): Promise<ObserverFlag | null> {
  if (!narration.trim()) return null;

  const result = await callAgencyCheckApi(playerChoice, narration, apiOptions);
  if (!result || !result.violation) return null;

  const reason =
    result.reason || "The GM appeared to speak or act for the player character.";

  return {
    type: "player_agency",
    severity: result.severity,
    detail: reason,
    correctivePrompt: `Your previous attempt at this turn was reset because it violated the PLAYER AGENCY rule you were already given ("Never decide what the player character says, thinks, feels, or does next"): ${reason} Rewrite this turn so you resolve the outcome of the player's declared action without inventing anything further the player character says, thinks, or does.`,
  };
}

export interface ObserverParams {
  narration: string;
  playerChoice: string;
  replyLength?: ReplyLength;
  apiOptions: ObserverApiOptions;
}

/**
 * Runs both checks for a completed turn. Safe to call every turn - the
 * length check is free, and the agency check fails open (returns no flag)
 * on any API error rather than blocking the turn on observer infra issues.
 */
export async function runObserver(params: ObserverParams): Promise<ObserverFlag[]> {
  const flags: ObserverFlag[] = [];

  const lengthFlag = checkResponseLength(params.narration, params.replyLength);
  if (lengthFlag) flags.push(lengthFlag);

  const agencyFlag = await checkPlayerAgencyViolation(
    params.playerChoice,
    params.narration,
    params.apiOptions,
  );
  if (agencyFlag) flags.push(agencyFlag);

  return flags;
}
