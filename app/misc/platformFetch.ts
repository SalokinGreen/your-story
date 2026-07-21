/**
 * Seam for the HTTP call providerCall.ts makes directly to an AI provider
 * (only relevant in the standalone build - see providerFetch.ts/standalone.ts).
 * A browser's `fetch` is subject to CORS, so a request straight from a
 * webview to e.g. api.deepseek.com only works if that provider sends the
 * right CORS headers for the request's origin.
 *
 * Tauri ships a native HTTP client (the http plugin) that bypasses the
 * webview's CORS sandbox entirely, unlike the browser's own fetch - this
 * detects it at call time and swaps it in. Falls back to plain `fetch`
 * everywhere else: the ordinary web build (where there's no CORS problem
 * to begin with, see providerFetch.ts), and the Capacitor build, which
 * takes a different route to the same result - capacitor.config.ts sets
 * plugins.CapacitorHttp.enabled, which overrides window.fetch itself on
 * native, so the plain `fetch` fallback is already CORS-free there too.
 */

import { isTauri } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

export function getProviderFetch(): typeof fetch {
  if (isTauri()) {
    return tauriFetch as unknown as typeof fetch;
  }
  return fetch;
}
