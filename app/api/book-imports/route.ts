import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/book-imports
 * List public book imports with optional filtering
 *
 * Query params:
 * - search: text search
 * - system: RPG system filter
 * - tags: comma-separated tags
 * - sort: "recent" | "popular" | "name"
 * - limit: max results (default 20, max 100)
 * - offset: pagination offset
 * - mine: if "true", show only user's imports (requires auth)
 *
 * POST /api/book-imports
 * Create a new book import (requires auth)
 */

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const system = searchParams.get("system");
    const tags = searchParams.get("tags");
    const sort = searchParams.get("sort") || "recent";
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");
    const mine = searchParams.get("mine") === "true";

    // Check auth for "mine" filter
    let userId: string | null = null;
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const {
        data: { user },
      } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    // Build query
    let query = supabase.from("book_imports").select(
      `
        id,
        name,
        description,
        source_book,
        system,
        tags,
        lore_count,
        mechanics_count,
        tables_count,
        downloads,
        is_public,
        created_at,
        user_id
      `,
      { count: "exact" }
    );

    // Filter by ownership or public
    if (mine && userId) {
      query = query.eq("user_id", userId);
    } else {
      query = query.eq("is_public", true);
    }

    // Text search
    if (search) {
      query = query.textSearch("name", search, {
        type: "websearch",
        config: "english",
      });
    }

    // System filter
    if (system) {
      query = query.eq("system", system);
    }

    // Tags filter
    if (tags) {
      const tagArray = tags.split(",").map((t) => t.trim());
      query = query.overlaps("tags", tagArray);
    }

    // Sorting
    switch (sort) {
      case "popular":
        query = query.order("downloads", { ascending: false });
        break;
      case "name":
        query = query.order("name", { ascending: true });
        break;
      case "recent":
      default:
        query = query.order("created_at", { ascending: false });
    }

    // Pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error("Book imports query error:", error);
      // Return empty list if table doesn't exist yet (migration not run)
      if (
        error.code === "PGRST200" ||
        error.message?.includes("schema cache")
      ) {
        return NextResponse.json({
          imports: [],
          total: 0,
          limit,
          offset,
        });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      imports: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error("Book imports GET error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch imports" },
      { status: 500 }
    );
  }
}

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

    const body = await request.json();
    const {
      name,
      description,
      source_book,
      system,
      tags = [],
      lore = [],
      mechanicNotes = [],
      customTables = [],
      is_public = true,
    } = body;

    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Validate content exists
    const totalItems = lore.length + mechanicNotes.length + customTables.length;
    if (totalItems === 0) {
      return NextResponse.json(
        {
          error:
            "Import must contain at least one item (lore, mechanics, or table)",
        },
        { status: 400 }
      );
    }

    // Insert the import
    const { data, error } = await supabase
      .from("book_imports")
      .insert({
        user_id: user.id,
        name: name.trim(),
        description: description?.trim() || null,
        source_book: source_book?.trim() || null,
        system: system?.trim() || null,
        tags: tags.filter((t: string) => t.trim()),
        lore_count: lore.length,
        mechanics_count: mechanicNotes.length,
        tables_count: customTables.length,
        lore,
        mechanic_notes: mechanicNotes,
        custom_tables: customTables,
        is_public,
      })
      .select("id, name, created_at")
      .single();

    if (error) {
      console.error("Book import insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      import: data,
    });
  } catch (error: any) {
    console.error("Book imports POST error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create import" },
      { status: 500 }
    );
  }
}
