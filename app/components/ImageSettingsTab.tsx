"use client";

// Settings -> Images (docs/image-generation-design.md §6, decisions 54-57, 61):
// the switch for the GM's pictures, the per-scene cap, the provider, and the
// model for each kind of picture. The fal key is on the API Keys tab and is
// never synced (decision 58); the per-story art style, the space used and
// "Clear this story's pictures" are in the Story Editor's Pictures section.

import { useState } from "react";
import { DynamicIcon } from "./DynamicIcon";
import { useAPIKeys } from "@/app/misc/APIKeysContext";
import {
  DEEPINFRA_IMAGE_MODELS,
  FAL_IMAGE_MODELS,
  OPENROUTER_IMAGE_MODELS,
} from "@/app/misc/ai_prices";
import {
  MAX_GM_IMAGES_PER_SCENE,
  getImageSettings,
  setImageSettings,
  type ImageProviderChoice,
  type ImageSettings,
} from "@/app/misc/imageSettings";
import { pickImageProvider } from "@/app/misc/imageProvider";

const SELECT_CLASS =
  "w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40";

const PROVIDER_LABELS: Record<ImageProviderChoice, string> = {
  auto: "Automatic (fal.ai, then DeepInfra, then OpenRouter)",
  fal: "fal.ai",
  deepinfra: "DeepInfra",
  openrouter: "OpenRouter",
};

function priceLabel(price: number): string {
  return price === 0 ? "free" : `~$${price.toFixed(price < 0.01 ? 4 : 3)}`;
}

function ModelPicker({
  label,
  help,
  value,
  catalog,
  onChange,
}: {
  label: string;
  help?: string;
  value: string;
  catalog: Record<string, { name: string; pricePerImage: number }>;
  onChange: (key: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-blue-200 mb-1">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={SELECT_CLASS}
      >
        {Object.entries(catalog).map(([key, cfg]) => (
          <option key={key} value={key} className="bg-gray-900">
            {cfg.name} ({priceLabel(cfg.pricePerImage)} per picture)
          </option>
        ))}
      </select>
      {help && <p className="text-xs text-blue-200/50 mt-1">{help}</p>}
    </div>
  );
}

export default function ImageSettingsTab() {
  const { keys } = useAPIKeys();
  const [settings, setSettings] = useState<ImageSettings>(() => getImageSettings());

  const update = (patch: Partial<ImageSettings>) => {
    setImageSettings(patch);
    setSettings(getImageSettings());
  };

  const provider = pickImageProvider(settings, {
    falKey: keys.falKey,
    deepInfraKey: keys.deepinfraKey,
    openRouterKey: keys.openRouterKey,
  });

  return (
    <div className="space-y-5">
      <div className="p-4 bg-white/[0.03] rounded-xl border border-white/10">
        <p className="text-sm text-blue-100/80">
          The Game Master can paint a picture at a moment that matters, and the
          Illustrate this button paints any turn. Pictures stay on this device
          and are not synced.
        </p>
        <p
          className={`text-xs mt-2 flex items-center gap-1.5 ${
            provider ? "text-green-300/80" : "text-amber-300/80"
          }`}
        >
          <DynamicIcon
            name={provider ? "CheckCircle" : "AlertTriangle"}
            className="w-3.5 h-3.5"
          />
          {provider
            ? `Pictures will be painted by ${PROVIDER_LABELS[provider]}.`
            : "No picture provider yet: add a fal.ai, DeepInfra or OpenRouter key under API Keys."}
        </p>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-blue-200">
            Let the Game Master paint pictures
          </p>
          <p className="text-xs text-blue-200/60">
            Off: the button still works, the GM is simply not offered the tool.
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={settings.gmImagesEnabled}
            onChange={(e) => update({ gmImagesEnabled: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-14 h-7 bg-white/10 peer-focus:ring-4 peer-focus:ring-purple-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-1 after:bg-white after:border-white/20 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-linear-to-r peer-checked:from-purple-500 peer-checked:to-pink-500"></div>
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-blue-200 mb-1">
          Game Master pictures per scene: {settings.gmImagesPerScene}
        </label>
        <input
          type="range"
          min={0}
          max={MAX_GM_IMAGES_PER_SCENE}
          step={1}
          value={settings.gmImagesPerScene}
          onChange={(e) => update({ gmImagesPerScene: Number(e.target.value) })}
          className="w-full"
          disabled={!settings.gmImagesEnabled}
        />
        <p className="text-xs text-blue-200/50 mt-1">
          The engine refuses any more in the same scene. Your own Illustrate
          this button does not count against it. 0 turns the GM&apos;s pictures
          off.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-blue-200 mb-1">
          Provider
        </label>
        <select
          value={settings.provider}
          onChange={(e) =>
            update({ provider: e.target.value as ImageProviderChoice })
          }
          className={SELECT_CLASS}
        >
          {(Object.keys(PROVIDER_LABELS) as ImageProviderChoice[]).map((p) => (
            <option key={p} value={p} className="bg-gray-900">
              {PROVIDER_LABELS[p]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-4 p-4 bg-white/[0.03] rounded-xl border border-white/10">
        <h4 className="text-sm font-semibold text-purple-300">fal.ai models</h4>
        <ModelPicker
          label="Scenes and places"
          value={settings.sceneModel}
          catalog={FAL_IMAGE_MODELS}
          onChange={(sceneModel) => update({ sceneModel })}
        />
        <ModelPicker
          label="Portraits"
          value={settings.portraitModel}
          catalog={FAL_IMAGE_MODELS}
          onChange={(portraitModel) => update({ portraitModel })}
        />
        <ModelPicker
          label="Scenes with a known face"
          help="Uses the portraits as reference pictures, to keep faces the same. Not available in this version yet: scenes use the scene model, and each character is described in the prompt."
          value={settings.referenceModel}
          catalog={FAL_IMAGE_MODELS}
          onChange={(referenceModel) => update({ referenceModel })}
        />
      </div>

      <div className="space-y-4 p-4 bg-white/[0.03] rounded-xl border border-white/10">
        <h4 className="text-sm font-semibold text-purple-300">
          DeepInfra and OpenRouter
        </h4>
        <ModelPicker
          label="DeepInfra model"
          value={settings.deepinfraModel}
          catalog={DEEPINFRA_IMAGE_MODELS}
          onChange={(deepinfraModel) => update({ deepinfraModel })}
        />
        <ModelPicker
          label="OpenRouter model"
          value={settings.openrouterModel}
          catalog={OPENROUTER_IMAGE_MODELS}
          onChange={(openrouterModel) => update({ openrouterModel })}
        />
        <p className="text-xs text-amber-200/70">
          Neither takes reference pictures, so a character&apos;s face can
          drift between scenes. fal.ai is recommended for pictures in play.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-blue-200 mb-1">
          Default art style
        </label>
        <input
          type="text"
          defaultValue={settings.defaultStyle}
          onBlur={(e) => update({ defaultStyle: e.target.value })}
          className={SELECT_CLASS}
        />
        <p className="text-xs text-blue-200/50 mt-1">
          The line that ends every picture&apos;s prompt, so a story&apos;s
          pictures look like one book. A story can set its own in the Story
          Editor, under Pictures.
        </p>
      </div>
    </div>
  );
}
