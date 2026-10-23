// Shrinks a generated picture before it is stored (imageStore.ts): a long edge
// of at most MAX_STORED_EDGE px, saved as WebP, about 100-200 KB instead of
// the 1-3 MB a provider's PNG weighs. Uses createImageBitmap and OffscreenCanvas
// (both in WebView2, WKWebView and current Android WebViews). Where either is
// missing the original bytes are kept, so an older WebView stores a bigger
// picture rather than none.

export const MAX_STORED_EDGE = 1024;

export interface ShrunkImage {
  blob: Blob;
  mime: string;
  width: number;
  height: number;
}

export async function shrinkGeneratedImage(
  blob: Blob,
  hint: { width: number; height: number },
  maxEdge: number = MAX_STORED_EDGE,
): Promise<ShrunkImage> {
  const original: ShrunkImage = {
    blob,
    mime: blob.type || "image/png",
    width: hint.width,
    height: hint.height,
  };
  try {
    if (
      typeof createImageBitmap !== "function" ||
      typeof OffscreenCanvas === "undefined"
    ) {
      return original;
    }
    const bitmap = await createImageBitmap(blob);
    try {
      const longEdge = Math.max(bitmap.width, bitmap.height);
      const scale = longEdge > maxEdge ? maxEdge / longEdge : 1;
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return { ...original, width: bitmap.width, height: bitmap.height };
      ctx.drawImage(bitmap, 0, 0, width, height);
      const out = await canvas.convertToBlob({ type: "image/webp", quality: 0.85 });
      // Some engines ignore the type and hand back a PNG; keep whichever is smaller.
      if (out.size === 0 || out.size >= blob.size) {
        return { ...original, width: bitmap.width, height: bitmap.height };
      }
      return { blob: out, mime: out.type || "image/webp", width, height };
    } finally {
      bitmap.close?.();
    }
  } catch {
    return original;
  }
}
