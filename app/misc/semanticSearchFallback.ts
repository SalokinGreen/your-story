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

export async function semanticSearchFallback(
  kind: "memory" | "lore",
  query: string,
  context: SemanticSearchContext
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
    return {
      status: "ok",
      matches: rawMatches.map((m) => ({
        key: m.entry_key,
        content: m.content,
        similarity: m.similarity,
      })),
    };
  } catch (error: unknown) {
    // A real degradation - the caller still has its "no literal matches"
    // result to fall back to, but this is no longer indistinguishable from
    // "searched semantically and found nothing".
    const message = error instanceof Error ? error.message : "Unknown error";
    return { status: "error", matches: [], message };
  }
}

