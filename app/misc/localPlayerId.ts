/**
 * Persistent local player identity, used in place of a backend auth user id
 * now that the app is fully local (no accounts). Used for local multiplayer
 * "host" role comparisons - since there's no backend, cross-device sync
 * isn't possible either way, so this simply preserves the existing
 * shared-device pass-and-play UX without requiring real authentication.
 */

const STORAGE_KEY = "yourStory_localPlayerId";

export function getLocalPlayerId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = `local_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}
