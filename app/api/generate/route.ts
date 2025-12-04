/**
 * Generic AI Generation API
 *
 * A thin, stateless AI proxy endpoint. Receives pre-built messages and config,
 * forwards to AI provider, returns raw response. All context building and
 * tool execution happens on the frontend.
 *
 * Provider modes:
 * - BYOK (OpenRouter/DeepSeek): Users provide their own API keys, no token billing
 * - Coins (Mistral/DeepInfra): Server-side API key, users pay with coins
 *
 * Request: { messages, tools?, model, maxTokens, openRouterKey?, deepseekKey? }
 * Response: { content, toolCalls?, meta }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getModelConfig,
  calculateTokenCost,
  calculateCostFromEstimatedCost,
  AIModelConfig,
} from "@/app/misc/ai_prices";
import { deductTokens, getUserTokenBalance } from "@/app/misc/tokens";
import { logger } from "@/app/misc/logger";
import { getUserSettings, CustomModel } from "@/app/misc/user_settings";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const runtime = "nodejs";
export const maxDuration = 60; // Allow up to 60 seconds for generation

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string | Record<string, any>;
  };
}

interface RequestBody {
  messages: ChatMessage[];
  tools?: any[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  openRouterKey?: string;
  deepseekKey?: string;
}

interface AIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimated_cost?: number; // DeepInfra provides this in dollars
  };
}

async function callAI(
  messages: ChatMessage[],
  provider: "deepseek" | "openrouter" | "mistral" | "deepinfra",
  model: string,
  apiKey: string,
  maxTokens: number,
  temperature: number,
  tools?: any[]
): Promise<AIResponse> {
  // Check if we have a prefill (trailing assistant message)
  const hasPrefill =
    messages.length > 0 && messages[messages.length - 1].role === "assistant";
  const hasTools = tools && tools.length > 0;

  let endpoint: string;
  if (provider === "deepseek") {
    // Use beta endpoint for prefill support (prefix: true requires beta API)
    // BUT: DeepSeek beta doesn't support prefix + function calling together
    // So only use beta for non-tool calls (story generation)
    endpoint =
      hasPrefill && !hasTools
        ? "https://api.deepseek.com/beta/chat/completions"
        : "https://api.deepseek.com/chat/completions";
  } else if (provider === "mistral") {
    endpoint = "https://api.mistral.ai/v1/chat/completions";
  } else if (provider === "deepinfra") {
    endpoint = "https://api.deepinfra.com/v1/openai/chat/completions";
  } else {
    endpoint = "https://openrouter.ai/api/v1/chat/completions";
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  if (provider === "openrouter") {
    headers["HTTP-Referer"] = process.env.NEXT_PUBLIC_SITE_URL || "";
    headers["X-Title"] = "Your Story";
  }

  // For DeepSeek/DeepInfra with tools: strip the prefill since these providers don't handle prefill well with function calling
  let processedMessages = messages;
  if (
    (provider === "deepseek" || provider === "deepinfra") &&
    hasTools &&
    hasPrefill
  ) {
    processedMessages = messages.slice(0, -1);
    console.log(`[API] Stripped prefill for ${provider} tool calling`);
  }

  const requestBody: any = {
    model,
    messages: processedMessages.map((m, index) => {
      const msg: any = { role: m.role, content: m.content || "" };
      if (m.tool_calls) {
        // Re-serialize tool call arguments to strings if they're objects
        // (AI APIs expect arguments as JSON strings, not parsed objects)
        msg.tool_calls = m.tool_calls.map((tc: any) => ({
          ...tc,
          function: {
            ...tc.function,
            arguments:
              typeof tc.function.arguments === "string"
                ? tc.function.arguments
                : JSON.stringify(tc.function.arguments),
          },
        }));
      }
      if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
      // For Mistral: if the last message is assistant (prefill), add prefix: true
      // For DeepSeek: only add prefix: true for non-tool calls (story generation)
      // DeepSeek's beta API doesn't support prefix + function calling together
      if (
        index === processedMessages.length - 1 &&
        m.role === "assistant" &&
        (provider === "mistral" || (provider === "deepseek" && !hasTools))
      ) {
        msg.prefix = true;
      }
      return msg;
    }),
    temperature,
    max_tokens: maxTokens,
  };

  if (tools && tools.length > 0) {
    requestBody.tools = tools;
    requestBody.tool_choice = "auto";
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `AI API request failed: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  return await response.json();
}

function getApiKey(
  provider: "deepseek" | "openrouter" | "mistral" | "deepinfra",
  openRouterKey?: string,
  deepseekKey?: string
): string | null {
  if (provider === "deepseek") {
    return deepseekKey || null;
  } else if (provider === "mistral") {
    // Mistral uses server-side API key - users pay with coins
    return process.env.MISTRAL_API_KEY || null;
  } else if (provider === "deepinfra") {
    // DeepInfra uses server-side API key - users pay with coins
    return process.env.DEEPINFRA_API_KEY || null;
  } else {
    return openRouterKey || null;
  }
}

/**
 * Check if a string looks like a UUID (custom model ID)
 */
function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    str
  );
}

/**
 * Resolve a model key to its config, handling custom models stored in user settings
 */
