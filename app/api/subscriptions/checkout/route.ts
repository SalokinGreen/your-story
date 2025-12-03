import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { SubscriptionTier, SUBSCRIPTION_TIERS } from "@/app/misc/subscriptions";

export const runtime = "nodejs";

// Lazy initialize Stripe to avoid build-time errors
let stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripe) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2025-11-17.clover",
    });
  }
  return stripe;
}

/**
 * POST /api/subscriptions/checkout
 * Create a Stripe Checkout session for subscription purchase
 */
export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey || !supabaseServiceKey) {
    return NextResponse.json(
      { error: "Server not configured" },
      { status: 500 }
    );
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Stripe not configured" },
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
    const { tier } = (await request.json()) as { tier: SubscriptionTier };

    // Validate tier
    if (!tier || !SUBSCRIPTION_TIERS[tier] || tier === "free") {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }

    // Get the price ID for this tier
    const priceId = getPriceIdForTier(tier);
    if (!priceId) {
      return NextResponse.json(
        { error: "Tier not configured" },
        { status: 400 }
      );
    }

    // Check if user already has a Stripe customer ID
    const { data: existingSub } = await supabaseAdmin
      .from("user_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    let customerId = existingSub?.stripe_customer_id;

    // Create Stripe customer if needed
    if (!customerId) {
      const customer = await getStripe().customers.create({
        email: user.email,
        metadata: {
          userId: user.id,
        },
      });
      customerId = customer.id;

      // Save customer ID to subscription record
      await supabaseAdmin.from("user_subscriptions").upsert(
        {
          user_id: user.id,
          stripe_customer_id: customerId,
          tier: "free",
          status: "active",
          weekly_coin_allowance: 100,
          coins_last_refill: new Date().toISOString(),
          coins_this_week: 0,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id",
        }
      );
    }

    // Get site URL for redirects
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      request.headers.get("origin") ||
      "http://localhost:3000";

    // Create checkout session
    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${siteUrl}/subscription?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/subscription?canceled=true`,
      metadata: {
        userId: user.id,
        tier: tier,
      },
      subscription_data: {
        metadata: {
          userId: user.id,
          tier: tier,
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}

/**
 * Get Stripe Price ID for a tier from environment variables
 */
function getPriceIdForTier(tier: SubscriptionTier): string | null {
  switch (tier) {
    case "starter":
      return process.env.STRIPE_PRICE_STARTER || null;
    case "pro":
      return process.env.STRIPE_PRICE_PRO || null;
    case "premium":
      return process.env.STRIPE_PRICE_PREMIUM || null;
    default:
      return null;
  }
}
