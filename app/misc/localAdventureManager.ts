import { Adventure } from "./structs";

const ADVENTURE_DB_NAME = "YourStoryAdventuresDB";
const ADVENTURE_STORE_NAME = "local_adventures";
const ADVENTURE_DB_VERSION = 3; // Bumped for folder filing

export type AdventureSyncStatus = "synced" | "pending" | "local-only";

export interface LocalAdventure {
  id: string;
  title: string;
  description: string;
  updatedAt: Date;
  adventureData: Partial<Adventure>;
  /**
   * Shared LocalFolder id, matching LocalStory.folder_id - `null` means
   * explicitly unfiled, `undefined` on records written before folders
   * reached adventures (treated the same as unfiled when reading).
   */
  folder_id?: string | null;
  // Sync metadata
  syncStatus: AdventureSyncStatus;
  serverUpdatedAt?: string; // ISO timestamp from server
  lastSyncedAt?: Date; // When we last synced with server
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ADVENTURE_DB_NAME, ADVENTURE_DB_VERSION);

    request.onerror = (event) => {
      reject("Database error: " + (event.target as IDBOpenDBRequest).error);
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;

      if (!db.objectStoreNames.contains(ADVENTURE_STORE_NAME)) {
        const objectStore = db.createObjectStore(ADVENTURE_STORE_NAME, {
          keyPath: "id",
        });
        objectStore.createIndex("updatedAt", "updatedAt", { unique: false });
        objectStore.createIndex("syncStatus", "syncStatus", { unique: false });
        objectStore.createIndex("folder_id", "folder_id", { unique: false });
      } else {
        // Migrations: add whichever indexes this device's store predates.
        // Existing records keep an absent folder_id, which reads as unfiled.
        const transaction = (event.target as IDBOpenDBRequest).transaction;
        if (transaction) {
          const store = transaction.objectStore(ADVENTURE_STORE_NAME);
          if (oldVersion < 2 && !store.indexNames.contains("syncStatus")) {
            store.createIndex("syncStatus", "syncStatus", { unique: false });
          }
          if (oldVersion < 3 && !store.indexNames.contains("folder_id")) {
            store.createIndex("folder_id", "folder_id", { unique: false });
          }
        }
      }
    };
  });
}

export async function saveLocalAdventure(
  adventureId: string,
  adventure: Partial<Adventure>,
  options?: {
    serverUpdatedAt?: string;
    markAsSynced?: boolean;
    // Overrides the stored `updatedAt` instead of stamping "now". Used by
    // syncManager.ts when writing a pulled/merged item locally, so this
    // device's copy keeps the timestamp that actually won the merge rather
    // than looking artificially newer just because it happened to sync at
    // this moment - otherwise a later, genuinely newer edit from another
    // device could lose to this device's stale content in a future merge.
    updatedAt?: Date;
    // Folder to file this adventure into. Left out entirely, the existing
    // filing is kept; an explicit `null` unfiles it. Callers that only
    // touch adventure content (the Designer's autosave) therefore can't
    // knock an adventure out of its folder by omission.
    folderId?: string | null;
  }
): Promise<void> {
  const db = await openDB();
  return new Promise(async (resolve, reject) => {
    const transaction = db.transaction([ADVENTURE_STORE_NAME], "readwrite");
    const store = transaction.objectStore(ADVENTURE_STORE_NAME);

    // Get existing adventure to preserve metadata
    let existing: LocalAdventure | undefined;
    const existingRequest = store.get(adventureId);
    await new Promise<void>((res) => {
      existingRequest.onsuccess = () => {
        existing = existingRequest.result as LocalAdventure | undefined;
        res();
      };
      existingRequest.onerror = () => res();
    });

    const isLocalOnly = adventureId.startsWith("local:");
    const now = new Date();

    // Determine sync status
    let syncStatus: AdventureSyncStatus =
      existing?.syncStatus || (isLocalOnly ? "local-only" : "synced");
    if (options?.markAsSynced) {
      syncStatus = "synced";
    }

    const localAdventure: LocalAdventure = {
      id: adventureId,
      title: adventure.title || "Untitled Adventure",
      description: adventure.shortDescription || "",
      updatedAt: options?.updatedAt ?? now,
      adventureData: adventure,
      folder_id:
        options?.folderId !== undefined ? options.folderId : existing?.folder_id,
      // Sync metadata
      syncStatus,
      serverUpdatedAt: options?.serverUpdatedAt || existing?.serverUpdatedAt,
      lastSyncedAt: options?.markAsSynced ? now : existing?.lastSyncedAt,
    };

    const request = store.put(localAdventure);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getLocalAdventure(
  adventureId: string
): Promise<LocalAdventure | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ADVENTURE_STORE_NAME], "readonly");
    const store = transaction.objectStore(ADVENTURE_STORE_NAME);
    const request = store.get(adventureId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listLocalAdventures(): Promise<LocalAdventure[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ADVENTURE_STORE_NAME], "readonly");
    const store = transaction.objectStore(ADVENTURE_STORE_NAME);
    const index = store.index("updatedAt");
    const request = index.openCursor(null, "prev");
    const adventures: LocalAdventure[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        adventures.push(cursor.value);
        cursor.continue();
      } else {
        resolve(adventures);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear folder_id on every adventure that references a given folder.
 * Used when a shared LocalFolder is deleted (from any tab) so adventures
 * become uncategorized instead of pointing at a dangling folder id.
 */
export async function unassignFolderFromAdventures(
  folderId: string
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ADVENTURE_STORE_NAME], "readwrite");
    const store = transaction.objectStore(ADVENTURE_STORE_NAME);
    const request = store.openCursor();

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        const adventure = cursor.value as LocalAdventure;
        if (adventure.folder_id === folderId) {
          adventure.folder_id = null;
          cursor.update(adventure);
        }
        cursor.continue();
      }
    };
    request.onerror = () => reject(request.error);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Move a single adventure into a folder (or unfile it with `null`) without
 * having to round-trip its adventureData through the caller.
 */
export async function moveLocalAdventure(
  adventureId: string,
  folderId: string | null
): Promise<void> {
  const existing = await getLocalAdventure(adventureId);
  if (!existing) throw new Error("Adventure not found");
  // Stamped "now" like any other write (this is what saveLocalStory does for
  // a story move): folder filing travels inside the synced payload, so a move
  // that didn't bump updatedAt would never win a merge and would silently
  // fail to reach the user's other devices.
  await saveLocalAdventure(adventureId, existing.adventureData, { folderId });
}

export async function deleteLocalAdventure(adventureId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ADVENTURE_STORE_NAME], "readwrite");
    const store = transaction.objectStore(ADVENTURE_STORE_NAME);
    const request = store.delete(adventureId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
