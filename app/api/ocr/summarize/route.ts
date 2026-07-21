import { NextRequest, NextResponse } from "next/server";
import { StoryLore, CustomTable } from "@/app/misc/structs";
import {
  detectContentType,
  splitIntoSections,
  extractTables,
} from "@/app/misc/ocr";
import {
  attemptJSONRepair,
  cleanContinuationContent,
  buildContinuationPrompt,
} from "@/app/misc/big_adventure_ai";

// Allow up to 5 minutes for AI summarization (including continuation attempts)
export const maxDuration = 300;

/**
 * POST /api/ocr/summarize
 *
 * Uses AI to convert raw OCR markdown into structured RPG notes
 * (lore entries, mechanic notes, custom tables, etc.). BYOK only - the
 * caller must provide their own API key for the selected provider.
 *
 * Request: {
 *   markdown: string,           // OCR-extracted markdown
 *   focus?: string[],           // Content types to focus on
 *   maxLoreEntries?: number,    // Max lore entries to generate
 *   maxTables?: number,         // Max tables to extract
 *   customInstructions?: string,// Additional AI instructions
 *   model?: string,             // AI model to use
 *   provider?: string,          // "openrouter" | "deepseek" | "mistral" | "google" | "deepinfra"
 *                               // Inferred from model name if omitted.
 *   maxTokens?: number,         // Max output tokens
 *   openRouterKey?: string,     // BYOK for OpenRouter
 *   deepseekKey?: string,       // BYOK for DeepSeek
 *   mistralKey?: string,        // BYOK for Mistral
 *   googleKey?: string,         // BYOK for Google AI Studio
 *   deepinfraKey?: string       // BYOK for DeepInfra
 * }
 *
 * Response: {
 *   success: boolean,
 *   lore: StoryLore[],
 *   mechanicNotes: StoryLore[],  // Type: mechanics
 *   customTables: CustomTable[],
 *   summary: string
 * }
 */

type AIProvider = "openrouter" | "deepseek" | "mistral" | "google" | "deepinfra";

function inferProvider(model: string): AIProvider {
  if (
    model.startsWith("mistral-") ||
    model.startsWith("ministral-") ||
    model.startsWith("codestral-") ||
    model.startsWith("devstral-")
  ) {
    return "mistral";
  }
  if (model === "deepseek-v4-flash") return "deepseek";
  return "openrouter";
}

function callProviderAI(
  provider: AIProvider,
  systemPrompt: string,
  userPrompt: string,
  model: string,
  maxTokens: number,
  apiKey: string,
): Promise<{ success: boolean; content?: string; error?: string }> {
  switch (provider) {
    case "mistral":
      return callMistralAI(systemPrompt, userPrompt, model, maxTokens, apiKey);
    case "deepseek":
      return callDeepSeekAI(systemPrompt, userPrompt, model, maxTokens, apiKey);
    case "google":
      return callGoogleAI(systemPrompt, userPrompt, model, maxTokens, apiKey);
    case "deepinfra":
      return callDeepInfraAI(
        systemPrompt,
        userPrompt,
        model,
        maxTokens,
        apiKey,
      );
    case "openrouter":
    default:
      return callOpenRouterAI(
        systemPrompt,
        userPrompt,
        model,
        maxTokens,
        apiKey,
      );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      markdown,
      focus = ["all"],
      customInstructions = "",
      model = "ministral-14b-2512",
      provider,
      maxTokens = 16000, // Increased for comprehensive extraction
      openRouterKey,
      deepseekKey,
      mistralKey,
      googleKey,
      deepinfraKey,
    } = body;

    if (!markdown || markdown.trim().length === 0) {
      return NextResponse.json(
        { error: "No markdown content provided" },
        { status: 400 },
      );
    }

    const effectiveProvider: AIProvider = provider || inferProvider(model);
    const providerKeys: Record<AIProvider, string | undefined> = {
      openrouter: openRouterKey,
      deepseek: deepseekKey,
      mistral: mistralKey,
      google: googleKey,
      deepinfra: deepinfraKey,
    };
    const apiKey = providerKeys[effectiveProvider];

    if (!apiKey) {
      return NextResponse.json(
        {
          error: `No ${effectiveProvider} API key provided. Please add your own key in Settings.`,
        },
        { status: 400 },
      );
    }

    // Detect content type for better prompting
    const contentType = detectContentType(markdown);

    // Pre-extract tables for structured output
    const extractedTables = extractTables(markdown);

    // Build the AI prompt
    const systemPrompt = buildSystemPrompt(focus, customInstructions);
    const userPrompt = buildUserPrompt(markdown, contentType, extractedTables);

    // Call AI to process the content
    const aiResponse = await callProviderAI(
      effectiveProvider,
      systemPrompt,
      userPrompt,
      model,
      maxTokens,
      apiKey,
    );

    if (!aiResponse.success) {
      return NextResponse.json(
        { error: aiResponse.error || "AI processing failed" },
        { status: 500 },
      );
    }

    let content = aiResponse.content || "";

    // Try to parse the response - if it fails, attempt continuation
    let parsed = tryParseAIResponse(content);

    // If parsing failed and content looks truncated, try continuation
    if (!parsed && isContentTruncated(content)) {
      console.log("Content appears truncated, attempting continuation...");

      // Try up to 2 continuation attempts
      for (let attempt = 0; attempt < 2; attempt++) {
        console.log(`Continuation attempt ${attempt + 1}/2`);

        const continuationPrompt = buildContinuationPrompt(content, "core");

        // Use the same provider for continuation
        const continuationResponse = await callProviderAI(
          effectiveProvider,
          "You are a JSON completion assistant. Output ONLY the minimal characters needed to close the JSON.",
          continuationPrompt,
          model,
          2000, // Small limit for just closing JSON
          apiKey,
        );

        if (continuationResponse?.success && continuationResponse.content) {
          const cleanedContinuation = cleanContinuationContent(
            content,
            continuationResponse.content,
          );

          if (cleanedContinuation) {
            content = content + cleanedContinuation;
            parsed = tryParseAIResponse(content);

            if (parsed) {
              console.log(`Continuation successful on attempt ${attempt + 1}`);
              break;
            }
          }
        }
      }
    }

    // Final fallback: use repair function if parsing still fails
    if (!parsed) {
      console.log("Using JSON repair as final fallback");
      parsed = parseAIResponse(content);
    }

    return NextResponse.json({
      success: true,
      ...parsed,
      detectedContentType: contentType,
      rawExtractedTables: extractedTables.length,
    });
  } catch (error: any) {
    console.error("OCR summarize error:", error);
    return NextResponse.json(
      { error: error.message || "Summarization failed" },
      { status: 500 },
    );
  }
}

