/**
 * Adventure Export/Import Utilities
 *
 * Exports adventures to .adventure files (JSON with custom extension)
 * and imports them back into the system.
 */

import { Adventure, StoryData } from "./structs";

// ============================================
// TYPES
// ============================================

export interface AdventureExport {
  /** Format version for migration support */
  version: 1;
  /** Export timestamp */
  exportedAt: string;
  /** The adventure data (sanitized for export) */
  adventure: ExportedAdventure;
}

/** Adventure data without database IDs or author info */
export interface ExportedAdventure {
  title: string;
  description: string;
  shortDescription: string;
  thumbnailUrl?: string;
  bannerUrl?: string;
  tags: string[];
  difficulty: "easy" | "medium" | "hard" | "expert";
  estimatedDuration: string;
  nsfw: boolean;
  storyTemplate: Partial<StoryData>;
  presets?: Adventure["presets"];
  startingChoices?: Adventure["startingChoices"];
}

// ============================================
// EXPORT
// ============================================

/**
 * Convert an Adventure to an exportable format
 * Strips database IDs, author info, and metadata
 */
export function prepareAdventureForExport(
  adventure: Adventure
): AdventureExport {
  const exported: ExportedAdventure = {
    title: adventure.title,
    description: adventure.description,
    shortDescription: adventure.shortDescription,
    tags: adventure.tags,
    difficulty: adventure.difficulty,
    estimatedDuration: adventure.estimatedDuration,
    nsfw: adventure.nsfw,
    storyTemplate: sanitizeStoryTemplate(adventure.storyTemplate),
    presets: adventure.presets,
    startingChoices: adventure.startingChoices,
  };

  // Only include URLs if they're not local/blob URLs
  if (
    adventure.thumbnailUrl &&
    !adventure.thumbnailUrl.startsWith("blob:") &&
    !adventure.thumbnailUrl.startsWith("data:")
  ) {
    exported.thumbnailUrl = adventure.thumbnailUrl;
  }
  if (
    adventure.bannerUrl &&
    !adventure.bannerUrl.startsWith("blob:") &&
    !adventure.bannerUrl.startsWith("data:")
  ) {
    exported.bannerUrl = adventure.bannerUrl;
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    adventure: exported,
  };
}

/**
 * Clean up story template for export
 * Removes runtime state that shouldn't be exported
 */
function sanitizeStoryTemplate(
  template: Partial<StoryData>
): Partial<StoryData> {
  const sanitized = { ...template };

  // Remove runtime state
  delete sanitized.memory;
  delete sanitized.conditions;
  delete sanitized.activeChallenge;
  delete sanitized.restState;
  delete sanitized.agmtState;
  delete sanitized.gameOver;

  // Clear scene to fresh state
  if (sanitized.scene) {
    sanitized.scene = {
      ...sanitized.scene,
      parts: [], // Clear story progress
    };
  }

  // Reset resources to max values
  if (sanitized.resources) {
    sanitized.resources = sanitized.resources.map((r) => ({
      ...r,
      value: r.maxValue,
    }));
  }

  // Reset ability cooldowns
  if (sanitized.abilities) {
    sanitized.abilities = sanitized.abilities.map((a) => ({
      ...a,
      currentCooldown: 0,
    }));
  }

  // Reset lore state
  if (sanitized.lore) {
    sanitized.lore = sanitized.lore.map((l) => ({
      ...l,
      on: l.alwaysOn ? true : undefined,
      lastTriggeredIndex: undefined,
      embedded: undefined,
    }));
  }

  // Clear threads progress
  if (sanitized.threads) {
    sanitized.threads = sanitized.threads.map((t) => ({
      ...t,
      status: "active" as const,
    }));
  }

  // Reset quests
  if (sanitized.quests) {
    sanitized.quests = sanitized.quests.map((q) => ({
      ...q,
      active: q.active,
      fulfilled: false,
    }));
  }

  // Reset achievements
  if (sanitized.achievements) {
    sanitized.achievements = sanitized.achievements.map((a) => ({
      ...a,
      dateAchieved: null,
    }));
  }

  // Reset relationships to starting values
  // (Keep as-is, authors should set initial values)

  return sanitized;
}

