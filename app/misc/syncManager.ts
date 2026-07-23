// Cross-device sync for Your Story's local-only data (stories, adventures,
// folders, settings) against the sync-worker/ Cloudflare Worker. There is no
// account system - a random "sync key" doubles as both the lookup id
// (server sees only its SHA-256 hash) and the client-side encryption key, so
// the worker only ever stores ciphertext. Sync is manual (syncAll(), called
// from a "Sync Now" button).
//
// Merging is per-item, not per-bucket: every bucket is normalized to a list
// of {id, updatedAt, payload} items, and two devices that each change
// different items since their last sync both survive - only a genuine
// same-item edit on both sides falls back to last-write-wins, scoped to
// that one item. Deletions are inferred by diffing current ids against
// yourStory_syncedIds_<bucket> (the id set as of this device's last sync)
// rather than explicit tombstone records - see mergeItems() below.
import {
  LocalStory,
  listLocalStories,
  saveLocalStory,
  deleteLocalStory,
} from "./localStoryManager";
import {
  LocalAdventure,
  listLocalAdventures,
  saveLocalAdventure,
  deleteLocalAdventure,
} from "./localAdventureManager";
import {
  LocalFolder,
  listLocalFolders,
  replaceLocalFolders,
} from "./localFolderManager";
import {
  LibraryNote,
  listLibraryNotes,
  saveLibraryNote,
  deleteLibraryNote,
} from "./localNotesLibraryManager";
import { SYNCABLE_SETTINGS_KEYS } from "./syncableSettingsKeys";
import { getProviderFetch } from "./platformFetch";

export type SyncBucket =
  | "stories"
  | "adventures"
  | "notes"
  | "folders"
  | "settings";
const BUCKETS: SyncBucket[] = [
  "stories",
  "adventures",
  "notes",
  "folders",
  "settings",
];

const SYNC_KEY_STORAGE_KEY = "yourStory_syncKey";
const LAST_SYNCED_PREFIX = "yourStory_lastSynced_";
const SETTINGS_TIMESTAMPS_KEY = "yourStory_settingsValueTimestamps";

function syncedIdsKey(bucket: SyncBucket): string {
  return `yourStory_syncedIds_${bucket}`;
}

// ---------------------------------------------------------------------------
// Sync key management
// ---------------------------------------------------------------------------

function getSyncApiUrl(): string {
  return process.env.NEXT_PUBLIC_SYNC_API_URL || "";
}

export function isSyncConfigured(): boolean {
  return getSyncApiUrl() !== "";
}

export function getSyncKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SYNC_KEY_STORAGE_KEY);
}

export function generateSyncKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16)); // 128 bits
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const grouped = hex.match(/.{1,4}/g)!.join("-");
  localStorage.setItem(SYNC_KEY_STORAGE_KEY, grouped);
  cachedKeyMaterial = null;
  return grouped;
}

export function setSyncKey(key: string): void {
  localStorage.setItem(SYNC_KEY_STORAGE_KEY, key.trim());
  cachedKeyMaterial = null;
}

export function clearSyncKey(): void {
  localStorage.removeItem(SYNC_KEY_STORAGE_KEY);
  cachedKeyMaterial = null;
}

