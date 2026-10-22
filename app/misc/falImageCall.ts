// fal.ai image generation (docs/image-generation-design.md §4.1, decisions 57,
// 58 and 61). One synchronous POST to https://fal.run/<model> with the player's
// own key; `sync_mode: true` makes fal send the picture back inside the
// response as a data: URI, so no public URL is minted and nothing is fetched
// from fal's CDN. Goes through getProviderFetch() so the desktop's scoped HTTP
// plugin (allowlist: https://fal.run/*) and the Android CapacitorHttp carry it,
// never a raw fetch from the webview.
//
// The result is a value, never a throw: every failure is one of five kinds the
// queue maps to a card state (declined / key / busy / failed / cancelled).

import { getProviderFetch } from "./platformFetch";

export const FAL_BASE_URL = "https://fal.run";
export const FAL_TIMEOUT_MS = 90_000;

export interface FalImageRequest {
  falKey: string;
  /** The fal model id, e.g. "fal-ai/flux/schnell". */
  model: string;
  prompt: string;
  imageSize: { width: number; height: number };
  /** Reference pictures as data: URIs; sent as `image_urls` (edit model only). */
  referenceDataUris?: string[];
  signal?: AbortSignal;
}

export type FalFailureKind = "declined" | "key" | "busy" | "failed" | "cancelled";

export type FalImageResult =
  | { ok: true; dataUri: string; width: number; height: number; seed?: number }
  | {
      ok: false;
      kind: FalFailureKind;
      message: string;
      categories?: string[];
      /** fal charged for this call although it returned no usable picture. */
      billed?: boolean;
    };

interface FalImageEntry {
  url?: string;
  width?: number;
  height?: number;
  content_type?: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Pulls `content_policy_violation` and its categories out of a 422 body, if that is what it is. */
function readPolicyViolation(body: unknown): { categories: string[] } | null {
  if (!body || typeof body !== "object") return null;
  const detail = (body as { detail?: unknown }).detail;
  const items = Array.isArray(detail) ? detail : detail ? [detail] : [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const rec = item as { type?: unknown; ctx?: unknown };
    if (rec.type !== "content_policy_violation") continue;
    const ctx = (rec.ctx ?? {}) as { categories?: unknown; tags?: unknown };
    const raw = Array.isArray(ctx.categories)
      ? ctx.categories
      : Array.isArray(ctx.tags)
        ? ctx.tags
        : [];
    return { categories: raw.filter((c): c is string => typeof c === "string") };
  }
  return null;
}

export async function generateFalImage(req: FalImageRequest): Promise<FalImageResult> {
  if (req.signal?.aborted) {
    return { ok: false, kind: "cancelled", message: "Cancelled" };
  }

  // The caller's signal and a 90 s timeout, whichever fires first.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, FAL_TIMEOUT_MS);
  const onCallerAbort = () => controller.abort();
  req.signal?.addEventListener("abort", onCallerAbort, { once: true });

  const body: Record<string, unknown> = {
    prompt: req.prompt,
    image_size: req.imageSize,
    num_images: 1,
    sync_mode: true,
    output_format: "png",
    enable_safety_checker: true,
  };
  if (req.referenceDataUris && req.referenceDataUris.length > 0) {
    body.image_urls = req.referenceDataUris;
  }

  try {
    const providerFetch = getProviderFetch();
    const response = await providerFetch(`${FAL_BASE_URL}/${req.model}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${req.falKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      let parsed: unknown = null;
      let text = "";
      try {
        text = await response.text();
        parsed = JSON.parse(text);
      } catch {
        // not JSON; the status decides
      }
      if (response.status === 422) {
        const violation = readPolicyViolation(parsed);
        if (violation) {
          return {
            ok: false,
            kind: "declined",
            message: "The image service declined this one.",
            categories: violation.categories,
          };
        }
      }
      if (response.status === 401 || response.status === 403) {
        return { ok: false, kind: "key", message: "fal rejected the key." };
      }
      if (response.status === 429) {
        return { ok: false, kind: "busy", message: "fal is busy (too many requests at once)." };
      }
      return {
        ok: false,
        kind: "failed",
        message: `fal returned ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
      };
    }

    const data = (await response.json()) as {
      images?: FalImageEntry[];
      has_nsfw_concepts?: boolean[];
      seed?: number;
    };

    // fal sends a black picture when its safety checker trips: declined, never saved.
    if (data.has_nsfw_concepts?.[0] === true) {
      // fal ran the model and bills for it even though the picture is withheld.
      return {
        ok: false,
        kind: "declined",
        message: "The image service declined this one.",
        billed: true,
      };
    }

    const entry = data.images?.[0];
    const url = entry?.url;
    if (!entry || !url) {
      return { ok: false, kind: "failed", message: "fal returned no picture." };
    }
    const width = entry.width ?? req.imageSize.width;
    const height = entry.height ?? req.imageSize.height;

    if (url.startsWith("data:")) {
      return { ok: true, dataUri: url, width, height, seed: data.seed };
    }

    // A model that ignored sync_mode sends a CDN URL: fetch it once, here.
    const imageResponse = await providerFetch(url, { signal: controller.signal });
    if (!imageResponse.ok) {
      return { ok: false, kind: "failed", message: `Could not fetch the picture (${imageResponse.status}).` };
    }
    const bytes = new Uint8Array(await imageResponse.arrayBuffer());
    const mime = entry.content_type || imageResponse.headers.get("content-type") || "image/png";
    return {
      ok: true,
      dataUri: `data:${mime};base64,${bytesToBase64(bytes)}`,
      width,
      height,
      seed: data.seed,
    };
  } catch (error) {
    if (req.signal?.aborted) {
      return { ok: false, kind: "cancelled", message: "Cancelled" };
    }
    if (timedOut) {
      return { ok: false, kind: "failed", message: "fal took longer than 90 seconds." };
    }
    return {
      ok: false,
      kind: "failed",
      message: error instanceof Error ? error.message : "The picture request failed.",
    };
  } finally {
    clearTimeout(timer);
    req.signal?.removeEventListener("abort", onCallerAbort);
  }
}
