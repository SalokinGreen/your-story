import {
  Adventure,
  CustomTable,
  DiceMode,
  PlayerArchetype,
  StoryData,
  StoryLore,
} from "./structs";
import { ARCHETYPE_INFO } from "./gmAdvice";

const DB_NAME = "YourStoryDB";
const STORE_NAME = "local_stories";
const UNDO_STORE_NAME = "undo_snapshots";
const DB_VERSION = 3; // Bumped for undo_snapshots store

// Bounded so a long session's Undo/Retry history can't grow IndexedDB usage
// unboundedly - only the most recent turns are ever undoable, matching the
// UI's "misread input" framing rather than a full campaign-length history.
export const MAX_UNDO_STACK_SIZE = 8;

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

      if (!db.objectStoreNames.contains(UNDO_STORE_NAME)) {
        db.createObjectStore(UNDO_STORE_NAME, { keyPath: "storyId" });
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
    // Overrides the stored `updatedAt` instead of stamping "now". Used by
    // syncManager.ts when writing a pulled/merged item locally, so this
    // device's copy keeps the timestamp that actually won the merge rather
    // than looking artificially newer just because it happened to sync at
    // this moment - otherwise a later, genuinely newer edit from another
    // device could lose to this device's stale content in a future merge.
    updatedAt?: Date;
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
      updatedAt: options?.updatedAt ?? now,
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
  initialLore?: StoryLore[],
  initialTables?: CustomTable[],
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
    characterSheetTemplate: adventure.characterSheetTemplate,
    lore: [...(adventure.storyTemplate?.lore || []), ...(initialLore || [])],
    customTables: [
      ...(adventure.storyTemplate?.customTables || []),
      ...(initialTables || []),
    ],
  } as unknown as StoryData;

  await saveLocalStory(localId, newStoryData);

  return localId;
}

// A player configured through the guided freeform setup wizard (see
// GuidedStoryStart). Extends the persisted CouchPlayer identity with
// setup-only preferences that get baked into a pinned GM note.
export interface FreeformPlayerSetup {
  id: string;
  name: string;
  color: string; // hex color, e.g. "#22c55e"
  personality: string[]; // curated personality tags picked in the wizard
  wishTags: string[]; // curated "what do you want from this story" tags
  wishText: string; // freeform addition to the above, not tag-matchable
  archetype?: PlayerArchetype; // Self-selected Robin Laws player type
}

// Combines a player's curated wish tags and freeform wish text into one
// display string, for the pinned note - kept as a pure function (rather than
// merging the two eagerly in GuidedStoryStart) so wishTags survive
// separately for selectDirectorMove's spotlight_tag move (see
// tagFocusExamples.ts), which can only match against the curated vocabulary.
function combinedWish(p: FreeformPlayerSetup): string {
  return [...p.wishTags, p.wishText].filter(Boolean).join("; ");
}