// ============================================================================
// Prompt Building
// ============================================================================

function buildSystemPrompt(
  focus: string[],
  customInstructions: string,
): string {
  const focusAll = focus.includes("all");

  return `You are an expert RPG content analyzer. Your task is to convert OCR-extracted text from RPG rulebooks, adventures, and supplements into structured data for a text adventure game engine.

IMPORTANT: Extract ALL relevant content from the document. Do not limit yourself - capture everything useful.

OUTPUT FORMAT: You MUST respond with a valid JSON object containing these fields:
{
  "summary": "Brief 1-2 sentence description of what this document contains",
  "lore": [
    {
      "title": "Entry title",
      "content": "Detailed content (2-4 paragraphs)",
      "type": null,  // "lore" (default) = world-building, "mechanics" = rules/systems, "character_sheet" = player character info
      "folder": "Category folder (Characters, Locations, Items, Factions, History, etc.)",
      "tags": ["tag1", "tag2"],
      "aliases": ["Alternate name 1", "Nickname 2"],  // other names, nicknames, or titles this entry is also called in the text - [] if none
      "secrtet": false  // true if this is secret/hidden information
    }
  ],
  "mechanicNotes": [
    {
      "title": "Rule/Mechanic name",
      "content": "Detailed explanation of the rule or mechanic",
      "type": "mechanics",
      "folder": "Rules"
    }
  ],
  "customTables": [
    {
      "name": "Table name",
      "description": "What this table is for",
      "entries": [
        { "text": "Result text", "weight": 1 }  // weight = probability weight (higher = more likely)
      ]
    }
  ]
}

NOTE TYPES:
- type: null or "lore" (default) - World-building, NPCs, locations, factions, history. Normal priority.
- type: "mechanics" - Game rules, dice systems, combat rules, skill checks. Second priority in AI context.
- type: "character_sheet" - Player character sheet info (their stats, class, race, background, equipment). Highest priority - always at top of AI context.

GUIDELINES:
${
  focusAll || focus.includes("lore")
    ? "- Extract ALL LORE: World-building facts, character descriptions, location details, faction info, historical events. Be comprehensive!"
    : ""
}
${
  focusAll || focus.includes("mechanics")
    ? '- Extract ALL MECHANICS: Game rules, special abilities, combat rules, skill systems, magic systems. Mark these with type: "mechanics".'
    : ""
}
${
  focusAll || focus.includes("character_sheet")
    ? '- Extract PLAYER CHARACTER SHEET info: If the document contains a filled-out character sheet (stats, class, race, background, inventory), extract it with type: "character_sheet".'
    : ""
}
${
  focusAll || focus.includes("tables")
    ? "- Extract ALL TABLES: Random tables, encounter tables, loot tables. For each entry use 'text' for the result and 'weight' for the probability (use the range size as weight, e.g. 1-10 = weight 10)."
    : ""
}
${
  focusAll || focus.includes("characters")
    ? "- Extract ALL CHARACTERS: NPCs, monsters, important figures. Include stats if available."
    : ""
}

CONTENT RULES:
- Each lore entry should be 2-4 paragraphs of rich detail
- Use descriptive folder names for organization (Characters, Locations, Items, Factions, History, Bestiary, etc.)
- If a character, place, or thing is referred to by more than one name in the text (a nickname, title, alias, alternate spelling, or shortened form - e.g. "Bob" for "Robert the Blacksmith", or "the Sunken Temple" for "Vashti's Sanctum"), list those other names in "aliases" so mentions of them can also be recognized. Leave "aliases" as [] when there's only the one name.
- Mark secret/hidden information with "secrtet": true
- For tables, estimate reasonable min/max ranges if not explicitly stated
- Be thorough but concise - prioritize quality over quantity

${customInstructions ? `ADDITIONAL INSTRUCTIONS:\n${customInstructions}` : ""}`;
}

