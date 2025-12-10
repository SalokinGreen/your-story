/**
 * Dice Formula Parser and Roller
 *
 * Parses and rolls dice formulas like:
 * - "1d20+5" - Roll 1d20, add 5
 * - "2d6+{{STR_mod}}" - Roll 2d6, add STR modifier from character
 * - "4d6kh3" - Roll 4d6, keep highest 3
 * - "2d20kl1" - Roll 2d20, keep lowest 1 (disadvantage)
 * - "1d6!" - Exploding d6 (reroll and add on max)
 * - "1d20+{{proficiency}}+{{DEX_mod}}" - Multiple variables
 */

// ============================================
// TYPES
// ============================================

export interface DiceRoll {
  /** Number of dice to roll */
  count: number;
  /** Number of sides on each die */
  sides: number;
  /** Keep highest N dice (optional) */
  keepHighest?: number;
  /** Keep lowest N dice (optional) */
  keepLowest?: number;
  /** Whether dice explode on max value */
  exploding?: boolean;
}

export interface FormulaToken {
  type: "dice" | "modifier" | "variable" | "operator";
  value: DiceRoll | number | string;
  raw: string;
}

export interface ParsedFormula {
  tokens: FormulaToken[];
  raw: string;
  /** Variables referenced in the formula */
  variables: string[];
}

export interface RollResult {
  /** Total result after all calculations */
  total: number;
  /** Individual dice results grouped by dice type */
  rolls: DiceGroupResult[];
  /** Modifiers applied */
  modifiers: number;
  /** Variables that were substituted */
  substitutedVariables: Record<string, number>;
  /** The original formula */
  formula: string;
  /** Human-readable breakdown */
  breakdown: string;
}

export interface DiceGroupResult {
  /** Original dice notation (e.g., "2d6") */
  notation: string;
  /** All dice rolled (before keep filtering) */
  allRolls: number[];
  /** Dice kept after kh/kl filtering */
  keptRolls: number[];
  /** Dice dropped by kh/kl */
  droppedRolls: number[];
  /** Sum of kept dice */
  subtotal: number;
  /** Whether any dice exploded */
  explosions: number;
}

export type VariableResolver = (name: string) => number | undefined;

// ============================================
// REGEX PATTERNS
// ============================================

// Matches dice notation: 2d6, 1d20kh1, 4d6kl3, 1d6!
const DICE_PATTERN = /^(\d+)d(\d+)(kh\d+|kl\d+)?(!)?$/i;

// Matches variable: {{variable_name}}
const VARIABLE_PATTERN = /^\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}$/;

// Matches modifier: +5, -3
const MODIFIER_PATTERN = /^[+-]?\d+$/;

// Tokenizer pattern - splits formula into parts
const TOKENIZER_PATTERN =
  /(\d+d\d+(?:kh\d+|kl\d+)?!?|\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\}|[+-]?\d+|[+-])/gi;

// ============================================
// PARSER
// ============================================

/**
 * Parse a dice formula into tokens
 * @param formula - The formula string (e.g., "1d20+{{STR_mod}}+5")
 * @returns Parsed formula with tokens and variable list
 */
export function parseFormula(formula: string): ParsedFormula {
  const tokens: FormulaToken[] = [];
  const variables: string[] = [];

  // Clean up the formula
  const cleanFormula = formula.trim().replace(/\s+/g, "");

  if (!cleanFormula) {
    return { tokens: [], raw: formula, variables: [] };
  }

  // Tokenize
  const matches = cleanFormula.match(TOKENIZER_PATTERN);

  if (!matches) {
    throw new Error(`Invalid formula: "${formula}"`);
  }

  let expectOperator = false;

  for (const match of matches) {
    // Check if it's just an operator
    if (match === "+" || match === "-") {
      tokens.push({ type: "operator", value: match, raw: match });
      expectOperator = false;
      continue;
    }

    // Try to parse as dice
    const diceMatch = match.match(DICE_PATTERN);
    if (diceMatch) {
      const count = parseInt(diceMatch[1], 10);
      const sides = parseInt(diceMatch[2], 10);
      const keepMod = diceMatch[3];
      const exploding = !!diceMatch[4];

      const dice: DiceRoll = { count, sides, exploding };

      if (keepMod) {
        const keepType = keepMod.substring(0, 2).toLowerCase();
        const keepCount = parseInt(keepMod.substring(2), 10);

        if (keepType === "kh") {
          dice.keepHighest = keepCount;
        } else if (keepType === "kl") {
          dice.keepLowest = keepCount;
        }
      }

      // Add implicit + if needed
      if (expectOperator && tokens.length > 0) {
        tokens.push({ type: "operator", value: "+", raw: "+" });
      }

      tokens.push({ type: "dice", value: dice, raw: match });
      expectOperator = true;
      continue;
    }

    // Try to parse as variable
    const varMatch = match.match(VARIABLE_PATTERN);
    if (varMatch) {
      const varName = varMatch[1];
      variables.push(varName);

      // Add implicit + if needed
      if (expectOperator && tokens.length > 0) {
        tokens.push({ type: "operator", value: "+", raw: "+" });
      }

      tokens.push({ type: "variable", value: varName, raw: match });
      expectOperator = true;
      continue;
    }

    // Try to parse as modifier (number with optional sign)
    if (MODIFIER_PATTERN.test(match)) {
      const value = parseInt(match, 10);

      // If it starts with + or -, extract the operator
      if (match.startsWith("+") || match.startsWith("-")) {
        const operator = match[0];
        const absValue = Math.abs(value);

        // Only add operator if we're not at the start
        if (tokens.length > 0) {
          tokens.push({ type: "operator", value: operator, raw: operator });
        }
        tokens.push({
          type: "modifier",
          value: operator === "-" ? -absValue : absValue,
          raw: match,
        });
      } else {
        // Plain number, add implicit + if needed
        if (expectOperator && tokens.length > 0) {
          tokens.push({ type: "operator", value: "+", raw: "+" });
        }
        tokens.push({ type: "modifier", value, raw: match });
      }
      expectOperator = true;
      continue;
    }

    throw new Error(`Unrecognized token in formula: "${match}"`);
  }

  return {
    tokens,
    raw: formula,
    variables: [...new Set(variables)], // Dedupe
  };
}

