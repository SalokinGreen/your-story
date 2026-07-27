/**
 * Shared OCR-summarize call logic behind /api/ocr/summarize - see
 * providerCall.ts for why this is split out (same code runs server-side for
 * the Vercel-hosted web build and client-side for the standalone
 * Tauri/Capacitor build, via ocrFetch.ts).
 *
 * Uses AI to convert raw OCR markdown into structured RPG notes (lore
 * entries, mechanic notes, custom tables, etc). BYOK only.
 */

import { StoryLore, CustomTable } from "@/app/misc/structs";
import { detectContentType, extractTables } from "@/app/misc/ocr";
import {
  attemptJSONRepair,
  cleanContinuationContent,
  buildContinuationPrompt,
} from "@/app/misc/jsonRepair";
import { getProviderFetch } from "@/app/misc/platformFetch";

export type AIProvider = "openrouter" | "deepseek" | "mistral" | "google" | "deepinfra";

export interface OCRSummarizeRequestBody {
  markdown: string;
  focus?: string[];
  customInstructions?: string;
  model?: string;
  provider?: AIProvider;
  maxTokens?: number;
  openRouterKey?: string;
  deepseekKey?: string;
  mistralKey?: string;
  googleKey?: string;
  deepinfraKey?: string;
}

export interface OCRSummarizeSuccess {
  success: true;
  summary: string;
  lore: StoryLore[];
  mechanicNotes: StoryLore[];
  customTables: CustomTable[];
  detectedContentType: string;
  rawExtractedTables: number;
}

export interface OCRSummarizeError {
  error: string;
  status: number;
}

