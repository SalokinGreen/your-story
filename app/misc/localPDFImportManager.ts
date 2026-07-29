/**
 * Local PDF Import Manager
 * 
 * Stores PDF imports in IndexedDB for reliable offline-first storage.
 * Much larger storage limits than localStorage (~5MB vs hundreds of MB).
 */

import { CustomTable, StoryLore } from "./structs";
import { migrateCustomTablesToNotes } from "./tableNotes";

const DB_NAME = "YourStoryPDFImportsDB";
const STORE_NAME = "pdf_imports";
const PROGRESS_STORE_NAME = "pdf_import_progress";
const DB_VERSION = 2;

// Keep imports for 90 days
const IMPORT_EXPIRATION_DAYS = 90;

// A stalled in-progress import older than this is treated as abandoned
// (e.g. the tab was closed and never came back) rather than resumable.
const IN_PROGRESS_EXPIRATION_DAYS = 7;

// Fixed key: only one chunked PDF import can be actively running at a time
// (the importer processes files sequentially), so there's never more than
// one in-progress record to track.
const PROGRESS_ID = "current";

// A page range that didn't make it into the import (OCR or note-extraction
// failed for it), recorded so the player knows which pages to rework/retry
// rather than silently missing content.
export interface FailedPageRange {
  fileName: string;
  pageStart: number;
  pageEnd: number;
  reason: string;
}

export interface LocalPDFImport {
  id: string;
  timestamp: number;
  fileName: string;
  lore: StoryLore[];
  mechanicNotes: StoryLore[];
  /** Random tables, as `type: "table"` notes (see tableNotes.ts). */
  tableNotes: StoryLore[];
  summary: string;
  failedPages?: FailedPageRange[];
  /**
   * @deprecated Records written before tables became notes. Read on load and
   * converted into `tableNotes`; never written.
   */
  customTables?: CustomTable[];
}

/**
 * Records saved before the extractor stopped producing structured tables
 * carry them in `customTables` and have no `tableNotes` at all. Everything
 * that reads a stored import goes through this, so the rest of the app only
 * ever sees notes.
 */
function withTableNotes<T extends { tableNotes?: StoryLore[]; customTables?: CustomTable[] }>(
  record: T,
): T & { tableNotes: StoryLore[] } {
  // `?? []` rather than a plain read: the stored record predates the field
  // whenever it carries `customTables`, whatever its declared type says.
  const tableNotes = record.tableNotes ?? [];
  const migrated = migrateCustomTablesToNotes(tableNotes, record.customTables);
  return { ...record, tableNotes: migrated ?? tableNotes };
}

// Per-chunk state persisted for resuming an interrupted chunked import.
// Only terminal outcomes are tracked ("pending" covers both "not started"
// and "was mid-flight when we got interrupted" - both simply get redone).
export interface PersistedChunkStatus {
  chunkIndex: number;
  pageStart: number;
  pageEnd: number;
  status: "pending" | "complete" | "failed";
  ocrMarkdown?: string;
  error?: string;
  result?: {
    lore: StoryLore[];
    mechanicNotes: StoryLore[];
    // Filled in by `withTableNotes` on the way out for records written
    // before tables were notes, so readers never see it missing.
    tableNotes: StoryLore[];
    /** @deprecated Pre-table-notes records - converted on load. */
    customTables?: CustomTable[];
  };
}

// The importer settings in effect when the interrupted job was started, so
// resuming reuses the same model/instructions rather than whatever the form
// happens to default to.
export interface InProgressPDFImportSettings {
  aiModel: string;
  customModelProvider: string;
  customModelId: string;
  customInstructions: string;
  maxOutputTokens: number;
  /**
   * Optional: records written before this setting existed don't carry it,
   * and resuming one of those just falls back to the default.
   */
  maxContinuationRounds?: number;
}

