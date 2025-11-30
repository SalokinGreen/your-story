import { NextRequest, NextResponse } from "next/server";
import { Speechify } from "@speechify/api-sdk";
import { deductTokens, getUserTokenBalance } from "@/app/misc/tokens";
import { createClient } from "@supabase/supabase-js";
import { getUserSettings } from "@/app/misc/user_settings";
import { calculateTTSCost } from "@/app/misc/ai_prices";

const SPEECHIFY_API_KEY = process.env.SPEECHIFY_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Speechify Speech endpoint has 2000 char limit
const CHUNK_SIZE = 1800; // Leave some buffer for safety

// Split text into chunks at sentence boundaries
function splitTextIntoChunks(text: string, maxChunkSize: number): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxChunkSize) {
      chunks.push(remaining);
      break;
    }

    // Find a good break point (end of sentence) within the limit
    let breakPoint = maxChunkSize;
    
    // Try to find sentence endings (.!?) followed by space or newline
    const searchArea = remaining.substring(0, maxChunkSize);
    const sentenceEndMatch = searchArea.match(/.*[.!?][\s\n]/);
    
    if (sentenceEndMatch) {
      breakPoint = sentenceEndMatch[0].length;
    } else {
      // Fall back to paragraph break
      const lastNewline = searchArea.lastIndexOf('\n\n');
      if (lastNewline > maxChunkSize / 2) {
        breakPoint = lastNewline + 2;
      } else {
        // Fall back to any newline
        const lastSingleNewline = searchArea.lastIndexOf('\n');
        if (lastSingleNewline > maxChunkSize / 2) {
          breakPoint = lastSingleNewline + 1;
        } else {
          // Fall back to space
          const lastSpace = searchArea.lastIndexOf(' ');
          if (lastSpace > maxChunkSize / 2) {
            breakPoint = lastSpace + 1;
          }
          // Otherwise just cut at maxChunkSize
        }
      }
    }

    chunks.push(remaining.substring(0, breakPoint).trim());
    remaining = remaining.substring(breakPoint).trim();
  }

  return chunks.filter(chunk => chunk.length > 0);
}

// Concatenate MP3 audio buffers
// MP3 files can be concatenated by simply appending the data
function concatenateMP3Buffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const totalLength = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  
  for (const buffer of buffers) {
    result.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }
  
  return result.buffer;
}

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

    const { text, voiceId = "henry", speechifyKey } = await req.json();

    // Validate voice ID - use fallback for invalid IDs
    const validVoices = ["mrbeast", "henry", "snoop", "gwyneth", "cliff", "george"];
    // Custom voice IDs are typically UUIDs, so accept those too
    const isCustomVoice = voiceId && voiceId.length > 20 && voiceId.includes("-");
    const finalVoiceId = validVoices.includes(voiceId) || isCustomVoice ? voiceId : "henry";

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

    // Set a reasonable max total length (20000 chars = ~10 chunks max)
    const MAX_TOTAL_LENGTH = 20000;
    const truncatedText = text.slice(0, MAX_TOTAL_LENGTH);

    // Strip markdown formatting for better speech output
    const cleanText = truncatedText
      .replace(/[#*_~`]/g, "") // Remove markdown symbols
      .replace(/\[(.*?)\]\(.*?\)/g, "$1") // Convert links to just text
      .replace(/\|\|.*?\|\|/g, "") // Remove hidden text (||spoilers||)
      .replace(/\n{3,}/g, "\n\n") // Reduce multiple newlines
      .replace(/[<>{}[\]]/g, "") // Remove brackets that might confuse the API
      .trim();

    // Initialize Speechify client
    const speechify = new Speechify({
      apiKey: apiKeyToUse,
    });

    // Validate text before sending
    if (cleanText.length === 0) {
      return NextResponse.json(
        { error: "Text is empty after cleaning" },
        { status: 400 }
      );
    }

    // Split text into chunks
    const chunks = splitTextIntoChunks(cleanText, CHUNK_SIZE);
    
    // Log what we're sending (for debugging)
    console.log("TTS request:", {
      textLength: cleanText.length,
      chunks: chunks.length,
      voiceId: finalVoiceId,
      originalVoiceId: voiceId !== finalVoiceId ? voiceId : undefined,
      textPreview: cleanText.substring(0, 100) + (cleanText.length > 100 ? "..." : ""),
    });

    // Generate speech for each chunk
    const audioBuffers: ArrayBuffer[] = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      try {
        const response = await speechify.audioGenerate({
          input: chunk,
          voiceId: finalVoiceId,
          audioFormat: "mp3",
        });

        if (!response.audioData) {
          console.error(`No audio data for chunk ${i + 1}/${chunks.length}`);
          continue;
        }

        const buffer = await response.audioData.arrayBuffer();
        audioBuffers.push(buffer);
        
        console.log(`TTS chunk ${i + 1}/${chunks.length} complete (${chunk.length} chars)`);
      } catch (speechifyError: any) {
        console.error(`Speechify API error on chunk ${i + 1}:`, speechifyError);

        // Handle specific Speechify errors
        const statusCode = speechifyError.statusCode || 500;
        const errorMessage = speechifyError.message || "Unknown Speechify error";

        // Log full error details for debugging
        console.error("Speechify error details:", {
          statusCode,
          message: errorMessage,
          voiceId: finalVoiceId,
          chunkIndex: i,
          chunkLength: chunk.length,
        });

        if (statusCode === 400) {
          return NextResponse.json(
            {
              error: `Invalid TTS request: ${errorMessage}. Try a different voice or shorter text.`,
            },
            { status: 400 }
          );
        }

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
    }

    // Check if we got any audio
    if (audioBuffers.length === 0) {
      return NextResponse.json(
        { error: "No audio generated" },
        { status: 500 }
      );
    }

    // Concatenate all audio buffers
    const finalAudioBuffer = concatenateMP3Buffers(audioBuffers);

    // Calculate dynamic TTS cost based on character count
    const ttsCost = calculateTTSCost(cleanText.length);

    // Deduct tokens after successful generation IF using tokens
    if (shouldUseTokens) {
      try {
        await deductTokens(userId, ttsCost, supabase);
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

    // Return audio with appropriate headers and balance info
    return new NextResponse(finalAudioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": finalAudioBuffer.byteLength.toString(),
        "Cache-Control": "public, max-age=3600", // Cache for 1 hour
        "X-Token-Cost": shouldUseTokens ? ttsCost.toString() : "0",
        "X-Token-Balance": (newBalance?.total ?? 0).toString(),
        "X-Chunks-Generated": chunks.length.toString(),
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