async function resolveModelConfig(
  modelKey: string,
  userId: string,
  supabase: any // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<AIModelConfig> {
  // If it's a known model, use it directly
  if (!isUUID(modelKey)) {
    return getModelConfig(modelKey);
  }

  // It's a UUID - look up custom model from user settings
  const settings = await getUserSettings(userId, supabase);
  const customModels = settings?.custom_models || [];
  const customModel = customModels.find((m: CustomModel) => m.id === modelKey);

  if (customModel) {
    // Found custom model - create config for OpenRouter
    return {
      name: customModel.name,
      original_model: customModel.modelId,
      model: customModel.modelId, // Actual OpenRouter model ID
      maxTokens: customModel.contextSize,
      maxOutputTokens: customModel.maxOutputTokens,
      provider: "openrouter", // Custom models are always OpenRouter
      supportsToolCalling: true,
      cost: 0,
      inputPrice: customModel.inputPrice || 0,
      outputPrice: customModel.outputPrice || 0,
      finetunes: [],
      strengths: [],
      weaknesses: [],
      description: "Custom user-defined model",
      bannerUrl: undefined,
    };
  }

  // UUID not found in custom models - fall back to default
  console.warn(
    `Custom model UUID "${modelKey}" not found in user settings, falling back to default`
  );
  return getModelConfig(modelKey);
}

export async function POST(req: NextRequest) {
  try {
    // Validate auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request
    const body: RequestBody = await req.json();
    const {
      messages,
      tools,
      model = "Gemini 2.5 Flash",
      maxTokens = 4000,
      temperature = 0.7,
      openRouterKey,
      deepseekKey,
    } = body;

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages are required" },
        { status: 400 }
      );
    }

    // Get model config (resolves custom models from user settings)
    const modelConfig = await resolveModelConfig(model, user.id, supabase);

    // Get API key from user's provided keys (or server key for Mistral/DeepInfra)
    const apiKey = getApiKey(
      modelConfig.provider as
        | "deepseek"
        | "openrouter"
        | "mistral"
        | "deepinfra",
      openRouterKey,
      deepseekKey
    );

    if (!apiKey) {
      let errorMessage: string;
      if (modelConfig.provider === "mistral") {
        errorMessage =
          "Mistral API is not configured on the server. Please contact support.";
      } else if (modelConfig.provider === "deepinfra") {
        errorMessage =
          "DeepInfra API is not configured on the server. Please contact support.";
      } else {
        const providerNames: Record<string, string> = {
          deepseek: "DeepSeek",
          openrouter: "OpenRouter",
        };
        const providerName =
          providerNames[modelConfig.provider] || modelConfig.provider;
        errorMessage = `No API key configured for ${providerName}. Please add your API key in Settings.`;
      }
      return NextResponse.json(
        {
          error: errorMessage,
          code: "NO_API_KEY",
        },
        { status: 400 }
      );
    }

    // Check token balance for Coins mode providers (Mistral/DeepInfra) before making request
    if (
      modelConfig.provider === "mistral" ||
      modelConfig.provider === "deepinfra"
    ) {
      const balance = await getUserTokenBalance(user.id, supabase);
      const estimatedCost = Math.max(1, modelConfig.cost || 1);
      const currentBalance = balance?.total ?? 0;
      if (currentBalance < estimatedCost) {
        return NextResponse.json(
          {
            error: `Insufficient coins. You need at least ${estimatedCost} coins for this model. Current balance: ${currentBalance}`,
            code: "INSUFFICIENT_BALANCE",
          },
          { status: 402 }
        );
      }
    }

    // Call AI
    const aiResponse = await callAI(
      messages,
      modelConfig.provider as
        | "deepseek"
        | "openrouter"
        | "mistral"
        | "deepinfra",
      modelConfig.model,
      apiKey,
      maxTokens,
      temperature,
      tools
    );

    const content = aiResponse.choices[0]?.message?.content || "";
    const toolCalls = aiResponse.choices[0]?.message?.tool_calls;
    const usage = aiResponse.usage || {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };

    logger.action("AI generation complete", {
      userId: user.id,
      model: modelConfig.model,
      provider: modelConfig.provider,
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      hasToolCalls: !!toolCalls,
    });

    // Deduct tokens for Coins mode providers (Mistral/DeepInfra)
    let tokenCost = 0;
    let newBalance: number | undefined;
    if (
      (modelConfig.provider === "mistral" ||
        modelConfig.provider === "deepinfra") &&
      (usage.prompt_tokens > 0 ||
        usage.completion_tokens > 0 ||
        usage.estimated_cost !== undefined)
    ) {
      // Use estimated_cost from DeepInfra if available, otherwise calculate from tokens
      if (
        modelConfig.provider === "deepinfra" &&
        usage.estimated_cost !== undefined
      ) {
        tokenCost = calculateCostFromEstimatedCost(usage.estimated_cost);
      } else {
        tokenCost = calculateTokenCost(
          model,
          usage.prompt_tokens,
          usage.completion_tokens
        );
      }
      const deductResult = await deductTokens(user.id, tokenCost, supabase);
      if (!deductResult.success) {
        logger.warn("Failed to deduct tokens for generation", {
          userId: user.id,
          provider: modelConfig.provider,
          tokenCost,
          error: deductResult.error,
        });
      } else {
        const balanceResult = await getUserTokenBalance(user.id, supabase);
        newBalance = balanceResult?.total;
      }
    }

    return NextResponse.json({
      content,
      toolCalls: toolCalls || [],
      meta: {
        model: modelConfig.model,
        modelName: model,
        provider: modelConfig.provider,
        usage: {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        },
        tokenCost: tokenCost > 0 ? tokenCost : undefined,
        newBalance,
      },
    });
  } catch (error: any) {
    logger.error("Generation API error", { error: error.message });
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
