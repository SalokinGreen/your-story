// The app's side of the private channel into @3d-dice/dice-box's physics
// worker, used to hold the dice under the player's pointer and let go of them.
//
// dice-box has no API for this. Its own `updateConfig` does reach the physics
// worker, but it rebuilds the tray's six wall bodies and rescales every
// collider on each call, which is far too heavy to run at pointer-move rate -
// so scripts/patchDiceBox.mjs injects a BroadcastChannel listener into the
// worker instead, and this module is the other end of it. The message shapes
// here and the ones in that script have to move together.
//
// Everything degrades rather than throws: if BroadcastChannel is missing, or
// the injected listener isn't there (an unpatched dice-box), `open()` hands
// back null after the handshake times out and the caller throws the dice
// without the held phase.

import type { Vector3 } from "./diceThrow";

/** Must match CONTROL_CHANNEL in scripts/patchDiceBox.mjs. */
export const DICE_CONTROL_CHANNEL = "ys-dice-control";

// How long to wait for the worker to answer. This is a same-origin
// postMessage round trip to an already-running worker, so it is effectively
// instant when it works at all - the timeout only exists so an unpatched or
// unsupported environment falls through quickly instead of hanging the tray.
const ACK_TIMEOUT_MS = 400;

interface GrabOptions {
  /** Servo gain pulling a held die toward the hand, in 1/sec. */
  stiffness: number;
  /** Ceiling on that servo velocity, in units/sec. */
  maxSpeed: number;
  /** How far apart the dice sit around the hand, in world units. */
  spread: number;
}

export interface DiceRelease {
  /**
   * Where dice that haven't spawned yet should be born, or null to leave that
   * wherever it was - which is what abandoning a gesture wants, since it is
   * only opening the hand, not aiming anything.
   */
  position: Vector3 | null;
  /** Velocity every die leaves the hand with. */
  velocity: Vector3;
  /** Angular velocity, or null to keep the tumble the dice already had. */
  spin: Vector3 | null;
}

export class DiceControlChannel {
  #channel: BroadcastChannel;
  #nextId = 0;
  #pending = new Map<number, (ok: boolean) => void>();

  private constructor(channel: BroadcastChannel) {
    this.#channel = channel;
    this.#channel.onmessage = (event: MessageEvent) => {
      const { action, id } = (event.data ?? {}) as {
        action?: string;
        id?: number;
      };
      if (action !== "ys-ready" && action !== "ys-grabbed") return;
      if (typeof id !== "number") return;
      this.#pending.get(id)?.(true);
    };
  }

  /**
   * Opens the channel and confirms the worker is listening on it. Returns null
   * when it isn't, which is the signal to fall back to a throw with no held
   * phase.
   */
  static async open(): Promise<DiceControlChannel | null> {
    if (typeof BroadcastChannel !== "function") return null;
    let channel: DiceControlChannel;
    try {
      channel = new DiceControlChannel(new BroadcastChannel(DICE_CONTROL_CHANNEL));
    } catch {
      return null;
    }
    if (await channel.#request("ys-ping", {})) return channel;
    channel.close();
    return null;
  }

  /**
   * Closes the hand at `target`. Resolves once the worker confirms, so the
   * caller can start the roll knowing the dice will be born held - the roll
   * and this message travel over different ports, with no ordering guarantee
   * between them.
   */
  grab(target: Vector3, options: GrabOptions): Promise<boolean> {
    return this.#request("ys-grab", { target, ...options });
  }

  /** Moves the hand. Fire-and-forget: the next one supersedes it anyway. */
  move(target: Vector3): void {
    this.#post({ action: "ys-move", target });
  }

  /** Opens the hand, throwing whatever it holds. */
  release(release: DiceRelease): void {
    this.#post({ action: "ys-release", ...release });
  }

  /**
   * Opens the hand without throwing anything, dropping whatever it holds.
   *
   * A closed hand is worker state that outlives any one gesture, so every way
   * a throw can end early - the player skipping, the modal closing, a new
   * request arriving mid-drag - has to come through here. Otherwise the next
   * roll's dice are born held and never fall, and the tray hangs waiting for
   * them to settle.
   */
  openHand(): void {
    this.release({ position: null, velocity: [0, 0, 0], spin: null });
  }

  close(): void {
    for (const resolve of this.#pending.values()) resolve(false);
    this.#pending.clear();
    this.#channel.onmessage = null;
    this.#channel.close();
  }

  #post(message: Record<string, unknown>): void {
    try {
      this.#channel.postMessage(message);
    } catch {
      // A closed channel (the tray was torn down mid-gesture) - nothing to do
      // but let the gesture end.
    }
  }

  #request(action: string, payload: Record<string, unknown>): Promise<boolean> {
    const id = this.#nextId++;
    return new Promise<boolean>((resolve) => {
      const settle = (ok: boolean) => {
        if (!this.#pending.delete(id)) return;
        clearTimeout(timer);
        resolve(ok);
      };
      const timer = setTimeout(() => settle(false), ACK_TIMEOUT_MS);
      this.#pending.set(id, settle);
      this.#post({ action, id, ...payload });
    });
  }
}
