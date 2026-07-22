/**
 * Layer 4 hardening: a dedicated LLM pass that decides what's worth
 * persisting to storyData.memory after each turn, taking that judgment call
 * off the GM's own tool-calling loop entirely - the GM no longer has
 * add_memory in its live tool set (see ai_staged.ts's stateToolNames);
 * this agent is now the sole writer. Same rationale as observer.ts: a
 * focused, single-purpose pass instead of one more thing competing for the
 * GM's attention mid-generation.
 *
 * Runs once per accepted turn, from generation.ts's generateStoryTurn
 * wrapper, AFTER the observer has already settled on a final, non-reset
 * result - so memory is never written about narration that gets discarded.
 *
 * Complementary to, not overlapping with, reflection.ts: this pass decides
 * what raw facts from THIS turn are worth keeping; reflection.ts later
 * synthesizes higher-level insights from clusters of already-stored raw
 * memories. Same fetch("/api/generate") pattern as reflection.ts's
 * callReflectionApi - non-streaming, caller-supplied model, fails non-fatal
 * (an API failure just means no memory gets written this turn, never blocks
 * the turn itself).
 *
 * Retrieval is untouched by this change - the GM still calls search_memory
 * on demand, preserving this codebase's existing "agentic retrieval, not
 * automatic pre-fetch" decision (see generation.ts's Stage 0 comment).
 */

import { StoryData } from "./structs";
import { countNameMentions } from "./compaction";
import { getCustomModelIfUUID } from "./user_settings";

// Mirrors the guidance the GM's own add_memory tool used to carry
// (toolSchemas.ts) - kept in sync in spirit, not literally imported, since
// this is now a standalone prompt rather than a tool description.
const SYSTEM_PROMPT = `You are the memory-curation layer for an interactive story's AI game master. Read one completed turn (the player's action and the GM's narration) and decide what, if anything, is worth persisting as a long-term memory fact.

Only extract SHORT, ACTIONABLE facts that might matter later:
- Promises/debts ("Owes the blacksmith 50 gold")
- Codes/passwords ("Vault password: MOONRISE")
- Deadlines ("Must reach the temple by dawn")
- Quick facts ("The mayor's daughter is kidnapped")
- Plot clues ("The killer has a limp")

NEVER extract atmosphere, physical descriptions, or story summaries - only facts that will matter mechanically or narratively later. Most turns produce ZERO memories - that is normal and expected, not a failure. Each entry must be 1-2 sentences MAX. Rate each entry's importance 0-10 - higher only for facts that will clearly matter later (a debt, a deadline, a betrayal); most facts are mid-importance.

Respond with ONLY a JSON array, no other text. Return an empty array if nothing is worth remembering:
[{"content": "...", "importance": 7}, ...]`;

const MAX_ENTRIES_PER_TURN = 3;

export interface MemoryAgentApiOptions {
  model: string;
  token: string | null;
  openRouterKey?: string;
  deepseekKey?: string;
  googleKey?: string;
  mistralKey?: string;
  deepinfraKey?: string;
  abortSignal?: AbortSignal;
  /** Optional override from layerSettings.ts's memory keeper model/effort override - unset preserves prior behavior of never sending this field. */
  reasoningEffort?: string;
}

export interface MemoryAgentResult {
  ran: boolean;
  entriesAdded: number;
}

interface CandidateMemory {
  content: string;
  importance?: number;
}

/** Strips a ```json ... ``` fence if present and parses the first [...] array. */
function extractCandidates(content: string): CandidateMemory[] {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : content;
  const arrayMatch = candidate.match(/\[[\s\S]*\]/);
  if (!arrayMatch) return [];

  try {
    const parsed = JSON.parse(arrayMatch[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is CandidateMemory =>
          !!e && typeof e.content === "string" && e.content.trim().length > 0
      )
      .map((e) => ({
        content: e.content.trim(),
        importance:
          typeof e.importance === "number" && !isNaN(e.importance)
            ? Math.max(0, Math.min(10, e.importance))
            : undefined,
      }));
  } catch {
    return [];
  }
}

async function callMemoryAgentApi(
  narration: string,
  playerChoice: string,
  apiOptions: MemoryAgentApiOptions
): Promise<CandidateMemory[] | null> {
  const user = `Player's action:\n"""\n${
    playerChoice.trim() || "(none - opening scene)"
  }\n"""\n\nGM's narration:\n"""\n${narration.trim()}\n"""`;

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiOptions.token}`,
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: user },
        ],
        model: apiOptions.model,
        maxTokens: 300,
        temperature: 0.3,
        openRouterKey: apiOptions.openRouterKey,
        deepseekKey: apiOptions.deepseekKey,
        googleKey: apiOptions.googleKey,
        mistralKey: apiOptions.mistralKey,
        deepinfraKey: apiOptions.deepinfraKey,
        customModel: getCustomModelIfUUID(apiOptions.model),
        reasoningEffort: apiOptions.reasoningEffort,
      }),
      signal: apiOptions.abortSignal,
    });

    if (!response.ok) return null;

    const data = await response.json();
    const content = (data.content || "").trim();
    if (!content) return [];

    return extractCandidates(content);
  } catch {
    return null;
  }
}

/**
 * Same exact-name-matching approach compaction.ts's dropped-entity check
 * (and the old inline add_memory tool handler) already use - a lightweight
 * version of Generative Agents' entity-relevance scoring, not NLP-style
 * extraction.
 */
function computeEntityIds(
  storyData: StoryData,
  entry: string
): string[] | undefined {
  const entityIds: string[] = [];
  for (const npc of storyData.npcs || []) {
    if (npc.name && countNameMentions(entry, npc.name) > 0) {
      entityIds.push(npc.name);
    }
  }
  for (const thread of storyData.threads || []) {
    if (thread.title && countNameMentions(entry, thread.title) > 0) {
      entityIds.push(thread.title);
    }
  }
  return entityIds.length > 0 ? entityIds : undefined;
}

/**
 * Reviews the just-finished turn and appends any worthwhile facts to
 * storyData.memory in place. Safe to call every turn - fails non-fatal on
 * any API error (no memory written, never blocks the turn), and is itself a
 * no-op when the narration is empty.
 */
export async function runMemoryAgent(
  storyData: StoryData,
  narration: string,
  playerChoice: string,
  apiOptions: MemoryAgentApiOptions
): Promise<MemoryAgentResult> {
  if (!narration.trim()) return { ran: false, entriesAdded: 0 };

  const candidates = await callMemoryAgentApi(narration, playerChoice, apiOptions);
  if (candidates === null) return { ran: false, entriesAdded: 0 };
  if (candidates.length === 0) return { ran: true, entriesAdded: 0 };

  if (!storyData.memory) storyData.memory = [];
  const sceneIndex = storyData.scene.parts.length;
  const now = Date.now();

  let entriesAdded = 0;
  for (const candidate of candidates.slice(0, MAX_ENTRIES_PER_TURN)) {
    storyData.memory.push({
      content: candidate.content,
      embedded: false,
      timestamp: now,
      sceneIndex,
      entityIds: computeEntityIds(storyData, candidate.content),
      importance: candidate.importance,
    });
    entriesAdded++;
  }

  return { ran: true, entriesAdded };
}