/**
 * Download an adventure as a .adventure file
 */
export function downloadAdventure(adventure: Adventure): void {
  const exportData = prepareAdventureForExport(adventure);
  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  // Create filename from title
  const safeTitle = adventure.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);

  const filename = `${safeTitle}.adventure`;

  // Trigger download
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================
// IMPORT
// ============================================

export interface ImportResult {
  success: boolean;
  adventure?: ExportedAdventure;
  error?: string;
  warnings: string[];
}

/**
 * Parse and validate an adventure file
 */
export function parseAdventureFile(content: string): ImportResult {
  const warnings: string[] = [];

  try {
    const data = JSON.parse(content);

    // Check version
    if (!data.version) {
      return {
        success: false,
        error: "Invalid adventure file: missing version",
        warnings,
      };
    }

    if (data.version !== 1) {
      warnings.push(
        `Adventure file version ${data.version} may not be fully compatible`
      );
    }

    // Validate adventure data
    if (!data.adventure) {
      return {
        success: false,
        error: "Invalid adventure file: missing adventure data",
        warnings,
      };
    }

    const adventure = data.adventure as ExportedAdventure;

    // Required fields
    if (!adventure.title) {
      return {
        success: false,
        error: "Invalid adventure file: missing title",
        warnings,
      };
    }

    if (!adventure.storyTemplate) {
      return {
        success: false,
        error: "Invalid adventure file: missing story template",
        warnings,
      };
    }

    // Default missing optional fields
    if (!adventure.description) {
      adventure.description = "";
      warnings.push("Adventure has no description");
    }

    if (!adventure.shortDescription) {
      adventure.shortDescription = adventure.description.slice(0, 200);
    }

    if (!adventure.tags) {
      adventure.tags = [];
    }

    if (!adventure.difficulty) {
      adventure.difficulty = "medium";
      warnings.push("Difficulty defaulted to 'medium'");
    }

    if (!adventure.estimatedDuration) {
      adventure.estimatedDuration = "Unknown";
    }

    if (adventure.nsfw === undefined) {
      adventure.nsfw = false;
    }

    return {
      success: true,
      adventure,
      warnings,
    };
  } catch (e) {
    return {
      success: false,
      error: `Failed to parse adventure file: ${e instanceof Error ? e.message : "Unknown error"}`,
      warnings,
    };
  }
}

/**
 * Read a .adventure file from a File input
 */
export async function readAdventureFile(file: File): Promise<ImportResult> {
  return new Promise((resolve) => {
    // Validate file extension
    if (!file.name.endsWith(".adventure") && !file.name.endsWith(".json")) {
      resolve({
        success: false,
        error: "Invalid file type. Expected .adventure or .json file",
        warnings: [],
      });
      return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) {
        resolve({
          success: false,
          error: "Failed to read file content",
          warnings: [],
        });
        return;
      }

      resolve(parseAdventureFile(content));
    };

    reader.onerror = () => {
      resolve({
        success: false,
        error: "Failed to read file",
        warnings: [],
      });
    };

    reader.readAsText(file);
  });
}

/**
 * Convert an imported adventure to a new Adventure object
 * (ready to be saved to database)
 */
export function importedToAdventure(
  imported: ExportedAdventure,
  authorId: string,
  authorName: string
): Omit<Adventure, "id" | "createdAt" | "updatedAt"> {
  return {
    title: imported.title,
    description: imported.description,
    shortDescription: imported.shortDescription,
    author: authorName,
    authorId,
    thumbnailUrl: imported.thumbnailUrl,
    bannerUrl: imported.bannerUrl,
    tags: imported.tags,
    difficulty: imported.difficulty,
    visibility: "private", // Always start as private
    estimatedDuration: imported.estimatedDuration,
    popularity: 0,
    playCount: 0,
    isPublished: false,
    isFeatured: false,
    nsfw: imported.nsfw,
    storyTemplate: imported.storyTemplate,
    presets: imported.presets,
    startingChoices: imported.startingChoices,
  };
}
