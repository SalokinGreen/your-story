"use client";

import { useState } from "react";
import { useSubscription } from "@/app/misc/SubscriptionContext";
import { DynamicIcon } from "./DynamicIcon";
import BuyCoinsModal from "./BuyCoinsModal";

interface SubscriptionCardProps {
  onManage?: () => void;
  onUpgrade?: () => void;
}

export default function SubscriptionCard({
  onManage,
  onUpgrade,
}: SubscriptionCardProps) {
  const [showBuyCoins, setShowBuyCoins] = useState(false);
  const {
    tier,
    subscription,
    tierConfig,
    isLoading,
    hasByokAccess,
    daysUntilRefill,
    canBuyCoins,
    openCustomerPortal,
  } = useSubscription();

  if (isLoading) {
    return (
      <div className="bg-blue-950/50 rounded-xl border border-blue-800/30 p-4 animate-pulse">
        <div className="h-6 bg-blue-900/50 rounded w-32 mb-3" />
        <div className="h-4 bg-blue-900/50 rounded w-48 mb-4" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-16 bg-blue-900/50 rounded" />
          <div className="h-16 bg-blue-900/50 rounded" />
        </div>
      </div>
    );
  }

  const tierColors: Record<
    string,
    { bg: string; border: string; icon: string }
  > = {
    free: {
      bg: "from-gray-600 to-gray-700",
      border: "border-gray-500/30",
      icon: "User",
    },
    starter: {
      bg: "from-blue-600 to-blue-700",
      border: "border-blue-500/30",
      icon: "Zap",
    },
    pro: {
      bg: "from-purple-600 to-purple-700",
      border: "border-purple-500/30",
      icon: "Crown",
    },
    premium: {
      bg: "from-amber-500 to-amber-600",
      border: "border-amber-500/30",
      icon: "Gem",
    },
  };

  const colors = tierColors[tier];
  const coinsUsed =
    (tierConfig?.weeklyCoins || 100) - (subscription?.coinsThisWeek || 0);
  const coinsPercent =
    ((subscription?.coinsThisWeek || 0) / (tierConfig?.weeklyCoins || 100)) *
    100;

  return (
    <div
      className={`bg-blue-950/50 rounded-xl border ${colors.border} overflow-hidden`}
    >
      {/* Header */}
      <div className={`bg-linear-to-r ${colors.bg} px-4 py-3`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DynamicIcon name={colors.icon} className="w-5 h-5 text-white" />
            <span className="text-lg font-bold text-white">
              {tierConfig?.name} Plan
            </span>
          </div>
          {tier !== "free" && subscription?.status && (
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                subscription.status === "active"
                  ? "bg-green-500/20 text-green-200"
                  : subscription.status === "canceled"
                  ? "bg-red-500/20 text-red-200"
                  : "bg-yellow-500/20 text-yellow-200"
              }`}
            >
              {subscription.status.charAt(0).toUpperCase() +
                subscription.status.slice(1)}
            </span>
          )}
        </div>
        {tier !== "free" && tierConfig && (
          <p className="text-white/60 text-sm mt-1">
            ${tierConfig.priceMonthly}/month
          </p>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Coins Status */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-blue-200/60">Weekly Coins</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white">
                {subscription?.coinsThisWeek ?? tierConfig?.weeklyCoins ?? 100}{" "}
                / {tierConfig?.weeklyCoins ?? 100}
              </span>
              {canBuyCoins && (
                <button
                  onClick={() => setShowBuyCoins(true)}
                  className="px-2 py-0.5 text-xs bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 rounded transition-colors flex items-center gap-1"
                >
                  <DynamicIcon name="Plus" className="w-3 h-3" />
                  Buy
                </button>
              )}
            </div>
          </div>
          <div className="h-2 bg-blue-900/50 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                coinsPercent > 50
                  ? "bg-green-500"
                  : coinsPercent > 20
                  ? "bg-yellow-500"
                  : "bg-red-500"
              }`}
              style={{ width: `${coinsPercent}%` }}
            />
          </div>
          <p className="text-xs text-blue-200/40 mt-1.5 text-right">
            Refills in {daysUntilRefill} day{daysUntilRefill !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-blue-900/30 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 text-yellow-400 mb-1">
              <DynamicIcon name="Coins" className="w-4 h-4" />
              <span className="text-lg font-bold">{coinsUsed}</span>
            </div>
            <p className="text-xs text-blue-200/40">Used this week</p>
          </div>
          <div className="bg-blue-900/30 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 text-blue-400 mb-1">
              <DynamicIcon name="Key" className="w-4 h-4" />
              <span className="text-lg font-bold">
                {hasByokAccess ? "Yes" : "No"}
              </span>
            </div>
            <p className="text-xs text-blue-200/40">BYOK Access</p>
          </div>
        </div>

        {/* Features */}
        {tierConfig?.features && (
          <div className="mb-4">
            <h4 className="text-xs font-medium text-blue-200/40 uppercase tracking-wider mb-2">
              Included Features
            </h4>
            <ul className="space-y-1.5">
              {tierConfig.features.slice(0, 4).map((feature, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 text-sm text-blue-200/80"
                >
                  <DynamicIcon
                    name="Check"
                    className="w-3.5 h-3.5 text-green-400 shrink-0"
                  />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {tier === "free" ? (
            <button
              onClick={onUpgrade}
              className="flex-1 px-4 py-2.5 bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-medium rounded-lg transition-all flex items-center justify-center gap-2"
            >
              <DynamicIcon name="ArrowUp" className="w-4 h-4" />
              Upgrade
            </button>
          ) : subscription?.stripeCustomerId ? (
            // Has Stripe subscription - show Manage button
            <>
              <button
                onClick={onManage || openCustomerPortal}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <DynamicIcon name="Settings" className="w-4 h-4" />
                Manage
              </button>
              {tier !== "premium" && (
                <button
                  onClick={onUpgrade}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <DynamicIcon name="ArrowUp" className="w-4 h-4" />
                </button>
              )}
            </>
          ) : (
            // Admin-granted subscription - show info instead
            <div className="flex-1 px-4 py-2 bg-green-600/20 border border-green-500/30 text-green-300 font-medium rounded-lg flex items-center justify-center gap-2 text-sm">
              <DynamicIcon name="Gift" className="w-4 h-4" />
              Gifted Subscription
              {subscription?.currentPeriodEnd && (
                <span className="text-green-300/60 ml-1">
                  · Expires{" "}
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Cancel Warning */}
        {subscription?.cancelAtPeriodEnd && subscription.currentPeriodEnd && (
          <div className="mt-3 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <p className="text-xs text-yellow-300 flex items-center gap-1.5">
              <DynamicIcon name="AlertTriangle" className="w-3.5 h-3.5" />
              Subscription ends{" "}
              {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
            </p>
          </div>
        )}
      </div>

      {/* Buy Coins Modal */}
      <BuyCoinsModal
        isOpen={showBuyCoins}
        onClose={() => setShowBuyCoins(false)}
      />
    </div>
  );
}
