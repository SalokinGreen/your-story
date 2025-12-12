import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAnonKey = process.env.SUPABASE_KEY!;

// GET - Fetch a single adventure by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Try to get the authenticated user (if any)
    const authHeader = request.headers.get("authorization");
    let currentUserId: string | null = null;

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const authenticatedSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || supabaseUrl,
        process.env.NEXT_PUBLIC_SUPABASE_KEY || supabaseAnonKey,
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
      } = await authenticatedSupabase.auth.getUser();
      currentUserId = user?.id || null;
    }

    // Use service role key to bypass RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from("adventures")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error fetching adventure:", error);
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    // Check visibility permissions
    const isOwner = currentUserId === data.author_id;
    const visibility = data.visibility || "public";

    if (visibility === "private" && !isOwner) {
      return NextResponse.json(
        { error: "Adventure not found" },
        { status: 404 }
      );
    }

    // Hidden adventures are accessible via direct link but not listed
    // Public adventures are accessible to everyone
    // Private adventures only accessible to owner (checked above)

    // Transform database format to frontend format
    const adventure = {
      id: data.id,
      title: data.title,
      description: data.description,
      shortDescription: data.short_description,
      author: data.author_name,
      authorId: data.author_id,
      thumbnailUrl: data.thumbnail_url,
      bannerUrl: data.banner_url,
      tags: data.tags,
      difficulty: data.difficulty,
      estimatedDuration: data.estimated_duration,
      popularity: data.popularity,
      rating: data.rating,
      playCount: data.play_count,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      isPublished: data.is_published,
      isFeatured: data.is_featured,
      nsfw: data.nsfw,
      visibility: data.visibility,
      storyTemplate: data.story_template,
      selectedPreset: data.selected_preset,
      presets: data.presets,
      startingChoices: data.starting_choices,
      characterSheetTemplate: data.character_sheet_template,
    };

    return NextResponse.json({ adventure }, { status: 200 });
  } catch (error) {
    console.error("Error in GET /api/adventures/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST - Increment play_count when an adventure is started
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error } = await supabase
      .from("adventures")
      .update({ play_count: undefined as any })
      .eq("id", id);

    if (error) {
      console.error("Error incrementing play count (legacy stub):", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("Error in POST /api/adventures/[id] (play count):", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH - Update an adventure
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get auth token from header
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");

    // Create authenticated client using anon keys for RLS
    const authenticatedSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || supabaseUrl,
      process.env.NEXT_PUBLIC_SUPABASE_KEY || supabaseAnonKey,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    // Verify user is authenticated
    const {
      data: { user },
      error: authError,
    } = await authenticatedSupabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Check if user owns the adventure
    const { data: existingAdventure, error: fetchError } =
      await authenticatedSupabase
        .from("adventures")
        .select("author_id")
        .eq("id", id)
        .single();

    if (fetchError || !existingAdventure) {
      return NextResponse.json(
        { error: "Adventure not found" },
        { status: 404 }
      );
    }

    // Check if user is admin
    const isAdmin =
      user.user_metadata?.role === "admin" ||
      user.app_metadata?.role === "admin";

    if (existingAdventure.author_id !== user.id && !isAdmin) {
      return NextResponse.json(
        { error: "You can only edit your own adventures" },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Get current display name from user metadata
    const authorName = user.user_metadata?.display_name || "Anonymous";

    const updateData: any = {};

    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined)
      updateData.description = body.description;
    if (body.shortDescription !== undefined)
      updateData.short_description = body.shortDescription;
    if (body.thumbnailUrl !== undefined)
      updateData.thumbnail_url = body.thumbnailUrl;
    if (body.bannerUrl !== undefined) updateData.banner_url = body.bannerUrl;
    if (body.tags !== undefined) updateData.tags = body.tags;
    if (body.difficulty !== undefined) updateData.difficulty = body.difficulty;
    if (body.visibility !== undefined) updateData.visibility = body.visibility;
    if (body.estimatedDuration !== undefined)
      updateData.estimated_duration = body.estimatedDuration;
    if (body.isPublished !== undefined)
      updateData.is_published = body.isPublished;
    if (body.isFeatured !== undefined) updateData.is_featured = body.isFeatured;
    if (body.nsfw !== undefined) updateData.nsfw = body.nsfw;
    if (body.storyTemplate !== undefined) {
      updateData.story_template = body.storyTemplate;
      // Extract agmt_state from storyTemplate if present
      updateData.agmt_state = body.storyTemplate?.agmtState || null;
    }
    if (body.selectedPreset !== undefined)
      updateData.selected_preset = body.selectedPreset;
    if (body.presets !== undefined) updateData.presets = body.presets;
    if (body.startingChoices !== undefined)
      updateData.starting_choices = body.startingChoices;
    if (body.characterSheetTemplate !== undefined)
      updateData.character_sheet_template = body.characterSheetTemplate;

    // Only update author name if the user is the author (admins shouldn't overwrite author name)
    if (existingAdventure.author_id === user.id) {
      updateData.author_name = authorName;
    }
    updateData.updated_at = new Date().toISOString();

    // Use service role to bypass RLS for the update, since we've already validated permissions
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabaseAdmin
      .from("adventures")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating adventure:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Transform database format to frontend format
    const adventure = {
      id: data.id,
      title: data.title,
      description: data.description,
      shortDescription: data.short_description,
      author: data.author_name,
      authorId: data.author_id,
      thumbnailUrl: data.thumbnail_url,
      bannerUrl: data.banner_url,
      tags: data.tags,
      difficulty: data.difficulty,
      estimatedDuration: data.estimated_duration,
      popularity: data.popularity,
      rating: data.rating,
      playCount: data.play_count,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      isPublished: data.is_published,
      isFeatured: data.is_featured,
      nsfw: data.nsfw,
      visibility: data.visibility,
      storyTemplate: data.story_template,
      selectedPreset: data.selected_preset,
      presets: data.presets,
      startingChoices: data.starting_choices,
      characterSheetTemplate: data.character_sheet_template,
    };

    return NextResponse.json({ adventure }, { status: 200 });
  } catch (error) {
    console.error("Error in PATCH /api/adventures/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE - Delete an adventure
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get auth token from header
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");

    // Create authenticated client using anon keys for RLS
    const authenticatedSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || supabaseUrl,
      process.env.NEXT_PUBLIC_SUPABASE_KEY || supabaseAnonKey,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    // Verify user is authenticated
    const {
      data: { user },
      error: authError,
    } = await authenticatedSupabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Check if user owns the adventure
    const { data: adventure, error: fetchError } = await authenticatedSupabase
      .from("adventures")
      .select("author_id")
      .eq("id", id)
      .single();

    if (fetchError || !adventure) {
      return NextResponse.json(
        { error: "Adventure not found" },
        { status: 404 }
      );
    }

    if (adventure.author_id !== user.id) {
      return NextResponse.json(
        { error: "You can only delete your own adventures" },
        { status: 403 }
      );
    }

    const { error } = await authenticatedSupabase
      .from("adventures")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting adventure:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { message: "Adventure deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in DELETE /api/adventures/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
