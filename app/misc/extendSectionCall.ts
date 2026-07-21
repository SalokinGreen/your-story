/**
 * Shared logic behind /api/creator/extend-section - see providerCall.ts for
 * why this is split out (same code runs server-side for the Vercel web
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
  buildExtendSectionMessages,
  parseExtendSectionOutput,
  canExtendSection,
} from "@/app/misc/big_adventure_ai";
import {
  CreatorProvider,
  getCreatorApiKey,
  streamProviderCompletion,
  makeSSEEmitter,
  CREATOR_PROVIDER_NAMES,
} from "@/app/misc/bigAdventureStreamCommon";

export interface ExtendSectionRequestBody {
  section: RegenerateSection;
  config: BigAdventureConfig;
  existingResult: BigAdventureResult;
  customInstructions?: string;
  model?: string;
  maxOutputTokens?: number;
  openRouterKey?: string;
  deepseekKey?: string;
  mistralKey?: string;
  deepinfraKey?: string;
}

export function generateExtendSectionStream(
  body: ExtendSectionRequestBody,
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
          customInstructions,
          model = "DeepSeek V4 Flash",
          maxOutputTokens = 4000,
        } = body;

        if (!section || !REGENERATE_SECTIONS[section]) {
          emit({ type: "error", error: `Invalid section: ${section}` });
          controller.close();
          return;
        }

        if (!canExtendSection(section)) {
          emit({
            type: "error",
            error: `Section "${section}" does not support "Add More" functionality`,
          });
          controller.close();
          return;
        }

        const sectionInfo = REGENERATE_SECTIONS[section];
        logger.info("Extend section started", { section, maxOutputTokens, model });

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

        const messages = buildExtendSectionMessages(
          config,
          section,
          existingResult,
          customInstructions,
        );

        emit({ type: "extend_start", section, sectionName: sectionInfo.name });

        const { content: fullContent } = await streamProviderCompletion(
          messages.map((m) => ({ role: m.role, content: m.content })),
          modelConfig,
          apiKey,
          maxOutputTokens,
          config.temperature ?? 0.8,
          (text) => emit({ type: "content", content: text }),
        );

        const parsedResult = parseExtendSectionOutput(fullContent, section, existingResult);

        emit({
          type: "extend_complete",
          section,
          sectionName: sectionInfo.name,
          result: parsedResult,
          rawContent: fullContent,
          isByok: true,
        });

        logger.info("Extend section complete", { section });
      } catch (error) {
        logger.error("Extend section error", { error });
        emit({ type: "error", error: error instanceof Error ? error.message : "Unknown error" });
      } finally {
        controller.close();
      }
    },
  });
}
