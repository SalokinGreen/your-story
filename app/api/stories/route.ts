import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

// GET - Fetch user's stories
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const adventureId = searchParams.get("adventureId");
    const isPublic = searchParams.get("isPublic");

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    // Get the authorization header for authenticated requests
    const authHeader = request.headers.get("authorization");
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    
    // Create authenticated Supabase client with the user's token
    const authenticatedSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_KEY || process.env.SUPABASE_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    // Verify the token is valid
    const { data: { user }, error: authError } = await authenticatedSupabase.auth.getUser();
    
    if (authError || !user) {
      console.error("Auth error:", authError);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Verify the userId matches the authenticated user
    if (userId !== user.id) {
      return NextResponse.json({ error: "Forbidden: Cannot access another user's stories" }, { status: 403 });
    }

    let query = authenticatedSupabase
      .from("stories")
      .select("*")
      .eq("user_id", userId);

    // Filter by adventure
    if (adventureId) {
      query = query.eq("adventure_id", adventureId);
    }

    // Filter by public status
    if (isPublic !== null) {
      query = query.eq("is_public", isPublic === "true");
    }

    // Sort by most recent
    query = query.order("updated_at", { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching stories:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`Fetched ${data?.length || 0} stories for user ${userId}`);

    return NextResponse.json({ stories: data || [] }, { status: 200 });
  } catch (error) {
    console.error("Error in GET /api/stories:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST - Create a new story (fork an adventure or start fresh)
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    
    // Create authenticated Supabase client
    const supabase = createClient(
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
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { adventureId, userId, storyName, storyData, isPublic } = body;

    // Validate that the userId matches the authenticated user
    if (userId !== user.id) {
      return NextResponse.json({ error: "Forbidden: Cannot create story for another user" }, { status: 403 });
    }

    // Validate required fields
    if (!userId || !storyName || !storyData) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("stories")
      .insert([
        {
          adventure_id: adventureId || null,
          user_id: userId,
          story_name: storyName,
          story_data: storyData,
          is_completed: false,
          is_public: isPublic || false,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Error creating story:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ story: data }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/stories:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
