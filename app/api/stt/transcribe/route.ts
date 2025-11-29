import { NextRequest, NextResponse } from "next/server";
import { createClient as createDeepgramClient } from "@deepgram/sdk";
import { deductTokens, getUserTokenBalance } from "@/app/misc/tokens";
import { createClient } from "@supabase/supabase-js";
import { getUserSettings } from "@/app/misc/user_settings";

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// STT costs 2 tokens flat rate
const STT_TOKEN_COST = 2;

export async function POST(req: NextRequest) {
  try {
    if (!DEEPGRAM_API_KEY) {
      return NextResponse.json(
        { error: "Deepgram API key not configured" },
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
    const deepgramKey = formData.get("deepgramKey") as string | null;

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

    // Check user settings for BYOK
    const userSettings = await getUserSettings(userId, supabase);
    const isSubscriber = userSettings?.is_subscriber || false;
    const byokEnabled = userSettings?.byok_enabled || false;

    // Determine if we should use tokens
    let shouldUseTokens = true;
    let apiKeyToUse = DEEPGRAM_API_KEY;

    if (isSubscriber && byokEnabled && deepgramKey) {
      shouldUseTokens = false;
      apiKeyToUse = deepgramKey;
      console.log(`User ${userId} using BYOK (Deepgram)`);
    }

    // Check token balance before processing (if using tokens)
    if (shouldUseTokens) {
      const balance = await getUserTokenBalance(userId, supabase);
      if (!balance || balance.total < STT_TOKEN_COST) {
        return NextResponse.json(
          { error: "Insufficient tokens for speech-to-text" },
          { status: 402 }
        );
      }
    }

    // Convert File to ArrayBuffer for Deepgram
    const audioBuffer = await audioFile.arrayBuffer();

    // Initialize Deepgram client
    const deepgram = createDeepgramClient(apiKeyToUse);

    // Transcribe audio using Deepgram Nova-2
    let transcription;
    try {
      const { result, error } =
        await deepgram.listen.prerecorded.transcribeFile(
          Buffer.from(audioBuffer),
          {
            model: "nova-2",
            smart_format: true,
            punctuate: true,
            detect_language: true,
          }
        );

      if (error) {
        throw error;
      }

      transcription = result;
    } catch (deepgramError: any) {
      console.error("Deepgram API error:", deepgramError);

      // Handle specific Deepgram errors
      if (deepgramError.status === 401 || deepgramError.status === 403) {
        return NextResponse.json(
          { error: "STT authentication failed. Please check your API key." },
          { status: deepgramError.status }
        );
      }

      if (deepgramError.status === 429) {
        return NextResponse.json(
          {
            error:
              "STT rate limit reached. Please wait a moment before trying again.",
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: deepgramError.message || "Failed to transcribe audio" },
        { status: deepgramError.status || 500 }
      );
    }

    // Extract transcribed text
    const transcript =
      transcription?.results?.channels?.[0]?.alternatives?.[0]?.transcript ||
      "";

    if (!transcript) {
      return NextResponse.json(
        { error: "No speech detected in audio" },
        { status: 400 }
      );
    }

    // Deduct tokens after successful transcription IF using tokens
    if (shouldUseTokens) {
      try {
        await deductTokens(userId, STT_TOKEN_COST, supabase);
      } catch (deductError: any) {
        console.error("Failed to deduct tokens:", deductError);
        // Still return the transcription since it succeeded
        // Log this for manual correction if needed
      }
    } else {
      console.log(`BYOK used, no tokens deducted for user ${userId}`);
    }

    // Get updated balance
    const newBalance = await getUserTokenBalance(userId, supabase);

    // Get detected language if available
    const detectedLanguage =
      transcription?.results?.channels?.[0]?.detected_language || "en";

    return NextResponse.json({
      transcript,
      language: detectedLanguage,
      tokenCost: shouldUseTokens ? STT_TOKEN_COST : 0,
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
