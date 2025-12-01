import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    // Validate auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Parse request
    const { storyId, entryType, validKeys } = await req.json();

    if (!storyId || !entryType || !validKeys) {
      return NextResponse.json(
        { error: "storyId, entryType, and validKeys are required" },
        { status: 400 }
      );
    }

    if (!["lore", "memory", "scene"].includes(entryType)) {
      return NextResponse.json(
        { error: "entryType must be 'lore', 'memory', or 'scene'" },
        { status: 400 }
      );
    }

    if (!Array.isArray(validKeys)) {
      return NextResponse.json(
        { error: "validKeys must be an array of strings" },
        { status: 400 }
      );
    }

    // Verify user owns this story
    const { data: story, error: storyError } = await supabase
      .from("stories")
      .select("id, user_id")
      .eq("id", storyId)
      .single();

    if (storyError || !story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    if (story.user_id !== user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Use the cleanup RPC function
    const { data, error } = await supabase.rpc("cleanup_story_embeddings", {
      p_story_id: storyId,
      p_entry_type: entryType,
      p_valid_keys: validKeys,
    });

    if (error) {
      console.error("Cleanup error:", error);
      return NextResponse.json(
        { error: "Cleanup failed: " + error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      deleted: data || 0,
    });
  } catch (error: unknown) {
    console.error("Embedding cleanup error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
