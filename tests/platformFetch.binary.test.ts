/**
 * In the Capacitor apps the patched window.fetch reads a non-JSON answer as
 * text, which mangled the TTS providers' MP3 bytes (2026-10-22: TTS silent on
 * Android). getBinaryProviderFetch sends those requests to CapacitorHttp with
 * responseType "arraybuffer" and rebuilds the bytes from native's base64.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const native = vi.hoisted(() => ({ isNative: true, request: vi.fn() }));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => native.isNative },
  CapacitorHttp: { request: native.request },
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));

import { getBinaryProviderFetch, getProviderFetch } from "@/app/misc/platformFetch";

beforeEach(() => {
  native.isNative = true;
  native.request.mockReset();
});

describe("getBinaryProviderFetch in the Capacitor apps", () => {
  it("asks native for an arraybuffer and returns the exact bytes", async () => {
    const bytes = [0xff, 0xfb, 0x90, 0x00, 0x80, 0xc3];
    native.request.mockResolvedValue({
      status: 200,
      headers: { "Content-Type": "audio/mpeg" },
      data: btoa(String.fromCharCode(...bytes)),
      url: "https://api.cartesia.ai/tts/bytes",
    });
    const response = await getBinaryProviderFetch()("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: { Authorization: "Bearer k", "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: "Hello" }),
    });
    const sent = native.request.mock.calls[0][0];
    expect(sent).toMatchObject({
      url: "https://api.cartesia.ai/tts/bytes",
      method: "POST",
      responseType: "arraybuffer",
      data: '{"transcript":"Hello"}',
    });
    expect(sent.headers["content-type"]).toBe("application/json");
    expect(sent.headers.authorization).toBe("Bearer k");
    expect(response.ok).toBe(true);
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual(bytes);
  });

  it("keeps an error body readable as text, whether native parsed it or not", async () => {
    native.request.mockResolvedValue({
      status: 401,
      headers: { "content-type": "application/json" },
      data: { detail: "bad key" },
      url: "",
    });
    const parsed = await getBinaryProviderFetch()("https://x", { method: "POST" });
    expect(parsed.status).toBe(401);
    expect(await parsed.text()).toBe('{"detail":"bad key"}');

    native.request.mockResolvedValue({ status: 429, headers: {}, data: "slow down", url: "" });
    const plain = await getBinaryProviderFetch()("https://x", { method: "POST" });
    expect(await plain.text()).toBe("slow down");
  });
});

describe("getBinaryProviderFetch elsewhere", () => {
  it("is the ordinary provider fetch off Capacitor", () => {
    native.isNative = false;
    expect(getBinaryProviderFetch()).toBe(getProviderFetch());
  });
});
