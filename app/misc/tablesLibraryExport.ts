/**
 * Tables Library Export/Import Utilities
 *
 * Exports library tables to .tables files (JSON with custom extension)
 * and imports them back into the tables library. Mirrors
 * notesLibraryExport.ts.
 */

import { LibraryTable } from "./localTablesLibraryManager";
import { CustomTableEntry } from "./structs";

// ============================================
// TYPES
// ============================================

export interface TablesLibraryExport {
  /** Format version for migration support */
  version: 1;
  /** Export timestamp */
  exportedAt: string;
  /** The exported tables (sanitized for export) */
  tables: ExportedLibraryTable[];
}

/** Library table without local-only IDs (table id, folder id) */
export interface ExportedLibraryTable {
  name: string;
  description: string;
  entries: CustomTableEntry[];
  tags: string[];
  pinned?: boolean;
  source: "manual" | "ocr";
  sourceFile?: string;
}

// ============================================
// EXPORT
// ============================================

/**
 * Convert library tables to an exportable format
 * Strips local-only IDs (table id, folder id)
 */
export function prepareTablesForExport(
  tables: LibraryTable[]
): TablesLibraryExport {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    tables: tables.map((table) => ({
      name: table.name,
      description: table.description,
      entries: table.entries,
      tags: table.tags,
      pinned: table.pinned,
      source: table.source,
      sourceFile: table.sourceFile,
    })),
  };
}

/**
 * Download library tables as a .tables file
 */
export function downloadLibraryTables(
  tables: LibraryTable[],
  filename?: string
): void {
  const exportData = prepareTablesForExport(tables);
  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const safeName =
    filename ||
    (tables.length === 1
      ? tables[0].name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 50)
      : `tables-library-${new Date().toISOString().slice(0, 10)}`);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}.tables`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================
// IMPORT
// ============================================

export interface TablesImportResult {
  success: boolean;
  tables?: ExportedLibraryTable[];
  error?: string;
  warnings: string[];
}

/**
 * Parse and validate a tables library file
 */
export function parseLibraryTablesFile(content: string): TablesImportResult {
  const warnings: string[] = [];

  try {
    const data = JSON.parse(content);

    if (!data.version) {
      return {
        success: false,
        error: "Invalid tables file: missing version",
        warnings,
      };
    }

    if (data.version !== 1) {
      warnings.push(
        `Tables file version ${data.version} may not be fully compatible`
      );
    }

    if (!Array.isArray(data.tables)) {
      return {
        success: false,
        error: "Invalid tables file: missing tables array",
        warnings,
      };
    }

    const tables: ExportedLibraryTable[] = data.tables.map(
      (raw: Partial<ExportedLibraryTable>, index: number) => {
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
    );

    if (tables.length === 0) {
      warnings.push("Tables file contains no tables");
    }

    return {
      success: true,
      tables,
      warnings,
    };
  } catch (e) {
    return {
      success: false,
      error: `Failed to parse tables file: ${
        e instanceof Error ? e.message : "Unknown error"
      }`,
      warnings,
    };
  }
}

/**
 * Read a .tables file from a File input
 */
export async function readLibraryTablesFile(
  file: File
): Promise<TablesImportResult> {
  return new Promise((resolve) => {
    if (!file.name.endsWith(".tables") && !file.name.endsWith(".json")) {
      resolve({
        success: false,
        error: "Invalid file type. Expected .tables or .json file",
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

      resolve(parseLibraryTablesFile(content));
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
 * Convert an imported table to a new LibraryTable-ready object
 * (fresh id/timestamps assigned by localTablesLibraryManager.createLibraryTable)
 */
export function importedToLibraryTable(
  imported: ExportedLibraryTable
): Omit<LibraryTable, "id" | "createdAt" | "updatedAt"> {
  return {
    name: imported.name,
    description: imported.description,
    entries: imported.entries,
    tags: imported.tags,
    folderId: undefined,
    pinned: imported.pinned,
    source: imported.source,
    sourceFile: imported.sourceFile,
  };
}
