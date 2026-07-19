/**
 * Local Notes Library Manager
 *
 * Persistent, cross-story collection of notes (manually written or OCR-derived
 * from PDFs). Stored in IndexedDB, independent of any single story/adventure.
 */

import { LoreType, StoryLore } from "./structs";

const DB_NAME = "YourStoryNotesLibraryDB";
const STORE_NAME = "notes_library";
const DB_VERSION = 1;

export interface LibraryNote {
  id: string;
  title: string;
  content: string;
  type: LoreType;
  tags: string[];
  folderId?: string;
  pinned?: boolean;
  source: "manual" | "ocr";
  sourceFile?: string;
  relatedCharacters: string[];
  relatedLocations: string[];
  keys: string[];
  createdAt: string;
  updatedAt: string;
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
        const objectStore = db.createObjectStore(STORE_NAME, {
          keyPath: "id",
        });
        objectStore.createIndex("folderId", "folderId", { unique: false });
        objectStore.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
  });
}

function generateId(): string {
  return `note_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create and save a new library note
 */
export async function createLibraryNote(
  note: Omit<LibraryNote, "id" | "createdAt" | "updatedAt">
): Promise<LibraryNote> {
  const now = new Date().toISOString();
  const newNote: LibraryNote = {
    ...note,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(newNote);

    request.onsuccess = () => resolve(newNote);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save (insert or overwrite) a library note as-is
 */
export async function saveLibraryNote(note: LibraryNote): Promise<LibraryNote> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(note);

    request.onsuccess = () => resolve(note);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get a specific library note by ID
 */
export async function getLibraryNote(
  noteId: string
): Promise<LibraryNote | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(noteId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * List all library notes, sorted by updatedAt (newest first)
 */
export async function listLibraryNotes(): Promise<LibraryNote[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const notes = (request.result as LibraryNote[]).sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      resolve(notes);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Update an existing library note (partial update, bumps updatedAt)
 */
export async function updateLibraryNote(
  noteId: string,
  updates: Partial<Omit<LibraryNote, "id" | "createdAt">>
): Promise<LibraryNote | undefined> {
  const existing = await getLibraryNote(noteId);
  if (!existing) return undefined;

  const updated: LibraryNote = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  return saveLibraryNote(updated);
}

/**
 * Convert a library note into a per-story lore entry, tagged with
 * libraryNoteId so it stays linked back to the library (push/pull) instead
 * of becoming a disconnected one-time copy.
 */
export function libraryNoteToStoryLore(note: LibraryNote): StoryLore {
  return {
    title: note.title,
    content: note.content,
    relatedCharacters: note.relatedCharacters,
    relatedLocations: note.relatedLocations,
    secrtet: note.type === "secret",
    keys: note.keys,
    type: note.type,
    alwaysOn: note.type === "mechanics" || note.type === "character_sheet",
    on: true,
    tags: note.tags,
    libraryNoteId: note.id,
  };
}

/**
 * Build the library-note fields from a story lore entry, for saving a
 * story-authored note into the global library (either as a new note or as
 * an update to the note it's already linked to).
 */
export function storyLoreToLibraryNoteFields(
  lore: StoryLore
): Omit<LibraryNote, "id" | "createdAt" | "updatedAt"> {
  return {
    title: lore.title,
    content: lore.content,
    type: lore.type || "lore",
    tags: lore.tags || [],
    folderId: undefined,
    pinned: lore.pinned || false,
    source: "manual",
    relatedCharacters: lore.relatedCharacters || [],
    relatedLocations: lore.relatedLocations || [],
    keys: lore.keys || [],
  };
}

/**
 * Delete a library note by ID
 */
export async function deleteLibraryNote(noteId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(noteId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete multiple library notes by ID
 */
export async function bulkDeleteLibraryNotes(noteIds: string[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    for (const id of noteIds) {
      store.delete(id);
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Move multiple library notes to a folder (or unfile them if folderId is undefined)
 */
export async function bulkMoveLibraryNotes(
  noteIds: string[],
  folderId: string | undefined
): Promise<void> {
  const db = await openDB();
  const now = new Date().toISOString();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    for (const id of noteIds) {
      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const note = getRequest.result as LibraryNote | undefined;
        if (note) {
          note.folderId = folderId;
          note.updatedAt = now;
          store.put(note);
        }
      };
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Clear folderId on every note that references a given folder.
 * Used when a shared LocalFolder is deleted (from any tab) so notes
 * become uncategorized instead of pointing at a dangling folder id.
 */
export async function unassignFolderFromNotes(folderId: string): Promise<void> {
  const db = await openDB();
  const now = new Date().toISOString();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("folderId");
    const request = index.openCursor(IDBKeyRange.only(folderId));

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        const note = cursor.value as LibraryNote;
        note.folderId = undefined;
        note.updatedAt = now;
        cursor.update(note);
        cursor.continue();
      }
    };
    request.onerror = () => reject(request.error);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
