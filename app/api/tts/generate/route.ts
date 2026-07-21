import { NextRequest, NextResponse } from "next/server";
import { generateTTSAudioStream, TTSRequestBody } from "@/app/misc/ttsCall";

export async function POST(req: NextRequest) {
  try {
    const body: TTSRequestBody = await req.json();
    const result = await generateTTSAudioStream(body);

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return new NextResponse(result.stream, {
      status: 200,
      headers: {
        // Framed chunk stream, not raw playable audio - see frameChunk() in
        // ttsCall.ts and the client-side reader in TTSControls.tsx.
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-store",
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
