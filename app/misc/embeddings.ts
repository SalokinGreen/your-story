/**
 * Embedding utilities for semantic search of lore and memories
 * Uses Mistral's mistral-embed model (1024 dimensions)
 */

import { MemoryEntry } from "./structs";

// ============================================================================
// Types
// ============================================================================

export interface EmbeddingRecord {
  story_id: string;
  entry_type: "lore" | "memory" | "scene";
  entry_key: string;
  content: string;
  embedding: number[];
  importance?: number;
}

export interface EmbeddingSearchResult {
  entry_type: "lore" | "memory" | "scene";
  entry_key: string;
  content: string;
  similarity: number;
  importance: number;
}

export interface SearchContextResponse {
  lore: EmbeddingSearchResult[];
  memories: EmbeddingSearchResult[];
  totalResults: number;
}

export interface GenerateEmbeddingsResponse {
  embeddings: number[][];
  count: number;
}

// ============================================================================
// Configuration
// ============================================================================

export const EMBEDDING_CONFIG = {
  /** Mistral embedding model */
  model: "mistral-embed",
  /** Embedding dimension for mistral-embed */
  dimensions: 1024,
  /** Maximum texts per batch (Mistral limit is higher, but we stay safe) */
  batchSize: 50,
  /** Default similarity threshold for search */
  defaultMinSimilarity: 0.25,
  /** Default number of lore results to retrieve */
  defaultLoreLimit: 8,
  /** Default number of memory results to retrieve */
  defaultMemoryLimit: 15,
  /** Maximum context length to embed (in characters) */
  maxContextLength: 4000,
} as const;

// ============================================================================
// Client-side API functions
// ============================================================================

/**
 * Generate embeddings for a list of texts
 */
export async function generateEmbeddings(
  texts: string[]
): Promise<GenerateEmbeddingsResponse> {
  const response = await fetch("/api/embeddings/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to generate embeddings");
  }

  return response.json();
}

/**
 * Search for relevant lore and memories using embeddings
 */
export async function searchRelevantContext(
  storyId: string,
  query: string,
  authToken: string,
  options: {
    loreLimit?: number;
    memoryLimit?: number;
    minSimilarity?: number;
  } = {}
): Promise<SearchContextResponse> {
  const response = await fetch("/api/embeddings/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      storyId,
      query,
      loreLimit: options.loreLimit ?? EMBEDDING_CONFIG.defaultLoreLimit,
      memoryLimit: options.memoryLimit ?? EMBEDDING_CONFIG.defaultMemoryLimit,
      minSimilarity:
        options.minSimilarity ?? EMBEDDING_CONFIG.defaultMinSimilarity,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to search embeddings");
  }

  return response.json();
}

/**
 * Upsert embeddings for lore or memories
 */
export async function upsertEmbeddings(
  storyId: string,
  entries: Array<{
    key: string;
    content: string;
    type: "lore" | "memory";
    importance?: number;
  }>,
  authToken: string
): Promise<{ upserted: number }> {
  if (entries.length === 0) {
    return { upserted: 0 };
  }

  // 1. Generate embeddings for all content
  const texts = entries.map((e) => e.content);
  const { embeddings } = await generateEmbeddings(texts);

  // 2. Build records for upsert
  const records: EmbeddingRecord[] = entries.map((entry, i) => ({
    story_id: storyId,
    entry_type: entry.type,
    entry_key: entry.key,
    content: entry.content,
    embedding: embeddings[i],
    importance: entry.importance ?? 5,
  }));

  // 3. Upsert to database
  const response = await fetch("/api/embeddings/upsert", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ records }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to upsert embeddings");
  }

  return response.json();
}

/**
 * Get existing embedding keys for a story
 * Used to avoid re-generating embeddings for already-synced entries
 */
export async function getExistingEmbeddingKeys(
  storyId: string,
  authToken: string,
  entryType?: "lore" | "memory" | "scene"
): Promise<{ lore: string[]; memory: string[]; scene: string[] }> {
  const response = await fetch("/api/embeddings/keys", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ storyId, entryType }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch embedding keys");
  }

  const data = await response.json();
  return data.keys;
}

