import { NextRequest, NextResponse } from "next/server";
import { Speechify } from "@speechify/api-sdk";
import { deductTokens, getUserTokenBalance } from "@/app/misc/tokens";
import { createClient } from "@supabase/supabase-js";

const SPEECHIFY_API_KEY = process.env.SPEECHIFY_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const TTS_COST = 3; // 3 tokens per TTS generation

export async function POST(req: NextRequest) {
  try {
    if (!SPEECHIFY_API_KEY) {
      return NextResponse.json(
        { error: "Speechify API key not configured" },
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

    // Check if user has enough tokens (pass supabase client for proper access)
    const balance = await getUserTokenBalance(userId, supabase);
    if (!balance || balance.total < TTS_COST) {
      return NextResponse.json(
        {
          error: `Insufficient tokens. You need ${TTS_COST} tokens but only have ${
            balance?.total ?? 0
          }.`,
          requiredTokens: TTS_COST,
          currentBalance: balance?.total ?? 0,
        },
        { status: 402 } // Payment Required
      );
    }

    const { text, voiceId = "mrbeast" } = await req.json();

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json(
        { error: "Text content is required" },
        { status: 400 }
      );
    }

    // Limit text length to prevent abuse (Speechify has rate limits)
    const MAX_TEXT_LENGTH = 5000;
    const truncatedText = text.slice(0, MAX_TEXT_LENGTH);

    // Strip markdown formatting for better speech output
    const cleanText = truncatedText
      .replace(/[#*_~`]/g, "") // Remove markdown symbols
      .replace(/\[(.*?)\]\(.*?\)/g, "$1") // Convert links to just text
      .replace(/\n{3,}/g, "\n\n") // Reduce multiple newlines
      .trim();

    // Initialize Speechify client
    const speechify = new Speechify({
      apiKey: SPEECHIFY_API_KEY,
    });

    // Generate speech using SDK
    const response = await speechify.audioGenerate({
      input: cleanText,
      voiceId: voiceId,
      audioFormat: "mp3",
    });

    // Get the audio data from the response
    if (!response.audioData) {
      console.error("No audio data in response:", response);
      return NextResponse.json(
        { error: "No audio generated" },
        { status: 500 }
      );
    }

    // Deduct tokens after successful generation
    try {
      await deductTokens(userId, TTS_COST, supabase);
    } catch (deductError: any) {
      console.error("Failed to deduct tokens:", deductError);
      // Still return the audio since generation succeeded
      // Log this for manual correction if needed
    }

    // Get updated balance
    const newBalance = await getUserTokenBalance(userId, supabase);

    // Convert Blob to ArrayBuffer for proper response
    const audioBuffer = await response.audioData.arrayBuffer();

    // Return audio with appropriate headers and balance info
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
        "Cache-Control": "public, max-age=3600", // Cache for 1 hour
        "X-Token-Cost": TTS_COST.toString(),
        "X-Token-Balance": (newBalance?.total ?? 0).toString(),
      },
    });
  } catch (error: any) {
    console.error("TTS generation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate speech" },
      { status: 500 }
    );
  }
}
