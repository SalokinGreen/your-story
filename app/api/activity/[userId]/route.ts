import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface ActivityItem {
  id: string;
  type: "comment" | "rating" | "adventure_created" | "adventure_updated";
  timestamp: string;
  data: {
    adventureId?: string;
    adventureTitle?: string;
    content?: string;
    rating?: number;
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "15", 10);

    // Get auth token from header
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];

    // Use service role client to bypass RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the requesting user's token
    const {
      data: { user: requestingUser },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !requestingUser) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const activities: ActivityItem[] = [];

    // Fetch comments by user (includes ratings)
    const { data: comments, error: commentsError } = await supabase
      .from("comments")
      .select(
        `
        id,
        content,
        rating,
        created_at,
        adventure_id,
        adventures!inner (
          id,
          title,
          visibility
        )
      `
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!commentsError && comments) {
      for (const comment of comments) {
        const adventure = comment.adventures as any;

        // Only show activities on public adventures (activity feed is public-facing)
        if (adventure?.visibility !== "public") {
          continue;
        }

        // Determine if this is a rating-only or comment
        const hasContent = comment.content && comment.content.trim().length > 0;
        const hasRating =
          comment.rating !== null && comment.rating !== undefined;

        if (hasRating && !hasContent) {
          // Rating only
          activities.push({
            id: `rating-${comment.id}`,
            type: "rating",
            timestamp: comment.created_at,
            data: {
              adventureId: adventure?.id,
              adventureTitle: adventure?.title || "Unknown Adventure",
              rating: comment.rating,
            },
          });
        } else if (hasContent) {
          // Comment (may also have rating)
          activities.push({
            id: `comment-${comment.id}`,
            type: "comment",
            timestamp: comment.created_at,
            data: {
              adventureId: adventure?.id,
              adventureTitle: adventure?.title || "Unknown Adventure",
              content: comment.content,
              rating: hasRating ? comment.rating : undefined,
            },
          });
        }
      }
    }

    // Fetch adventures created/updated by user (public only - activity feed is public-facing)
    const { data: adventures, error: adventuresError } = await supabase
      .from("adventures")
      .select("id, title, created_at, updated_at, visibility, is_published")
      .eq("author_id", userId)
      .eq("visibility", "public")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!adventuresError && adventures) {
      for (const adventure of adventures) {
        // Add creation event
        activities.push({
          id: `adventure-created-${adventure.id}`,
          type: "adventure_created",
          timestamp: adventure.created_at,
          data: {
            adventureId: adventure.id,
            adventureTitle: adventure.title,
          },
        });

        // Add update event if different from creation (and at least 1 minute apart)
        if (adventure.updated_at) {
          const createdAt = new Date(adventure.created_at).getTime();
          const updatedAt = new Date(adventure.updated_at).getTime();

          // Only show update if it's at least 1 minute after creation
          if (updatedAt - createdAt > 60000) {
            activities.push({
              id: `adventure-updated-${adventure.id}-${adventure.updated_at}`,
              type: "adventure_updated",
              timestamp: adventure.updated_at,
              data: {
                adventureId: adventure.id,
                adventureTitle: adventure.title,
              },
            });
          }
        }
      }
    }

    // Sort all activities by timestamp (newest first)
    activities.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Apply pagination
    const totalCount = activities.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedActivities = activities.slice(startIndex, endIndex);
    const hasMore = endIndex < totalCount;

    return NextResponse.json({
      activities: paginatedActivities,
      pagination: {
        page,
        limit,
        totalCount,
        hasMore,
      },
    });
  } catch (error) {
    console.error("Error fetching activity:", error);
    return NextResponse.json(
      { error: "Failed to fetch activity" },
      { status: 500 }
    );
  }
}