function buildUserPrompt(
  markdown: string,
  contentType: string,
  extractedTables: { headers: string[]; rows: string[][] }[],
): string {
  // Truncate very long documents
  const maxChars = 50000;
  const truncatedMarkdown =
    markdown.length > maxChars
      ? markdown.substring(0, maxChars) + "\n\n[... content truncated ...]"
      : markdown;

  let prompt = `Analyze this OCR-extracted RPG content and convert it to structured data.

DETECTED CONTENT TYPE: ${contentType}

${
  extractedTables.length > 0
    ? `PRE-EXTRACTED TABLES (${
        extractedTables.length
      } found):\n${JSON.stringify(extractedTables.slice(0, 5), null, 2)}\n\n`
    : ""
}

DOCUMENT CONTENT:
${truncatedMarkdown}

Please analyze this content and output a JSON object with lore entries, mechanic notes, custom tables, and variables as specified.`;

  return prompt;
}

// ============================================================================
// AI API Calls
// ============================================================================

async function callMistralAI(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  maxTokens: number,
  apiKey: string,
): Promise<{ success: boolean; content?: string; error?: string }> {
  try {
    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.3, // Lower temperature for more consistent structured output
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Mistral AI error:", error);
      return {
        success: false,
        error: `Mistral API error: ${response.statusText}`,
      };
    }

    const data = await response.json();
    return { success: true, content: data.choices[0]?.message?.content || "" };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function callDeepSeekAI(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  maxTokens: number,
  apiKey: string,
): Promise<{ success: boolean; content?: string; error?: string }> {
  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "deepseek-v4-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("DeepSeek AI error:", error);
      return {
        success: false,
        error: `DeepSeek API error: ${response.statusText}`,
      };
    }

    const data = await response.json();
    return { success: true, content: data.choices[0]?.message?.content || "" };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function callOpenRouterAI(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  maxTokens: number,
  apiKey: string,
): Promise<{ success: boolean; content?: string; error?: string }> {
  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer":
            process.env.NEXT_PUBLIC_SITE_URL || "https://your-story.app",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: maxTokens,
          temperature: 0.3,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("OpenRouter AI error:", error);
      return {
        success: false,
        error: `OpenRouter API error: ${response.statusText}`,
      };
    }

    const data = await response.json();
    return { success: true, content: data.choices[0]?.message?.content || "" };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function callGoogleAI(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  maxTokens: number,
  apiKey: string,
): Promise<{ success: boolean; content?: string; error?: string }> {
  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: maxTokens,
          temperature: 0.3,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Google AI error:", error);
      return {
        success: false,
        error: `Google AI error: ${response.statusText}`,
      };
    }

    const data = await response.json();
    return { success: true, content: data.choices[0]?.message?.content || "" };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function callDeepInfraAI(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  maxTokens: number,
  apiKey: string,
): Promise<{ success: boolean; content?: string; error?: string }> {
  try {
    const response = await fetch(
      "https://api.deepinfra.com/v1/openai/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: maxTokens,
          temperature: 0.3,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("DeepInfra AI error:", error);
      return {
        success: false,
        error: `DeepInfra API error: ${response.statusText}`,
      };
    }

    const data = await response.json();
    return { success: true, content: data.choices[0]?.message?.content || "" };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * Check if content appears to be truncated (incomplete JSON)
 */
function isContentTruncated(content: string): boolean {
  const trimmed = content.trim();

  // Check for obvious truncation signs
  if (!trimmed.endsWith("}") && !trimmed.endsWith("]")) {
    // Might be mid-string or mid-object
    return true;
  }

  // Count brackets - if mismatched, it's truncated
  let braceCount = 0;
  let bracketCount = 0;
  let inString = false;
  let escaped = false;

  for (const char of trimmed) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === "{") braceCount++;
      else if (char === "}") braceCount--;
      else if (char === "[") bracketCount++;
      else if (char === "]") bracketCount--;
    }
  }

  return braceCount !== 0 || bracketCount !== 0 || inString;
}

