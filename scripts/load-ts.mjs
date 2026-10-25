// Loads TypeScript modules from the app through Vite's SSR loader, so a script
// can use the app's own judge code (and its "@/..." imports) without a build.
// Vite is already installed (Vitest depends on it); nothing new is added.
import { createServer } from "vite";
import { REPO_ROOT } from "./eval-lib.mjs";

/** One Vite server for the script; `load("app/...ts")` returns the module, `close()` ends it. */
export async function createTsLoader() {
  // The standalone switch makes providerFetch call the provider in-process,
  // since there is no Next server behind a script.
  process.env.NEXT_PUBLIC_STANDALONE = "true";
  const server = await createServer({
    root: REPO_ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "error",
    resolve: { alias: { "@": REPO_ROOT } },
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  return {
    load: (relativePath) => server.ssrLoadModule("/" + relativePath.replace(/^\/+/, "")),
    close: () => server.close(),
  };
}
