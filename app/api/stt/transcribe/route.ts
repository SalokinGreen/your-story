import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/app/misc/sttCall";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const mistralKey = formData.get("mistralKey") as string | null;

    const result = await transcribeAudio(audioFile, mistralKey);

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("STT transcription error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to transcribe audio" },
      { status: 500 },
    );
  }
}
