/**
 * The GM prompt's behavioural runner (GM prompt plan slice G2,
 * docs/gm-prompt-design.md section 3). It runs a generation fixture
 * (`evalFormat.ts`) against the GM's real request: `buildGMStagePrompt` on the
 * fixture's story and the player's line, sent to the model a slot ships with,
 * with the tools the story would be offered. A tool call is answered from the
 * fixture's `scriptedToolResponses` (never executed), so a case can go on to
 * its prose in at most `maxRounds` rounds.
 *
 * **Every call here is a real model call on the caller's keys.** Nothing in the
 * app imports this file, CI never runs it, and `scripts/eval-generation.mjs`
 * makes no call without `--go` (the author's go is the rule).
 *
 * What a run is scored on is only what the fixture's `expect` says: tools
 * called (in any round), and the visible prose (thinking removed) against
 * regular expressions. A provider failure is an error, not a failing run, and
 * is counted apart. The "beyond noise" rule is evalScore's `risesBeyondNoise`:
 * a case rises when its failing runs rise by more than 2 of 20 on two runs.
 */
import { buildGMStagePrompt } from "../ai_staged";
import type { ChatMessage } from "../chatMessage";
import { chaosFactorTemperatureDelta, createAGMTState } from "../mythic";
import type { StoryData } from "../structs";
import { ensureStoryDataArrays } from "../storyDataDefaults";
import { callSideModel, type ProviderKeys } from "../sideModelCall";
import { beginTurnCost, getTurnCostReport } from "../turnCost";
import { extractVisibleText } from "../turnTimeline";
import type { GenerationArgumentRules, GenerationExpect, GenerationFixture } from "./evalFormat";
import { risesBeyondNoise } from "./evalScore";

export const DEFAULT_GENERATION_RUNS = 20;
export const DEFAULT_MAX_ROUNDS = 4;
export const GENERATION_MAX_CONCURRENCY = 8;

export interface GenerationSlot {
  label: string;
  model: string;
  effort: string;
}

export interface GenerationRecord {
  fixtureId: string;
  slot: string;
  model: string;
  run: number;
  /** Every tool name called, in order, across the rounds. */
  calls: string[];
  /** The visible prose of every round, thinking removed. */
  prose: string;
  rounds: number;
  /** Rules of `expect` this run broke; empty means it passed. */
  failures: string[];
  passed: boolean;
  /** A provider failure: the run is not scored. */
  error?: string;
  costUsd: number;
  ms: number;
}

/** The story a fixture describes, with the arrays and the oracle state the prompt builder reads. */
export function loadGenerationStory(fixture: GenerationFixture): StoryData {
  const story = structuredClone(fixture.storySnapshot) as unknown as StoryData;
  story.agmtState = { ...createAGMTState(), ...(story.agmtState ?? {}) } as StoryData["agmtState"];
  return ensureStoryDataArrays(story);
}

/** The GM's first-round request for a fixture, exactly as play builds it. */
export function buildGenerationRequest(
  fixture: GenerationFixture,
  slot: Pick<GenerationSlot, "model" | "effort">,
): { messages: ChatMessage[]; tools: unknown[]; story: StoryData } {
  const story = loadGenerationStory(fixture);
  const { messages, tools } = buildGMStagePrompt({
    storyData: story,
    userChoice: fixture.playerLine,
    modelName: slot.model,
    usesNativeReasoning: slot.effort !== "none",
    drawer: fixture.drawer,
  });
  return { messages, tools, story };
}

/** One tool call the GM made: its name and its parsed arguments (empty when unreadable). */
export interface ObservedCall {
  name: string;
  args: Record<string, unknown>;
}

