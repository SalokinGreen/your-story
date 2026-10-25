// Plain helpers shared by scripts/eval-judges.mjs and scripts/export-eval-turn.mjs
// (judge layer v2, slice 4). No model is called here, and nothing here reads a
// key except parseEnvFile on the file it is handed. tests/judges.evalScripts.test.ts
// covers it.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const PUBLIC_TURNS_DIR = join(REPO_ROOT, "evals", "turns", "public");

/** KEY=value lines; blank lines and # comments skipped; one pair of quotes stripped. */
export function parseEnvFile(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** The provider keys of an env map, under the names ObserverApiOptions uses. */
export function providerKeysFrom(env) {
  const keys = {};
  const map = {
    openRouterKey: "OPENROUTER_API_KEY",
    deepseekKey: "DEEPSEEK_API_KEY",
    googleKey: "GOOGLE_API_KEY",
    mistralKey: "MISTRAL_API_KEY",
    deepinfraKey: "DEEPINFRA_API_KEY",
    zaiKey: "ZAI_API_KEY",
  };
  for (const [name, variable] of Object.entries(map)) {
    if (env[variable]) keys[name] = env[variable];
  }
  return keys;
}

/**
 * Command-line arguments: `--flag`, `--name value` or `--name=value`. Unknown
 * names are kept (the caller decides); a bare word is a positional.
 */
export function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq > 0) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) {
      flags[arg.slice(2)] = argv[++i];
    } else {
      flags[arg.slice(2)] = true;
    }
  }
  return { flags, positional };
}

/** The .json files under a folder, one level deep, in name order. A missing folder is empty. */
export function readTurnFiles(dir) {
  if (!dir || !existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .sort()
    .map((name) => {
      const path = join(dir, name);
      return { path, name, text: readFileSync(path, "utf8") };
    });
}

/**
 * The folders a run reads: the published turns, plus the private folder named
 * by EVAL_TURNS_DIR (the environment, or .env.eval) unless `publicOnly`.
 */
export function turnDirs(env, publicOnly = false) {
  const dirs = [PUBLIC_TURNS_DIR];
  if (!publicOnly && env.EVAL_TURNS_DIR) dirs.push(resolve(env.EVAL_TURNS_DIR));
  return dirs;
}
