import { NextRequest, NextResponse } from "next/server";

// Allow up to 5 minutes for OCR processing of large PDFs. This must stay
// comfortably above the client-side per-attempt OCR timeout (see
// PDFImporter.tsx), otherwise Vercel kills the function first and the
// client surfaces it as a chunk timeout.
export const maxDuration = 300;

// Allow large payloads for base64 PDF uploads (up to 50MB)
// Note: This works in Vercel. For development, Next.js has no built-in body limit.
export const dynamic = "force-dynamic";

/**
 * POST /api/ocr/process
 *
 * Calls Mistral OCR API to extract text from a PDF using the user's own
 * Mistral API key (BYOK).
 *
 * Request: {
 *   signedUrl?: string,  // Signed URL to the PDF
 *   base64Data?: string, // Base64 encoded file data (fallback)
 *   fileName?: string,   // Original file name (for base64 mode)
 *   mimeType?: string,   // MIME type (for base64 mode)
 *   pages?: number[],    // Optional: specific pages to process (0-indexed)
 *   includeImages?: boolean,
 *   mistralKey: string   // User's own Mistral API key
 * }
 *
 * Response: {
 *   success: boolean,
 *   pages: OCRPageResult[],
 *   totalPages: number,
 *   markdown: string,    // Combined markdown from all pages
 * }
 */

const MISTRAL_OCR_ENDPOINT = "https://api.mistral.ai/v1/ocr";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
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
      return NextResponse.json(
        {
          error:
            "Mistral API key is required. Please add your own key in Settings.",
        },
        { status: 400 },
      );
    }

    if (!signedUrl && !base64Data) {
      return NextResponse.json(
        { error: "Either signedUrl or base64Data is required" },
        { status: 400 },
      );
    }

    // Determine if this is a PDF or image
    let isPDF: boolean;
    if (signedUrl) {
      isPDF = signedUrl.includes(".pdf");
    } else {
      isPDF =
        mimeType === "application/pdf" ||
        fileName?.toLowerCase().endsWith(".pdf");
    }

    // Build OCR request
    let ocrRequest: any = {
      model: "mistral-ocr-latest",
      include_image_base64: includeImages,
    };

    if (signedUrl) {
      // URL-based document
      ocrRequest.document = isPDF
        ? { type: "document_url", document_url: signedUrl }
        : { type: "image_url", image_url: signedUrl };
    } else {
      // Base64-based document
      const dataUrl = `data:${
        mimeType || "application/pdf"
      };base64,${base64Data}`;
      ocrRequest.document = isPDF
        ? { type: "document_url", document_url: dataUrl }
        : { type: "image_url", image_url: dataUrl };
    }

    // Add specific pages if requested (only for PDFs)
    if (isPDF && pages && pages.length > 0) {
      ocrRequest.pages = pages;
    }

    // Call Mistral OCR API
    const ocrResponse = await fetch(MISTRAL_OCR_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mistralKey}`,
      },
      body: JSON.stringify(ocrRequest),
    });

    if (!ocrResponse.ok) {
      const errorData = await ocrResponse.text();
      console.error("Mistral OCR error:", errorData);
      return NextResponse.json(
        { error: `OCR failed: ${ocrResponse.statusText}` },
        { status: ocrResponse.status },
      );
    }

    const ocrResult = await ocrResponse.json();

    const totalPages =
      ocrResult.usage_info?.pages_processed || ocrResult.pages?.length || 1;

    // Combine all pages into single markdown
    const combinedMarkdown = ocrResult.pages
      .map((page: any, index: number) => {
        const pageNum = page.index || index + 1;
        return `<!-- Page ${pageNum} -->\n${page.markdown}`;
      })
      .join("\n\n---\n\n");

    return NextResponse.json({
      success: true,
      pages: ocrResult.pages,
      totalPages,
      markdown: combinedMarkdown,
      model: ocrResult.model,
      meta: {
        pagesProcessed: totalPages,
      },
    });
  } catch (error: any) {
    console.error("OCR process error:", error);
    return NextResponse.json(
      { error: error.message || "OCR processing failed" },
      { status: 500 },
    );
  }
}
