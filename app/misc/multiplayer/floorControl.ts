// Party-voice "talking stick" floor control, shared by couch co-op (one
// device, local floor) and networked co-op (host-authoritative floor). Kept as
// a pure, transport- and React-agnostic state machine so it can be unit-tested
// and reused on both the host (arbitrating floor_take/floor_release) and, for
// couch play, directly inside PlayerBubbles.
//
// Core rule: only one player holds the mic at a time (last presser wins). When
// someone takes the floor from a *different* current holder, that interrupted
// player is briefly locked out so they can't immediately steal it back - this
// simulates real people talking over each other and stops two players from
// ping-ponging the mic.

export interface FloorState {
  holderId: string | null;
  // playerId -> epoch ms until which they may not take the floor again.
  lockouts: Map<string, number>;
}

// How long an interrupted player must wait before they can grab the floor
// again. Long enough to break a steal-back reflex, short enough not to feel
// punitive if the interrupter quickly yields.
export const FLOOR_STEAL_COOLDOWN_MS = 4000;

export function createFloor(): FloorState {
  return { holderId: null, lockouts: new Map() };
}

export function isLockedOut(state: FloorState, playerId: string, now: number): boolean {
  const until = state.lockouts.get(playerId);
  return until !== undefined && now < until;
}

// Attempt to give `playerId` the floor at time `now`.
// - Denied (no change) if they're currently locked out.
// - Otherwise granted. If they interrupted a *different* holder, that previous
//   holder is locked out for `cooldownMs` so they can't steal it right back.
//   Taking a floor that's free (or re-taking one you already hold) locks out
//   nobody.
export function takeFloor(
  state: FloorState,
  playerId: string,
  now: number,
  cooldownMs: number = FLOOR_STEAL_COOLDOWN_MS,
): { granted: boolean; changed: boolean } {
  if (isLockedOut(state, playerId, now)) {
    return { granted: false, changed: false };
  }
  if (state.holderId === playerId) {
    // Already holds it - taking again is a no-op, not a self-interrupt.
    return { granted: true, changed: false };
  }
  const previousHolder = state.holderId;
  state.holderId = playerId;
  // Whoever just grabbed the mic is obviously no longer locked out.
  state.lockouts.delete(playerId);
  if (previousHolder && previousHolder !== playerId) {
    state.lockouts.set(previousHolder, now + cooldownMs);
  }
  return { granted: true, changed: true };
}

// Release the floor if `playerId` currently holds it. A voluntary release
// carries no lockout - only being interrupted does.
export function releaseFloor(
  state: FloorState,
  playerId: string,
): { changed: boolean } {
  if (state.holderId !== playerId) return { changed: false };
  state.holderId = null;
  return { changed: true };
}

// Drop any lockouts that have expired as of `now`. Returns whether anything
// changed (so a caller can decide whether to rebroadcast floor state).
export function pruneLockouts(state: FloorState, now: number): boolean {
  let changed = false;
  for (const [playerId, until] of state.lockouts) {
    if (now >= until) {
      state.lockouts.delete(playerId);
      changed = true;
    }
  }
  return changed;
}

// Ids currently locked out (not yet expired at `now`).
export function lockedOutIds(state: FloorState, now: number): string[] {
  const ids: string[] = [];
  for (const [playerId, until] of state.lockouts) {
    if (now < until) ids.push(playerId);
  }
  return ids;
}
