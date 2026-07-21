/**
 * Shared OCR-process call logic behind /api/ocr/process - see
 * providerCall.ts for why this is split out (same code runs server-side for
 * the Vercel-hosted web build and client-side for the standalone
 * Tauri/Capacitor build, via ocrFetch.ts).
 *
 * Calls Mistral's OCR API to extract text from a PDF/image using the
 * user's own Mistral API key (BYOK).
 */

import { getProviderFetch } from "@/app/misc/platformFetch";

const MISTRAL_OCR_ENDPOINT = "https://api.mistral.ai/v1/ocr";

export interface OCRProcessRequestBody {
  signedUrl?: string;
  base64Data?: string;
  fileName?: string;
  mimeType?: string;
  pages?: number[];
  includeImages?: boolean;
  mistralKey?: string;
}

export interface OCRProcessSuccess {
  success: true;
  pages: any[];
  totalPages: number;
  markdown: string;
  model: string;
  meta: { pagesProcessed: number };
}

export interface OCRProcessError {
  error: string;
  status: number;
}

export async function processOCR(
  body: OCRProcessRequestBody,
): Promise<OCRProcessSuccess | OCRProcessError> {
  const {
    signedUrl,
    base64Data,
    fileName,
    mimeType,
    pages,
    includeImages = false,
    mistralKey,
  } = body;

  if (!mistralKey || typeof mistralKey !== "string") {
    return {
      error: "Mistral API key is required. Please add your own key in Settings.",
      status: 400,
    };
  }

  if (!signedUrl && !base64Data) {
    return { error: "Either signedUrl or base64Data is required", status: 400 };
  }

  let isPDF: boolean;
  if (signedUrl) {
    isPDF = signedUrl.includes(".pdf");
  } else {
    isPDF = mimeType === "application/pdf" || !!fileName?.toLowerCase().endsWith(".pdf");
  }

  const ocrRequest: any = {
    model: "mistral-ocr-latest",
    include_image_base64: includeImages,
  };

  if (signedUrl) {
    ocrRequest.document = isPDF
      ? { type: "document_url", document_url: signedUrl }
      : { type: "image_url", image_url: signedUrl };
  } else {
    const dataUrl = `data:${mimeType || "application/pdf"};base64,${base64Data}`;
    ocrRequest.document = isPDF
      ? { type: "document_url", document_url: dataUrl }
      : { type: "image_url", image_url: dataUrl };
  }

  if (isPDF && pages && pages.length > 0) {
    ocrRequest.pages = pages;
  }

  const providerFetch = getProviderFetch();
  const ocrResponse = await providerFetch(MISTRAL_OCR_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${mistralKey}` },
    body: JSON.stringify(ocrRequest),
  });

  if (!ocrResponse.ok) {
    const errorData = await ocrResponse.text();
    console.error("Mistral OCR error:", errorData);
    return { error: `OCR failed: ${ocrResponse.statusText}`, status: ocrResponse.status };
  }

  const ocrResult = await ocrResponse.json();
  const totalPages = ocrResult.usage_info?.pages_processed || ocrResult.pages?.length || 1;

  const combinedMarkdown = ocrResult.pages
    .map((page: any, index: number) => {
      const pageNum = page.index || index + 1;
      return `<!-- Page ${pageNum} -->\n${page.markdown}`;
    })
    .join("\n\n---\n\n");

  return {
    success: true,
    pages: ocrResult.pages,
    totalPages,
    markdown: combinedMarkdown,
    model: ocrResult.model,
    meta: { pagesProcessed: totalPages },
  };
}
