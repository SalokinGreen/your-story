#!/usr/bin/env node
// Runs `next build` with NEXT_PUBLIC_STANDALONE=true, producing the static
// export in out/ that the Tauri and Capacitor shells package.
//
// Exists because Tauri runs beforeBuildCommand through cmd.exe on Windows,
// where the POSIX `NEXT_PUBLIC_STANDALONE=true npm run build` form isn't
// valid syntax - setting the variable from Node works on every OS without
// pulling in cross-env.
import { spawnSync } from "node:child_process";

const result = spawnSync("npm", ["run", "build"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, NEXT_PUBLIC_STANDALONE: "true" },
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
