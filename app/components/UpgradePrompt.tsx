"use client";

import { useState } from "react";
import { useSubscription } from "@/app/misc/SubscriptionContext";
import { DynamicIcon } from "./DynamicIcon";
import PricingTable from "./PricingTable";

interface UpgradePromptProps {
  reason?: "coins" | "byok" | "general";
  compact?: boolean;
  onDismiss?: () => void;
}

export default function UpgradePrompt({
  reason = "general",
  compact = false,
  onDismiss,
}: UpgradePromptProps) {
  const { tier, tierConfig, startCheckout } = useSubscription();
  const [showPricing, setShowPricing] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  // Don't show for premium users
  if (tier === "premium") return null;

  const messages = {
    coins: {
      title: "Running low on coins?",
      description: "Upgrade for more weekly coins and BYOK access",
      icon: "Coins",
    },
    byok: {
      title: "Want to use your own API keys?",
      description: "BYOK access is available on paid plans",
      icon: "Key",
    },
    general: {
      title: "Get more from Your Story",
      description: "Upgrade for more coins and unlock BYOK",
      icon: "Sparkles",
    },
  };

  const message = messages[reason];

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  if (showPricing) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-blue-950 rounded-2xl border border-blue-800/30 max-w-6xl w-full max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-blue-950 border-b border-blue-800/30 px-4 py-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Choose Your Plan</h2>
            <button
              onClick={() => setShowPricing(false)}
              className="p-1.5 hover:bg-blue-900/50 rounded-lg transition-colors"
            >
              <DynamicIcon name="X" className="w-5 h-5 text-blue-200/60" />
            </button>
          </div>
          <PricingTable onClose={() => setShowPricing(false)} />
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-purple-500/10 border border-purple-500/20 rounded-lg">
        <DynamicIcon
          name={message.icon}
          className="w-4 h-4 text-purple-400 shrink-0"
        />
        <span className="text-sm text-purple-200 flex-1">{message.title}</span>
        <button
          onClick={() => setShowPricing(true)}
          className="px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded transition-colors"
        >
          Upgrade
        </button>
        {onDismiss && (
          <button
            onClick={handleDismiss}
            className="p-1 hover:bg-purple-500/20 rounded transition-colors"
          >
            <DynamicIcon name="X" className="w-3.5 h-3.5 text-purple-300" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-linear-to-br from-purple-500/10 via-pink-500/10 to-blue-500/10 border border-purple-500/20 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0">
          <DynamicIcon
            name={message.icon}
            className="w-5 h-5 text-purple-400"
          />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-white mb-1">{message.title}</h3>
          <p className="text-sm text-blue-200/60 mb-3">{message.description}</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPricing(true)}
              className="px-4 py-2 bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
            >
              <DynamicIcon name="ArrowUp" className="w-4 h-4" />
              View Plans
            </button>
            {tier !== "free" && (
              <button
                onClick={() =>
                  startCheckout(tier === "starter" ? "pro" : "premium")
                }
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Quick Upgrade
              </button>
            )}
            {onDismiss && (
              <button
                onClick={handleDismiss}
                className="px-3 py-2 text-blue-200/60 hover:text-blue-200 text-sm transition-colors"
              >
                Not now
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Current plan info */}
      <div className="mt-4 pt-3 border-t border-purple-500/10 flex items-center justify-between text-xs text-blue-200/40">
        <span>
          Current plan:{" "}
          <span className="text-blue-200/60">{tierConfig?.name}</span>
        </span>
        <span>{tierConfig?.weeklyCoins} coins/week</span>
      </div>
    </div>
  );
}
