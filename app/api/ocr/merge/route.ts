import { NextRequest, NextResponse } from "next/server";
import { mergeOCREntries, OCRMergeRequestBody } from "@/app/misc/ocrMergeCall";

// Allow up to 5 minutes, matching the other OCR routes.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body: OCRMergeRequestBody = await request.json();
    const result = await mergeOCREntries(body);

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("OCR merge error:", error);
    return NextResponse.json(
      { error: error.message || "Merge pass failed" },
      { status: 500 },
    );
  }
}
