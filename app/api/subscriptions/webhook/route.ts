import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { SUBSCRIPTION_TIERS, SubscriptionTier } from "@/app/misc/subscriptions";

export const runtime = "nodejs";

// Lazy Stripe initialization to avoid build-time errors
let stripeInstance: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeInstance) {
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2025-11-17.clover",
    });
  }
  return stripeInstance;
}

// Webhook secret for verifying Stripe signatures
function getWebhookSecret(): string {
  return process.env.STRIPE_WEBHOOK_SECRET!;
}

// Map Stripe price IDs to subscription tiers
function getTierFromPriceId(priceId: string): SubscriptionTier {
  if (priceId === process.env.STRIPE_PRICE_STARTER) return "starter";
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  if (priceId === process.env.STRIPE_PRICE_PREMIUM) return "premium";
  return "free";
}

// Get weekly coins for a tier
function getWeeklyCoinsForTier(tier: SubscriptionTier): number {
  return SUBSCRIPTION_TIERS[tier]?.weeklyCoins || 100;
}

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

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    console.error("Missing Stripe credentials");
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 500 }
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Get the raw body for signature verification
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      getWebhookSecret()
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  console.log(`[Stripe Webhook] Received event: ${event.type}`);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        // Check if this is a coin purchase or subscription checkout
        if (session.metadata?.type === "coin_purchase") {
          await handleCoinPurchase(supabaseAdmin, session);
        } else {
          await handleCheckoutCompleted(supabaseAdmin, session);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(supabaseAdmin, subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(supabaseAdmin, subscription);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentSucceeded(supabaseAdmin, invoice);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(supabaseAdmin, invoice);
        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("[Stripe Webhook] Error processing event:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}

/**
 * Handle one-time coin purchase
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCoinPurchase(
  supabase: any,
  session: Stripe.Checkout.Session
) {
  const userId = session.metadata?.userId;
  const coins = parseInt(session.metadata?.coins || "0", 10);
  const packageId = session.metadata?.packageId;

  if (!userId || !coins) {
    console.error("[Stripe Webhook] Invalid coin purchase metadata");
    return;
  }

  console.log(
    `[Stripe Webhook] Coin purchase: ${coins} coins for user ${userId} (package: ${packageId})`
  );

  // Mint the coins for the user
  await mintWeeklyCoins(supabase, userId, coins);

  // Update coins_this_week to reflect the purchase
  const { data: currentSub } = await supabase
    .from("user_subscriptions")
    .select("coins_this_week")
    .eq("user_id", userId)
    .single();

  if (currentSub) {
    await supabase
      .from("user_subscriptions")
      .update({
        coins_this_week: (currentSub.coins_this_week || 0) + coins,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
  }

  console.log(`[Stripe Webhook] Delivered ${coins} coins to user ${userId}`);
}

/**
 * Handle successful checkout - create or update subscription record
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCheckoutCompleted(
  supabase: any,
  session: Stripe.Checkout.Session
) {
  const userId = session.metadata?.userId;
  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;

  if (!userId) {
    console.error("[Stripe Webhook] No userId in checkout session metadata");
    return;
  }

  console.log(`[Stripe Webhook] Checkout completed for user ${userId}`);

  // Get subscription details from Stripe
  const subscriptionResponse = await getStripe().subscriptions.retrieve(
    subscriptionId
  );
  // Cast to access properties - Stripe SDK types may not match runtime data
  const subscriptionData = subscriptionResponse as unknown as {
    items: { data: Array<{ price: { id: string } }> };
    status: string;
    cancel_at_period_end: boolean;
    current_period_start?: number;
    current_period_end?: number;
    start_date?: number;
  };
  const priceId = subscriptionData.items.data[0]?.price.id;
  const tier = getTierFromPriceId(priceId);
  const weeklyCoins = getWeeklyCoinsForTier(tier);

  // Get period dates - use fallbacks if not available
  const now = new Date();
  const periodStart = subscriptionData.current_period_start
    ? new Date(subscriptionData.current_period_start * 1000)
    : now;
  const periodEnd = subscriptionData.current_period_end
    ? new Date(subscriptionData.current_period_end * 1000)
    : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // Default to 30 days

  // Upsert subscription record
  const { error } = await supabase.from("user_subscriptions").upsert(
    {
      user_id: userId,
      tier: tier,
      status: subscriptionData.status as string,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      stripe_price_id: priceId,
      current_period_start: periodStart.toISOString(),
      current_period_end: periodEnd.toISOString(),
      cancel_at_period_end: subscriptionData.cancel_at_period_end,
      weekly_coin_allowance: weeklyCoins,
      coins_last_refill: new Date().toISOString(),
      coins_this_week: weeklyCoins, // Give full week's coins on signup
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "user_id",
    }
  );

  if (error) {
    console.error("[Stripe Webhook] Error upserting subscription:", error);
    throw error;
  }

  // Mint the weekly coins for the user
  await mintWeeklyCoins(supabase, userId, weeklyCoins);

  console.log(
    `[Stripe Webhook] Created/updated subscription for user ${userId}, tier: ${tier}`
  );
}

/**
 * Handle subscription updates (plan changes, renewals, etc.)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSubscriptionUpdated(
  supabase: any,
  subscription: Stripe.Subscription
) {
  const customerId = subscription.customer as string;

  // Find user by Stripe customer ID
  const { data: subRecord, error: findError } = await supabase
    .from("user_subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .single();

  if (findError || !subRecord) {
    console.error(
      "[Stripe Webhook] Could not find user for customer:",
      customerId
    );
    return;
  }

  const userId = subRecord.user_id;
  const priceId = subscription.items.data[0]?.price.id;
  const tier = getTierFromPriceId(priceId);
  const weeklyCoins = getWeeklyCoinsForTier(tier);

  // Cast subscription to access period properties
  const subData = subscription as unknown as {
    status: string;
    cancel_at_period_end: boolean;
    current_period_start?: number;
    current_period_end?: number;
  };

  // Get period dates with fallbacks
  const now = new Date();
  const periodStart = subData.current_period_start
    ? new Date(subData.current_period_start * 1000)
    : now;
  const periodEnd = subData.current_period_end
    ? new Date(subData.current_period_end * 1000)
    : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Update subscription record
  const { error } = await supabase
    .from("user_subscriptions")
    .update({
      tier: tier,
      status: subData.status as string,
      stripe_price_id: priceId,
      current_period_start: periodStart.toISOString(),
      current_period_end: periodEnd.toISOString(),
      cancel_at_period_end: subData.cancel_at_period_end,
      weekly_coin_allowance: weeklyCoins,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) {
    console.error("[Stripe Webhook] Error updating subscription:", error);
    throw error;
  }

  console.log(
    `[Stripe Webhook] Updated subscription for user ${userId}, tier: ${tier}, status: ${subData.status}`
  );
}

/**
 * Handle subscription deletion - downgrade to free tier
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSubscriptionDeleted(
  supabase: any,
  subscription: Stripe.Subscription
) {
  const customerId = subscription.customer as string;

  // Find user by Stripe customer ID
  const { data: subRecord, error: findError } = await supabase
    .from("user_subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .single();

  if (findError || !subRecord) {
    console.error(
      "[Stripe Webhook] Could not find user for customer:",
      customerId
    );
    return;
  }

  const userId = subRecord.user_id;

  // Downgrade to free tier
  const { error } = await supabase
    .from("user_subscriptions")
    .update({
      tier: "free",
      status: "canceled",
      weekly_coin_allowance: 100,
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) {
    console.error("[Stripe Webhook] Error downgrading subscription:", error);
    throw error;
  }

  console.log(
    `[Stripe Webhook] Subscription deleted for user ${userId}, downgraded to free`
  );
}

/**
 * Handle successful payment - trigger weekly coin refill if applicable
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handlePaymentSucceeded(supabase: any, invoice: Stripe.Invoice) {
  // Only handle subscription invoices - cast to access subscription property
  const invoiceData = invoice as unknown as {
    subscription?: string;
    customer: string;
  };
  if (!invoiceData.subscription) return;

  const customerId = invoiceData.customer as string;

  // Find user by Stripe customer ID
  const { data: subRecord, error: findError } = await supabase
    .from("user_subscriptions")
    .select("user_id, weekly_coin_allowance")
    .eq("stripe_customer_id", customerId)
    .single();

  if (findError || !subRecord) {
    console.error(
      "[Stripe Webhook] Could not find user for customer:",
      customerId
    );
    return;
  }

  console.log(
    `[Stripe Webhook] Payment succeeded for user ${subRecord.user_id}`
  );

  // Note: Weekly coins are handled by the refill logic, not payment events
  // This is just for logging/tracking purposes
}

/**
 * Handle failed payment - mark subscription as past_due
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handlePaymentFailed(supabase: any, invoice: Stripe.Invoice) {
  // Cast to access subscription property
  const invoiceData = invoice as unknown as {
    subscription?: string;
    customer: string;
  };
  if (!invoiceData.subscription) return;

  const customerId = invoiceData.customer as string;

  // Find user by Stripe customer ID
  const { data: subRecord, error: findError } = await supabase
    .from("user_subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .single();

  if (findError || !subRecord) {
    console.error(
      "[Stripe Webhook] Could not find user for customer:",
      customerId
    );
    return;
  }

  // Update status to past_due
  const { error } = await supabase
    .from("user_subscriptions")
    .update({
      status: "past_due",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", subRecord.user_id);

  if (error) {
    console.error(
      "[Stripe Webhook] Error updating subscription status:",
      error
    );
    throw error;
  }

  console.log(
    `[Stripe Webhook] Payment failed for user ${subRecord.user_id}, marked as past_due`
  );
}

/**
 * Mint weekly coins for a user
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function mintWeeklyCoins(supabase: any, userId: string, amount: number) {
  // Create tokens for the weekly allocation
  const tokensToCreate = [];
  for (let i = 0; i < amount; i++) {
    tokensToCreate.push({
      creator_id: userId, // User is "creator" of their subscription coins
      minted_at: new Date().toISOString(),
      metadata_url: null,
    });
  }

  // Batch insert in chunks of 1000 to avoid hitting limits
  const chunkSize = 1000;
  for (let i = 0; i < tokensToCreate.length; i += chunkSize) {
    const chunk = tokensToCreate.slice(i, i + chunkSize);

    const { data: newTokens, error: mintError } = await supabase
      .from("tokens")
      .insert(chunk)
      .select("id");

    if (mintError) {
      console.error("[Stripe Webhook] Error minting coins:", mintError);
      continue;
    }

    if (newTokens) {
      // Create ownerships
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
        console.error(
          "[Stripe Webhook] Error creating ownerships:",
          ownershipError
        );
      }
    }
  }

  console.log(`[Stripe Webhook] Minted ${amount} coins for user ${userId}`);
}
