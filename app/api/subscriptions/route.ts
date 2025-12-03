import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  UserSubscription,
  SubscriptionTier,
  SUBSCRIPTION_TIERS,
  needsWeeklyRefill,
} from "@/app/misc/subscriptions";

export const runtime = "nodejs";

/**
 * GET /api/subscriptions
 * Get the current user's subscription status
 * Also handles weekly coin refill if needed
 */
export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey || !supabaseServiceKey) {
    return NextResponse.json(
      { error: "Server not configured" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Authenticate user
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));

  if (authError || !user) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  try {
    // Get or create subscription record
    let { data: subscription, error } = await supabaseAdmin
      .from("user_subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .single();

    // If no subscription exists, create free tier
    if (error?.code === "PGRST116" || !subscription) {
      const { data: newSub, error: createError } = await supabaseAdmin
        .from("user_subscriptions")
        .insert({
          user_id: user.id,
          tier: "free",
          status: "active",
          weekly_coin_allowance: 100,
          coins_last_refill: new Date().toISOString(),
          coins_this_week: 0, // Will be set by refill
        })
        .select()
        .single();

      if (createError) {
        console.error("Error creating subscription:", createError);
        return NextResponse.json(
          { error: "Failed to create subscription" },
          { status: 500 }
        );
      }

      subscription = newSub;

      // Trigger initial coin refill for new free user
      await refillCoins(supabaseAdmin, user.id, 100);
    }

    // Check if weekly refill is needed
    if (subscription && needsWeeklyRefill(subscription.coins_last_refill)) {
      const refillAmount = subscription.weekly_coin_allowance;
      await refillCoins(supabaseAdmin, user.id, refillAmount);

      // Update refill timestamp
      await supabaseAdmin
        .from("user_subscriptions")
        .update({
          coins_last_refill: new Date().toISOString(),
          coins_this_week: refillAmount,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      // Refresh subscription data
      const { data: refreshed } = await supabaseAdmin
        .from("user_subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .single();

      subscription = refreshed || subscription;
    }

    // Get tier config for response
    const tierConfig =
      SUBSCRIPTION_TIERS[subscription.tier as SubscriptionTier] ||
      SUBSCRIPTION_TIERS.free;

    return NextResponse.json({
      subscription: formatSubscription(subscription),
      tierConfig,
      byokAccess: tierConfig.byokAccess,
    });
  } catch (error) {
    console.error("Error fetching subscription:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Refill coins for a user by minting new tokens
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function refillCoins(
  supabase: any,
  userId: string,
  amount: number
): Promise<void> {
  if (amount <= 0) return;

  console.log(`[Subscription] Refilling ${amount} coins for user ${userId}`);

  // Create tokens in batches
  const batchSize = 500;
  for (let i = 0; i < amount; i += batchSize) {
    const batchAmount = Math.min(batchSize, amount - i);
    const tokens = Array.from({ length: batchAmount }, () => ({
      creator_id: userId,
      minted_at: new Date().toISOString(),
      metadata_url: null,
    }));

    const { data: newTokens, error: mintError } = await supabase
      .from("tokens")
      .insert(tokens)
      .select("id");

    if (mintError) {
      console.error("Error minting coins:", mintError);
      continue;
    }

    if (newTokens && newTokens.length > 0) {
      const ownerships = newTokens.map((token: { id: string }) => ({
        token_id: token.id,
        owner_id: userId,
        acquired_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      const { error: ownershipError } = await supabase
        .from("token_ownerships")
        .insert(ownerships);

      if (ownershipError) {
        console.error("Error creating ownerships:", ownershipError);
      }
    }
  }

  console.log(
    `[Subscription] Successfully refilled ${amount} coins for user ${userId}`
  );
}

/**
 * Format subscription record for API response
 */
function formatSubscription(sub: Record<string, unknown>): UserSubscription {
  return {
    id: sub.id as string,
    userId: sub.user_id as string,
    tier: sub.tier as SubscriptionTier,
    status: sub.status as string as UserSubscription["status"],
    stripeCustomerId: sub.stripe_customer_id as string | null,
    stripeSubscriptionId: sub.stripe_subscription_id as string | null,
    stripePriceId: sub.stripe_price_id as string | null,
    currentPeriodStart: sub.current_period_start as string | null,
    currentPeriodEnd: sub.current_period_end as string | null,
    cancelAtPeriodEnd: sub.cancel_at_period_end as boolean,
    weeklyCoinsAllowance: sub.weekly_coin_allowance as number,
    coinsLastRefill: sub.coins_last_refill as string,
    coinsThisWeek: sub.coins_this_week as number,
    createdAt: sub.created_at as string,
    updatedAt: sub.updated_at as string,
  };
}
