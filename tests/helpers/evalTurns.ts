/**
 * Loads the labelled turn set from disk for tests (judge layer v2, slice 4).
 * Plain fs; the app never imports it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFixtureText, type JudgeFixture } from "@/app/misc/judges/evalFormat";

export const PUBLIC_TURNS = join(__dirname, "..", "..", "evals", "turns", "public");

export interface LoadedTurn {
  file: string;
  text: string;
}

export function readPublicTurnFiles(): LoadedTurn[] {
  return readdirSync(PUBLIC_TURNS)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => ({ file, text: readFileSync(join(PUBLIC_TURNS, file), "utf8") }));
}

export function loadPublicJudgeTurns(): JudgeFixture[] {
  const out: JudgeFixture[] = [];
  for (const { file, text } of readPublicTurnFiles()) {
    const parsed = parseFixtureText(text);
    if (!parsed.ok) throw new Error(`${file}: ${parsed.errors.join("; ")}`);
    if (parsed.fixture.kind === "judge") out.push(parsed.fixture);
  }
  return out;
}
