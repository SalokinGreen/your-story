import { NextRequest, NextResponse } from "next/server";
import { StoryData, CommandResponse } from "@/app/misc/structs";
import { buildMessages, coerceToScenePart, ChatMessage } from "@/app/misc/ai";
import { createClient } from "@supabase/supabase-js";
import {
  hasEnoughTokens,
  deductTokens,
  getUserTokenBalance,
} from "@/app/misc/tokens";
import { getModelConfig } from "@/app/misc/ai_prices";
import { getUserSettings } from "@/app/misc/user_settings";
import { executeTools, ToolCall } from "@/app/misc/toolExecutor";

export const runtime = "nodejs";

interface RequestBody {
  storyData: StoryData;
  userChoice?: string;
  model?: string; // Optional model selection
  useRawContext?: boolean; // Use raw AI output in context instead of parsed content
  openRouterKey?: string; // BYOK key from client
  commandResponses?: CommandResponse[]; // AI feedback from last commands
}

interface AIChoice {
  index: number;
  message: {
    role: "assistant" | "user" | "system";
    content: string;
    tool_calls?: ToolCall[];
  };
  finish_reason?: string;
}

interface AIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface AIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: AIChoice[];
  usage?: AIUsage;
}

export async function POST(req: NextRequest) {
  // Create Supabase client for server-side authentication
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_KEY || process.env.SUPABASE_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey || !supabaseServiceKey) {
    return NextResponse.json(
      { error: "Server not configured: missing Supabase credentials" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Get authentication token from request headers
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json(
      { error: "Authentication required", code: "AUTH_REQUIRED" },
      { status: 401 }
    );
  }

  // Verify the user's session
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));

  if (authError || !user) {
    return NextResponse.json(
      { error: "Invalid or expired session", code: "AUTH_INVALID" },
      { status: 401 }
    );
  }

  const userId = user.id;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch (e) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    storyData,
    userChoice,
    model: requestedModel,
    useRawContext,
    openRouterKey,
    commandResponses,
  } = body;
  if (!storyData) {
    return NextResponse.json(
      { error: "Missing storyData in request body" },
      { status: 400 }
    );
  }

  // Check user settings for BYOK
  const userSettings = await getUserSettings(userId, supabaseAdmin);
  const isSubscriber = userSettings?.is_subscriber || false;
  const byokEnabled = userSettings?.byok_enabled || false;

  // Check token balance (requires 1 token) IF not using BYOK
  const REQUIRED_TOKENS = 1;
  let shouldUseTokens = true;

  // Only use BYOK if subscriber, BYOK is enabled in settings, and key is provided
  if (isSubscriber && byokEnabled && openRouterKey) {
    shouldUseTokens = false;
    console.log(`User ${userId} using BYOK (OpenRouter)`);
  }

  if (shouldUseTokens) {
    const hasTokens = await hasEnoughTokens(
      userId,
      REQUIRED_TOKENS,
      supabaseAdmin
    );

    if (!hasTokens) {
      const balance = await getUserTokenBalance(userId, supabaseAdmin);
      return NextResponse.json(
        {
          error: `Insufficient tokens. You need ${REQUIRED_TOKENS} tokens to generate a story continuation.`,
          code: "INSUFFICIENT_TOKENS",
          balance: balance,
          required: REQUIRED_TOKENS,
        },
        { status: 402 } // 402 Payment Required
      );
    }
  }

  // Get model configuration
  let modelKey =
    requestedModel || process.env.DEFAULT_AI_MODEL || "deep-seek/deepseek-chat";

  // Handle custom model from user settings
  let modelConfig = getModelConfig(modelKey);
  let customModelUsed = false;
  let isCustomModel = false;

  // Check if the selected model is a custom BYOK model
  if (isSubscriber && byokEnabled && userSettings?.custom_models) {
    const customModel = userSettings.custom_models.find(
      (m) => m.id === modelKey
    );

    if (customModel) {
      modelConfig = {
        name: customModel.name,
        model: customModel.modelId,
        provider: "openrouter", // Custom models assumed to be OpenRouter
        contextWindow: customModel.contextSize,
        maxOutputTokens: customModel.maxOutputTokens,
        cost: 0, // BYOK doesn't cost tokens
        original_model: customModel.modelId,
        maxTokens: customModel.contextSize,
        inputPrice: 0,
        outputPrice: 0,
        finetunes: [],
        strengths: [],
        weaknesses: [],
        description: "Custom User Model (BYOK)",
      };
      customModelUsed = true;
      isCustomModel = true;
      shouldUseTokens = false; // Custom models don't consume tokens
      console.log("Using custom BYOK model:", modelConfig);
    }
  }

  console.log(
    "Using model:",
    modelConfig.name,
    "Provider:",
    modelConfig.provider,
    "Is Custom BYOK:",
    isCustomModel,
    "Raw context:",
    useRawContext || false
  );

  // Get appropriate API key based on provider
  let apiKey: string | undefined;
  let apiUrl: string;

  if (modelConfig.provider === "openrouter") {
    // Use user key if available and subscriber, otherwise fallback to system key
    if (!shouldUseTokens && openRouterKey) {
      apiKey = openRouterKey;
    } else {
      apiKey = process.env.OPENROUTER_API_KEY;
    }

    apiUrl = "https://openrouter.ai/api/v1/chat/completions";
    console.log(
      "OpenRouter API Key source:",
      !shouldUseTokens && openRouterKey ? "USER (BYOK)" : "SYSTEM"
    );

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Server not configured: missing OPENROUTER_API_KEY and no user key provided",
        },
        { status: 500 }
      );
    }
  } else {
    // DeepSeek provider
    apiKey = process.env.DEEPSEEK_API_KEY;
    apiUrl = "https://api.deepseek.com/chat/completions";
    console.log("DeepSeek API Key:", apiKey ? "FOUND" : "MISSING");
    if (!apiKey) {
      return NextResponse.json(
        { error: "Server not configured: missing DEEPSEEK_API_KEY" },
        { status: 500 }
      );
    }
  }

  const { messages: rawMessages, tools } = buildMessages({
    storyData,
    userChoice,
    useRawContext,
    maxTokens: modelConfig.maxTokens,
    commandResponses,
    supportsToolCalling: modelConfig.supportsToolCalling || false,
  });
  // Filter out duplicate messages
  let messages = rawMessages.filter(
    (msg, index, self) =>
      index ===
      self.findIndex((m) => m.role === msg.role && m.content === msg.content)
  );
  console.log("MESSAGES:", messages);
  console.log("Built messages. Message count:", messages.length);
  console.log(
    "Last message length:",
    messages[messages.length - 1]?.content?.length || 0
  );

  try {
    console.log(`Calling ${modelConfig.provider} API...`);

    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    // Build headers based on provider
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };

    // Add OpenRouter-specific headers
    if (modelConfig.provider === "openrouter") {
      headers["HTTP-Referer"] =
        process.env.NEXT_PUBLIC_SITE_URL || "https://your-story.app";
      headers["X-Title"] = "Your Story - Interactive Fiction";
    }

    const requestBody: any = {
      model: modelConfig.model,
      messages,
      temperature: 0.7,
      max_tokens: modelConfig.maxOutputTokens,
      stream: false,
    };

    // Only include tools if model supports them
    if (tools.length > 0) {
      requestBody.tools = tools;
      requestBody.tool_choice = "auto";
    }

    const resp = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    console.log(`${modelConfig.provider} response status:`, resp.status);

    if (!resp.ok) {
      const text = await resp.text();
      console.error(`${modelConfig.provider} error response:`, text);
      return NextResponse.json(
        {
          error: `${modelConfig.provider} error: ${resp.status} ${resp.statusText}`,
          details: text,
        },
        { status: 502 }
      );
    }

    const data = (await resp.json()) as AIResponse;
    console.log(
      `${modelConfig.provider} response received. Choices:`,
      data.choices?.length || 0
    );

    const aiMessage = data.choices?.[0]?.message;
    const content = aiMessage?.content ?? "";
    const toolCalls = aiMessage?.tool_calls || [];

    console.log("Content:", content);
    console.log("Content length:", content.length);
    console.log("Tool calls:", toolCalls.length);
    if (toolCalls.length > 0) {
      console.log(
        "Tool call names:",
        toolCalls.map((tc: any) => tc.function?.name).join(", ")
      );
    }
    console.log("Content preview:", content.substring(0, 200));

    // Execute tool calls if any
    let toolResponses: CommandResponse[] = [];
    if (toolCalls.length > 0) {
      console.log("Executing tool calls...");
      toolResponses = executeTools(toolCalls, storyData);
      console.log("Tool execution complete. Responses:", toolResponses.length);
      toolResponses.forEach((resp, idx) => {
        console.log(
          `  Tool ${idx + 1}: ${resp.command} - ${
            resp.success ? "SUCCESS" : "FAILED"
          } - ${resp.message}`
        );
      });
    }

    let part;
    try {
      part = coerceToScenePart(content);

      // Store tool calls and responses in the ScenePart for conversation history
      if (toolCalls.length > 0) {
        part.toolCalls = toolCalls;
      }
      if (toolResponses.length > 0) {
        part.toolResponses = toolResponses;
      }

      console.log(
        "Successfully parsed ScenePart. Choices:",
        part.choices?.length || 0
      );
    } catch (parseError) {
      console.error("Error parsing ScenePart:", parseError);
      console.error("Raw content:", content);
      return NextResponse.json(
        {
          error: "Failed to parse AI response",
          details: (parseError as Error).message,
          rawContent: content,
        },
        { status: 500 }
      );
    }

    // Deduct tokens after successful generation IF using tokens
    if (shouldUseTokens) {
      const deductResult = await deductTokens(
        userId,
        REQUIRED_TOKENS,
        supabaseAdmin
      );
      if (!deductResult.success) {
        console.error(
          "Failed to deduct tokens after generation:",
          deductResult.error
        );
        console.error("User ID:", userId);
        console.error("Service role key configured:", !!supabaseServiceKey);
        // Log error but don't fail the request since generation succeeded
      } else {
        console.log(
          `Successfully deducted ${REQUIRED_TOKENS} tokens from user ${userId}`
        );
      }
    } else {
      console.log(`BYOK used, no tokens deducted for user ${userId}`);
    }

    // Get updated balance
    const updatedBalance = await getUserTokenBalance(userId, supabaseAdmin);

    return NextResponse.json({
      part,
      toolResponses, // Include tool execution results
      meta: {
        model: data.model,
        modelName: modelConfig.name,
        provider: modelConfig.provider,
        usage: data.usage,
        tokensDeducted: shouldUseTokens ? REQUIRED_TOKENS : 0,
        tokenCost: shouldUseTokens ? modelConfig.cost : 0,
        remainingBalance: updatedBalance,
      },
    });
  } catch (err) {
    const error = err as Error;
    console.error("Error in /api/story/next:", error);

    // Check if it's an abort error (timeout)
    if (error.name === "AbortError") {
      return NextResponse.json(
        {
          error: "Request timed out. The AI took too long to respond.",
          details: "Timeout after 30 seconds",
        },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to call AI API",
        details: error.message,
        stack: error.stack,
      },
      { status: 500 }
    );
  }
}
