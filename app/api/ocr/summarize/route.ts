import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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
 * (lore entries, mechanic notes, custom tables, etc.)
 *
 * Request: {
 *   markdown: string,           // OCR-extracted markdown
 *   focus?: string[],           // Content types to focus on
 *   maxLoreEntries?: number,    // Max lore entries to generate
 *   maxTables?: number,         // Max tables to extract
 *   customInstructions?: string,// Additional AI instructions
 *   model?: string,             // AI model to use
 *   maxTokens?: number,         // Max output tokens
 *   openRouterKey?: string,     // BYOK for OpenRouter
 *   deepseekKey?: string        // BYOK for DeepSeek
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

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

export async function POST(request: NextRequest) {
  try {
    // Validate auth
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await request.json();
    const {
      markdown,
      focus = ["all"],
      customInstructions = "",
      model = "ministral-14b-2512",
      maxTokens = 16000, // Increased for comprehensive extraction
      openRouterKey,
      deepseekKey,
    } = body;

    if (!markdown || markdown.trim().length === 0) {
      return NextResponse.json(
        { error: "No markdown content provided" },
        { status: 400 }
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
    let aiResponse;

    // Determine which API to use
    const isMistralModel =
      model.startsWith("mistral-") ||
      model.startsWith("ministral-") ||
      model.startsWith("codestral-") ||
      model.startsWith("devstral-");

    if (isMistralModel && MISTRAL_API_KEY) {
      aiResponse = await callMistralAI(
        systemPrompt,
        userPrompt,
        model,
        maxTokens
      );
    } else if (model === "deepseek-chat" && (deepseekKey || DEEPSEEK_API_KEY)) {
      aiResponse = await callDeepSeekAI(
        systemPrompt,
        userPrompt,
        maxTokens,
        deepseekKey || DEEPSEEK_API_KEY!
      );
    } else if (openRouterKey) {
      aiResponse = await callOpenRouterAI(
        systemPrompt,
        userPrompt,
        model,
        maxTokens,
        openRouterKey
      );
    } else {
      return NextResponse.json(
        {
          error:
            "No valid AI configuration. Provide API key or use Mistral models.",
        },
        { status: 400 }
      );
    }

    if (!aiResponse.success) {
      return NextResponse.json(
        { error: aiResponse.error || "AI processing failed" },
        { status: 500 }
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
        let continuationResponse;

        // Use the same provider for continuation
        if (isMistralModel && MISTRAL_API_KEY) {
          continuationResponse = await callMistralAI(
            "You are a JSON completion assistant. Output ONLY the minimal characters needed to close the JSON.",
            continuationPrompt,
            model,
            2000 // Small limit for just closing JSON
          );
        } else if (
          model === "deepseek-chat" &&
          (deepseekKey || DEEPSEEK_API_KEY)
        ) {
          continuationResponse = await callDeepSeekAI(
            "You are a JSON completion assistant. Output ONLY the minimal characters needed to close the JSON.",
            continuationPrompt,
            2000,
            deepseekKey || DEEPSEEK_API_KEY!
          );
        } else if (openRouterKey) {
          continuationResponse = await callOpenRouterAI(
            "You are a JSON completion assistant. Output ONLY the minimal characters needed to close the JSON.",
            continuationPrompt,
            model,
            2000,
            openRouterKey
          );
        }

        if (continuationResponse?.success && continuationResponse.content) {
          const cleanedContinuation = cleanContinuationContent(
            content,
            continuationResponse.content
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
      { status: 500 }
    );
  }
}

// ============================================================================
// Prompt Building
// ============================================================================

function buildSystemPrompt(
  focus: string[],
  customInstructions: string
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
      "type": null,  // null for normal lore, "mechanics" for rules
      "folder": "Category folder (Characters, Locations, Items, Factions, History, etc.)",
      "tags": ["tag1", "tag2"],
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
        { "min": 1, "max": 10, "result": "Result text" }
      ]
    }
  ]
}

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
  focusAll || focus.includes("tables")
    ? "- Extract ALL TABLES: Random tables, encounter tables, loot tables. Convert to our format with min/max/result."
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
- Mark secret/hidden information with "secrtet": true
- For tables, estimate reasonable min/max ranges if not explicitly stated
- Be thorough but concise - prioritize quality over quantity

${customInstructions ? `ADDITIONAL INSTRUCTIONS:\n${customInstructions}` : ""}`;
}

function buildUserPrompt(
  markdown: string,
  contentType: string,
  extractedTables: { headers: string[]; rows: string[][] }[]
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
  maxTokens: number
): Promise<{ success: boolean; content?: string; error?: string }> {
  try {
    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MISTRAL_API_KEY}`,
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
  maxTokens: number,
  apiKey: string
): Promise<{ success: boolean; content?: string; error?: string }> {
  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
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
  apiKey: string
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
      }
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
    })
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
    })
  );

  // Process custom tables
  const customTables: CustomTable[] = (parsed.customTables || []).map(
    (table: any, index: number) => ({
      id: `table-ocr-${Date.now()}-${index}`,
      name: table.name || `Table ${index + 1}`,
      description: table.description || "",
      entries: (table.entries || []).map((entry: any, entryIndex: number) => ({
        min: entry.min ?? entryIndex + 1,
        max: entry.max ?? entryIndex + 1,
        result: entry.result || entry.text || "",
      })),
    })
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
