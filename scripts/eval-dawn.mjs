#!/usr/bin/env node
// Scores the dawn judge (GM prompt plan slice 5, docs/dawn-gate-design.md) against
// evals/dawn/cases.json, beside the phrase table it would replace.
//
//   node scripts/eval-dawn.mjs                 plan only: the cases, what the phrase table says, no model call
//   node scripts/eval-dawn.mjs --go            asks the judge --runs times per case (10)
//
// EVERY RUN WITH --go CALLS A MODEL ON YOUR KEYS AND COSTS MONEY. It never runs in CI
// and waits for the author's go. Keys come from a local `.env.eval` (gitignored).
// Options: --runs N (10), --model KEY and --effort E (default: the side-agent model),
// --only id,id, --go.
//
// Reads: a missed dawn is a dawn case where the answer is not yes; a false dawn is a
// non-dawn case where it is yes. An "unknown" falls back to the phrase table in the
// game, so it is scored as the phrase table's answer for that case. The judge ships
// when its missed + false dawns are no more than the phrase table's (and no case
// is worse by more than 1 run in 10).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT, parseArgs, parseEnvFile, providerKeysFrom } from "./eval-lib.mjs";
import { createTsLoader } from "./load-ts.mjs";

const { flags } = parseArgs(process.argv.slice(2));
const envFile = join(REPO_ROOT, ".env.eval");
const env = { ...process.env, ...(existsSync(envFile) ? parseEnvFile(readFileSync(envFile, "utf8")) : {}) };
const runs = flags.runs ? Number.parseInt(String(flags.runs), 10) : 10;
if (!Number.isInteger(runs) || runs < 1) {
  console.error("--runs must be a whole number from 1");
  process.exit(2);
}
const only = flags.only ? new Set(String(flags.only).split(",").map((s) => s.trim())) : null;

const file = JSON.parse(readFileSync(join(REPO_ROOT, "evals", "dawn", "cases.json"), "utf8"));
const cases = file.cases.filter((c) => !only || only.has(c.id));

const loader = await createTsLoader();
try {
  const judge = await loader.load("app/misc/judges/turnEndJudge.ts");
  const checks = await loader.load("app/misc/turnEndChecks.ts");
  const bb = await loader.load("app/misc/systems/blood-and-bone/turnEndChecks.ts");
  const layer = await loader.load("app/misc/layerSettings.ts");
  const check = bb.NIGHT_ENDED_CHECK;

  const side = layer.resolveSideCallModel(null, providerKeysFrom(env));
  const model = flags.model ? String(flags.model) : side.model;
  const effort = flags.effort ? String(flags.effort) : side.reasoningEffort;
  console.log(`${cases.length} dawn cases, ${runs} runs each on ${model} (effort ${effort}): ${cases.length * runs} model calls with --go.`);

  const rows = [];
  for (const c of cases) {
    const phrase = Boolean(checks.textCrosses(check, { gmProse: c.gmProse, playerLines: c.playerLines }));
    rows.push({ c, phrase });
    console.log(`  ${c.id}: dawn=${c.dawn} phrase table=${phrase}${phrase === c.dawn ? "" : "  (wrong)"}`);
  }
  const phraseWrong = rows.filter((r) => r.phrase !== r.c.dawn).length;
  console.log(`The phrase table is wrong on ${phraseWrong} of ${cases.length} cases (missed or false dawns).`);

  if (!flags.go) {
    console.log("Plan only: no call was made. Add --go to run it (it costs money, and waits for the author's go).");
    process.exit(0);
  }
  const keys = providerKeysFrom(env);
  if (Object.keys(keys).length === 0) {
    console.error("No provider key in .env.eval or the environment. Nothing was run.");
    process.exit(1);
  }
  let judgeWrong = 0;
  let worse = 0;
  for (const { c, phrase } of rows) {
    let yes = 0;
    let no = 0;
    let unknown = 0;
    for (let i = 0; i < runs; i++) {
      const r = await judge.askTurnEndJudge(
        { question: check.trigger.question, gmProse: c.gmProse, playerLines: c.playerLines },
        { model, reasoningEffort: effort, ...keys },
      );
      if (r.answer === "yes") yes++;
      else if (r.answer === "no") no++;
      else unknown++;
    }
    // In the game an unknown is the phrase table's answer.
    const asYes = yes + (phrase ? unknown : 0);
    const wrongRuns = c.dawn ? runs - asYes : asYes;
    const phraseWrongRuns = phrase !== c.dawn ? runs : 0;
    judgeWrong += wrongRuns;
    if (wrongRuns > phraseWrongRuns + 1) worse++;
    console.log(`  ${c.id}: yes ${yes}, no ${no}, unknown ${unknown}; wrong ${wrongRuns}/${runs} (phrase table ${phraseWrongRuns}/${runs})`);
  }
  const phraseTotal = phraseWrong * runs;
  console.log(`\nJudge wrong runs: ${judgeWrong}. Phrase table wrong runs: ${phraseTotal}. Cases clearly worse than the table: ${worse}.`);
  console.log(judgeWrong <= phraseTotal && worse === 0 ? "Verdict: the judge is no worse; safe to turn on." : "Verdict: do NOT turn the judge on.");
} finally {
  await loader.close();
}
process.exit(0);
