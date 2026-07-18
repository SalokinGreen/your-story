"use client";

import { useState } from "react";
import { MODEL_PRESETS, getPresetCostBreakdown } from "../misc/ai_prices";
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

/**
 * Info tabs component showing AI presets.
 */
export default function InfoTabs() {
  const [expandedPreset, setExpandedPreset] = useState<string | null>(null);

  return (
    <div className="w-full max-w-4xl mx-auto mb-8">
      {/* Tab Content */}
      <div className="bg-blue-950/30 rounded-xl border border-blue-800/30 p-4">
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
                            ~${costBreakdown.generationCost.toFixed(4)}/turn
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
              Custom preset available in-game for full model control. Bring your
              own API key - no accounts or coins required.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
