// Local-only store of the pictures made in play (docs/image-generation-design.md
// §5, decision 59). A picture is 100-200 KB even after compression, and
// StoryData is one IndexedDB record that is rewritten on every save, copied
// into the undo stack, cloned by every GM round, sent whole to online guests
// and pushed as one encrypted blob to a 25 MiB-capped sync store. So the bytes
// live here, in their own database, and StoryData holds only ids. This is the
// same precedent ttsAudioCache.ts set for voice audio, for the same reason.
//
// Nothing here syncs: a picture stays on the device that made it, and another
// device shows a placeholder with Regenerate.

import type { ImageSubject, StoryData } from "./structs";
import type { ImageProvider } from "./imageProvider";

const DB_NAME = "YourStoryImages";
const STORE_NAME = "images";
const DB_VERSION = 1;

export interface StoredImage {
  /** Also the id of the job that made it. Created in the job, never during render. */
  id: string;
  storyId: string;
  /** WebP after compression (the original bytes where the WebView cannot compress). */
  blob: Blob;
  mime: string;
  width: number;
  height: number;
  subject: ImageSubject;
  /** The final provider prompt, kept so Regenerate can run it again. */
  prompt: string;
  provider: ImageProvider;
  /** The catalog key of the model that painted it. */
  model: string;
  costUsd: number;
  createdAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("storyId", "storyId", { unique: false });
      }
    };
  });
}

export async function saveImage(img: StoredImage): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], "readwrite");
      tx.objectStore(STORE_NAME).put(img);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function getImage(id: string): Promise<StoredImage | null> {
  const db = await openDB();
  try {
    return await new Promise<StoredImage | null>((resolve, reject) => {
      const request = db
        .transaction([STORE_NAME], "readonly")
        .objectStore(STORE_NAME)
        .get(id);
      request.onsuccess = () =>
        resolve((request.result as StoredImage | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function imagesForStory(
  db: IDBDatabase,
  storyId: string,
): Promise<StoredImage[]> {
  return new Promise<StoredImage[]>((resolve, reject) => {
    const request = db
      .transaction([STORE_NAME], "readonly")
      .objectStore(STORE_NAME)
      .index("storyId")
      .getAll(IDBKeyRange.only(storyId));
    request.onsuccess = () => resolve(request.result as StoredImage[]);
    request.onerror = () => reject(request.error);
  });
}

async function deleteIds(db: IDBDatabase, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], "readwrite");
    const store = tx.objectStore(STORE_NAME);
    for (const id of ids) store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Deletes every picture of a story - called when the story itself is deleted. */
export async function deleteImagesForStory(storyId: string): Promise<void> {
  const db = await openDB();
  try {
    const all = await imagesForStory(db, storyId);
    await deleteIds(
      db,
      all.map((i) => i.id),
    );
  } finally {
    db.close();
  }
}

/** Deletes one picture (Replace / Regenerate on a card). */
export async function deleteImage(id: string): Promise<void> {
  const db = await openDB();
  try {
    await deleteIds(db, [id]);
  } finally {
    db.close();
  }
}

/**
 * Deletes the story's pictures that nothing in StoryData points to any more
 * (an undone or retried turn leaves some). Returns how many went.
 */
export async function deleteOrphans(
  storyId: string,
  keep: Set<string>,
): Promise<number> {
  const db = await openDB();
  try {
    const all = await imagesForStory(db, storyId);
    const orphans = all.filter((i) => !keep.has(i.id)).map((i) => i.id);
    await deleteIds(db, orphans);
    return orphans.length;
  } finally {
    db.close();
  }
}

/** Bytes the story's pictures take, for Settings -> Images. */
export async function storyImageBytes(storyId: string): Promise<number> {
  const db = await openDB();
  try {
    const all = await imagesForStory(db, storyId);
    return all.reduce((sum, i) => sum + (i.blob?.size ?? 0), 0);
  } finally {
    db.close();
  }
}

/** Every picture id StoryData points to: scene parts, NPCs, notes and the player. */
export function collectImageIds(storyData: StoryData): Set<string> {
  const ids = new Set<string>();
  for (const part of storyData.scene?.parts ?? []) {
    for (const ref of part.images ?? []) ids.add(ref.imageId);
  }
  for (const npc of storyData.npcs ?? []) {
    if (npc.portraitImageId) ids.add(npc.portraitImageId);
  }
  for (const note of storyData.lore ?? []) {
    if (note.imageId) ids.add(note.imageId);
  }
  if (storyData.playerPortraitImageId) ids.add(storyData.playerPortraitImageId);
  return ids;
}

/** A data: URI as a Blob, without a network round trip. */
export function dataUriToBlob(dataUri: string): Blob {
  const comma = dataUri.indexOf(",");
  const header = dataUri.slice(5, comma); // after "data:"
  const mime = header.split(";")[0] || "application/octet-stream";
  const body = dataUri.slice(comma + 1);
  if (header.includes(";base64")) {
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(body)], { type: mime });
}

/** A Blob as a data: URI (reference pictures go to the provider this way). */
export async function blobToDataUri(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
}
