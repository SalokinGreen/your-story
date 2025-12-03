import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export interface PopularAdventure {
  id: string;
  title: string;
  shortDescription: string;
  thumbnailUrl?: string;
  rating?: number;
  playCount: number;
}

/**
 * Server-side function to fetch popular adventures.
 * Uses Next.js caching for optimal performance.
 */
export async function getPopularAdventures(
  limit: number = 6
): Promise<PopularAdventure[]> {
  try {
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
      console.error("Error fetching popular adventures:", error);
      return [];
    }

    // Transform to minimal frontend format
    return (data || []).map((item) => ({
      id: item.id,
      title: item.title,
      shortDescription: item.short_description,
      thumbnailUrl: item.thumbnail_url,
      rating: item.rating,
      playCount: item.play_count,
    }));
  } catch (error) {
    console.error("Error in getPopularAdventures:", error);
    return [];
  }
}
