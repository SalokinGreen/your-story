/**
 * Drop-in replacement for fetch("/api/creator/*"...) - see providerFetch.ts
 * for the pattern this follows.
 */

import { isStandalone } from "./standalone";
import { generateStageStream, GenerateStageRequestBody } from "./generateStageCall";
import { generateRegenerateSectionStream, RegenerateSectionRequestBody } from "./regenerateSectionCall";
import { generateExtendSectionStream, ExtendSectionRequestBody } from "./extendSectionCall";
import { generateImage, GenerateImageRequestBody } from "./generateImageCall";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-store, must-revalidate",
  Connection: "keep-alive",
};

type CreatorStreamPath =
  | "/api/creator/generate-stage"
  | "/api/creator/regenerate-section"
  | "/api/creator/extend-section";

type CreatorStreamBody =
  | GenerateStageRequestBody
  | RegenerateSectionRequestBody
  | ExtendSectionRequestBody;

export async function creatorStreamFetch(
  path: CreatorStreamPath,
  body: CreatorStreamBody,
  signal?: AbortSignal,
): Promise<Response> {
  if (!isStandalone()) {
    return fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  }

  let stream: ReadableStream<Uint8Array>;
  switch (path) {
    case "/api/creator/generate-stage":
      stream = generateStageStream(body as GenerateStageRequestBody);
      break;
    case "/api/creator/regenerate-section":
      stream = generateRegenerateSectionStream(body as RegenerateSectionRequestBody);
      break;
    case "/api/creator/extend-section":
      stream = generateExtendSectionStream(body as ExtendSectionRequestBody);
      break;
  }

  return new Response(stream, { headers: SSE_HEADERS });
}

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
