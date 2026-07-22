// Cross-device sync for Your Story's local-only data (stories, adventures,
// folders, settings) against the sync-worker/ Cloudflare Worker. There is no
// account system - a random "sync key" doubles as both the lookup id
// (server sees only its SHA-256 hash) and the client-side encryption key, so
// the worker only ever stores ciphertext. Sync is manual (syncAll(), called
// from a "Sync Now" button) rather than automatic, to keep conflict handling
// simple: last-write-wins per bucket, compared by an ISO timestamp, no
// merging.
import {
  LocalStory,
  listLocalStories,
  saveLocalStory,
} from "./localStoryManager";
import {
  LocalAdventure,
  listLocalAdventures,
  saveLocalAdventure,
} from "./localAdventureManager";
import {
  LocalFolder,
  listLocalFolders,
  replaceLocalFolders,
} from "./localFolderManager";
import { SYNCABLE_SETTINGS_KEYS } from "./syncableSettingsKeys";

export type SyncBucket = "stories" | "adventures" | "folders" | "settings";
const BUCKETS: SyncBucket[] = ["stories", "adventures", "folders", "settings"];

const SYNC_KEY_STORAGE_KEY = "yourStory_syncKey";
const LAST_SYNCED_PREFIX = "yourStory_lastSynced_";
const SETTINGS_FINGERPRINT_KEY = "yourStory_settingsFingerprint";
const SETTINGS_LOCAL_UPDATED_KEY = "yourStory_settingsLocalUpdatedAt";

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
  return fetch(`${base}${path}`, {
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
// Per-bucket adapters: how to read/write each local data surface. Sync logic
// itself (syncBucket, below) stays generic over these.
// ---------------------------------------------------------------------------

interface BucketAdapter<T> {
  collect: () => Promise<T> | T;
  // Null means "no local data for this bucket at all" (as opposed to empty
  // data), so a first-time pull isn't blocked by treating "nothing yet" as
  // newer than the timestamp on the server.
  localUpdatedAt: (data: T) => string | null;
  apply: (data: T) => Promise<void> | void;
}

function latestTimestamp(dates: (string | Date)[]): string | null {
  if (dates.length === 0) return null;
  const max = Math.max(...dates.map((d) => new Date(d).getTime()));
  return new Date(max).toISOString();
}

const storiesAdapter: BucketAdapter<LocalStory[]> = {
  collect: () => listLocalStories(),
  localUpdatedAt: (stories) => latestTimestamp(stories.map((s) => s.updatedAt)),
  apply: async (stories) => {
    for (const s of stories) {
      await saveLocalStory(s.id, s.storyData, s.folder_id ?? undefined, {
        serverUpdatedAt: s.serverUpdatedAt,
        markAsSynced: true,
      });
    }
  },
};

const adventuresAdapter: BucketAdapter<LocalAdventure[]> = {
  collect: () => listLocalAdventures(),
  localUpdatedAt: (adventures) =>
    latestTimestamp(adventures.map((a) => a.updatedAt)),
  apply: async (adventures) => {
    for (const a of adventures) {
      await saveLocalAdventure(a.id, a.adventureData, {
        serverUpdatedAt: a.serverUpdatedAt,
        markAsSynced: true,
      });
    }
  },
};

const foldersAdapter: BucketAdapter<LocalFolder[]> = {
  collect: () => listLocalFolders(),
  localUpdatedAt: (folders) => latestTimestamp(folders.map((f) => f.updatedAt)),
  apply: (folders) => replaceLocalFolders(folders),
};

type SettingsSnapshot = Record<string, string | null>;

function collectSettingsSnapshot(): SettingsSnapshot {
  const snapshot: SettingsSnapshot = {};
  for (const key of SYNCABLE_SETTINGS_KEYS) {
    snapshot[key] = localStorage.getItem(key);
  }
  return snapshot;
}

// Settings have no per-key timestamps, so "changed since last sync" is
// detected by fingerprinting the whole snapshot: if it differs from the last
// known fingerprint, this moment becomes the new localUpdatedAt. A snapshot
// with nothing customized yet (every allowlisted key unset) reports null -
// same "no local data" meaning as an empty stories/adventures/folders list -
// so a fresh device with default settings can never out-timestamp and
// overwrite another device's real synced settings in a conflict.
function settingsLocalUpdatedAt(snapshot: SettingsSnapshot): string | null {
  const hasAnyValue = Object.values(snapshot).some((v) => v !== null);
  if (!hasAnyValue) return null;

  const serialized = JSON.stringify(snapshot);
  const prevFingerprint = localStorage.getItem(SETTINGS_FINGERPRINT_KEY);
  if (serialized !== prevFingerprint) {
    const now = new Date().toISOString();
    localStorage.setItem(SETTINGS_FINGERPRINT_KEY, serialized);
    localStorage.setItem(SETTINGS_LOCAL_UPDATED_KEY, now);
    return now;
  }
  return (
    localStorage.getItem(SETTINGS_LOCAL_UPDATED_KEY) || new Date(0).toISOString()
  );
}

const settingsAdapter: BucketAdapter<SettingsSnapshot> = {
  collect: () => collectSettingsSnapshot(),
  localUpdatedAt: (snapshot) => settingsLocalUpdatedAt(snapshot),
  apply: (remote) => {
    for (const key of SYNCABLE_SETTINGS_KEYS) {
      const value = remote[key];
      if (value === null || value === undefined) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, value);
      }
    }
    // Record the pulled state as the new fingerprint so this pull isn't
    // immediately re-detected as a local change on the next sync.
    localStorage.setItem(SETTINGS_FINGERPRINT_KEY, JSON.stringify(remote));
    localStorage.setItem(SETTINGS_LOCAL_UPDATED_KEY, new Date().toISOString());
  },
};

