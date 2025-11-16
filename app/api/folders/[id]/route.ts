import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_KEY!;

// PATCH - Update folder
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const authenticatedSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || supabaseUrl,
      process.env.NEXT_PUBLIC_SUPABASE_KEY || supabaseKey,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
      }
    );

    const { data: { user }, error: authError } = await authenticatedSupabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, color, icon } = body;

    // Verify ownership
    const { data: folder, error: fetchError } = await authenticatedSupabase
      .from("story_folders")
      .select("user_id")
      .eq("id", id)
      .single();

    if (fetchError || !folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    if (folder.user_id !== user.id) {
      return NextResponse.json({ error: "You can only edit your own folders" }, { status: 403 });
    }

    const updates: any = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name.trim();
    if (color !== undefined) updates.color = color;
    if (icon !== undefined) updates.icon = icon;

    const { data, error } = await authenticatedSupabase
      .from("story_folders")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "A folder with this name already exists" }, { status: 409 });
      }
      console.error("Error updating folder:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ folder: data }, { status: 200 });
  } catch (error) {
    console.error("Error in PATCH /api/folders/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE - Delete folder
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const authenticatedSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || supabaseUrl,
      process.env.NEXT_PUBLIC_SUPABASE_KEY || supabaseKey,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
      }
    );

    const { data: { user }, error: authError } = await authenticatedSupabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify ownership
    const { data: folder, error: fetchError } = await authenticatedSupabase
      .from("story_folders")
      .select("user_id")
      .eq("id", id)
      .single();

    if (fetchError || !folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    if (folder.user_id !== user.id) {
      return NextResponse.json({ error: "You can only delete your own folders" }, { status: 403 });
    }

    // Delete folder (stories will have folder_id set to NULL due to ON DELETE SET NULL)
    const { error } = await authenticatedSupabase
      .from("story_folders")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting folder:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Error in DELETE /api/folders/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
