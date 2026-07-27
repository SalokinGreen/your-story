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
  /**
   * How many extra generation rounds are allowed after a response that ran
   * out of output tokens (see `summarizeOCR`). 0 disables continuation.
   */
  maxContinuationRounds?: number;
  /**
   * Wall-clock budget for the whole call. No continuation round is started
   * once it's spent, so a document with more content than the budget allows
   * returns partial notes instead of overrunning the request timeout.
   */
  continuationBudgetMs?: number;
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
  /** Total generation rounds used (1 = the model finished in one response). */
  extractionRounds: number;
  /**
   * True when there was still more to extract when we stopped - the last
   * round hit the output limit again, or parts of the document were never
   * reached - i.e. the document has more in it than the round/time budget
   * allowed.
   */
  incomplete: boolean;
}

/**
 * A single round's worth of extracted content, and the shape the rounds are
 * folded into (see `mergeRound`).
 */
export interface ExtractedContent {
  summary: string;
  lore: StoryLore[];
  mechanicNotes: StoryLore[];
  customTables: CustomTable[];
}

/**
 * Default cap on continuation rounds. A big single-chunk document (a whole
 * .md file imported in one go) routinely needs more notes than fit in one
 * response's output budget, so the model gets several rounds to keep going -
 * but not unboundedly, since each round re-sends the source document.
 */
export const DEFAULT_MAX_CONTINUATION_ROUNDS = 5;

/**
 * Default wall-clock budget for continuation rounds. Must stay under the
 * caller's request timeout (PDFImporter allows 4 minutes, the route's
 * `maxDuration` is 5) so a long extraction returns the notes it has rather
 * than being killed mid-flight with nothing to show.
 */