// ============================================
// ROLLER
// ============================================

/**
 * Roll a single die
 */
function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

/**
 * Roll a dice group (e.g., 2d6kh1!)
 */
function rollDiceGroup(dice: DiceRoll): DiceGroupResult {
  const allRolls: number[] = [];
  let explosions = 0;

  // Roll all dice
  for (let i = 0; i < dice.count; i++) {
    let roll = rollDie(dice.sides);
    allRolls.push(roll);

    // Handle exploding dice
    if (dice.exploding) {
      while (roll === dice.sides) {
        roll = rollDie(dice.sides);
        allRolls.push(roll);
        explosions++;
      }
    }
  }

  // Apply keep highest/lowest
  let keptRolls = [...allRolls];
  let droppedRolls: number[] = [];

  if (dice.keepHighest !== undefined) {
    const sorted = [...allRolls].sort((a, b) => b - a);
    keptRolls = sorted.slice(0, dice.keepHighest);
    droppedRolls = sorted.slice(dice.keepHighest);
  } else if (dice.keepLowest !== undefined) {
    const sorted = [...allRolls].sort((a, b) => a - b);
    keptRolls = sorted.slice(0, dice.keepLowest);
    droppedRolls = sorted.slice(dice.keepLowest);
  }

  // Build notation string
  let notation = `${dice.count}d${dice.sides}`;
  if (dice.keepHighest) notation += `kh${dice.keepHighest}`;
  if (dice.keepLowest) notation += `kl${dice.keepLowest}`;
  if (dice.exploding) notation += "!";

  return {
    notation,
    allRolls,
    keptRolls,
    droppedRolls,
    subtotal: keptRolls.reduce((sum, r) => sum + r, 0),
    explosions,
  };
}

/**
 * Roll a parsed formula
 * @param parsed - The parsed formula
 * @param resolver - Function to resolve variable values
 * @returns The roll result with breakdown
 */
export function rollParsedFormula(
  parsed: ParsedFormula,
  resolver: VariableResolver
): RollResult {
  const rolls: DiceGroupResult[] = [];
  const substitutedVariables: Record<string, number> = {};
  let total = 0;
  let modifiers = 0;
  let currentOperator = "+";
  const breakdownParts: string[] = [];

  for (const token of parsed.tokens) {
    switch (token.type) {
      case "operator":
        currentOperator = token.value as string;
        break;

      case "dice": {
        const diceRoll = token.value as DiceRoll;
        const result = rollDiceGroup(diceRoll);
        rolls.push(result);

        const value =
          currentOperator === "-" ? -result.subtotal : result.subtotal;
        total += value;

        // Build breakdown
        let rollStr = `[${result.keptRolls.join(", ")}]`;
        if (result.droppedRolls.length > 0) {
          rollStr += ` (dropped: ${result.droppedRolls.join(", ")})`;
        }
        if (result.explosions > 0) {
          rollStr += ` 💥×${result.explosions}`;
        }
        breakdownParts.push(
          `${currentOperator === "-" ? "-" : ""}${
            result.notation
          }: ${rollStr} = ${result.subtotal}`
        );
        break;
      }

      case "variable": {
        const varName = token.value as string;
        const resolved = resolver(varName);

        if (resolved === undefined) {
          throw new Error(`Unknown variable: {{${varName}}}`);
        }

        substitutedVariables[varName] = resolved;
        const value = currentOperator === "-" ? -resolved : resolved;
        total += value;
        modifiers += value;

        breakdownParts.push(
          `${currentOperator === "-" ? "-" : "+"}{{${varName}}} = ${resolved}`
        );
        break;
      }

      case "modifier": {
        const value = token.value as number;
        const effectiveValue = currentOperator === "-" ? -value : value;
        total += effectiveValue;
        modifiers += effectiveValue;

        if (value !== 0) {
          breakdownParts.push(
            `${effectiveValue >= 0 ? "+" : ""}${effectiveValue}`
          );
        }
        break;
      }
    }
  }

  return {
    total,
    rolls,
    modifiers,
    substitutedVariables,
    formula: parsed.raw,
    breakdown: breakdownParts.join(" ") + ` = **${total}**`,
  };
}

