import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { COIN_PACKAGES, getCoinPackage } from "@/app/misc/subscriptions";

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

// Environment variable price IDs for coin packages
function getCoinPriceId(packageId: string): string | null {
  switch (packageId) {
    case "coins_500":
      return process.env.STRIPE_PRICE_COINS_500 || null;
    case "coins_1200":
      return process.env.STRIPE_PRICE_COINS_1200 || null;
    case "coins_2500":
      return process.env.STRIPE_PRICE_COINS_2500 || null;
    case "coins_5500":
      return process.env.STRIPE_PRICE_COINS_5500 || null;
    default:
      return null;
  }
}

/**
 * GET /api/subscriptions/coins
 * Get available coin packages
 */
export async function GET() {
  // Return packages with availability based on whether price IDs are configured
  const packages = COIN_PACKAGES.map((pkg) => ({
    ...pkg,
    available: !!getCoinPriceId(pkg.id),
  }));

  return NextResponse.json({ packages });
}

/**
 * POST /api/subscriptions/coins
 * Create a Stripe Checkout session for one-time coin purchase
 * Requires an active paid subscription
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
    const { packageId } = (await request.json()) as { packageId: string };

    // Validate package
    const coinPackage = getCoinPackage(packageId);
    if (!coinPackage) {
      return NextResponse.json({ error: "Invalid package" }, { status: 400 });
    }

    // Check if user has a paid subscription
    const { data: subscription, error: subError } = await supabaseAdmin
      .from("user_subscriptions")
      .select("tier, stripe_customer_id, status")
      .eq("user_id", user.id)
      .single();

    if (subError || !subscription) {
      return NextResponse.json(
        { error: "Subscription required" },
        { status: 403 }
      );
    }

    if (subscription.tier === "free") {
      return NextResponse.json(
        { error: "Coin purchases require an active subscription" },
        { status: 403 }
      );
    }

    if (subscription.status !== "active") {
      return NextResponse.json(
        { error: "Your subscription is not active" },
        { status: 403 }
      );
    }

    // Get price ID for this package
    const priceId = getCoinPriceId(packageId);
    if (!priceId) {
      return NextResponse.json(
        { error: "Package not available" },
        { status: 400 }
      );
    }

    // Use existing Stripe customer ID
    const customerId = subscription.stripe_customer_id;
    if (!customerId) {
      return NextResponse.json(
        { error: "No payment method on file" },
        { status: 400 }
      );
    }

    // Get site URL for redirects
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      request.headers.get("origin") ||
      "http://localhost:3000";

    // Create checkout session for one-time payment
    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${siteUrl}/?coins_purchased=true`,
      cancel_url: `${siteUrl}/?coins_canceled=true`,
      metadata: {
        userId: user.id,
        type: "coin_purchase",
        packageId: packageId,
        coins: coinPackage.coins.toString(),
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Error creating coin checkout session:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
