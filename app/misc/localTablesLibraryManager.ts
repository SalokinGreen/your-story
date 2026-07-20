/**
 * Local Tables Library Manager
 *
 * Persistent, cross-story collection of random/loot tables (manually built or
 * OCR-derived from PDFs). Stored in IndexedDB, independent of any single
 * story/adventure - mirrors localNotesLibraryManager.ts so tables can be
 * organized (folders, tags) and brought into a story the same way notes are.
 */

import { CustomTable, CustomTableEntry } from "./structs";

const DB_NAME = "YourStoryTablesLibraryDB";
const STORE_NAME = "tables_library";
const DB_VERSION = 1;

export interface LibraryTable {
  id: string;
  name: string;
  description: string;
  entries: CustomTableEntry[];
  tags: string[];
  folderId?: string;
  pinned?: boolean;
  source: "manual" | "ocr";
  sourceFile?: string;
  createdAt: string;
  updatedAt: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      reject("Database error: " + (event.target as IDBOpenDBRequest).error);
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, {
          keyPath: "id",
        });
        objectStore.createIndex("folderId", "folderId", { unique: false });
        objectStore.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
  });
}

function generateId(): string {
  return `table_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create and save a new library table
 */
export async function createLibraryTable(
  table: Omit<LibraryTable, "id" | "createdAt" | "updatedAt">,
): Promise<LibraryTable> {
  const now = new Date().toISOString();
  const newTable: LibraryTable = {
    ...table,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(newTable);

    request.onsuccess = () => resolve(newTable);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save (insert or overwrite) a library table as-is
 */
export async function saveLibraryTable(
  table: LibraryTable,
): Promise<LibraryTable> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(table);

    request.onsuccess = () => resolve(table);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get a specific library table by ID
 */
export async function getLibraryTable(
  tableId: string,
): Promise<LibraryTable | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(tableId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * List all library tables, sorted by updatedAt (newest first)
 */
export async function listLibraryTables(): Promise<LibraryTable[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const tables = (request.result as LibraryTable[]).sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      resolve(tables);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Update an existing library table (partial update, bumps updatedAt)
 */
export async function updateLibraryTable(
  tableId: string,
  updates: Partial<Omit<LibraryTable, "id" | "createdAt">>,
): Promise<LibraryTable | undefined> {
  const existing = await getLibraryTable(tableId);
  if (!existing) return undefined;

  const updated: LibraryTable = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  return saveLibraryTable(updated);
}

/**
 * Convert a library table into a per-story custom table, tagged with
 * libraryTableId so it stays linked back to the library.
 */
export function libraryTableToCustomTable(table: LibraryTable): CustomTable {
  return {
    id: `table-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name: table.name,
    description: table.description,
    entries: table.entries,
    libraryTableId: table.id,
  };
}

/**
 * Build the library-table fields from a story custom table, for saving a
 * story-authored table into the global library.
 */
export function customTableToLibraryTableFields(
  table: CustomTable,
): Omit<LibraryTable, "id" | "createdAt" | "updatedAt"> {
  return {
    name: table.name,
    description: table.description,
    entries: table.entries,
    tags: [],
    folderId: undefined,
    pinned: false,
    source: "manual",
  };
}

/**
 * Delete a library table by ID
 */
export async function deleteLibraryTable(tableId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(tableId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete multiple library tables by ID
 */
export async function bulkDeleteLibraryTables(
  tableIds: string[],
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    for (const id of tableIds) {
      store.delete(id);
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Move multiple library tables to a folder (or unfile them if folderId is undefined)
 */
export async function bulkMoveLibraryTables(
  tableIds: string[],
  folderId: string | undefined,
): Promise<void> {
  const db = await openDB();
  const now = new Date().toISOString();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    for (const id of tableIds) {
      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const table = getRequest.result as LibraryTable | undefined;
        if (table) {
          table.folderId = folderId;
          table.updatedAt = now;
          store.put(table);
        }
      };
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Clear folderId on every table that references a given folder.
 * Used when a shared LocalFolder is deleted (from any tab) so tables
 * become uncategorized instead of pointing at a dangling folder id.
 */
export async function unassignFolderFromTables(folderId: string): Promise<void> {
  const db = await openDB();
  const now = new Date().toISOString();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("folderId");
    const request = index.openCursor(IDBKeyRange.only(folderId));

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        const table = cursor.value as LibraryTable;
        table.folderId = undefined;
        table.updatedAt = now;
        cursor.update(table);
        cursor.continue();
      }
    };
    request.onerror = () => reject(request.error);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
