/**
 * Local PDF Import Manager
 * 
 * Stores PDF imports in IndexedDB for reliable offline-first storage.
 * Much larger storage limits than localStorage (~5MB vs hundreds of MB).
 */

import { StoryLore, CustomTable } from "./structs";

const DB_NAME = "YourStoryPDFImportsDB";
const STORE_NAME = "pdf_imports";
const DB_VERSION = 1;

// Keep imports for 90 days
const IMPORT_EXPIRATION_DAYS = 90;

export interface LocalPDFImport {
  id: string;
  timestamp: number;
  fileName: string;
  lore: StoryLore[];
  mechanicNotes: StoryLore[];
  customTables: CustomTable[];
  summary: string;
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
    };
  });
}

/**
 * Save a PDF import to IndexedDB
 */
export async function savePDFImport(
  data: {
    lore: StoryLore[];
    mechanicNotes: StoryLore[];
    customTables: CustomTable[];
    summary: string;
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
    customTables: data.customTables,
    summary: data.summary,
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

    request.onsuccess = () => resolve(request.result);
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
          imports.push(imp);
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
