import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  buildOpenRouterAuthUrl,
  exchangeOpenRouterCode,
  generatePKCE,
} from "@/app/misc/openRouterOAuth";

describe("generatePKCE", () => {
  it("derives the challenge as base64url(sha256(verifier))", async () => {
    const { codeVerifier, codeChallenge } = await generatePKCE();
    const expected = createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");
    expect(codeVerifier).toMatch(/^[0-9a-f]{64}$/);
    expect(codeChallenge).toBe(expected);
  });
});

describe("buildOpenRouterAuthUrl", () => {
  it("web: redirect flow carries the callback_url", () => {
    const url = new URL(
      buildOpenRouterAuthUrl({
        codeChallenge: "abc",
        callbackUrl: "https://example.com/library",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://openrouter.ai/auth");
    expect(url.searchParams.get("callback_url")).toBe(
      "https://example.com/library",
    );
    expect(url.searchParams.get("code_challenge")).toBe("abc");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("native: headless flow omits callback_url and labels the key", () => {
    const url = new URL(buildOpenRouterAuthUrl({ codeChallenge: "abc" }));
    expect(url.searchParams.has("callback_url")).toBe(false);
    // Mandatory in headless mode - the code is shown on screen
    expect(url.searchParams.get("code_challenge")).toBe("abc");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("key_label")).toBe("Your Story");
  });
});

describe("exchangeOpenRouterCode", () => {
  it("posts the trimmed code with the verifier and returns the key", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ key: "sk-or-test" }), { status: 200 }),
    );
    const key = await exchangeOpenRouterCode(
      "  pasted-code \n",
      "verifier",
      fetchImpl as unknown as typeof fetch,
    );
    expect(key).toBe("sk-or-test");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/auth/keys");
    expect(JSON.parse(init.body as string)).toEqual({
      code: "pasted-code",
      code_verifier: "verifier",
      code_challenge_method: "S256",
    });
  });

  it("explains a mistyped code, quoting OpenRouter's reason", async () => {
    // What OpenRouter actually returns for an invalid code (2026-10-21)
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { message: "Invalid code", code: 400 } }),
          { status: 400 },
        ),
    );
    await expect(
      exchangeOpenRouterCode("bad", "verifier", fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/rejected that code \(Invalid code\)/);
  });

  it("explains an expired code", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 403 }));
    await expect(
      exchangeOpenRouterCode("old", "verifier", fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/rejected that code\. .*expire/);
  });

  it("fails when OpenRouter answers without a key", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    await expect(
      exchangeOpenRouterCode("code", "verifier", fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/didn't return a key/);
  });
});
