import { describe, it, expect, vi, afterEach } from "vitest";
import { generateTTSAudioStream } from "@/app/misc/ttsCall";

// Mirrors the client-side frame reader in TTSControls.tsx exactly, so this
// test exercises the real server-to-client contract end to end instead of
// just the server half.
async function readFramedChunks(stream: ReadableStream<Uint8Array>): Promise<Uint8Array[]> {
  const reader = stream.getReader();
  let buffered = new Uint8Array(0);
  const chunks: Uint8Array[] = [];

  const append = (data: Uint8Array) => {
    const merged = new Uint8Array(buffered.length + data.length);
    merged.set(buffered);
    merged.set(data, buffered.length);
    buffered = merged;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (value && value.length > 0) append(value);

    while (buffered.length >= 4) {
      const view = new DataView(buffered.buffer, buffered.byteOffset, buffered.length);
      const chunkLength = view.getUint32(0, false);
      if (buffered.length < 4 + chunkLength) break;
      chunks.push(buffered.slice(4, 4 + chunkLength));
      buffered = buffered.slice(4 + chunkLength);
    }

    if (done) break;
  }

  return chunks;
}

describe("generateTTSAudioStream end-to-end", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("streams one frame per chunk for a long Cartesia request", async () => {
    let callCount = 0;
    const fakeFetch = vi.fn(async () => {
      callCount += 1;
      // Distinct byte pattern per call so we can tell chunks apart.
      const body = new Uint8Array(50).fill(callCount);
      return new Response(body, { status: 200 });
    });
    vi.stubGlobal("fetch", fakeFetch);

    // Long enough to split into multiple 1500-char chunks.
    const text = "This is a sentence. ".repeat(300);

    const result = await generateTTSAudioStream({
      text,
      model: "cartesia",
      voiceId: "a0e99841-438c-4a64-b679-ae501e7d6091",
      cartesiaKey: "fake-key",
    });

    if ("error" in result) {
      throw new Error(`Expected success, got error: ${result.error}`);
    }

    expect(result.chunksGenerated).toBeGreaterThan(1);
    expect(fakeFetch).toHaveBeenCalledTimes(result.chunksGenerated);

    const frames = await readFramedChunks(result.stream);
    expect(frames.length).toBe(result.chunksGenerated);
    // First frame should be all 1s (call 1), matching call order.
    expect(frames[0][0]).toBe(1);
    expect(frames[frames.length - 1][0]).toBe(frames.length);
  });

  it("still fails fast with a normal error when the key is bad", async () => {
    const fakeFetch = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fakeFetch);

    const result = await generateTTSAudioStream({
      text: "Hello world.",
      model: "cartesia",
      voiceId: "a0e99841-438c-4a64-b679-ae501e7d6091",
      cartesiaKey: "bad-key",
    });

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.status).toBe(403);
    }
  });
});
