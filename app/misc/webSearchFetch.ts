/**
 * Drop-in replacement for fetch("/api/web-search"...) - see providerFetch.ts
 * for the pattern this follows.
 */

import { isStandalone } from "./standalone";
import { runWebSearchQuery, WebSearchRequestBody } from "./webSearchCall";

export async function webSearchFetch(body: WebSearchRequestBody): Promise<Response> {
  if (!isStandalone()) {
    return fetch("/api/web-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  const result = await runWebSearchQuery(body);
  const status = "error" in result ? result.status : 200;
  return new Response(JSON.stringify(result), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
