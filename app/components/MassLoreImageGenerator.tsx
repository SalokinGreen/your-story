"use client";

import { useState, useEffect, useCallback } from "react";
import { DynamicIcon } from "./DynamicIcon";
import { useAPIKeys } from "@/app/misc/APIKeysContext";
import { useNotification } from "@/app/misc/NotificationContext";
import { creatorImageFetch } from "@/app/misc/creatorFetch";
import {
  getSavedImageGenSettings,
  saveImageGenSettings,
  getImageModelCost,
} from "./LoreImageGenerator";
import {
  DEEPINFRA_IMAGE_MODELS,
  OPENROUTER_IMAGE_MODELS,
} from "@/app/misc/ai_prices";
import { StoryLore } from "@/app/misc/structs";

interface MassLoreImageGeneratorProps {
  lore: StoryLore[];
  onLoreUpdate: (updatedLore: StoryLore[]) => void;
}

export default function MassLoreImageGenerator({
  lore,
  onLoreUpdate,
}: MassLoreImageGeneratorProps) {
  const { keys: apiKeys } = useAPIKeys();
  const { addNotification } = useNotification();

  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [imageProvider, setImageProvider] = useState<
    "deepinfra" | "openrouter"
  >("deepinfra");
  const [imageModel, setImageModel] = useState<string>("Bria 3.2");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [currentLoreTitle, setCurrentLoreTitle] = useState("");

  // Load saved settings on mount
  useEffect(() => {
    const saved = getSavedImageGenSettings();
    setImageProvider(saved.provider);
    setImageModel(saved.model);
  }, []);

  // Count lore entries without images
  const loreWithoutImages = lore.filter((l) => !l.thumbnailUrl);
  const count = loreWithoutImages.length;

  // Calculate cost estimate
  const costInfo = getImageModelCost(imageProvider, imageModel);
  const totalCost = costInfo.isByok ? 0 : costInfo.cost * count;

  // Handle provider change
  const handleProviderChange = (newProvider: "deepinfra" | "openrouter") => {
    const newModel = newProvider === "deepinfra" ? "Bria 3.2" : "Nano Banana";
    setImageProvider(newProvider);
    setImageModel(newModel);
    saveImageGenSettings(newProvider, newModel);
  };

  // Handle model change
  const handleModelChange = (newModel: string) => {
    setImageModel(newModel);
    saveImageGenSettings(imageProvider, newModel);
  };

  // Generate prompt for a lore entry
  const generatePromptForLore = (loreEntry: StoryLore): string => {
    const title = loreEntry.title || "Untitled";
    const content = loreEntry.content || "";
    const maxContentLength = 300;
    const truncatedContent =
      content.length > maxContentLength
        ? content.substring(0, maxContentLength) + "..."
        : content;
    return `Fantasy illustration for "${title}": ${truncatedContent}. Detailed digital art, atmospheric lighting, high quality.`;
  };

  // Process a single lore entry - returns the updated entry or null on failure
  const processLoreEntry = async (
    loreEntry: StoryLore,
  ): Promise<{ loreEntry: StoryLore; success: boolean }> => {
    try {
      const prompt = generatePromptForLore(loreEntry);

      // Call image generation API
      const response = await creatorImageFetch({
        prompt,
        model: imageModel,
        imageType: "thumbnail",
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

      return {
        loreEntry: { ...loreEntry, thumbnailUrl: imageUrl },
        success: true,
      };
    } catch (error) {
      console.error(
        `Failed to generate image for "${loreEntry.title}":`,
        error,
      );
      return { loreEntry, success: false };
    }
  };

  // Generate all images in batches of 5
  const generateAll = useCallback(async () => {
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

    if (count === 0) {
      addNotification("All lore entries already have images!", "success");
      return;
    }

    setIsGenerating(true);
    setProgress({ current: 0, total: count });

    let successCount = 0;
    let failCount = 0;
    const updatedLore = [...lore];
    const BATCH_SIZE = 5;

    // Process in batches of 5
    for (
      let batchStart = 0;
      batchStart < loreWithoutImages.length;
      batchStart += BATCH_SIZE
    ) {
      const batch = loreWithoutImages.slice(
        batchStart,
        batchStart + BATCH_SIZE,
      );
      const batchTitles = batch.map((l) => l.title || "Untitled").join(", ");
      setCurrentLoreTitle(
        `Batch: ${batchTitles.substring(0, 50)}${
          batchTitles.length > 50 ? "..." : ""
        }`,
      );

      // Process batch in parallel
      const results = await Promise.all(
        batch.map((loreEntry) => processLoreEntry(loreEntry)),
      );

      // Update results
      for (const result of results) {
        if (result.success) {
          successCount++;
          // Find and update the lore entry in updatedLore
          const loreIndex = lore.findIndex(
            (l) => l.title === result.loreEntry.title,
          );
          if (loreIndex !== -1) {
            updatedLore[loreIndex] = result.loreEntry;
          }
        } else {
          failCount++;
        }
      }

      setProgress({
        current: Math.min(batchStart + BATCH_SIZE, count),
        total: count,
      });

      // Small delay between batches to avoid rate limiting
      if (batchStart + BATCH_SIZE < loreWithoutImages.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // Update parent with all changes
    onLoreUpdate(updatedLore);

    setIsGenerating(false);
    setCurrentLoreTitle("");

    if (failCount === 0) {
      addNotification(
        `Successfully generated ${successCount} images!`,
        "success",
      );
    } else {
      addNotification(
        `Generated ${successCount} images, ${failCount} failed`,
        failCount > successCount ? "failure" : "warning",
      );
    }
  }, [
    count,
    lore,
    loreWithoutImages,
    imageModel,
    imageProvider,
    apiKeys.openRouterKey,
    apiKeys.deepinfraKey,
    addNotification,
    onLoreUpdate,
  ]);

  if (count === 0) {
    return null; // Don't show if all lore has images
  }

  return (
    <div className="border border-purple-400/20 rounded-xl bg-purple-500/[0.06] backdrop-blur-md">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-purple-500/10 transition-colors rounded-xl"
      >
        <div className="flex items-center gap-2">
          <DynamicIcon name="Sparkles" className="w-5 h-5 text-purple-400" />
          <span className="font-medium text-white">Mass Image Generation</span>
          <span className="px-2 py-0.5 bg-purple-500/15 text-purple-300 rounded-lg text-xs">
            {count} lore without images
          </span>
        </div>
        <DynamicIcon
          name={isOpen ? "ChevronUp" : "ChevronDown"}
          className="w-5 h-5 text-purple-300"
        />
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-4">
          {/* Settings */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm text-blue-200">Provider:</label>
              <select
                value={imageProvider}
                onChange={(e) =>
                  handleProviderChange(
                    e.target.value as "deepinfra" | "openrouter",
                  )
                }
                disabled={isGenerating}
                className="px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-white text-sm"
              >
                <option value="deepinfra">DeepInfra (Coins)</option>
                <option value="openrouter">OpenRouter (BYOK)</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm text-blue-200">Model:</label>
              <select
                value={imageModel}
                onChange={(e) => handleModelChange(e.target.value)}
                disabled={isGenerating}
                className="px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-white text-sm"
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

          {/* Cost Estimate */}
          <div className="p-3 bg-white/[0.03] backdrop-blur-md rounded-lg border border-white/10">
            <div className="flex items-center justify-between text-sm">
              <span className="text-blue-200">Estimated Cost:</span>
              <span className="font-medium text-white">
                {costInfo.isByok ? (
                  <span className="text-green-400">
                    ~${(costInfo.dollarCost * count).toFixed(2)} via your API
                    key
                  </span>
                ) : totalCost === 0 ? (
                  <span className="text-green-400">FREE</span>
                ) : (
                  <span>
                    <span className="text-yellow-400">{totalCost} coins</span>
                  </span>
                )}
              </span>
            </div>
            <p className="text-xs text-blue-300/60 mt-1">
              {count} images × {costInfo.display} per image
            </p>
          </div>

          {/* Progress */}
          {isGenerating && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-blue-200">
                  Generating: {currentLoreTitle}
                </span>
                <span className="text-white">
                  {progress.current}/{progress.total}
                </span>
              </div>
              <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-linear-to-r from-purple-500 to-blue-500 transition-all duration-300"
                  style={{
                    width: `${(progress.current / progress.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Generate Button */}
          <button
            onClick={generateAll}
            disabled={isGenerating || count === 0}
            className="w-full px-4 py-2 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-50 text-white font-medium rounded-lg flex items-center justify-center gap-2 shadow-md shadow-purple-950/40 transition-all"
          >
            <DynamicIcon
              name={isGenerating ? "Loader2" : "Sparkles"}
              className={`w-5 h-5 ${isGenerating ? "animate-spin" : ""}`}
            />
            {isGenerating
              ? `Generating ${progress.current}/${progress.total}...`
              : `Generate ${count} Images`}
          </button>

          <p className="text-xs text-blue-300/50 text-center">
            Images are generated using AI based on each lore entry&apos;s title
            and content.
          </p>
        </div>
      )}
    </div>
  );
}
