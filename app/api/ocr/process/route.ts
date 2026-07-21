import { NextRequest, NextResponse } from "next/server";
import { processOCR, OCRProcessRequestBody } from "@/app/misc/ocrCall";

// Allow up to 5 minutes for OCR processing of large PDFs. This must stay
// comfortably above the client-side per-attempt OCR timeout (see
// PDFImporter.tsx), otherwise Vercel kills the function first and the
// client surfaces it as a chunk timeout.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body: OCRProcessRequestBody = await request.json();
    const result = await processOCR(body);

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("OCR process error:", error);
    return NextResponse.json(
      { error: error.message || "OCR processing failed" },
      { status: 500 },
    );
  }
}