/**
 * Delete embeddings for entries that no longer exist
 */
export async function cleanupEmbeddings(
  storyId: string,
  entryType: "lore" | "memory",
  validKeys: string[],
  authToken: string
): Promise<{ deleted: number }> {
  const response = await fetch("/api/embeddings/cleanup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ storyId, entryType, validKeys }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to cleanup embeddings");
  }

  return response.json();
}

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Build a query string from recent story context for embedding search
 */
export function buildSearchQuery(
  userChoice: string,
  recentParts: Array<{ role: string; content: string }>,
  maxLength: number = EMBEDDING_CONFIG.maxContextLength
): string {
  // Start with user's choice
  let query = userChoice;

  // Add recent assistant responses (most recent first)
  const assistantParts = recentParts
    .filter((p) => p.role === "assistant")
    .slice(-3)
    .reverse();

  for (const part of assistantParts) {
    const addition = `\n\n${part.content}`;
    if (query.length + addition.length <= maxLength) {
      query += addition;
    } else {
      // Add partial content if it fits
      const remaining = maxLength - query.length - 2;
      if (remaining > 100) {
        query += `\n\n${part.content.slice(0, remaining)}...`;
      }
      break;
    }
  }

  return query;
}

/**
 * Calculate importance score for a memory based on content
 * Higher scores = more likely to be retrieved
 */
export function calculateMemoryImportance(content: string): number {
  let score = 5; // Base score

  // Boost for character names (capitalized words)
  const capitalizedWords = content.match(/\b[A-Z][a-z]+\b/g) || [];
  score += Math.min(capitalizedWords.length * 0.5, 2);

  // Boost for emotional/dramatic content
  const dramaticWords =
    /death|kill|love|betray|secret|curse|magic|ancient|prophecy|destiny/i;
  if (dramaticWords.test(content)) {
    score += 1;
  }

  // Boost for longer, more detailed memories
  if (content.length > 200) score += 1;
  if (content.length > 400) score += 0.5;

  // Cap at 10
  return Math.min(Math.round(score), 10);
}

/**
 * Deduplicate memories by semantic similarity
 * Returns indices of memories to keep
 */
export function deduplicateByEmbedding(
  embeddings: number[][],
  threshold: number = 0.9
): number[] {
  const keep: number[] = [];

  for (let i = 0; i < embeddings.length; i++) {
    let isDuplicate = false;

    for (const keptIdx of keep) {
      const similarity = cosineSimilarity(embeddings[i], embeddings[keptIdx]);
      if (similarity >= threshold) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      keep.push(i);
    }
  }

  return keep;
}

/**
 * Cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same length");
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dot / denominator;
}

// ============================================================================
// Embedding sync functions (for use after tool execution)
// ============================================================================

/**
 * Generate a stable hash key for memory content
 * Uses first 8 chars of content + length to create a reasonably unique key
 */
function getMemoryKey(content: string, index: number): string {
  // Use a simple hash: first 20 chars (alphanumeric only) + content length + index
  // This handles most cases while being deterministic
  const sanitized = content.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20);
  return `mem_${sanitized}_${content.length}_${index}`;
}

/**
 * Sync memories to the embedding database
 * Only embeds entries where embedded !== true
 * Returns indices of newly embedded entries so caller can mark them
 */