/** The `expectArguments` rules a run broke, over every call to the rule's tool. Pure. */
export function checkArgumentRules(rules: GenerationArgumentRules, calls: readonly ObservedCall[]): string[] {
  const failures: string[] = [];
  for (const call of calls.filter((c) => c.name === rules.tool)) {
    const raw = call.args.questions;
    const questions = (Array.isArray(raw) ? raw : []).filter(
      (q): q is Record<string, unknown> => !!q && typeof q === "object",
    );
    const tags = new Map<string, Record<string, unknown>>();
    for (const q of questions) {
      const tag = typeof q.setup_step === "string" ? q.setup_step : "";
      if (tag && !tags.has(tag)) tags.set(tag, q);
    }
    if (rules.maxDistinctSetupStepsPerCall !== undefined && tags.size > rules.maxDistinctSetupStepsPerCall) {
      failures.push(`${rules.tool} call tags ${tags.size} setup steps (${[...tags.keys()].join(", ")})`);
    }
    for (const tag of tags.keys()) {
      if (rules.setupStepIn && !rules.setupStepIn.includes(tag)) failures.push(`setup_step ${tag} is not an expected step`);
    }
    for (const [tag, first] of tags) {
      for (const field of rules.everyFirstItemPerTagHas ?? []) {
        const v = first[field];
        if (typeof v !== "string" || !v.trim()) failures.push(`first ${tag} question has no ${field}`);
      }
    }
    if (rules.setupStepIn && tags.size === 0) failures.push(`${rules.tool} call carries no setup_step`);
  }
  return failures;
}

/** The rules of `expect` a run broke, as sentences. Pure. */
export function checkGenerationExpect(
  expect: GenerationExpect,
  observed: { calls: readonly string[]; prose: string; callArgs?: readonly ObservedCall[] },
  argumentRules?: GenerationArgumentRules,
): string[] {
  const failures: string[] = [];
  if (argumentRules) failures.push(...checkArgumentRules(argumentRules, observed.callArgs ?? []));
  const called = new Set(observed.calls);
  for (const name of expect.calls ?? []) {
    if (!called.has(name)) failures.push(`did not call ${name}`);
  }
  if (expect.callsAny && !expect.callsAny.some((n) => called.has(n))) {
    failures.push(`called none of ${expect.callsAny.join(", ")}`);
  }
  for (const name of expect.noCalls ?? []) {
    if (called.has(name)) failures.push(`called ${name}`);
  }
  for (const source of expect.proseMatching ?? []) {
    if (!new RegExp(source, "i").test(observed.prose)) failures.push(`prose lacks /${source}/`);
  }
  for (const phrase of expect.narrationExcludes ?? []) {
    if (observed.prose.toLowerCase().includes(phrase.toLowerCase())) {
      failures.push(`narration contains "${phrase}"`);
    }
  }
  for (const source of expect.proseNotMatching ?? []) {
    const hit = new RegExp(source, "i").exec(observed.prose);
    if (hit) failures.push(`prose matches /${source}/: "${hit[0]}"`);
  }
  return failures;
}

const NO_SCRIPT = "[This tool is not available in this evaluation. Continue without it.]";

/** The engine's scripted answer for a tool: the first unused `{ tool, result }` entry for its name. */
export function scriptedResultFor(
  fixture: GenerationFixture,
  toolName: string,
  used: Set<number>,
): string {
  const entries = fixture.scriptedToolResponses ?? [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (used.has(i) || e.tool !== toolName) continue;
    used.add(i);
    return typeof e.result === "string" ? e.result : JSON.stringify(e.result);
  }
  // A scripted tool that is called again keeps its last answer.
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].tool === toolName) {
      const r = entries[i].result;
      return typeof r === "string" ? r : JSON.stringify(r);
    }
  }
  return NO_SCRIPT;
}

interface RawToolCall {
  id?: string;
  function?: { name?: string; arguments?: string };
}

