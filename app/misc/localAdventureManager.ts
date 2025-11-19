import { Adventure, StoryData } from "./structs";

const DB_NAME = "YourStoryDB";
const STORE_NAME = "local_adventures";
const DB_VERSION = 1; // Note: If sharing DB with stories, we might need to handle versioning carefully or use a different DB/Store. 
// Actually, IndexedDB versioning is global for the DB. 
// If "YourStoryDB" is already used by localStoryManager with version 1, and we want to add a new store, we need to bump version to 2.
// However, localStoryManager.ts uses version 1. 
// To avoid conflicts/complexity with upgrading the existing DB in a separate file without coordination, 
// I will use a separate DB name for adventures for simplicity, or I need to check if I can dynamically upgrade.
// Using a separate DB "YourStoryAdventuresDB" is safer to avoid breaking the existing "YourStoryDB" if the user has it open.
// BUT, ideally they should be in the same DB. 
// Let's check localStoryManager.ts content again. It opens "YourStoryDB" version 1.
// If I want to add a store, I must increase version. 
// If I change version in one file but not the other, it might cause issues if both try to open with different versions.
// For now, to be safe and isolated, I'll use a different DB name: "YourStoryAdventuresDB".

const ADVENTURE_DB_NAME = "YourStoryAdventuresDB";
const ADVENTURE_STORE_NAME = "local_adventures";
const ADVENTURE_DB_VERSION = 1;

export interface LocalAdventure {
  id: string;
  title: string;
  description: string;
  updatedAt: Date;
  adventureData: Partial<Adventure>; // Store the whole adventure object or parts of it
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
      if (!db.objectStoreNames.contains(ADVENTURE_STORE_NAME)) {
        const objectStore = db.createObjectStore(ADVENTURE_STORE_NAME, { keyPath: "id" });
        objectStore.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
  });
}

export async function saveLocalAdventure(adventureId: string, adventure: Partial<Adventure>): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ADVENTURE_STORE_NAME], "readwrite");
    const store = transaction.objectStore(ADVENTURE_STORE_NAME);

    const localAdventure: LocalAdventure = {
      id: adventureId,
      title: adventure.title || "Untitled Adventure",
      description: adventure.shortDescription || "",
      updatedAt: new Date(),
      adventureData: adventure,
    };

    const request = store.put(localAdventure);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getLocalAdventure(adventureId: string): Promise<LocalAdventure | undefined> {
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