export function inferProvider(model: string): AIProvider {
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

const PROVIDER_ENDPOINTS: Record<AIProvider, string> = {
  mistral: "https://api.mistral.ai/v1/chat/completions",
  deepseek: "https://api.deepseek.com/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  google: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  deepinfra: "https://api.deepinfra.com/v1/openai/chat/completions",
};

export async function callProviderAI(
  provider: AIProvider,
  systemPrompt: string,
  userPrompt: string,
  model: string,
  maxTokens: number,
  apiKey: string,
): Promise<{ success: boolean; content?: string; error?: string }> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };
    if (provider === "openrouter") {
      headers["HTTP-Referer"] = process.env.NEXT_PUBLIC_SITE_URL || "https://your-story.app";
    }

    const requestBody: Record<string, unknown> = {
      model: provider === "deepseek" ? model || "deepseek-v4-flash" : model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.3,
    };
    // Only Mistral/DeepSeek were asked for strict JSON mode in the original
    // per-provider implementations - OpenRouter/Google/DeepInfra weren't.
    if (provider === "mistral" || provider === "deepseek") {
      requestBody.response_format = { type: "json_object" };
    }

    const providerFetch = getProviderFetch();
    const response = await providerFetch(PROVIDER_ENDPOINTS[provider], {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`${provider} AI error:`, error);
      return { success: false, error: `${provider} API error: ${response.statusText}` };
    }

    const data = await response.json();
    return { success: true, content: data.choices[0]?.message?.content || "" };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function summarizeOCR(
  body: OCRSummarizeRequestBody,
): Promise<OCRSummarizeSuccess | OCRSummarizeError> {
  const {
    markdown,
    focus = ["all"],
    customInstructions = "",
    model = "ministral-14b-2512",
    provider,
    maxTokens = 16000,
    openRouterKey,
    deepseekKey,
    mistralKey,
    googleKey,
    deepinfraKey,
  } = body;

  if (!markdown || markdown.trim().length === 0) {
    return { error: "No markdown content provided", status: 400 };
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
    return {
      error: `No ${effectiveProvider} API key provided. Please add your own key in Settings.`,
      status: 400,
    };
  }

  const contentType = detectContentType(markdown);
  const extractedTables = extractTables(markdown);

  const systemPrompt = buildSystemPrompt(focus, customInstructions);
  const userPrompt = buildUserPrompt(markdown, contentType, extractedTables);

  const aiResponse = await callProviderAI(
    effectiveProvider,
    systemPrompt,
    userPrompt,
    model,
    maxTokens,
    apiKey,
  );

  if (!aiResponse.success) {
    return { error: aiResponse.error || "AI processing failed", status: 500 };
  }

  let content = aiResponse.content || "";
  let parsed = tryParseAIResponse(content);

  if (!parsed && isContentTruncated(content)) {
    console.log("Content appears truncated, attempting continuation...");

    for (let attempt = 0; attempt < 2; attempt++) {
      console.log(`Continuation attempt ${attempt + 1}/2`);
      const continuationPrompt = buildContinuationPrompt(content, "core");

      const continuationResponse = await callProviderAI(
        effectiveProvider,
        "You are a JSON completion assistant. Output ONLY the minimal characters needed to close the JSON.",
        continuationPrompt,
        model,
        2000,
        apiKey,
      );

      if (continuationResponse?.success && continuationResponse.content) {
        const cleanedContinuation = cleanContinuationContent(content, continuationResponse.content);
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

  if (!parsed) {
    console.log("Using JSON repair as final fallback");
    parsed = parseAIResponse(content);
  }

  return {
    success: true,
    ...parsed,
    detectedContentType: contentType,
    rawExtractedTables: extractedTables.length,
  };
}

// ============================================================================
// Prompt Building
// ============================================================================

function buildSystemPrompt(focus: string[], customInstructions: string): string {
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
      "relatedCharacters": ["Character name 1"],  // Other NPCs/characters this entry is connected to or mentions by name - [] if none
      "relatedLocations": ["Location name 1"],  // Places this entry is connected to or mentions by name - [] if none
      "keys": ["keyword1", "short phrase"],  // A few short words/phrases (not full sentences) that, if they come up later in play, mean this note is relevant - [] if none
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
- For each lore entry, list any other named NPCs/characters and locations it's connected to (mentioned in the text, allied/opposed to, located at, etc.) in "relatedCharacters"/"relatedLocations" - use the same name you'd use for that entry's own title elsewhere, so entries can be cross-referenced. Leave either as [] if none apply.
- Give each lore entry a few short "keys" - single words or short phrases (not sentences) a player or GM would plausibly say that should bring this note to mind later (a name, a place, a distinctive item or event). Leave as [] if nothing stands out.
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
  const maxChars = 50000;
  const truncatedMarkdown =
    markdown.length > maxChars
      ? markdown.substring(0, maxChars) + "\n\n[... content truncated ...]"
      : markdown;

  return `Analyze this OCR-extracted RPG content and convert it to structured data.

DETECTED CONTENT TYPE: ${contentType}

${
  extractedTables.length > 0
    ? `PRE-EXTRACTED TABLES (${extractedTables.length} found):\n${JSON.stringify(extractedTables.slice(0, 5), null, 2)}\n\n`
    : ""
}

DOCUMENT CONTENT:
${truncatedMarkdown}

Please analyze this content and output a JSON object with lore entries, mechanic notes, custom tables, and variables as specified.`;
}

// ============================================================================
// Response Parsing
// ============================================================================

function isContentTruncated(content: string): boolean {
  const trimmed = content.trim();

  if (!trimmed.endsWith("}") && !trimmed.endsWith("]")) {
    return true;
  }

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

function tryParseAIResponse(content: string): {
  summary: string;
  lore: StoryLore[];
  mechanicNotes: StoryLore[];
  customTables: CustomTable[];
} | null {
  try {
    let jsonStr = content.trim();

    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

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

function normalizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a): a is string => typeof a === "string")
    .map((a) => a.trim())
    .filter(Boolean);
}

export function processParserResult(parsed: any): {
  summary: string;
  lore: StoryLore[];
  mechanicNotes: StoryLore[];
  customTables: CustomTable[];
} {
  const lore: StoryLore[] = (parsed.lore || []).map((entry: any, index: number) => ({
    title: entry.title || `Entry ${index + 1}`,
    content: entry.content || "",
    type: entry.type || undefined,
    folder: entry.folder || "",
    tags: normalizeStringArray(entry.tags),
    aliases: normalizeStringArray(entry.aliases),
    relatedCharacters: normalizeStringArray(entry.relatedCharacters),
    relatedLocations: normalizeStringArray(entry.relatedLocations),
    secrtet: entry.secrtet || entry.secret || false,
    on: true,
    alwaysOn: false,
    keys: normalizeStringArray(entry.keys),
    on_triggers: [],
    off_triggers: [],
    trigger_lores: [],
    untrigger_lores: [],
    var_on_triggers: [],
    var_off_triggers: [],
  }));

  const mechanicNotes: StoryLore[] = (parsed.mechanicNotes || []).map(
    (entry: any, index: number) => ({
      title: entry.title || `Mechanic ${index + 1}`,
      content: entry.content || "",
      type: "mechanics" as const,
      folder: entry.folder || "Rules",
      tags: normalizeStringArray(entry.tags),
      relatedCharacters: [],
      relatedLocations: [],
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

  const customTables: CustomTable[] = (parsed.customTables || []).map(
    (table: any, index: number) => ({
      id: `table-ocr-${Date.now()}-${index}`,
      name: table.name || `Table ${index + 1}`,
      description: table.description || "",
      entries: (table.entries || []).map((entry: any) => {
        const text = entry.text || entry.result || "";
        let weight = entry.weight;
        if (weight === undefined || weight === null || isNaN(Number(weight))) {
          if (entry.min !== undefined && entry.max !== undefined) {
            weight = Math.max(1, Number(entry.max) - Number(entry.min) + 1);
          } else {
            weight = 1;
          }
        }
        return {
          text,
          weight: Math.max(1, Number(weight) || 1),
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
  const defaultResult = { summary: "", lore: [], mechanicNotes: [], customTables: [] };

  try {
    const repairedContent = attemptJSONRepair(content);

    let parsed: any;
    try {
      parsed = JSON.parse(repairedContent);
    } catch (firstError) {
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
