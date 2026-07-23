import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import type { StoryData } from "@/app/misc/structs";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

// A minimal stand-in for the sync-worker: stores whatever ciphertext blobs
// the client PUTs, keyed by the raw sync key the client sends (the real
// worker keys by a server-side hash of it - irrelevant to client behavior).
function installFakeServer() {
  const store = new Map<string, { ciphertext: string; iv: string; updatedAt: string }>();
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const syncKey = (headers.Authorization || "").replace("Bearer ", "");
    const parts = u.pathname.split("/").filter(Boolean); // ["sync", bucket|"manifest"]

    if (parts[1] === "manifest") {
      const manifest: Record<string, string> = {};
      for (const [mapKey, value] of store) {
        const [key, bucket] = mapKey.split("::");
        if (key === syncKey) manifest[bucket] = value.updatedAt;
      }
      return new Response(JSON.stringify(manifest), { status: 200 });
    }

    const bucket = parts[1];
    const mapKey = `${syncKey}::${bucket}`;

    if (init?.method === "PUT") {
      const body = JSON.parse(init.body as string);
      store.set(mapKey, body);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    const stored = store.get(mapKey);
    if (!stored) {
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
    }
    return new Response(JSON.stringify(stored), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, store };
}

function makeStoryData(name: string): StoryData {
  return {
    story_name: name,
    scene: {
      parts: [
        { content: `${name} content`, imageUrl: "", user: false, role: "assistant", choices: [] },
      ],
    },
  } as unknown as StoryData;
}

beforeEach(() => {
  vi.resetModules();
  // syncManager/localFolderManager follow this codebase's SSR-safety
  // convention of gating browser-only storage access behind
  // `typeof window !== "undefined"` - stub it so that guard passes under
  // Vitest's node test environment, same as the real browser runtime.
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("localStorage", new MemoryStorage());
  vi.stubGlobal("indexedDB", new IDBFactory());
  process.env.NEXT_PUBLIC_SYNC_API_URL = "https://fake-sync.example";
});

describe("syncManager", () => {
  it("generates a grouped, high-entropy sync key and persists it", async () => {
    const { generateSyncKey, getSyncKey } = await import("@/app/misc/syncManager");
    const key = generateSyncKey();
    expect(key).toMatch(/^([0-9a-f]{4}-){7}[0-9a-f]{4}$/);
    expect(getSyncKey()).toBe(key);
  });

  it("round-trips folders through encryption via push then pull on a fresh device", async () => {
    installFakeServer();

    const syncManager = await import("@/app/misc/syncManager");
    const folderManager = await import("@/app/misc/localFolderManager");

    syncManager.setSyncKey("test-key-device-a");
    folderManager.createLocalFolder("Adventures", "Folder", "#111111");
    const resultsA = await syncManager.syncAll();
    expect(resultsA.find((r) => r.bucket === "folders")?.action).toBe("pushed");

    // Simulate a second, empty device linking the same key.
    vi.resetModules();
    vi.stubGlobal("localStorage", new MemoryStorage());
    vi.stubGlobal("indexedDB", new IDBFactory());
    const syncManagerB = await import("@/app/misc/syncManager");
    const folderManagerB = await import("@/app/misc/localFolderManager");
    syncManagerB.setSyncKey("test-key-device-a");
    const resultsB = await syncManagerB.syncAll();
    expect(resultsB.find((r) => r.bucket === "folders")?.action).toBe("pulled");
    expect(folderManagerB.listLocalFolders().map((f) => f.name)).toEqual(["Adventures"]);
  });

  it("round-trips stories (IndexedDB-backed) through push then pull", async () => {
    installFakeServer();

    const syncManager = await import("@/app/misc/syncManager");
    const storyManager = await import("@/app/misc/localStoryManager");

    syncManager.setSyncKey("test-key-stories");
    await storyManager.saveLocalStory("local_1", makeStoryData("Test Story"));
    const resultsA = await syncManager.syncAll();
    expect(resultsA.find((r) => r.bucket === "stories")?.action).toBe("pushed");

    vi.resetModules();
    vi.stubGlobal("localStorage", new MemoryStorage());
    vi.stubGlobal("indexedDB", new IDBFactory());
    const syncManagerB = await import("@/app/misc/syncManager");
    const storyManagerB = await import("@/app/misc/localStoryManager");
    syncManagerB.setSyncKey("test-key-stories");
    const resultsB = await syncManagerB.syncAll();
    expect(resultsB.find((r) => r.bucket === "stories")?.action).toBe("pulled");

    const pulled = await storyManagerB.getLocalStory("local_1");
    expect(pulled?.storyData.story_name).toBe("Test Story");
    expect(pulled?.syncStatus).toBe("synced");
  });

  it("syncs the settings allowlist and leaves excluded keys (like API keys) untouched", async () => {
    installFakeServer();

    const syncManager = await import("@/app/misc/syncManager");
    syncManager.setSyncKey("test-key-settings");
    localStorage.setItem("storyFontSize", "18");
    localStorage.setItem("openRouterKey", "sk-should-not-sync");
    await syncManager.syncAll();

    vi.resetModules();
    vi.stubGlobal("localStorage", new MemoryStorage());
    vi.stubGlobal("indexedDB", new IDBFactory());
    const syncManagerB = await import("@/app/misc/syncManager");
    syncManagerB.setSyncKey("test-key-settings");
    localStorage.setItem("openRouterKey", "sk-device-b-local-key");
    await syncManagerB.syncAll();

    expect(localStorage.getItem("storyFontSize")).toBe("18");
    // Excluded key must survive untouched by the sync that just ran.
    expect(localStorage.getItem("openRouterKey")).toBe("sk-device-b-local-key");
  });

  it("reports noop when nothing changed since the last sync", async () => {
    installFakeServer();

    const syncManager = await import("@/app/misc/syncManager");
    const folderManager = await import("@/app/misc/localFolderManager");
    syncManager.setSyncKey("test-key-noop");
    folderManager.createLocalFolder("Solo Adventures");

    await syncManager.syncAll();
    const second = await syncManager.syncAll();
    expect(second.find((r) => r.bucket === "folders")?.action).toBe("noop");
  });

  it("resolves a real conflict with last-write-wins by timestamp", async () => {
    const { store } = installFakeServer();

    const syncManager = await import("@/app/misc/syncManager");
    const folderManager = await import("@/app/misc/localFolderManager");
    syncManager.setSyncKey("test-key-conflict");
    folderManager.createLocalFolder("Local Change");
    await syncManager.syncAll(); // establishes a baseline lastSyncedAt

    // Simulate a newer remote write from another device after the baseline.
    const mapKey = "test-key-conflict::folders";
    const existing = store.get(mapKey)!;
    store.set(mapKey, { ...existing, updatedAt: new Date(Date.now() + 60_000).toISOString() });

    // Also make a local change so both sides look changed relative to
    // lastSyncedAt. A tiny delay guarantees its ISO timestamp is strictly
    // after the baseline sync's, since both are millisecond-resolution.
    await new Promise((r) => setTimeout(r, 5));
    folderManager.updateLocalFolder(
      folderManager.listLocalFolders()[0].id,
      { name: "Renamed Locally" },
    );

    const results = await syncManager.syncAll();
    // Remote write is newer, so the remote (still-old-named) copy should win
    // and get pulled, overwriting the local rename.
    expect(results.find((r) => r.bucket === "folders")?.action).toBe("conflict-remote-won");
  });
});
