/**
 * The labelled turn set's file format (docs/judge-layer-v2-design.md section 7,
 * plan slice 4, decisions 229 and 233). A turn is one JSON file, versioned and
 * of one of two kinds:
 *
 * - a **judge fixture** (`kind: "judge"`): the story before and after the turn,
 *   the tool results, the player's line, the narration and the labels. The
 *   facts, the typed rulings and the key-phrase hits are rebuilt from these by
 *   the same code the app runs, so a fixture never stores a derived fact.
 * - a **generation fixture** (`kind: "generation"`): a story snapshot and what
 *   the GM should (or should not) call. The format is defined here so the
 *   exporter can write it; the GM prompt plan's slices (G2, G5) own the runner.
 *
 * Nothing here calls a model. `parseFixture` never throws: it returns the
 * problems it found, so a loader can say which file is wrong and why.
 */
import {
  collectTurnFacts,
} from "./facts";
import { quoteAppearsIn, JUDGE_IDS } from "./combined";
import { secretHits } from "./rung1";
import {
  extractOutcomeVerdicts,
  type ObserverCharacterContext,
  type ObserverParams,
  type ObserverSettings,
  type OutcomeVerdict,
} from "../observer";
import type { ReplyLength } from "../ai_staged";
import type {
  Fact,
  JudgeId,
  JudgeStoryView,
  JudgeToolResult,
  Rung1Check,
} from "./types";

export const EVAL_FORMAT_VERSION = 1;

/** A labelled problem: which judge should catch it, how bad, and the words that show it. */
export interface FixtureLabel {
  judge: JudgeId;
  severity: "minor" | "major";
  /** A quote from the narration (the player's line, for the tier judge). */
  span: string;
}

export interface JudgeFixture {
  v: 1;
  kind: "judge";
  /** Lower-case letters, digits and hyphens; also the file name. */
  id: string;
  /** True only for a turn the author approved for the public repository (decision 233). */
  published: boolean;
  /** What the turn is for, in a line (a case name, not a quote from play). */
  note?: string;
  storyBefore: JudgeStoryView;
  storyAfter: JudgeStoryView;
  toolResults: JudgeToolResult[];
  playerLine: string;
  narration: string;
  settings?: ObserverSettings;
  replyLength?: ReplyLength;
  /** The reasoning tier the turn ran at; absent means the tier judge has nothing to judge. */
  tierUsed?: number;
  characterContext?: ObserverCharacterContext;
  narrationThoughts?: string;
  /** Empty means the turn is good: no judge should flag it. */
  labels: FixtureLabel[];
  /**
   * Who vouches for the labels. Claude drafts them ("drafted"); the author sets
   * "checked" once they have read the turn and agree. A scored run reports how
   * many of its turns are still only drafted.
   */
  labelStatus?: "drafted" | "checked";
  /** The built-in system whose event contracts apply to the turn (a `BuiltinSystem.id`). */
  systemId?: string;
  /**
   * The rung-1 checks that must fire on this turn (the deterministic tests read
   * it). An empty list means none may fire; absent means nothing is asserted.
   */
  rung1Expect?: Rung1Check[];
}

export interface GenerationFixture {
  v: 1;
  kind: "generation";
  id: string;
  published: boolean;
  note?: string;
  /** The StoryData the GM is handed, as exported. */
  storySnapshot: Record<string, unknown>;
  playerLine: string;
  settings?: Record<string, unknown>;
  /** Scripted provider answers, in order, for a mocked run. */
  scriptedToolResponses?: Record<string, unknown>[];
  expect: { calls?: string[]; noCalls?: string[] };
}

export type EvalFixture = JudgeFixture | GenerationFixture;

export type ParseResult =
  | { ok: true; fixture: EvalFixture }
  | { ok: false; errors: string[] };

const RUNG1_CHECKS: ReadonlySet<string> = new Set<Rung1Check>([
  "event_contract",
  "departed_person",
  "line",
  "secret_phrase",
  "pacing_clock",
  "pacing_spotlight",
  "repeated_phrase",
]);

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Text that looks like a provider key or an auth header. A fixture holding any
 * is refused, because the repository is public and a later commit that deletes
 * a key does not remove it from history.
 */
const KEY_SHAPES: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}/,
  /\bAIza[0-9A-Za-z_-]{30,}/,
  /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/i,
  /\b(?:api[_-]?key|secret[_-]?key|token)["']?\s*[:=]\s*["']?[A-Za-z0-9_-]{24,}/i,
  /\bxox[abpr]-[A-Za-z0-9-]{10,}/,
];

