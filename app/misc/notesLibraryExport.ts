/**
 * Notes Library Export/Import Utilities
 *
 * Exports library notes to .notes files (JSON with custom extension)
 * and imports them back into the notes library.
 */

import { LibraryNote } from "./localNotesLibraryManager";
import { LoreType } from "./structs";

// ============================================
// TYPES
// ============================================

export interface NotesLibraryExport {
  /** Format version for migration support */
  version: 1;
  /** Export timestamp */
  exportedAt: string;
  /** The exported notes (sanitized for export) */
  notes: ExportedLibraryNote[];
}

/** Library note without local-only IDs (note id, folder id) */
export interface ExportedLibraryNote {
  title: string;
  content: string;
  type: LoreType;
  tags: string[];
  pinned?: boolean;
  source: "manual" | "ocr";
  sourceFile?: string;
  relatedCharacters: string[];
  relatedLocations: string[];
  keys: string[];
}

// ============================================
// EXPORT
// ============================================

/**
 * Convert library notes to an exportable format
 * Strips local-only IDs (note id, folder id)
 */
export function prepareNotesForExport(
  notes: LibraryNote[]
): NotesLibraryExport {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    notes: notes.map((note) => ({
      title: note.title,
      content: note.content,
      type: note.type,
      tags: note.tags,
      pinned: note.pinned,
      source: note.source,
      sourceFile: note.sourceFile,
      relatedCharacters: note.relatedCharacters,
      relatedLocations: note.relatedLocations,
      keys: note.keys,
    })),
  };
}

/**
 * Download library notes as a .notes file
 */
export function downloadLibraryNotes(
  notes: LibraryNote[],
  filename?: string
): void {
  const exportData = prepareNotesForExport(notes);
  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const safeName =
    filename ||
    (notes.length === 1
      ? notes[0].title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 50)
      : `notes-library-${new Date().toISOString().slice(0, 10)}`);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}.notes`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================
// IMPORT
// ============================================

export interface NotesImportResult {
  success: boolean;
  notes?: ExportedLibraryNote[];
  error?: string;
  warnings: string[];
}

/**
 * Parse and validate a notes library file
 */
export function parseLibraryNotesFile(content: string): NotesImportResult {
  const warnings: string[] = [];

  try {
    const data = JSON.parse(content);

    if (!data.version) {
      return {
        success: false,
        error: "Invalid notes file: missing version",
        warnings,
      };
    }

    if (data.version !== 1) {
      warnings.push(
        `Notes file version ${data.version} may not be fully compatible`
      );
    }

    if (!Array.isArray(data.notes)) {
      return {
        success: false,
        error: "Invalid notes file: missing notes array",
        warnings,
      };
    }

    const notes: ExportedLibraryNote[] = data.notes.map(
      (raw: Partial<ExportedLibraryNote>, index: number) => {
        if (!raw.title) {
          warnings.push(`Note #${index + 1} has no title, defaulting to "Untitled"`);
        }
        return {
          title: raw.title || "Untitled",
          content: raw.content || "",
          type: (raw.type as LoreType) || "lore",
          tags: Array.isArray(raw.tags) ? raw.tags : [],
          pinned: !!raw.pinned,
          source: raw.source === "ocr" ? "ocr" : "manual",
          sourceFile: raw.sourceFile,
          relatedCharacters: Array.isArray(raw.relatedCharacters)
            ? raw.relatedCharacters
            : [],
          relatedLocations: Array.isArray(raw.relatedLocations)
            ? raw.relatedLocations
            : [],
          keys: Array.isArray(raw.keys) ? raw.keys : [],
        };
      }
    );

    if (notes.length === 0) {
      warnings.push("Notes file contains no notes");
    }

    return {
      success: true,
      notes,
      warnings,
    };
  } catch (e) {
    return {
      success: false,
      error: `Failed to parse notes file: ${
        e instanceof Error ? e.message : "Unknown error"
      }`,
      warnings,
    };
  }
}

/**
 * Read a .notes file from a File input
 */
export async function readLibraryNotesFile(
  file: File
): Promise<NotesImportResult> {
  return new Promise((resolve) => {
    if (!file.name.endsWith(".notes") && !file.name.endsWith(".json")) {
      resolve({
        success: false,
        error: "Invalid file type. Expected .notes or .json file",
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

      resolve(parseLibraryNotesFile(content));
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
 * Convert an imported note to a new LibraryNote-ready object
 * (fresh id/timestamps assigned by localNotesLibraryManager.createLibraryNote)
 */
export function importedToLibraryNote(
  imported: ExportedLibraryNote
): Omit<LibraryNote, "id" | "createdAt" | "updatedAt"> {
  return {
    title: imported.title,
    content: imported.content,
    type: imported.type,
    tags: imported.tags,
    folderId: undefined,
    pinned: imported.pinned,
    source: imported.source,
    sourceFile: imported.sourceFile,
    relatedCharacters: imported.relatedCharacters,
    relatedLocations: imported.relatedLocations,
    keys: imported.keys,
  };
}
