#!/usr/bin/env node
// Drafts a labelled-set turn from your own play (judge layer v2, slice 4).
//
//   node scripts/export-eval-turn.mjs story.json --id grave-watcher-door --part 14
//   node scripts/export-eval-turn.mjs gm-context.json --id my-case --out C:/private-turns
//
// Input is a story's JSON export (the library's export of a story) or a "Copy GM
// context" download. The draft has `published: false` and `labels: []`: Claude
// proposes labels and YOU check each one. A turn goes into evals/turns/public/
// only once you approve it for publishing (decision 233); the default output is
// EVAL_TURNS_DIR (a folder outside the repository), and the script refuses to
// write a file with `published: false` into the public folder. Makes no model
// call. Options: --id NAME (required), --part N (the last GM turn by default),
// --note TEXT, --out DIR, --force (replace an existing file).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { PUBLIC_TURNS_DIR, REPO_ROOT, parseArgs, parseEnvFile } from "./eval-lib.mjs";
import { createTsLoader } from "./load-ts.mjs";

const { flags, positional } = parseArgs(process.argv.slice(2));
const envFile = join(REPO_ROOT, ".env.eval");
const env = { ...process.env, ...(existsSync(envFile) ? parseEnvFile(readFileSync(envFile, "utf8")) : {}) };

const input = positional[0];
if (!input || !flags.id || flags.id === true) {
  console.error("usage: node scripts/export-eval-turn.mjs <export.json> --id <name> [--part N] [--note TEXT] [--out DIR] [--force]");
  process.exit(2);
}
const outDir = resolve(String(flags.out ?? env.EVAL_TURNS_DIR ?? ""));
if (!flags.out && !env.EVAL_TURNS_DIR) {
  console.error("No output folder: pass --out DIR or set EVAL_TURNS_DIR (a folder outside the repository).");
  process.exit(2);
}
if (resolve(outDir) === resolve(PUBLIC_TURNS_DIR)) {
  console.error("A draft is not published. Write it to a private folder; move it into evals/turns/public/ and set published: true once you approve it.");
  process.exit(2);
}

const loader = await createTsLoader();
const format = { mod: await loader.load("app/misc/judges/evalFormat.ts") };
const exporter = { mod: await loader.load("app/misc/judges/evalExport.ts") };
try {
  let raw;
  try {
    raw = JSON.parse(readFileSync(resolve(input), "utf8"));
  } catch (error) {
    console.error(`Could not read ${input} as JSON: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
  const result = exporter.mod.exportJudgeFixture(raw, {
    id: String(flags.id),
    partIndex: flags.part !== undefined ? Number.parseInt(String(flags.part), 10) : undefined,
    note: flags.note && flags.note !== true ? String(flags.note) : undefined,
  });
  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }
  const checked = format.mod.parseFixture(JSON.parse(JSON.stringify(result.fixture)));
  if (!checked.ok) {
    console.error("The draft is not a valid turn:\n  " + checked.errors.join("\n  "));
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `${result.fixture.id}.json`);
  if (existsSync(file) && !flags.force) {
    console.error(`${file} exists; pass --force to replace it.`);
    process.exit(1);
  }
  writeFileSync(file, JSON.stringify(result.fixture, null, 2) + "\n");
  console.log(`Wrote ${relative(process.cwd(), file)} with labels: [] and published: false.`);
  console.log("storyBefore is a copy of the story's end state; edit it if the turn changed a secret, an NPC or a meter.");
} finally {
  await loader.close();
}
process.exit(0);
