/**
 * Shared logic behind /api/creator/regenerate-section - see providerCall.ts
 * for why this is split out (same code runs server-side for the Vercel web
 * build and client-side for the standalone Tauri/Capacitor build, via
 * creatorFetch.ts).
 */

import { getModelConfig } from "@/app/misc/ai_prices";
import { logger } from "@/app/misc/logger";
import {
  BigAdventureConfig,
  BigAdventureResult,
  RegenerateSection,
  REGENERATE_SECTIONS,
  buildRegenerateSectionMessages,
  parseRegenerateSectionOutput,
} from "@/app/misc/big_adventure_ai";
import {
  CreatorProvider,
  getCreatorApiKey,
  streamProviderCompletion,
  makeSSEEmitter,
  CREATOR_PROVIDER_NAMES,
} from "@/app/misc/bigAdventureStreamCommon";

export interface RegenerateSectionRequestBody {
  section: RegenerateSection;
  config: BigAdventureConfig;
  existingResult: BigAdventureResult;
  model?: string;
  maxOutputTokens?: number;
  additionalInstructions?: string;
  openRouterKey?: string;
  deepseekKey?: string;
  mistralKey?: string;
  deepinfraKey?: string;
}

export function generateRegenerateSectionStream(
  body: RegenerateSectionRequestBody,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const emit = makeSSEEmitter(controller, encoder);
      try {
        const {
          section,
          config,
          existingResult,
          model = "DeepSeek V4 Flash",
          maxOutputTokens = 4000,
          additionalInstructions,
        } = body;

        if (!section || !REGENERATE_SECTIONS[section]) {
          emit({ type: "error", error: "Invalid section specified" });
          controller.close();
          return;
        }

        if (!config || !existingResult) {
          emit({ type: "error", error: "Config and currentResult are required" });
          controller.close();
          return;
        }

        const modelConfig = getModelConfig(model);
        const provider = modelConfig.provider as CreatorProvider;
        const apiKey = getCreatorApiKey(provider, body);

        if (!apiKey) {
          emit({
            type: "error",
            error: `${CREATOR_PROVIDER_NAMES[provider]} API key required. Please add your API key in Settings.`,
          });
          controller.close();
          return;
        }

        const sectionInfo = REGENERATE_SECTIONS[section];
        emit({ type: "start", section, sectionName: sectionInfo.name });

        const messages = buildRegenerateSectionMessages(
          section,
          config,
          existingResult,
          additionalInstructions,
        );

        const { content: fullContent, promptTokens, completionTokens } =
          await streamProviderCompletion(
            messages.map((m) => ({ role: m.role, content: m.content })),
            modelConfig,
            apiKey,
            maxOutputTokens,
            config.temperature ?? 0.8,
            (text) => emit({ type: "content", content: text }),
          );

        const result = parseRegenerateSectionOutput(fullContent, section);

        if (!result) {
          throw new Error("Failed to parse regenerated content");
        }

        logger.action("Section regeneration complete", {
          model: modelConfig.model,
          provider: modelConfig.provider,
          section,
          promptTokens,
          completionTokens,
        });

        emit({
          type: "done",
          section,
          result,
          rawContent: fullContent,
          meta: {
            model: modelConfig.model,
            modelName: model,
            provider: modelConfig.provider,
            usage: {
              promptTokens,
              completionTokens,
              totalTokens: promptTokens + completionTokens,
            },
            isByok: true,
          },
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("Section regeneration error", { error: errorMessage });
        emit({ type: "error", error: errorMessage || "Internal server error" });
      } finally {
        controller.close();
      }
    },
  });
}
