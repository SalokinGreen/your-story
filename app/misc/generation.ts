/**
 * Frontend Generation Module
 *
 * Orchestrates AI generation flow entirely on the frontend.
 * - Builds prompts/context using ai_staged.ts
 * - Calls simplified /api/generate-stream endpoint
 * - Executes tools locally on storyData
 * - Parses choices from AI response
 *
 * The backend is now just a thin AI proxy.
 */

import {
  StoryData,
  CommandResponse,
  Choice,
  ScenePart,
} from "@/app/misc/structs";
import {
  buildStoryPrompt,
  buildToolPrompt,
  buildChoicesPrompt,
  ChatMessage,
} from "@/app/misc/ai_staged";
import { executeTools, ToolCall } from "@/app/misc/toolExecutor";
import { TOOL_SCHEMAS } from "@/app/misc/toolSchemas";
import { getAuthToken } from "@/app/misc/getAuthToken";
import { logger } from "@/app/misc/logger";

// ============================================================
// TYPES
// ============================================================

export interface GenerationOptions {
  storyModel: string;
  toolsModel: string;
  choicesModel: string;
  enableTools: boolean;
  maxToolLoops?: number;
}

export interface GenerationCallbacks {
  onStoryStart?: () => void;
  onStoryContent?: (content: string, fullContent: string) => void;
  onStoryComplete?: (content: string, usage: TokenUsage) => void;
  onToolsStart?: () => void;
  onToolsComplete?: (
    toolCalls: ToolCall[],
    responses: CommandResponse[],
    usage: TokenUsage
  ) => void;
  onChoicesStart?: () => void;
  onChoicesComplete?: (choices: Choice[], usage: TokenUsage) => void;
  onComplete?: (result: GenerationResult) => void;
  onError?: (error: Error) => void;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface GenerationMeta {
  model: string;
  modelName: string;
  provider: string;
  usage: TokenUsage;
  tokenCost: number;
  balance: number;
}

export interface GenerationResult {
  success: boolean;
  content: string;
  toolCalls: ToolCall[];
  toolResponses: CommandResponse[];
  choices: Choice[];
  scenePart: ScenePart;
  meta: {
    storyMeta?: GenerationMeta;
    toolsMeta?: GenerationMeta;
    choicesMeta?: GenerationMeta;
    totalTokenCost: number;
    balance: number;
  };
}

// ============================================================
// STREAM PARSER
// ============================================================

interface StreamEvent {
  type: "content" | "tool_calls" | "done" | "error";
  content?: string;
  toolCalls?: ToolCall[];
  meta?: GenerationMeta;
  error?: string;
}

async function* parseSSEStream(
  response: Response
): AsyncGenerator<StreamEvent> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

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
        const parsed: StreamEvent = JSON.parse(data);
        yield parsed;
      } catch {
        // Skip malformed JSON
      }
    }
  }
}

// ============================================================
// CHOICE PARSER
// ============================================================

