import type { NextConfig } from "next";

// Standalone (Tauri/Capacitor) build - a static export with no Next.js
// server behind it, calling AI providers directly instead of through
// /api/* routes (see app/misc/providerFetch.ts, app/misc/standalone.ts).
// The normal web build leaves this env var unset and keeps its API routes,
// which `npm run dev` still uses.
const isStandaloneBuild = process.env.NEXT_PUBLIC_STANDALONE === "true";

const nextConfig: NextConfig = {
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
