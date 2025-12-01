import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY!;

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
    const {
      storyId,
      query,
      loreLimit = 8,
      memoryLimit = 15,
      minSimilarity = 0.25,
    } = await req.json();

    if (!storyId || !query) {
      return NextResponse.json(
        { error: "storyId and query are required" },
        { status: 400 }
      );
    }

    if (typeof query !== "string" || query.trim().length === 0) {
      return NextResponse.json(
        { error: "query must be a non-empty string" },
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

    // 1. Embed the query using Mistral
    const embedResponse = await fetch("https://api.mistral.ai/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: "mistral-embed",
        input: [query],
      }),
    });

    if (!embedResponse.ok) {
      const errorText = await embedResponse.text();
      console.error("Mistral embedding error:", errorText);
      return NextResponse.json(
        { error: "Failed to embed query" },
        { status: 500 }
      );
    }

    const embedResult = await embedResponse.json();
    const queryEmbedding = embedResult.data[0].embedding;

    // 2. Search using pgvector via RPC
    const { data, error } = await supabase.rpc("search_story_context", {
      p_story_id: storyId,
      p_query_embedding: queryEmbedding,
      p_lore_limit: loreLimit,
      p_memory_limit: memoryLimit,
      p_min_similarity: minSimilarity,
    });

    if (error) {
      console.error("Search error:", error);
      return NextResponse.json(
        { error: "Search failed: " + error.message },
        { status: 500 }
      );
    }

    // 3. Group results by type
    const lore = (data || []).filter(
      (r: { entry_type: string }) => r.entry_type === "lore"
    );
    const memories = (data || []).filter(
      (r: { entry_type: string }) => r.entry_type === "memory"
    );

    return NextResponse.json({
      lore,
      memories,
      totalResults: (data || []).length,
    });
  } catch (error: unknown) {
    console.error("Embedding search error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
