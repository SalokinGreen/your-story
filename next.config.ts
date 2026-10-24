import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

// One canonical app version for every platform: package.json's, baked into the
// bundle (including the static export) as NEXT_PUBLIC_APP_VERSION. Feedback
// reports it (app/misc/feedback.ts appVersion()).
const appVersion: string = (
  JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8")) as {
    version: string;
  }
).version;

// Standalone (Tauri/Capacitor) build - a static export with no Next.js
// server behind it, calling AI providers directly instead of through
// /api/* routes (see app/misc/providerFetch.ts, app/misc/standalone.ts).
// The normal web build leaves this env var unset and keeps its API routes,
// which `npm run dev` still uses.
const isStandaloneBuild = process.env.NEXT_PUBLIC_STANDALONE === "true";

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: appVersion },
  turbopack: {},
  allowedDevOrigins: ["10.0.0.198"],
  ...(isStandaloneBuild
    ? {
        output: "export",
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