/**
 * Try to parse AI response without repair - returns null if parsing fails
 */
function tryParseAIResponse(content: string): {
  summary: string;
  lore: StoryLore[];
  mechanicNotes: StoryLore[];
  customTables: CustomTable[];
} | null {
  try {
    // Try direct parse first
    let jsonStr = content.trim();

    // Handle markdown code blocks
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    // Find JSON object start
    const startIndex = jsonStr.indexOf("{");
    if (startIndex !== -1) {
      jsonStr = jsonStr.slice(startIndex);
    }

    const parsed = JSON.parse(jsonStr);
    return processParserResult(parsed);
  } catch {
    return null;
  }
}

function normalizeAliases(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a): a is string => typeof a === "string")
    .map((a) => a.trim())
    .filter(Boolean);
}

/**
 * Process parsed JSON into structured result
 */
function processParserResult(parsed: any): {
  summary: string;
  lore: StoryLore[];
  mechanicNotes: StoryLore[];
  customTables: CustomTable[];
} {
  // Process lore entries
  const lore: StoryLore[] = (parsed.lore || []).map(
    (entry: any, index: number) => ({
      title: entry.title || `Entry ${index + 1}`,
      content: entry.content || "",
      type: entry.type || undefined,
      folder: entry.folder || "",
      tags: entry.tags || [],
      aliases: normalizeAliases(entry.aliases),
      secrtet: entry.secrtet || entry.secret || false,
      on: true,
      alwaysOn: false,
      keys: [],
      on_triggers: [],
      off_triggers: [],
      trigger_lores: [],
      untrigger_lores: [],
      var_on_triggers: [],
      var_off_triggers: [],
    }),
  );

  // Process mechanic notes (same structure but with type: "mechanics")
  const mechanicNotes: StoryLore[] = (parsed.mechanicNotes || []).map(
    (entry: any, index: number) => ({
      title: entry.title || `Mechanic ${index + 1}`,
      content: entry.content || "",
      type: "mechanics" as const,
      folder: entry.folder || "Rules",
      tags: entry.tags || [],
      secrtet: false,
      on: true,
      alwaysOn: true,
      keys: [],
      on_triggers: [],
      off_triggers: [],
      trigger_lores: [],
      untrigger_lores: [],
      var_on_triggers: [],
      var_off_triggers: [],
    }),
  );

  // Process custom tables
  const customTables: CustomTable[] = (parsed.customTables || []).map(
    (table: any, index: number) => ({
      id: `table-ocr-${Date.now()}-${index}`,
      name: table.name || `Table ${index + 1}`,
      description: table.description || "",
      entries: (table.entries || []).map((entry: any) => {
        // Handle both formats: { text, weight } and { min, max, result }
        // The CustomTableEntry interface expects { text: string, weight: number }
        const text = entry.text || entry.result || "";
        // If weight is provided, use it; otherwise calculate from min/max range or default to 1
        let weight = entry.weight;
        if (weight === undefined || weight === null || isNaN(Number(weight))) {
          // If min/max are provided, use the range size as weight
          if (entry.min !== undefined && entry.max !== undefined) {
            weight = Math.max(1, Number(entry.max) - Number(entry.min) + 1);
          } else {
            weight = 1;
          }
        }
        return {
          text,
          weight: Math.max(1, Number(weight) || 1), // Ensure weight is always a valid positive number
        };
      }),
    }),
  );

  return {
    summary: parsed.summary || "",
    lore,
    mechanicNotes,
    customTables,
  };
}

function parseAIResponse(content: string): {
  summary: string;
  lore: StoryLore[];
  mechanicNotes: StoryLore[];
  customTables: CustomTable[];
} {
  const defaultResult = {
    summary: "",
    lore: [],
    mechanicNotes: [],
    customTables: [],
  };

  try {
    // First, try to repair the JSON (handles truncation, unclosed brackets, etc.)
    const repairedContent = attemptJSONRepair(content);

    let parsed: any;
    try {
      parsed = JSON.parse(repairedContent);
    } catch (firstError) {
      // If repair didn't work, try extracting from markdown code block
      const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        const repairedBlock = attemptJSONRepair(codeBlockMatch[1]);
        parsed = JSON.parse(repairedBlock);
      } else {
        throw firstError;
      }
    }

    return processParserResult(parsed);
  } catch (error) {
    console.error("Failed to parse AI response:", error);
    console.error("Raw content:", content.substring(0, 500));
    return defaultResult;
  }
}
