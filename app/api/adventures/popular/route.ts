import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Cache duration in seconds (5 minutes)
const CACHE_DURATION = 300;

// GET - Fetch popular adventures with caching (optimized for landing page)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "6", 10);

    // Use service role client for public data
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Simple query for public, published, SFW adventures sorted by popularity
    const { data, error } = await supabase
      .from("adventures")
      .select(
        "id, title, short_description, thumbnail_url, rating, play_count, popularity"
      )
      .eq("is_published", true)
      .eq("visibility", "public")
      .eq("nsfw", false)
      .order("popularity", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Transform to minimal frontend format
    const adventures = (data || []).map((item: any) => ({
      id: item.id,
      title: item.title,
      shortDescription: item.short_description,
      thumbnailUrl: item.thumbnail_url,
      rating: item.rating,
      playCount: item.play_count,
    }));

    // Return with cache headers for edge caching
    return NextResponse.json(
      { adventures },
      {
        status: 200,
        headers: {
          "Cache-Control": `public, s-maxage=${CACHE_DURATION}, stale-while-revalidate=${
            CACHE_DURATION * 2
          }`,
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
