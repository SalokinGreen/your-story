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

// Cartesia TTS endpoint - see https://docs.cartesia.ai/api-reference/tts/bytes
const CARTESIA_ENDPOINT = "https://api.cartesia.ai/tts/bytes";
const CARTESIA_VERSION = "2025-11-04";

// ElevenLabs TTS endpoint - see
// https://elevenlabs.io/docs/api-reference/text-to-speech/convert
const ELEVENLABS_ENDPOINT_BASE = "https://api.elevenlabs.io/v1/text-to-speech";

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

// A couple of well-known Cartesia library voice IDs as convenience defaults -
// Cartesia's voice library is large and UUID-keyed, so most users will pick
// their own from https://play.cartesia.ai and add it as a custom voice.
export const CARTESIA_VOICES = {
  "a0e99841-438c-4a64-b679-ae501e7d6091": "Barbershop Man",
  "156fb8d2-335b-4950-9cb3-a2d33befec77": "Helpful Woman",
} as const;

// A couple of well-known ElevenLabs premade voice IDs as convenience defaults
// - full library at https://elevenlabs.io/app/voice-library, add more as
// custom voices.
export const ELEVENLABS_VOICES = {
  "21m00Tcm4TlvDq8ikWAM": "Rachel (Female)",
  EXAVITQu4vr4xnSDxMaL: "Bella (Female)",
  ErXwobaYiN019PkySvjV: "Antoni (Male)",
} as const;

const MAX_TEXT_LENGTH = 10000;

// Strips emoji and other pictographic/symbol characters that TTS providers
// tend to either mispronounce (reading out Unicode names) or choke on
// entirely. \p{Extended_Pictographic} covers the bulk of actual emoji;
// the explicit ranges below catch the surrounding symbol blocks (arrows,
// geometric shapes, dingbats, enclosed alphanumerics) that aren't emoji but
// are just as unreadable aloud, plus the invisible joiner/selector
// characters emoji sequences are built from.
function stripEmojiAndSymbols(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "") // regional indicator (flag) letters
    .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, "") // skin tone modifiers
    .replace(/[←-⇿]/g, "") // arrows
    .replace(/[①-⓿]/g, "") // enclosed alphanumerics (①②③...)
    .replace(/[■-◿]/g, "") // geometric shapes
    .replace(/[☀-➿]/g, "") // misc symbols + dingbats
    .replace(/[⬀-⯿]/g, "") // misc symbols and arrows
    .replace(/[︀-️]/g, "") // variation selectors
    .replace(/‍/g, ""); // zero-width joiner
}

// Recognizes GFM-style pipe table rows so we can turn them into short
// spoken sentences instead of leaving raw "| a | b |" syntax for the TTS
// engine to stumble over.
function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return trimmed.startsWith("|") || trimmed.split("|").length > 2;
}

function isTableSeparatorRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.includes("-") && /^\|?[\s:|-]+\|?$/.test(trimmed);
}

function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
  return trimmed.split("|").map((cell) => cell.trim());
}

// Converts every "header row + separator row + data rows" table into one
// short sentence per data row ("Name: Goblin, HP: 7, AC: 15."), and drops
// any leftover stray "|" characters that aren't part of a table.
function convertMarkdownTables(text: string): string {
  const lines = text.split("\n");
  const output: string[] = [];
  let i = 0;

  while (i < lines.length) {
    if (isTableRow(lines[i]) && i + 1 < lines.length && isTableSeparatorRow(lines[i + 1])) {
      const headers = splitTableRow(lines[i]);
      let j = i + 2;
      const rows: string[][] = [];
      while (j < lines.length && isTableRow(lines[j])) {
        rows.push(splitTableRow(lines[j]));
        j++;
      }

      for (const row of rows) {
        const parts = headers
          .map((header, idx) => {
            const cell = row[idx] ?? "";
            if (!cell) return "";
            return header ? `${header}: ${cell}` : cell;
          })
          .filter(Boolean);
        if (parts.length > 0) output.push(parts.join(", ") + ".");
      }

      i = j;
    } else {
      output.push(lines[i]);
      i++;
    }
  }

  return output.join("\n").replace(/\|/g, ", ");
}

