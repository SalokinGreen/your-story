/**
 * Generic AI Generation API (Streaming)
 *
 * A thin, stateless AI proxy endpoint with SSE streaming.
 * Receives pre-built messages and config, forwards to AI provider,
 * streams raw response. All context building and tool execution
 * happens on the frontend.
 *
 * BYOK only: users always provide their own API key for whichever provider
 * they select (OpenRouter, DeepSeek, Google, Mistral, DeepInfra).
 *
 * Request: { messages, tools?, model, maxTokens, openRouterKey?, deepseekKey?,
 *            googleKey?, mistralKey?, deepinfraKey?, customModel? }
 * Response: SSE stream with events: content, tool_calls, done, error
 *
 * The actual request-building/stream-parsing logic lives in
 * app/misc/providerCall.ts, shared with the standalone (Tauri/Capacitor)
 * build's direct-to-provider path - see app/misc/providerFetch.ts.
 */

import { NextRequest } from "next/server";
import {
  generateStream,
  GenerateRequestBody,
} from "@/app/misc/providerCall";

export const runtime = "nodejs";
export const maxDuration = 60; // Allow up to 60 seconds for streaming

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-store, must-revalidate",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no", // Disable nginx buffering
};

export async function POST(req: NextRequest) {
  let body: GenerateRequestBody;
  try {
    body = await req.json();
  } catch (error: any) {
    // Match generateStream's own error-event shape so a malformed request
    // body surfaces the same way to callers as any other stream error,
    // rather than a bare 500 from an uncaught exception.
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", error: error.message || "Invalid JSON" })}\n\n`,
          ),
        );
        controller.close();
      },
    });
    return new Response(stream, { headers: SSE_HEADERS });
  }

  const stream = generateStream(body);
  return new Response(stream, { headers: SSE_HEADERS });
}
