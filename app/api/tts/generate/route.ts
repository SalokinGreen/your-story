import { NextRequest, NextResponse } from "next/server";
import { Speechify } from "@speechify/api-sdk";
import { deductTokens, getUserTokenBalance } from "@/app/misc/tokens";
import { createClient } from "@supabase/supabase-js";
import { getUserSettings } from "@/app/misc/user_settings";

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

    const { text, voiceId = "mrbeast", speechifyKey } = await req.json();

    // Check user settings for BYOK
    const userSettings = await getUserSettings(userId, supabase);
    const isSubscriber = userSettings?.is_subscriber || false;
    const byokEnabled = userSettings?.byok_enabled || false;

    // Determine if we should use tokens
    let shouldUseTokens = true;
    let apiKeyToUse = SPEECHIFY_API_KEY;

    if (isSubscriber && byokEnabled && speechifyKey) {
      shouldUseTokens = false;
      apiKeyToUse = speechifyKey;
      console.log(`User ${userId} using BYOK (Speechify)`);
    }

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
      apiKey: apiKeyToUse,
    });

    // Generate speech using SDK
    let response;
    try {
      response = await speechify.audioGenerate({
        input: cleanText,
        voiceId: voiceId,
        audioFormat: "mp3",
      });
    } catch (speechifyError: any) {
      console.error("Speechify API error:", speechifyError);

      // Handle specific Speechify errors
      const statusCode = speechifyError.statusCode || 500;

      if (statusCode === 503) {
        return NextResponse.json(
          {
            error:
              "Speechify service is temporarily unavailable. Please try again in a few moments.",
          },
          { status: 503 }
        );
      }

      if (statusCode === 429) {
        return NextResponse.json(
          {
            error:
              "TTS rate limit reached. Please wait a moment before trying again.",
          },
          { status: 429 }
        );
      }

      if (statusCode === 401 || statusCode === 403) {
        return NextResponse.json(
          { error: "TTS authentication failed. Please check your API key." },
          { status: statusCode }
        );
      }

      return NextResponse.json(
        { error: speechifyError.message || "Failed to generate speech" },
        { status: statusCode }
      );
    }

    // Get the audio data from the response
    if (!response.audioData) {
      console.error("No audio data in response:", response);
      return NextResponse.json(
        { error: "No audio generated" },
        { status: 500 }
      );
    }

    // Deduct tokens after successful generation IF using tokens
    if (shouldUseTokens) {
      try {
        await deductTokens(userId, TTS_COST, supabase);
      } catch (deductError: any) {
        console.error("Failed to deduct tokens:", deductError);
        // Still return the audio since generation succeeded
        // Log this for manual correction if needed
      }
    } else {
      console.log(`BYOK used, no tokens deducted for user ${userId}`);
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
        "X-Token-Cost": shouldUseTokens ? TTS_COST.toString() : "0",
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
