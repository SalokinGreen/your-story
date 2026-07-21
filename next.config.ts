import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: false,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
  },
});

// Standalone (Tauri/Capacitor) build - a static export with no Next.js
// server behind it, calling AI providers directly instead of through
// /api/* routes (see app/misc/providerFetch.ts, app/misc/standalone.ts).
// The normal web build (hosted on Vercel) leaves this env var unset and
// keeps its API routes exactly as before.
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

export default withPWA(nextConfig);