export async function syncNewMemories(
  storyId: string,
  memories: (string | MemoryEntry)[],
  existingKeys: Set<string>,
  authToken: string
): Promise<{
  synced: number;
  cleaned: number;
  errors: string[];
  embeddedIndices: number[];
}> {
  const errors: string[] = [];
  const embeddedIndices: number[] = [];

  // Build current memory entries with content-based keys
  const memoryEntries: Array<{
    key: string;
    content: string;
    type: "memory";
    importance?: number;
    originalIndex: number;
  }> = [];

  const validKeys: string[] = [];

  memories.forEach((memory, index) => {
    // Handle both string and MemoryEntry formats
    const content = typeof memory === "string" ? memory : memory.content;
    const isEmbedded = typeof memory === "string" ? false : memory.embedded === true;
    
    const key = getMemoryKey(content, index);
    validKeys.push(key);

    // Only generate embedding if:
    // 1. This key doesn't exist in DB, OR
    // 2. The entry is marked as not embedded (embedded !== true)
    if (!existingKeys.has(key) || !isEmbedded) {
      memoryEntries.push({
        key,
        content,
        type: "memory",
        importance: calculateMemoryImportance(content),
        originalIndex: index,
      });
    }
  });

  let synced = 0;
  let cleaned = 0;

  // Upsert new/changed memories
  if (memoryEntries.length > 0) {
    try {
      const result = await upsertEmbeddings(
        storyId,
        memoryEntries.map(({ key, content, type, importance }) => ({
          key,
          content,
          type,
          importance,
        })),
        authToken
      );
      synced = result.upserted;
      // Track which indices were successfully embedded
      memoryEntries.forEach((e) => embeddedIndices.push(e.originalIndex));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      errors.push(`Upsert failed: ${message}`);
    }
  }

  // Clean up deleted memories (keys that no longer exist)
  try {
    const cleanupResult = await cleanupEmbeddings(
      storyId,
      "memory",
      validKeys,
      authToken
    );
    cleaned = cleanupResult.deleted;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    errors.push(`Cleanup failed: ${message}`);
  }

  return { synced, cleaned, errors, embeddedIndices };
}

/**
 * Sync lore entries to the embedding database
 * Only embeds entries where embedded !== true
 * Returns titles of newly embedded entries so caller can mark them
 */
export async function syncLoreEmbeddings(
  storyId: string,
  lore: Array<{ title: string; content: string; embedded?: boolean }>,
  authToken: string
): Promise<{
  synced: number;
  cleaned: number;
  errors: string[];
  embeddedTitles: string[];
}> {
  const errors: string[] = [];
  const embeddedTitles: string[] = [];

  // Filter to only entries that need embedding (embedded !== true)
  const loreToEmbed = lore.filter((l) => l.embedded !== true);

  // Prepare lore entries for embedding
  const loreEntries = loreToEmbed.map((l) => ({
    key: l.title,
    content: `${l.title}: ${l.content}`,
    type: "lore" as const,
    importance: 7, // Lore is generally more important
  }));

  let synced = 0;
  let cleaned = 0;

  // Upsert only entries that need embedding
  if (loreEntries.length > 0) {
    try {
      const result = await upsertEmbeddings(storyId, loreEntries, authToken);
      synced = result.upserted;
      // Track which titles were successfully embedded
      loreToEmbed.forEach((l) => embeddedTitles.push(l.title));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      errors.push(`Upsert failed: ${message}`);
    }
  }

  // Clean up removed lore entries
  const validKeys = lore.map((l) => l.title);
  try {
    const cleanupResult = await cleanupEmbeddings(
      storyId,
      "lore",
      validKeys,
      authToken
    );
    cleaned = cleanupResult.deleted;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    errors.push(`Cleanup failed: ${message}`);
  }

  return { synced, cleaned, errors, embeddedTitles };
}

/**
 * Get relevant context for story generation using embeddings
 * Returns lore titles and memory contents that are semantically relevant
 */
export async function getRelevantContextForGeneration(
  storyId: string,
  userChoice: string,
  recentStoryParts: string[],
  authToken: string,
  options: {
    loreLimit?: number;
    memoryLimit?: number;
    minSimilarity?: number;
  } = {}
): Promise<{
  loreTitles: string[];
  memories: string[];
  error?: string;
}> {
  try {
    // Build query from user choice + recent story
    const query = buildSearchQuery(
      userChoice,
      recentStoryParts.map((content) => ({ role: "assistant", content }))
    );

    const results = await searchRelevantContext(storyId, query, authToken, {
      loreLimit: options.loreLimit ?? 8,
      memoryLimit: options.memoryLimit ?? 15,
      minSimilarity: options.minSimilarity ?? 0.25,
    });

    return {
      loreTitles: results.lore.map((l) => l.entry_key),
      memories: results.memories.map((m) => m.content),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Embedding search failed:", message);
    return {
      loreTitles: [],
      memories: [],
      error: message,
    };
  }
}
