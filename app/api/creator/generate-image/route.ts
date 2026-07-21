/**
 * AI Image Generation API
 *
 * Generates adventure cover images (thumbnails/banners) using OpenRouter or
 * DeepInfra image models (BYOK only). Returns the generated image URL
 * (base64 data URL or hosted URL).
 *
 * The actual generation logic lives in app/misc/generateImageCall.ts,
 * shared with the standalone (Tauri/Capacitor) build's direct-to-provider
 * path - see app/misc/creatorFetch.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  generateImage,
  GenerateImageRequestBody,
} from "@/app/misc/generateImageCall";

export const runtime = "nodejs";
export const maxDuration = 120; // Allow up to 2 minutes for image generation

export async function POST(req: NextRequest) {
  let body: GenerateImageRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await generateImage(body);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
