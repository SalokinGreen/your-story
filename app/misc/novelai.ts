/**
 * NovelAI Integration Module
 *
 * Provides types and utilities for NovelAI API integration.
 * Uses BYOK (Bring Your Own Key) only - no server-side key.
 * Currently supports GLM-4-6 model only.
 */

import { ChatMessage } from "@/app/misc/ai_staged";

// NovelAI model configuration
export const NOVELAI_MODEL = "glm-4-6";

// Default sampling parameters optimized for story generation
export const NOVELAI_DEFAULT_PARAMS = {
  temperature: 1,
  top_p: 0.95,
  top_k: 40,
  min_p: 0,
  frequency_penalty: 0,
  presence_penalty: 0,
  use_string: true,
  generate_until_sentence: true,
};

export interface NovelAIRequest {
  input: string;
  model: string;
  parameters: {
    max_length: number;
    temperature: number;
    top_p: number;
    top_k: number;
    min_p: number;
    frequency_penalty: number;
    presence_penalty: number;
    use_string: boolean;
    generate_until_sentence: boolean;
    stop_sequences?: string[][];
  };
}

export interface NovelAIConfig {
  apiKey: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Convert chat messages to GLM-4 prompt format for NovelAI.
 * GLM uses special tokens: [gMASK]<sop><|system|>, <|user|>, <|assistant|>
 */
export function convertMessagesToPrompt(messages: ChatMessage[]): string {
  const parts: string[] = [];
  
  // Start with GLM special tokens
  parts.push("[gMASK]<sop>");

  for (const message of messages) {
    if (message.role === "system") {
      parts.push(`<|system|>\n${message.content}`);
    } else if (message.role === "user") {
      parts.push(`<|user|>\n${message.content}`);
    } else if (message.role === "assistant") {
      // Assistant messages use /nothink prefix and <think></think> wrapper
      parts.push(`/nothink<|assistant|>\n<think></think>\n${message.content}`);
    } else if (message.role === "tool") {
      // Tool responses go as user context
      parts.push(`<|user|>\n[Game State Update]\n${message.content}`);
    }
  }

  // End with assistant prompt for continuation
  parts.push(`/nothink<|assistant|>\n<think></think>\n`);

  return parts.join("\n");
}

/**
 * Build NovelAI API request body from our config
 */
export function buildNovelAIRequest(
  prompt: string,
  config: NovelAIConfig
): NovelAIRequest {
  return {
    input: prompt,
    model: NOVELAI_MODEL,
    parameters: {
      max_length: config.maxTokens || 2000,
      temperature: config.temperature ?? NOVELAI_DEFAULT_PARAMS.temperature,
      top_p: NOVELAI_DEFAULT_PARAMS.top_p,
      top_k: NOVELAI_DEFAULT_PARAMS.top_k,
      min_p: NOVELAI_DEFAULT_PARAMS.min_p,
      frequency_penalty: NOVELAI_DEFAULT_PARAMS.frequency_penalty,
      presence_penalty: NOVELAI_DEFAULT_PARAMS.presence_penalty,
      use_string: NOVELAI_DEFAULT_PARAMS.use_string,
      generate_until_sentence: NOVELAI_DEFAULT_PARAMS.generate_until_sentence,
    },
  };
}

/**
 * NovelAI context size (in tokens)
 * GLM-4-6 supports ~8K context
 */
export const NOVELAI_CONTEXT_SIZE = 8192;

/**
 * Estimate token count from text (rough approximation: ~4 chars per token)
 */
export function estimateNovelAITokens(text: string): number {
  return Math.ceil(text.length / 4);
}
