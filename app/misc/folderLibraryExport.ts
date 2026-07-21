/**
 * Folder Library Export/Import Utilities
 *
 * Exports a library folder (and a chosen subset of the data types filed
 * into it - stories, notes, tables) to a single .folder file, and imports
 * that bundle back in as a brand-new folder. Mirrors notesLibraryExport.ts
 * / tablesLibraryExport.ts, but bundles multiple data types together since
 * folders are shared across all of them.
 */

import { StoryData } from "./structs";
import { LocalStory } from "./localStoryManager";
import { LibraryNote } from "./localNotesLibraryManager";
import { LibraryTable } from "./localTablesLibraryManager";
import { ExportedLibraryNote, prepareNotesForExport } from "./notesLibraryExport";
import { ExportedLibraryTable, prepareTablesForExport } from "./tablesLibraryExport";

// ============================================
// TYPES
// ============================================

export interface FolderLibraryExport {
  /** Format version for migration support */
  version: 1;
  /** Export timestamp */
  exportedAt: string;
  /** The folder's own metadata (name/icon/color, no id) */
  folder: { name: string; icon: string; color: string };
  /** Present only when stories were included in the export */
  stories?: ExportedFolderStory[];
  /** Present only when notes were included in the export */
  notes?: ExportedLibraryNote[];
  /** Present only when tables were included in the export */
  tables?: ExportedLibraryTable[];
}

/** A story stripped of local-only IDs/sync metadata - just the save data itself */
export interface ExportedFolderStory {
  storyData: StoryData;
}

export interface FolderExportSelection {
  stories?: LocalStory[];
  notes?: LibraryNote[];
  tables?: LibraryTable[];
}

// ============================================
// EXPORT
// ============================================

export function prepareFolderForExport(
  folder: { name: string; icon: string; color: string },
  data: FolderExportSelection,
): FolderLibraryExport {
  const exportData: FolderLibraryExport = {
    version: 1,
    exportedAt: new Date().toISOString(),
    folder: { name: folder.name, icon: folder.icon, color: folder.color },
  };

  if (data.stories) {
    exportData.stories = data.stories.map((s) => ({ storyData: s.storyData }));
  }
  if (data.notes) {
    exportData.notes = prepareNotesForExport(data.notes).notes;
  }
  if (data.tables) {
    exportData.tables = prepareTablesForExport(data.tables).tables;
  }

  return exportData;
}

/**
 * Download a folder (and the selected data types filed into it) as a
 * .folder file.
 */
export function downloadFolderLibrary(
  folder: { name: string; icon: string; color: string },
  data: FolderExportSelection,
  filename?: string,
): void {
  const exportData = prepareFolderForExport(folder, data);
  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const safeName =
    filename ||
    folder.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) ||
    `folder-${new Date().toISOString().slice(0, 10)}`;

  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}.folder`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================
// IMPORT
// ============================================

export interface FolderImportResult {
  success: boolean;
  folder?: { name: string; icon: string; color: string };
  stories?: ExportedFolderStory[];
  notes?: ExportedLibraryNote[];
  tables?: ExportedLibraryTable[];
  error?: string;
  warnings: string[];
}

function defaultExportedNote(
  raw: Partial<ExportedLibraryNote>,
  index: number,
  warnings: string[],
): ExportedLibraryNote {
  if (!raw.title) {
    warnings.push(`Note #${index + 1} has no title, defaulting to "Untitled"`);
  }
  return {
    title: raw.title || "Untitled",
    content: raw.content || "",
    type: raw.type || "lore",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    pinned: !!raw.pinned,
    source: raw.source === "ocr" ? "ocr" : "manual",
    sourceFile: raw.sourceFile,
    relatedCharacters: Array.isArray(raw.relatedCharacters) ? raw.relatedCharacters : [],
    relatedLocations: Array.isArray(raw.relatedLocations) ? raw.relatedLocations : [],
    keys: Array.isArray(raw.keys) ? raw.keys : [],
  };
}

function defaultExportedTable(
  raw: Partial<ExportedLibraryTable>,
  index: number,
  warnings: string[],
): ExportedLibraryTable {
  if (!raw.name) {
    warnings.push(`Table #${index + 1} has no name, defaulting to "Untitled"`);
  }
  return {
    name: raw.name || "Untitled",
    description: raw.description || "",
    entries: Array.isArray(raw.entries) ? raw.entries : [],
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    pinned: !!raw.pinned,
    source: raw.source === "ocr" ? "ocr" : "manual",
    sourceFile: raw.sourceFile,
  };
}

/**
 * Parse and validate a folder library file
 */
export function parseFolderLibraryFile(content: string): FolderImportResult {
  const warnings: string[] = [];

  try {
    const data = JSON.parse(content);

    if (!data.version) {
      return { success: false, error: "Invalid folder file: missing version", warnings };
    }
    if (data.version !== 1) {
      warnings.push(`Folder file version ${data.version} may not be fully compatible`);
    }
    if (!data.folder || typeof data.folder.name !== "string") {
      return { success: false, error: "Invalid folder file: missing folder metadata", warnings };
    }

    const result: FolderImportResult = {
      success: true,
      folder: {
        name: data.folder.name || "Imported Folder",
        icon: data.folder.icon || "Folder",
        color: data.folder.color || "#9333ea",
      },
      warnings,
    };

    if (Array.isArray(data.stories)) {
      const stories = data.stories
        .filter((raw: Partial<ExportedFolderStory>) => !!raw.storyData)
        .map((raw: Partial<ExportedFolderStory>) => ({
          storyData: raw.storyData as StoryData,
        }));
      if (stories.length !== data.stories.length) {
        warnings.push("Some stories in the file were missing data and were skipped");
      }
      result.stories = stories;
    }

    if (Array.isArray(data.notes)) {
      result.notes = data.notes.map(
        (raw: Partial<ExportedLibraryNote>, index: number) =>
          defaultExportedNote(raw, index, warnings),
      );
    }

    if (Array.isArray(data.tables)) {
      result.tables = data.tables.map(
        (raw: Partial<ExportedLibraryTable>, index: number) =>
          defaultExportedTable(raw, index, warnings),
      );
    }

    if (!result.stories?.length && !result.notes?.length && !result.tables?.length) {
      warnings.push("Folder file contains no stories, notes, or tables");
    }

    return result;
  } catch (e) {
    return {
      success: false,
      error: `Failed to parse folder file: ${e instanceof Error ? e.message : "Unknown error"}`,
      warnings,
    };
  }
}

/**
 * Read a .folder file from a File input
 */
export async function readFolderLibraryFile(file: File): Promise<FolderImportResult> {
  return new Promise((resolve) => {
    if (!file.name.endsWith(".folder") && !file.name.endsWith(".json")) {
      resolve({
        success: false,
        error: "Invalid file type. Expected .folder or .json file",
        warnings: [],
      });
      return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) {
        resolve({ success: false, error: "Failed to read file content", warnings: [] });
        return;
      }
      resolve(parseFolderLibraryFile(content));
    };

    reader.onerror = () => {
      resolve({ success: false, error: "Failed to read file", warnings: [] });
    };

    reader.readAsText(file);
  });
}
