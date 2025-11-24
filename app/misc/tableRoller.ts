/**
 * Custom Table Rolling System
 *
 * Weighted random selection for creator-defined tables.
 */

import { CustomTable, CustomTableEntry } from "./structs";

/**
 * Roll on a custom table using weighted random selection
 * @returns The selected entry, or null if table is empty/invalid
 */
export function rollOnCustomTable(table: CustomTable): CustomTableEntry | null {
  if (!table.entries || table.entries.length === 0) return null;

  // Calculate total weight
  const totalWeight = table.entries.reduce(
    (sum, entry) => sum + entry.weight,
    0
  );

  if (totalWeight === 0) return null;

  // Roll random number
  const roll = Math.random() * totalWeight;

  // Find which entry the roll landed on
  let currentWeight = 0;
  for (const entry of table.entries) {
    currentWeight += entry.weight;
    if (roll < currentWeight) {
      return entry;
    }
  }

  // Fallback (shouldn't happen due to floating point precision)
  return table.entries[table.entries.length - 1];
}

/**
 * Find a table by name (case-insensitive, supports fuzzy matching)
 */
export function getTableByName(
  tables: CustomTable[],
  name: string
): CustomTable | null {
  if (!tables || tables.length === 0 || !name) return null;

  const lowerName = name.toLowerCase().trim();

  // Try exact match first
  const exactMatch = tables.find((t) => t.name.toLowerCase() === lowerName);
  if (exactMatch) return exactMatch;

  // Try partial match
  const partialMatch = tables.find(
    (t) =>
      t.name.toLowerCase().includes(lowerName) ||
      lowerName.includes(t.name.toLowerCase())
  );
  if (partialMatch) return partialMatch;

  // Try ID match
  const idMatch = tables.find((t) => t.id === name);
  return idMatch || null;
}

/**
 * Calculate percentage probability for each entry
 */
export function calculatePercentages(
  entries: CustomTableEntry[]
): (CustomTableEntry & { percentage: string })[] {
  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
  if (totalWeight === 0)
    return entries.map((e) => ({ ...e, percentage: "0.00" }));

  return entries.map((e) => ({
    ...e,
    percentage: ((e.weight / totalWeight) * 100).toFixed(2),
  }));
}
