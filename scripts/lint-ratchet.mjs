/**
 * Lint ratchet.
 *
 * The repo carries a large backlog of ESLint findings (mostly `no-explicit-any`
 * and effect-shaped react-hooks complaints) that predate any single change and
 * aren't worth one big-bang cleanup. Plain `eslint` in CI would just be red
 * forever, so nothing gated it - which is exactly how the backlog grew.
 *
 * This gates on the *direction* instead of the absolute number: run ESLint,
 * count errors and warnings, and fail only if either rises above the committed
 * baseline in lint-baseline.json. Existing findings stay tolerated; new ones
 * break the build. When the count drops, the run passes and prints the command
 * to lower the baseline so the improvement is locked in.
 *
 *   node scripts/lint-ratchet.mjs            # check against the baseline
 *   node scripts/lint-ratchet.mjs --update   # rewrite the baseline to current
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = join(repoRoot, "lint-baseline.json");

// ESLint exits non-zero whenever findings exist, which is the normal state
// here - the JSON report on stdout is what matters, not the exit code.
let report;
try {
  report = execFileSync("npx", ["eslint", "-f", "json"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
  });
} catch (err) {
  if (!err.stdout) {
    console.error("Could not run ESLint.");
    process.exit(2);
  }
  report = err.stdout;
}

const results = JSON.parse(report);
const current = results.reduce(
  (acc, file) => ({
    errors: acc.errors + file.errorCount,
    warnings: acc.warnings + file.warningCount,
  }),
  { errors: 0, warnings: 0 },
);

if (process.argv.includes("--update")) {
  writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`);
  console.log(
    `Baseline updated: ${current.errors} errors, ${current.warnings} warnings.`,
  );
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const worse = [];
for (const kind of ["errors", "warnings"]) {
  if (current[kind] > baseline[kind]) {
    worse.push(`${kind}: ${baseline[kind]} -> ${current[kind]}`);
  }
}

if (worse.length) {
  console.error(
    `\nLint regressed (${worse.join(", ")}).\n\n` +
      `Fix the new findings rather than raising the baseline. Run \`npm run lint\`\n` +
      `to see them - the new ones are in the files this change touched.\n`,
  );
  process.exit(1);
}

const improved =
  current.errors < baseline.errors || current.warnings < baseline.warnings;
console.log(
  `Lint OK - ${current.errors} errors, ${current.warnings} warnings ` +
    `(baseline ${baseline.errors}/${baseline.warnings}).`,
);
if (improved) {
  console.log(
    "\nThis is below the baseline. Lock it in:\n" +
      "  node scripts/lint-ratchet.mjs --update\n",
  );
}
