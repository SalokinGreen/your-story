import { NextRequest, NextResponse } from "next/server";
import { deductTokens, getUserTokenBalance } from "@/app/misc/tokens";
import { createClient } from "@supabase/supabase-js";

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// STT costs 2 tokens flat rate
const STT_TOKEN_COST = 2;

export async function POST(req: NextRequest) {
  try {
    if (!MISTRAL_API_KEY) {
      return NextResponse.json(
        { error: "Mistral API key not configured" },
        { status: 500 }
      );
    }

    // Get the authorization token from the request
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const token = authHeader.split(" ")[1];

    // Create Supabase client with service role for auth check
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
      },
    });

    // Verify the user's token
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: "Invalid authentication token" },
        { status: 401 }
      );
    }

    const userId = user.id;

    // Get form data with audio file
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return NextResponse.json(
        { error: "Audio file is required" },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB to prevent abuse)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (audioFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Audio file too large (max 10MB)" },
        { status: 400 }
      );
    }

    // Check token balance before processing
    const balance = await getUserTokenBalance(userId, supabase);
    if (!balance || balance.total < STT_TOKEN_COST) {
      return NextResponse.json(
        { error: "Insufficient tokens for speech-to-text" },
        { status: 402 }
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
            Authorization: `Bearer ${MISTRAL_API_KEY}`,
          },
          body: mistralFormData,
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Mistral STT API error:", response.status, errorText);

        if (response.status === 401 || response.status === 403) {
          return NextResponse.json(
            { error: "STT authentication failed. Please contact support." },
            { status: response.status }
          );
        }

        if (response.status === 429) {
          return NextResponse.json(
            {
              error:
                "STT rate limit reached. Please wait a moment before trying again.",
            },
            { status: 429 }
          );
        }

        return NextResponse.json(
          { error: `Transcription failed: ${errorText}` },
          { status: response.status }
        );
      }

      transcriptionResult = await response.json();
    } catch (mistralError: any) {
      console.error("Mistral STT API error:", mistralError);
      return NextResponse.json(
        { error: mistralError.message || "Failed to transcribe audio" },
        { status: 500 }
      );
    }

    // Extract transcribed text
    const transcript = transcriptionResult?.text || "";

    if (!transcript) {
      return NextResponse.json(
        { error: "No speech detected in audio" },
        { status: 400 }
      );
    }

    // Deduct tokens after successful transcription
    try {
      await deductTokens(userId, STT_TOKEN_COST, supabase);
    } catch (deductError: any) {
      console.error("Failed to deduct tokens:", deductError);
      // Still return the transcription since it succeeded
    }

    // Get updated balance
    const newBalance = await getUserTokenBalance(userId, supabase);

    return NextResponse.json({
      transcript,
      language: transcriptionResult?.language || "en",
      tokenCost: STT_TOKEN_COST,
      tokenBalance: newBalance?.total ?? 0,
    });
  } catch (error: any) {
    console.error("STT transcription error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to transcribe audio" },
      { status: 500 }
    );
  }
}
