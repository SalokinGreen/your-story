import { Adventure, StoryData } from "./structs";

const DB_NAME = "YourStoryDB";
const STORE_NAME = "local_stories";
const DB_VERSION = 2; // Bumped for sync metadata

// NOTE: Storage limits are not enforced currently since stories are just text.
// If storage becomes an issue, consider limiting to N most recent stories
// or implementing LRU eviction. For now, let IndexedDB manage its own quota.

export type SyncStatus = "synced" | "pending" | "conflict" | "local-only";

export interface LocalStory {
  id: string;
  title: string;
  preview: string;
  updatedAt: Date;
  storyData: StoryData;
  folder_id?: string | null;
  // Sync metadata
  syncStatus: SyncStatus;
  serverUpdatedAt?: string; // ISO timestamp from server
  lastSyncedAt?: Date; // When we last synced with server
  lastLocalEditAt?: Date; // When user last made a local edit (this session)
  deviceId?: string; // To track which device made the edit
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
      const oldVersion = event.oldVersion;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        objectStore.createIndex("updatedAt", "updatedAt", { unique: false });
        objectStore.createIndex("syncStatus", "syncStatus", { unique: false });
      } else if (oldVersion < 2) {
        // Migration: add syncStatus index for existing stores
        const transaction = (event.target as IDBOpenDBRequest).transaction;
        if (transaction) {
          const store = transaction.objectStore(STORE_NAME);
          if (!store.indexNames.contains("syncStatus")) {
            store.createIndex("syncStatus", "syncStatus", { unique: false });
          }
        }
      }
    };
  });
}

// Get or create a device ID for this browser
function getDeviceId(): string {
  const key = "yourStory_deviceId";
  let deviceId = localStorage.getItem(key);
  if (!deviceId) {
    deviceId = `device_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 9)}`;
    localStorage.setItem(key, deviceId);
  }
  return deviceId;
}

