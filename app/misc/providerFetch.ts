/**
 * Drop-in replacement for `fetch("/api/generate"...)` / `fetch("/api/generate-stream"...)`
 * that works the same in both build targets:
 *
 *  - Web (Vercel): forwards to our own Next.js route exactly as before -
 *    nothing changes here, the route still proxies to the provider server-side.
 *  - Standalone (Tauri/Capacitor, output: 'export'): those routes don't
 *    exist in the build, so this runs the same request-building/parsing
 *    logic (providerCall.ts) locally and wraps the result in a Response
 *    object shaped exactly like what the route would have returned, so
 *    every caller in generation.ts keeps working unmodified (.ok, .json(),
 *    .body.getReader() for the stream, etc).
 */

import { isStandalone } from "./standalone";
import {
  generateNonStreaming,
  generateStream,
  GenerateRequestBody,
} from "./providerCall";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-store, must-revalidate",
  Connection: "keep-alive",
};

export async function providerFetch(
  path: "/api/generate" | "/api/generate-stream",
  body: GenerateRequestBody,
  signal?: AbortSignal,
): Promise<Response> {
  if (!isStandalone()) {
    return fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  }

  if (path === "/api/generate-stream") {
    const stream = generateStream(body);
    return new Response(stream, { headers: SSE_HEADERS });
  }

  const result = await generateNonStreaming(body);
  if ("error" in result) {
    return new Response(JSON.stringify(result), {
      status: result.status,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
