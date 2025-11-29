"use client";

import { useState } from "react";
import { MODEL_PRESETS, getPresetCostBreakdown } from "../misc/ai_prices";
import { StaticIcon } from "./StaticIcon";

// Coin packages (1 coin = $0.001)
const packages = [
  { name: "Basic", cost: 4.99, coins: 4990, bonus: 500, savings: 10 },
  { name: "Standard", cost: 9.99, coins: 9990, bonus: 1500, savings: 15 },
  { name: "Premium", cost: 19.99, coins: 19990, bonus: 4000, savings: 20 },
  { name: "Ultimate", cost: 49.99, coins: 49990, bonus: 12500, savings: 25 },
];

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

/**
 * Info tabs component showing AI presets, coin packages, and BYOK info.
 */
export default function InfoTabs() {
  const [activeTab, setActiveTab] = useState<"presets" | "coins" | "byok">(
    "presets"
  );
  const [expandedPreset, setExpandedPreset] = useState<string | null>(null);

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
            onClick={() => setActiveTab("coins")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === "coins"
                ? "bg-blue-600 text-white"
                : "text-blue-200/60 hover:text-blue-200"
            }`}
          >
            <StaticIcon name="Coins" className="w-4 h-4" /> Coins
          </button>
          <button
            onClick={() => setActiveTab("byok")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === "byok"
                ? "bg-blue-600 text-white"
                : "text-blue-200/60 hover:text-blue-200"
            }`}
          >
            <StaticIcon name="Key" className="w-4 h-4" /> BYOK
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

        {activeTab === "coins" && (
          <div className="space-y-4 max-w-2xl mx-auto">
            {/* Average cost info */}
            <div className="bg-blue-900/30 rounded-lg p-3 text-center border border-blue-700/30">
              <p className="text-sm text-blue-200/60 mb-1">
                Average cost per turn
              </p>
              <p className="text-2xl font-bold text-white">
                ~{getPresetCostBreakdown("main").generationCost} coins
              </p>
              <p className="text-xs text-blue-200/40 mt-1">
                Based on 120k context • Main preset
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {packages.map((pkg, index) => (
                <div
                  key={pkg.name}
                  className={`bg-blue-950/50 rounded-lg p-3 border transition-colors ${
                    index === 2
                      ? "border-purple-500 ring-1 ring-purple-500/50"
                      : "border-blue-800/30 hover:border-blue-600/50"
                  }`}
                >
                  <div className="text-center">
                    <h3 className="text-sm font-semibold text-white">
                      {pkg.name}
                    </h3>
                    <div className="text-2xl font-bold text-white mt-1">
                      ${pkg.cost}
                    </div>
                    <div className="text-lg text-blue-200">
                      {pkg.coins + pkg.bonus}
                    </div>
                    <div className="text-xs text-blue-200/40">coins</div>
                    {pkg.savings > 0 && (
                      <span className="inline-block mt-2 px-2 py-0.5 bg-green-500/20 text-green-300 text-xs rounded-full">
                        Save {pkg.savings}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "byok" && (
          <div className="text-center py-4">
            <div className="flex items-center justify-center gap-2 mb-2">
              <StaticIcon name="Key" className="w-6 h-6 text-purple-400" />
              <span className="text-xl font-bold text-white">$10/month</span>
            </div>
            <p className="text-sm text-blue-200/60 mb-3">
              Use your own OpenRouter & Speechify keys for unlimited generations
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <span className="px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded flex items-center gap-1">
                <StaticIcon name="Check" className="w-3 h-3" /> 100+ AI Models
              </span>
              <span className="px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded flex items-center gap-1">
                <StaticIcon name="Check" className="w-3 h-3" /> Unlimited TTS
              </span>
              <span className="px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded flex items-center gap-1">
                <StaticIcon name="Check" className="w-3 h-3" /> Full Control
              </span>
            </div>
            <p className="text-xs text-blue-200/40 mt-3">Coming Soon</p>
          </div>
        )}
      </div>
    </div>
  );
}
