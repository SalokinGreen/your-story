import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/book-imports/[id]
 * Get full details of a book import (including content)
 *
 * DELETE /api/book-imports/[id]
 * Delete a book import (owner only)
 *
 * PATCH /api/book-imports/[id]
 * Update a book import (owner only)
 */

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check auth (optional - for private imports)
    let userId: string | null = null;
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const {
        data: { user },
      } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    // Fetch the import
    const { data, error } = await supabase
      .from("book_imports")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Import not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Check access
    if (!data.is_public && data.user_id !== userId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Increment download count (fire and forget)
    if (data.user_id !== userId) {
      supabase.rpc("increment_book_import_downloads", { import_id: id }).then();
    }

    return NextResponse.json({ import: data });
  } catch (error: any) {
    console.error("Book import GET error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch import" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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

    // Check ownership
    const { data: existing } = await supabase
      .from("book_imports")
      .select("user_id")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    if (existing.user_id !== user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Delete
    const { error } = await supabase.from("book_imports").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Book import DELETE error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete import" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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

    // Check ownership
    const { data: existing } = await supabase
      .from("book_imports")
      .select("user_id")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    if (existing.user_id !== user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await request.json();
    const allowedFields = [
      "name",
      "description",
      "source_book",
      "system",
      "tags",
      "is_public",
    ];
    const updates: Record<string, any> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    // Update
    const { data, error } = await supabase
      .from("book_imports")
      .update(updates)
      .eq("id", id)
      .select("id, name, updated_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, import: data });
  } catch (error: any) {
    console.error("Book import PATCH error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update import" },
      { status: 500 }
    );
  }
}
