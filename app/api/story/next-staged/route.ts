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
import { getUserSettings } from "@/app/misc/user_settings";

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
    messages: messages.map((m) => {
      const msg: any = {
        role: m.role,
        content: m.content,
      };
      if (m.tool_calls) {
        msg.tool_calls = m.tool_calls;
      }
      if (m.tool_call_id) {
        msg.tool_call_id = m.tool_call_id;
      }
      return msg;
    }),
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

  // Check user settings for BYOK
  const userSettings = await getUserSettings(userId, supabaseAdmin);
  const isSubscriber = userSettings?.is_subscriber || false;
  const byokEnabled = userSettings?.byok_enabled || false;

  // Only use BYOK if subscriber, BYOK is enabled in settings, and key is provided
  let shouldUseTokens = true;
  if (isSubscriber && byokEnabled && openRouterKey) {
    shouldUseTokens = false;
    console.log(`User ${userId} using BYOK for staged generation`);
  }

  // Get model configurations for each stage
  const defaultModelKey =
    modelKey || process.env.DEFAULT_AI_MODEL || "Deepseek Chat";

  const storyModelConfig = getModelConfig(modelStoryKey || defaultModelKey);
  const toolsModelConfig = getModelConfig(modelToolsKey || defaultModelKey);
  const choicesModelConfig = getModelConfig(modelChoicesKey || defaultModelKey);

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

  // Check token balance (staged mode costs vary based on model selection) IF not using BYOK
  if (shouldUseTokens) {
    const balance = await getUserTokenBalance(userId, supabaseAdmin);
    const estimatedCost =
      storyModelConfig.cost + toolsModelConfig.cost + choicesModelConfig.cost;

    const hasTokens = await hasEnoughTokens(
      userId,
      estimatedCost,
      supabaseAdmin
    );
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

    // STAGE 2: Generate tool calls and choices in parallel
    console.log(
      "[Staged] Stage 2: Generating tools and choices in parallel..."
    );

    const [stage2aResult, choicesResponse] = await Promise.all([
      // Stage 2a: Tool calls loop
      (async () => {
        let allToolCalls: any[] = [];
        let allToolResponses: CommandResponse[] = [];
        let toolLoopCount = 0;
        const maxToolLoops = 8;
        let totalToolUsage = {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        };

        while (toolLoopCount < maxToolLoops) {
          const toolPrompt = buildToolPrompt({
            storyData,
            storyContent,
            commandResponses,
            existingToolCalls:
              allToolCalls.length > 0 ? allToolCalls : undefined,
            existingToolResponses:
              allToolResponses.length > 0 ? allToolResponses : undefined,
          });

          const toolResponse = await callAI(
            toolPrompt.messages,
            toolsModelConfig.provider,
            toolsModelConfig.model,
            toolsApiKey,
            toolsModelConfig.maxOutputTokens,
            TOOL_SCHEMAS
          );

          const newToolCalls =
            toolResponse.choices[0]?.message?.tool_calls || [];
          const currentToolUsage = toolResponse.usage || {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
          };

          // Accumulate usage
          totalToolUsage.prompt_tokens += currentToolUsage.prompt_tokens;
          totalToolUsage.completion_tokens +=
            currentToolUsage.completion_tokens;
          totalToolUsage.total_tokens += currentToolUsage.total_tokens;

          toolLoopCount++;

          // If no new tool calls, we're done
          if (newToolCalls.length === 0) {
            console.log(
              `[Staged] Tool loop complete after ${toolLoopCount} iterations (no more tools needed)`
            );
            break;
          }

          console.log(
            `[Staged] Tool loop iteration ${toolLoopCount}: ${newToolCalls.length} tool calls`
          );

          // Execute new tools
          const newResponses = await executeTools(newToolCalls, storyData);

          allToolCalls = [...allToolCalls, ...newToolCalls];
          allToolResponses = [...allToolResponses, ...newResponses];
        }

        if (toolLoopCount >= maxToolLoops) {
          console.log(
            `[Staged] Tool loop reached maximum iterations (${maxToolLoops})`
          );
        }

        console.log(
          `[Staged] Stage 2a complete: ${allToolCalls.length} total tool calls, ${totalToolUsage.total_tokens} tokens`
        );

        return {
          toolCalls: allToolCalls,
          toolResponses: allToolResponses,
          usage: totalToolUsage,
        };
      })(),

      // Stage 2b: Choices generation (runs simultaneously)
      (async () => {
        const choicesPrompt = buildChoicesPrompt({
          storyData,
          storyContent,
        });

        const response = await callAI(
          choicesPrompt.messages,
          choicesModelConfig.provider,
          choicesModelConfig.model,
          choicesApiKey,
          choicesModelConfig.maxOutputTokens
          // No tools for Stage 2b
        );

        console.log(
          `[Staged] Stage 2b complete: ${
            response.usage?.total_tokens || 0
          } tokens`
        );

        return response;
      })(),
    ]);

    // Extract results from parallel execution
    const allToolCalls = stage2aResult.toolCalls;
    const allToolResponses = stage2aResult.toolResponses;
    const totalToolUsage = stage2aResult.usage;

    const choicesContent = choicesResponse.choices[0]?.message?.content || "";
    const choicesUsage = choicesResponse.usage || {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };

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
            // Strip DC notation like "(DC 6)" and clean up the name
            let resourceName = resourceMatch[1].trim()
              .replace(/\s*\(DC\s*\d+\)/gi, '')
              .replace(/\s*\(\d+\s*succ(?:ess)?(?:es)?\s*(?:needed|required)?\)/gi, '')
              .trim();
            if (resourceName.toLowerCase() !== "none" && resourceName.length > 0) {
              choice.resource_used = resourceName;
            }
          }

          // Parse use_item: name
          const itemMatch = metadata.match(/use_item:\s*([^;]+?)(?:;|$)/i);
          if (itemMatch) {
            // Strip DC notation like "(DC 6)" and clean up the name
            let itemName = itemMatch[1].trim()
              .replace(/\s*\(DC\s*\d+\)/gi, '')
              .replace(/\s*\(\d+\s*succ(?:ess)?(?:es)?\s*(?:needed|required)?\)/gi, '')
              .trim();
            if (itemName.toLowerCase() !== "none" && itemName.length > 0) {
              choice.item_used = itemName;
            }
          }

          // Parse mythic_check: question (likelihood)
          const mythicCheckMatch = metadata.match(
            /mythic_check:\s*([^;]+?)(?:;|$)/i
          );
          if (mythicCheckMatch) {
            const mythicCheck = mythicCheckMatch[1].trim();
            if (mythicCheck.toLowerCase() !== "none") {
              choice.mythic_check = mythicCheck;
            }
          }

          // Parse mythic_table: category
          const mythicTableMatch = metadata.match(
            /mythic_table:\s*([^;]+?)(?:;|$)/i
          );
          if (mythicTableMatch) {
            const mythicTable = mythicTableMatch[1].trim();
            if (mythicTable.toLowerCase() !== "none") {
              choice.mythic_table = mythicTable;
            }
          }

          // Parse custom_table: table name
          const customTableMatch = metadata.match(
            /custom_table:\s*([^;]+?)(?:;|$)/i
          );
          if (customTableMatch) {
            const customTable = customTableMatch[1].trim();
            if (customTable.toLowerCase() !== "none") {
              choice.custom_table = customTable;
            }
          }
        }

        return choice;
      }),
      toolCalls: allToolCalls,
      toolResponses: allToolResponses,
    };

    // Calculate total usage
    const totalUsage = {
      prompt_tokens:
        storyUsage.prompt_tokens +
        totalToolUsage.prompt_tokens +
        choicesUsage.prompt_tokens,
      completion_tokens:
        storyUsage.completion_tokens +
        totalToolUsage.completion_tokens +
        choicesUsage.completion_tokens,
      total_tokens:
        storyUsage.total_tokens +
        totalToolUsage.total_tokens +
        choicesUsage.total_tokens,
    };

    // Calculate token cost (sum costs from all 3 stages)
    const storyInputCost =
      (storyUsage.prompt_tokens / 1_000_000) * storyModelConfig.inputPrice;
    const storyOutputCost =
      (storyUsage.completion_tokens / 1_000_000) * storyModelConfig.outputPrice;
    const toolsInputCost =
      (totalToolUsage.prompt_tokens / 1_000_000) * toolsModelConfig.inputPrice;
    const toolsOutputCost =
      (totalToolUsage.completion_tokens / 1_000_000) *
      toolsModelConfig.outputPrice;
    const choicesInputCost =
      (choicesUsage.prompt_tokens / 1_000_000) * choicesModelConfig.inputPrice;
    const choicesOutputCost =
      (choicesUsage.completion_tokens / 1_000_000) *
      choicesModelConfig.outputPrice;

    const totalCostUSD =
      storyInputCost +
      storyOutputCost +
      toolsInputCost +
      toolsOutputCost +
      choicesInputCost +
      choicesOutputCost;

    // Add additional cost based on tool call count: 1 coin per 2 tool calls
    const toolCallBonus = Math.floor(allToolCalls.length / 2);
    const tokenCost = Math.max(
      1,
      Math.ceil(totalCostUSD / 0.01) + toolCallBonus
    );

    // Deduct tokens only if not using BYOK
    let remainingBalance;
    if (shouldUseTokens) {
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
      remainingBalance = await getUserTokenBalance(userId, supabaseAdmin);
    } else {
      // BYOK: no token deduction, return null balance
      remainingBalance = null;
    }

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
          tools: totalToolUsage,
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