export function getLastSyncedTimes(): Partial<Record<SyncBucket, string>> {
  const result: Partial<Record<SyncBucket, string>> = {};
  if (typeof window === "undefined") return result;
  for (const bucket of BUCKETS) {
    const v = localStorage.getItem(`${LAST_SYNCED_PREFIX}${bucket}`);
    if (v) result[bucket] = v;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Encryption - AES-GCM key derived from the sync key via PBKDF2. The salt is
// a fixed constant rather than per-install random: the sync key itself is
// 128 bits of real randomness (not a human password), so a fixed salt only
// removes the "different rainbow table per install" property, which doesn't
// matter for a key this strong.
// ---------------------------------------------------------------------------

const PBKDF2_SALT = "your-story-sync-v1";
const PBKDF2_ITERATIONS = 100_000;

let cachedKeyMaterial: { syncKey: string; cryptoKey: CryptoKey } | null = null;

async function deriveEncryptionKey(syncKey: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(syncKey),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(PBKDF2_SALT),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function getOrDeriveKey(syncKey: string): Promise<CryptoKey> {
  if (cachedKeyMaterial?.syncKey === syncKey) return cachedKeyMaterial.cryptoKey;
  const cryptoKey = await deriveEncryptionKey(syncKey);
  cachedKeyMaterial = { syncKey, cryptoKey };
  return cryptoKey;
}

function bufToBase64(buf: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(buf)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBuf(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function encryptJSON(
  cryptoKey: CryptoKey,
  data: unknown,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    plaintext,
  );
  return { ciphertext: bufToBase64(encrypted), iv: bufToBase64(iv.buffer) };
}

async function decryptJSON<T>(
  cryptoKey: CryptoKey,
  ciphertext: string,
  iv: string,
): Promise<T> {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBuf(iv) },
    cryptoKey,
    base64ToBuf(ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(decrypted)) as T;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

async function apiFetch(
  path: string,
  syncKey: string,
  init?: RequestInit,
): Promise<Response> {
  const base = getSyncApiUrl();
  if (!base) {
    throw new Error(
      "Sync API URL not configured (NEXT_PUBLIC_SYNC_API_URL is unset)",
    );
  }
  // The Tauri desktop build's WebView enforces CORS against the browser
  // fetch, same as providerCall.ts's calls to AI providers - route through
  // the same native-HTTP seam so this keeps working once compiled to a
  // local app, not just in the Vercel testing deployment.
  const platformFetch = getProviderFetch();
  return platformFetch(`${base}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${syncKey}`,
      "Content-Type": "application/json",
    },
  });
}

async function fetchManifest(
  syncKey: string,
): Promise<Partial<Record<SyncBucket, string>>> {
  const res = await apiFetch("/sync/manifest", syncKey, { method: "GET" });
  if (!res.ok) throw new Error(`Failed to fetch manifest: ${res.status}`);
  return res.json();
}

async function pushBucketRaw(
  bucket: SyncBucket,
  syncKey: string,
  data: unknown,
): Promise<string> {
  const cryptoKey = await getOrDeriveKey(syncKey);
  const { ciphertext, iv } = await encryptJSON(cryptoKey, data);
  const updatedAt = new Date().toISOString();
  const res = await apiFetch(`/sync/${bucket}`, syncKey, {
    method: "PUT",
    body: JSON.stringify({ ciphertext, iv, updatedAt }),
  });
  if (!res.ok) throw new Error(`Failed to push ${bucket}: ${res.status}`);
  return updatedAt;
}

async function pullBucketRaw<T>(
  bucket: SyncBucket,
  syncKey: string,
): Promise<T | null> {
  const res = await apiFetch(`/sync/${bucket}`, syncKey, { method: "GET" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to pull ${bucket}: ${res.status}`);
  const { ciphertext, iv } = await res.json();
  const cryptoKey = await getOrDeriveKey(syncKey);
  return decryptJSON<T>(cryptoKey, ciphertext, iv);
}

// ---------------------------------------------------------------------------
// Per-item merge
// ---------------------------------------------------------------------------

export interface MergeItem<P> {
  id: string;
  updatedAt: string; // ISO
  payload: P;
}

function latestTimestamp(dates: string[]): string | null {
  if (dates.length === 0) return null;
  const max = Math.max(...dates.map((d) => new Date(d).getTime()));
  return new Date(max).toISOString();
}

// Union merge with "tombstone by omission": an id missing from one side
// that was present as of that side's own last sync (lastSyncedIds) is
// treated as an intentional deletion and dropped, rather than resurrected
// from the other side. An id missing from lastSyncedIds is genuinely new
// and always kept. See the plan doc / PR description for the full
// truth table this implements.
function mergeItems<P>(
  local: MergeItem<P>[],
  remote: MergeItem<P>[],
  lastSyncedIds: Set<string>,
): MergeItem<P>[] {
  const localMap = new Map(local.map((i) => [i.id, i]));
  const remoteMap = new Map(remote.map((i) => [i.id, i]));
  const allIds = new Set([...localMap.keys(), ...remoteMap.keys()]);
  const merged: MergeItem<P>[] = [];

  for (const id of allIds) {
    const l = localMap.get(id);
    const r = remoteMap.get(id);
    if (l && r) {
      merged.push(
        new Date(l.updatedAt).getTime() >= new Date(r.updatedAt).getTime()
          ? l
          : r,
      );
    } else if (l && !r) {
      if (!lastSyncedIds.has(id)) merged.push(l); // new locally, keep
      // else: deleted on another device since our last sync - drop
    } else if (r && !l) {
      if (!lastSyncedIds.has(id)) merged.push(r); // new remotely, pull in
      // else: deleted on this device since our last sync - drop
    }
  }
  return merged;
}

interface MergeAdapter<P> {
  collectLocalItems: () => Promise<MergeItem<P>[]> | MergeItem<P>[];
  // Reconciles local storage with the merge result: upsert items whose
  // updatedAt differs from what was locally present before the merge
  // (i.e. anything that came from - or lost to - the remote side), and
  // remove local items the merge dropped.
  applyMerged: (
    merged: MergeItem<P>[],
    localItemsBefore: MergeItem<P>[],
  ) => Promise<void> | void;
}

const storiesAdapter: MergeAdapter<LocalStory> = {
  collectLocalItems: async () => {
    const stories = await listLocalStories();
    return stories.map((s) => ({
      id: s.id,
      updatedAt: new Date(s.updatedAt).toISOString(),
      payload: s,
    }));
  },
  applyMerged: async (merged, localItemsBefore) => {
    const localMap = new Map(localItemsBefore.map((i) => [i.id, i]));
    const mergedIds = new Set(merged.map((i) => i.id));
    for (const item of merged) {
      const before = localMap.get(item.id);
      if (before && before.updatedAt === item.updatedAt) continue;
      const s = item.payload;
      await saveLocalStory(s.id, s.storyData, s.folder_id ?? undefined, {
        serverUpdatedAt: s.serverUpdatedAt,
        markAsSynced: true,
      });
    }
    for (const before of localItemsBefore) {
      if (!mergedIds.has(before.id)) await deleteLocalStory(before.id);
    }
  },
};

const adventuresAdapter: MergeAdapter<LocalAdventure> = {
  collectLocalItems: async () => {
    const adventures = await listLocalAdventures();
    return adventures.map((a) => ({
      id: a.id,
      updatedAt: new Date(a.updatedAt).toISOString(),
      payload: a,
    }));
  },
  applyMerged: async (merged, localItemsBefore) => {
    const localMap = new Map(localItemsBefore.map((i) => [i.id, i]));
    const mergedIds = new Set(merged.map((i) => i.id));
    for (const item of merged) {
      const before = localMap.get(item.id);
      if (before && before.updatedAt === item.updatedAt) continue;
      const a = item.payload;
      await saveLocalAdventure(a.id, a.adventureData, {
        serverUpdatedAt: a.serverUpdatedAt,
        markAsSynced: true,
      });
    }
    for (const before of localItemsBefore) {
      if (!mergedIds.has(before.id)) await deleteLocalAdventure(before.id);
    }
  },
};

const notesAdapter: MergeAdapter<LibraryNote> = {
  collectLocalItems: async () => {
    const notes = await listLibraryNotes();
    return notes.map((n) => ({ id: n.id, updatedAt: n.updatedAt, payload: n }));
  },
  applyMerged: async (merged, localItemsBefore) => {
    const localMap = new Map(localItemsBefore.map((i) => [i.id, i]));
    const mergedIds = new Set(merged.map((i) => i.id));
    for (const item of merged) {
      const before = localMap.get(item.id);
      if (before && before.updatedAt === item.updatedAt) continue;
      await saveLibraryNote(item.payload);
    }
    for (const before of localItemsBefore) {
      if (!mergedIds.has(before.id)) await deleteLibraryNote(before.id);
    }
  },
};

const foldersAdapter: MergeAdapter<LocalFolder> = {
  collectLocalItems: () =>
    listLocalFolders().map((f) => ({
      id: f.id,
      updatedAt: f.updatedAt,
      payload: f,
    })),
  // Folders have no per-item local API beyond full-list read/write, so
  // apply the merge result as one bulk replace rather than diffing.
  applyMerged: (merged) => {
    replaceLocalFolders(merged.map((i) => i.payload));
  },
};

interface SettingsTimestampRecord {
  value: string;
  updatedAt: string;
}

function readSettingsTimestamps(): Record<string, SettingsTimestampRecord> {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_TIMESTAMPS_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeSettingsTimestamps(
  record: Record<string, SettingsTimestampRecord>,
): void {
  localStorage.setItem(SETTINGS_TIMESTAMPS_KEY, JSON.stringify(record));
}

// Each syncable setting key is its own merge item (id = key, payload =
// value), timestamped by diffing against the last-seen value for that key
// - this is what makes settings merge per-key instead of all-or-nothing.
// An unset key (localStorage returns null) simply has no item, so clearing
// a setting propagates and merges via the exact same rule as any other
// deletion.
const settingsAdapter: MergeAdapter<string> = {
  collectLocalItems: () => {
    const stored = readSettingsTimestamps();
    let storedChanged = false;
    const items: MergeItem<string>[] = [];
    for (const key of SYNCABLE_SETTINGS_KEYS) {
      const value = localStorage.getItem(key);
      if (value === null) continue;
      const prev = stored[key];
      if (!prev || prev.value !== value) {
        stored[key] = { value, updatedAt: new Date().toISOString() };
        storedChanged = true;
      }
      items.push({ id: key, updatedAt: stored[key].updatedAt, payload: value });
    }
    if (storedChanged) writeSettingsTimestamps(stored);
    return items;
  },
  applyMerged: (merged, localItemsBefore) => {
    const localMap = new Map(localItemsBefore.map((i) => [i.id, i]));
    const mergedIds = new Set(merged.map((i) => i.id));
    const stored = readSettingsTimestamps();
    for (const item of merged) {
      const before = localMap.get(item.id);
      if (before && before.updatedAt === item.updatedAt) continue;
      localStorage.setItem(item.id, item.payload);
      stored[item.id] = { value: item.payload, updatedAt: item.updatedAt };
    }
    for (const before of localItemsBefore) {
      if (!mergedIds.has(before.id)) {
        localStorage.removeItem(before.id);
        delete stored[before.id];
      }
    }
    writeSettingsTimestamps(stored);
  },
};

const adapters: { [B in SyncBucket]: MergeAdapter<unknown> } = {
  stories: storiesAdapter as MergeAdapter<unknown>,
  adventures: adventuresAdapter as MergeAdapter<unknown>,
  notes: notesAdapter as MergeAdapter<unknown>,
  folders: foldersAdapter as MergeAdapter<unknown>,
  settings: settingsAdapter as MergeAdapter<unknown>,
};

// ---------------------------------------------------------------------------
// Sync orchestration
// ---------------------------------------------------------------------------

export type SyncAction = "merged" | "noop" | "error";

export interface SyncResult {
  bucket: SyncBucket;
  action: SyncAction;
  added?: number;
  updated?: number;
  removed?: number;
  error?: string;
}

async function syncBucketMerge(
  bucket: SyncBucket,
  syncKey: string,
  manifest: Partial<Record<SyncBucket, string>>,
): Promise<SyncResult> {
  const adapter = adapters[bucket];
  const localItems = await adapter.collectLocalItems();
  const localMax = latestTimestamp(localItems.map((i) => i.updatedAt));
  const remoteManifestUpdatedAt = manifest[bucket] ?? null;
  const lastSyncedAt = localStorage.getItem(`${LAST_SYNCED_PREFIX}${bucket}`);
  const lastSyncedIds = new Set<string>(
    JSON.parse(localStorage.getItem(syncedIdsKey(bucket)) || "[]"),
  );

  // Cheap gate: only worth fetching+merging if either side could have
  // changed since this device's last sync. A pure deletion doesn't bump any
  // remaining item's updatedAt, so the local side also checks whether the
  // current id set differs from lastSyncedIds - timestamp comparison alone
  // would miss "the only thing that changed was something disappearing."
  // Real conflict resolution below is per-item; this is purely a noop
  // fast-path.
  const localIds = new Set(localItems.map((i) => i.id));
  const localIdsChanged =
    localIds.size !== lastSyncedIds.size ||
    [...localIds].some((id) => !lastSyncedIds.has(id));
  const mightHaveLocalChanges =
    localIdsChanged ||
    (localMax !== null && (!lastSyncedAt || localMax > lastSyncedAt));
  const mightHaveRemoteChanges =
    remoteManifestUpdatedAt !== null &&
    (!lastSyncedAt || remoteManifestUpdatedAt > lastSyncedAt);

  if (!mightHaveLocalChanges && !mightHaveRemoteChanges) {
    return { bucket, action: "noop" };
  }

  const remoteItems =
    (await pullBucketRaw<MergeItem<unknown>[]>(bucket, syncKey)) ?? [];

  const merged = mergeItems(localItems, remoteItems, lastSyncedIds);
  await adapter.applyMerged(merged, localItems);

  const updatedAt = await pushBucketRaw(bucket, syncKey, merged);
  localStorage.setItem(`${LAST_SYNCED_PREFIX}${bucket}`, updatedAt);
  localStorage.setItem(
    syncedIdsKey(bucket),
    JSON.stringify(merged.map((i) => i.id)),
  );

  const localMap = new Map(localItems.map((i) => [i.id, i]));
  const mergedMap = new Map(merged.map((i) => [i.id, i]));
  let added = 0;
  let updated = 0;
  for (const [id, item] of mergedMap) {
    const before = localMap.get(id);
    if (!before) added++;
    else if (before.updatedAt !== item.updatedAt) updated++;
  }
  let removed = 0;
  for (const id of localMap.keys()) {
    if (!mergedMap.has(id)) removed++;
  }

  return { bucket, action: "merged", added, updated, removed };
}

// syncAll() writes straight to IndexedDB/localStorage via the local
// managers - it has no idea which React components currently have that
// data loaded into state. Dispatching this after every sync lets any
// mounted page (Library, an open story) notice and refresh itself, the
// same convention this codebase already uses for font/layer/model settings
// changes (see FontSettingsTab.tsx, layerSettings.ts, user_settings.ts).
export const SYNC_COMPLETED_EVENT = "yourStorySyncCompleted";

export async function syncAll(): Promise<SyncResult[]> {
  const syncKey = getSyncKey();
  if (!syncKey) throw new Error("No sync key configured");
  if (!isSyncConfigured()) throw new Error("Sync API URL not configured");

  const manifest = await fetchManifest(syncKey);

  const results: SyncResult[] = [];
  for (const bucket of BUCKETS) {
    try {
      results.push(await syncBucketMerge(bucket, syncKey, manifest));
    } catch (e) {
      results.push({
        bucket,
        action: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(SYNC_COMPLETED_EVENT, { detail: results }),
    );
  }

  return results;
}
