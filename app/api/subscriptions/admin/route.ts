import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SubscriptionTier, SUBSCRIPTION_TIERS } from "@/app/misc/subscriptions";

export const runtime = "nodejs";

/**
 * POST /api/subscriptions/admin
 * Admin endpoint to grant or modify subscriptions for users
 * Used for alpha testing, gifts, and manual subscription management
 */
export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase credentials");
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  // Verify auth
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.split(" ")[1];
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Verify user and check admin status
  const {
    data: { user: adminUser },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);

  if (authError || !adminUser) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  // Check if user is admin
  const isAdmin =
    adminUser.user_metadata?.role === "admin" ||
    adminUser.app_metadata?.role === "admin";

  if (!isAdmin) {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 }
    );
  }

  // Parse request body
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { userId, tier, durationDays, coins, action } = body as {
    userId: string;
    tier?: SubscriptionTier;
    durationDays?: number;
    coins?: number;
    action: "grant" | "revoke" | "set_coins" | "add_coins";
  };

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  if (!action) {
    return NextResponse.json({ error: "action is required" }, { status: 400 });
  }

  try {
    switch (action) {
      case "grant": {
        if (!tier || !["free", "starter", "pro", "premium"].includes(tier)) {
          return NextResponse.json(
            { error: "Valid tier is required for grant action" },
            { status: 400 }
          );
        }

        const tierConfig = SUBSCRIPTION_TIERS[tier];
        const now = new Date();
        const periodEnd = durationDays
          ? new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000)
          : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // Default 30 days

        // Upsert subscription record
        const { error: upsertError } = await supabaseAdmin
          .from("user_subscriptions")
          .upsert(
            {
              user_id: userId,
              tier: tier,
              status: "active",
              stripe_customer_id: null, // Admin-granted, no Stripe
              stripe_subscription_id: `admin_grant_${Date.now()}`,
              stripe_price_id: null,
              current_period_start: now.toISOString(),
              current_period_end: periodEnd.toISOString(),
              cancel_at_period_end: false,
              weekly_coin_allowance: tierConfig.weeklyCoins,
              coins_last_refill: now.toISOString(),
              coins_this_week: tierConfig.weeklyCoins,
              updated_at: now.toISOString(),
            },
            {
              onConflict: "user_id",
            }
          );

        if (upsertError) {
          console.error("Error granting subscription:", upsertError);
          return NextResponse.json(
            { error: "Failed to grant subscription" },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          message: `Granted ${tier} subscription to user for ${
            durationDays || 30
          } days`,
          tier,
          expiresAt: periodEnd.toISOString(),
        });
      }

      case "revoke": {
        // Set user back to free tier
        const now = new Date();
        const freeConfig = SUBSCRIPTION_TIERS.free;

        const { error: revokeError } = await supabaseAdmin
          .from("user_subscriptions")
          .upsert(
            {
              user_id: userId,
              tier: "free",
              status: "active",
              stripe_customer_id: null,
              stripe_subscription_id: null,
              stripe_price_id: null,
              current_period_start: null,
              current_period_end: null,
              cancel_at_period_end: false,
              weekly_coin_allowance: freeConfig.weeklyCoins,
              coins_last_refill: now.toISOString(),
              coins_this_week: freeConfig.weeklyCoins,
              updated_at: now.toISOString(),
            },
            {
              onConflict: "user_id",
            }
          );

        if (revokeError) {
          console.error("Error revoking subscription:", revokeError);
          return NextResponse.json(
            { error: "Failed to revoke subscription" },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          message: "Subscription revoked, user set to free tier",
        });
      }

      case "set_coins": {
        if (typeof coins !== "number" || coins < 0) {
          return NextResponse.json(
            { error: "Valid coins amount is required" },
            { status: 400 }
          );
        }

        const { error: setCoinsError } = await supabaseAdmin
          .from("user_subscriptions")
          .update({
            coins_this_week: coins,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);

        if (setCoinsError) {
          console.error("Error setting coins:", setCoinsError);
          return NextResponse.json(
            { error: "Failed to set coins" },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          message: `Set coins to ${coins}`,
          coins,
        });
      }

      case "add_coins": {
        if (typeof coins !== "number") {
          return NextResponse.json(
            { error: "Valid coins amount is required" },
            { status: 400 }
          );
        }

        // First get current coins
        const { data: currentSub, error: fetchError } = await supabaseAdmin
          .from("user_subscriptions")
          .select("coins_this_week")
          .eq("user_id", userId)
          .single();

        if (fetchError && fetchError.code !== "PGRST116") {
          console.error("Error fetching subscription:", fetchError);
          return NextResponse.json(
            { error: "Failed to fetch current coins" },
            { status: 500 }
          );
        }

        const currentCoins = currentSub?.coins_this_week || 0;
        const newCoins = Math.max(0, currentCoins + coins);

        const { error: addCoinsError } = await supabaseAdmin
          .from("user_subscriptions")
          .upsert(
            {
              user_id: userId,
              coins_this_week: newCoins,
              updated_at: new Date().toISOString(),
            },
            {
              onConflict: "user_id",
            }
          );

        if (addCoinsError) {
          console.error("Error adding coins:", addCoinsError);
          return NextResponse.json(
            { error: "Failed to add coins" },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          message: `Added ${coins} coins (${currentCoins} → ${newCoins})`,
          previousCoins: currentCoins,
          newCoins,
        });
      }

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Admin subscription error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
