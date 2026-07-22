"use client";

import { useState, useCallback, useEffect } from "react";
import { DynamicIcon } from "./DynamicIcon";
import { useAPIKeys } from "@/app/misc/APIKeysContext";
import { useNotification } from "@/app/misc/NotificationContext";
import { creatorImageFetch } from "@/app/misc/creatorFetch";
import {
  DEEPINFRA_IMAGE_MODELS,
  OPENROUTER_IMAGE_MODELS,
  type DeepInfraImageModelKey,
  type ImageModelKey,
} from "@/app/misc/ai_prices";

// LocalStorage keys for persisting settings
const STORAGE_KEY_PROVIDER = "loreImageGen_provider";
const STORAGE_KEY_MODEL = "loreImageGen_model";

// Helper to get saved settings
export function getSavedImageGenSettings(): {
  provider: "deepinfra" | "openrouter";
  model: string;
} {
  if (typeof window === "undefined") {
    return { provider: "deepinfra", model: "Bria 3.2" };
  }
  const provider =
    (localStorage.getItem(STORAGE_KEY_PROVIDER) as
      | "deepinfra"
      | "openrouter") || "deepinfra";
  const model =
    localStorage.getItem(STORAGE_KEY_MODEL) ||
    (provider === "deepinfra" ? "Bria 3.2" : "Nano Banana");
  return { provider, model };
}

// Helper to save settings
export function saveImageGenSettings(
  provider: "deepinfra" | "openrouter",
  model: string,
) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY_PROVIDER, provider);
  localStorage.setItem(STORAGE_KEY_MODEL, model);
}

// Helper to get model cost for display
export function getImageModelCost(
  provider: "deepinfra" | "openrouter",
  model: string,
): { cost: number; isByok: boolean; display: string; dollarCost: number } {
  if (provider === "deepinfra") {
    const config =
      DEEPINFRA_IMAGE_MODELS[model as keyof typeof DEEPINFRA_IMAGE_MODELS];
    if (config) {
      return {
        cost: config.cost,
        isByok: false,
        display: config.cost === 0 ? "FREE" : `${config.cost} coins`,
        dollarCost: 0,
      };
    }
  } else {
    const config =
      OPENROUTER_IMAGE_MODELS[model as keyof typeof OPENROUTER_IMAGE_MODELS];
    if (config) {
      const isFlat = config.inputPrice === 0 && config.outputPrice === 0;
      // Get actual dollar cost per image for flat-rate models
      let dollarCost = 0;
      let displayCost = "varies";
      if (isFlat) {
        if (model.includes("Flux 2 Pro")) {
          dollarCost = 0.03;
          displayCost = "~$0.030";
        } else if (model.includes("Flux 2 Flex")) {
          dollarCost = 0.015;
          displayCost = "~$0.015";
        }
      } else {
        // Token-based models - estimate ~$0.01-0.30 per image depending on model
        dollarCost = (config.inputPrice / 1000) * 500; // Rough estimate: 500 input tokens
        displayCost = `~$${(config.inputPrice || 0).toFixed(3)}`;
      }
      return { cost: 0, isByok: true, display: displayCost, dollarCost };
    }
  }
  return { cost: 0, isByok: false, display: "unknown", dollarCost: 0 };
}

interface LoreImageGeneratorProps {
  loreTitle?: string;
  loreContent?: string;
  currentThumbnailUrl?: string;
  onImageGenerated: (url: string) => void;
  className?: string;
}

