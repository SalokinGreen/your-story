import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import type { StoryData } from "@/app/misc/structs";
import * as syncManager from "@/app/misc/syncManager";
import * as storyManager from "@/app/misc/localStoryManager";
import * as folderManager from "@/app/misc/localFolderManager";

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

// A "device" owns its own localStorage/IndexedDB, and re-activates them
// (via vi.stubGlobal) immediately before every operation, so tests can
// freely interleave actions across multiple devices in any order - e.g.
// "device A syncs again after device B changed something" - which a single
// shared global couldn't support. syncManager/localStoryManager/etc. read
// `localStorage`/`indexedDB` as bare globals at call time (never capture
// them at import time), so swapping the global right before each call is
// sufficient; no per-device module re-import is needed.
class Device {
  storage = new MemoryStorage();
  idb = new IDBFactory();

  constructor(syncKey: string) {
    this.activate();
    syncManager.setSyncKey(syncKey);
  }

  activate() {
    vi.stubGlobal("localStorage", this.storage);
    vi.stubGlobal("indexedDB", this.idb);
  }

  sync() {
    this.activate();
    return syncManager.syncAll();
  }
  saveStory(id: string, data: StoryData) {
    this.activate();
    return storyManager.saveLocalStory(id, data);
  }
  getStory(id: string) {
    this.activate();
    return storyManager.getLocalStory(id);
  }
  createFolder(name: string) {
    this.activate();
    return folderManager.createLocalFolder(name);
  }
  deleteFolder(id: string) {
    this.activate();
    return folderManager.deleteLocalFolder(id);
  }
  listFolders() {
    this.activate();
    return folderManager.listLocalFolders();
  }
  setSetting(key: string, value: string) {
    this.activate();
    localStorage.setItem(key, value);
  }
  getSetting(key: string): string | null {
    this.activate();
    return localStorage.getItem(key);
  }
}

beforeEach(() => {
  // syncManager/localFolderManager follow this codebase's SSR-safety
  // convention of gating browser-only storage access behind
  // `typeof window !== "undefined"` - stub it so that guard passes under
  // Vitest's node test environment, same as the real browser runtime. Node's
  // built-in EventTarget (not plain globalThis) gives syncAll()'s
  // window.dispatchEvent(SYNC_COMPLETED_EVENT) something real to call.
  vi.stubGlobal("window", new EventTarget());
  process.env.NEXT_PUBLIC_SYNC_API_URL = "https://fake-sync.example";
});