function parseChoices(content: string, storyData: StoryData): Choice[] {
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    // strip common bullet prefixes: -, *, •
    .map((l) => l.replace(/^[\-\*\u2022]\s+/, ""))
    .filter((l) => l.length > 0);

  return lines.map((line) => {
    // Extract metadata from angle brackets: <use_skill: ...; use_item: ...; etc>
    const metaMatch = line.match(/<([^>]+)>/);
    // Remove angle brackets from the END of the line for clean display text
    const text = line.replace(/\s*<[^>]*>\s*$/, "").trim();

    const choice: Choice = { text };

    if (metaMatch) {
      const metadata = metaMatch[1];

      // Parse use_skill: name (DC number) or (X success(es) needed/required)
      const skillMatch = metadata.match(
        /use_skill:\s*([^(;]+?)(?:\s*\((?:DC\s*(\d+)|(?:needs?\s*)?(\d+)\s*succ(?:ess)?(?:es)?\s*(?:needed|required)?)\))?(?:;|$)/i
      );
      if (skillMatch) {
        const skillName = skillMatch[1].trim();
        if (skillName.toLowerCase() !== "none") {
          choice.skill_used = skillName;
          // Try DC format first (group 2), then success count format (group 3)
          const dc = skillMatch[2] || skillMatch[3];
          if (dc) {
            choice.skill_dc = parseInt(dc, 10);
          }
        }
      }

      // Parse use_resource: name (automatically at risk on failure)
      const resourceMatch = metadata.match(/use_resource:\s*([^;]+?)(?:;|$)/i);
      if (resourceMatch) {
        // Strip DC notation like "(DC 6)" and clean up the name
        let resourceName = resourceMatch[1]
          .trim()
          .replace(/\s*\(DC\s*\d+\)/gi, "")
          .replace(
            /\s*\(\d+\s*succ(?:ess)?(?:es)?\s*(?:needed|required)?\)/gi,
            ""
          )
          .trim();
        if (resourceName.toLowerCase() !== "none" && resourceName.length > 0) {
          choice.resource_used = resourceName;
        }
      }

      // Parse use_item: name
      const itemMatch = metadata.match(/use_item:\s*([^;]+?)(?:;|$)/i);
      if (itemMatch) {
        // Strip DC notation like "(DC 6)" and clean up the name
        let itemName = itemMatch[1]
          .trim()
          .replace(/\s*\(DC\s*\d+\)/gi, "")
          .replace(
            /\s*\(\d+\s*succ(?:ess)?(?:es)?\s*(?:needed|required)?\)/gi,
            ""
          )
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
  });
}

// ============================================================
// MAIN GENERATION FUNCTION
// ============================================================

export async function generateStoryTurn(
  storyData: StoryData,
  userChoice: string,
  options: GenerationOptions,
  callbacks: GenerationCallbacks,
  commandResponses?: CommandResponse[]
): Promise<GenerationResult> {
  const token = await getAuthToken();
  if (!token) {
    const error = new Error("Not authenticated");
    callbacks.onError?.(error);
    throw error;
  }

  let totalTokenCost = 0;
  let finalBalance = 0;
  let storyContent = "";
  let allToolCalls: ToolCall[] = [];
  let allToolResponses: CommandResponse[] = [];
  let choices: Choice[] = [];
  let storyMeta: GenerationMeta | undefined;
  let toolsMeta: GenerationMeta | undefined;
  let choicesMeta: GenerationMeta | undefined;

  try {
    // ========================================
    // STAGE 1: Story Generation
    // ========================================
    callbacks.onStoryStart?.();
    logger.action("Stage 1: Building story prompt");

    const storyPrompt = buildStoryPrompt({
      storyData,
      userChoice,
      commandResponses,
    });

    const storyResponse = await fetch("/api/generate-stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages: storyPrompt.messages,
        model: options.storyModel,
        maxTokens: 4000,
        temperature: 0.7,
      }),
    });

    if (!storyResponse.ok) {
      const errorText = await storyResponse.text().catch(() => "");
      throw new Error(
        `Story generation failed: ${storyResponse.status} - ${errorText}`
      );
    }

    // Process story stream
    for await (const event of parseSSEStream(storyResponse)) {
      if (event.type === "error") {
        throw new Error(event.error || "Story generation failed");
      }
      if (event.type === "content" && event.content) {
        storyContent += event.content;
        callbacks.onStoryContent?.(event.content, storyContent);
      }
      if (event.type === "done" && event.meta) {
        storyMeta = event.meta;
        totalTokenCost += event.meta.tokenCost;
        finalBalance = event.meta.balance;
      }
    }

    callbacks.onStoryComplete?.(
      storyContent,
      storyMeta?.usage || {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      }
    );
    logger.action("Stage 1 complete", { contentLength: storyContent.length });

    // ========================================
    // STAGE 2: Tool Execution (if enabled)
    // ========================================
    if (options.enableTools) {
      callbacks.onToolsStart?.();
      logger.action("Stage 2: Building tool prompt");

      const maxToolLoops = options.maxToolLoops || 3;
      let toolLoopCount = 0;

      while (toolLoopCount < maxToolLoops) {
        toolLoopCount++;

        const toolPrompt = buildToolPrompt({
          storyData,
          storyContent,
          existingToolCalls: allToolCalls,
          existingToolResponses: allToolResponses,
        });

        const toolResponse = await fetch("/api/generate-stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            messages: toolPrompt.messages,
            tools: TOOL_SCHEMAS,
            model: options.toolsModel,
            maxTokens: 2000,
            temperature: 0.3,
          }),
        });

        if (!toolResponse.ok) {
          const errorText = await toolResponse.text().catch(() => "");
          throw new Error(
            `Tool generation failed: ${toolResponse.status} - ${errorText}`
          );
        }

        let newToolCalls: ToolCall[] = [];

        for await (const event of parseSSEStream(toolResponse)) {
          if (event.type === "error") {
            throw new Error(event.error || "Tool generation failed");
          }
          if (event.type === "tool_calls" && event.toolCalls) {
            newToolCalls = event.toolCalls;
          }
          if (event.type === "done" && event.meta) {
            toolsMeta = event.meta;
            totalTokenCost += event.meta.tokenCost;
            finalBalance = event.meta.balance;
          }
        }

        // No more tool calls needed
        if (newToolCalls.length === 0) {
          logger.action("Tool loop complete - no more tools", {
            iterations: toolLoopCount,
          });
          break;
        }

        // Execute tools LOCALLY on storyData
        logger.action("Executing tools locally", {
          count: newToolCalls.length,
        });
        const newResponses = executeTools(newToolCalls, storyData);

        allToolCalls = [...allToolCalls, ...newToolCalls];
        allToolResponses = [...allToolResponses, ...newResponses];
      }

      callbacks.onToolsComplete?.(
        allToolCalls,
        allToolResponses,
        toolsMeta?.usage || {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        }
      );
      logger.action("Stage 2 complete", {
        toolCalls: allToolCalls.length,
        responses: allToolResponses.length,
      });
    }

    // ========================================
    // STAGE 3: Choices Generation
    // ========================================
    callbacks.onChoicesStart?.();
    logger.action("Stage 3: Building choices prompt");

    const choicesPrompt = buildChoicesPrompt({
      storyData,
      storyContent,
    });

    const choicesResponse = await fetch("/api/generate-stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages: choicesPrompt.messages,
        model: options.choicesModel,
        maxTokens: 1500,
        temperature: 0.7,
      }),
    });

    if (!choicesResponse.ok) {
      const errorText = await choicesResponse.text().catch(() => "");
      throw new Error(
        `Choices generation failed: ${choicesResponse.status} - ${errorText}`
      );
    }

    let choicesContent = "";

    for await (const event of parseSSEStream(choicesResponse)) {
      if (event.type === "error") {
        throw new Error(event.error || "Choices generation failed");
      }
      if (event.type === "content" && event.content) {
        choicesContent += event.content;
      }
      if (event.type === "done" && event.meta) {
        choicesMeta = event.meta;
        totalTokenCost += event.meta.tokenCost;
        finalBalance = event.meta.balance;
      }
    }

    // Parse choices
    choices = parseChoices(choicesContent, storyData);

    callbacks.onChoicesComplete?.(
      choices,
      choicesMeta?.usage || {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      }
    );
    logger.action("Stage 3 complete", { choicesCount: choices.length });

    // ========================================
    // BUILD SCENE PART
    // ========================================
    const scenePart: ScenePart = {
      content: storyContent,
      imageUrl: "",
      user: false,
      role: "assistant",
      choices,
      toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
      toolResponses: allToolResponses.length > 0 ? allToolResponses : undefined,
    };

    const result: GenerationResult = {
      success: true,
      content: storyContent,
      toolCalls: allToolCalls,
      toolResponses: allToolResponses,
      choices,
      scenePart,
      meta: {
        storyMeta,
        toolsMeta,
        choicesMeta,
        totalTokenCost,
        balance: finalBalance,
      },
    };

    callbacks.onComplete?.(result);
    return result;
  } catch (error: any) {
    logger.error("Generation failed", { error: error.message });
    callbacks.onError?.(error);
    throw error;
  }
}

