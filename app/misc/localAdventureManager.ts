import { Adventure, StoryData } from "./structs";

const ADVENTURE_DB_NAME = "YourStoryAdventuresDB";
const ADVENTURE_STORE_NAME = "local_adventures";
const ADVENTURE_DB_VERSION = 2; // Bumped for sync metadata

export type AdventureSyncStatus = "synced" | "pending" | "local-only";

export interface LocalAdventure {
  id: string;
  title: string;
  description: string;
  updatedAt: Date;
  adventureData: Partial<Adventure>;
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
      } else if (oldVersion < 2) {
        // Migration: add syncStatus index for existing stores
        const transaction = (event.target as IDBOpenDBRequest).transaction;
        if (transaction) {
          const store = transaction.objectStore(ADVENTURE_STORE_NAME);
          if (!store.indexNames.contains("syncStatus")) {
            store.createIndex("syncStatus", "syncStatus", { unique: false });
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
      updatedAt: now,
      adventureData: adventure,
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

/**
 * Cache multiple adventures from the server for offline access
 * Only updates adventures that are newer on the server or don't exist locally
 */
export async function cacheAdventuresFromServer(
  adventures: Adventure[]
): Promise<void> {
  if (adventures.length === 0) return;

  const db = await openDB();
  const transaction = db.transaction([ADVENTURE_STORE_NAME], "readwrite");
  const store = transaction.objectStore(ADVENTURE_STORE_NAME);

  // Get all existing local adventures first
  const existingMap = new Map<string, LocalAdventure>();
  const getAllRequest = store.getAll();

  await new Promise<void>((resolve) => {
    getAllRequest.onsuccess = () => {
      const existing = getAllRequest.result as LocalAdventure[];
      for (const adv of existing) {
        existingMap.set(adv.id, adv);
      }
      resolve();
    };
    getAllRequest.onerror = () => resolve();
  });

  // Process each adventure
  const now = new Date();
  const putPromises: Promise<void>[] = [];

  for (const adventure of adventures) {
    const existing = existingMap.get(adventure.id);
    const serverUpdatedAt =
      adventure.updatedAt instanceof Date
        ? adventure.updatedAt.toISOString()
        : adventure.updatedAt;

    // Skip if local version is newer or same (and not local-only)
    if (existing && existing.syncStatus !== "local-only") {
      const existingServerTime = existing.serverUpdatedAt
        ? new Date(existing.serverUpdatedAt).getTime()
        : 0;
      const newServerTime = serverUpdatedAt
        ? new Date(serverUpdatedAt).getTime()
        : 0;

      // Skip if server version is same or older
      if (existingServerTime >= newServerTime) {
        continue;
      }
    }

    // Don't overwrite local-only adventures with server data
    if (existing?.syncStatus === "local-only") {
      continue;
    }

    const localAdventure: LocalAdventure = {
      id: adventure.id,
      title: adventure.title || "Untitled Adventure",
      description: adventure.shortDescription || "",
      updatedAt: now,
      adventureData: adventure,
      syncStatus: "synced",
      serverUpdatedAt,
      lastSyncedAt: now,
    };

    putPromises.push(
      new Promise<void>((resolve, reject) => {
        const putRequest = store.put(localAdventure);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      })
    );
  }

  await Promise.all(putPromises);
}
