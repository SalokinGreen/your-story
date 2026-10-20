/**
 * Guards the standalone (Tauri/Capacitor) build, which ships as a static
 * export with no /api/* routes at all (see standalone.ts). Client code has to
 * reach those routes through the `*Fetch.ts` wrappers (providerFetch.ts,
 * ocrFetch.ts, ttsFetch.ts, ...), which call the provider in-process when
 * isStandalone(). A raw `fetch("/api/...")` works on the web build and then
 * silently 404s in the native apps - which is how the Observer, Memory Keeper,
 * Reflection, Compaction, Director Assistant, Story Progress Observer and the
 * creator's Designer chat all ended up never running there (status report
 * §6.7). AI side calls should use callSideModel() (sideModelCall.ts).
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const APP_DIR = path.resolve(__dirname, "../app");

/** fetch("/api/..."), fetch('/api/...') and fetch(`/api/...`). */
const RAW_API_FETCH = /\bfetch\(\s*["'`]\/api\//g;

/**
 * Files allowed to keep a raw call, each for a stated reason. Keep this list
 * short - an entry here is a native-build bug unless the reason says why not.
 */
const ALLOWED: Record<string, string> = {
  // Only reached on the web build - the standalone branch above it calls the
  // provider directly (see summarizeOCRStream's isStandalone() guard).
  "misc/ocrSummarizeStream.ts": "guarded by isStandalone()",
  // The /api/embeddings/* routes were deleted (PR #64), so this client is dead
  // on every build. Removing it, and the settings toggle that still reaches
  // it, is status report §6.9.
  "misc/embeddings.ts": "dead client, routes deleted - see §6.9",
};

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function relativeToApp(file: string): string {
  return path.relative(APP_DIR, file).split(path.sep).join("/");
}

/** Client-side files that could make a raw call: not the route handlers themselves, not the wrappers. */
function clientSourceFiles(): string[] {
  return listSourceFiles(APP_DIR).filter((file) => {
    const rel = relativeToApp(file);
    return !rel.startsWith("api/") && !/Fetch\.ts$/.test(rel);
  });
}

/** Doc comments may name the pattern (to explain why not to use it) - only code counts. */
function isCommentLine(line: string): boolean {
  return /^\s*(\/\/|\/\*|\*)/.test(line);
}

function rawApiFetchLines(file: string): number[] {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  return lines
    .map((line, i) => (!isCommentLine(line) && line.match(RAW_API_FETCH) ? i + 1 : 0))
    .filter((n) => n > 0);
}

describe('no raw fetch("/api/...") outside the *Fetch.ts wrappers', () => {
  it("routes every client-side /api/* call through a standalone-aware wrapper", () => {
    const offenders: string[] = [];
    for (const file of clientSourceFiles()) {
      const rel = relativeToApp(file);
      if (ALLOWED[rel]) continue;
      for (const line of rawApiFetchLines(file)) {
        offenders.push(`app/${rel}:${line}`);
      }
    }

    expect(
      offenders,
      "These call an /api/* route directly, which doesn't exist in the " +
        "standalone build. Use callSideModel() (sideModelCall.ts) for AI side " +
        "calls, or the matching *Fetch.ts wrapper for anything else.",
    ).toEqual([]);
  });

  it("keeps the allowlist honest - every allowed file still has a raw call", () => {
    for (const rel of Object.keys(ALLOWED)) {
      const file = path.join(APP_DIR, rel);
      expect(fs.existsSync(file), `app/${rel} no longer exists - drop it from ALLOWED`).toBe(true);
      expect(
        rawApiFetchLines(file).length,
        `app/${rel} no longer makes a raw /api/* call - drop it from ALLOWED`,
      ).toBeGreaterThan(0);
    }
  });
});
