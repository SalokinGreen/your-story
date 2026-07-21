/**
 * Generic AI Generation API
 *
 * A thin, stateless AI proxy endpoint. Receives pre-built messages and config,
 * forwards to AI provider, returns raw response. All context building and
 * tool execution happens on the frontend.
 *
 * BYOK only: users always provide their own API key for whichever provider
 * they select (OpenRouter, DeepSeek, Google, Mistral, DeepInfra).
 *
 * Request: { messages, tools?, model, maxTokens, openRouterKey?, deepseekKey?,
 *            googleKey?, mistralKey?, deepinfraKey?, customModel? }
 * Response: { content, toolCalls?, meta }
 *
 * The actual request-building/response-parsing logic lives in
 * app/misc/providerCall.ts, shared with the standalone (Tauri/Capacitor)
 * build's direct-to-provider path - see app/misc/providerFetch.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  generateNonStreaming,
  GenerateRequestBody,
} from "@/app/misc/providerCall";

export const runtime = "nodejs";
export const maxDuration = 60; // Allow up to 60 seconds for generation

export async function POST(req: NextRequest) {
  let body: GenerateRequestBody;
  try {
    body = await req.json();
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Invalid JSON" },
      { status: 400 },
    );
  }

  const result = await generateNonStreaming(body);

  if ("error" in result) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status },
    );
  }

  return NextResponse.json(result);
}
