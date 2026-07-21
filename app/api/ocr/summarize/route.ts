import { NextRequest, NextResponse } from "next/server";
import { summarizeOCR, OCRSummarizeRequestBody } from "@/app/misc/ocrSummarizeCall";

// Allow up to 5 minutes for AI summarization (including continuation attempts)
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body: OCRSummarizeRequestBody = await request.json();
    const result = await summarizeOCR(body);

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("OCR summarize error:", error);
    return NextResponse.json(
      { error: error.message || "Summarization failed" },
      { status: 500 },
    );
  }
}
