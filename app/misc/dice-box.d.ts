// Minimal ambient module declaration for @3d-dice/dice-box - it ships no
// TypeScript types. Only covers the surface this app actually calls
// (app/components/DiceThrowModal.tsx, app/dev/dice-spike).
declare module "@3d-dice/dice-box" {
  export interface DieResult {
    sides: number | string;
    value: number;
    [key: string]: unknown;
  }

  export interface DiceBoxOptions {
    container?: string;
    assetPath: string;
    theme?: string;
    scale?: number;
  }

  export interface DiceBoxConfigUpdate {
    // Patched in via scripts/patchDiceBox.mjs - not part of upstream dice-box.
    customThrowVelocity?: [number, number, number] | null;
    customThrowSpin?: [number, number, number] | null;
  }

  export default class DiceBox {
    constructor(options: DiceBoxOptions);
    init(): Promise<void>;
    roll(notation: string): Promise<DieResult[]>;
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
