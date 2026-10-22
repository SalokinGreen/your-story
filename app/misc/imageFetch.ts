// A provider that answers with a URL instead of the bytes (DeepInfra and
// OpenRouter sometimes do) is fetched once here, through the same platform
// fetch as every provider call, so a picture marked "done" is always a real
// image. A host the desktop allowlist does not admit fails with a message
// naming it, which is the right outcome: the card says why.

import { getProviderFetch } from "./platformFetch";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function imageUrlToDataUri(
  url: string,
  signal?: AbortSignal,
): Promise<{ ok: true; dataUri: string } | { ok: false; message: string }> {
  if (url.startsWith("data:image/")) return { ok: true, dataUri: url };
  if (!/^https:\/\//i.test(url)) {
    return { ok: false, message: "The provider did not return a picture." };
  }
  try {
    const response = await getProviderFetch()(url, { signal });
    if (!response.ok) {
      return { ok: false, message: `Could not fetch the picture (${response.status}).` };
    }
    const mime = (response.headers.get("content-type") || "").split(";")[0].trim();
    if (!mime.startsWith("image/")) {
      return { ok: false, message: "The provider's link was not a picture." };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0) return { ok: false, message: "The picture was empty." };
    return { ok: true, dataUri: `data:${mime};base64,${bytesToBase64(bytes)}` };
  } catch (error) {
    if ((error as { name?: unknown })?.name === "AbortError") {
      return { ok: false, message: "Cancelled" };
    }
    return {
      ok: false,
      message: `Could not fetch the picture: ${error instanceof Error ? error.message : "network error"}`,
    };
  }
}
