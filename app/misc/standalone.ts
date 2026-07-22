/**
 * True for the desktop/mobile (Tauri/Capacitor) build, which ships as a
 * static export with no Next.js server behind it - baked in at build time
 * via NEXT_PUBLIC_STANDALONE (set only in the native build's build command,
 * never in the normal `next build` used for the Vercel-hosted web app).
 *
 * A build-time flag rather than a runtime check because the two modes need
 * genuinely different code to exist in the bundle in the first place: the
 * standalone build has no /api/* routes to fall back to (output: 'export'
 * can't generate them), so there's nothing to feature-detect against at
 * runtime.
 */
export function isStandalone(): boolean {
  return process.env.NEXT_PUBLIC_STANDALONE === "true";
}
