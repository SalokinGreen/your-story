import { NextRequest, NextResponse } from "next/server";
import { generateTTSAudio, TTSRequestBody } from "@/app/misc/ttsCall";

export async function POST(req: NextRequest) {
  try {
    const body: TTSRequestBody = await req.json();
    const result = await generateTTSAudio(body);

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return new NextResponse(result.audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": result.audioBuffer.byteLength.toString(),
        "Cache-Control": "public, max-age=3600",
        "X-Chunks-Generated": result.chunksGenerated.toString(),
        "X-TTS-Model": result.model,
      },
    });
  } catch (error: unknown) {
    console.error("TTS generation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to generate speech";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
