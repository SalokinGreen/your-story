/**
 * Sub-Agent Delegation - executes `delegate_task` calls
 *
 * The GM tool-stage can hand off a self-contained job (flesh out an NPC,
 * write up a location, chase down scattered lore, look something up on the
 * internet) to a separate, narrowly-scoped LLM call instead of doing it
 * inline. This file builds that call's prompt, fires it at `/api/generate`,
 * and parses the structured result back out - it never touches StoryData
 * directly, matching the rest of the tool-execution layer's rule that only
 * the GM tool executors (gmExecutor.ts) mutate state.
 */

import { StoryData, StoryLore } from "./structs";
import { DelegateTaskParams } from "./gmTools";
import { AnyModelKey, ReasoningEffort, resolveTier, fallbackTier } from "./reasoningTiers";
import { logger } from "./logger";
import { webSearchFetch } from "./webSearchFetch";
import { recordSideCall } from "./turnCost";

export interface SubagentApiKeys {
  openRouterKey?: string;
  deepseekKey?: string;
  googleKey?: string;
  mistralKey?: string;
  deepinfraKey?: string;
}

export interface SubagentContext {
  apiKeys?: SubagentApiKeys;
  token?: string | null;
  webResearchEnabled?: boolean;
  braveSearchKey?: string;
}

export type DelegateTaskOutcome =
  | {
      kind: "npc";
      name: string;
      description: string;
      role: string;
      attitude?: string;
      relationship?: string;
      faction?: string;
    }
  | { kind: "note"; title: string; content: string; noteType: string }
  | { kind: "summary"; text: string };

export interface DelegateTaskExecutionResult {
  success: boolean;
  outcome?: DelegateTaskOutcome;
  error?: string;
}

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

/**
 * Extract a JSON object from a model response that may be wrapped in
 * markdown code fences or have stray prose around it.
 */
function extractJSONFromContent(content: string): unknown {
  let jsonStr = content;
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    jsonStr = fenced[1];
  }
  const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    jsonStr = objectMatch[0];
  }
  return JSON.parse(jsonStr);
}

/** Notes relevant to a delegated sub-call - either the requested scope, or everything if unscoped. */
function selectContextNotes(
  storyData: StoryData,
  scope?: string[],
): StoryLore[] {
  const lore = storyData.lore || [];
  if (!scope || scope.length === 0) return lore;
  const wanted = new Set(scope.map((t) => t.toLowerCase()));
  return lore.filter((note) => wanted.has(note.title.toLowerCase()));
}

function formatNotesForPrompt(notes: StoryLore[]): string {
  if (notes.length === 0) return "(no notes available)";
  return notes
    .map((n) => `### ${n.title} (${n.type || "lore"})\n${n.content}`)
    .join("\n\n");
}

function buildSubagentMessages(
  params: DelegateTaskParams,
  storyData: StoryData,
): ChatMessage[] {
  const contextNotes = formatNotesForPrompt(
    selectContextNotes(storyData, params.scope),
  );

  const common = `You are a focused writing sub-agent helping a tabletop-RPG Game Master. You are given ONE self-contained job and the adventure's existing notes for context. Respond with ONLY a single JSON object - no prose, no markdown fences, matching exactly the shape requested. Stay consistent with the existing notes (names, tone, established facts).`;

  switch (params.task_type) {
    case "generate_npc":
      return [
        {
          role: "system",
          content: `${common}\n\nOutput shape:\n{"name": string, "description": string (2-4 sentences: appearance, personality, background), "role": string (their narrative role), "attitude": "hostile"|"unfriendly"|"neutral"|"friendly"|"allied", "relationship": string (relationship with the player), "faction": string (optional, omit if none)}`,
        },
        {
          role: "user",
          content: `Existing notes:\n${contextNotes}\n\nJob: ${params.brief}`,
        },
      ];
    case "generate_location":
      return [
        {
          role: "system",
          content: `${common}\n\nOutput shape:\n{"title": string (short place name), "content": string (2-4 paragraphs: layout, atmosphere, notable features and dangers)}`,
        },
        {
          role: "user",
          content: `Existing notes:\n${contextNotes}\n\nJob: ${params.brief}`,
        },
      ];
    case "research":
      return [
        {
          role: "system",
          content: `${common}\n\nOutput shape:\n{"summary": string (a focused answer synthesized from the notes below - say plainly if the notes don't cover it)}`,
        },
        {
          role: "user",
          content: `Existing notes:\n${contextNotes}\n\nQuestion: ${params.brief}`,
        },
      ];
    case "web_research":
      // web_research's synthesis prompt is built separately once search
      // results are in hand - see runWebResearch().
      throw new Error("web_research does not use buildSubagentMessages directly");
  }
}

async function callGenerate(
  messages: ChatMessage[],
  model: AnyModelKey,
  reasoningEffort: ReasoningEffort,
  apiKeys: SubagentApiKeys | undefined,
  token: string | null | undefined,
): Promise<string> {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      messages,
      model,
      maxTokens: 800,
      temperature: 0.7,
      reasoningEffort,
      openRouterKey: apiKeys?.openRouterKey,
      deepseekKey: apiKeys?.deepseekKey,
      googleKey: apiKeys?.googleKey,
      mistralKey: apiKeys?.mistralKey,
      deepinfraKey: apiKeys?.deepinfraKey,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error || `Sub-agent call failed: ${response.status}`,
    );
  }

  const data = await response.json();
  recordSideCall("subagent", "Delegated sub-agent task", String(model), data);
  return data.content || "";
}

