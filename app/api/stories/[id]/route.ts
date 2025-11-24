import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

// GET - Fetch a single story
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Check for authentication header
    const authHeader = request.headers.get("authorization");
    let clientToUse = supabase;

    // If authenticated, use authenticated client for RLS with anon keys
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      clientToUse = createClient(
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
    }

    const { data, error } = await clientToUse
      .from("stories")
      .select("*")
      .eq("id", id);

    if (error) {
      console.error("Error fetching story:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) {
      console.error("Story not found or access denied:", id);
      return NextResponse.json(
        { error: "Story not found or access denied" },
        { status: 404 }
      );
    }

    // Transform snake_case to camelCase
    const transformedStory = {
      id: data[0].id,
      adventureId: data[0].adventure_id,
      userId: data[0].user_id,
      storyName: data[0].story_name,
      storyData: data[0].story_data,
      isCompleted: data[0].is_completed,
      isPublic: data[0].is_public,
      nsfw: data[0].nsfw,
      createdAt: data[0].created_at,
      updatedAt: data[0].updated_at,
    };

    return NextResponse.json({ story: transformedStory }, { status: 200 });
  } catch (error) {
    console.error("Error in GET /api/stories/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH - Update a story (progress, completion status, public visibility)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Verify authentication
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.substring(7);
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

    const {
      data: { user },
      error: authError,
    } = await authenticatedSupabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { storyData, isCompleted, isPublic, folderId, nsfw } = body;

    // Verify user owns this story
    const { data: story, error: fetchError } = await authenticatedSupabase
      .from("stories")
      .select("user_id")
      .eq("id", id)
      .single();

    if (fetchError || !story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    if (story.user_id !== user.id) {
      return NextResponse.json(
        { error: "Forbidden: You don't own this story" },
        { status: 403 }
      );
    }

    const updates: any = {};
    if (storyData !== undefined) {
      updates.story_data = storyData;
      // Extract mythic_state from storyData if present
      updates.mythic_state = storyData?.mythicState || null;
      // If storyData has nsfw flag, sync it to the column
      if (storyData.nsfw !== undefined) {
        updates.nsfw = storyData.nsfw;
      }
    }
    if (isCompleted !== undefined) updates.is_completed = isCompleted;
    if (isPublic !== undefined) updates.is_public = isPublic;
    if (folderId !== undefined) updates.folder_id = folderId;
    if (nsfw !== undefined) updates.nsfw = nsfw;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const { data, error } = await authenticatedSupabase
      .from("stories")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating story:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ story: data }, { status: 200 });
  } catch (error) {
    console.error("Error in PATCH /api/stories/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE - Delete a story
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Verify authentication
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.substring(7);
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

    const {
      data: { user },
      error: authError,
    } = await authenticatedSupabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user owns this story
    const { data: story, error: fetchError } = await authenticatedSupabase
      .from("stories")
      .select("user_id")
      .eq("id", id)
      .single();

    if (fetchError || !story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    if (story.user_id !== user.id) {
      return NextResponse.json(
        { error: "Forbidden: You don't own this story" },
        { status: 403 }
      );
    }

    const { error } = await authenticatedSupabase
      .from("stories")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting story:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { message: "Story deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in DELETE /api/stories/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
