/**
 * OpenRouter OAuth PKCE (https://openrouter.ai/docs/guides/overview/auth/oauth),
 * in the two shapes the app needs:
 *
 *  - Web: redirect flow. The auth page sends the user back to `callbackUrl`
 *    with ?code=..., which APIKeysContext picks up on load.
 *  - Native (Tauri/Capacitor): headless flow. The app's origin
 *    (http://tauri.localhost, capacitor://localhost, ...) is nothing
 *    OpenRouter can redirect a system browser back to, so `callback_url` is
 *    omitted, OpenRouter shows the code on screen instead, and the user
 *    pastes it back into the app. A code_challenge is mandatory in this mode.
 *
 * Either way the code is exchanged for a key the same way, and is single-use
 * and valid for 10 minutes.
 */

const AUTH_URL = "https://openrouter.ai/auth";
const KEY_EXCHANGE_URL = "https://openrouter.ai/api/v1/auth/keys";
// Prefills the label of the key OpenRouter creates, so the user can tell it
// apart in their key list - headless/local apps get no app attribution.
const KEY_LABEL = "Your Story";

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** A random code verifier and its S256 code challenge. */
export async function generatePKCE(): Promise<{
  codeVerifier: string;
  codeChallenge: string;
}> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const codeVerifier = Array.from(array, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier),
  );
  return { codeVerifier, codeChallenge: base64Url(new Uint8Array(hash)) };
}

/**
 * The /auth URL to send the user to. With a `callbackUrl` this is the
 * redirect flow; without one it's the headless flow (code shown on screen).
 */
export function buildOpenRouterAuthUrl(options: {
  codeChallenge: string;
  callbackUrl?: string;
}): string {
  const url = new URL(AUTH_URL);
  if (options.callbackUrl) {
    url.searchParams.set("callback_url", options.callbackUrl);
  } else {
    url.searchParams.set("key_label", KEY_LABEL);
  }
  url.searchParams.set("code_challenge", options.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/**
 * Trades an authorization code for the user's API key. Throws with a message
 * fit to show the user when OpenRouter refuses (wrong, reused or expired code).
 */
export async function exchangeOpenRouterCode(
  code: string,
  codeVerifier: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchImpl(KEY_EXCHANGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: code.trim(),
      code_verifier: codeVerifier,
      code_challenge_method: "S256",
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Failed to exchange OAuth code:", detail);
    let reason = "";
    try {
      reason = (JSON.parse(detail) as { error?: { message?: string } }).error
        ?.message ?? "";
    } catch {
      // not JSON - fall back to the status alone
    }
    // The docs list 403 for a bad or expired code, but a mistyped code
    // comes back as 400 {"error":{"message":"Invalid code"}} in practice.
    if (response.status === 400 || response.status === 403) {
      throw new Error(
        `OpenRouter rejected that code${reason ? ` (${reason})` : ""}. Check you pasted all of it, or start the sign-in again - codes expire after 10 minutes.`,
      );
    }
    throw new Error(
      `OpenRouter couldn't exchange the code (${reason || response.status}).`,
    );
  }

  const { key } = (await response.json()) as { key?: string };
  if (!key) throw new Error("OpenRouter didn't return a key.");
  return key;
}
