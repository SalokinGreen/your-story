/**
 * Drop-in replacement for fetch("/api/creator/*"...) - see providerFetch.ts
 * for the pattern this follows.
 *
 * Only image generation remains here. The staged adventure-generation streams
 * went away with the wizard-based creator; image generation stayed because the
 * story lore editor uses it too.
 */

import { isStandalone } from "./standalone";
import { generateImage, GenerateImageRequestBody } from "./generateImageCall";

export async function creatorImageFetch(body: GenerateImageRequestBody): Promise<Response> {
  if (!isStandalone()) {
    return fetch("/api/creator/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  const result = await generateImage(body);
  const status = "error" in result ? result.status : 200;
  return new Response(JSON.stringify(result), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