function buildPlayerPreferencesNote(
  players: FreeformPlayerSetup[],
): StoryLore {
  const isParty = players.length > 1;
  const playerBlocks = players
    .map((p) => {
      const lines = [`### ${p.name}`];
      if (p.personality.length > 0) {
        lines.push(`- Personality: ${p.personality.join(", ")}`);
      }
      const wish = combinedWish(p);
      if (wish) {
        lines.push(`- Wants from this story: ${wish}`);
      }
      if (p.archetype) {
        const info = ARCHETYPE_INFO[p.archetype];
        lines.push(`- Player type: ${info.label} - ${info.facilitation}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");

  const guidance = isParty
    ? "\n\nThis is a same-device co-op session. Each person above plays their OWN character - when you set up the world, create a separate `character_sheet` note per player (titled \"Character: <name>\") that reflects their personality tags. Player turns arrive as \"> Name: action\" lines. Weave everyone's wishes into the story and rotate the spotlight so nobody is left out."
    : "\n\nUse the personality tags to shape the player's character concept when you create their `character_sheet` note, and steer the story toward what they said they want.";

  return {
    title: "Players & Preferences",
    content:
      `The player${isParty ? "s" : ""} filled out a quick setup before starting:\n\n` +
      playerBlocks +
      guidance,
    relatedCharacters: players.map((p) => p.name),
    relatedLocations: [],
    secrtet: false,
    keys: [],
    type: "dm_instructions",
    alwaysOn: true,
    enabled: true,
  };
}

function buildFreeformGreeting(
  hasCharacterSheet: boolean,
  players?: FreeformPlayerSetup[],
): string {
  if (players && players.length > 1) {
    const names = players.map((p) => p.name);
    const nameList =
      names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
    return (
      `Welcome, ${nameList}! I've read through what everyone's looking for - this is going to be fun.\n\n` +
      "Tell me what kind of world you all want to play in (genre, tone, setting), " +
      "or just say \"surprise me\" and I'll cook something up that fits the whole table."
    );
  }
  if (players && players.length === 1) {
    return (
      `Welcome, ${players[0].name}! I've got your preferences in front of me.\n\n` +
      "Tell me what kind of story you're in the mood for (genre, tone, setting), " +
      "or just say \"surprise me\" and I'll take it from there."
    );
  }
  if (hasCharacterSheet) {
    return (
      "Welcome back! I can see the character and notes you brought with you.\n\n" +
      "Tell me what kind of story you're in the mood for (genre, tone, setting), " +
      "or just say \"surprise me\" and I'll take it from there."
    );
  }
  return (
    "Welcome! There's no adventure set up yet - so let's build one together.\n\n" +
    "Tell me what kind of story you're in the mood for (genre, tone, a character concept, anything at all), " +
    "or just say \"surprise me\" and I'll take it from there."
  );
}

/**
 * Creates a new local story with no premise, lore, stats, or character
 * schema - just a single GM greeting. This is the "Freeform Story" entry
 * point: instead of going through the Creator wizard, the player talks
 * directly to the GM, who interviews them briefly and sets up the world and
 * character on the fly via tool calls (see the "FRESH STORY" block in
 * buildGMStagePrompt).
 *
 * When `setup.players` is provided (guided wizard flow), the players'
 * names/personalities/wishes are baked into a pinned `dm_instructions`
 * note, and 2+ players enables couch co-op with named/colored players.
 * `setup.diceMode` chooses who rolls the dice: "ai" (default) or "manual"
 * (the players roll physical dice; the GM collects results via
 * ask_for_roll).
 */
export async function startFreeformStoryLocally(
  playerName: string = "Player",
  initialLore?: StoryLore[],
  setup?: { players?: FreeformPlayerSetup[]; diceMode?: DiceMode },
  initialTables?: CustomTable[],
): Promise<string> {
  const localId = `local_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 9)}`;

  const defaultUserNotes =
    typeof window !== "undefined"
      ? localStorage.getItem("defaultUserNotes") || ""
      : "";

  const hasCharacterSheet = (initialLore || []).some(
    (l) => l.type === "character_sheet",
  );

  const players = setup?.players?.filter((p) => p.name.trim());
  const lore: StoryLore[] = [...(initialLore || [])];
  if (players && players.length > 0) {
    lore.push(buildPlayerPreferencesNote(players));
  }

  const resolvedPlayerName =
    players && players.length > 0
      ? players.map((p) => p.name).join(" & ")
      : playerName;

  const multiplayer =
    players && players.length > 1
      ? {
          enabled: true,
          mode: "any" as const,
          couchPlayers: players.map((p) => ({
            id: p.id,
            name: p.name,
            color: p.color,
            personalityTags: p.personality.length ? p.personality : undefined,
            wishTags: p.wishTags.length ? p.wishTags : undefined,
            archetype: p.archetype,
          })),
        }
      : undefined;

  // Solo equivalent of the per-CouchPlayer tags above - only meaningful when
  // there's exactly one wizard-configured player (a real multi-player table
  // stores tags per CouchPlayer instead; the legacy `playerName`-only path
  // has no tags to persist).
  const soloPlayer =
    players && players.length === 1 ? players[0] : undefined;

  const newStoryData = {
    story_name: "New Story",
    premise: "",
    player_name: resolvedPlayerName,
    player_summary: "",
    player_notes: defaultUserNotes,
    playerPersonalityTags: soloPlayer?.personality.length
      ? soloPlayer.personality
      : undefined,
    playerWishTags: soloPlayer?.wishTags.length
      ? soloPlayer.wishTags
      : undefined,
    playerArchetype: soloPlayer?.archetype,
    intro: "",
    memory: [],
    max_chapters: 0,
    currentChapter: 0,
    chapters: [],
    multiplayer,
    diceMode: setup?.diceMode || "ai",
    scene: {
      parts: [
        {
          content: buildFreeformGreeting(hasCharacterSheet, players),
          imageUrl: "",
          user: false,
          role: "assistant",
          choices: [],
        },
      ],
    },
    stats: [],
    resources: [],
    inventory: [],
    abilities: [],
    lore,
    customTables: initialTables || [],
    goals: [],
    relationships: [],
    npcs: [],
  } as unknown as StoryData;

  await saveLocalStory(localId, newStoryData);

  return localId;
}

/**
 * Creates a minimal local story shell for a guest who is about to join an
 * online room from the home page or Library - i.e. before they have any
 * story of their own. `/story` needs an existing local storyId to load, so
 * this exists purely as that placeholder: a single "connecting" scene part
 * with no choices, which gets fully overwritten once the host's first
 * state_snapshot arrives (see the onSnapshot handler in story/page.tsx).
 */
export async function createJoinPlaceholderStory(
  playerName: string = "Player",
): Promise<string> {
  const localId = `local_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 9)}`;

  const newStoryData = {
    story_name: "Joining room...",
    premise: "",
    player_name: playerName,
    player_summary: "",
    player_notes: "",
    intro: "",
    memory: [],
    max_chapters: 0,
    currentChapter: 0,
    chapters: [],
    scene: {
      parts: [
        {
          content: "Connecting to the room...",
          imageUrl: "",
          user: false,
          role: "assistant",
          choices: [],
        },
      ],
    },
    stats: [],
    resources: [],
    inventory: [],
    abilities: [],
    lore: [],
    customTables: [],
    goals: [],
    relationships: [],
    npcs: [],
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

/**
 * Clear folder_id on every story that references a given folder.
 * Used when a shared LocalFolder is deleted (from any tab) so stories
 * become uncategorized instead of pointing at a dangling folder id.
 */
export async function unassignFolderFromStories(folderId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        const story = cursor.value as LocalStory;
        if (story.folder_id === folderId) {
          story.folder_id = null;
          cursor.update(story);
        }
        cursor.continue();
      }
    };
    request.onerror = () => reject(request.error);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function deleteLocalStory(storyId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      [STORE_NAME, UNDO_STORE_NAME],
      "readwrite",
    );
    transaction.objectStore(STORE_NAME).delete(storyId);
    transaction.objectStore(UNDO_STORE_NAME).delete(storyId);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

interface UndoStackRecord {
  storyId: string;
  snapshots: StoryData[];
}

// Undo/Retry's pre-turn state history - kept out of the StoryData blob
// itself (and out of Supabase sync) since it's a purely local, session-
// spanning convenience: it must survive a page reload (hence IndexedDB,
// not a React ref) but has no reason to sync across devices or bloat the
// synced story record.
export async function getUndoStack(storyId: string): Promise<StoryData[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([UNDO_STORE_NAME], "readonly");
    const store = transaction.objectStore(UNDO_STORE_NAME);
    const request = store.get(storyId);

    request.onsuccess = () => {
      const record = request.result as UndoStackRecord | undefined;
      resolve(record?.snapshots || []);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveUndoStack(
  storyId: string,
  snapshots: StoryData[],
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([UNDO_STORE_NAME], "readwrite");
    const store = transaction.objectStore(UNDO_STORE_NAME);
    const trimmed = snapshots.slice(-MAX_UNDO_STACK_SIZE);

    if (trimmed.length === 0) {
      store.delete(storyId);
    } else {
      store.put({ storyId, snapshots: trimmed } as UndoStackRecord);
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

