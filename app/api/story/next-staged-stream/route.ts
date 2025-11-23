import { NextRequest } from "next/server";
import { StoryData, CommandResponse, Choice } from "@/app/misc/structs";
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
import { logger } from "@/app/misc/logger";

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
  toolCallingEnabled?: boolean;
  useRawContext?: boolean;
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
  userProvidedKey?: string
): string {
  if (provider === "deepseek") {
    return process.env.DEEPSEEK_API_KEY || "";
  } else {
    return userProvidedKey || process.env.OPENROUTER_API_KEY || "";
  }
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Parse request body
        const body: RequestBody = await req.json();
        const {
          storyData,
          userChoice,
          model,
          modelStory,
          modelTools,
          modelChoices,
          openRouterKey,
          commandResponses = [],
          toolCallingEnabled = true,
        } = body;

        logger.info("[Stream] Starting staged generation stream", {
          modelStory,
          modelTools,
          modelChoices,
        });

        // Validate authentication
        const authHeader = req.headers.get("authorization");
        if (!authHeader) {
          throw new Error("Unauthorized: No authorization header");
        }

        const token = authHeader.replace("Bearer ", "");
        const supabaseUrl = process.env.SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser(token);

        if (authError || !user) {
          throw new Error("Unauthorized: Invalid token");
        }

        const userId = user.id;

        // Get model configurations
        const defaultModelKey = model || "Deepseek Chat";
        const storyModelConfig = getModelConfig(modelStory || defaultModelKey);
        const toolsModelConfig = getModelConfig(modelTools || defaultModelKey);
        const choicesModelConfig = getModelConfig(
          modelChoices || defaultModelKey
        );

        logger.info("[Stream] Model configs loaded", {
          story: storyModelConfig.name,
          tools: toolsModelConfig.name,
          choices: choicesModelConfig.name,
        });

        // Check if user should use tokens (not BYOK)
        const userSettings = await getUserSettings(userId, supabase);
        const byokEnabled = userSettings?.byok_enabled || false;
        const isSubscriber = userSettings?.is_subscriber || false;
        const shouldUseTokens = !(isSubscriber && byokEnabled && openRouterKey);

        logger.info("[Stream] Token check", {
          shouldUseTokens,
          byokEnabled,
          isSubscriber,
        });

        // Check token balance (only if not using BYOK)
        if (shouldUseTokens) {
          const supabaseAdmin = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
          );

          const hasTokens = await hasEnoughTokens(userId, 1, supabaseAdmin);
          if (!hasTokens) {
            const balance = await getUserTokenBalance(userId, supabaseAdmin);
            throw new Error(
              `Insufficient tokens. You have ${balance?.total || 0} tokens (${
                balance?.tradable || 0
              } tradable, ${balance?.locked || 0} locked).`
            );
          }
        }

        // ============================================================
        // STAGE 1: Story Generation
        // ============================================================
        console.log("[Stream] Stage 1: Generating story...");
        const stage1Start = Date.now();

        const storyPrompt = buildStoryPrompt({
          storyData,
          userChoice,
          commandResponses,
        });

        const storyApiKey = getApiKey(
          storyModelConfig.provider as "deepseek" | "openrouter",
          openRouterKey
        );

        const storyResponse = await callAI(
          storyPrompt.messages,
          storyModelConfig.provider as "deepseek" | "openrouter",
          storyModelConfig.model,
          storyApiKey,
          storyModelConfig.maxOutputTokens,
          undefined // No tools for story generation
        );

        const storyContent = storyResponse.choices[0]?.message?.content || "";
        const storyUsage = storyResponse.usage || {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        };

        const stage1Duration = Date.now() - stage1Start;
        logger.action("[Stream] Stage 1 complete", {
          duration: stage1Duration,
          contentLength: storyContent.length,
          usage: storyUsage,
        });

        // SEND STORY EVENT IMMEDIATELY
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "story",
              content: storyContent,
              usage: storyUsage,
            })}\n\n`
          )
        );

        // ============================================================
        // STAGE 2: Tools + Choices in Parallel
        // ============================================================
        console.log(
          "[Stream] Stage 2: Generating tools and choices in parallel..."
        );
        const stage2Start = Date.now();

        const [toolsResult, choicesResponse] = await Promise.all([
          // Stage 2a: Tool loop
          (async () => {
            if (!toolCallingEnabled) {
              logger.info("[Stream] Tool calling disabled, skipping");
              return {
                toolCalls: [] as ToolCall[],
                toolResponses: [] as CommandResponse[],
                usage: {
                  prompt_tokens: 0,
                  completion_tokens: 0,
                  total_tokens: 0,
                },
              };
            }

            let allToolCalls: ToolCall[] = [];
            let allToolResponses: CommandResponse[] = [];
            let totalToolUsage = {
              prompt_tokens: 0,
              completion_tokens: 0,
              total_tokens: 0,
            };

            const maxToolLoops = 8;
            let toolLoopCount = 0;

            while (toolLoopCount < maxToolLoops) {
              toolLoopCount++;

              const toolPrompt = buildToolPrompt({
                storyData,
                storyContent,
                commandResponses,
                existingToolCalls: allToolCalls,
                existingToolResponses: allToolResponses,
              });

              const toolsApiKey = getApiKey(
                toolsModelConfig.provider as "deepseek" | "openrouter",
                openRouterKey
              );

              const toolResponse = await callAI(
                toolPrompt.messages,
                toolsModelConfig.provider as "deepseek" | "openrouter",
                toolsModelConfig.model,
                toolsApiKey,
                toolsModelConfig.maxOutputTokens,
                TOOL_SCHEMAS
              );

              if (toolResponse.usage) {
                totalToolUsage.prompt_tokens +=
                  toolResponse.usage.prompt_tokens;
                totalToolUsage.completion_tokens +=
                  toolResponse.usage.completion_tokens;
                totalToolUsage.total_tokens += toolResponse.usage.total_tokens;
              }

              const newToolCalls =
                toolResponse.choices[0]?.message?.tool_calls || [];

              if (newToolCalls.length === 0) {
                console.log(
                  `[Stream] Tool loop complete after ${toolLoopCount} iterations (no more tools needed)`
                );
                break;
              }

              console.log(
                `[Stream] Tool loop iteration ${toolLoopCount}: ${newToolCalls.length} tool calls`
              );

              const newResponses = await executeTools(newToolCalls, storyData);

              allToolCalls = [...allToolCalls, ...newToolCalls];
              allToolResponses = [...allToolResponses, ...newResponses];
            }

            if (toolLoopCount >= maxToolLoops) {
              console.log(
                `[Stream] Tool loop reached maximum iterations (${maxToolLoops})`
              );
            }

            console.log(
              `[Stream] Stage 2a complete: ${allToolCalls.length} total tool calls, ${totalToolUsage.total_tokens} tokens`
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
            console.log(choicesPrompt);

            const choicesApiKey = getApiKey(
              choicesModelConfig.provider as "deepseek" | "openrouter",
              openRouterKey
            );

            return await callAI(
              choicesPrompt.messages,
              choicesModelConfig.provider as "deepseek" | "openrouter",
              choicesModelConfig.model,
              choicesApiKey,
              choicesModelConfig.maxOutputTokens,
              undefined
            );
          })(),
        ]);

        const stage2Duration = Date.now() - stage2Start;
        logger.action("[Stream] Stage 2 complete (parallel)", {
          duration: stage2Duration,
          toolCallCount: toolsResult.toolCalls.length,
          toolUsage: toolsResult.usage,
          choicesUsage: choicesResponse.usage,
        });

        // SEND TOOLS EVENT
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "tools",
              toolCalls: toolsResult.toolCalls,
              toolResponses: toolsResult.toolResponses,
              usage: toolsResult.usage,
            })}\n\n`
          )
        );

        // Parse choices from response
        const choicesContent =
          choicesResponse.choices[0]?.message?.content || "";
        const choicesUsage = choicesResponse.usage || {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        };

        // Parse choices (extract from plain text list)
        const lines = choicesContent
          .split("\n")
          .filter((l) => l.trim().startsWith("-"));
        const parsedChoices: Choice[] = lines.map((line) => {
          const text = line.replace(/^-\s*/, "").trim();

          // Parse metadata from angle brackets (use_skill:, use_resource:, use_item:)
          let skillUsed: string | undefined;
          let skillDC: number | undefined;
          let itemUsed: string | undefined;
          let resourceUsed: string | undefined;
          let cleanText = text;

          // Match the format: <use_skill: Skill (DC #); use_resource: Resource; use_item: Item>
          const metadataMatch = text.match(/<([^>]+)>/);
          if (metadataMatch) {
            const metadata = metadataMatch[1];
            cleanText = text.replace(metadataMatch[0], "").trim();

            // Parse use_skill: Skill (DC #) or use_skill: Skill or use_skill: none
            const skillMatch = metadata.match(/use_skill:\s*([^;]+?)(?:;|$)/i);
            if (
              skillMatch &&
              !skillMatch[1].trim().toLowerCase().includes("none")
            ) {
              const skillPart = skillMatch[1].trim();
              const dcMatch = skillPart.match(/\(DC\s*(\d+)\)/i);
              if (dcMatch) {
                skillDC = parseInt(dcMatch[1], 10);
                skillUsed = skillPart.replace(/\(DC\s*\d+\)/i, "").trim();
              } else {
                skillUsed = skillPart;
              }
            }

            // Parse use_resource: Resource or use_resource: none
            const resourceMatch = metadata.match(
              /use_resource:\s*([^;]+?)(?:;|$)/i
            );
            if (
              resourceMatch &&
              !resourceMatch[1].trim().toLowerCase().includes("none")
            ) {
              resourceUsed = resourceMatch[1].trim();
            }

            // Parse use_item: Item or use_item: none
            const itemMatch = metadata.match(/use_item:\s*(.+?)(?:;|$)/i);
            if (
              itemMatch &&
              !itemMatch[1].trim().toLowerCase().includes("none")
            ) {
              itemUsed = itemMatch[1].trim();
            }
          }

          return {
            text: cleanText,
            skill_used: skillUsed,
            skill_dc: skillDC,
            item_used: itemUsed,
            resource_used: resourceUsed,
          };
        });

        // SEND CHOICES EVENT
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "choices",
              choices: { choices: parsedChoices },
              usage: choicesUsage,
            })}\n\n`
          )
        );

        // ============================================================
        // Calculate costs and deduct tokens
        // ============================================================
        const totalUsage = {
          prompt_tokens:
            storyUsage.prompt_tokens +
            toolsResult.usage.prompt_tokens +
            choicesUsage.prompt_tokens,
          completion_tokens:
            storyUsage.completion_tokens +
            toolsResult.usage.completion_tokens +
            choicesUsage.completion_tokens,
          total_tokens:
            storyUsage.total_tokens +
            toolsResult.usage.total_tokens +
            choicesUsage.total_tokens,
        };

        const storyInputCost =
          (storyUsage.prompt_tokens / 1_000_000) * storyModelConfig.inputPrice;
        const storyOutputCost =
          (storyUsage.completion_tokens / 1_000_000) *
          storyModelConfig.outputPrice;
        const toolsInputCost =
          (toolsResult.usage.prompt_tokens / 1_000_000) *
          toolsModelConfig.inputPrice;
        const toolsOutputCost =
          (toolsResult.usage.completion_tokens / 1_000_000) *
          toolsModelConfig.outputPrice;
        const choicesInputCost =
          (choicesUsage.prompt_tokens / 1_000_000) *
          choicesModelConfig.inputPrice;
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

        const toolCallBonus = Math.floor(toolsResult.toolCalls.length / 2);
        const tokenCost = Math.max(
          1,
          Math.ceil(totalCostUSD / 0.01) + toolCallBonus
        );

        let remainingBalance = null;

        if (shouldUseTokens) {
          const supabaseAdmin = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
          );

          const deductResult = await deductTokens(
            userId,
            tokenCost,
            supabaseAdmin
          );

          if (!deductResult.success) {
            throw new Error(deductResult.error || "Failed to deduct tokens");
          }

          const balance = await getUserTokenBalance(userId, supabaseAdmin);
          remainingBalance = balance?.total || null;
        }

        logger.action("[Stream] Generation complete", {
          totalUsage,
          tokenCost,
          remainingBalance,
        });

        // SEND COMPLETE EVENT
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "complete",
              meta: {
                staged: true,
                models: {
                  story: storyModelConfig.name,
                  tools: toolsModelConfig.name,
                  choices: choicesModelConfig.name,
                },
                stageBreakdown: {
                  story: storyUsage,
                  tools: toolsResult.usage,
                  choices: choicesUsage,
                },
                usage: totalUsage,
                tokensDeducted: tokenCost,
                tokenCost: totalCostUSD,
                remainingBalance,
              },
            })}\n\n`
          )
        );

        controller.close();
      } catch (error: any) {
        logger.error("[Stream] Generation error", {
          error: error.message,
          stack: error.stack,
        });

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "error",
              message: error.message || "Generation failed",
            })}\n\n`
          )
        );

        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
