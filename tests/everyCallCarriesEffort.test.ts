/**
 * Decision 53: every model call carries an explicit reasoning effort. A call
 * that sends none is left to the provider's own default (Grok defaults to high
 * effort, Claude to its own medium), which is how the side agents once ran at
 * whatever the model felt like. providerCall.ts keeps a backstop for Claude and
 * GLM, but it is a backstop: this guard fails the build when a new call site
 * forgets.
 *
 * It reads the source rather than running it, so it covers the call sites no
 * turn-level test reaches. Calls whose request body is built elsewhere (the GM
 * round's buildGmRequestBody, the story stage's storyRequestBody) are covered
 * by tests/generation.effort.test.ts instead.
 *
 * The OCR, speech-to-text and text-to-speech calls are not chat-model
 * reasoning calls and are out of scope here.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const APP_DIR = path.resolve(__dirname, "../app");

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listSourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) files.push(full);
  }
  return files;
}

/** The text of the `{ ... }` that opens at `start`, or null if it never closes. */
function objectLiteralAt(source: string, start: number): string | null {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

interface CallSite {
  file: string;
  line: number;
  kind: "callSideModel" | "providerFetch";
  body: string;
}

/** Calls handing callSideModel or providerFetch("/api/generate...") an inline request object. */
function findCallSites(): CallSite[] {
  const sites: CallSite[] = [];
  const patterns: [CallSite["kind"], RegExp][] = [
    ["callSideModel", /\bcallSideModel\(\s*(\{)/g],
    ["providerFetch", /\bproviderFetch\(\s*["']\/api\/generate(?:-stream)?["']\s*,\s*(\{)/g],
  ];
  for (const file of listSourceFiles(APP_DIR)) {
    const rel = path.relative(APP_DIR, file).split(path.sep).join("/");
    if (rel.startsWith("api/")) continue;
    const source = fs.readFileSync(file, "utf8");
    for (const [kind, pattern] of patterns) {
      for (const match of source.matchAll(pattern)) {
        const open = match.index! + match[0].length - 1;
        const body = objectLiteralAt(source, open);
        if (body === null) continue;
        sites.push({
          file: rel,
          line: source.slice(0, open).split("\n").length,
          kind,
          body,
        });
      }
    }
  }
  return sites;
}

describe("every inline model call names its reasoning effort (decision 53)", () => {
  const sites = findCallSites();

  it("finds the call sites it is meant to guard", () => {
    // The Observer's six judges and rewrite, the Memory Keeper, Reflection,
    // compaction, the Director Assistant, the Story Progress Observer, the
    // sub-agent call and the Designer; and generation.ts's choices call,
    // generateSimple and generateSimpleStream. A regex that stops matching
    // would otherwise pass this file by checking nothing.
    expect(sites.filter((s) => s.kind === "callSideModel").length).toBeGreaterThanOrEqual(13);
    expect(sites.filter((s) => s.kind === "providerFetch").length).toBeGreaterThanOrEqual(3);
  });

  it("passes reasoningEffort at every one", () => {
    const missing = sites
      .filter((s) => !/\breasoningEffort\b/.test(s.body))
      .map((s) => `${s.file}:${s.line} (${s.kind})`);
    expect(missing).toEqual([]);
  });
});
