"use client";

import { AI_MODELS } from "@/app/misc/ai_prices";
import { CustomModel } from "@/app/misc/user_settings";

/**
 * Model dropdown grouped by provider, with an extra "Custom" group for
 * user-added OpenRouter models. Used for reasoning-tier slots, the narration
 * voice (AIConfigTab.tsx), and the per-stage overrides in
 * ArchitectureSettingsTab.tsx. When `requireToolCalling` is set, models with
 * supportsToolCalling===false are excluded too (stages that call tools
 * mid-turn need a model that supports it - narration/side-calls don't).
 */
export default function ModelSelect({
  value,
  onChange,
  customModels,
  requireToolCalling,
  className,
}: {
  value: string;
  onChange: (modelKey: string) => void;
  customModels: CustomModel[];
  requireToolCalling?: boolean;
  className?: string;
}) {
  const groups = new Map<string, { key: string; name: string }[]>();
  for (const [key, cfg] of Object.entries(AI_MODELS)) {
    if (requireToolCalling && !cfg.supportsToolCalling) continue;
    if (!groups.has(cfg.provider)) groups.set(cfg.provider, []);
    groups.get(cfg.provider)!.push({ key, name: cfg.name });
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={
        className ||
        "text-xs bg-white/5 border border-white/10 rounded-md px-2 py-1 text-white"
      }
    >
      {Array.from(groups.entries()).map(([provider, models]) => (
        <optgroup key={provider} label={provider}>
          {models.map((m) => (
            <option key={m.key} value={m.key}>
              {m.name}
            </option>
          ))}
        </optgroup>
      ))}
      {customModels.length > 0 && (
        <optgroup label="custom (openrouter)">
          {customModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
