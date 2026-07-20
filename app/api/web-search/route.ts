/**
 * Web Search API - thin proxy to Brave Search
 *
 * BYOK only, same pattern as /api/generate: the caller supplies their own
 * Brave Search API key (from Settings > API Keys), this route just forwards
 * the query and returns a trimmed result list. Used exclusively by the GM's
 * optional `delegate_task` (task_type: "web_research") - see
 * app/misc/subagentExecutor.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/app/misc/logger";

export const runtime = "nodejs";
export const maxDuration = 30;

interface RequestBody {
  query: string;
  searchApiKey: string;
}

interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json();
    const { query, searchApiKey } = body;

    if (!query || !query.trim()) {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 },
      );
    }

    if (!searchApiKey) {
      return NextResponse.json(
        {
          error:
            "No Brave Search API key configured. Add one in Settings > API Keys.",
          code: "NO_API_KEY",
        },
        { status: 400 },
      );
    }

    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", "5");

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": searchApiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("Brave Search API error", {
        status: response.status,
        errorText,
      });
      return NextResponse.json(
        {
          error: `Web search failed: ${response.status} ${response.statusText}`,
        },
        { status: response.status },
      );
    }

    const data = await response.json();
    const results: BraveSearchResult[] = (data.web?.results || []).map(
      (r: { title?: string; url?: string; description?: string }) => ({
        title: r.title || "",
        url: r.url || "",
        description: r.description || "",
      }),
    );

    logger.action("Web search complete", {
      query,
      resultCount: results.length,
    });

    return NextResponse.json({ results });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[API Web Search] Error:", message);
    logger.error("Web search API error", { error: message });
    return NextResponse.json(
      { error: message || "Internal server error" },
      { status: 500 },
    );
  }
}
