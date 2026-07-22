/**
 * Shared logic behind /api/web-search - see providerCall.ts for why this is
 * split out (same code runs server-side for the Vercel web build and
 * client-side for the standalone Tauri/Capacitor build, via
 * webSearchFetch.ts).
 *
 * BYOK-only thin proxy to Brave Search, used exclusively by the GM's
 * optional delegate_task (task_type: "web_research") - see subagentExecutor.ts.
 */

import { logger } from "@/app/misc/logger";
import { getProviderFetch } from "@/app/misc/platformFetch";

export interface WebSearchRequestBody {
  query: string;
  searchApiKey: string;
}

export interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
}

export interface WebSearchSuccess {
  results: BraveSearchResult[];
}

export interface WebSearchError {
  error: string;
  status: number;
  code?: string;
}

export async function runWebSearchQuery(
  body: WebSearchRequestBody,
): Promise<WebSearchSuccess | WebSearchError> {
  const { query, searchApiKey } = body;

  if (!query || !query.trim()) {
    return { error: "Query is required", status: 400 };
  }

  if (!searchApiKey) {
    return {
      error: "No Brave Search API key configured. Add one in Settings > API Keys.",
      status: 400,
      code: "NO_API_KEY",
    };
  }

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "5");

  const providerFetch = getProviderFetch();
  const response = await providerFetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": searchApiKey,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error("Brave Search API error", { status: response.status, errorText });
    return {
      error: `Web search failed: ${response.status} ${response.statusText}`,
      status: response.status,
    };
  }

  const data = await response.json();
  const results: BraveSearchResult[] = (data.web?.results || []).map(
    (r: { title?: string; url?: string; description?: string }) => ({
      title: r.title || "",
      url: r.url || "",
      description: r.description || "",
    }),
  );

  logger.action("Web search complete", { query, resultCount: results.length });

  return { results };
}