export interface InProgressPDFImport {
  id: string;
  timestamp: number;
  fileName: string;
  // Original source PDF bytes, kept so a resume can re-run OCR for any
  // chunk that wasn't finished without asking the user to re-upload.
  fileBytes: ArrayBuffer;
  chunkStatuses: PersistedChunkStatus[];
  settings: InProgressPDFImportSettings;
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
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        objectStore.createIndex("timestamp", "timestamp", { unique: false });
      }

      if (!db.objectStoreNames.contains(PROGRESS_STORE_NAME)) {
        db.createObjectStore(PROGRESS_STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

/**
 * Save (or overwrite) the current in-progress chunked import, so it can be
 * recovered if the page reloads or crashes before the import finishes.
 * Called incrementally as chunks complete, not just once at the end.
 */
export async function saveImportInProgress(
  progress: Omit<InProgressPDFImport, "id" | "timestamp">,
): Promise<void> {
  const db = await openDB();
  const record: InProgressPDFImport = {
    id: PROGRESS_ID,
    timestamp: Date.now(),
    ...progress,
  };
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([PROGRESS_STORE_NAME], "readwrite");
    transaction.objectStore(PROGRESS_STORE_NAME).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Get the current in-progress import, if any. Automatically discards (and
 * returns undefined for) a stalled record older than
 * IN_PROGRESS_EXPIRATION_DAYS, since that's almost certainly an abandoned
 * job rather than one worth resuming.
 */
export async function getImportInProgress(): Promise<
  InProgressPDFImport | undefined
> {
  const db = await openDB();
  const record = await new Promise<InProgressPDFImport | undefined>(
    (resolve, reject) => {
      const transaction = db.transaction([PROGRESS_STORE_NAME], "readonly");
      const request = transaction.objectStore(PROGRESS_STORE_NAME).get(PROGRESS_ID);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    },
  );

  if (!record) return undefined;

  const expirationTime =
    Date.now() - IN_PROGRESS_EXPIRATION_DAYS * 24 * 60 * 60 * 1000;
  if (record.timestamp < expirationTime) {
    await clearImportInProgress();
    return undefined;
  }

  return {
    ...record,
    chunkStatuses: record.chunkStatuses.map((cs) =>
      cs.result ? { ...cs, result: withTableNotes(cs.result) } : cs,
    ),
  };
}

/** Discard the in-progress import record (job finished or user cancelled it). */
export async function clearImportInProgress(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([PROGRESS_STORE_NAME], "readwrite");
    transaction.objectStore(PROGRESS_STORE_NAME).delete(PROGRESS_ID);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Save a PDF import to IndexedDB
 */
export async function savePDFImport(
  data: {
    lore: StoryLore[];
    mechanicNotes: StoryLore[];
    tableNotes: StoryLore[];
    summary: string;
    failedPages?: FailedPageRange[];
  },
  fileName: string
): Promise<LocalPDFImport> {
  const db = await openDB();

  const newImport: LocalPDFImport = {
    id: `import-${Date.now()}`,
    timestamp: Date.now(),
    fileName,
    lore: data.lore,
    mechanicNotes: data.mechanicNotes,
    tableNotes: data.tableNotes,
    summary: data.summary,
    failedPages: data.failedPages,
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(newImport);

    request.onsuccess = () => resolve(newImport);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get a specific PDF import by ID
 */
export async function getPDFImport(
  importId: string
): Promise<LocalPDFImport | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(importId);

    request.onsuccess = () =>
      resolve(request.result ? withTableNotes(request.result) : undefined);
    request.onerror = () => reject(request.error);
  });
}

/**
 * List all PDF imports, sorted by timestamp (newest first)
 * Automatically cleans up expired imports (older than 90 days)
 */
export async function listPDFImports(): Promise<LocalPDFImport[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("timestamp");
    const request = index.openCursor(null, "prev");
    const imports: LocalPDFImport[] = [];
    const expiredIds: string[] = [];
    const expirationTime = Date.now() - IMPORT_EXPIRATION_DAYS * 24 * 60 * 60 * 1000;

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        const imp = cursor.value as LocalPDFImport;
        if (imp.timestamp < expirationTime) {
          // Mark for deletion
          expiredIds.push(imp.id);
        } else {
          imports.push(withTableNotes(imp));
        }
        cursor.continue();
      } else {
        // Clean up expired imports
        if (expiredIds.length > 0) {
          for (const id of expiredIds) {
            store.delete(id);
          }
          console.log(`Cleaned up ${expiredIds.length} expired PDF imports`);
        }
        resolve(imports);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete a PDF import by ID
 */
export async function deletePDFImport(importId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(importId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Migrate data from localStorage to IndexedDB (one-time migration)
 * Call this on app startup to preserve existing saved imports
 */
export async function migrateFromLocalStorage(): Promise<number> {
  const LEGACY_KEY = "pdf-imports-cache";
  
  try {
    const saved = localStorage.getItem(LEGACY_KEY);
    if (!saved) return 0;
    
    const parsed = JSON.parse(saved) as LocalPDFImport[];
    if (!Array.isArray(parsed) || parsed.length === 0) return 0;
    
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    
    let migrated = 0;
    for (const imp of parsed) {
      // Check if already exists
      const existing = await new Promise<LocalPDFImport | undefined>((resolve) => {
        const req = store.get(imp.id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(undefined);
      });
      
      if (!existing) {
        await new Promise<void>((resolve, reject) => {
          const req = store.put(imp);
          req.onsuccess = () => { migrated++; resolve(); };
          req.onerror = () => reject(req.error);
        });
      }
    }
    
    // Clear localStorage after successful migration
    if (migrated > 0) {
      localStorage.removeItem(LEGACY_KEY);
      console.log(`Migrated ${migrated} PDF imports from localStorage to IndexedDB`);
    }
    
    return migrated;
  } catch (e) {
    console.warn("Failed to migrate PDF imports from localStorage:", e);
    return 0;
  }
}
