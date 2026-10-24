#!/usr/bin/env node
// Runs `next build` with NEXT_PUBLIC_STANDALONE=true, producing the static
// export in out/ that the Tauri and Capacitor shells package.
//
// Exists because Tauri runs beforeBuildCommand through cmd.exe on Windows,
// where the POSIX `NEXT_PUBLIC_STANDALONE=true npm run build` form isn't
// valid syntax - setting the variable from Node works on every OS without
// pulling in cross-env.
import { spawnSync } from "node:child_process";

// NEXT_PUBLIC_SYNC_API_URL (the sync Worker, which also takes feedback) and
// the app version are baked into the export at build time. The URL comes from
// the environment or .env.local (which Next reads itself); the version comes
// from package.json through next.config.ts. Say so when the URL is missing,
// because a build without it has no feedback entries and no sync.
if (!process.env.NEXT_PUBLIC_SYNC_API_URL) {
  console.warn(
    "build-standalone: NEXT_PUBLIC_SYNC_API_URL is not set in the environment " +
      "(Next also reads .env.local). Without it this build has no feedback and no sync.",
  );
}

const result = spawnSync("npm", ["run", "build"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, NEXT_PUBLIC_STANDALONE: "true" },
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
