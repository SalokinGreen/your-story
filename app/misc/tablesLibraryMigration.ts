/**
 * One-time migration of the Tables Library into the Notes Library.
 *
 * Random tables used to be their own kind of thing everywhere, including in
 * the cross-story library, which meant a separate IndexedDB store, a separate
 * tab, a separate picker list and a separate export format - all for material
 * the GM now reads as a note. This walks the old tables store, writes each
 * table into the notes library as a `type: "table"` note, and deletes the
 * original so the migration doesn't run against it again.
 *
 * It's safe to call on every library load: once the tables store is empty
 * there's nothing to move and it returns 0 immediately.
 */

import {
  createLibraryNote,
  listLibraryNotes,
} from "./localNotesLibraryManager";
import {
  deleteLibraryTable,
  libraryTableToCustomTable,
  listLibraryTables,
  LibraryTable,
} from "./localTablesLibraryManager";
import { customTableToNote } from "./tableNotes";

/**
 * True once a note already stands in for this table. Guards the window where
 * a note was written but deleting the table afterwards failed - re-running
 * then finishes the delete instead of writing a duplicate note.
 */
function alreadyMigrated(
  existingTitles: Set<string>,
  table: LibraryTable
): boolean {
  return existingTitles.has((table.name || "").trim().toLowerCase());
}

/**
 * Moves every table in the old library into the notes library.
 * Returns how many were converted.
 */
export async function migrateTablesLibraryToNotes(): Promise<number> {
  let tables: LibraryTable[];
  try {
    tables = await listLibraryTables();
  } catch {
    // No tables store (a browser that never had one) - nothing to migrate.
    return 0;
  }
  if (tables.length === 0) return 0;

  const existingTitles = new Set(
    (await listLibraryNotes()).map((note) => (note.title || "").trim().toLowerCase())
  );

  let migrated = 0;
  for (const table of tables) {
    try {
      if (!alreadyMigrated(existingTitles, table)) {
        // Round-trip through the same renderer the in-story migration uses,
        // so a table reads identically whether it came from a save, an
        // adventure or the library.
        const note = customTableToNote(libraryTableToCustomTable(table));
        await createLibraryNote({
          title: note.title,
          content: note.content,
          type: "table",
          tags: table.tags || [],
          folderId: table.folderId,
          pinned: table.pinned,
          source: table.source,
          sourceFile: table.sourceFile,
          relatedCharacters: [],
          relatedLocations: [],
          keys: note.keys || [],
        });
        existingTitles.add((table.name || "").trim().toLowerCase());
        migrated++;
      }
      await deleteLibraryTable(table.id);
    } catch (e) {
      // Leave this table in place and keep going - a single bad record
      // shouldn't strand the rest of the library in the old store.
      console.error("Failed to migrate library table:", table.name, e);
    }
  }

  return migrated;
}
