import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/embeddings/keys
 * Returns all embedding entry keys for a story (to avoid re-generating embeddings)
 */
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
    const { storyId, entryType } = await req.json();

    if (!storyId) {
      return NextResponse.json(
        { error: "storyId is required" },
        { status: 400 }
      );
    }

    // Verify user owns the story
    const { data: story, error: storyError } = await supabase
      .from("stories")
      .select("id, user_id")
      .eq("id", storyId)
      .single();

    if (storyError || !story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    if (story.user_id !== user.id) {
      return NextResponse.json(
        { error: "Access denied to story" },
        { status: 403 }
      );
    }

    // Build query
    let query = supabase
      .from("story_embeddings")
      .select("entry_key, entry_type")
      .eq("story_id", storyId);

    // Optionally filter by entry type
    if (entryType && ["lore", "memory", "scene"].includes(entryType)) {
      query = query.eq("entry_type", entryType);
    }

    const { data: embeddings, error: queryError } = await query;

    if (queryError) {
      console.error("Keys query error:", queryError);
      return NextResponse.json(
        { error: "Failed to fetch embedding keys" },
        { status: 500 }
      );
    }

    // Group keys by type
    const keys: { lore: string[]; memory: string[]; scene: string[] } = {
      lore: [],
      memory: [],
      scene: [],
    };

    for (const record of embeddings || []) {
      if (record.entry_type === "lore") {
        keys.lore.push(record.entry_key);
      } else if (record.entry_type === "memory") {
        keys.memory.push(record.entry_key);
      } else if (record.entry_type === "scene") {
        keys.scene.push(record.entry_key);
      }
    }

    return NextResponse.json({ keys });
  } catch (error: unknown) {
    console.error("Embedding keys error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
