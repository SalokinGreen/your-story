"use client";

import { useState } from "react";
import { MODEL_PRESETS, getPresetCostBreakdown } from "../misc/ai_prices";
import { SUBSCRIPTION_TIERS, SubscriptionTier } from "../misc/subscriptions";
import { StaticIcon } from "./StaticIcon";

// Preset icons and colors
const PRESET_STYLES: Record<
  string,
  { icon: string; gradient: string; accent: string }
> = {
  main: {
    icon: "Sparkles",
    gradient: "from-blue-500 to-purple-600",
    accent: "blue",
  },
  mainBrain: {
    icon: "Brain",
    gradient: "from-purple-500 to-pink-600",
    accent: "purple",
  },
  speed: {
    icon: "Zap",
    gradient: "from-amber-500 to-orange-600",
    accent: "amber",
  },
  custom: {
    icon: "Settings",
    gradient: "from-gray-500 to-slate-600",
    accent: "gray",
  },
};

// Subscription tier styles
const TIER_STYLES: Record<
  SubscriptionTier,
  { icon: string; gradient: string; popular?: boolean }
> = {
  free: { icon: "User", gradient: "from-gray-500 to-gray-600" },
  starter: { icon: "Zap", gradient: "from-blue-500 to-blue-600" },
  pro: {
    icon: "Crown",
    gradient: "from-purple-500 to-pink-600",
    popular: true,
  },
  premium: { icon: "Gem", gradient: "from-amber-500 to-orange-600" },
};

/**
 * Info tabs component showing AI presets and subscription plans.
 */
