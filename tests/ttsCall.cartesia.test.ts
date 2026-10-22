/**
 * What the Cartesia request carries. Cartesia's current reference
 * (https://docs.cartesia.ai/api-reference/tts/bytes, API version 2026-08-14,
 * read 2026-10-21) takes model `sonic-3.6`, the voice as an ID string, and an
 * MP3 output format with both sample_rate and bit_rate; the earlier
 * `Cartesia-Version: 2025-11-04` with `sonic-3` and `voice: {mode, id}` is
 * what this file replaces.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  CARTESIA_MODEL_ID,
  CARTESIA_VERSION,
  generateTTSAudioStream,
} from "@/app/misc/ttsCall";

const VOICE_ID = "a0e99841-438c-4a64-b679-ae501e7d6091";

async function sentRequest() {
  const fakeFetch = vi.fn(async () => new Response(new Uint8Array(8).fill(1), { status: 200 }));
  vi.stubGlobal("fetch", fakeFetch);
  const result = await generateTTSAudioStream({
    text: "The door opens onto a long hall.",
    model: "cartesia",
    voiceId: VOICE_ID,
    cartesiaKey: "fake-key",
  });
  if ("error" in result) throw new Error(`Expected success, got error: ${result.error}`);
  const [url, init] = fakeFetch.mock.calls[0] as unknown as [string, RequestInit];
  return {
    url,
    init,
    headers: init.headers as Record<string, string>,
    body: JSON.parse(init.body as string) as Record<string, unknown>,
  };
}

describe("the Cartesia TTS request", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("goes to the bytes endpoint with API version 2026-08-14", async () => {
    const { url, headers, init } = await sentRequest();
    expect(url).toBe("https://api.cartesia.ai/tts/bytes");
    expect(init.method).toBe("POST");
    expect(CARTESIA_VERSION).toBe("2026-08-14");
    expect(headers["Cartesia-Version"]).toBe("2026-08-14");
    expect(headers.Authorization).toBe("Bearer fake-key");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("asks for sonic-3.6", async () => {
    const { body } = await sentRequest();
    expect(CARTESIA_MODEL_ID).toBe("sonic-3.6");
    expect(body.model_id).toBe("sonic-3.6");
  });

  it("sends the voice as a plain ID string, the form the 2026-08-14 schema documents", async () => {
    const { body } = await sentRequest();
    expect(body.voice).toBe(VOICE_ID);
  });

  it("sends only fields the 2026-08-14 schema defines", async () => {
    const { body } = await sentRequest();
    const defined = [
      "model_id",
      "transcript",
      "voice",
      "language",
      "locale",
      "accent",
      "normalization",
      "output_format",
      "pronunciation_dict_id",
      "generation_config",
    ];
    for (const field of Object.keys(body)) expect(defined, field).toContain(field);
    expect(body.transcript).toBe("The door opens onto a long hall.");
    expect(body.language).toBe("en");
    // `language` and `locale` are alternatives: setting both is a 400.
    expect(body).not.toHaveProperty("locale");
    expect(body.generation_config).toEqual({ volume: 1, speed: 1 });
  });

  it("keeps the self-delimited MP3 output the client concatenates", async () => {
    const { body } = await sentRequest();
    expect(body.output_format).toEqual({ container: "mp3", sample_rate: 44100, bit_rate: 128000 });
  });
});