/**
 * Parse and roll a formula in one step
 * @param formula - The formula string
 * @param resolver - Function to resolve variable values
 * @returns The roll result
 */
export function rollFormula(
  formula: string,
  resolver: VariableResolver = () => undefined
): RollResult {
  const parsed = parseFormula(formula);
  return rollParsedFormula(parsed, resolver);
}

// ============================================
// VARIABLE RESOLVER BUILDERS
// ============================================

/**
 * Create a variable resolver from a character's data
 * Supports:
 * - Direct stat names: {{Strength}} -> stat value
 * - Modifier suffix: {{Strength_mod}} -> floor((value - 10) / 2)
 * - Custom mappings: {{proficiency}} -> custom value
 */
export function createCharacterResolver(
  characterData: Record<string, number>,
  customMappings?: Record<string, number>
): VariableResolver {
  return (name: string) => {
    // Check custom mappings first
    if (customMappings && name in customMappings) {
      return customMappings[name];
    }

    // Direct lookup
    if (name in characterData) {
      return characterData[name];
    }

    return undefined;
  };
}

// ============================================
// VALIDATION
// ============================================

/**
 * Validate a formula without rolling
 * @param formula - The formula to validate
 * @returns Object with isValid flag and any error message
 */
export function validateFormula(formula: string): {
  isValid: boolean;
  error?: string;
  variables: string[];
} {
  try {
    const parsed = parseFormula(formula);
    return { isValid: true, variables: parsed.variables };
  } catch (e) {
    return {
      isValid: false,
      error: e instanceof Error ? e.message : "Invalid formula",
      variables: [],
    };
  }
}

/**
 * Extract all variables from a formula without parsing fully
 */
export function extractVariables(formula: string): string[] {
  const matches = formula.match(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g) || [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

// ============================================
// FORMULA BUILDING HELPERS
// ============================================

/**
 * Build a simple dice formula
 */
export function buildDiceFormula(
  count: number,
  sides: number,
  modifier?: number | string
): string {
  let formula = `${count}d${sides}`;
  if (modifier !== undefined) {
    if (typeof modifier === "number") {
      formula += modifier >= 0 ? `+${modifier}` : `${modifier}`;
    } else {
      formula += `+{{${modifier}}}`;
    }
  }
  return formula;
}

/**
 * Build an advantage roll (2d20kh1)
 */
export function buildAdvantageRoll(modifier?: number | string): string {
  return buildDiceFormula(2, 20, modifier).replace("2d20", "2d20kh1");
}

/**
 * Build a disadvantage roll (2d20kl1)
 */
export function buildDisadvantageRoll(modifier?: number | string): string {
  return buildDiceFormula(2, 20, modifier).replace("2d20", "2d20kl1");
}

// ============================================
// DISPLAY HELPERS
// ============================================

/**
 * Format a roll result for display
 */
export function formatRollResult(result: RollResult): string {
  const parts: string[] = [];

  for (const roll of result.rolls) {
    let rollStr = `${roll.notation}: [${roll.keptRolls.join(", ")}]`;
    if (roll.droppedRolls.length > 0) {
      rollStr += ` ~~${roll.droppedRolls.join(", ")}~~`;
    }
    if (roll.explosions > 0) {
      rollStr += ` 💥×${roll.explosions}`;
    }
    parts.push(rollStr);
  }

  if (result.modifiers !== 0) {
    parts.push(`${result.modifiers >= 0 ? "+" : ""}${result.modifiers}`);
  }

  return `${parts.join(" ")} = **${result.total}**`;
}

/**
 * Get the individual dice values from a roll result (flat array)
 */
export function getRollValues(result: RollResult): number[] {
  return result.rolls.flatMap((r) => r.allRolls);
}

/**
 * Get the total number of explosions in a roll
 */
export function getTotalExplosions(result: RollResult): number {
  return result.rolls.reduce((sum, r) => sum + r.explosions, 0);
}

// ============================================
// CHARACTER SCHEMA INTEGRATION
// ============================================

/**
 * Create a variable resolver from CharacterSchema data
 * This bridges the characterSchema.ts system with diceFormula.ts
 */
export function createSchemaBasedResolver(
  characterValues: Record<string, unknown>,
  additionalMappings?: Record<string, number>
): VariableResolver {
  return (name: string) => {
    // Check additional mappings first (e.g., DC, advantage count)
    if (additionalMappings && name in additionalMappings) {
      return additionalMappings[name];
    }

    // Get value from character data
    const value = characterValues[name];

    if (value === undefined) {
      return undefined;
    }

    // Handle different value types
    if (typeof value === "number") return value;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value === "object" && value !== null && "current" in value) {
      return (value as { current: number }).current;
    }
    if (Array.isArray(value)) return value.length;

    return undefined;
  };
}
