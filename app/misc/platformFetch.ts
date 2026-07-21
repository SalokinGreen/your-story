/**
 * Seam for the HTTP call providerCall.ts makes directly to an AI provider
 * (only relevant in the standalone build - see providerFetch.ts/standalone.ts).
 * A browser's `fetch` is subject to CORS, so a request straight from a
 * webview to e.g. api.deepseek.com only works if that provider sends the
 * right CORS headers for the request's origin.
 *
 * Tauri and Capacitor both ship a native HTTP client that bypasses the
 * browser's fetch sandbox entirely (Tauri's http plugin, Capacitor's
 * CapacitorHttp) - once those shells exist, this is where we detect them
 * and swap in the native call. Until then this is a plain passthrough to
 * `fetch`, so standalone-mode calls work today for any provider that does
 * send CORS headers, and the CORS-sensitive ones get fixed here later
 * without touching providerCall.ts.
 */

export function getProviderFetch(): typeof fetch {
  return fetch;
}