export default function LoreImageGenerator({
  loreTitle,
  loreContent,
  currentThumbnailUrl,
  onImageGenerated,
  className = "",
}: LoreImageGeneratorProps) {
  const { keys: apiKeys } = useAPIKeys();
  const { addNotification } = useNotification();

  const [isGenerating, setIsGenerating] = useState(false);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [imageProvider, setImageProvider] = useState<
    "deepinfra" | "openrouter"
  >("deepinfra");
  const [imageModel, setImageModel] = useState<string>("Bria 3.2");

  // Load saved settings on mount
  useEffect(() => {
    const saved = getSavedImageGenSettings();
    setImageProvider(saved.provider);
    setImageModel(saved.model);
  }, []);

  // Save settings when they change
  const handleProviderChange = (newProvider: "deepinfra" | "openrouter") => {
    const newModel = newProvider === "deepinfra" ? "Bria 3.2" : "Nano Banana";
    setImageProvider(newProvider);
    setImageModel(newModel);
    saveImageGenSettings(newProvider, newModel);
  };

  const handleModelChange = (newModel: string) => {
    setImageModel(newModel);
    saveImageGenSettings(imageProvider, newModel);
  };

  // Generate default prompt from lore content
  const getDefaultPrompt = useCallback(() => {
    const title = loreTitle || "Untitled";
    const content = loreContent || "";
    const maxContentLength = 300;
    const truncatedContent =
      content.length > maxContentLength
        ? content.substring(0, maxContentLength) + "..."
        : content;
    return `Fantasy illustration for "${title}": ${truncatedContent}. Detailed digital art, atmospheric lighting, high quality.`;
  }, [loreTitle, loreContent]);

  // Initialize prompt when opening editor
  const handleOpenPromptEditor = () => {
    if (!prompt) {
      setPrompt(getDefaultPrompt());
    }
    setShowPromptEditor(true);
  };

  // Generate image
  const generateImage = useCallback(async () => {
    const currentPrompt = prompt || getDefaultPrompt();
    if (!currentPrompt.trim()) {
      addNotification("Please enter a prompt", "warning");
      return;
    }

    // Validate API key for the selected provider
    if (imageProvider === "openrouter" && !apiKeys.openRouterKey) {
      addNotification(
        "OpenRouter API key required. Please add your API key in Settings.",
        "warning",
      );
      return;
    }
    if (imageProvider === "deepinfra" && !apiKeys.deepinfraKey) {
      addNotification(
        "DeepInfra API key required. Please add your API key in Settings.",
        "warning",
      );
      return;
    }

    setIsGenerating(true);

    try {
      // Call image generation API
      const response = await creatorImageFetch({
        prompt: currentPrompt,
        model: imageModel,
        imageType: "thumbnail", // Lore images are thumbnail-sized
        provider: imageProvider,
        openRouterKey:
          imageProvider === "openrouter" ? apiKeys.openRouterKey : undefined,
        deepInfraKey:
          imageProvider === "deepinfra" ? apiKeys.deepinfraKey : undefined,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Image generation failed");
      }

      const { imageUrl } = await response.json();

      onImageGenerated(imageUrl);

      addNotification("Lore image generated!", "success");
      setShowPromptEditor(false);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      addNotification(errorMessage || "Image generation failed", "failure");
    } finally {
      setIsGenerating(false);
    }
  }, [
    prompt,
    imageModel,
    imageProvider,
    addNotification,
    apiKeys.openRouterKey,
    apiKeys.deepinfraKey,
    getDefaultPrompt,
    onImageGenerated,
  ]);

  // Quick generate without prompt editor
  const quickGenerate = useCallback(async () => {
    setPrompt(getDefaultPrompt());
    await generateImage();
  }, [getDefaultPrompt, generateImage]);

  return (
    <div className={className}>
      {/* Current thumbnail preview */}
      <div className="flex items-start gap-3">
        {currentThumbnailUrl ? (
          <div className="relative group">
            <img
              src={currentThumbnailUrl}
              alt="Lore thumbnail"
              className="w-24 h-24 object-cover rounded-lg border border-blue-700/40"
            />
            <button
              onClick={() => onImageGenerated("")}
              className="absolute -top-2 -right-2 w-6 h-6 bg-linear-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-md shadow-red-950/40"
              title="Remove image"
            >
              <DynamicIcon name="X" className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="w-24 h-24 rounded-lg border-2 border-dashed border-blue-700/40 flex items-center justify-center">
            <DynamicIcon name="Image" className="w-8 h-8 text-blue-300/30" />
          </div>
        )}

        <div className="flex-1 space-y-2">
          {/* Generate buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleOpenPromptEditor}
              disabled={isGenerating}
              className="px-3 py-1.5 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:from-white/10 disabled:to-white/10 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 shadow-md shadow-purple-950/40 transition-all"
            >
              <DynamicIcon
                name={isGenerating ? "Loader2" : "Sparkles"}
                className={`w-4 h-4 ${isGenerating ? "animate-spin" : ""}`}
              />
              {showPromptEditor ? "Edit Prompt" : "AI Generate"}
            </button>
            {!showPromptEditor && (
              <button
                onClick={quickGenerate}
                disabled={isGenerating}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-50 border border-white/10 text-blue-100 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors"
                title="Generate with auto-prompt"
              >
                <DynamicIcon
                  name={isGenerating ? "Loader2" : "Zap"}
                  className={`w-4 h-4 ${isGenerating ? "animate-spin" : ""}`}
                />
                Quick
              </button>
            )}
          </div>

          {/* Provider & Model selection (collapsed) */}
          <div className="flex flex-wrap gap-2 text-xs">
            <select
              value={imageProvider}
              onChange={(e) =>
                handleProviderChange(
                  e.target.value as "deepinfra" | "openrouter",
                )
              }
              className="px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-white"
            >
              <option value="deepinfra">DeepInfra (Coins)</option>
              <option value="openrouter">OpenRouter (BYOK)</option>
            </select>

            <select
              value={imageModel}
              onChange={(e) => handleModelChange(e.target.value)}
              className="px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-white"
            >
              {imageProvider === "deepinfra"
                ? Object.entries(DEEPINFRA_IMAGE_MODELS).map(
                    ([key, config]) => (
                      <option key={key} value={key}>
                        {key} (
                        {config.cost === 0 ? "FREE" : `${config.cost} coins`})
                      </option>
                    ),
                  )
                : Object.entries(OPENROUTER_IMAGE_MODELS).map(
                    ([key, config]) => {
                      // For flat-rate models (Flux), show per-image cost
                      // For token-based models, show approximate cost
                      const isFlat =
                        config.inputPrice === 0 && config.outputPrice === 0;
                      const displayCost = isFlat
                        ? key.includes("Flux 2 Pro")
                          ? "~$0.030"
                          : key.includes("Flux 2 Flex")
                            ? "~$0.015"
                            : "varies"
                        : `~$${(config.inputPrice || 0).toFixed(3)}`;
                      return (
                        <option key={key} value={key}>
                          {key} ({displayCost})
                        </option>
                      );
                    },
                  )}
            </select>
          </div>
        </div>
      </div>

      {/* Prompt Editor (expandable) */}
      {showPromptEditor && (
        <div className="mt-3 p-3 bg-white/[0.03] backdrop-blur-md rounded-lg border border-white/10 space-y-3">
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-1">
              Image Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the image you want to generate..."
              rows={3}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={generateImage}
              disabled={isGenerating || !prompt.trim()}
              className="flex-1 px-4 py-2 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-50 text-white font-medium rounded-lg flex items-center justify-center gap-2 shadow-md shadow-purple-950/40 transition-all"
            >
              <DynamicIcon
                name={isGenerating ? "Loader2" : "Sparkles"}
                className={`w-4 h-4 ${isGenerating ? "animate-spin" : ""}`}
              />
              {isGenerating ? "Generating..." : "Generate Image"}
            </button>
            <button
              onClick={() => setShowPromptEditor(false)}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
