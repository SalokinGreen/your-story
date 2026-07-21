/**
 * Shared TTS (text-to-speech) call logic behind /api/tts/generate - see
 * providerCall.ts for why this is split out (same code runs server-side for
 * the Vercel-hosted web build and client-side for the standalone
 * Tauri/Capacitor build, via ttsFetch.ts).
 */

import { TTSModelKey } from "@/app/misc/ai_prices";
import { getProviderFetch } from "@/app/misc/platformFetch";

// DeepInfra TTS endpoints
const KOKORO_ENDPOINT = "https://api.deepinfra.com/v1/inference/hexgrad/Kokoro-82M";
const ORPHEUS_ENDPOINT =
  "https://api.deepinfra.com/v1/inference/canopylabs/orpheus-3b-0.1-ft";

// Kokoro voices (multi-language support)
export const KOKORO_VOICES = {
  af_heart: "Heart (American Female)",
  af_bella: "Bella (American Female)",
  af_nicole: "Nicole (American Female)",
  af_sarah: "Sarah (American Female)",
  af_sky: "Sky (American Female)",
  am_adam: "Adam (American Male)",
  am_michael: "Michael (American Male)",
  am_fenrir: "Fenrir (American Male)",
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

const MAX_TEXT_LENGTH = 10000;

export interface TTSRequestBody {
  text: string;
  voiceId?: string;
  model?: TTSModelKey;
  deepinfraKey?: string;
}

export interface TTSSuccess {
  audioBuffer: ArrayBuffer;
  chunksGenerated: number;
  model: TTSModelKey;
}

export interface TTSError {
  error: string;
  status: number;
}

// Split text into chunks at sentence boundaries
function splitTextIntoChunks(text: string, maxChunkSize: number): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxChunkSize) {
      chunks.push(remaining);
      break;
    }

    let breakPoint = maxChunkSize;
    const searchArea = remaining.substring(0, maxChunkSize);

    const lastPeriod = Math.max(
      searchArea.lastIndexOf(". "),
      searchArea.lastIndexOf(".\n"),
      searchArea.lastIndexOf("! "),
      searchArea.lastIndexOf("!\n"),
      searchArea.lastIndexOf("? "),
      searchArea.lastIndexOf("?\n"),
    );

    if (lastPeriod > maxChunkSize / 3) {
      breakPoint = lastPeriod + 1;
    } else {
      const lastNewline = searchArea.lastIndexOf("\n\n");
      if (lastNewline > maxChunkSize / 3) {
        breakPoint = lastNewline + 2;
      } else {
        const lastSingleNewline = searchArea.lastIndexOf("\n");
        if (lastSingleNewline > maxChunkSize / 3) {
          breakPoint = lastSingleNewline + 1;
        } else {
          const lastSpace = searchArea.lastIndexOf(" ");
          if (lastSpace > maxChunkSize / 3) {
            breakPoint = lastSpace + 1;
          }
        }
      }
    }

    chunks.push(remaining.substring(0, breakPoint).trim());
    remaining = remaining.substring(breakPoint).trim();
  }

  return chunks.filter((chunk) => chunk.length > 0);
}

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

// atob/btoa-based decode rather than Node's Buffer, so this runs unmodified
// in the browser (standalone build) as well as on the server (web build).
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function generateTTSAudio(
  body: TTSRequestBody,
): Promise<TTSSuccess | TTSError> {
  const { text, voiceId = "af_heart", model = "kokoro", deepinfraKey } = body;

  if (!deepinfraKey || typeof deepinfraKey !== "string") {
    return {
      error: "DeepInfra API key is required. Please add your own key in Settings.",
      status: 400,
    };
  }

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return { error: "Text content is required", status: 400 };
  }

  const ttsModel: TTSModelKey = model === "orpheus" ? "orpheus" : "kokoro";
  const isOrpheus = ttsModel === "orpheus";

  let finalVoiceId = voiceId;
  if (isOrpheus) {
    const validOrpheusVoices = Object.keys(ORPHEUS_VOICES);
    if (!validOrpheusVoices.includes(voiceId)) {
      finalVoiceId = "tara";
    }
  } else {
    const validKokoroVoices = Object.keys(KOKORO_VOICES);
    if (!validKokoroVoices.includes(voiceId) && !voiceId.match(/^[a-z]{2}_[a-z]+$/)) {
      finalVoiceId = "af_heart";
    }
  }

  const truncatedText = text.slice(0, MAX_TEXT_LENGTH);

  const cleanText = truncatedText
    .replace(/[#*_~`]/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\|\|.*?\|\|/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[<>{}[\]]/g, "")
    .trim();

  if (cleanText.length === 0) {
    return { error: "Text is empty after cleaning", status: 400 };
  }

  const chunkSize = isOrpheus ? 300 : 1500;
  const chunks = splitTextIntoChunks(cleanText, chunkSize);
  const endpoint = isOrpheus ? ORPHEUS_ENDPOINT : KOKORO_ENDPOINT;
  const providerFetch = getProviderFetch();

  const chunkPromises = chunks.map(async (chunk, i) => {
    try {
      const requestBody: Record<string, unknown> = isOrpheus
        ? { input: chunk, voice: finalVoiceId, response_format: "mp3", max_tokens: 3000 }
        : { text: chunk, preset: finalVoiceId, output_format: "mp3" };

      const response = await providerFetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${deepinfraKey}`,
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
        if (response.status === 429) throw new Error("RATE_LIMIT");
        if (response.status === 401 || response.status === 403) throw new Error("AUTH_FAILED");
        throw new Error(`DeepInfra API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      if (data.audio) {
        let base64Data = data.audio;
        if (base64Data.startsWith("data:")) {
          base64Data = base64Data.split(",")[1];
        }
        return { index: i, buffer: base64ToArrayBuffer(base64Data) };
      }
      console.error(`No audio data for chunk ${i + 1}/${chunks.length}`, {
        output_format: data.output_format,
        inference_status: data.inference_status,
      });
      return { index: i, buffer: null };
    } catch (chunkError: unknown) {
      console.error(`Error processing chunk ${i + 1}:`, chunkError);
      if (chunkError instanceof Error) {
        if (chunkError.message === "RATE_LIMIT" || chunkError.message === "AUTH_FAILED") {
          throw chunkError;
        }
      }
      return { index: i, buffer: null, error: chunkError };
    }
  });

  let results: { index: number; buffer: ArrayBuffer | null; error?: unknown }[];
  try {
    results = await Promise.all(chunkPromises);
  } catch (parallelError: unknown) {
    if (parallelError instanceof Error) {
      if (parallelError.message === "RATE_LIMIT") {
        return {
          error: "TTS rate limit reached. Please wait a moment before trying again.",
          status: 429,
        };
      }
      if (parallelError.message === "AUTH_FAILED") {
        return { error: "TTS authentication failed.", status: 403 };
      }
    }
    throw parallelError;
  }

  const audioBuffers: ArrayBuffer[] = results
    .sort((a, b) => a.index - b.index)
    .filter((r) => r.buffer !== null)
    .map((r) => r.buffer as ArrayBuffer);

  if (audioBuffers.length === 0) {
    return { error: "No audio generated", status: 500 };
  }

  return {
    audioBuffer: concatenateAudioBuffers(audioBuffers),
    chunksGenerated: chunks.length,
    model: ttsModel,
  };
}
