/**
 * Generic AI Generation API
 *
 * A thin, stateless AI proxy endpoint. Receives pre-built messages and config,
 * forwards to AI provider, returns raw response. All context building and
 * tool execution happens on the frontend.
 *
 * BYOK (Bring Your Own Key) model:
 * - Users must provide their own API keys
 * - No token deduction - users pay providers directly
 *
 * Request: { messages, tools?, model, maxTokens, openRouterKey?, deepseekKey? }
 * Response: { content, toolCalls?, meta }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getModelConfig } from "@/app/misc/ai_prices";
import { logger } from "@/app/misc/logger";

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
  };
}

async function callAI(
  messages: ChatMessage[],
  provider: "deepseek" | "openrouter",
  model: string,
  apiKey: string,
  maxTokens: number,
  temperature: number,
  tools?: any[]
): Promise<AIResponse> {
  const endpoint =
    provider === "deepseek"
      ? "https://api.deepseek.com/chat/completions"
      : "https://openrouter.ai/api/v1/chat/completions";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  if (provider === "openrouter") {
    headers["HTTP-Referer"] = process.env.NEXT_PUBLIC_SITE_URL || "";
    headers["X-Title"] = "Your Story";
  }

  const requestBody: any = {
    model,
    messages: messages.map((m) => {
      const msg: any = { role: m.role, content: m.content };
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
  provider: "deepseek" | "openrouter",
  openRouterKey?: string,
  deepseekKey?: string
): string | null {
  if (provider === "deepseek") {
    // DeepSeek requires user's own key - no server fallback
    return deepseekKey || null;
  } else {
    // OpenRouter requires user's own key - no server fallback
    return openRouterKey || null;
  }
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

    // Get model config
    const modelConfig = getModelConfig(model);

    // Get API key from user's provided keys
    const apiKey = getApiKey(
      modelConfig.provider as "deepseek" | "openrouter",
      openRouterKey,
      deepseekKey
    );

    if (!apiKey) {
      const providerName =
        modelConfig.provider === "deepseek" ? "DeepSeek" : "OpenRouter";
      return NextResponse.json(
        {
          error: `No API key configured for ${providerName}. Please add your API key in Settings.`,
          code: "NO_API_KEY",
        },
        { status: 400 }
      );
    }

    // Call AI
    const aiResponse = await callAI(
      messages,
      modelConfig.provider as "deepseek" | "openrouter",
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
