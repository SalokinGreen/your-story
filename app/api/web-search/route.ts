/**
 * Web Search API - thin proxy to Brave Search
 *
 * BYOK only, same pattern as /api/generate: the caller supplies their own
 * Brave Search API key (from Settings > API Keys), this route just forwards
 * the query and returns a trimmed result list. Used exclusively by the GM's
 * optional `delegate_task` (task_type: "web_research") - see
 * app/misc/subagentExecutor.ts.
 *
 * The actual logic lives in app/misc/webSearchCall.ts, shared with the
 * standalone (Tauri/Capacitor) build's direct-to-provider path - see
 * app/misc/webSearchFetch.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { runWebSearchQuery, WebSearchRequestBody } from "@/app/misc/webSearchCall";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body: WebSearchRequestBody = await req.json();
    const result = await runWebSearchQuery(body);

    if ("error" in result) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status },
      );
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[API Web Search] Error:", message);
    return NextResponse.json({ error: message || "Internal server error" }, { status: 500 });
  }
}
