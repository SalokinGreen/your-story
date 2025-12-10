import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calculateOCRCost } from "@/app/misc/ocr";
import { deductTokens, hasEnoughTokens } from "@/app/misc/tokens";

// Allow up to 2 minutes for OCR processing of large PDFs
export const maxDuration = 120;

/**
 * POST /api/ocr/process
 *
 * Calls Mistral OCR API to extract text from a PDF
 *
 * Request: {
 *   signedUrl: string,  // Supabase signed URL to the PDF
 *   pages?: number[],   // Optional: specific pages to process (0-indexed)
 *   includeImages?: boolean
 * }
 *
 * Response: {
 *   success: boolean,
 *   pages: OCRPageResult[],
 *   totalPages: number,
 *   markdown: string,    // Combined markdown from all pages
 *   cost: number         // Coins deducted
 * }
 */

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_OCR_ENDPOINT = "https://api.mistral.ai/v1/ocr";

export async function POST(request: NextRequest) {
  try {
    // Validate API key exists
    if (!MISTRAL_API_KEY) {
      return NextResponse.json(
        { error: "OCR service not configured" },
        { status: 500 }
      );
    }

    // Validate auth
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await request.json();
    const { signedUrl, pages, includeImages = false } = body;

    if (!signedUrl) {
      return NextResponse.json(
        { error: "signedUrl is required" },
        { status: 400 }
      );
    }

    // Determine if this is a PDF or image
    const isPDF = signedUrl.includes(".pdf");

    // Build OCR request
    const ocrRequest: any = {
      model: "mistral-ocr-latest",
      document: isPDF
        ? { type: "document_url", document_url: signedUrl }
        : { type: "image_url", image_url: signedUrl },
      include_image_base64: includeImages,
    };

    // Add specific pages if requested (only for PDFs)
    if (isPDF && pages && pages.length > 0) {
      ocrRequest.pages = pages;
    }

    // Call Mistral OCR API
    const ocrResponse = await fetch(MISTRAL_OCR_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MISTRAL_API_KEY}`,
      },
      body: JSON.stringify(ocrRequest),
    });

    if (!ocrResponse.ok) {
      const errorData = await ocrResponse.text();
      console.error("Mistral OCR error:", errorData);
      return NextResponse.json(
        { error: `OCR failed: ${ocrResponse.statusText}` },
        { status: ocrResponse.status }
      );
    }

    const ocrResult = await ocrResponse.json();

    // Calculate cost and deduct coins
    const totalPages =
      ocrResult.usage_info?.pages_processed || ocrResult.pages?.length || 1;
    const coinCost = calculateOCRCost(totalPages);

    // Check if user has enough coins (pass service role client)
    const hasCoins = await hasEnoughTokens(user.id, coinCost, supabase);
    if (!hasCoins) {
      return NextResponse.json(
        {
          error: `Insufficient coins. OCR requires ${coinCost} coins for ${totalPages} pages.`,
          required: coinCost,
          pages: totalPages,
        },
        { status: 402 }
      );
    }

    // Deduct coins (pass service role client)
    const deducted = await deductTokens(user.id, coinCost, supabase);
    if (!deducted) {
      return NextResponse.json(
        { error: "Failed to deduct coins" },
        { status: 500 }
      );
    }

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
      cost: coinCost,
      meta: {
        pagesProcessed: totalPages,
        coinsDeducted: coinCost,
      },
    });
  } catch (error: any) {
    console.error("OCR process error:", error);
    return NextResponse.json(
      { error: error.message || "OCR processing failed" },
      { status: 500 }
    );
  }
}
