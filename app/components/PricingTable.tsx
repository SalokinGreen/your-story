"use client";

import { useState } from "react";
import { useSubscription } from "@/app/misc/SubscriptionContext";
import { SUBSCRIPTION_TIERS, SubscriptionTier } from "@/app/misc/subscriptions";
import { DynamicIcon } from "./DynamicIcon";

interface PricingTableProps {
  onClose?: () => void;
  highlightTier?: SubscriptionTier;
}

export default function PricingTable({
  onClose,
  highlightTier,
}: PricingTableProps) {
  const { tier: currentTier, startCheckout, isLoading } = useSubscription();
  const [loadingTier, setLoadingTier] = useState<SubscriptionTier | null>(null);

  const tiers = Object.values(SUBSCRIPTION_TIERS);

  const tierIcons: Record<SubscriptionTier, string> = {
    free: "User",
    starter: "Zap",
    pro: "Crown",
    premium: "Gem",
  };

  const tierColors: Record<
    SubscriptionTier,
    { gradient: string; border: string; glow: string }
  > = {
    free: {
      gradient: "from-gray-600 to-gray-700",
      border: "border-gray-500/30",
      glow: "",
    },
    starter: {
      gradient: "from-blue-600 to-blue-700",
      border: "border-blue-500/50",
      glow: "",
    },
    pro: {
      gradient: "from-purple-600 to-purple-700",
      border: "border-purple-500/50",
      glow: "shadow-purple-500/20",
    },
    premium: {
      gradient: "from-amber-500 to-amber-600",
      border: "border-amber-500/50",
      glow: "shadow-amber-500/30",
    },
  };

  const handleSubscribe = async (tier: SubscriptionTier) => {
    if (tier === "free" || tier === currentTier) return;

    setLoadingTier(tier);
    try {
      await startCheckout(tier);
    } finally {
      setLoadingTier(null);
    }
  };

  return (
    <div className="py-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Choose Your Plan</h2>
        <p className="text-blue-200/60">
          Get more coins, unlock BYOK access, and support development
        </p>
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto px-4 items-stretch">
        {tiers.map((tier) => {
          const colors = tierColors[tier.id];
          const isCurrentTier = tier.id === currentTier;
          const isHighlighted = tier.id === highlightTier;
          const isPopular = tier.id === "pro";

          return (
            <div
              key={tier.id}
              className={`relative bg-blue-950/50 rounded-xl border overflow-hidden transition-all flex flex-col ${
                colors.border
              } ${
                isHighlighted || isPopular ? `shadow-lg ${colors.glow}` : ""
              } ${isCurrentTier ? "ring-2 ring-green-500/50" : ""}`}
            >
              {/* Popular Badge */}
              {isPopular && !isCurrentTier && (
                <div className="absolute top-0 right-0 bg-purple-500 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
                  Popular
                </div>
              )}

              {/* Current Plan Badge */}
              {isCurrentTier && (
                <div className="absolute top-0 right-0 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
                  Current
                </div>
              )}

              {/* Header */}
              <div className={`bg-linear-to-br ${colors.gradient} px-4 py-4`}>
                <div className="flex items-center gap-2 mb-2">
                  <DynamicIcon
                    name={tierIcons[tier.id]}
                    className="w-6 h-6 text-white"
                  />
                  <h3 className="text-xl font-bold text-white">{tier.name}</h3>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-white">
                    {tier.priceMonthly === 0 ? "Free" : `$${tier.priceMonthly}`}
                  </span>
                  {tier.priceMonthly > 0 && (
                    <span className="text-white/60 text-sm">/month</span>
                  )}
                </div>
                <p className="text-white/60 text-sm mt-1 min-h-10">{tier.description}</p>
              </div>

              {/* Content */}
              <div className="p-4 flex flex-col flex-1">
                {/* Coins Highlight */}
                <div className="bg-blue-900/30 rounded-lg p-3 mb-4 text-center">
                  <div className="flex items-center justify-center gap-2 text-yellow-400 mb-1">
                    <DynamicIcon name="Coins" className="w-5 h-5" />
                    <span className="text-2xl font-bold">
                      {tier.weeklyCoins}
                    </span>
                  </div>
                  <p className="text-xs text-blue-200/40">coins per week</p>
                </div>

                {/* Features */}
                <ul className="space-y-2 mb-4 flex-1">
                  {tier.features.map((feature, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-blue-200/80"
                    >
                      <DynamicIcon
                        name="Check"
                        className="w-4 h-4 text-green-400 shrink-0 mt-0.5"
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* Action Button */}
                {tier.id === "free" ? (
                  <button
                    disabled
                    className="w-full px-4 py-2.5 bg-gray-600/50 text-gray-400 font-medium rounded-lg cursor-not-allowed"
                  >
                    {isCurrentTier ? "Current Plan" : "Free Plan"}
                  </button>
                ) : isCurrentTier ? (
                  <button
                    disabled
                    className="w-full px-4 py-2.5 bg-green-600/50 text-green-200 font-medium rounded-lg cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <DynamicIcon name="Check" className="w-4 h-4" />
                    Current Plan
                  </button>
                ) : (
                  <button
                    onClick={() => handleSubscribe(tier.id)}
                    disabled={isLoading || loadingTier === tier.id}
                    className={`w-full px-4 py-2.5 font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
                      tier.id === "premium"
                        ? "bg-linear-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white"
                        : tier.id === "pro"
                        ? "bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {loadingTier === tier.id ? (
                      <>
                        <DynamicIcon
                          name="Loader2"
                          className="w-4 h-4 animate-spin"
                        />
                        Processing...
                      </>
                    ) : currentTier !== "free" &&
                      SUBSCRIPTION_TIERS[currentTier].priceMonthly >
                        tier.priceMonthly ? (
                      "Downgrade"
                    ) : (
                      <>
                        <DynamicIcon name="ArrowUp" className="w-4 h-4" />
                        {currentTier === "free" ? "Subscribe" : "Upgrade"}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="text-center mt-8 px-4">
        <p className="text-sm text-blue-200/40 mb-4">
          All plans include access to all Coins models. BYOK lets you use your
          own API keys.
        </p>
        <div className="flex flex-wrap justify-center gap-4 text-xs text-blue-200/30">
          <span className="flex items-center gap-1">
            <DynamicIcon name="CreditCard" className="w-3.5 h-3.5" />
            Secure payment via Stripe
          </span>
          <span className="flex items-center gap-1">
            <DynamicIcon name="RefreshCw" className="w-3.5 h-3.5" />
            Cancel anytime
          </span>
          <span className="flex items-center gap-1">
            <DynamicIcon name="Coins" className="w-3.5 h-3.5" />
            Coins refill weekly
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="mt-6 px-6 py-2 text-blue-200/60 hover:text-blue-200 transition-colors"
          >
            Maybe later
          </button>
        )}
      </div>
    </div>
  );
}
