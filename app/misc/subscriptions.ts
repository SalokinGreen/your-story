/**
 * Subscription System Types and Constants
 *
 * Tier Structure:
 * - Free: 100 coins/week, no BYOK
 * - Starter ($10/mo): 700 coins/week + BYOK
 * - Pro ($15/mo): 1200 coins/week + BYOK
 * - Premium ($30/mo): 2800 coins/week + BYOK
 */

// ============================================
// TYPES
// ============================================

export type SubscriptionTier = "free" | "starter" | "pro" | "premium";
export type SubscriptionStatus =
  | "active"
  | "canceled"
  | "past_due"
  | "trialing"
  | "incomplete";

export interface SubscriptionTierConfig {
  id: SubscriptionTier;
  name: string;
  priceMonthly: number; // in dollars
  weeklyCoins: number;
  byokAccess: boolean;
  description: string;
  features: string[];
  stripePriceId?: string; // Set from environment variables
}

export interface UserSubscription {
  id: string;
  userId: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  weeklyCoinsAllowance: number;
  coinsLastRefill: string;
  coinsThisWeek: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// TIER CONFIGURATION
// ============================================

export const SUBSCRIPTION_TIERS: Record<
  SubscriptionTier,
  SubscriptionTierConfig
> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    weeklyCoins: 100,
    byokAccess: false,
    description: "Try out the platform with limited coins",
    features: [
      "100 coins per week",
      "Access to all Coins models",
      "Save and sync stories",
      "Basic support",
    ],
  },
  starter: {
    id: "starter",
    name: "Starter",
    priceMonthly: 10,
    weeklyCoins: 700,
    byokAccess: true,
    description: "For casual players who want BYOK access",
    features: [
      "700 coins per week",
      "BYOK (Bring Your Own Key) access",
      "Use your own OpenRouter/DeepSeek keys",
      "Priority support",
      "All free features",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthly: 15,
    weeklyCoins: 1200,
    byokAccess: true,
    description: "For regular players",
    features: [
      "1,200 coins per week",
      "BYOK access",
      "Extended story history",
      "Priority support",
      "All Starter features",
    ],
  },
  premium: {
    id: "premium",
    name: "Premium",
    priceMonthly: 30,
    weeklyCoins: 2800,
    byokAccess: true,
    description: "For power users and daily players",
    features: [
      "2,800 coins per week",
      "BYOK access",
      "Unlimited story history",
      "Early access to new features",
      "Premium support",
      "All Pro features",
    ],
  },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get the configuration for a subscription tier
 */
export function getTierConfig(tier: SubscriptionTier): SubscriptionTierConfig {
  return SUBSCRIPTION_TIERS[tier] || SUBSCRIPTION_TIERS.free;
}

/**
 * Get weekly coin allowance for a tier
 */
export function getWeeklyCoins(tier: SubscriptionTier): number {
  return getTierConfig(tier).weeklyCoins;
}

/**
 * Check if a tier has BYOK access
 */
export function hasByokAccess(tier: SubscriptionTier): boolean {
  return getTierConfig(tier).byokAccess;
}

/**
 * Get all paid tiers (for upgrade prompts)
 */
export function getPaidTiers(): SubscriptionTierConfig[] {
  return Object.values(SUBSCRIPTION_TIERS).filter(
    (tier) => tier.priceMonthly > 0
  );
}

/**
 * Get the next upgrade tier
 */
export function getUpgradeTier(
  currentTier: SubscriptionTier
): SubscriptionTier | null {
  const tierOrder: SubscriptionTier[] = ["free", "starter", "pro", "premium"];
  const currentIndex = tierOrder.indexOf(currentTier);
  if (currentIndex < tierOrder.length - 1) {
    return tierOrder[currentIndex + 1];
  }
  return null;
}

/**
 * Calculate approximate turns per week based on coin allowance
 * Assumes ~25-30 coins per turn on average with cheap models
 */
export function estimateTurnsPerWeek(tier: SubscriptionTier): {
  min: number;
  max: number;
} {
  const coins = getWeeklyCoins(tier);
  return {
    min: Math.floor(coins / 30),
    max: Math.floor(coins / 25),
  };
}

/**
 * Check if a refill is needed (7 days since last refill)
 */
export function needsWeeklyRefill(lastRefill: string | Date): boolean {
  const lastRefillDate = new Date(lastRefill);
  const now = new Date();
  const daysSinceRefill =
    (now.getTime() - lastRefillDate.getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceRefill >= 7;
}

/**
 * Get days until next refill
 */
export function getDaysUntilRefill(lastRefill: string | Date): number {
  const lastRefillDate = new Date(lastRefill);
  const nextRefill = new Date(
    lastRefillDate.getTime() + 7 * 24 * 60 * 60 * 1000
  );
  const now = new Date();
  const daysRemaining = Math.ceil(
    (nextRefill.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  return Math.max(0, daysRemaining);
}

/**
 * Format price for display
 */
export function formatPrice(tier: SubscriptionTier): string {
  const config = getTierConfig(tier);
  if (config.priceMonthly === 0) {
    return "Free";
  }
  return `$${config.priceMonthly}/mo`;
}

// ============================================
// STRIPE CONFIGURATION
// ============================================

// These should be set from environment variables in production
export interface StripeConfig {
  publishableKey: string;
  priceIds: Record<SubscriptionTier, string | undefined>;
}

/**
 * Get Stripe price ID for a tier
 * Returns undefined for free tier (no Stripe product)
 */
export function getStripePriceId(tier: SubscriptionTier): string | undefined {
  if (tier === "free") return undefined;

  // These environment variables should be set in .env.local
  const priceIds: Record<SubscriptionTier, string | undefined> = {
    free: undefined,
    starter: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER,
    pro: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO,
    premium: process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM,
  };

  return priceIds[tier];
}

// ============================================
// CONSTANTS
// ============================================

// Refill interval in days
export const REFILL_INTERVAL_DAYS = 7;

// Grace period after subscription expires (in days)
export const SUBSCRIPTION_GRACE_PERIOD_DAYS = 3;

// Default tier for new users
export const DEFAULT_TIER: SubscriptionTier = "free";

// Minimum tier required for BYOK access
export const BYOK_MINIMUM_TIER: SubscriptionTier = "starter";

// ============================================
// COIN PACKAGES (One-time purchases for subscribers)
// ============================================

export interface CoinPackage {
  id: string;
  name: string;
  coins: number;
  price: number; // in dollars
  bonusPercent: number;
  stripePriceId?: string;
}

export const COIN_PACKAGES: CoinPackage[] = [
  { id: "coins_500", name: "500 Coins", coins: 500, price: 5, bonusPercent: 0 },
  {
    id: "coins_1200",
    name: "1,200 Coins",
    coins: 1200,
    price: 10,
    bonusPercent: 20,
  },
  {
    id: "coins_2500",
    name: "2,500 Coins",
    coins: 2500,
    price: 20,
    bonusPercent: 25,
  },
  {
    id: "coins_5500",
    name: "5,500 Coins",
    coins: 5500,
    price: 40,
    bonusPercent: 37,
  },
];

/**
 * Get coin package by ID
 */
export function getCoinPackage(id: string): CoinPackage | undefined {
  return COIN_PACKAGES.find((pkg) => pkg.id === id);
}
