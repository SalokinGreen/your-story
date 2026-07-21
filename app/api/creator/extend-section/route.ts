/**
 * Extend Section API (Streaming)
 *
 * Adds more content to a specific section of an already-generated adventure.
 * Returns SSE stream with progress updates and new content that gets merged.
 *
 * The actual generation logic lives in app/misc/extendSectionCall.ts,
 * shared with the standalone (Tauri/Capacitor) build's direct-to-provider
 * path - see app/misc/creatorFetch.ts.
 */

import { NextRequest } from "next/server";
import {
  generateExtendSectionStream,
  ExtendSectionRequestBody,
} from "@/app/misc/extendSectionCall";

export const runtime = "nodejs";
export const maxDuration = 120; // 2 minutes max for single section

export async function POST(req: NextRequest) {
  const body: ExtendSectionRequestBody = await req.json();
  const stream = generateExtendSectionStream(body);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