describe("syncManager", () => {
  it("generates a grouped, high-entropy sync key and persists it", () => {
    vi.stubGlobal("localStorage", new MemoryStorage());
    const key = syncManager.generateSyncKey();
    expect(key).toMatch(/^([0-9a-f]{4}-){7}[0-9a-f]{4}$/);
    expect(syncManager.getSyncKey()).toBe(key);
  });

  it("keeps both devices' independently-created folders after syncing (no data loss)", async () => {
    installFakeServer();
    const key = "test-key-concurrent-create";

    const a = new Device(key);
    a.createFolder("From A");
    const resultsA = await a.sync();
    // Counts describe what changed in *this device's own* local storage as
    // a result of the merge - A already had "From A" before syncing (it
    // just pushes), so nothing changes locally here.
    expect(resultsA.find((r) => r.bucket === "folders")).toMatchObject({
      action: "merged",
      added: 0,
    });

    // B never saw A's folder - it independently creates its own before ever
    // syncing. Under the old whole-bucket-LWW behavior, whichever device
    // synced more recently would have wiped out the other's folder here.
    const b = new Device(key);
    b.createFolder("From B");
    const resultsB = await b.sync();
    expect(b.listFolders().map((f) => f.name).sort()).toEqual(["From A", "From B"]);
    expect(resultsB.find((r) => r.bucket === "folders")).toMatchObject({
      action: "merged",
      added: 1, // pulled in "From A"
    });

    // A syncs again and should pick up B's folder too.
    await a.sync();
    expect(a.listFolders().map((f) => f.name).sort()).toEqual(["From A", "From B"]);
  });

  it("propagates a deletion to another device while an untouched sibling survives", async () => {
    installFakeServer();
    const key = "test-key-deletion";

    const a = new Device(key);
    const temp = a.createFolder("Temp Folder");
    a.createFolder("Keeper");
    await a.sync();

    const b = new Device(key);
    await b.sync();
    expect(b.listFolders().map((f) => f.name).sort()).toEqual(["Keeper", "Temp Folder"]);

    a.deleteFolder(temp.id);
    const resultsA2 = await a.sync();
    // A already deleted it locally before syncing, so this sync's local
    // diff is empty - it just propagates the deletion to the server.
    expect(resultsA2.find((r) => r.bucket === "folders")).toMatchObject({
      action: "merged",
      removed: 0,
    });

    const resultsB2 = await b.sync();
    expect(b.listFolders().map((f) => f.name)).toEqual(["Keeper"]);
    expect(resultsB2.find((r) => r.bucket === "folders")).toMatchObject({
      action: "merged",
      removed: 1,
    });
  });

  it("never resurrects a deleted item for a brand-new device linking after the deletion", async () => {
    installFakeServer();
    const key = "test-key-no-resurrect";

    const a = new Device(key);
    const temp = a.createFolder("Temp Folder");
    a.createFolder("Keeper");
    await a.sync();
    a.deleteFolder(temp.id);
    await a.sync();

    const c = new Device(key); // fresh third device, first-ever link
    await c.sync();
    expect(c.listFolders().map((f) => f.name)).toEqual(["Keeper"]);
  });

  it("resolves a same-item edit conflict by newest-updatedAt while an untouched sibling survives", async () => {
    installFakeServer();
    const key = "test-key-edit-conflict";

    const a = new Device(key);
    await a.saveStory("local_one", makeStoryData("Story One"));
    await a.saveStory("local_two", makeStoryData("Story Two"));
    await a.sync();

    const b = new Device(key);
    await b.sync(); // pulls both stories

    await a.saveStory("local_one", makeStoryData("Story One - Edited By A"));
    await a.sync();

    // B edits the same story differently, strictly after A's edit.
    await new Promise((r) => setTimeout(r, 5));
    await b.saveStory("local_one", makeStoryData("Story One - Edited By B"));
    await b.sync();

    const bOne = await b.getStory("local_one");
    expect(bOne?.storyData.story_name).toBe("Story One - Edited By B");
    // The untouched sibling must survive - this is what distinguishes
    // per-item merge from the old whole-bucket last-write-wins, which would
    // have overwritten Story Two too just because Story One conflicted.
    const bTwo = await b.getStory("local_two");
    expect(bTwo?.storyData.story_name).toBe("Story Two");

    // A syncs again and should pick up B's newer edit.
    await a.sync();
    const aOne = await a.getStory("local_one");
    expect(aOne?.storyData.story_name).toBe("Story One - Edited By B");
    const aTwo = await a.getStory("local_two");
    expect(aTwo?.storyData.story_name).toBe("Story Two");
  });

  it("merges settings per key so two devices changing different keys both survive, and clearing a key propagates as a deletion", async () => {
    installFakeServer();
    const key = "test-key-settings-merge";

    const a = new Device(key);
    a.setSetting("storyFontSize", "18");
    await a.sync();

    const b = new Device(key);
    await b.sync(); // pulls storyFontSize
    expect(b.getSetting("storyFontSize")).toBe("18");
    b.setSetting("storyTheme", "forest"); // a different key, changed on B
    await b.sync();

    // A syncs again - should pick up storyTheme while keeping its own
    // storyFontSize (both survive, unlike the old whole-blob fingerprint
    // scheme where one device's settings snapshot could fully overwrite
    // the other's).
    await a.sync();
    expect(a.getSetting("storyFontSize")).toBe("18");
    expect(a.getSetting("storyTheme")).toBe("forest");

    // Now B clears storyTheme entirely. B already removed it locally before
    // syncing, so this sync's local diff is empty - it just propagates the
    // clear to the server (mirrored below on A, which still has it).
    b.activate();
    localStorage.removeItem("storyTheme");
    const resultsB = await b.sync();
    expect(resultsB.find((r) => r.bucket === "settings")).toMatchObject({
      action: "merged",
      removed: 0,
    });

    const resultsA = await a.sync();
    expect(a.getSetting("storyTheme")).toBeNull();
    expect(a.getSetting("storyFontSize")).toBe("18"); // untouched key survives
    expect(resultsA.find((r) => r.bucket === "settings")).toMatchObject({
      action: "merged",
      removed: 1,
    });
  });

  it("never syncs excluded keys like API keys, even though other settings do", async () => {
    installFakeServer();
    const key = "test-key-excluded-settings";

    const a = new Device(key);
    a.setSetting("storyFontSize", "18");
    a.setSetting("openRouterKey", "sk-should-not-sync");
    await a.sync();

    const b = new Device(key);
    b.setSetting("openRouterKey", "sk-device-b-local-key");
    await b.sync();

    expect(b.getSetting("storyFontSize")).toBe("18");
    // Excluded key must survive untouched by the sync that just ran.
    expect(b.getSetting("openRouterKey")).toBe("sk-device-b-local-key");
  });

  it("reports noop when nothing changed since the last sync", async () => {
    installFakeServer();
    const key = "test-key-noop";

    const a = new Device(key);
    a.createFolder("Solo Adventures");
    await a.sync();
    const second = await a.sync();
    expect(second.find((r) => r.bucket === "folders")?.action).toBe("noop");
  });
});
