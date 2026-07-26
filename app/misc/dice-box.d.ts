// Minimal ambient module declaration for @3d-dice/dice-box - it ships no
// TypeScript types. Only covers the surface this app actually calls
// (app/components/DiceThrowModal.tsx, app/dev/dice-spike).
declare module "@3d-dice/dice-box" {
  export interface DieResult {
    sides: number | string;
    value: number;
    // Which notation entry this die came from when roll() was given an array
    // (["2d6", "1d4"] → groupId 0 and 1). dice-box assigns these from an
    // incrementing counter that keeps climbing across rolls, so treat them as
    // grouping keys, not indices.
    groupId?: number;
    [key: string]: unknown;
  }

  export interface DiceBoxOptions {
    container?: string;
    assetPath: string;
    theme?: string;
    scale?: number;
  }

  export interface DiceBoxConfigUpdate {
    // Upstream dice-box physics knobs (read by its rollDie()): how hard the
    // die is launched inward from its spawn edge, and how much angular spin
    // it gets. Only used for the tray's automatic spawn-in toss now - a
    // player's throw is fully described by the custom* fields below.
    throwForce?: number;
    spinForce?: number;
    // Where dice are launched from, in world space. Upstream dice-box
    // recomputes this to a random point on the tray rim before every roll, so
    // it is only honoured when the roll is issued with
    // `newStartPoint: false`.
    startPosition?: [number, number, number] | null;
    // Patched in via scripts/patchDiceBox.mjs - not part of upstream dice-box.
    // The initial linear and angular velocity of every die in the throw, which
    // is how a drag gesture aims the roll. Set both to null to fall back to
    // dice-box's own randomized throw (used for the spawn-in toss).
    customThrowVelocity?: [number, number, number] | null;
    customThrowSpin?: [number, number, number] | null;
  }

  export interface RollOptions {
    // false keeps the configured `startPosition` instead of letting dice-box
    // pick a fresh random point on the tray rim.
    newStartPoint?: boolean;
    theme?: string;
    themeColor?: string;
  }

  export default class DiceBox {
    constructor(options: DiceBoxOptions);
    init(): Promise<void>;
    // An array of notations ("['2d6','1d4']") throws every pool in the same
    // toss and comes back as one flat DieResult[], each die tagged with the
    // groupId of the notation entry it came from.
    roll(
      notation: string | string[],
      options?: RollOptions
    ): Promise<DieResult[]>;
    // Re-throws an existing set of dice (the result objects from a prior
    // roll()/add()/reroll() call, which carry groupId/rollId) rather than
    // spawning a new set - used to re-toss the dice already sitting in the
    // tray once the player performs the throw gesture. `remove: false`
    // (dice-box's default) leaves the pre-reroll dice sitting in the scene
    // alongside the new ones instead of replacing them - always pass
    // `remove: true` here unless dice are meant to visibly accumulate.
    reroll(
      notation: DieResult[] | DieResult,
      options?: { remove?: boolean; newStartPoint?: boolean }
    ): Promise<DieResult[]>;
    updateConfig(options: DiceBoxConfigUpdate): Promise<this>;
  }
}
