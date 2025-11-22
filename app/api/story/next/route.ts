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
    // Helper to perform a single AI call
    async function callAI(currentMessages: ChatMessage[]) {
      console.log(`Calling ${modelConfig.provider} API...`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };
      if (modelConfig.provider === "openrouter") {
        headers["HTTP-Referer"] =
          process.env.NEXT_PUBLIC_SITE_URL || "https://your-story.app";
        headers["X-Title"] = "Your Story - Interactive Fiction";
      }
      const requestBody: any = {
        model: modelConfig.model,
        messages: currentMessages,
        temperature: 0.7,
        max_tokens: modelConfig.maxOutputTokens,
        stream: false,
      };
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
        const providerError = new Error(
          `${modelConfig.provider} error: ${resp.status} ${resp.statusText}`
        );
        (providerError as any).isProviderError = true;
        (providerError as any).details = text;
        (
          providerError as any
        ).rawMessage = `${modelConfig.provider} error: ${resp.status} ${resp.statusText}`;
        throw providerError;
      }
      return (await resp.json()) as AIResponse;
    }

    const maxChainAttempts = parseInt(
      process.env.AI_MAX_TOOL_CHAIN_ATTEMPTS || "10",
      10
    );
    let chainAttempt = 0;
    let collectedParts: any[] = []; // Array to store each ScenePart from chain
    let finalData: AIResponse | null = null;

    // Work on a mutable copy of messages
    let workingMessages: ChatMessage[] = [...messages];

    while (chainAttempt <= maxChainAttempts) {
      console.log(
        `AI chain attempt ${chainAttempt + 1} / ${maxChainAttempts + 1}`
      );
      const data = await callAI(workingMessages);
      const aiMessage = data.choices?.[0]?.message;
      const content = aiMessage?.content || "";
      const toolCalls = aiMessage?.tool_calls || [];
      console.log("Received content length:", content.length);
      console.log("Tool calls count:", toolCalls.length);
      if (toolCalls.length > 0) {
        console.log(
          "Tool call names:",
          toolCalls.map((tc: any) => tc.function?.name).join(", ")
        );
      }

      // Execute tool calls if present
      let toolResponses: CommandResponse[] = [];
      if (toolCalls.length > 0) {
        console.log("Executing tool calls...");
        toolResponses = executeTools(toolCalls, storyData);
        toolResponses.forEach((resp, idx) => {
          console.log(
            `  Tool ${idx + 1}: ${resp.command} - ${
              resp.success ? "SUCCESS" : "FAILED"
            } - ${resp.message}`
          );
        });
      }

      // Check if we should continue chaining
      const contentIsEmpty = content.trim().length < 50 && toolCalls.length > 0;

      // Create a ScenePart for this iteration
      let iterationPart: any = null;
      try {
        // If content exists (even if short), try to parse it as a ScenePart
        if (content.trim().length > 0) {
          iterationPart = coerceToScenePart(content);
          iterationPart.role = "assistant";
          iterationPart.user = false;
        } else if (toolCalls.length > 0) {
          // Tool-only response - create minimal part to preserve tool calls
          iterationPart = {
            content: "", // Empty content, just tools
            imageUrl: "",
            user: false,
            role: "assistant" as const,
            choices: [],
          };
        }

        // Attach tool data to this part
        if (iterationPart && toolCalls.length > 0) {
          iterationPart.toolCalls = toolCalls;
        }
        if (iterationPart && toolResponses.length > 0) {
          iterationPart.toolResponses = toolResponses;
        }

        // Add to collected parts if we have something
        if (iterationPart) {
          collectedParts.push(iterationPart);
        }
      } catch (parseError) {
        console.error(
          `Parse error on iteration ${chainAttempt + 1}:`,
          parseError
        );
        // Continue with next iteration if parsing fails
      }

      // Append tool role messages for next iteration if we need to chain
      if (contentIsEmpty && chainAttempt < maxChainAttempts) {
        // Add assistant message with tool calls to conversation
        // For DeepSeek/OpenAI compatibility, we need to add the full assistant message
        if (toolCalls.length > 0) {
          workingMessages.push({
            role: "assistant",
            content: content || "",
            tool_calls: toolCalls.map((tc: any) => ({
              id: tc.id,
              type: "function",
              function: {
                name: tc.function?.name,
                arguments: typeof tc.function?.arguments === 'string' 
                  ? tc.function.arguments 
                  : JSON.stringify(tc.function?.arguments || {})
              }
            }))
          } as any);
        }

        // Add tool response messages
        toolResponses.forEach((tr) => {
          workingMessages.push({
            role: "tool",
            tool_call_id: tr.toolCallId || "",
            content: JSON.stringify({
              command: tr.command,
              success: tr.success,
              message: tr.message,
            }),
          } as any);
        });
      }

      // Check if we should stop (have substantial content)
      if (!contentIsEmpty) {
        finalData = data;
        break;
      }

      chainAttempt++;
      if (chainAttempt > maxChainAttempts) {
        finalData = data;
        console.warn(
          "Max tool chain attempts reached without substantial content."
        );
        break;
      }
    }

    if (!finalData) {
      return NextResponse.json(
        { error: "AI response missing after attempts" },
        { status: 500 }
      );
    }

    // If no parts were collected, something went wrong
    if (collectedParts.length === 0) {
      return NextResponse.json(
        {
          error: "No valid scene parts generated",
          attempts: chainAttempt + 1,
        },
        { status: 500 }
      );
    }

    console.log(
      `Generated ${collectedParts.length} scene part(s) across ${
        chainAttempt + 1
      } iteration(s)`
    );

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
      parts: collectedParts, // Return array of parts
      meta: {
        model: finalData.model,
        modelName: modelConfig.name,
        provider: modelConfig.provider,
        usage: finalData.usage,
        tokensDeducted: shouldUseTokens ? REQUIRED_TOKENS : 0,
        tokenCost: shouldUseTokens ? modelConfig.cost : 0,
        remainingBalance: updatedBalance,
        chainAttempts: chainAttempt + 1,
        maxChainAttempts,
      },
    });
  } catch (err) {
    const error = err as Error;
    console.error("Error in /api/story/next:", error);

    if ((error as any).isProviderError) {
      return NextResponse.json(
        {
          error: (error as any).rawMessage || error.message,
          details: (error as any).details,
        },
        { status: 502 }
      );
    }

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