export const DEFAULT_CONTINUATION_BUDGET_MS = 180_000;

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
  options: { jsonMode?: boolean } = {},
): Promise<{
  success: boolean;
  content?: string;
  error?: string;
  /** Raw provider finish reason ("stop" / "length" / ...) when reported. */
  finishReason?: string;
}> {
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
    // `jsonMode: false` opts out for calls whose expected output isn't a
    // whole JSON object (the bracket-closing salvage call below).
    const jsonMode = options.jsonMode ?? true;
    if (jsonMode && (provider === "mistral" || provider === "deepseek")) {
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
    return {
      success: true,
      content: data.choices[0]?.message?.content || "",
      finishReason: data.choices[0]?.finish_reason,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * One generation round: call the model, then get a parsed result out of
 * whatever came back. A response cut off by the output limit is first given
 * two cheap "close the JSON" attempts (so the entries it *did* write survive
 * intact), then falls back to bracket repair, which drops at most the final
 * half-written entry. Callers use `truncated` to decide whether to ask for
 * another round of *new* content.
 */
async function runExtractionRound(
  provider: AIProvider,
  systemPrompt: string,
  userPrompt: string,
  model: string,
  maxTokens: number,
  apiKey: string,
): Promise<{ parsed: ExtractedContent; truncated: boolean; error?: string }> {
  const aiResponse = await callProviderAI(
    provider,
    systemPrompt,
    userPrompt,
    model,
    maxTokens,
    apiKey,
  );

  if (!aiResponse.success) {
    return {
      parsed: emptyExtraction(),
      truncated: false,
      error: aiResponse.error || "AI processing failed",
    };
  }

  let content = aiResponse.content || "";
  // Judge truncation from the raw response, before any repair below makes
  // the JSON look complete again.
  const truncated = wasTruncated(content, aiResponse.finishReason);
  let parsed = tryParseAIResponse(content);

  if (!parsed && isContentTruncated(content)) {
    console.log("Content appears truncated, attempting continuation...");

    for (let attempt = 0; attempt < 2; attempt++) {
      console.log(`Continuation attempt ${attempt + 1}/2`);
      const continuationPrompt = buildContinuationPrompt(content, "core");

      const continuationResponse = await callProviderAI(
        provider,
        "You are a JSON completion assistant. Output ONLY the minimal characters needed to close the JSON.",
        continuationPrompt,
        model,
        2000,
        apiKey,
        // Not a whole JSON object - strict JSON mode would fight the prompt.
        { jsonMode: false },
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

  return { parsed, truncated };
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
    maxContinuationRounds = DEFAULT_MAX_CONTINUATION_ROUNDS,
    continuationBudgetMs = DEFAULT_CONTINUATION_BUDGET_MS,
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

  const startedAt = Date.now();
  const contentType = detectContentType(markdown);
  const extractedTables = extractTables(markdown);

  const systemPrompt = buildSystemPrompt(focus, customInstructions);
  const windows = splitIntoWindows(markdown);
  // The pre-extracted tables come from the whole document, so they're only
  // worth attaching to the first part's prompt.
  const promptForWindow = (index: number) =>
    buildUserPrompt(
      windows[index],
      contentType,
      index === 0 ? extractedTables : [],
      { index, total: windows.length },
    );

  const first = await runExtractionRound(
    effectiveProvider,
    systemPrompt,
    promptForWindow(0),
    model,
    maxTokens,
    apiKey,
  );

  if (first.error) {
    return { error: first.error, status: 500 };
  }

  const collected = first.parsed;
  let windowIndex = 0;
  // Whether the current part of the document still has more to give: the
  // model was cut off by the output limit before it finished with it.
  let moreInThisWindow = first.truncated;
  let rounds = 1;

  // Truncation rounds and document parts get separate allowances, so a long
  // document doesn't spend its whole budget re-trying part one.
  const maxRounds = maxContinuationRounds + (windows.length - 1);

  // A single big document (a whole .md file is imported as one chunk) usually
  // has far more notes in it than fit in one response's output budget.
  // Closing the JSON only salvages what was already written - everything the
  // model hadn't got to yet is simply missing. So keep going while there's
  // stuff left, either because the model ran out of room on this part or
  // because there are more parts of the document to work through.
  while (rounds <= maxRounds) {
    if (Date.now() - startedAt >= continuationBudgetMs) {
      console.warn(
        "OCR summarize continuation budget spent - returning partial notes",
      );
      break;
    }

    let prompt: string;
    if (moreInThisWindow) {
      console.log(
        `OCR summarize hit the output limit, continuing part ${windowIndex + 1}/${windows.length} (round ${rounds}/${maxRounds})...`,
      );
      prompt = buildContinuationUserPrompt(promptForWindow(windowIndex), collected);
    } else if (windowIndex + 1 < windows.length) {
      windowIndex++;
      console.log(
        `OCR summarize moving on to part ${windowIndex + 1}/${windows.length}...`,
      );
      prompt = buildNextPartUserPrompt(promptForWindow(windowIndex), collected);
    } else {
      // Nothing left: the model finished, on the last part of the document.
      break;
    }

    const round = await runExtractionRound(
      effectiveProvider,
      systemPrompt,
      prompt,
      model,
      maxTokens,
      apiKey,
    );

    // A failed round is never fatal: keep whatever earlier rounds already
    // extracted rather than losing the whole import.
    if (round.error) {
      console.error("Continuation round failed:", round.error);
      break;
    }

    rounds++;
    const added = mergeRound(collected, round.parsed);
    // Re-asking only pays off while the model still has something new to
    // say; if it's just repeating entries we already have, move on to the
    // next part of the document instead.
    moreInThisWindow = round.truncated && added > 0;
  }

  return {
    success: true,
    ...collected,
    detectedContentType: contentType,
    rawExtractedTables: extractedTables.length,
    extractionRounds: rounds,
    incomplete: moreInThisWindow || windowIndex < windows.length - 1,
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

/**
 * How much of the document goes into one prompt. Anything longer is walked
 * part by part across rounds (see `splitIntoWindows`) rather than cut off -
 * a text/markdown file is imported as a single chunk, with no page-range
 * splitting to fall back on, so a hard truncation here used to mean the tail
 * of the file was never seen by the model at all.
 */
export const MAX_PROMPT_CHARS = 50000;

/** Overlap between consecutive parts, so a section on the seam isn't lost. */
export const WINDOW_OVERLAP_CHARS = 1500;

export function splitIntoWindows(
  markdown: string,
  maxChars: number = MAX_PROMPT_CHARS,
  overlap: number = WINDOW_OVERLAP_CHARS,
): string[] {
  if (markdown.length <= maxChars) return [markdown];

  const windows: string[] = [];
  let start = 0;

  while (start < markdown.length) {
    let end = Math.min(start + maxChars, markdown.length);
    if (end < markdown.length) {
      // Prefer a line break in the last tenth of the window so parts tend to
      // split between sections rather than mid-sentence.
      const earliestBreak = start + Math.floor(maxChars * 0.9);
      const lineBreak = markdown.lastIndexOf("\n", end);
      if (lineBreak > earliestBreak) end = lineBreak;
    }

    windows.push(markdown.slice(start, end));
    if (end >= markdown.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return windows;
}

function buildUserPrompt(
  documentPart: string,
  contentType: string,
  extractedTables: { headers: string[]; rows: string[][] }[],
  part: { index: number; total: number } = { index: 0, total: 1 },
): string {
  const partHeader =
    part.total > 1
      ? `THIS IS PART ${part.index + 1} OF ${part.total} OF THE DOCUMENT. Extract everything covered by this part; the other parts are handled by their own passes.\n\n`
      : "";

  return `${partHeader}Analyze this OCR-extracted RPG content and convert it to structured data.

DETECTED CONTENT TYPE: ${contentType}

${
  extractedTables.length > 0
    ? `PRE-EXTRACTED TABLES (${extractedTables.length} found):\n${JSON.stringify(extractedTables.slice(0, 5), null, 2)}\n\n`
    : ""
}

DOCUMENT CONTENT:
${documentPart}

Please analyze this content and output a JSON object with lore entries, mechanic notes, custom tables, and variables as specified.`;
}

function titleList(titles: string[]): string {
  return titles.length > 0 ? titles.map((t) => `- ${t}`).join("\n") : "(none yet)";
}

/**
 * The "you've already done these" block shared by both follow-up prompts.
 * Each round is a fresh call with no memory of the last one, so the titles
 * collected so far are what keeps it from re-writing the same notes.
 */
function alreadyExtractedBlock(collected: ExtractedContent): string {
  return `ALREADY EXTRACTED LORE ENTRIES:
${titleList(collected.lore.map((entry) => entry.title))}

ALREADY EXTRACTED MECHANIC NOTES:
${titleList(collected.mechanicNotes.map((entry) => entry.title))}

ALREADY EXTRACTED TABLES:
${titleList(collected.customTables.map((table) => table.name))}`;
}

/**
 * Prompt for a follow-up round after the model ran out of output tokens on
 * this same part of the document.
 *
 * Asking for a fresh, self-contained JSON object of *new* entries - rather
 * than a raw continuation of the cut-off string - keeps every round
 * independently parseable and works with providers pinned to strict JSON
 * mode.
 */
function buildContinuationUserPrompt(
  basePrompt: string,
  collected: ExtractedContent,
): string {
  return `${basePrompt}

=== CONTINUATION ROUND ===

Your previous response ran out of output length before you finished. Everything you had written by then has already been saved, listed below.

${alreadyExtractedBlock(collected)}

CONTINUE THE EXTRACTION:
1. Work through the parts of the document that the entries above do NOT cover yet.
2. Output the SAME JSON format, containing ONLY the new entries. Do not repeat or rewrite anything already listed above.
3. The one exception: if an entry above was cut off mid-way, you may output that single entry again in full - reuse its exact title so it replaces the incomplete version.
4. "summary" may be left as an empty string; the first round's summary is kept.
5. If the document is fully covered and there is genuinely nothing left, output {"summary": "", "lore": [], "mechanicNotes": [], "customTables": []}.`;
}

/** Prompt for the round that moves on to the next part of the document. */
function buildNextPartUserPrompt(
  basePrompt: string,
  collected: ExtractedContent,
): string {
  return `${basePrompt}

=== EARLIER PARTS ALREADY COVERED ===

Earlier parts of this document have already been extracted, producing the entries below. They are saved - do not repeat them.

${alreadyExtractedBlock(collected)}

Extract the notes, mechanics and tables from THIS part of the document, in the same JSON format, containing only entries not already listed above. If this part continues a topic listed above, output that entry again under its exact existing title with the fuller combined text.`;
}

// ============================================================================
// Response Parsing
// ============================================================================

export function emptyExtraction(): ExtractedContent {
  return { summary: "", lore: [], mechanicNotes: [], customTables: [] };
}

/**
 * Whether a response was cut short by the output-token limit. The provider's
 * `finish_reason` is authoritative when we get one ("length" = cut off,
 * anything else = the model chose to stop); the bracket-balance heuristic is
 * only the fallback for providers that don't report it.
 */
export function wasTruncated(content: string, finishReason?: string): boolean {
  if (finishReason === "length") return true;
  if (finishReason) return false;
  return isContentTruncated(content);
}

function titleKey(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");
}

function mergeEntryList(base: StoryLore[], next: StoryLore[]): number {
  const index = new Map<string, number>();
  base.forEach((entry, i) => index.set(titleKey(entry.title), i));

  let changed = 0;
  for (const entry of next) {
    const key = titleKey(entry.title);
    if (!key) continue;
    const existing = index.get(key);
    if (existing === undefined) {
      index.set(key, base.length);
      base.push(entry);
      changed++;
    } else if (entry.content.length > base[existing].content.length) {
      // Same title, more text: this is the previous round's final entry,
      // re-sent in full after the output limit chopped it off mid-sentence.
      base[existing] = entry;
      changed++;
    }
  }
  return changed;
}

function mergeTableList(base: CustomTable[], next: CustomTable[]): number {
  const index = new Map<string, CustomTable>();
  base.forEach((table) => index.set(titleKey(table.name), table));

  let changed = 0;
  for (const table of next) {
    const key = titleKey(table.name);
    if (!key) continue;
    const existing = index.get(key);
    if (!existing) {
      index.set(key, table);
      base.push(table);
      changed++;
      continue;
    }
    // Same table continued across rounds - append the rows it didn't have
    // room for, skipping any it repeated.
    const seen = new Set(existing.entries.map((row) => titleKey(row.text)));
    for (const row of table.entries) {
      const rowKey = titleKey(row.text);
      if (!rowKey || seen.has(rowKey)) continue;
      seen.add(rowKey);
      existing.entries.push(row);
      changed++;
    }
  }
  return changed;
}

/**
 * Fold a continuation round's output into the running result, in place.
 * Returns the number of entries added or replaced - 0 means the round
 * produced nothing new, which is the signal to stop asking for more.
 */
export function mergeRound(base: ExtractedContent, next: ExtractedContent): number {
  if (!base.summary && next.summary) {
    base.summary = next.summary;
  }
  return (
    mergeEntryList(base.lore, next.lore) +
    mergeEntryList(base.mechanicNotes, next.mechanicNotes) +
    mergeTableList(base.customTables, next.customTables)
  );
}

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
