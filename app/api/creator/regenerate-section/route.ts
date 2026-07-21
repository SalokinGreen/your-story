/**
 * Regenerate Section API (Streaming)
 *
 * Regenerates a specific section of an already-generated adventure.
 * Returns SSE stream with progress updates and regenerated content.
 *
 * The actual generation logic lives in app/misc/regenerateSectionCall.ts,
 * shared with the standalone (Tauri/Capacitor) build's direct-to-provider
 * path - see app/misc/creatorFetch.ts.
 */

import { NextRequest } from "next/server";
import {
  generateRegenerateSectionStream,
  RegenerateSectionRequestBody,
} from "@/app/misc/regenerateSectionCall";

export const runtime = "nodejs";
export const maxDuration = 120; // 2 minutes max for single section

export async function POST(req: NextRequest) {
  const body: RegenerateSectionRequestBody = await req.json();
  const stream = generateRegenerateSectionStream(body);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
