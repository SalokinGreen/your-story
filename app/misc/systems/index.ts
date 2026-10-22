/**
 * The built-in default systems. Kept in memory, never written to IndexedDB
 * (decision 81). Empty until slice 8 adds Blood & Bone.
 */
import type { BuiltinNote, BuiltinSystem } from "./types";

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
