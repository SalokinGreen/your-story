import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

// GET - Fetch comments for an adventure
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const adventureId = searchParams.get("adventureId");
    const sortBy = searchParams.get("sortBy") || "newest";

    if (!adventureId) {
      return NextResponse.json({ error: "adventureId is required" }, { status: 400 });
    }

    let query = supabase
      .from("comments")
      .select("*")
      .eq("adventure_id", adventureId);

    // Sort
    switch (sortBy) {
      case "oldest":
        query = query.order("created_at", { ascending: true });
        break;
      case "likes":
        query = query.order("likes", { ascending: false });
        break;
      case "newest":
      default:
        query = query.order("created_at", { ascending: false });
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching comments:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ comments: data }, { status: 200 });
  } catch (error) {
    console.error("Error in GET /api/comments:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST - Create a new comment
export async function POST(request: NextRequest) {
  try {
    // Get auth token from header
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    
    // Create authenticated client
    const authenticatedSupabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    // Verify user is authenticated
    const { data: { user }, error: authError } = await authenticatedSupabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { adventureId, userName, userAvatar, content, rating } = body;

    // Validate required fields
    if (!adventureId || !content) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate rating if provided
    if (rating !== undefined && (rating < 1 || rating > 5)) {
      return NextResponse.json(
        { error: "Rating must be between 1 and 5" },
        { status: 400 }
      );
    }

    const { data, error } = await authenticatedSupabase
      .from("comments")
      .insert([
        {
          adventure_id: adventureId,
          user_id: user.id,
          user_name: userName || user.user_metadata?.display_name || user.email?.split("@")[0] || "Anonymous",
          user_avatar: userAvatar || user.user_metadata?.avatar_url,
          content: content.trim(),
          rating: rating || null,
          likes: 0,
          liked_by: [],
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Error creating comment:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ comment: data }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/comments:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
