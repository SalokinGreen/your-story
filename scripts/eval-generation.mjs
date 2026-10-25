#!/usr/bin/env node
// Runs the GM prompt's behavioural cases (GM prompt plan slice G2, docs/gm-prompt-design.md
// section 3): each case is a generation fixture in evals/generation/, run against the
// GM's real request (buildGMStagePrompt) on the model each slot ships with.
//
//   node scripts/eval-generation.mjs                       plan only: lists the cases and the calls, makes none
//   node scripts/eval-generation.mjs --go --out evals/generation-baseline.json
//   node scripts/eval-generation.mjs --go --baseline evals/generation-baseline.json --out evals/generation-after.json
//
// EVERY RUN WITH --go CALLS A MODEL ON YOUR KEYS AND COSTS MONEY. It never runs in CI
// and waits for the author's go. Keys come from a local `.env.eval` (gitignored with
// every `.env*`): OPENROUTER_API_KEY and the others eval-judges.mjs names.
//
// Options: --runs N (20), --slot default|advanced|both (both), --only id,id,
// --model KEY and --effort E (one custom slot, replaces --slot), --concurrency N (4, at
// most 8), --max-rounds N (4), --baseline PATH (compare against an earlier report),
// --out PATH (evals/generation-results.json; "none" prints only), --go.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { REPO_ROOT, parseArgs, parseEnvFile, providerKeysFrom, readTurnFiles } from "./eval-lib.mjs";
import { createTsLoader } from "./load-ts.mjs";

const GENERATION_DIR = join(REPO_ROOT, "evals", "generation");

const { flags } = parseArgs(process.argv.slice(2));
const envFile = join(REPO_ROOT, ".env.eval");
const env = { ...process.env, ...(existsSync(envFile) ? parseEnvFile(readFileSync(envFile, "utf8")) : {}) };

const runs = flags.runs ? Number.parseInt(String(flags.runs), 10) : 20;
if (!Number.isInteger(runs) || runs < 1) {
  console.error("--runs must be a whole number from 1");
  process.exit(2);
}
const maxRounds = flags["max-rounds"] ? Number.parseInt(String(flags["max-rounds"]), 10) : 4;
if (!Number.isInteger(maxRounds) || maxRounds < 1) {
  console.error("--max-rounds must be a whole number from 1");
  process.exit(2);
}
const slotFlag = String(flags.slot ?? "both");
if (!["default", "advanced", "both"].includes(slotFlag)) {
  console.error("--slot must be default, advanced or both");
  process.exit(2);
}
const only = flags.only ? new Set(String(flags.only).split(",").map((s) => s.trim())) : null;
const outPath = flags.out === "none" ? null : resolve(REPO_ROOT, String(flags.out ?? "evals/generation-results.json"));

const loader = await createTsLoader();
const close = loader.close;
const mod = {
  format: await loader.load("app/misc/judges/evalFormat.ts"),
  runner: await loader.load("app/misc/judges/generationEval.ts"),
  tiers: await loader.load("app/misc/reasoningTiers.ts"),
};

try {
  const fixtures = [];
  let bad = 0;
  for (const file of readTurnFiles(GENERATION_DIR)) {
    const parsed = mod.format.parseFixtureText(file.text);
    const shown = relative(REPO_ROOT, file.path);
    if (!parsed.ok) {
      bad += 1;
      console.error(`${shown}: ${parsed.errors.join("; ")}`);
      continue;
    }
    if (parsed.fixture.kind !== "generation") {
      bad += 1;
      console.error(`${shown}: not a generation fixture`);
      continue;
    }
    if (only && !only.has(parsed.fixture.id)) continue;
    fixtures.push(parsed.fixture);
  }
  if (bad > 0) {
    console.error(`${bad} case file(s) are invalid; nothing was run.`);
    process.exit(1);
  }
  if (fixtures.length === 0) {
    console.error("No generation cases found in evals/generation/.");
    process.exit(1);
  }

  // The two slots as shipped: Default is tier 1's model and effort, Advanced tier 3's.
  const tiers = mod.tiers.REASONING_TIERS;
  const shipped = {
    default: { label: "Default", model: tiers[1].modelKey, effort: tiers[1].reasoningEffort },
    advanced: { label: "Advanced", model: tiers[mod.tiers.TOP_TIER].modelKey, effort: tiers[mod.tiers.TOP_TIER].reasoningEffort },
  };
  const slots = flags.model
    ? [{ label: "Custom", model: String(flags.model), effort: String(flags.effort ?? "none") }]
    : slotFlag === "both"
      ? [shipped.default, shipped.advanced]
      : [shipped[slotFlag]];

  const est = mod.runner.estimateGenerationCalls(fixtures, runs, slots.length, maxRounds);
  console.log(
    `${fixtures.length} generation cases, ${runs} runs each, on ${slots.map((s) => `${s.label}: ${s.model} (effort ${s.effort})`).join(" and ")}.`,
  );
  console.log(`That is ${est.min} to ${est.max} model calls on your keys.`);
  for (const f of fixtures) console.log(`  ${f.id}${f.note ? ` - ${f.note}` : ""}`);

  if (!flags.go) {
    console.log("Plan only: no call was made. Add --go to run it (it costs money, and waits for the author's go).");
    process.exit(0);
  }
  const keys = providerKeysFrom(env);
  if (Object.keys(keys).length === 0) {
    console.error("No provider key in .env.eval or the environment (see the top of eval-judges.mjs). Nothing was run.");
    process.exit(1);
  }

  const records = await mod.runner.runGenerationEval({
    fixtures,
    slots,
    runs,
    keys,
    maxRounds,
    concurrency: flags.concurrency ? Number.parseInt(String(flags.concurrency), 10) : 4,
    onProgress: (done, total) => {
      if (done % 5 === 0 || done === total) process.stderr.write(`\r${done}/${total} runs`);
    },
  });
  process.stderr.write("\n");

  const report = mod.runner.buildGenerationReport(records, { runs, generatedAt: new Date().toISOString() });
  let baseline = null;
  if (flags.baseline) {
    const path = resolve(REPO_ROOT, String(flags.baseline));
    if (!existsSync(path)) {
      console.error(`--baseline ${path} does not exist.`);
      process.exit(2);
    }
    baseline = JSON.parse(readFileSync(path, "utf8"));
  }
  console.log(mod.runner.formatGenerationReport(report, baseline));
  if (outPath) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
    console.log(`\nWrote ${relative(REPO_ROOT, outPath)}.`);
  }
} finally {
  await close();
}
process.exit(0);
