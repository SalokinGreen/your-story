/**
 * Semantic-search fallback for the GM's search_memory/search_notes tools.
 *
 * Both tools are literal substring/pattern matches (deliberately - "grep
 * first" is the right default, mirroring how coding agents favor exact
 * search over embeddings for most lookups). But prose is fuzzier than code
 * identifiers: a player asking about "the tavern owner" won't hit a note
 * titled "Gregor Stonebeard". This gives those tools a semantic fallback -
 * only tried when the literal search comes up empty - using the embeddings
 * pipeline in embeddings.ts (already used for lore sync in story/page.tsx;
 * previously wired up for memory but disabled in favor of on-demand
 * agentic retrieval - see generation.ts's compaction/GM-stage comments).
 *
 * Failure here is always non-fatal in the sense that it never throws or
 * blocks the caller's own "no literal matches" fallback - but "not
 * configured for this story" (expected, most stories) and "configured but
 * the search actually failed" (a real degradation) used to collapse into
 * the same empty-array result, indistinguishable from "genuinely nothing
 * relevant was found" (H4). `semanticSearchFallback` now returns a tagged
 * result so callers can tell those apart and only surface a note to the GM
 * for the "degraded" case, not the normal "not configured"/"no matches"
 * ones.
 */

import { searchRelevantContext } from "./embeddings";
import { getMemoryContent, MemoryEntry } from "./structs";

export interface SemanticSearchContext {
  storyId?: string;
  token?: string | null;
  enabled?: boolean; // options.enableEmbeddings - off by default (requires an embeddings API key)
}

export interface SemanticMatch {
  key: string; // lore title or memory content excerpt
  content: string;
  similarity: number;
}

export type SemanticSearchOutcome =
  // Ran successfully - `matches` may still be empty (genuinely nothing
  // relevant), which is expected and not a degradation.
  | { status: "ok"; matches: SemanticMatch[] }
  // Skipped because this story has no embeddings configured, or the caller
  // passed no query - the normal, common case, not a failure.
  | { status: "not_configured"; matches: [] }
  // Attempted and failed (network/API error) - a real degradation worth
  // surfacing, distinct from "not configured" and from "ran, found nothing".
  | { status: "error"; matches: []; message: string };

// Bounded reranking nudge on top of embedding similarity - a lightweight
// version of Generative Agents' recency/importance/relevance memory
// scoring, using similarity as the "relevance" axis directly rather than
// reimplementing it. Each component is capped at +0.1 (max combined +0.3)
// so this only breaks ties/near-ties toward more recent, more important,
// or more query-relevant-by-entity memories - it never overrides a clearly
// stronger semantic match.
function computeMemoryBoost(
  entry: MemoryEntry | undefined,
  query: string,
  maxSceneIndex: number
): number {
  if (!entry) return 0;
  let boost = 0;

  if (typeof entry.sceneIndex === "number" && maxSceneIndex > 0) {
    const scenesAgo = maxSceneIndex - entry.sceneIndex;
    boost += Math.max(0, 0.1 - scenesAgo * 0.01); // fades to 0 by ~10 scenes ago
  }

  if (typeof entry.importance === "number") {
    boost += (entry.importance / 10) * 0.1;
  }

  if (entry.entityIds && entry.entityIds.length > 0) {
    const lowerQuery = query.toLowerCase();
    if (entry.entityIds.some((id) => lowerQuery.includes(id.toLowerCase()))) {
      boost += 0.1;
    }
  }

  return boost;
}

// Finds the MemoryEntry a DB-returned semantic match corresponds to, by
// exact content match - the embeddings DB doesn't store sceneIndex/
// entityIds/importance itself, so this is how those fields get back to a
// match. Matches are never truncated relative to the source content (see
// syncNewMemories, embeddings.ts), so exact string equality is reliable.
function findSourceMemoryEntry(
  content: string,
  memoryEntries: (string | MemoryEntry)[]
): MemoryEntry | undefined {
  for (const memory of memoryEntries) {
    if (typeof memory !== "string" && getMemoryContent(memory) === content) {
      return memory;
    }
  }
  return undefined;
}

export async function semanticSearchFallback(
  kind: "memory" | "lore",
  query: string,
  context: SemanticSearchContext,
  // Only used for kind === "memory" - enables reranking matches by
  // recency/importance/entity-relevance on top of embedding similarity.
  // Omit (or pass for "lore") and results are returned in similarity order
  // exactly as before.
  memoryEntries?: (string | MemoryEntry)[]
): Promise<SemanticSearchOutcome> {
  if (!context.enabled || !context.storyId || !context.token || !query.trim()) {
    return { status: "not_configured", matches: [] };
  }

  try {
    const result = await searchRelevantContext(
      context.storyId,
      query,
      context.token,
      kind === "lore" ? { loreLimit: 5, memoryLimit: 0 } : { loreLimit: 0, memoryLimit: 5 }
    );
    const rawMatches = kind === "lore" ? result.lore : result.memories;
    let matches: SemanticMatch[] = rawMatches.map((m) => ({
      key: m.entry_key,
      content: m.content,
      similarity: m.similarity,
    }));

    if (kind === "memory" && memoryEntries && memoryEntries.length > 0) {
      const sceneIndices = memoryEntries
        .map((m) => (typeof m !== "string" ? m.sceneIndex : undefined))
        .filter((n): n is number => typeof n === "number");
      const maxSceneIndex = sceneIndices.length > 0 ? Math.max(...sceneIndices) : 0;

      matches = matches
        .map((match) => {
          const sourceEntry = findSourceMemoryEntry(match.content, memoryEntries);
          const boost = computeMemoryBoost(sourceEntry, query, maxSceneIndex);
          return { match, score: match.similarity + boost };
        })
        .sort((a, b) => b.score - a.score)
        .map((scored) => scored.match);
    }

    return { status: "ok", matches };
  } catch (error: unknown) {
    // A real degradation - the caller still has its "no literal matches"
    // result to fall back to, but this is no longer indistinguishable from
    // "searched semantically and found nothing".
    const message = error instanceof Error ? error.message : "Unknown error";
    return { status: "error", matches: [], message };
  }
}

