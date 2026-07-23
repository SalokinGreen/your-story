/**
 * Fuzzy matching utility for finding best match between AI-provided names
 * and actual game state names (stats, resources, items, etc.)
 */

/**
 * Calculates similarity score between two strings (0-1, where 1 is perfect match)
 * Uses a combination of:
 * - Exact match (highest priority)
 * - Case-insensitive match
 * - Word overlap (how many words from search appear in target)
 * - Character overlap (Jaccard similarity)
 */
export function calculateSimilarity(search: string, target: string): number {
  const searchLower = search.toLowerCase().trim();
  const targetLower = target.toLowerCase().trim();

  // Exact match (case-insensitive)
  if (searchLower === targetLower) return 1.0;

  // Normalize: remove special characters and extra spaces
  const normalizeStr = (s: string) =>
    s
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const searchNorm = normalizeStr(searchLower);
  const targetNorm = normalizeStr(targetLower);

  // Check if search is a substring of target
  if (targetNorm.includes(searchNorm)) {
    // Longer substring match = better score
    return 0.8 + 0.2 * (searchNorm.length / targetNorm.length);
  }

  // Split into words
  const searchWords = searchNorm.split(" ");
  const targetWords = targetNorm.split(" ");

  // Word overlap score
  const matchingWords = searchWords.filter((word) =>
    targetWords.some((tw) => tw.includes(word) || word.includes(tw))
  );
  const wordScore = matchingWords.length / Math.max(searchWords.length, 1);

  // Character-level Jaccard similarity
  const searchChars = new Set(searchNorm.replace(/\s/g, ""));
  const targetChars = new Set(targetNorm.replace(/\s/g, ""));
  const intersection = new Set(
    [...searchChars].filter((c) => targetChars.has(c))
  );
  const union = new Set([...searchChars, ...targetChars]);
  const charScore = intersection.size / Math.max(union.size, 1);

  // Weighted combination: prioritize word matches over character matches
  return wordScore * 0.7 + charScore * 0.3;
}

export interface FuzzyMatchResult<T> {
  item: T;
  name: string;
  score: number;
  isExact: boolean;
}

/**
 * Finds the best fuzzy match for a search string among a list of items
 * @param searchName - The name to search for (from AI output)
 * @param items - Array of items to search through
 * @param getNameFn - Function to extract the name from each item
 * @param threshold - Minimum similarity score (0-1) to consider a match. Default: 0.5
 * @returns Best matching item with score, or null if no match above threshold
 */
export function findBestMatch<T>(
  searchName: string | undefined,
  items: T[],
  getNameFn: (item: T) => string,
  threshold: number = 0.5
): FuzzyMatchResult<T> | null {
  if (!searchName || !items.length) return null;

  let bestMatch: FuzzyMatchResult<T> | null = null;

  for (const item of items) {
    const itemName = getNameFn(item);
    const score = calculateSimilarity(searchName, itemName);

    if (score >= threshold && (!bestMatch || score > bestMatch.score)) {
      bestMatch = {
        item,
        name: itemName,
        score,
        isExact: score === 1.0,
      };
    }
  }

  return bestMatch;
}

/**
 * Convenience function for matching stats by name
 */
export function findStatMatch(
  searchName: string | undefined,
  stats: Array<{ name: string; value: number; [key: string]: any }>
) {
  return findBestMatch(searchName, stats, (stat) => stat.name, 0.6);
}

/**
 * Convenience function for matching resources by name
 */
export function findResourceMatch(
  searchName: string | undefined,
  resources: Array<{
    name: string;
    value: number;
    maxValue: number;
    [key: string]: any;
  }>
) {
  return findBestMatch(searchName, resources, (resource) => resource.name, 0.6);
}

/**
 * Convenience function for matching inventory items by name
 */
export function findItemMatch(
  searchName: string | undefined,
  inventory: Array<{ name: string; quantity: number; [key: string]: any }>
) {
  return findBestMatch(searchName, inventory, (item) => item.name, 0.5);
}

/**
 * Convenience function for matching goals by title
 */
export function findGoalMatch(
  searchTitle: string | undefined,
  goals: Array<{ title: string; [key: string]: any }>
) {
  return findBestMatch(searchTitle, goals, (goal) => goal.title, 0.6);
}

/**
 * Convenience function for matching relationships by name
 */
export function findRelationshipMatch(
  searchName: string | undefined,
  relationships: Array<{ name: string; [key: string]: any }>
) {
  return findBestMatch(
    searchName,
    relationships,
    (relationship) => relationship.name,
    0.6
  );
}

/**
 * Convenience function for matching lore by title
 */
export function findLoreMatch(
  searchTitle: string | undefined,
  lore: Array<{ title: string; [key: string]: any }>
) {
  return findBestMatch(searchTitle, lore, (loreEntry) => loreEntry.title, 0.6);
}

/**
 * Convenience function for matching abilities by name
 */
export function findAbilityMatch(
  searchName: string | undefined,
  abilities: Array<{ name: string; [key: string]: any }>
) {
  return findBestMatch(searchName, abilities, (ability) => ability.name, 0.6);
}
