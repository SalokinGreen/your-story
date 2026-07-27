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
  /** How many parts the document was split into (1 = it fit in one prompt). */
  totalParts: number;
  /**
   * 1-based numbers of the parts that never got a single extraction round
   * before the budget ran out. Nothing from these parts of the source is in
   * the result at all, which is a categorically worse outcome than a part
   * that was merely covered shallowly - so it's reported separately from
   * `incomplete` and named in the importer's warning.
   */
  unreachedParts: number[];
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
 * Default wall-clock budget for the whole call, continuation rounds
 * included. Must stay under the route's `maxDuration` (5 minutes) with room
 * to spare: a call killed by the platform takes the whole SSE stream down
 * with it, which costs the client every note written so far, whereas
 * stopping ourselves returns them with `incomplete: true`.
 *
 * The budget covers the round about to start, not just the moment it starts
 * (see `summarizeOCR`), so overrunning it takes a round far slower than
 * every round before it.
 */
export const DEFAULT_CONTINUATION_BUDGET_MS = 240_000;

export interface OCRSummarizeError {
  error: string;
  status: number;
}

/**
 * Progress events emitted while an extraction runs, so a caller can show the
 * notes appearing as the model writes them instead of a spinner until the
 * whole call resolves.
 *
 * Every round is its own self-contained JSON object (see the follow-up
 * prompts below), so `delta` text belongs to the round most recently
 * announced by `round_start` - a listener accumulating deltas resets its
 * buffer on each `round_start` and folds what it parsed so far into its
 * running result.
 */
export type OCRSummarizeEvent =
  | {
      type: "round_start";
      /** 1-based round number across the whole call. */
      round: number;
      /** 0-based index of the document part this round works on. */
      part: number;
      totalParts: number;
      /** Why this round is running - see the prompt builders below. */
      reason: "initial" | "continuation" | "notes_recovery" | "next_part";
    }
  | { type: "delta"; text: string }
  | {
      type: "round_end";
      round: number;
      /** Running totals after this round was folded in. */
      lore: number;
      mechanicNotes: number;
      customTables: number;
    };

export type OCRSummarizeEventHandler = (event: OCRSummarizeEvent) => void;

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

/**
 * Reader for an OpenAI-style SSE completion stream. Fed raw response text in
 * whatever sized pieces arrive, it reassembles `data:` lines across chunk
 * boundaries and hands each content delta to `onDelta` as it lands.
 */
function createSSEConsumer(onDelta?: (text: string) => void) {
  let buffer = "";
  let content = "";
  let finishReason: string | undefined;

  const handleData = (data: string) => {
    if (!data || data === "[DONE]") return;
    try {
      const parsed = JSON.parse(data);
      const choice = parsed.choices?.[0];
      // `delta` while streaming; `message` covers providers that answer a
      // stream request with a single non-streamed chunk.
      const piece = choice?.delta?.content ?? choice?.message?.content;
      if (typeof piece === "string" && piece) {
        content += piece;
        onDelta?.(piece);
      }
      if (choice?.finish_reason) finishReason = choice.finish_reason;
    } catch {
      // Skip malformed JSON - a partial line is picked up by the next push.
    }
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        handleData(trimmed.slice(5).trim());
      }
    },
    /** Flush whatever is left in the line buffer and return the result. */
    finish(): { content: string; finishReason?: string } {
      const trimmed = buffer.trim();
      buffer = "";
      if (trimmed.startsWith("data:")) handleData(trimmed.slice(5).trim());
      return { content, finishReason };
    },
  };
}

