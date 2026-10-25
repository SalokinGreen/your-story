#!/usr/bin/env node
// Scores the judges against the labelled turn set (judge layer v2, slice 4;
// docs/judge-layer-v2-design.md section 7, decisions 229 and 233).
//
//   node scripts/eval-judges.mjs                    plan only: lists the turns and the calls, makes none
//   node scripts/eval-judges.mjs --go               runs 20 times each, combined and split, on your keys
//   node scripts/eval-judges.mjs --go --runs 5 --mode combined --only turn-a,turn-b
//
// EVERY RUN WITH --go CALLS A MODEL ON YOUR KEYS AND COSTS MONEY. It never runs
// in CI and waits for the author's go. Keys come from a local `.env.eval`
// (gitignored with every `.env*`): OPENROUTER_API_KEY, DEEPSEEK_API_KEY,
// GOOGLE_API_KEY, MISTRAL_API_KEY, DEEPINFRA_API_KEY, ZAI_API_KEY. Optional in
// the same file or the environment: EVAL_TURNS_DIR, a folder outside the
// repository with the turns you have not published.
//
// Options: --runs N (20), --mode combined|split|both (both), --only id,id,
// --model KEY, --effort E, --concurrency N (4, at most 8), --public-only,
// --out PATH (evals/results.json; "none" prints only), --go.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
  PUBLIC_TURNS_DIR,
  REPO_ROOT,
  parseArgs,
  parseEnvFile,
  providerKeysFrom,
  readTurnFiles,
  turnDirs,
} from "./eval-lib.mjs";
import { createTsLoader } from "./load-ts.mjs";

const { flags } = parseArgs(process.argv.slice(2));
const envFile = join(REPO_ROOT, ".env.eval");
const env = { ...process.env, ...(existsSync(envFile) ? parseEnvFile(readFileSync(envFile, "utf8")) : {}) };

const runs = flags.runs ? Number.parseInt(String(flags.runs), 10) : 20;
if (!Number.isInteger(runs) || runs < 1) {
  console.error("--runs must be a whole number from 1");
  process.exit(2);
}
const modeFlag = String(flags.mode ?? "both");
if (!["combined", "split", "both"].includes(modeFlag)) {
  console.error("--mode must be combined, split or both");
  process.exit(2);
}
const modes = modeFlag === "both" ? ["combined", "split"] : [modeFlag];
const only = flags.only ? new Set(String(flags.only).split(",").map((s) => s.trim())) : null;
const outPath = flags.out === "none" ? null : resolve(REPO_ROOT, String(flags.out ?? "evals/results.json"));

const loader = await createTsLoader();
const close = loader.close;
const mod = {
  format: await loader.load("app/misc/judges/evalFormat.ts"),
  runner: await loader.load("app/misc/judges/evalRunner.ts"),
  layer: await loader.load("app/misc/layerSettings.ts"),
};

try {
  // Load and check every turn first: a bad file stops the run before a call.
  const fixtures = [];
  let bad = 0;
  for (const dir of turnDirs(env, Boolean(flags["public-only"]))) {
    for (const file of readTurnFiles(dir)) {
      const parsed = mod.format.parseFixtureText(file.text);
      const shown = relative(REPO_ROOT, file.path);
      if (!parsed.ok) {
        bad += 1;
        console.error(`${shown}: ${parsed.errors.join("; ")}`);
        continue;
      }
      if (dir === PUBLIC_TURNS_DIR && !parsed.fixture.published) {
        bad += 1;
        console.error(`${shown}: sits in the published folder but says published: false`);
        continue;
      }
      if (parsed.fixture.kind !== "judge") continue; // generation fixtures belong to the GM prompt plan's runner
      if (only && !only.has(parsed.fixture.id)) continue;
      fixtures.push(parsed.fixture);
    }
  }
  if (bad > 0) {
    console.error(`${bad} turn file(s) are invalid; nothing was run.`);
    process.exit(1);
  }
  if (fixtures.length === 0) {
    console.error("No judge turns found (evals/turns/public, and EVAL_TURNS_DIR if set).");
    process.exit(1);
  }

  const model = String(flags.model ?? mod.layer.SIDE_AGENT_DEFAULT_MODEL_KEY);
  const effort = String(flags.effort ?? mod.layer.SIDE_AGENT_DEFAULT_EFFORT);
  const keys = providerKeysFrom(env);

  let minCalls = 0;
  let maxCalls = 0;
  for (const fixture of fixtures) {
    for (const mode of modes) {
      const e = mod.runner.estimateCalls(fixture, mode);
      minCalls += e.min * runs;
      maxCalls += e.max * runs;
    }
  }
  console.log(
    `${fixtures.length} judge turns (${fixtures.filter((f) => f.published).length} published), ${runs} runs each, ${modes.join(" and ")} form, on ${model} (effort ${effort}).`,
  );
  console.log(`That is ${minCalls} to ${maxCalls} model calls on your keys.`);

  if (!flags.go) {
    console.log("Plan only: no call was made. Add --go to run it (it costs money, and waits for the author's go).");
    process.exit(0);
  }
  if (Object.keys(keys).length === 0) {
    console.error("No provider key in .env.eval or the environment (see the top of this script). Nothing was run.");
    process.exit(1);
  }

  const records = await mod.runner.runEval({
    fixtures,
    modes,
    runs,
    apiOptions: { model, token: null, reasoningEffort: effort, ...keys },
    concurrency: flags.concurrency ? Number.parseInt(String(flags.concurrency), 10) : 4,
    onProgress: (done, total) => {
      if (done % 10 === 0 || done === total) process.stderr.write(`\r${done}/${total} runs`);
    },
  });
  process.stderr.write("\n");

  const report = mod.runner.buildReport(fixtures, records, {
    model,
    effort,
    runs,
    generatedAt: new Date().toISOString(),
  });
  console.log(mod.runner.formatReport(report));
  if (outPath) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
    console.log(`\nWrote ${relative(REPO_ROOT, outPath)} (private turns are counted there, never named).`);
  }
} finally {
  await close();
}
process.exit(0);
