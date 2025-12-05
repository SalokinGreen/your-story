import { NextRequest, NextResponse } from "next/server";
import { deductTokens, getUserTokenBalance } from "@/app/misc/tokens";
import { createClient } from "@supabase/supabase-js";
import { calculateTTSCost, TTSModelKey } from "@/app/misc/ai_prices";

const DEEPINFRA_API_KEY = process.env.DEEPINFRA_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// DeepInfra TTS endpoints
const KOKORO_ENDPOINT =
  "https://api.deepinfra.com/v1/inference/hexgrad/Kokoro-82M";
const ORPHEUS_ENDPOINT =
  "https://api.deepinfra.com/v1/inference/canopylabs/orpheus-3b-0.1-ft";

// Kokoro voices (multi-language support)
export const KOKORO_VOICES = {
  // American English Female
  af_heart: "Heart (American Female)",
  af_bella: "Bella (American Female)",
  af_nicole: "Nicole (American Female)",
  af_sarah: "Sarah (American Female)",
  af_sky: "Sky (American Female)",
  // American English Male
  am_adam: "Adam (American Male)",
  am_michael: "Michael (American Male)",
  am_fenrir: "Fenrir (American Male)",
  // British English
  bf_emma: "Emma (British Female)",
  bf_isabella: "Isabella (British Female)",
  bm_george: "George (British Male)",
  bm_daniel: "Daniel (British Male)",
} as const;

// Orpheus voices
export const ORPHEUS_VOICES = {
  tara: "Tara",
  leah: "Leah",
  jess: "Jess",
  mia: "Mia",
  zoe: "Zoe",
  leo: "Leo",
  dan: "Dan",
  zac: "Zac",
} as const;

// Maximum text length per request
const MAX_TEXT_LENGTH = 10000;

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

    // Try to find the last sentence ending (.!?) within the chunk limit
    const searchArea = remaining.substring(0, maxChunkSize);

    // Find the last sentence-ending punctuation followed by space/newline or at end
    const lastPeriod = Math.max(
      searchArea.lastIndexOf(". "),
      searchArea.lastIndexOf(".\n"),
      searchArea.lastIndexOf("! "),
      searchArea.lastIndexOf("!\n"),
      searchArea.lastIndexOf("? "),
      searchArea.lastIndexOf("?\n")
    );

    if (lastPeriod > maxChunkSize / 3) {
      // Include the punctuation, exclude the space/newline
      breakPoint = lastPeriod + 1;
    } else {
      // Fall back to paragraph break
      const lastNewline = searchArea.lastIndexOf("\n\n");
      if (lastNewline > maxChunkSize / 3) {
        breakPoint = lastNewline + 2;
      } else {
        // Fall back to any newline
        const lastSingleNewline = searchArea.lastIndexOf("\n");
        if (lastSingleNewline > maxChunkSize / 3) {
          breakPoint = lastSingleNewline + 1;
        } else {
          // Fall back to space
          const lastSpace = searchArea.lastIndexOf(" ");
          if (lastSpace > maxChunkSize / 3) {
            breakPoint = lastSpace + 1;
          }
          // Otherwise just cut at maxChunkSize
        }
      }
    }

    chunks.push(remaining.substring(0, breakPoint).trim());
    remaining = remaining.substring(breakPoint).trim();
  }

  return chunks.filter((chunk) => chunk.length > 0);
}