const adapters: { [B in SyncBucket]: BucketAdapter<unknown> } = {
  stories: storiesAdapter as BucketAdapter<unknown>,
  adventures: adventuresAdapter as BucketAdapter<unknown>,
  folders: foldersAdapter as BucketAdapter<unknown>,
  settings: settingsAdapter as BucketAdapter<unknown>,
};

// ---------------------------------------------------------------------------
// Sync orchestration
// ---------------------------------------------------------------------------

export type SyncAction =
  | "pushed"
  | "pulled"
  | "conflict-local-won"
  | "conflict-remote-won"
  | "noop"
  | "error";

export interface SyncResult {
  bucket: SyncBucket;
  action: SyncAction;
  error?: string;
}

async function syncBucket(
  bucket: SyncBucket,
  syncKey: string,
  manifest: Partial<Record<SyncBucket, string>>,
): Promise<SyncResult> {
  const adapter = adapters[bucket];
  const localData = await adapter.collect();
  const localUpdatedAt = adapter.localUpdatedAt(localData);
  const remoteUpdatedAt = manifest[bucket] ?? null;
  const lastSyncedAt = localStorage.getItem(`${LAST_SYNCED_PREFIX}${bucket}`);

  const localChanged =
    localUpdatedAt !== null && (!lastSyncedAt || localUpdatedAt > lastSyncedAt);
  const remoteChanged =
    remoteUpdatedAt !== null && (!lastSyncedAt || remoteUpdatedAt > lastSyncedAt);

  const doPush = async (): Promise<void> => {
    const updatedAt = await pushBucketRaw(bucket, syncKey, localData);
    localStorage.setItem(`${LAST_SYNCED_PREFIX}${bucket}`, updatedAt);
  };
  const doPull = async (): Promise<void> => {
    const pulled = await pullBucketRaw(bucket, syncKey);
    if (pulled !== null) {
      await adapter.apply(pulled);
      localStorage.setItem(
        `${LAST_SYNCED_PREFIX}${bucket}`,
        new Date().toISOString(),
      );
    }
  };

  if (!localChanged && !remoteChanged) return { bucket, action: "noop" };
  if (localChanged && !remoteChanged) {
    await doPush();
    return { bucket, action: "pushed" };
  }
  if (remoteChanged && !localChanged) {
    await doPull();
    return { bucket, action: "pulled" };
  }

  // Both sides changed since the last sync: last-write-wins, no merge - this
  // is a manual, single-user sync tool, not a collaborative one.
  if (localUpdatedAt! > remoteUpdatedAt!) {
    await doPush();
    return { bucket, action: "conflict-local-won" };
  }
  await doPull();
  return { bucket, action: "conflict-remote-won" };
}

export async function syncAll(): Promise<SyncResult[]> {
  const syncKey = getSyncKey();
  if (!syncKey) throw new Error("No sync key configured");
  if (!isSyncConfigured()) throw new Error("Sync API URL not configured");

  const manifest = await fetchManifest(syncKey);

  const results: SyncResult[] = [];
  for (const bucket of BUCKETS) {
    try {
      results.push(await syncBucket(bucket, syncKey, manifest));
    } catch (e) {
      results.push({
        bucket,
        action: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return results;
}