// Cleans raw story/narration text into something safe for a TTS provider to
// read aloud: strips markdown syntax, emoji/symbols, converts tables and
// links into speakable text, and normalizes whitespace. Exported for direct
// unit testing (tests/ttsTextCleaning.test.ts).
export function cleanTextForTTS(rawText: string): string {
  // Spoiler removal has to run before convertMarkdownTables, since that
  // function's fallback replaces any leftover "|" with ", " - which would
  // otherwise destroy the "||...||" pattern this regex looks for.
  const withoutSpoilers = rawText.replace(/\|\|.*?\|\|/g, "");

  const withoutTables = convertMarkdownTables(withoutSpoilers)
    .replace(/^[ \t]*[-*_]{3,}[ \t]*$/gm, "") // horizontal rules (---, ***, ___)
    .replace(/^>+\s?/gm, "") // blockquote markers
    .replace(/[#*_~`]/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1");

  return stripEmojiAndSymbols(withoutTables)
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[<>{}[\]]/g, "")
    .trim();
}

export interface TTSRequestBody {
  text: string;
  voiceId?: string;
  model?: TTSModelKey;
  deepinfraKey?: string;
  cartesiaKey?: string;
  elevenlabsKey?: string;
}

export interface TTSStreamResult {
  stream: ReadableStream<Uint8Array>;
  chunksGenerated: number;
  model: TTSModelKey;
}

export interface TTSError {
  error: string;
  status: number;
}

// Wire format for the streamed response body: each chunk's audio is
// prefixed with its 4-byte big-endian length so the client can pull whole
// chunks off the stream and hand each one to the <audio> element as an
// independently-playable Blob as soon as it arrives, instead of waiting for
// every chunk to finish generating before anything can play.
function frameChunk(buffer: ArrayBuffer): [Uint8Array, Uint8Array] {
  const lengthPrefix = new Uint8Array(4);
  new DataView(lengthPrefix.buffer).setUint32(0, buffer.byteLength, false);
  return [lengthPrefix, new Uint8Array(buffer)];
}

function toTTSError(err: unknown, providerLabel: string): TTSError {
  if (err instanceof Error) {
    if (err.message === "RATE_LIMIT") {
      return {
        error: "TTS rate limit reached. Please wait a moment before trying again.",
        status: 429,
      };
    }
    if (err.message === "AUTH_FAILED") {
      return { error: `${providerLabel} authentication failed.`, status: 403 };
    }
  }
  throw err;
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

const PROVIDER_KEY_NAMES: Record<
  TTSModelKey,
  { key: "deepinfraKey" | "cartesiaKey" | "elevenlabsKey"; label: string }
> = {
  kokoro: { key: "deepinfraKey", label: "DeepInfra" },
  orpheus: { key: "deepinfraKey", label: "DeepInfra" },
  cartesia: { key: "cartesiaKey", label: "Cartesia" },
  elevenlabs: { key: "elevenlabsKey", label: "ElevenLabs" },
};

// Fetches one chunk of audio from the provider implied by `ttsModel`, both
// the DeepInfra models (JSON response with base64 `audio`) and Cartesia/
// ElevenLabs (raw audio bytes as the response body) return a plain
// ArrayBuffer here so the caller doesn't need to branch on response shape.
async function fetchChunkAudio(
  ttsModel: TTSModelKey,
  chunk: string,
  voiceId: string,
  apiKey: string,
  providerFetch: ReturnType<typeof getProviderFetch>,
): Promise<ArrayBuffer | null> {
  if (ttsModel === "cartesia") {
    const response = await providerFetch(CARTESIA_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Cartesia-Version": CARTESIA_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model_id: "sonic-3",
        transcript: chunk,
        voice: { mode: "id", id: voiceId },
        language: "en",
        generation_config: { volume: 1, speed: 1 },
        // container stays "mp3" (not Cartesia's telephony-oriented raw
        // pcm_f32le/8kHz example) so each chunk is independently decodable -
        // we concatenate raw chunk bytes client-side and play the result as
        // one Blob, which only works for self-delimited formats like MP3.
        output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Cartesia TTS error:", { status: response.status, error: errorText });
      if (response.status === 429) throw new Error("RATE_LIMIT");
      if (response.status === 401 || response.status === 403) throw new Error("AUTH_FAILED");
      throw new Error(`Cartesia API error: ${response.status} - ${errorText}`);
    }

    return response.arrayBuffer();
  }

  if (ttsModel === "elevenlabs") {
    const response = await providerFetch(
      `${ELEVENLABS_ENDPOINT_BASE}/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: chunk,
          model_id: "eleven_flash_v2_5",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs TTS error:", { status: response.status, error: errorText });
      if (response.status === 429) throw new Error("RATE_LIMIT");
      if (response.status === 401 || response.status === 403) throw new Error("AUTH_FAILED");
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }

    return response.arrayBuffer();
  }

  const isOrpheus = ttsModel === "orpheus";
  const endpoint = isOrpheus ? ORPHEUS_ENDPOINT : KOKORO_ENDPOINT;
  const requestBody: Record<string, unknown> = isOrpheus
    ? { input: chunk, voice: voiceId, response_format: "mp3", max_tokens: 3000 }
    : { text: chunk, preset: voiceId, output_format: "mp3" };

  const response = await providerFetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("DeepInfra TTS error:", { status: response.status, error: errorText });
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
    return base64ToArrayBuffer(base64Data);
  }
  console.error("No audio data in DeepInfra response", {
    output_format: data.output_format,
    inference_status: data.inference_status,
  });
  return null;
}

export async function generateTTSAudioStream(
  body: TTSRequestBody,
): Promise<TTSStreamResult | TTSError> {
  const { text, voiceId = "af_heart", model = "kokoro" } = body;

  const ttsModel: TTSModelKey =
    model === "orpheus" || model === "cartesia" || model === "elevenlabs" ? model : "kokoro";
  const { key: apiKeyField, label: providerLabel } = PROVIDER_KEY_NAMES[ttsModel];
  const apiKey = body[apiKeyField];

  if (!apiKey || typeof apiKey !== "string") {
    return {
      error: `${providerLabel} API key is required. Please add your own key in Settings.`,
      status: 400,
    };
  }

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return { error: "Text content is required", status: 400 };
  }

  let finalVoiceId = voiceId;
  if (ttsModel === "orpheus") {
    if (!Object.keys(ORPHEUS_VOICES).includes(voiceId)) finalVoiceId = "tara";
  } else if (ttsModel === "kokoro") {
    if (
      !Object.keys(KOKORO_VOICES).includes(voiceId) &&
      !voiceId.match(/^[a-z]{2}_[a-z]+$/)
    ) {
      finalVoiceId = "af_heart";
    }
  } else if (ttsModel === "cartesia") {
    // Any UUID is treated as a user-supplied custom Cartesia voice ID (from
    // their voice library) and passed through as-is; anything else (e.g. a
    // stale Kokoro/Orpheus voice ID left over from switching models) falls
    // back to the bundled default.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(voiceId)) {
      finalVoiceId = "a0e99841-438c-4a64-b679-ae501e7d6091";
    }
  } else if (ttsModel === "elevenlabs") {
    if (!/^[A-Za-z0-9]{15,25}$/.test(voiceId)) {
      finalVoiceId = "21m00Tcm4TlvDq8ikWAM";
    }
  }

  const truncatedText = text.slice(0, MAX_TEXT_LENGTH);
  const cleanText = cleanTextForTTS(truncatedText);

  if (cleanText.length === 0) {
    return { error: "Text is empty after cleaning", status: 400 };
  }

  // Smaller chunks mean the first provider request finishes sooner, which
  // is what the client actually needs to start playback - the rest keep
  // generating in parallel behind it (see the Promise-per-chunk dispatch
  // below), so shrinking chunk size mainly buys lower time-to-first-audio,
  // not total generation time.
  const chunkSize = ttsModel === "orpheus" ? 200 : 500;
  const chunks = splitTextIntoChunks(cleanText, chunkSize);
  const providerFetch = getProviderFetch();

  // Dispatch every chunk to the provider in parallel (as before), but keep
  // each chunk's own promise instead of collapsing them with Promise.all -
  // this lets us hand chunk 0's audio to the client as soon as it's ready
  // rather than waiting for the slowest chunk.
  const chunkPromises: Promise<ArrayBuffer | null>[] = chunks.map((chunk) =>
    fetchChunkAudio(ttsModel, chunk, finalVoiceId, apiKey, providerFetch),
  );

  // Await only the first chunk out here, so a bad key/rate limit (which
  // will fail identically on every chunk) still surfaces as a normal JSON
  // error before any bytes are streamed to the client - matching the old
  // buffered behavior for the common failure case.
  let firstBuffer: ArrayBuffer | null;
  try {
    firstBuffer = await chunkPromises[0];
  } catch (err: unknown) {
    console.error("Error processing chunk 1:", err);
    return toTTSError(err, providerLabel);
  }

  if (firstBuffer === null && chunkPromises.length === 1) {
    return { error: "No audio generated", status: 500 };
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      if (firstBuffer) {
        for (const part of frameChunk(firstBuffer)) controller.enqueue(part);
      }

      for (let i = 1; i < chunkPromises.length; i++) {
        try {
          const buffer = await chunkPromises[i];
          if (buffer) {
            for (const part of frameChunk(buffer)) controller.enqueue(part);
          }
        } catch (err: unknown) {
          // A later chunk failing (e.g. a transient rate limit) can't be
          // turned into a JSON error anymore since streaming has already
          // started - stop early and let the client play what it has.
          console.error(`Error processing chunk ${i + 1}, stopping stream early:`, err);
          break;
        }
      }

      controller.close();
    },
  });

  return { stream, chunksGenerated: chunks.length, model: ttsModel };
}
