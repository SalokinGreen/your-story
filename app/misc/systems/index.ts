/**
 * The built-in default systems. Kept in memory, never written to IndexedDB
 * (decision 81). Empty until slice 8 adds Blood & Bone.
 */
import type { LibraryNote } from "../localNotesLibraryManager";
import type { LocalAdventure } from "../localAdventureManager";
import type {
  BuiltinAdventure,
  BuiltinNote,
  BuiltinPack,
  BuiltinSystem,
} from "./types";

export type {
  BuiltinNote,
  BuiltinPack,
  BuiltinAdventure,
  BuiltinSystem,
} from "./types";

export const BUILTIN_SYSTEMS: BuiltinSystem[] = [];

export function isBuiltinId(id: string | undefined): boolean {
  return typeof id === "string" && id.startsWith("builtin:");
}

export function getBuiltinNote(
  id: string,
  systems: BuiltinSystem[] = BUILTIN_SYSTEMS,
): (BuiltinNote & { packId: string; systemId: string }) | undefined {
  for (const system of systems) {
    for (const pack of system.packs) {
      const note = pack.notes.find((n) => n.id === id);
      if (note) return { ...note, packId: pack.id, systemId: system.id };
    }
  }
  return undefined;
}

/** Fixed, so a built-in note looks the same on every render and every run. */
export const BUILTIN_TIMESTAMP = "2026-01-01T00:00:00.000Z";

/**
 * The pack's notes in the shape the library picker lists. Nothing here is
 * stored: `builtIn` marks them, and a note with that mark is never written to
 * IndexedDB (the library handlers refuse a built-in id).
 */
export function builtinPackToLibraryNotes(pack: BuiltinPack): LibraryNote[] {
  return pack.notes.map((n) => ({
    id: n.id,
    title: n.title,
    content: n.content,
    type: n.type,
    tags: n.tags ?? [],
    pinned: false,
    source: "manual" as const,
    relatedCharacters: [],
    relatedLocations: [],
    keys: n.keys ?? [],
    createdAt: BUILTIN_TIMESTAMP,
    updatedAt: BUILTIN_TIMESTAMP,
    builtIn: { systemId: pack.systemId, packId: pack.id },
    ...(n.visibility ? { visibility: n.visibility } : {}),
  }));
}

/** One built-in note as a library note, for push/pull to read; undefined if the id is not built in. */
export function getBuiltinLibraryNote(
  id: string,
  systems: BuiltinSystem[] = BUILTIN_SYSTEMS,
): LibraryNote | undefined {
  for (const system of systems) {
    for (const pack of system.packs) {
      if (pack.notes.some((n) => n.id === id)) {
        return builtinPackToLibraryNotes(pack).find((n) => n.id === id);
      }
    }
  }
  return undefined;
}

/**
 * A starter as a LocalAdventure the Play flow can start. Never saved, so its
 * id stays `builtin:`-prefixed and no list or sync path ever sees it.
 */
export function builtinAdventureToLocal(a: BuiltinAdventure): LocalAdventure {
  return {
    id: a.id,
    title: a.adventure.title ?? "Adventure",
    description:
      a.adventure.shortDescription ?? a.adventure.description ?? "",
    updatedAt: new Date(BUILTIN_TIMESTAMP),
    adventureData: a.adventure,
    folder_id: null,
    syncStatus: "local-only",
  };
}
