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
 * Failure here is always non-fatal: if embeddings aren't configured for
 * this story, or the search API errors, callers just fall back to "no
 * matches found" exactly as before this existed.
 */

import { searchRelevantContext } from "./embeddings";

export interface SemanticSearchContext {
  storyId?: string;
  token?: string;
  enabled?: boolean; // options.enableEmbeddings - off by default (requires an embeddings API key)
}

export interface SemanticMatch {
  key: string; // lore title or memory content excerpt
  content: string;
  similarity: number;
}

export async function semanticSearchFallback(
  kind: "memory" | "lore",
  query: string,
  context: SemanticSearchContext
): Promise<SemanticMatch[]> {
  if (!context.enabled || !context.storyId || !context.token || !query.trim()) {
    return [];
  }

  try {
    const result = await searchRelevantContext(
      context.storyId,
      query,
      context.token,
      kind === "lore" ? { loreLimit: 5, memoryLimit: 0 } : { loreLimit: 0, memoryLimit: 5 }
    );
    const matches = kind === "lore" ? result.lore : result.memories;
    return matches.map((m) => ({
      key: m.entry_key,
      content: m.content,
      similarity: m.similarity,
    }));
  } catch {
    // Non-fatal - the caller already has a "no literal matches" result to
    // fall back to, this is strictly a bonus on top of that.
    return [];
  }
}
