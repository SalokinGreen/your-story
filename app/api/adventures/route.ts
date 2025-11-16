import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAnonKey = process.env.SUPABASE_KEY!;

// GET - Fetch all published adventures or user's own adventures
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const featured = searchParams.get("featured");
    const tags = searchParams.get("tags")?.split(",");
    const difficulty = searchParams.get("difficulty");
    const sortBy = searchParams.get("sortBy") || "popularity";
    const search = searchParams.get("search");
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : undefined;

    // Check if this request is from the adventure author by validating auth token
    const authHeader = request.headers.get("authorization");
    console.log("Auth header:", authHeader ? "present" : "missing");
    let isAuthor = false;
    let authenticatedUserId: string | null = null;
    
    if (authHeader && userId) {
      try {
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
        const { data: { user }, error: authError } = await authenticatedSupabase.auth.getUser();
        console.log("Auth user:", user?.id, "Requested userId:", userId, "Auth error:", authError);
        authenticatedUserId = user?.id || null;
        isAuthor = user?.id === userId;
      } catch (error) {
        console.error("Auth check error:", error);
      }
    }

    // Use service role client to bypass RLS when user is viewing their own adventures
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    let query = supabase
      .from("adventures")
      .select("*");

    // Filter by user's own adventures or published public ones
    console.log("isAuthor:", isAuthor, "userId:", userId);
    if (userId && isAuthor) {
      // Show ALL of the authenticated user's own adventures (including private/hidden)
      query = query.eq("author_id", userId);
    } else if (userId) {
      // Show user's public published adventures for non-authenticated requests
      query = query.eq("author_id", userId).eq("is_published", true).eq("visibility", "public");
    } else {
      // Only show public published adventures
      query = query.eq("is_published", true).eq("visibility", "public");
    }
    // Filter by featured
    if (featured === "true") {
      query = query.eq("is_featured", true);
    }

    // Filter by tags
    if (tags && tags.length > 0) {
      query = query.contains("tags", tags);
    }

    // Filter by difficulty
    if (difficulty) {
      query = query.eq("difficulty", difficulty);
    }

    // Search in title and description
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,short_description.ilike.%${search}%`);
    }

    // Sort
    switch (sortBy) {
      case "newest":
        query = query.order("created_at", { ascending: false });
        break;
      case "rating":
        query = query.order("rating", { ascending: false });
        break;
      case "title":
        query = query.order("title", { ascending: true });
        break;
      case "popularity":
      default:
        query = query.order("popularity", { ascending: false });
    }

    // Limit results
    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching adventures:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`Found ${data.length} adventures for query. Visibilities:`, data.map(a => ({ title: a.title, visibility: a.visibility, published: a.is_published })));

    // Transform database format to frontend format
    const adventures = data.map((item: any) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      shortDescription: item.short_description,
      author: item.author_name,
      authorId: item.author_id,
      thumbnailUrl: item.thumbnail_url,
      bannerUrl: item.banner_url,
      tags: item.tags,
      difficulty: item.difficulty,
      estimatedDuration: item.estimated_duration,
      popularity: item.popularity,
      rating: item.rating,
      playCount: item.play_count,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      isPublished: item.is_published,
      isFeatured: item.is_featured,
      visibility: item.visibility,
      storyTemplate: item.story_template,
    }));

    return NextResponse.json({ adventures }, { status: 200 });
  } catch (error) {
    console.error("Error in GET /api/adventures:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST - Create a new adventure
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    
    // Create authenticated Supabase client using anon keys for RLS
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
    
    const { data: { user }, error: authError } = await authenticatedSupabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      title,
      description,
      shortDescription,
      authorId,
      authorName,
      thumbnailUrl,
      bannerUrl,
      tags,
      difficulty,
      visibility,
      estimatedDuration,
      isPublished,
      storyTemplate,
    } = body;

    // Validate that the authorId matches the authenticated user
    if (authorId !== user.id) {
      return NextResponse.json({ error: "Forbidden: Cannot create adventure for another user" }, { status: 403 });
    }

    // Validate required fields
    if (!title || !description || !shortDescription || !authorId || !authorName || !difficulty || !estimatedDuration || !storyTemplate) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const { data, error } = await authenticatedSupabase
      .from("adventures")
      .insert([
        {
          title,
          description,
          short_description: shortDescription,
          author_id: authorId,
          author_name: authorName,
          thumbnail_url: thumbnailUrl,
          banner_url: bannerUrl,
          tags: tags || [],
          difficulty,
          visibility: visibility || "public",
          estimated_duration: estimatedDuration,
          is_published: isPublished || false,
          is_featured: false,
          story_template: storyTemplate,
          popularity: 0,
          rating: 0,
          play_count: 0,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Error creating adventure:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ adventure: data }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/adventures:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