/**
 * Call the model at a given tier, stepping down to lower tiers if the
 * chosen one's provider has no key configured or the call otherwise fails
 * outright - mirrors the fallback policy generation.ts uses for the main
 * GM call, so a sub-call doesn't just crash when the top tier is
 * unavailable.
 */
async function callGenerateWithFallback(
  messages: ChatMessage[],
  startTier: number,
  apiKeys: SubagentApiKeys | undefined,
  token: string | null | undefined,
): Promise<string> {
  let tier: number | null = startTier;
  let lastError: unknown;
  while (tier !== null) {
    const resolved = resolveTier(tier);
    try {
      return await callGenerate(
        messages,
        resolved.modelKey,
        resolved.reasoningEffort,
        apiKeys,
        token,
      );
    } catch (error) {
      lastError = error;
      logger.action("delegate_task sub-call failed, trying lower tier", {
        tier,
        error: error instanceof Error ? error.message : String(error),
      });
      tier = fallbackTier(tier);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Sub-agent call failed at every tier");
}

interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
}

async function runWebSearch(
  query: string,
  braveSearchKey: string,
): Promise<BraveSearchResult[]> {
  const response = await webSearchFetch({ query, searchApiKey: braveSearchKey });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error || `Web search failed: ${response.status}`,
    );
  }

  const data = await response.json();
  return data.results || [];
}

async function runWebResearch(
  params: DelegateTaskParams,
  context: SubagentContext,
): Promise<DelegateTaskExecutionResult> {
  if (!context.webResearchEnabled) {
    return {
      success: false,
      error:
        "Web research is disabled - the player hasn't enabled it in Settings. Proceed without real-world lookups.",
    };
  }
  if (!context.braveSearchKey) {
    return {
      success: false,
      error:
        "Web research has no search API key configured in Settings. Proceed without real-world lookups.",
    };
  }

  try {
    const results = await runWebSearch(params.brief, context.braveSearchKey);

    if (results.length === 0) {
      return {
        success: true,
        outcome: {
          kind: "summary",
          text: `No web results found for: ${params.brief}`,
        },
      };
    }

    const resultsText = results
      .slice(0, 5)
      .map((r) => `- ${r.title}: ${r.description} (${r.url})`)
      .join("\n");

    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "You are a research assistant. Given search results, write ONLY a single JSON object of the shape {\"summary\": string} containing a short, factual synthesis answering the question. Only use the provided results - don't invent facts.",
      },
      {
        role: "user",
        content: `Question: ${params.brief}\n\nSearch results:\n${resultsText}`,
      },
    ];

    const content = await callGenerateWithFallback(
      messages,
      1,
      context.apiKeys,
      context.token,
    );
    const parsed = extractJSONFromContent(content) as { summary?: string };
    if (!parsed.summary) throw new Error("Sub-agent returned no summary");

    return { success: true, outcome: { kind: "summary", text: parsed.summary } };
  } catch (error) {
    return {
      success: false,
      error: `Web research failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

/** Default reasoning tier per task type - location writeups get one tier more room than a quick NPC or lookup. */
function defaultTierFor(taskType: DelegateTaskParams["task_type"]): number {
  return taskType === "generate_location" ? 2 : 1;
}

export async function runDelegateTask(
  params: DelegateTaskParams,
  storyData: StoryData,
  context: SubagentContext,
): Promise<DelegateTaskExecutionResult> {
  if (params.task_type === "web_research") {
    return runWebResearch(params, context);
  }

  try {
    const messages = buildSubagentMessages(params, storyData);
    const content = await callGenerateWithFallback(
      messages,
      defaultTierFor(params.task_type),
      context.apiKeys,
      context.token,
    );
    const parsed = extractJSONFromContent(content) as Record<string, unknown>;

    switch (params.task_type) {
      case "generate_npc": {
        const name = parsed.name;
        const description = parsed.description;
        const role = parsed.role;
        if (
          typeof name !== "string" ||
          typeof description !== "string" ||
          typeof role !== "string"
        ) {
          throw new Error("Sub-agent NPC result missing name/description/role");
        }
        return {
          success: true,
          outcome: {
            kind: "npc",
            name,
            description,
            role,
            attitude:
              typeof parsed.attitude === "string" ? parsed.attitude : undefined,
            relationship:
              typeof parsed.relationship === "string"
                ? parsed.relationship
                : undefined,
            faction:
              typeof parsed.faction === "string" ? parsed.faction : undefined,
          },
        };
      }
      case "generate_location": {
        const title = parsed.title;
        const noteContent = parsed.content;
        if (typeof title !== "string" || typeof noteContent !== "string") {
          throw new Error("Sub-agent location result missing title/content");
        }
        return {
          success: true,
          outcome: {
            kind: "note",
            title,
            content: noteContent,
            noteType: "location",
          },
        };
      }
      case "research": {
        const summary = parsed.summary;
        if (typeof summary !== "string") {
          throw new Error("Sub-agent research result missing summary");
        }
        return { success: true, outcome: { kind: "summary", text: summary } };
      }
      default:
        throw new Error(`Unknown task_type "${params.task_type}"`);
    }
  } catch (error) {
    return {
      success: false,
      error: `delegate_task (${params.task_type}) failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}
