/**
 * Single Stage Generator API (Streaming)
 *
 * Generates ONE stage of an adventure at a time, to work within Vercel's
 * timeout limits (heartbeats + partial-content recovery). The client
 * orchestrates calling this endpoint for each stage sequentially.
 *
 * The actual generation logic lives in app/misc/generateStageCall.ts,
 * shared with the standalone (Tauri/Capacitor) build's direct-to-provider
 * path - see app/misc/creatorFetch.ts.
 */

import { NextRequest } from "next/server";
import {
  generateStageStream,
  GenerateStageRequestBody,
} from "@/app/misc/generateStageCall";

export const runtime = "nodejs";
// Set to 300s (5 min) which is the max for Hobby tier
// Pro tier can extend to 800s by changing this value
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body: GenerateStageRequestBody = await req.json();
  const stream = generateStageStream(body);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
