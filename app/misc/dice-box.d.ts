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
    // it gets. Scaling these by the drag distance is how the throw gesture
    // controls power while keeping dice-box's own (in-bounds, downward,
    // inward) throw direction.
    throwForce?: number;
    spinForce?: number;
    // Patched in via scripts/patchDiceBox.mjs - not part of upstream dice-box.
    // No longer used to drive the throw (the natural throwForce/spinForce
    // path above does), but kept so a leftover value can be cleared to null.
    customThrowVelocity?: [number, number, number] | null;
    customThrowSpin?: [number, number, number] | null;
  }

  export default class DiceBox {
    constructor(options: DiceBoxOptions);
    init(): Promise<void>;
    // An array of notations ("['2d6','1d4']") throws every pool in the same
    // toss and comes back as one flat DieResult[], each die tagged with the
    // groupId of the notation entry it came from.
    roll(notation: string | string[]): Promise<DieResult[]>;
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
