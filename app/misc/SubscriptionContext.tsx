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
  getDaysUntilRefill,
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

  // Actions
  refreshSubscription: () => Promise<void>;
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

  // Computed values
  const currentTier: SubscriptionTier = subscription?.tier || "free";
  // BYOK is force-enabled for everyone - there's no purchase flow left to
  // reach a paid tier, so gating it by tier would silently break BYOK for
  // all users rather than just paid ones.
  const hasByokAccess = true;
  const weeklyCoins = tierConfig?.weeklyCoins || 100;
  const daysUntilRefill = subscription?.coinsLastRefill
    ? getDaysUntilRefill(subscription.coinsLastRefill)
    : 7;

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
        refreshSubscription,
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