// Concatenate audio buffers
// Note: For WAV files with multiple chunks, we'd need to merge headers properly
// But since most TTS requests fit in one chunk, simple concatenation works
function concatenateAudioBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  if (buffers.length === 0) return new ArrayBuffer(0);
  if (buffers.length === 1) return buffers[0];

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
    if (!DEEPINFRA_API_KEY) {
      return NextResponse.json(
        { error: "DeepInfra API key not configured" },
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

    const {
      text,
      voiceId = "af_heart",
      model = "kokoro" as TTSModelKey,
    } = await req.json();

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json(
        { error: "Text content is required" },
        { status: 400 }
      );
    }

    // Validate model
    const ttsModel: TTSModelKey = model === "orpheus" ? "orpheus" : "kokoro";
    const isOrpheus = ttsModel === "orpheus";

    // Validate voice ID based on model
    let finalVoiceId = voiceId;
    if (isOrpheus) {
      const validOrpheusVoices = Object.keys(ORPHEUS_VOICES);
      if (!validOrpheusVoices.includes(voiceId)) {
        finalVoiceId = "tara"; // Default Orpheus voice
      }
    } else {
      const validKokoroVoices = Object.keys(KOKORO_VOICES);
      // Also allow custom voice IDs (for advanced users)
      if (
        !validKokoroVoices.includes(voiceId) &&
        !voiceId.match(/^[a-z]{2}_[a-z]+$/)
      ) {
        finalVoiceId = "af_heart"; // Default Kokoro voice
      }
    }

    // Truncate text if too long
    const truncatedText = text.slice(0, MAX_TEXT_LENGTH);

    // Strip markdown formatting for better speech output
    const cleanText = truncatedText
      .replace(/[#*_~`]/g, "") // Remove markdown symbols
      .replace(/\[(.*?)\]\(.*?\)/g, "$1") // Convert links to just text
      .replace(/\|\|.*?\|\|/g, "") // Remove hidden text (||spoilers||)
      .replace(/\n{3,}/g, "\n\n") // Reduce multiple newlines
      .replace(/[<>{}[\]]/g, "") // Remove brackets that might confuse the API
      .trim();

    if (cleanText.length === 0) {
      return NextResponse.json(
        { error: "Text is empty after cleaning" },
        { status: 400 }
      );
    }

    // Choose chunk size based on model
    // Orpheus truncates long text internally - use smaller chunks (~300 chars)
    // Kokoro handles longer text well
    const chunkSize = isOrpheus ? 300 : 1500;
    const chunks = splitTextIntoChunks(cleanText, chunkSize);

    console.log("TTS request:", {
      textLength: cleanText.length,
      chunks: chunks.length,
      voiceId: finalVoiceId,
      model: ttsModel,
      textPreview:
        cleanText.substring(0, 100) + (cleanText.length > 100 ? "..." : ""),
    });

    // Generate speech for each chunk in parallel
    const endpoint = isOrpheus ? ORPHEUS_ENDPOINT : KOKORO_ENDPOINT;

    // Process chunks in parallel for faster generation
    const chunkPromises = chunks.map(async (chunk, i) => {
      try {
        // Build request body based on model
        // Orpheus: uses "response_format", "max_tokens" (default 2000, max 4096)
        // Kokoro: uses "output_format"
        const requestBody: Record<string, unknown> = isOrpheus
          ? {
              input: chunk,
              voice: finalVoiceId,
              response_format: "mp3",
              max_tokens: 3000,
            }
          : {
              text: chunk,
              preset: finalVoiceId,
              output_format: "mp3",
            };

        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${DEEPINFRA_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`DeepInfra TTS error on chunk ${i + 1}:`, {
            status: response.status,
            error: errorText,
          });

          if (response.status === 429) {
            throw new Error("RATE_LIMIT");
          }

          if (response.status === 401 || response.status === 403) {
            throw new Error("AUTH_FAILED");
          }

          throw new Error(
            `DeepInfra API error: ${response.status} - ${errorText}`
          );
        }

        const data = await response.json();

        // Log the actual response to debug format issues
        console.log(`TTS API response for chunk ${i + 1}:`, {
          hasAudio: !!data.audio,
          audioLength: data.audio?.length,
          output_format: data.output_format,
        });

        // DeepInfra returns audio as a data URL (data:audio/mp3;base64,...)
        if (data.audio) {
          // Strip the data URL prefix if present
          let base64Data = data.audio;
          if (base64Data.startsWith("data:")) {
            base64Data = base64Data.split(",")[1];
          }

          const audioBuffer = Buffer.from(base64Data, "base64");

          console.log(
            `TTS chunk ${i + 1}/${chunks.length} complete (${
              chunk.length
            } chars, size: ${audioBuffer.byteLength})`
          );

          return {
            index: i,
            buffer: audioBuffer.buffer.slice(
              audioBuffer.byteOffset,
              audioBuffer.byteOffset + audioBuffer.byteLength
            ),
          };
        } else {
          console.error(`No audio data for chunk ${i + 1}/${chunks.length}`, {
            output_format: data.output_format,
            inference_status: data.inference_status,
          });
          return { index: i, buffer: null };
        }
      } catch (chunkError: unknown) {
        console.error(`Error processing chunk ${i + 1}:`, chunkError);
        // Re-throw rate limit and auth errors to stop all processing
        if (chunkError instanceof Error) {
          if (chunkError.message === "RATE_LIMIT" || chunkError.message === "AUTH_FAILED") {
            throw chunkError;
          }
        }
        return { index: i, buffer: null, error: chunkError };
      }
    });

    // Wait for all chunks to complete
    let results: { index: number; buffer: ArrayBuffer | null; error?: unknown }[];
    try {
      results = await Promise.all(chunkPromises);
    } catch (parallelError: unknown) {
      if (parallelError instanceof Error) {
        if (parallelError.message === "RATE_LIMIT") {
          return NextResponse.json(
            {
              error:
                "TTS rate limit reached. Please wait a moment before trying again.",
            },
            { status: 429 }
          );
        }
        if (parallelError.message === "AUTH_FAILED") {
          return NextResponse.json(
            { error: "TTS authentication failed." },
            { status: 403 }
          );
        }
      }
      throw parallelError;
    }

    // Sort results by index and extract buffers (maintaining order)
    const audioBuffers: ArrayBuffer[] = results
      .sort((a, b) => a.index - b.index)
      .filter((r) => r.buffer !== null)
      .map((r) => r.buffer as ArrayBuffer);

    // Check if we got any audio
    if (audioBuffers.length === 0) {
      return NextResponse.json(
        { error: "No audio generated" },
        { status: 500 }
      );
    }

    // Concatenate all audio buffers
    const finalAudioBuffer = concatenateAudioBuffers(audioBuffers);

    // Calculate dynamic TTS cost based on character count and model
    const ttsCost = calculateTTSCost(cleanText.length, ttsModel);

    // Deduct tokens after successful generation
    try {
      await deductTokens(userId, ttsCost, supabase);
    } catch (deductError: unknown) {
      console.error("Failed to deduct tokens:", deductError);
      // Still return the audio since generation succeeded
    }

    // Get updated balance
    const newBalance = await getUserTokenBalance(userId, supabase);

    // Return audio with appropriate headers and balance info
    return new NextResponse(finalAudioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": finalAudioBuffer.byteLength.toString(),
        "Cache-Control": "public, max-age=3600",
        "X-Token-Cost": ttsCost.toString(),
        "X-Token-Balance": (newBalance?.total ?? 0).toString(),
        "X-Chunks-Generated": chunks.length.toString(),
        "X-TTS-Model": ttsModel,
      },
    });
  } catch (error: unknown) {
    console.error("TTS generation error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to generate speech";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
