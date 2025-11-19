import { StoryData } from "./structs";

const DB_NAME = "YourStoryDB";
const STORE_NAME = "local_stories";
const DB_VERSION = 1;

export interface LocalStory {
  id: string;
  title: string;
  preview: string;
  updatedAt: Date;
  storyData: StoryData;
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
        objectStore.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
  });
}

export async function saveLocalStory(storyId: string, storyData: StoryData): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const story: LocalStory = {
      id: storyId,
      title: storyData.story_name || "Untitled Story",
      preview: storyData.scene.parts[storyData.scene.parts.length - 1]?.content.substring(0, 100) + "..." || "",
      updatedAt: new Date(),
      storyData: storyData,
    };

    const request = store.put(story);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getLocalStory(storyId: string): Promise<LocalStory | undefined> {
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
