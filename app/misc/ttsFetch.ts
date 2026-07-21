/**
 * Drop-in replacement for fetch("/api/tts/generate"...) - see
 * providerFetch.ts for the pattern this follows.
 */

import { isStandalone } from "./standalone";
import { generateTTSAudio, TTSRequestBody } from "./ttsCall";

export async function ttsFetch(body: TTSRequestBody): Promise<Response> {
  if (!isStandalone()) {
    return fetch("/api/tts/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  const result = await generateTTSAudio(body);
  if ("error" in result) {
    return new Response(JSON.stringify(result), {
      status: result.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(result.audioBuffer, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": result.audioBuffer.byteLength.toString(),
      "X-Chunks-Generated": result.chunksGenerated.toString(),
      "X-TTS-Model": result.model,
    },
  });
}
