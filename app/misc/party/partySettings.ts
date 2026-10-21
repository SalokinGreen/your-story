// Party mode's one setting: how long a player who lost the spotlight to a
// steal is locked out of taking it back (decision 24). Couch mode keeps its
// own fixed 4 s (floorControl.ts); this is separate, and kept on the device.

import { PARTY_SPOTLIGHT_COOLDOWN_MS } from "./protocol";

export const PARTY_COOLDOWN_STORAGE_KEY = "partySpotlightCooldownMs";
export const PARTY_COOLDOWN_MIN_MS = 3000;
export const PARTY_COOLDOWN_MAX_MS = 60000;

export function clampCooldownMs(ms: number): number {
  if (!Number.isFinite(ms)) return PARTY_SPOTLIGHT_COOLDOWN_MS;
  return Math.min(PARTY_COOLDOWN_MAX_MS, Math.max(PARTY_COOLDOWN_MIN_MS, Math.round(ms)));
}

export function loadCooldownMs(): number {
  try {
    const raw = localStorage.getItem(PARTY_COOLDOWN_STORAGE_KEY);
    if (raw === null) return PARTY_SPOTLIGHT_COOLDOWN_MS;
    return clampCooldownMs(Number(raw));
  } catch {
    return PARTY_SPOTLIGHT_COOLDOWN_MS;
  }
}

export function saveCooldownMs(ms: number): number {
  const clamped = clampCooldownMs(ms);
  try {
    localStorage.setItem(PARTY_COOLDOWN_STORAGE_KEY, String(clamped));
  } catch {
    // Not persisted; the value still applies for this session.
  }
  return clamped;
}
