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
import { Capacitor, CapacitorHttp } from "@capacitor/core";

export function getProviderFetch(): typeof fetch {
  if (isTauri()) {
    return tauriFetch as unknown as typeof fetch;
  }
  return fetch;
}

/**
 * Hosts whose CORS answer lets the Android WebView call them itself. The
 * patched window.fetch (CapacitorHttp) ignores an AbortSignal and buffers the
 * whole answer, so Stop cannot cancel it and a stream arrives in one piece.
 * The WebView's own fetch (`window.CapacitorWebFetch`, which Capacitor keeps
 * when it patches window.fetch) does both properly, but only works where the
 * provider answers a preflight for the app's origin. Checked 2026-10-23 as
 * `https://localhost` (Capacitor's default Android origin):
 *   openrouter.ai      204, allows *, Authorization, HTTP-Referer, X-Title
 *   api.mistral.ai     200, allows *, Authorization, Content-Type
 *   api.deepinfra.com  200, allows * and the same four headers
 *   api.deepseek.com   200, reflects https://localhost
 *   generativelanguage.googleapis.com  403, left out
 *   api.z.ai           200 but no Access-Control-Allow-* headers, left out
 * providerCall.ts sends only Content-Type and Authorization, plus HTTP-Referer
 * and X-Title to OpenRouter; a new request header needs a new preflight check.
 */
const CORS_HOSTS = [
  "openrouter.ai",
  "api.mistral.ai",
  "api.deepinfra.com",
  "api.deepseek.com",
];

const downHosts = new Set<string>();

/**
 * A listed host whose WebView request failed with a network error (a
 * TypeError) is taken off the list for the session: its CORS answer has
 * probably changed, and later requests go through native HTTP.
 */
export function markHostDown(host: string): void {
  downHosts.add(host);
}

/** For tests: forget every host marked down. */
export function resetDownHostsForTests(): void {
  downHosts.clear();
}

/** The host of a URL, or "" when it does not parse. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/**
 * The fetch for a chat request to `url`. Tauri and every host off the list
 * get getProviderFetch(). On Android, a listed host gets the WebView's own
 * fetch, which streams and honours an AbortSignal (design 3.3). iOS keeps
 * today's transport: its origin and CORS were not tested.
 */
export function getAbortableProviderFetch(url: string): typeof fetch {
  if (isTauri()) return getProviderFetch();
  if (typeof window !== "undefined" && Capacitor.getPlatform() === "android") {
    const host = hostOf(url);
    const webFetch = (window as unknown as { CapacitorWebFetch?: typeof fetch })
      .CapacitorWebFetch;
    if (CORS_HOSTS.includes(host) && !downHosts.has(host) && webFetch) {
      return webFetch.bind(window) as typeof fetch;
    }
  }
  return getProviderFetch();
}

/**
 * The same seam for a request whose answer is binary (the TTS providers'
 * MP3 bytes). On the desktop and the web it is getProviderFetch(). In the
 * Capacitor apps it cannot be: the patched window.fetch asks native HTTP for
 * no response type, so native reads a non-JSON body as a UTF-8 string and the
 * audio arrives mangled. Here the request goes to CapacitorHttp directly with
 * responseType "arraybuffer", which native answers as base64, and the bytes
 * are rebuilt into an ordinary Response. Only POSTs need this: a GET through
 * the patched fetch takes Capacitor's proxy, which keeps the bytes intact.
 */
export function getBinaryProviderFetch(): typeof fetch {
  if (Capacitor.isNativePlatform()) {
    return capacitorBinaryFetch as typeof fetch;
  }
  return getProviderFetch();
}

async function capacitorBinaryFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const headers = Object.fromEntries(new Headers(init.headers).entries());
  const native = await CapacitorHttp.request({
    url,
    method: init.method ?? "GET",
    headers,
    // A JSON body goes as its string; native writes it as is.
    data: typeof init.body === "string" ? init.body : undefined,
    responseType: "arraybuffer",
  });
  const contentType = Object.entries(native.headers ?? {}).find(
    ([name]) => name.toLowerCase() === "content-type",
  )?.[1] ?? "";
  const ok = native.status >= 200 && native.status < 300;
  // Native returns JSON (and any error body) parsed or as text, and only a
  // successful non-JSON body as base64.
  let body: BodyInit | null;
  if (ok && typeof native.data === "string" && !contentType.includes("application/json")) {
    body = base64ToBytes(native.data);
  } else if (typeof native.data === "string") {
    body = native.data;
  } else {
    body = native.data == null ? null : JSON.stringify(native.data);
  }
  return new Response(native.status === 204 ? null : body, {
    status: native.status,
    headers: native.headers,
  });
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
