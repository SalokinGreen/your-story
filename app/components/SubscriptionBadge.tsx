"use client";

import { useSubscription } from "@/app/misc/SubscriptionContext";
import { DynamicIcon } from "./DynamicIcon";

interface SubscriptionBadgeProps {
  showCoins?: boolean;
  compact?: boolean;
  onClick?: () => void;
}

export default function SubscriptionBadge({
  showCoins = true,
  compact = false,
  onClick,
}: SubscriptionBadgeProps) {
  const { tier, subscription, tierConfig, isLoading } = useSubscription();

  if (isLoading) {
    return <div className="animate-pulse bg-blue-950/50 rounded-lg h-8 w-24" />;
  }

  const tierColors: Record<string, string> = {
    free: "bg-gray-500/20 text-gray-300 border-gray-500/30",
    starter: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    pro: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    premium: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  };

  const tierIcons: Record<string, string> = {
    free: "User",
    starter: "Zap",
    pro: "Crown",
    premium: "Gem",
  };

  if (compact) {
    return (
      <button
        onClick={onClick}
        className={`px-2 py-1 rounded-md text-xs font-medium border flex items-center gap-1 transition-colors hover:opacity-80 ${tierColors[tier]}`}
      >
        <DynamicIcon name={tierIcons[tier]} className="w-3 h-3" />
        {tierConfig?.name || "Free"}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium border flex items-center gap-2 transition-colors hover:opacity-80 ${tierColors[tier]}`}
    >
      <DynamicIcon name={tierIcons[tier]} className="w-4 h-4" />
      <span>{tierConfig?.name || "Free"}</span>
      {showCoins && subscription && (
        <>
          <span className="text-current/40">•</span>
          <span className="flex items-center gap-1">
            <DynamicIcon name="Coins" className="w-3.5 h-3.5 text-yellow-400" />
            {subscription.coinsThisWeek}
          </span>
        </>
      )}
    </button>
  );
}
