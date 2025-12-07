"use client";

import { useState, useCallback, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { DynamicIcon } from "./DynamicIcon";
import { useAuth } from "@/app/misc/AuthContext";
import { useAPIKeys } from "@/app/misc/APIKeysContext";
import { useNotification } from "@/app/misc/NotificationContext";
import { getAuthToken } from "@/app/misc/getAuthToken";
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
  model: string
) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY_PROVIDER, provider);
  localStorage.setItem(STORAGE_KEY_MODEL, model);
}

// Helper to get model cost for display
export function getImageModelCost(
  provider: "deepinfra" | "openrouter",
  model: string
): { cost: number; isByok: boolean; display: string } {
  if (provider === "deepinfra") {
    const config =
      DEEPINFRA_IMAGE_MODELS[model as keyof typeof DEEPINFRA_IMAGE_MODELS];
    if (config) {
      return {
        cost: config.cost,
        isByok: false,
        display: config.cost === 0 ? "FREE" : `${config.cost} coins`,
      };
    }
  } else {
    const config =
      OPENROUTER_IMAGE_MODELS[model as keyof typeof OPENROUTER_IMAGE_MODELS];
    if (config) {
      const isFlat = config.inputPrice === 0 && config.outputPrice === 0;
      const displayCost = isFlat
        ? model.includes("Flux 2 Pro")
          ? "~$0.030"
          : model.includes("Flux 2 Flex")
          ? "~$0.015"
          : "varies"
        : `~$${(config.inputPrice || 0).toFixed(3)}`;
      return { cost: 0, isByok: true, display: displayCost };
    }
  }
  return { cost: 0, isByok: false, display: "unknown" };
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
  const { user } = useAuth();
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
    if (!user) {
      addNotification("Please sign in to generate images", "warning");
      return;
    }

    const token = await getAuthToken();
    if (!token) {
      addNotification("Authentication required", "warning");
      return;
    }

    const currentPrompt = prompt || getDefaultPrompt();
    if (!currentPrompt.trim()) {
      addNotification("Please enter a prompt", "warning");
      return;
    }

    // Validate API key for OpenRouter provider
    if (imageProvider === "openrouter" && !apiKeys.openRouterKey) {
      addNotification(
        "OpenRouter API key required. Please add your API key in Settings.",
        "warning"
      );
      return;
    }

    setIsGenerating(true);

    try {
      // Call image generation API
      const response = await fetch("/api/creator/generate-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt: currentPrompt,
          model: imageModel,
          imageType: "thumbnail", // Lore images are thumbnail-sized
          provider: imageProvider,
          openRouterKey:
            imageProvider === "openrouter" ? apiKeys.openRouterKey : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Image generation failed");
      }

      const { imageUrl, meta } = await response.json();

      // Upload to Supabase storage
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Fetch the image and convert to blob
      const imageResponse = await fetch(imageUrl);
      const imageBlob = await imageResponse.blob();

      const fileName = `${Date.now()}-ai-lore-thumb.webp`;
      const filePath = `${user.id}/lore-thumbnails/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("adventure-images")
        .upload(filePath, imageBlob, { cacheControl: "3600", upsert: false });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("adventure-images")
        .getPublicUrl(filePath);

      onImageGenerated(data.publicUrl);

      // Show appropriate success message
      const costMessage = meta.isByok
        ? "(BYOK - no coins)"
        : meta.cost > 0
        ? `Cost: ${meta.cost} coins`
        : "(FREE)";
      addNotification(`Lore image generated! ${costMessage}`, "success");
      setShowPromptEditor(false);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      addNotification(errorMessage || "Image generation failed", "failure");
    } finally {
      setIsGenerating(false);
    }
  }, [
    user,
    prompt,
    imageModel,
    imageProvider,
    addNotification,
    apiKeys.openRouterKey,
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
              className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
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
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-500 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors"
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
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors"
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
                  e.target.value as "deepinfra" | "openrouter"
                )
              }
              className="px-2 py-1 bg-blue-900/50 border border-blue-700/40 rounded text-white"
            >
              <option value="deepinfra">DeepInfra (Coins)</option>
              <option value="openrouter">OpenRouter (BYOK)</option>
            </select>

            <select
              value={imageModel}
              onChange={(e) => handleModelChange(e.target.value)}
              className="px-2 py-1 bg-blue-900/50 border border-blue-700/40 rounded text-white"
            >
              {imageProvider === "deepinfra"
                ? Object.entries(DEEPINFRA_IMAGE_MODELS).map(
                    ([key, config]) => (
                      <option key={key} value={key}>
                        {key} (
                        {config.cost === 0 ? "FREE" : `${config.cost} coins`})
                      </option>
                    )
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
                    }
                  )}
            </select>
          </div>
        </div>
      </div>

      {/* Prompt Editor (expandable) */}
      {showPromptEditor && (
        <div className="mt-3 p-3 bg-blue-900/30 rounded-lg border border-blue-700/40 space-y-3">
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-1">
              Image Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the image you want to generate..."
              rows={3}
              className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded-lg text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={generateImage}
              disabled={isGenerating || !prompt.trim()}
              className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-500 text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <DynamicIcon
                name={isGenerating ? "Loader2" : "Sparkles"}
                className={`w-4 h-4 ${isGenerating ? "animate-spin" : ""}`}
              />
              {isGenerating ? "Generating..." : "Generate Image"}
            </button>
            <button
              onClick={() => setShowPromptEditor(false)}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
