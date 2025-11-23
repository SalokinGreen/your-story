import { NextRequest, NextResponse } from "next/server";
import { StoryData, CommandResponse, ScenePart } from "@/app/misc/structs";
import {
  buildStoryPrompt,
  buildToolPrompt,
  buildChoicesPrompt,
  ChatMessage,
} from "@/app/misc/ai_staged";
import { createClient } from "@supabase/supabase-js";
import {
  hasEnoughTokens,
  deductTokens,
  getUserTokenBalance,
} from "@/app/misc/tokens";
import { getModelConfig } from "@/app/misc/ai_prices";
import { TOOL_SCHEMAS } from "@/app/misc/toolSchemas";
import { executeTools, ToolCall } from "@/app/misc/toolExecutor";

export const runtime = "nodejs";

interface RequestBody {
  storyData: StoryData;
  userChoice?: string;
  model?: string;
  modelStory?: string;
  modelTools?: string;
  modelChoices?: string;
  openRouterKey?: string;
  commandResponses?: CommandResponse[];
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

async function callAI(
  messages: ChatMessage[],
  provider: "deepseek" | "openrouter",
  model: string,
  apiKey: string,
  maxTokens: number,
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
    model: provider === "deepseek" ? model : model,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    temperature: 0.7,
    max_tokens: maxTokens,
  };

  // Add tools if provided (for Stage 2a)
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
    throw new Error(`AI API error (${response.status}): ${errorText}`);
  }

  return await response.json();
}

