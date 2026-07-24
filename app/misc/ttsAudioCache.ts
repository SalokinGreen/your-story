// Local-only cache of finished TTS audio, so replaying an already-narrated
// message (navigating back to it, reloading the page, pressing Replay after
// the in-memory chunks were discarded) doesn't re-hit the TTS provider and
// re-spend the user's own Cartesia/ElevenLabs quota. Deliberately kept in a
// separate IndexedDB database from YourStoryDB (see localStoryManager.ts) so
// audio blobs never ride along with the encrypted cross-device sync payload,
// which only ever pushes StoryData itself.
//
// Bounded to the 5 most recently cached entries per story - old entries are
// evicted as new ones are added, mirroring the same "recent, local, no sync"
// treatment localStoryManager.ts already gives the undo/retry stack.

const DB_NAME = "YourStoryTTSCache";
const STORE_NAME = "tts_audio";
const DB_VERSION = 1;

export const MAX_CACHED_MESSAGES_PER_STORY = 5;

interface TTSCacheRecord {
  key: string; // `${storyId}::${hash}`
  storyId: string;
  hash: string;
  chunks: Blob[];
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
        const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
        store.createIndex("storyId", "storyId", { unique: false });
      }
    };
  });
}

// Cheap, non-cryptographic string hash (djb2) - collisions aren't a real
// concern here since a false hit just plays back the wrong (still valid)
// cached audio for one message, immediately fixable by pressing Replay.
function hashKey(text: string, voiceId: string, model: string): string {
  const input = `${model}::${voiceId}::${text}`;
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

export async function getCachedTTSAudio(
  storyId: string,
  text: string,
  voiceId: string,
  model: string,
): Promise<Blob[] | null> {
  const hash = hashKey(text, voiceId, model);
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], "readonly");
    const request = tx.objectStore(STORE_NAME).get(`${storyId}::${hash}`);
    request.onsuccess = () => {
      const record = request.result as TTSCacheRecord | undefined;
      resolve(record ? record.chunks : null);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveCachedTTSAudio(
  storyId: string,
  text: string,
  voiceId: string,
  model: string,
  chunks: Blob[],
): Promise<void> {
  if (chunks.length === 0) return;
  const hash = hashKey(text, voiceId, model);
  const db = await openDB();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], "readwrite");
    const record: TTSCacheRecord = {
      key: `${storyId}::${hash}`,
      storyId,
      hash,
      chunks,
      createdAt: Date.now(),
    };
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  await evictOldest(storyId);
}

// Keeps only the MAX_CACHED_MESSAGES_PER_STORY most recently-saved entries
// for a story, deleting anything older.
async function evictOldest(storyId: string): Promise<void> {
  const db = await openDB();
  const entries = await new Promise<TTSCacheRecord[]>((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], "readonly");
    const index = tx.objectStore(STORE_NAME).index("storyId");
    const request = index.getAll(IDBKeyRange.only(storyId));
    request.onsuccess = () => resolve(request.result as TTSCacheRecord[]);
    request.onerror = () => reject(request.error);
  });

  if (entries.length <= MAX_CACHED_MESSAGES_PER_STORY) return;

  const stale = entries
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(MAX_CACHED_MESSAGES_PER_STORY);

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], "readwrite");
    const store = tx.objectStore(STORE_NAME);
    for (const entry of stale) store.delete(entry.key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Purges all cached audio for a story - called when the story itself is
// deleted so this separate database doesn't accumulate orphaned entries.
export async function clearCachedTTSAudioForStory(
  storyId: string,
): Promise<void> {
  const db = await openDB();
  const entries = await new Promise<TTSCacheRecord[]>((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], "readonly");
    const index = tx.objectStore(STORE_NAME).index("storyId");
    const request = index.getAll(IDBKeyRange.only(storyId));
    request.onsuccess = () => resolve(request.result as TTSCacheRecord[]);
    request.onerror = () => reject(request.error);
  });

  if (entries.length === 0) return;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], "readwrite");
    const store = tx.objectStore(STORE_NAME);
    for (const entry of entries) store.delete(entry.key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