// ============================================================
// SIMPLE GENERATION (Single call, no stages)
// ============================================================

export async function generateSimple(
  messages: ChatMessage[],
  options: {
    model: string;
    maxTokens?: number;
    temperature?: number;
    tools?: any[];
  }
): Promise<{
  content: string;
  toolCalls: ToolCall[];
  meta: GenerationMeta;
}> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error("Not authenticated");
  }

  const response = await fetch("/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages,
      tools: options.tools,
      model: options.model,
      maxTokens: options.maxTokens || 4000,
      temperature: options.temperature || 0.7,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Generation failed: ${response.status}`);
  }

  const data = await response.json();
  return {
    content: data.content,
    toolCalls: data.toolCalls || [],
    meta: data.meta,
  };
}

// ============================================================
// STREAMING SIMPLE GENERATION
// ============================================================

export async function* generateSimpleStream(
  messages: ChatMessage[],
  options: {
    model: string;
    maxTokens?: number;
    temperature?: number;
    tools?: any[];
  }
): AsyncGenerator<StreamEvent> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error("Not authenticated");
  }

  const response = await fetch("/api/generate-stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages,
      tools: options.tools,
      model: options.model,
      maxTokens: options.maxTokens || 4000,
      temperature: options.temperature || 0.7,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Generation failed: ${response.status}`);
  }

  yield* parseSSEStream(response);
}