export async function callProviderAI(
  provider: AIProvider,
  systemPrompt: string,
  userPrompt: string,
  model: string,
  maxTokens: number,
  apiKey: string,
  options: {
    jsonMode?: boolean;
    /**
     * When set, the response is requested as a token stream and each content
     * delta is handed over as it arrives. The return value is the same
     * either way - the whole content, once the stream is done.
     */
    onDelta?: (text: string) => void;
  } = {},
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
    if (options.onDelta) {
      requestBody.stream = true;
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

    if (options.onDelta) {
      const consumer = createSSEConsumer(options.onDelta);
      const reader = response.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          consumer.push(decoder.decode(value, { stream: true }));
        }
      } else {
        // No readable body (some native HTTP clients buffer the whole
        // response) - the SSE payload is still parseable in one go, the
        // deltas just all arrive at once.
        consumer.push(await response.text());
      }
      const { content, finishReason } = consumer.finish();
      return { success: true, content, finishReason };
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
  // Only the round's own generation streams; the bracket-closing salvage
  // calls below emit closing punctuation, not notes, so they stay silent.
  onDelta?: (text: string) => void,
): Promise<{ parsed: ExtractedContent; truncated: boolean; error?: string }> {
  const aiResponse = await callProviderAI(
    provider,
    systemPrompt,
    userPrompt,
    model,
    maxTokens,
    apiKey,
    { onDelta },
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
  onEvent?: OCRSummarizeEventHandler,
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

  // Streaming is opt-in per call: without a listener nothing changes about
  // how the provider is called.
  const onDelta = onEvent
    ? (text: string) => onEvent({ type: "delta", text })
    : undefined;

  onEvent?.({
    type: "round_start",
    round: 1,
    part: 0,
    totalParts: windows.length,
    reason: "initial",
  });

  const firstRoundStartedAt = Date.now();
  const first = await runExtractionRound(
    effectiveProvider,
    systemPrompt,
    promptForWindow(0),
    model,
    maxTokens,
    apiKey,
    onDelta,
  );

  if (first.error) {
    return { error: first.error, status: 500 };
  }

  const collected = first.parsed;
  const emitRoundEnd = (round: number) =>
    onEvent?.({
      type: "round_end",
      round,
      lore: collected.lore.length,
      mechanicNotes: collected.mechanicNotes.length,
      customTables: collected.customTables.length,
    });
  emitRoundEnd(1);

  /** Per-part bookkeeping, so follow-up rounds can be scheduled across parts. */
  interface PartState {
    /** This part has had at least one extraction round. */
    visited: boolean;
    /**
     * The model was cut off by the output limit on this part's last round
     * and still had something new to say - i.e. the part has more to give.
     */
    truncated: boolean;
    /** This part's last round filled in tables and wrote no notes at all. */
    producedOnlyTables: boolean;
    /** Notes recovery has already been spent on this part. */
    recoveryTried: boolean;
  }
  const parts: PartState[] = windows.map(() => ({
    visited: false,
    truncated: false,
    producedOnlyTables: false,
    recoveryTried: false,
  }));
  parts[0].visited = true;
  parts[0].truncated = first.truncated;
  parts[0].producedOnlyTables =
    notesCount(collected) === 0 && collected.customTables.length > 0;

  let rounds = 1;
  // Truncation continuations are the only rounds the user's setting caps;
  // spending its budget on anything else would make "0" mean something
  // different than "don't continue past the output limit".
  let continuationsUsed = 0;
  // The slowest round so far, used to judge whether the next one can finish
  // inside the budget. Rounds are the same shape of work every time, so the
  // slowest one to date is a fair worst case for the next.
  let slowestRoundMs = Date.now() - firstRoundStartedAt;
  // Set when a round errors out. A failed round is never fatal - we keep
  // whatever earlier rounds extracted - but there's no point scheduling more.
  let roundFailed = false;

  // Allowance of *follow-up* rounds, on top of the first round that has
  // already run. Truncation rounds, document parts and notes recovery get
  // separate allowances, so a long document doesn't spend its whole budget
  // re-trying part one. Recovery gets one round per part regardless of the
  // continuation-round setting: a part that came back as tables and nothing
  // else is a broken extraction, not a thoroughness preference.
  const maxFollowUpRounds =
    maxContinuationRounds + (windows.length - 1) + windows.length;

  /**
   * Whether another round fits in the budget. Judged against where that
   * round would *end*, not where it starts: a round begun just inside the
   * budget still runs for minutes, and overrunning the request timeout loses
   * the whole response - every note already written included - instead of
   * returning it as incomplete.
   */
  const roomForAnotherRound = () =>
    rounds - 1 < maxFollowUpRounds &&
    !roundFailed &&
    Date.now() - startedAt + slowestRoundMs < continuationBudgetMs;

  /** Run one follow-up round against `partIndex` and fold it into `collected`. */
  const runRound = async (
    partIndex: number,
    reason: "continuation" | "notes_recovery" | "next_part",
  ): Promise<void> => {
    const base = promptForWindow(partIndex);
    const prompt =
      reason === "continuation"
        ? buildContinuationUserPrompt(base, collected)
        : reason === "notes_recovery"
          ? buildNotesRecoveryPrompt(base, collected)
          : buildNextPartUserPrompt(base, collected);

    onEvent?.({
      type: "round_start",
      round: rounds + 1,
      part: partIndex,
      totalParts: windows.length,
      reason,
    });

    const notesBefore = notesCount(collected);
    const tablesBefore = collected.customTables.length;

    const roundStartedAt = Date.now();
    const round = await runExtractionRound(
      effectiveProvider,
      systemPrompt,
      prompt,
      model,
      maxTokens,
      apiKey,
      onDelta,
    );
    slowestRoundMs = Math.max(slowestRoundMs, Date.now() - roundStartedAt);

    if (round.error) {
      console.error(`OCR summarize ${reason} round failed:`, round.error);
      roundFailed = true;
      return;
    }

    rounds++;
    const added = mergeRound(collected, round.parsed);
    emitRoundEnd(rounds);

    const state = parts[partIndex];
    state.visited = true;
    // Re-asking only pays off while the model still has something new to
    // say; if it's just repeating entries we already have, stop asking.
    state.truncated = round.truncated && added > 0;
    state.producedOnlyTables =
      notesCount(collected) === notesBefore &&
      collected.customTables.length > tablesBefore;
  };

  // ---- Phase 1: sweep ----
  //
  // Every part of the document gets one round before any part gets a second.
  // A part that's never looked at contributes *nothing* to the import, which
  // is far worse than a part covered shallowly - and that's exactly what the
  // old depth-first order produced on a long rulebook: continuation and
  // recovery rounds drained the whole wall-clock budget on part one, so the
  // back half of the book was never sent to the model at all.
  for (let i = 1; i < windows.length && roomForAnotherRound(); i++) {
    console.log(`OCR summarize reading part ${i + 1}/${windows.length}...`);
    await runRound(i, "next_part");
  }

  // ---- Phase 2: deepen ----
  //
  // Whatever budget survived the sweep goes on parts that asked for more,
  // round-robin so one greedy part can't starve the rest. Notes recovery
  // outranks continuation for a part needing both: a part with no notes at
  // all is a broken extraction, while a truncated one at least produced
  // something.
  for (let progressed = true; progressed && roomForAnotherRound(); ) {
    progressed = false;
    for (let i = 0; i < windows.length && roomForAnotherRound(); i++) {
      const state = parts[i];
      if (!state.visited) continue;

      if (state.producedOnlyTables && !state.recoveryTried) {
        console.log(
          `OCR summarize got tables but no notes from part ${i + 1}/${windows.length} - asking for the notes...`,
        );
        state.recoveryTried = true;
        await runRound(i, "notes_recovery");
        progressed = true;
      } else if (state.truncated && continuationsUsed < maxContinuationRounds) {
        console.log(
          `OCR summarize hit the output limit on part ${i + 1}/${windows.length}, continuing (round ${rounds}/${maxFollowUpRounds + 1})...`,
        );
        continuationsUsed++;
        await runRound(i, "continuation");
        progressed = true;
      }
    }
  }

  const unreachedParts = parts
    .map((state, i) => (state.visited ? 0 : i + 1))
    .filter((partNumber) => partNumber > 0);

  if (unreachedParts.length > 0) {
    console.warn(
      `OCR summarize ran out of budget - parts ${unreachedParts.join(", ")} of ${windows.length} were never read`,
    );
  }

  return {
    success: true,
    ...collected,
    detectedContentType: contentType,
    rawExtractedTables: extractedTables.length,
    extractionRounds: rounds,
    incomplete: unreachedParts.length > 0 || parts.some((s) => s.truncated),
    totalParts: windows.length,
    unreachedParts,
  };
}

// ============================================================================
// Prompt Building
// ============================================================================

function buildSystemPrompt(focus: string[], customInstructions: string): string {
  const focusAll = focus.includes("all");

  return `You are an expert RPG content analyzer. Your task is to convert OCR-extracted text from RPG rulebooks, adventures, and supplements into structured data for a text adventure game engine.

IMPORTANT: Extract ALL relevant content from the document. Do not limit yourself - capture everything useful.

NOTES ARE THE PRIMARY OUTPUT. "lore" and "mechanicNotes" are what the game engine reads during play and what the player actually sees - they are the point of this extraction. "customTables" are an ADDITION on top of the notes, never a substitute for them. A response full of tables with few or no notes is a failed extraction, no matter how table-heavy the source material is. Write the notes first, then add the tables.

OUTPUT FORMAT: You MUST respond with a valid JSON object containing these fields:
{
  "summary": "Brief 1-2 sentence description of what this document contains",
  "lore": [
    {
      "title": "Entry title",
      "content": "Detailed markdown content - see CONTENT RULES below",
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
      "content": "The rule itself, in full, as markdown - every number, branch and option. See CONTENT RULES below",
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
    ? `- Extract ALL TABLES **in addition to** the notes: Random tables, encounter tables, loot tables, oracles, miss/consequence tables. A table never replaces the note that explains it - whatever a table is about (a region's encounters, a faction's rumours, a dungeon's rooms) also gets a lore or mechanic note describing it in prose.

TABLE SHAPE - these tables get rolled on by a dice engine that picks exactly ONE entry at random, so shape them accordingly:
  - ONE TABLE PER ROLL. If the source has several separate d6 lists under one heading (e.g. six different background questions, each with its own 1-6 answers), that is SIX tables, not one. Merging them produces a table that answers a random question, which is useless. Split them.
  - The table's identity goes in "name" and "description" - the question, the heading, what you roll it for and when. Never in the entries.
  - "text" is the RESULT ALONE, exactly as written in the source. Do NOT prefix it with the roll number ("3: ..."), the question, or an abbreviation of the question. "Nothing." is correct; "Miss least? 2: Nothing." is wrong twice over.
  - Quote results verbatim. Do not paraphrase, shorten, or re-word them - these are the words the game shows the player.
  - "weight" is the probability weight: use the size of the entry's die range (1-10 on a d100 table = weight 10), or 1 when every result is equally likely.
  - Never emit a table with an empty "entries" array. If you don't have room to write its results, leave the table out entirely and write it on a later round instead.`
    : ""
}
${
  focusAll || focus.includes("characters")
    ? "- Extract ALL CHARACTERS: NPCs, monsters, important figures. Include stats if available."
    : ""
}

CONTENT RULES:

WRITE THE RULES DOWN, DON'T SUMMARIZE THEM. These notes are handed to a Game Master who has never seen the source document and cannot look anything up - the note IS the rule now. A note that names a rule without stating it ("Success at a Cost: choose from Feed the Beast, Collateral Damage, Mask Slips, Flesh and Bone") is a failed extraction, because nobody can run the game from it. That same rule written properly lists each option AND what each one does to the character.
- Reproduce every number, threshold, die size, cost, modifier, cap and range exactly as the source states it.
- Reproduce every branch in full. If a move has strong hit / weak hit / miss outcomes, all three get written out. If an outcome offers a choice of four consequences, all four get written out with their individual effects.
- When a rule names another rule, meter, chapter or move, keep that cross-reference in the text.
- Preserve distinctive rules language and terms of art verbatim - the source's own names for things are what the GM and player will say at the table.
- Length follows the source. A dense two-page subsystem becomes a long note; a one-line clarification stays short. Never compress a rule to fit an imagined length limit.

FORMAT NOTES AS MARKDOWN. Plain run-on paragraphs are unreadable at the table and bury the rule the GM is looking for.
- Use "## " sub-headings to separate the parts of a longer note.
- Use bullet lists for outcome branches, options, costs, steps and tables of effects.
- Use **bold** for the terms being defined - move names, outcome tiers, meter names, keywords.
- Use short paragraphs for prose and flavour. Keep the source's own paragraph breaks.

- Each lore entry should be 2-4 paragraphs of rich detail
- Use descriptive folder names for organization (Characters, Locations, Items, Factions, History, Bestiary, etc.)
- If a character, place, or thing is referred to by more than one name in the text (a nickname, title, alias, alternate spelling, or shortened form - e.g. "Bob" for "Robert the Blacksmith", or "the Sunken Temple" for "Vashti's Sanctum"), list those other names in "aliases" so mentions of them can also be recognized. Leave "aliases" as [] when there's only the one name.
- For each lore entry, list any other named NPCs/characters and locations it's connected to (mentioned in the text, allied/opposed to, located at, etc.) in "relatedCharacters"/"relatedLocations" - use the same name you'd use for that entry's own title elsewhere, so entries can be cross-referenced. Leave either as [] if none apply.
- Give each lore entry a few short "keys" - single words or short phrases (not sentences) a player or GM would plausibly say that should bring this note to mind later (a name, a place, a distinctive item or event). Leave as [] if nothing stands out.
- Mark secret/hidden information with "secrtet": true
- For tables, estimate reasonable min/max ranges if not explicitly stated
- NEVER return "customTables" alongside an empty "lore" and "mechanicNotes". If the source is nothing but tables, the notes are still required: write them from what the tables tell you - what each table is for and when it's rolled, the place/faction/creatures its entries describe, and the setting details buried in its headers, intro text and results.
- One note per topic. Prefer several focused notes over one note covering a whole chapter - a note is retrieved and shown on its own, so it has to stand alone.
- If you are running out of output room, write FEWER notes at full fidelity rather than more notes as one-line summaries. Whatever you leave out, a later round will pick up; what you compress is lost for good.

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

DETECTED CONTENT TYPE: ${contentType} (a hint about the source material, not a restriction on what to extract - notes are required whatever this says)

${
  extractedTables.length > 0
    ? `PRE-EXTRACTED TABLES (${extractedTables.length} found) - these are given so you don't have to retype them, NOT a sign that tables are the main output. The notes are still the primary deliverable:\n${JSON.stringify(extractedTables.slice(0, 5), null, 2)}\n\n`
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

/**
 * Prompt for the round that recovers the notes from a part that came back as
 * tables and nothing else.
 *
 * Table-heavy source material (a rulebook appendix, a page of random tables)
 * reliably pulls models into filling `customTables` and calling it done, even
 * though the notes are what the game engine actually reads during play. When
 * that happens the tables are kept and this asks for the notes alone.
 */
function buildNotesRecoveryPrompt(
  basePrompt: string,
  collected: ExtractedContent,
): string {
  return `${basePrompt}

=== NOTES STILL MISSING ===

Your previous response for this part extracted tables but no notes. The tables below are already saved - do NOT output them again.

ALREADY EXTRACTED TABLES:
${titleList(collected.customTables.map((table) => table.name))}

Tables are a supplement; the notes are the primary output and this part has none yet. Output the SAME JSON format with "customTables": [] and fill in "lore" and "mechanicNotes" for this part of the document:
1. What each table above is for, when it gets rolled, and how to read its results - these belong in "mechanicNotes".
2. The world content the tables and the surrounding text describe - the places, factions, creatures, items and events named in the table titles, intro text and individual entries - as "lore" entries.
3. Anything in this part that isn't a table at all: prose, headers, sidebars, captions.
Write real notes with substance, not one-line restatements of the table names.`;
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

/** Notes (lore + mechanics) collected so far - the primary output. */
function notesCount(collected: ExtractedContent): number {
  return collected.lore.length + collected.mechanicNotes.length;
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

  const customTables: CustomTable[] = (parsed.customTables || [])
    .map((table: any, index: number) => ({
      id: `table-ocr-${Date.now()}-${index}`,
      name: typeof table.name === "string" ? table.name.trim() : `Table ${index + 1}`,
      description: table.description || "",
      entries: (table.entries || [])
        .map((entry: any) => {
          const raw = entry.text || entry.result || "";
          const text = typeof raw === "string" ? raw.trim() : "";
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
        })
        .filter((entry: { text: string }) => entry.text.length > 0),
    }))
    // Drop table shells. Models routinely emit a named table and then run out
    // of room (or just never fill it) before writing any results, and an
    // empty table is unrollable - it can only ever be dead weight in the
    // user's library. The streaming preview already filtered these; the
    // committed result did not, so the shells were what actually got saved.
    .filter((table: CustomTable) => table.name.length > 0 && table.entries.length > 0);

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
