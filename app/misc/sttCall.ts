/**
 * Shared STT (speech-to-text) call logic behind /api/stt/transcribe - see
 * providerCall.ts for why this is split out (same code runs server-side for
 * the Vercel-hosted web build and client-side for the standalone
 * Tauri/Capacitor build, via sttFetch.ts).
 */

import { getProviderFetch } from "@/app/misc/platformFetch";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export interface STTSuccess {
  transcript: string;
  language: string;
}

export interface STTError {
  error: string;
  status: number;
}

export async function transcribeAudio(
  audioFile: File | Blob | null,
  mistralKey: string | null,
): Promise<STTSuccess | STTError> {
  if (!mistralKey) {
    return {
      error: "Mistral API key is required. Please add your own key in Settings.",
      status: 400,
    };
  }

  if (!audioFile) {
    return { error: "Audio file is required", status: 400 };
  }

  if (audioFile.size > MAX_FILE_SIZE) {
    return { error: "Audio file too large (max 10MB)", status: 400 };
  }

  const mistralFormData = new FormData();
  mistralFormData.append("file", audioFile, "recording.webm");
  mistralFormData.append("model", "voxtral-mini-latest");

  let transcriptionResult: any;
  try {
    const providerFetch = getProviderFetch();
    const response = await providerFetch(
      "https://api.mistral.ai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${mistralKey}` },
        body: mistralFormData,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Mistral STT API error:", response.status, errorText);

      if (response.status === 401 || response.status === 403) {
        return { error: "STT authentication failed. Please contact support.", status: response.status };
      }
      if (response.status === 429) {
        return {
          error: "STT rate limit reached. Please wait a moment before trying again.",
          status: 429,
        };
      }
      return { error: `Transcription failed: ${errorText}`, status: response.status };
    }

    transcriptionResult = await response.json();
  } catch (mistralError: any) {
    console.error("Mistral STT API error:", mistralError);
    return { error: mistralError.message || "Failed to transcribe audio", status: 500 };
  }

  const transcript = transcriptionResult?.text || "";
  if (!transcript) {
    return { error: "No speech detected in audio", status: 400 };
  }

  return { transcript, language: transcriptionResult?.language || "en" };
}