export function containsKeyLikeText(text: string): boolean {
  return KEY_SHAPES.some((re) => re.test(text));
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

/** Every string in a value, depth-first, for the key scan. */
function* stringsIn(value: unknown): Generator<string> {
  if (typeof value === "string") yield value;
  else if (Array.isArray(value)) for (const v of value) yield* stringsIn(v);
  else if (isRecord(value)) for (const v of Object.values(value)) yield* stringsIn(v);
}

function validateStoryView(name: string, raw: unknown, errors: string[]): JudgeStoryView | null {
  if (!isRecord(raw)) {
    errors.push(`${name} must be an object`);
    return null;
  }
  for (const key of ["npcs", "meters"] as const) {
    if (raw[key] !== undefined && !Array.isArray(raw[key])) errors.push(`${name}.${key} must be a list`);
  }
  if (raw.campaign !== undefined && !isRecord(raw.campaign)) errors.push(`${name}.campaign must be an object`);
  if (raw.lore !== undefined && !Array.isArray(raw.lore)) errors.push(`${name}.lore must be a list`);
  // The app's own types make npcs and meters required; a fixture may leave them out.
  return {
    ...(raw as object),
    npcs: Array.isArray(raw.npcs) ? raw.npcs : [],
    meters: Array.isArray(raw.meters) ? raw.meters : [],
  } as unknown as JudgeStoryView;
}

function parseJudgeFixture(o: Record<string, unknown>, errors: string[]): JudgeFixture | null {
  const before = validateStoryView("storyBefore", o.storyBefore, errors);
  const after = validateStoryView("storyAfter", o.storyAfter, errors);

  if (typeof o.narration !== "string" || !o.narration.trim()) errors.push("narration must be a non-empty string");
  if (typeof o.playerLine !== "string") errors.push("playerLine must be a string");

  const results: JudgeToolResult[] = [];
  if (!Array.isArray(o.toolResults)) {
    errors.push("toolResults must be a list");
  } else {
    o.toolResults.forEach((r, i) => {
      if (
        !isRecord(r) ||
        typeof r.toolName !== "string" ||
        typeof r.toolCallId !== "string" ||
        typeof r.success !== "boolean"
      ) {
        errors.push(`toolResults[${i}] needs toolName, toolCallId and success`);
      } else {
        results.push(r as unknown as JudgeToolResult);
      }
    });
  }

  const narration = typeof o.narration === "string" ? o.narration : "";
  const playerLine = typeof o.playerLine === "string" ? o.playerLine : "";
  const labels: FixtureLabel[] = [];
  if (!Array.isArray(o.labels)) {
    errors.push("labels must be a list (empty for a good turn)");
  } else {
    o.labels.forEach((l, i) => {
      if (!isRecord(l)) {
        errors.push(`labels[${i}] must be an object`);
        return;
      }
      const judge = l.judge;
      if (typeof judge !== "string" || !(JUDGE_IDS as readonly string[]).includes(judge)) {
        errors.push(`labels[${i}].judge must be one of ${JUDGE_IDS.join(", ")}`);
        return;
      }
      if (l.severity !== "minor" && l.severity !== "major") {
        errors.push(`labels[${i}].severity must be minor or major`);
        return;
      }
      if (typeof l.span !== "string" || !l.span.trim()) {
        errors.push(`labels[${i}].span must be the quoted words that show the problem`);
        return;
      }
      // A span is scored by overlap with a judge's quote, so it has to be real text.
      if (!quoteAppearsIn(l.span, `${narration}\n${playerLine}`)) {
        errors.push(`labels[${i}].span is not in the narration or the player's line`);
        return;
      }
      labels.push({ judge: judge as JudgeId, severity: l.severity, span: l.span });
    });
  }

  if (o.rung1Expect !== undefined) {
    if (!Array.isArray(o.rung1Expect) || o.rung1Expect.some((c) => typeof c !== "string" || !RUNG1_CHECKS.has(c))) {
      errors.push(`rung1Expect must be a list of rung-1 check names (${[...RUNG1_CHECKS].join(", ")})`);
    }
  }
  if (o.labelStatus !== undefined && o.labelStatus !== "drafted" && o.labelStatus !== "checked") {
    errors.push('labelStatus must be "drafted" or "checked"');
  }
  if (o.systemId !== undefined && typeof o.systemId !== "string") errors.push("systemId must be a string");
  if (o.tierUsed !== undefined && (typeof o.tierUsed !== "number" || !Number.isInteger(o.tierUsed) || o.tierUsed < 0)) {
    errors.push("tierUsed must be a whole number from 0");
  }
  if (o.replyLength !== undefined && o.replyLength !== "short" && o.replyLength !== "medium" && o.replyLength !== "long") {
    errors.push("replyLength must be short, medium or long");
  }
  if (o.settings !== undefined && !isRecord(o.settings)) errors.push("settings must be an object");
  if (o.characterContext !== undefined && !isRecord(o.characterContext)) errors.push("characterContext must be an object");

  if (errors.length > 0 || !before || !after) return null;
  return o as unknown as JudgeFixture;
}

function parseGenerationFixture(o: Record<string, unknown>, errors: string[]): GenerationFixture | null {
  if (!isRecord(o.storySnapshot)) errors.push("storySnapshot must be an object");
  if (typeof o.playerLine !== "string") errors.push("playerLine must be a string");
  if (!isRecord(o.expect)) {
    errors.push("expect must be an object with calls and/or noCalls");
  } else {
    for (const key of ["calls", "noCalls"] as const) {
      const v = o.expect[key];
      if (v !== undefined && (!Array.isArray(v) || v.some((x) => typeof x !== "string"))) {
        errors.push(`expect.${key} must be a list of tool names`);
      }
    }
    if (o.expect.calls === undefined && o.expect.noCalls === undefined) {
      errors.push("expect needs calls or noCalls");
    }
  }
  if (o.scriptedToolResponses !== undefined && !Array.isArray(o.scriptedToolResponses)) {
    errors.push("scriptedToolResponses must be a list");
  }
  return errors.length > 0 ? null : (o as unknown as GenerationFixture);
}

/** Validates one parsed JSON value as a fixture. Never throws. */
export function parseFixture(raw: unknown): ParseResult {
  const errors: string[] = [];
  if (!isRecord(raw)) return { ok: false, errors: ["a fixture must be a JSON object"] };
  if (raw.v !== EVAL_FORMAT_VERSION) errors.push(`v must be ${EVAL_FORMAT_VERSION}`);
  if (typeof raw.id !== "string" || !ID_PATTERN.test(raw.id)) {
    errors.push("id must be lower-case letters, digits and hyphens");
  }
  if (typeof raw.published !== "boolean") errors.push("published must be true or false");
  if (raw.note !== undefined && typeof raw.note !== "string") errors.push("note must be a string");

  let fixture: EvalFixture | null = null;
  if (raw.kind === "judge") fixture = parseJudgeFixture(raw, errors);
  else if (raw.kind === "generation") fixture = parseGenerationFixture(raw, errors);
  else errors.push('kind must be "judge" or "generation"');

  for (const text of stringsIn(raw)) {
    if (containsKeyLikeText(text)) {
      errors.push("the file holds text shaped like a provider key or an auth header");
      break;
    }
  }
  return errors.length > 0 || !fixture ? { ok: false, errors } : { ok: true, fixture };
}

/** Parses JSON text as a fixture. Never throws. */
export function parseFixtureText(text: string): ParseResult {
  try {
    return parseFixture(JSON.parse(text));
  } catch (error) {
    return { ok: false, errors: [`not valid JSON: ${error instanceof Error ? error.message : String(error)}`] };
  }
}

/** What a judge fixture hands the judges, rebuilt by the app's own rung-0 code. */
export interface FixtureJudgeInputs {
  facts: Fact[];
  phraseHits: string[];
  rollResults: OutcomeVerdict[];
  toolNames: string[];
}

export function judgeInputsOf(f: JudgeFixture): FixtureJudgeInputs {
  const facts = collectTurnFacts(f.storyBefore, f.storyAfter, f.toolResults);
  const phraseHits = secretHits(
    { storyBefore: f.storyBefore, storyAfter: f.storyAfter, results: [], prose: f.narration },
    facts,
  ).map((h) => h.evidence);
  const rollResults = extractOutcomeVerdicts(
    f.toolResults.map((r) => ({
      toolName: r.toolName,
      toolCallId: r.toolCallId,
      success: r.success,
      result: r.result,
      contextForStory: r.contextForStory ?? "",
    })),
  );
  return { facts, phraseHits, rollResults, toolNames: f.toolResults.map((r) => r.toolName) };
}

/**
 * The Observer's parameters for a fixture. The turn is judged as play would
 * judge it: not in session zero, with a sheet.
 */
export function observerParamsFor(
  f: JudgeFixture,
  apiOptions: ObserverParams["apiOptions"],
  settings: ObserverSettings | undefined = f.settings,
): ObserverParams {
  const inputs = judgeInputsOf(f);
  return {
    narration: f.narration,
    playerChoice: f.playerLine,
    replyLength: f.replyLength,
    toolNames: inputs.toolNames,
    rollResults: inputs.rollResults,
    tierUsed: f.tierUsed,
    characterContext: f.characterContext,
    narrationThoughts: f.narrationThoughts,
    sessionZeroActive: false,
    hasCharacterSheet: true,
    apiOptions,
    settings,
    facts: inputs.facts,
    phraseHits: inputs.phraseHits,
  };
}
