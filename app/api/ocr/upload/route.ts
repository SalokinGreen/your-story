import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/ocr/upload
 *
 * Uploads a PDF to Supabase temp storage and returns a signed URL
 * for Mistral OCR to access.
 *
 * Request: FormData with 'file' field
 * Response: { success, fileId, signedUrl, fileName }
 */

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
];

export async function POST(request: NextRequest) {
  try {
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

    // Parse form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error: `Invalid file type: ${file.type}. Supported: PDF, PNG, JPEG, WebP`,
        },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `File too large: ${(file.size / 1024 / 1024).toFixed(
            1
          )}MB. Max: 50MB`,
        },
        { status: 400 }
      );
    }

    // Generate unique file path
    const fileId = `${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 9)}`;
    const extension = file.name.split(".").pop() || "pdf";
    const filePath = `${user.id}/${fileId}.${extension}`;

    // Convert File to ArrayBuffer then to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase storage
    const { error: uploadError } = await supabase.storage
      .from("pdf-temp")
      .upload(filePath, buffer, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Generate signed URL (valid for 1 hour)
    const { data: signedUrlData, error: signedUrlError } =
      await supabase.storage.from("pdf-temp").createSignedUrl(filePath, 3600); // 1 hour expiry

    if (signedUrlError || !signedUrlData) {
      console.error("Signed URL error:", signedUrlError);
      return NextResponse.json(
        { error: "Failed to generate access URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      fileId,
      signedUrl: signedUrlData.signedUrl,
      fileName: file.name,
      filePath,
      fileSize: file.size,
      fileType: file.type,
    });
  } catch (error: any) {
    console.error("OCR upload error:", error);
    return NextResponse.json(
      { error: error.message || "Upload failed" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/ocr/upload
 *
 * Deletes a previously uploaded PDF from temp storage
 *
 * Request: { filePath: string }
 * Response: { success: boolean }
 */
export async function DELETE(request: NextRequest) {
  try {
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

    const { filePath } = await request.json();

    if (!filePath) {
      return NextResponse.json(
        { error: "No filePath provided" },
        { status: 400 }
      );
    }

    // Ensure user can only delete their own files
    if (!filePath.startsWith(`${user.id}/`)) {
      return NextResponse.json(
        { error: "Cannot delete files from other users" },
        { status: 403 }
      );
    }

    // Delete the file
    const { error: deleteError } = await supabase.storage
      .from("pdf-temp")
      .remove([filePath]);

    if (deleteError) {
      console.error("Delete error:", deleteError);
      return NextResponse.json(
        { error: `Delete failed: ${deleteError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("OCR delete error:", error);
    return NextResponse.json(
      { error: error.message || "Delete failed" },
      { status: 500 }
    );
  }
}