export async function POST(req: NextRequest) {
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

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json(
      { error: "Authentication required", code: "AUTH_REQUIRED" },
      { status: 401 }
    );
  }

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
    return NextResponse.json(
      { error: "Invalid request body", code: "INVALID_JSON" },
      { status: 400 }
    );
  }

  const {
    storyData,
    userChoice,
    model: modelKey,
    modelStory: modelStoryKey,
    modelTools: modelToolsKey,
    modelChoices: modelChoicesKey,
    openRouterKey,
    commandResponses,
  } = body;

  if (!storyData) {
    return NextResponse.json(
      { error: "Missing storyData", code: "MISSING_DATA" },
      { status: 400 }
    );
  }

  // Get model configurations for each stage
  const defaultModelKey = modelKey || process.env.DEFAULT_AI_MODEL || "Prometheus";
  
  const storyModelConfig = getModelConfig(
    modelStoryKey || defaultModelKey
  );
  const toolsModelConfig = getModelConfig(
    modelToolsKey || defaultModelKey
  );
  const choicesModelConfig = getModelConfig(
    modelChoicesKey || defaultModelKey
  );

  // Determine API keys for each stage
  const getApiKey = (provider: "deepseek" | "openrouter") => {
    if (provider === "deepseek") {
      return process.env.DEEPSEEK_API_KEY || "";
    } else {
      return openRouterKey || process.env.OPENROUTER_API_KEY || "";
    }
  };

  const storyApiKey = getApiKey(storyModelConfig.provider);
  const toolsApiKey = getApiKey(toolsModelConfig.provider);
  const choicesApiKey = getApiKey(choicesModelConfig.provider);

  if (!storyApiKey || !toolsApiKey || !choicesApiKey) {
    return NextResponse.json(
      {
        error: `Missing API keys for one or more providers`,
        code: "MISSING_API_KEY",
      },
      { status: 500 }
    );
  }

  // Check token balance (staged mode costs ~2x)
  const balance = await getUserTokenBalance(userId, supabaseAdmin);
  const estimatedCost = 
    (storyModelConfig.cost + toolsModelConfig.cost + choicesModelConfig.cost);

  const hasTokens = await hasEnoughTokens(userId, estimatedCost, supabaseAdmin);
  if (!hasTokens) {
    return NextResponse.json(
      {
        error: `Insufficient tokens. Need ${estimatedCost}, have ${
          balance?.tradable || 0
        } tradable.`,
        balance,
        code: "INSUFFICIENT_TOKENS",
      },
      { status: 402 }
    );
  }

  try {
    // STAGE 1: Generate story narration
    console.log("[Staged] Stage 1: Generating story...");
    const storyPrompt = buildStoryPrompt({
      storyData,
      userChoice,
      commandResponses,
    });

    const storyResponse = await callAI(
      storyPrompt.messages,
      storyModelConfig.provider,
      storyModelConfig.model,
      storyApiKey,
      storyModelConfig.maxOutputTokens
    );

    const storyContent = storyResponse.choices[0]?.message?.content || "";
    const storyUsage = storyResponse.usage || {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };

    if (!storyContent) {
      return NextResponse.json(
        { error: "AI returned empty story content", code: "EMPTY_RESPONSE" },
        { status: 500 }
      );
    }

    console.log(`[Staged] Stage 1 complete: ${storyUsage.total_tokens} tokens`);

    // STAGE 2: Generate tools and choices in parallel
    console.log("[Staged] Stage 2: Generating tools and choices...");

    const toolPrompt = buildToolPrompt({
      storyData,
      storyContent,
      commandResponses,
    });

    const choicesPrompt = buildChoicesPrompt({
      storyData,
      storyContent,
    });

    const [toolResponse, choicesResponse] = await Promise.all([
      callAI(
        toolPrompt.messages,
        toolsModelConfig.provider,
        toolsModelConfig.model,
        toolsApiKey,
        toolsModelConfig.maxOutputTokens,
        TOOL_SCHEMAS // Pass tools for Stage 2a
      ),
      callAI(
        choicesPrompt.messages,
        choicesModelConfig.provider,
        choicesModelConfig.model,
        choicesApiKey,
        choicesModelConfig.maxOutputTokens
        // No tools for Stage 2b
      ),
    ]);

    const toolCalls = toolResponse.choices[0]?.message?.tool_calls || [];
    const choicesContent = choicesResponse.choices[0]?.message?.content || "";

    const toolUsage = toolResponse.usage || {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };
    const choicesUsage = choicesResponse.usage || {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };

    console.log(
      `[Staged] Stage 2 complete: Tools ${toolUsage.total_tokens} tokens (${toolCalls.length} calls), Choices ${choicesUsage.total_tokens} tokens`
    );

    // Execute tool calls
    let toolResponses: CommandResponse[] = [];
    if (toolCalls.length > 0) {
      toolResponses = await executeTools(toolCalls, storyData);
      console.log(`[Staged] Executed ${toolResponses.length} tool calls`);
    }

    // Parse choices from plain text list
    const choiceLines = choicesContent
      .split("\n")
      .filter((line) => line.trim().startsWith("-"))
      .map((line) => line.trim().substring(1).trim());

    // Build scene part
    const scenePart: ScenePart = {
      content: storyContent.trim(),
      imageUrl: "",
      user: false,
      role: "assistant",
      choices: choiceLines.map((text) => {
        // Parse choice metadata from angle brackets: <use_skill: ...; use_item: ...; etc>
        const metaMatch = text.match(/<([^>]+)>/);
        const choiceText = text.replace(/\s*<[^>]*>\s*$/, "").trim();

        const choice: any = { text: choiceText };

        if (metaMatch) {
          const metadata = metaMatch[1];

          // Parse use_skill: name (DC number)
          const skillMatch = metadata.match(
            /use_skill:\s*([^(;]+?)(?:\s*\((?:DC\s*(\d+)|(?:needs?\s*)?(\d+)\s*succ(?:ess)?(?:es)?\s*(?:needed|required)?)\))?(?:;|$)/i
          );
          if (skillMatch) {
            const skillName = skillMatch[1].trim();
            if (skillName.toLowerCase() !== "none") {
              choice.skill_used = skillName;
              const dc = skillMatch[2] || skillMatch[3];
              if (dc) {
                choice.skill_dc = parseInt(dc, 10);
              }
            }
          }

          // Parse use_resource: name
          const resourceMatch = metadata.match(
            /use_resource:\s*([^;]+?)(?:;|$)/i
          );
          if (resourceMatch) {
            const resourceName = resourceMatch[1].trim();
            if (resourceName.toLowerCase() !== "none") {
              choice.resource_used = resourceName;
            }
          }

          // Parse use_item: name
          const itemMatch = metadata.match(/use_item:\s*([^;]+?)(?:;|$)/i);
          if (itemMatch) {
            const itemName = itemMatch[1].trim();
            if (itemName.toLowerCase() !== "none") {
              choice.item_used = itemName;
            }
          }
        }

        return choice;
      }),
      toolCalls,
      toolResponses,
    };

    // Calculate total usage
    const totalUsage = {
      prompt_tokens:
        storyUsage.prompt_tokens +
        toolUsage.prompt_tokens +
        choicesUsage.prompt_tokens,
      completion_tokens:
        storyUsage.completion_tokens +
        toolUsage.completion_tokens +
        choicesUsage.completion_tokens,
      total_tokens:
        storyUsage.total_tokens +
        toolUsage.total_tokens +
        choicesUsage.total_tokens,
    };

    // Calculate token cost (sum costs from all 3 stages)
    const storyInputCost = (storyUsage.prompt_tokens / 1_000_000) * storyModelConfig.inputPrice;
    const storyOutputCost = (storyUsage.completion_tokens / 1_000_000) * storyModelConfig.outputPrice;
    const toolsInputCost = (toolUsage.prompt_tokens / 1_000_000) * toolsModelConfig.inputPrice;
    const toolsOutputCost = (toolUsage.completion_tokens / 1_000_000) * toolsModelConfig.outputPrice;
    const choicesInputCost = (choicesUsage.prompt_tokens / 1_000_000) * choicesModelConfig.inputPrice;
    const choicesOutputCost = (choicesUsage.completion_tokens / 1_000_000) * choicesModelConfig.outputPrice;
    
    const totalCostUSD = storyInputCost + storyOutputCost + toolsInputCost + toolsOutputCost + choicesInputCost + choicesOutputCost;
    const tokenCost = Math.max(1, Math.ceil(totalCostUSD / 0.01));

    // Deduct tokens
    const deductResult = await deductTokens(userId, tokenCost, supabaseAdmin);

    if (!deductResult.success) {
      return NextResponse.json(
        {
          error: deductResult.error || "Failed to deduct tokens",
          code: "TOKEN_DEDUCTION_FAILED",
        },
        { status: 500 }
      );
    }

    // Get updated balance
    const remainingBalance = await getUserTokenBalance(userId, supabaseAdmin);

    // Return in same format as regular /next route
    return NextResponse.json({
      parts: [scenePart],
      meta: {
        model: defaultModelKey,
        modelName: `${storyModelConfig.name} / ${toolsModelConfig.name} / ${choicesModelConfig.name}`,
        provider: `staged (${storyModelConfig.provider}/${toolsModelConfig.provider}/${choicesModelConfig.provider})`,
        usage: totalUsage,
        tokensDeducted: tokenCost,
        tokenCost: totalCostUSD,
        remainingBalance,
        staged: true,
        stageBreakdown: {
          story: storyUsage,
          tools: toolUsage,
          choices: choicesUsage,
        },
        models: {
          story: storyModelConfig.name,
          tools: toolsModelConfig.name,
          choices: choicesModelConfig.name,
        },
      },
    });
  } catch (error: any) {
    console.error("[Staged] Error:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to generate staged story",
        code: "GENERATION_ERROR",
      },
      { status: 500 }
    );
  }
}
