"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useAuth } from "./AuthContext";
import { supabase } from "./supabase";
import {
  UserSubscription,
  SubscriptionTier,
  SubscriptionTierConfig,
  SUBSCRIPTION_TIERS,
  COIN_PACKAGES,
  CoinPackage,
  getDaysUntilRefill,
  hasByokAccess as checkByokAccess,
} from "./subscriptions";

export interface SubscriptionContextType {
  // Subscription state
  subscription: UserSubscription | null;
  tierConfig: SubscriptionTierConfig | null;
  isLoading: boolean;
  error: string | null;

  // Computed properties
  tier: SubscriptionTier;
  hasByokAccess: boolean;
  weeklyCoins: number;
  daysUntilRefill: number;
  canBuyCoins: boolean;
  coinPackages: CoinPackage[];

  // Actions
  refreshSubscription: () => Promise<void>;
  startCheckout: (tier: SubscriptionTier) => Promise<void>;
  openCustomerPortal: () => Promise<void>;
  purchaseCoins: (packageId: string) => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(
  undefined
);

export function SubscriptionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<UserSubscription | null>(
    null
  );
  const [tierConfig, setTierConfig] = useState<SubscriptionTierConfig | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch subscription from API
  const refreshSubscription = useCallback(async () => {
    if (!user) {
      setSubscription(null);
      setTierConfig(SUBSCRIPTION_TIERS.free);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setSubscription(null);
        setTierConfig(SUBSCRIPTION_TIERS.free);
        setIsLoading(false);
        return;
      }

      const response = await fetch("/api/subscriptions", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch subscription");
      }

      const data = await response.json();
      setSubscription(data.subscription);
      setTierConfig(data.tierConfig);
    } catch (err) {
      console.error("Error fetching subscription:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load subscription"
      );
      // Default to free tier on error
      setTierConfig(SUBSCRIPTION_TIERS.free);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Load subscription when user changes
  useEffect(() => {
    refreshSubscription();
  }, [refreshSubscription]);

  // Start checkout for a specific tier
  const startCheckout = useCallback(
    async (tier: SubscriptionTier) => {
      if (!user) {
        setError("Please sign in to subscribe");
        return;
      }

      if (tier === "free") {
        setError("Cannot checkout free tier");
        return;
      }

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          setError("Session expired. Please sign in again.");
          return;
        }

        const response = await fetch("/api/subscriptions/checkout", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ tier }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to create checkout");
        }

        const { url } = await response.json();
        if (url) {
          window.location.href = url;
        }
      } catch (err) {
        console.error("Error starting checkout:", err);
        setError(
          err instanceof Error ? err.message : "Failed to start checkout"
        );
      }
    },
    [user]
  );

  // Open Stripe customer portal
  const openCustomerPortal = useCallback(async () => {
    if (!user || !subscription?.stripeCustomerId) {
      setError("No active subscription to manage");
      return;
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setError("Session expired. Please sign in again.");
        return;
      }

      const response = await fetch("/api/subscriptions/portal", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to open portal");
      }

      const { url } = await response.json();
      if (url) {
        window.location.href = url;
      }
    } catch (err) {
      console.error("Error opening portal:", err);
      setError(err instanceof Error ? err.message : "Failed to open portal");
    }
  }, [user, subscription]);

  // Purchase coin package (one-time purchase for subscribers)
  const purchaseCoins = useCallback(
    async (packageId: string) => {
      if (!user) {
        setError("Please sign in to purchase coins");
        return;
      }

      if (!subscription || subscription.tier === "free") {
        setError("Coin purchases require an active subscription");
        return;
      }

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          setError("Session expired. Please sign in again.");
          return;
        }

        const response = await fetch("/api/subscriptions/coins", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ packageId }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to create checkout");
        }

        const { url } = await response.json();
        if (url) {
          window.location.href = url;
        }
      } catch (err) {
        console.error("Error purchasing coins:", err);
        setError(
          err instanceof Error ? err.message : "Failed to purchase coins"
        );
      }
    },
    [user, subscription]
  );

  // Computed values
  const currentTier: SubscriptionTier = subscription?.tier || "free";
  const hasByokAccess = checkByokAccess(currentTier);
  const weeklyCoins = tierConfig?.weeklyCoins || 100;
  const daysUntilRefill = subscription?.coinsLastRefill
    ? getDaysUntilRefill(subscription.coinsLastRefill)
    : 7;
  const canBuyCoins =
    currentTier !== "free" && subscription?.status === "active";

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        tierConfig,
        isLoading,
        error,
        tier: currentTier,
        hasByokAccess,
        weeklyCoins,
        daysUntilRefill,
        canBuyCoins,
        coinPackages: COIN_PACKAGES,
        refreshSubscription,
        startCheckout,
        openCustomerPortal,
        purchaseCoins,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error(
      "useSubscription must be used within a SubscriptionProvider"
    );
  }
  return context;
}
