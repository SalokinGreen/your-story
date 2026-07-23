/**
 * Drop-in replacement for fetch("/api/ocr/process"...) / fetch("/api/ocr/summarize"...) -
 * see providerFetch.ts for the pattern this follows.
 */

import { isStandalone } from "./standalone";
import { processOCR, OCRProcessRequestBody } from "./ocrCall";
import { summarizeOCR, OCRSummarizeRequestBody } from "./ocrSummarizeCall";
import { mergeOCREntries, OCRMergeRequestBody } from "./ocrMergeCall";

async function toResponse(result: { error: string; status: number } | object): Promise<Response> {
  const status = "error" in result ? (result as { status: number }).status : 200;
  return new Response(JSON.stringify(result), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function ocrFetch(
  path: "/api/ocr/process" | "/api/ocr/summarize" | "/api/ocr/merge",
  body: OCRProcessRequestBody | OCRSummarizeRequestBody | OCRMergeRequestBody,
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

  if (path === "/api/ocr/process") {
    return toResponse(await processOCR(body as OCRProcessRequestBody));
  }
  if (path === "/api/ocr/summarize") {
    return toResponse(await summarizeOCR(body as OCRSummarizeRequestBody));
  }
  return toResponse(await mergeOCREntries(body as OCRMergeRequestBody));
}