export default function InfoTabs() {
  const [activeTab, setActiveTab] = useState<"presets" | "plans">("plans");
  const [expandedPreset, setExpandedPreset] = useState<string | null>(null);

  const tiers = Object.values(SUBSCRIPTION_TIERS);

  return (
    <div className="w-full max-w-4xl mx-auto mb-8">
      {/* Tab Navigation */}
      <div className="flex justify-center mb-4">
        <div className="inline-flex bg-blue-950/50 rounded-lg p-1 border border-blue-800/30 gap-1">
          <button
            onClick={() => setActiveTab("presets")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === "presets"
                ? "bg-blue-600 text-white"
                : "text-blue-200/60 hover:text-blue-200"
            }`}
          >
            <StaticIcon name="Layers" className="w-4 h-4" /> AI Presets
          </button>
          <button
            onClick={() => setActiveTab("plans")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === "plans"
                ? "bg-blue-600 text-white"
                : "text-blue-200/60 hover:text-blue-200"
            }`}
          >
            <StaticIcon name="CreditCard" className="w-4 h-4" /> Plans
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="bg-blue-950/30 rounded-xl border border-blue-800/30 p-4">
        {activeTab === "presets" && (
          <div className="space-y-4">
            <p className="text-center text-sm text-blue-200/60 mb-4">
              Choose an AI preset that matches your playstyle
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              {Object.entries(MODEL_PRESETS)
                .filter(([key]) => key !== "custom")
                .map(([key, preset]) => {
                  const style = PRESET_STYLES[key] || PRESET_STYLES.main;
                  const isExpanded = expandedPreset === key;
                  const costBreakdown = getPresetCostBreakdown(key);

                  return (
                    <div
                      key={key}
                      className={`relative bg-blue-950/50 rounded-xl border transition-all cursor-pointer overflow-hidden w-full sm:w-64 ${
                        isExpanded
                          ? "border-blue-500 ring-2 ring-blue-500/30"
                          : "border-blue-800/30 hover:border-blue-600/50"
                      }`}
                      onClick={() => setExpandedPreset(isExpanded ? null : key)}
                    >
                      {/* Gradient header */}
                      <div className={`h-2 bg-linear-to-r ${style.gradient}`} />

                      <div className="p-4">
                        {/* Icon and name */}
                        <div className="flex items-center gap-3 mb-3">
                          <div
                            className={`w-10 h-10 rounded-lg bg-linear-to-br ${style.gradient} flex items-center justify-center shadow-lg`}
                          >
                            <StaticIcon
                              name={style.icon}
                              className="w-5 h-5 text-white"
                            />
                          </div>
                          <div>
                            <h3 className="font-bold text-white">
                              {preset.name}
                            </h3>
                            <p className="text-xs text-blue-200/50">
                              ~{costBreakdown.generationCost} coins/turn
                            </p>
                          </div>
                        </div>

                        {/* Description */}
                        <p className="text-sm text-blue-200/70 mb-3">
                          {preset.description}
                        </p>

                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="pt-3 border-t border-blue-800/30 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-blue-200/50 w-16">
                                Story:
                              </span>
                              <span className="text-white font-medium">
                                {preset.storyModel}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-blue-200/50 w-16">
                                Tools:
                              </span>
                              <span className="text-white font-medium">
                                {preset.toolsModel}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-blue-200/50 w-16">
                                Choices:
                              </span>
                              <span className="text-white font-medium">
                                {preset.choicesModel}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Expand indicator */}
                        <div className="flex justify-center mt-2">
                          <StaticIcon
                            name={isExpanded ? "ChevronUp" : "ChevronDown"}
                            className="w-4 h-4 text-blue-200/40"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Custom preset note */}
            <div className="text-center pt-2">
              <p className="text-xs text-blue-200/40">
                <StaticIcon name="Settings" className="w-3 h-3 inline mr-1" />
                Custom preset available in-game for full model control
              </p>
            </div>
          </div>
        )}

        {activeTab === "plans" && (
          <div className="space-y-4">
            <p className="text-center text-sm text-blue-200/60 mb-4">
              Choose a plan that fits your storytelling needs
            </p>

            {/* Subscription Tiers */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {tiers.map((tier) => {
                const style = TIER_STYLES[tier.id];

                return (
                  <div
                    key={tier.id}
                    className={`relative bg-blue-950/50 rounded-xl border overflow-hidden transition-all ${
                      style.popular
                        ? "border-purple-500 ring-1 ring-purple-500/30"
                        : "border-blue-800/30"
                    }`}
                  >
                    {/* Popular badge */}
                    {style.popular && (
                      <div className="absolute top-0 right-0 bg-purple-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl">
                        Popular
                      </div>
                    )}

                    {/* Gradient header */}
                    <div className={`h-1.5 bg-linear-to-r ${style.gradient}`} />

                    <div className="p-3">
                      {/* Icon and name */}
                      <div className="flex items-center gap-2 mb-2">
                        <div
                          className={`w-8 h-8 rounded-lg bg-linear-to-br ${style.gradient} flex items-center justify-center`}
                        >
                          <StaticIcon
                            name={style.icon}
                            className="w-4 h-4 text-white"
                          />
                        </div>
                        <div>
                          <h3 className="font-bold text-white text-sm">
                            {tier.name}
                          </h3>
                          <p className="text-xs text-blue-200/50">
                            {tier.priceMonthly === 0
                              ? "Free"
                              : `$${tier.priceMonthly}/mo`}
                          </p>
                        </div>
                      </div>

                      {/* Coins highlight */}
                      <div className="bg-blue-900/30 rounded-lg p-2 mb-2 text-center">
                        <div className="flex items-center justify-center gap-1 text-yellow-400">
                          <StaticIcon name="Coins" className="w-4 h-4" />
                          <span className="text-lg font-bold">
                            {tier.weeklyCoins}
                          </span>
                        </div>
                        <p className="text-[10px] text-blue-200/40">
                          coins/week
                        </p>
                      </div>

                      {/* Key features */}
                      <ul className="space-y-1">
                        {tier.features.slice(0, 3).map((feature, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-1.5 text-[11px] text-blue-200/70"
                          >
                            <StaticIcon
                              name="Check"
                              className="w-3 h-3 text-green-400 shrink-0 mt-0.5"
                            />
                            <span className="line-clamp-1">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer info */}
            <div className="flex flex-wrap justify-center gap-4 pt-2 text-xs text-blue-200/40">
              <span className="flex items-center gap-1">
                <StaticIcon name="CreditCard" className="w-3 h-3" />
                Secure via Stripe
              </span>
              <span className="flex items-center gap-1">
                <StaticIcon name="RefreshCw" className="w-3 h-3" />
                Cancel anytime
              </span>
              <span className="flex items-center gap-1">
                <StaticIcon name="Key" className="w-3 h-3" />
                BYOK on paid plans
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