/** One run of one case on one slot, billed to its own ledger turn. */
export async function runGenerationOnce(
  fixture: GenerationFixture,
  slot: GenerationSlot,
  run: number,
  keys: ProviderKeys,
  maxRounds: number = DEFAULT_MAX_ROUNDS,
  now: () => number = Date.now,
): Promise<GenerationRecord> {
  const costTurnId = beginTurnCost();
  const started = now();
  const { messages, tools, story } = buildGenerationRequest(fixture, slot);
  const calls: string[] = [];
  const callArgs: ObservedCall[] = [];
  const proseParts: string[] = [];
  const used = new Set<number>();
  let rounds = 0;
  let error: string | undefined;
  const history: ChatMessage[] = [...messages];

  while (rounds < maxRounds) {
    rounds += 1;
    const result = await callSideModel({
      stage: "gm",
      label: `GM prompt case ${fixture.id}`,
      model: slot.model,
      messages: history,
      keys,
      maxTokens: 4096,
      temperature: 0.4 + chaosFactorTemperatureDelta(story.agmtState?.chaosFactor),
      reasoningEffort: slot.effort,
      tools,
      costTurnId,
    } as Parameters<typeof callSideModel>[0]);
    if (!result.ok) {
      error = result.error;
      break;
    }
    const data = result.data;
    const visible = extractVisibleText(data.content ?? "").trim();
    if (visible) proseParts.push(visible);
    const toolCalls = (data.toolCalls ?? []) as RawToolCall[];
    if (toolCalls.length === 0) break;
    history.push({
      role: "assistant",
      content: data.content ?? "",
      tool_calls: toolCalls,
      ...(data.reasoning_details?.length ? { reasoning_details: data.reasoning_details } : {}),
    });
    for (const call of toolCalls) {
      const name = call.function?.name ?? "";
      calls.push(name);
      let args: Record<string, unknown> = {};
      try {
        const parsed: unknown = JSON.parse(call.function?.arguments ?? "{}");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
      } catch {
        // unreadable arguments: the rules see an empty call
      }
      callArgs.push({ name, args });
      history.push({
        role: "tool",
        tool_call_id: call.id ?? `call_${calls.length}`,
        content: scriptedResultFor(fixture, name, used),
      });
    }
  }

  const prose = proseParts.join("\n\n");
  const failures = error ? [] : checkGenerationExpect(fixture.expect, { calls, prose, callArgs }, fixture.expectArguments);
  const ledger = getTurnCostReport(costTurnId);
  return {
    fixtureId: fixture.id,
    slot: slot.label,
    model: slot.model,
    run,
    calls,
    prose,
    rounds,
    failures,
    passed: !error && failures.length === 0,
    ...(error ? { error } : {}),
    costUsd: ledger?.totalUsd ?? 0,
    ms: Math.max(0, now() - started),
  };
}

export interface GenerationEvalOptions {
  fixtures: readonly GenerationFixture[];
  slots: readonly GenerationSlot[];
  runs: number;
  keys: ProviderKeys;
  maxRounds?: number;
  concurrency?: number;
  now?: () => number;
  onProgress?: (done: number, total: number) => void;
}

/** Runs every case on every slot `runs` times; the records come back in a fixed order. */
export async function runGenerationEval(options: GenerationEvalOptions): Promise<GenerationRecord[]> {
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, GENERATION_MAX_CONCURRENCY));
  const tasks: { fixture: GenerationFixture; slot: GenerationSlot; run: number }[] = [];
  for (const slot of options.slots) {
    for (const fixture of options.fixtures) {
      for (let run = 1; run <= options.runs; run++) tasks.push({ fixture, slot, run });
    }
  }
  const records: GenerationRecord[] = [];
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const task = tasks[next++];
      records.push(
        await runGenerationOnce(task.fixture, task.slot, task.run, options.keys, options.maxRounds, options.now),
      );
      done += 1;
      options.onProgress?.(done, tasks.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return records.sort(
    (a, b) =>
      a.slot.localeCompare(b.slot) || a.fixtureId.localeCompare(b.fixtureId) || a.run - b.run,
  );
}

