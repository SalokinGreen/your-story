/**
 * Shared plumbing for the creator streaming endpoints (generate-stage,
 * regenerate-section, extend-section): BYOK key resolution, delta-content
 * extraction, and the actual
 * fetch-and-parse-SSE loop against the provider. See providerCall.ts for
 * why this is split out - same code runs server-side for the Vercel web
 * build and client-side for the standalone Tauri/Capacitor build.
 */

import { AIModelConfig } from "@/app/misc/ai_prices";
import { getProviderFetch } from "@/app/misc/platformFetch";

export type CreatorProvider = "deepseek" | "openrouter" | "mistral" | "deepinfra";

export interface CreatorApiKeys {
  openRouterKey?: string;
  deepseekKey?: string;
  mistralKey?: string;
  deepinfraKey?: string;
}

export const CREATOR_PROVIDER_NAMES: Record<CreatorProvider, string> = {
  deepseek: "DeepSeek",
  openrouter: "OpenRouter",
  mistral: "Mistral",
  deepinfra: "DeepInfra",
};

export function getCreatorApiKey(
  provider: CreatorProvider,
  keys: CreatorApiKeys,
): string | null {
  if (provider === "deepseek") return keys.deepseekKey || null;
  if (provider === "mistral") return keys.mistralKey || null;
  if (provider === "deepinfra") return keys.deepinfraKey || null;
  return keys.openRouterKey || null;
}

/**
 * Extract text content from delta, handling both plain strings and
 * Magistral's array format with thinking/text content parts.
 */
export function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return (part as { text?: string }).text || "";
        }
        return "";
      })
      .join("");
  }
  if (content && typeof content === "object" && "text" in content) {
    const obj = content as { text?: unknown };
    if (typeof obj.text === "string") return obj.text;
  }
  return "";
}

export interface StreamCompletionResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCost?: number; // DeepInfra provides this
}

/**
 * Stream a single chat-completion request against a provider, calling
 * onText for each visible text delta as it arrives. Used for every
 * generation/continuation/wrap-up call across the four creator endpoints.
 */
export async function streamProviderCompletion(
  messages: { role: string; content: string }[],
  modelConfig: AIModelConfig,
  apiKey: string,
  maxOutputTokens: number,
  temperature: number,
  onText: (text: string) => void,
): Promise<StreamCompletionResult> {
  const hasPrefill =
    messages.length > 0 && messages[messages.length - 1].role === "assistant";

  let endpoint: string;
  switch (modelConfig.provider) {
    case "deepseek":
      endpoint = hasPrefill
        ? "https://api.deepseek.com/beta/chat/completions"
        : "https://api.deepseek.com/chat/completions";
      break;
    case "mistral":
      endpoint = "https://api.mistral.ai/v1/chat/completions";
      break;
    case "deepinfra":
      endpoint = "https://api.deepinfra.com/v1/openai/chat/completions";
      break;
    default:
      endpoint = "https://openrouter.ai/api/v1/chat/completions";
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  if (modelConfig.provider === "openrouter") {
    headers["HTTP-Referer"] = process.env.NEXT_PUBLIC_SITE_URL || "";
    headers["X-Title"] = "Your Story - Big Adventure Creator";
  }

  // Process messages - add prefix: true to last assistant message for providers that need it.
  // OpenRouter/DeepInfra don't need this flag - they continue naturally.
  const processedMessages = messages.map((m, index) => {
    const msg: any = { role: m.role, content: m.content };
    if (
      index === messages.length - 1 &&
      m.role === "assistant" &&
      (modelConfig.provider === "mistral" || modelConfig.provider === "deepseek")
    ) {
      msg.prefix = true;
    }
    return msg;
  });

  const requestBody = {
    model: modelConfig.model,
    messages: processedMessages,
    temperature,
    max_tokens: maxOutputTokens,
    stream: true,
  };

  const providerFetch = getProviderFetch();
  const response = await providerFetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI API error: ${response.status} - ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let estimatedCost: number | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;

      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") continue;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta;
        if (delta) {
          const textContent = extractTextContent(delta.content);
          if (textContent) {
            fullContent += textContent;
            onText(textContent);
          }
        }

        if (parsed.usage) {
          promptTokens = parsed.usage.prompt_tokens || 0;
          completionTokens = parsed.usage.completion_tokens || 0;
          if (parsed.usage.estimated_cost !== undefined) {
            estimatedCost = parsed.usage.estimated_cost;
          }
        }
      } catch {
        // Skip malformed JSON
      }
    }
  }

  return { content: fullContent, promptTokens, completionTokens, estimatedCost };
}

/** Small SSE-emitter helper shared by all four route ReadableStreams. */
export function makeSSEEmitter(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
) {
  return (data: unknown) => {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  };
}
