import { NextRequest, NextResponse } from "next/server";
import { processOCR, OCRProcessRequestBody } from "@/app/misc/ocrCall";

// Allow up to 5 minutes for OCR processing of large PDFs. This must stay
// comfortably above the client-side per-attempt OCR timeout (see
// PDFImporter.tsx), otherwise Vercel kills the function first and the
// client surfaces it as a chunk timeout.
export const maxDuration = 300;

// Allow large payloads for base64 PDF uploads (up to 50MB)
// Note: This works in Vercel. For development, Next.js has no built-in body limit.
export const dynamic = "force-dynamic";

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