/** Calls a run makes, without making any: one to `maxRounds` per run. */
export function estimateGenerationCalls(
  fixtures: readonly GenerationFixture[],
  runs: number,
  slotCount: number,
  maxRounds: number = DEFAULT_MAX_ROUNDS,
): { min: number; max: number } {
  const perSlot = fixtures.length * runs;
  return { min: perSlot * slotCount, max: perSlot * slotCount * maxRounds };
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

export interface GenerationCaseScore {
  fixtureId: string;
  slot: string;
  model: string;
  /** Scored runs (the provider answered). */
  runs: number;
  failing: number;
  errors: number;
  /** The most common failures, with counts. */
  topFailures: { failure: string; count: number }[];
  costUsd: number;
}

export interface GenerationReport {
  v: 1;
  generatedAt: string;
  runsPerCase: number;
  cases: GenerationCaseScore[];
}

export function buildGenerationReport(
  records: readonly GenerationRecord[],
  meta: { runs: number; generatedAt: string },
): GenerationReport {
  const keys = [...new Set(records.map((r) => `${r.slot}\u0000${r.fixtureId}`))].sort();
  const cases = keys.map((key) => {
    const [slot, fixtureId] = key.split("\u0000");
    const mine = records.filter((r) => r.slot === slot && r.fixtureId === fixtureId);
    const scored = mine.filter((r) => !r.error);
    const counts = new Map<string, number>();
    for (const r of scored) for (const f of r.failures) counts.set(f, (counts.get(f) ?? 0) + 1);
    return {
      fixtureId,
      slot,
      model: mine[0]?.model ?? "",
      runs: scored.length,
      failing: scored.filter((r) => !r.passed).length,
      errors: mine.length - scored.length,
      topFailures: [...counts.entries()]
        .map(([failure, count]) => ({ failure, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3),
      costUsd: mine.reduce((sum, r) => sum + r.costUsd, 0),
    };
  });
  return { v: 1, generatedAt: meta.generatedAt, runsPerCase: meta.runs, cases };
}

/**
 * How a case moved against a baseline report: "improved" when failing fell,
 * "worse" when it rose by more than the noise rule's margin (a single report
 * can only say it is past 2 of 20, and the rule asks for two runs of the set to
 * confirm), else "same". Pure.
 */
export function compareCase(
  baseline: Pick<GenerationCaseScore, "failing" | "runs"> | undefined,
  later: Pick<GenerationCaseScore, "failing" | "runs">,
): "new" | "improved" | "same" | "worse" {
  if (!baseline || baseline.runs <= 0 || later.runs <= 0) return "new";
  const delta = later.failing / later.runs - baseline.failing / baseline.runs;
  if (delta < 0) return "improved";
  // Two copies of the later score stand in for "two separate runs"; the script
  // prints the margin, and a second --go run confirms a "worse".
  return risesBeyondNoise(baseline, [later, later]) ? "worse" : "same";
}

export function formatGenerationReport(
  report: GenerationReport,
  baseline: GenerationReport | null = null,
): string {
  const lines: string[] = [];
  lines.push(`GM prompt cases - ${report.cases.length} case/slot pairs, ${report.runsPerCase} runs each`);
  lines.push("slot       case                                  failing   vs baseline    errors  top failure");
  for (const c of report.cases) {
    const base = baseline?.cases.find((b) => b.fixtureId === c.fixtureId && b.slot === c.slot);
    const verdict = baseline ? compareCase(base, c) : "";
    const against = base ? `${base.failing}/${base.runs} ${verdict}` : baseline ? "no baseline" : "";
    lines.push(
      `${c.slot.padEnd(10)} ${c.fixtureId.padEnd(37)} ${`${c.failing}/${c.runs}`.padEnd(9)} ${against.padEnd(14)} ${String(c.errors).padEnd(7)} ${c.topFailures[0] ? `${c.topFailures[0].failure} (x${c.topFailures[0].count})` : ""}`,
    );
  }
  const cost = report.cases.reduce((sum, c) => sum + c.costUsd, 0);
  lines.push("", `cost $${cost.toFixed(4)} (a floor when a provider reports none)`);
  if (baseline) {
    lines.push(
      "A target case must fall; every other case must not rise by more than 2 of 20 on two separate runs (confirm a 'worse' with a second --go run).",
    );
  }
  return lines.join("\n");
}
