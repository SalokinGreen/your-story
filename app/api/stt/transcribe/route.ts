import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    // Get form data with audio file and the user's own Mistral key
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const mistralKey = formData.get("mistralKey") as string | null;

    if (!mistralKey) {
      return NextResponse.json(
        {
          error:
            "Mistral API key is required. Please add your own key in Settings.",
        },
        { status: 400 },
      );
    }

    if (!audioFile) {
      return NextResponse.json(
        { error: "Audio file is required" },
        { status: 400 },
      );
    }

    // Validate file size (max 10MB to prevent abuse)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (audioFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Audio file too large (max 10MB)" },
        { status: 400 },
      );
    }

    // Prepare FormData for Mistral API
    const mistralFormData = new FormData();
    mistralFormData.append("file", audioFile);
    mistralFormData.append("model", "voxtral-mini-latest");

    // Call Mistral Audio Transcription API
    let transcriptionResult;
    try {
      const response = await fetch(
        "https://api.mistral.ai/v1/audio/transcriptions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${mistralKey}`,
          },
          body: mistralFormData,
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Mistral STT API error:", response.status, errorText);

        if (response.status === 401 || response.status === 403) {
          return NextResponse.json(
            { error: "STT authentication failed. Please contact support." },
            { status: response.status },
          );
        }

        if (response.status === 429) {
          return NextResponse.json(
            {
              error:
                "STT rate limit reached. Please wait a moment before trying again.",
            },
            { status: 429 },
          );
        }

        return NextResponse.json(
          { error: `Transcription failed: ${errorText}` },
          { status: response.status },
        );
      }

      transcriptionResult = await response.json();
    } catch (mistralError: any) {
      console.error("Mistral STT API error:", mistralError);
      return NextResponse.json(
        { error: mistralError.message || "Failed to transcribe audio" },
        { status: 500 },
      );
    }

    // Extract transcribed text
    const transcript = transcriptionResult?.text || "";

    if (!transcript) {
      return NextResponse.json(
        { error: "No speech detected in audio" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      transcript,
      language: transcriptionResult?.language || "en",
    });
  } catch (error: any) {
    console.error("STT transcription error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to transcribe audio" },
      { status: 500 },
    );
  }
}
