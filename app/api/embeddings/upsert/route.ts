import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface EmbeddingRecord {
  story_id: string;
  entry_type: "lore" | "memory" | "scene";
  entry_key: string;
  content: string;
  embedding: number[];
  importance?: number;
}

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
    const { records } = await req.json();

    if (!records || !Array.isArray(records) || records.length === 0) {
      return NextResponse.json(
        { error: "records array is required and must not be empty" },
        { status: 400 }
      );
    }

    // Validate records and collect story IDs
    const storyIds = new Set<string>();
    for (let i = 0; i < records.length; i++) {
      const record = records[i] as EmbeddingRecord;
      if (
        !record.story_id ||
        !record.entry_type ||
        !record.entry_key ||
        !record.content ||
        !record.embedding
      ) {
        return NextResponse.json(
          { error: `records[${i}] is missing required fields` },
          { status: 400 }
        );
      }
      if (!["lore", "memory", "scene"].includes(record.entry_type)) {
        return NextResponse.json(
          {
            error: `records[${i}].entry_type must be 'lore', 'memory', or 'scene'`,
          },
          { status: 400 }
        );
      }
      if (
        !Array.isArray(record.embedding) ||
        record.embedding.length !== 1024
      ) {
        return NextResponse.json(
          { error: `records[${i}].embedding must be an array of 1024 numbers` },
          { status: 400 }
        );
      }
      storyIds.add(record.story_id);
    }

    // Verify user owns all stories
    const { data: stories, error: storiesError } = await supabase
      .from("stories")
      .select("id, user_id")
      .in("id", Array.from(storyIds));

    if (storiesError) {
      console.error("Stories query error:", storiesError);
      return NextResponse.json(
        { error: "Failed to verify story ownership" },
        { status: 500 }
      );
    }

    for (const storyId of storyIds) {
      const story = stories?.find((s) => s.id === storyId);
      if (!story) {
        return NextResponse.json(
          { error: `Story ${storyId} not found` },
          { status: 404 }
        );
      }
      if (story.user_id !== user.id) {
        return NextResponse.json(
          { error: `Access denied to story ${storyId}` },
          { status: 403 }
        );
      }
    }

    // Format records for the upsert function
    // pgvector expects embedding as a string in format '[1,2,3,...]'
    const formattedRecords = records.map((r: EmbeddingRecord) => ({
      story_id: r.story_id,
      entry_type: r.entry_type,
      entry_key: r.entry_key,
      content: r.content,
      embedding: `[${r.embedding.join(",")}]`,
      importance: r.importance ?? 5,
    }));

    // Batch the upsert to avoid hitting JSONB size limits
    // Process in chunks of 25 records
    const UPSERT_BATCH_SIZE = 25;
    let totalUpserted = 0;

    for (let i = 0; i < formattedRecords.length; i += UPSERT_BATCH_SIZE) {
      const batch = formattedRecords.slice(i, i + UPSERT_BATCH_SIZE);

      // Use the upsert RPC function
      const { data, error } = await supabase.rpc("upsert_story_embeddings", {
        p_records: batch,
      });

      if (error) {
        console.error("Upsert error at batch", i / UPSERT_BATCH_SIZE, ":", error);
        return NextResponse.json(
          { error: "Upsert failed: " + error.message },
          { status: 500 }
        );
      }

      totalUpserted += data || batch.length;
    }

    console.log(`[Embeddings] Upserted ${totalUpserted} records in ${Math.ceil(formattedRecords.length / UPSERT_BATCH_SIZE)} batches`);

    return NextResponse.json({
      upserted: totalUpserted,
    });
  } catch (error: unknown) {
    console.error("Embedding upsert error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
