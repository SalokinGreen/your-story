// Minimal ambient module declaration for the spike - @3d-dice/dice-box ships
// no TypeScript types. Only covers the surface this spike actually calls.
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
    updateConfig(options: DiceBoxConfigUpdate): Promise<this>;
  }
}