export async function saveLocalStory(
  storyId: string,
  storyData: StoryData,
  folderId?: string | null,
  options?: {
    serverUpdatedAt?: string;
    markAsSynced?: boolean;
    isLocalEdit?: boolean;
  },
): Promise<void> {
  const db = await openDB();
  return new Promise(async (resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    // Get existing story to preserve metadata
    let existing: LocalStory | undefined;
    const existingRequest = store.get(storyId);
    await new Promise<void>((res) => {
      existingRequest.onsuccess = () => {
        existing = existingRequest.result as LocalStory | undefined;
        res();
      };
      existingRequest.onerror = () => res();
    });

    const isLocalOnly = storyId.startsWith("local_");
    const now = new Date();

    // Determine sync status
    let syncStatus: SyncStatus =
      existing?.syncStatus || (isLocalOnly ? "local-only" : "synced");
    if (options?.markAsSynced) {
      syncStatus = "synced";
    } else if (options?.isLocalEdit && !isLocalOnly) {
      // If this is a local edit to an online story, mark as pending sync
      syncStatus = "pending";
    }

    const story: LocalStory = {
      id: storyId,
      title: storyData.story_name || "Untitled Story",
      preview:
        storyData.scene.parts[
          storyData.scene.parts.length - 1
        ]?.content.substring(0, 100) + "..." || "",
      updatedAt: now,
      storyData: storyData,
      folder_id: folderId !== undefined ? folderId : existing?.folder_id,
      // Sync metadata
      syncStatus,
      serverUpdatedAt: options?.serverUpdatedAt || existing?.serverUpdatedAt,
      lastSyncedAt: options?.markAsSynced ? now : existing?.lastSyncedAt,
      lastLocalEditAt: options?.isLocalEdit ? now : existing?.lastLocalEditAt,
      deviceId: getDeviceId(),
    };

    const request = store.put(story);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Creates a new local story from an adventure's story template and returns
 * the new story's local ID. This is the entry point for "playing" an
 * adventure - the app is fully local now, so every new story starts local.
 */
export async function startAdventureLocally(
  adventure: Partial<Adventure>,
  playerName: string = "Player",
): Promise<string> {
  const localId = `local_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 9)}`;

  const defaultUserNotes =
    typeof window !== "undefined"
      ? localStorage.getItem("defaultUserNotes") || ""
      : "";

  const newStoryData = {
    ...adventure.storyTemplate,
    story_name: `${adventure.title || "Adventure"} - ${new Date().toLocaleDateString()}`,
    player_name: playerName,
    starting_choices: adventure.startingChoices,
    player_notes:
      defaultUserNotes || adventure.storyTemplate?.player_notes || "",
    level: 1,
    upgradesSpent: 0,
    characterSheetTemplate: adventure.characterSheetTemplate,
  } as unknown as StoryData;

  await saveLocalStory(localId, newStoryData);

  return localId;
}

export async function getLocalStory(
  storyId: string,
): Promise<LocalStory | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(storyId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listLocalStories(): Promise<LocalStory[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("updatedAt");
    const request = index.openCursor(null, "prev");
    const stories: LocalStory[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        stories.push(cursor.value);
        cursor.continue();
      } else {
        resolve(stories);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteLocalStory(storyId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(storyId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Check if local story was recently edited on this device (within last 30 seconds)
// Used to determine if auto-sync should overwrite local data
export function wasRecentlyEditedLocally(localStory: LocalStory): boolean {
  if (!localStory.lastLocalEditAt) return false;
  const thirtySecondsAgo = Date.now() - 30 * 1000;
  return new Date(localStory.lastLocalEditAt).getTime() > thirtySecondsAgo;
}

// Check if local story was edited on this device
export function wasEditedOnThisDevice(localStory: LocalStory): boolean {
  return localStory.deviceId === getDeviceId();
}

// Determine sync action based on local and server timestamps
export type SyncAction = "none" | "download" | "upload" | "conflict";

export function determineSyncAction(
  localStory: LocalStory | undefined,
  serverUpdatedAt: string | undefined,
): SyncAction {
  // No local copy - download from server
  if (!localStory) return "download";

  // Local-only story - no sync needed
  if (localStory.syncStatus === "local-only") return "none";

  // No server timestamp to compare
  if (!serverUpdatedAt) return "none";

  const localTime = new Date(localStory.updatedAt).getTime();
  const serverTime = new Date(serverUpdatedAt).getTime();

  // Already synced and times match (within 1 second tolerance)
  if (Math.abs(localTime - serverTime) < 1000) return "none";

  // Server is newer
  if (serverTime > localTime) {
    // But if we just edited locally on this device, it's a conflict
    if (
      wasRecentlyEditedLocally(localStory) &&
      wasEditedOnThisDevice(localStory)
    ) {
      return "conflict";
    }
    return "download";
  }

  // Local is newer - check if it was us who edited
  if (wasEditedOnThisDevice(localStory)) {
    // We made the edit, safe to upload (auto-sync)
    return "upload";
  }

  // Local is newer but different device - conflict
  return "conflict";
}

// Update sync status for a story
export async function updateSyncStatus(
  storyId: string,
  syncStatus: SyncStatus,
  serverUpdatedAt?: string,
): Promise<void> {
  const db = await openDB();
  return new Promise(async (resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const getRequest = store.get(storyId);
    getRequest.onsuccess = () => {
      const story = getRequest.result as LocalStory | undefined;
      if (!story) {
        resolve();
        return;
      }

      story.syncStatus = syncStatus;
      if (serverUpdatedAt) {
        story.serverUpdatedAt = serverUpdatedAt;
      }
      if (syncStatus === "synced") {
        story.lastSyncedAt = new Date();
      }

      const putRequest = store.put(story);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

// Get stories that need syncing
export async function getStoriesNeedingSync(): Promise<LocalStory[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const stories = request.result as LocalStory[];
      const needingSync = stories.filter(
        (s) => s.syncStatus === "pending" || s.syncStatus === "conflict",
      );
      resolve(needingSync);
    };
    request.onerror = () => reject(request.error);
  });
}
