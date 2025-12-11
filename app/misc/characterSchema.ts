/**
 * Character Schema System
 *
 * Defines adventure-specific character structures that replace hard-coded stats.
 * Adventure authors define their own fields, formulas, and character sheet layouts.
 */

import { isGameIcon, searchGameIcons, getGameIconPath } from "./gameIcons";
import { icons } from "lucide-react";

// ============================================
// ICON RESOLUTION
// ============================================

/** All available Lucide icon names */
const LUCIDE_ICON_NAMES = Object.keys(icons);

/**
 * Resolve an icon name to an actual icon identifier.
 * Tries exact match first, then fuzzy matching against game-icons and Lucide icons.
 * Returns the best match or a fallback.
 */
export function resolveIconName(name: string): string {
  if (!name) return "circle";

  const normalized = name.toLowerCase().trim();

  // Check if it's already a valid icon (game-icon or emoji)
  if (isGameIcon(normalized)) return normalized;
  if (isGameIcon(name)) return name;

  // Check if it's an emoji
  if (/\p{Extended_Pictographic}/u.test(name)) return name;

  // Check Lucide icons (PascalCase)
  const pascalName = normalized
    .split(/[-_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  if (pascalName in icons) return pascalName;

  // Fuzzy search game-icons first (they have better RPG coverage)
  const gameMatches = searchGameIcons(normalized, 5);
  if (gameMatches.length > 0) {
    // Prefer exact substring matches
    const exactMatch = gameMatches.find(
      (id) => id === normalized || id.includes(normalized)
    );
    if (exactMatch) return exactMatch;
    return gameMatches[0];
  }

  // Fuzzy search Lucide icons
  const lucideMatch = LUCIDE_ICON_NAMES.find((iconName) =>
    iconName.toLowerCase().includes(normalized)
  );
  if (lucideMatch) return lucideMatch;

  // Try common mappings
  const iconMappings: Record<string, string> = {
    sword: "crossed-swords",
    swords: "crossed-swords",
    weapon: "crossed-swords",
    shield: "round-shield",
    armor: "breastplate",
    health: "heart-beats",
    hp: "heart-beats",
    mana: "burning-embers",
    magic: "magic-swirl",
    spell: "spell-book",
    book: "book-cover",
    potion: "potion-ball",
    gold: "two-coins",
    coin: "two-coins",
    money: "two-coins",
    inventory: "knapsack",
    bag: "knapsack",
    backpack: "knapsack",
    belt: "belt",
    combat: "crossed-swords",
    attack: "sword-brandish",
    defense: "shield",
    skill: "skills",
    ability: "skills",
    person: "person",
    user: "person",
    character: "person",
    quest: "treasure-map",
    map: "treasure-map",
    warning: "hazard-sign",
    danger: "hazard-sign",
    fire: "fire",
    water: "drop",
    earth: "stone-pile",
    air: "wind-slap",
    light: "sun",
    dark: "moon",
    death: "skull",
    life: "heart-beats",
    time: "hourglass",
    star: "star-formation",
    eye: "eye-target",
    hand: "hand",
    foot: "footprint",
    arrow: "arrow-cluster",
    bow: "pocket-bow",
  };

  if (iconMappings[normalized]) {
    return iconMappings[normalized];
  }

  // Final fallback
  return "circle";
}

// ============================================
// FIELD TYPES
// ============================================

export type SchemaFieldType =
  | "number" // Simple numeric value (e.g., Strength: 14)
  | "derived" // Calculated from formula (e.g., STR_mod = floor((Strength - 10) / 2))
  | "resource" // Current/max value (e.g., HP: 45/50)
  | "text" // String value (e.g., character name, backstory)
  | "list" // Array of strings or objects (e.g., known languages, inventory items)
  | "boolean" // True/false flag (e.g., isConcentrating)
  | "select"; // Single choice from options (e.g., class: "Fighter")

export interface SchemaFieldBase {
  /** Unique identifier for the field */
  id: string;
  /** Display name */
  name: string;
  /** Optional description/tooltip */
  description?: string;
  /** Field type */
  type: SchemaFieldType;
  /** Category for grouping in UI (e.g., "Attributes", "Skills", "Combat") */
  category?: string;
  /** Display order within category */
  order?: number;
  /** Whether field is hidden from player (GM-only) */
  hidden?: boolean;
  /** Whether field is read-only (calculated or set by system) */
  readonly?: boolean;
}

export interface NumberField extends SchemaFieldBase {
  type: "number";
  /** Default value */
  defaultValue?: number;
  /** Minimum value */
  min?: number;
  /** Maximum value */
  max?: number;
  /** Step increment for UI */
  step?: number;
}

export interface DerivedField extends SchemaFieldBase {
  type: "derived";
  /** Formula using {{variable}} syntax (e.g., "floor(({{Strength}} - 10) / 2)") */
  formula: string;
  /** Cache the calculated value */
  cachedValue?: number;
}

export interface ResourceField extends SchemaFieldBase {
  type: "resource";
  /** Default current value */
  defaultValue?: number;
  /** Default max value */
  defaultMax?: number;
  /** Whether this resource regenerates on rest */
  regenerates?: boolean;
  /** Regeneration rate per rest type (percentage) */
  regenRates?: {
    quick?: number; // e.g., 10 = 10% of max
    short?: number; // e.g., 50 = 50% of max
    long?: number; // e.g., 100 = full restore
  };
}

export interface TextField extends SchemaFieldBase {
  type: "text";
  /** Default value */
  defaultValue?: string;
  /** Max length */
  maxLength?: number;
  /** Whether to use textarea (multiline) */
  multiline?: boolean;
  /** Placeholder text */
  placeholder?: string;
}

export interface ListField extends SchemaFieldBase {
  type: "list";
  /** Default items (strings or objects) */
  defaultValue?: (string | ListItemObject)[];
  /** Max number of items */
  maxItems?: number;
  /** Predefined options to choose from (if restricted) */
  options?: string[];
  /** Whether list items are objects (with name, emoji, description, etc.) */
  objectItems?: boolean;
}

export interface BooleanField extends SchemaFieldBase {
  type: "boolean";
  /** Default value */
  defaultValue?: boolean;
  /** Label for true state */
  trueLabel?: string;
  /** Label for false state */
  falseLabel?: string;
}

export interface SelectField extends SchemaFieldBase {
  type: "select";
  /** Available options */
  options: { value: string; label: string }[];
  /** Default selected value */
  defaultValue?: string;
  /** Allow multiple selections */
  multiple?: boolean;
}

export type SchemaField =
  | NumberField
  | DerivedField
  | ResourceField
  | TextField
  | ListField
  | BooleanField
  | SelectField;

// ============================================
// CHARACTER SCHEMA
// ============================================

export interface SchemaResource {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Supabase storage URL */
  url: string;
  /** Resource type */
  type: "image" | "font" | "other";
}

export interface SchemaTemplate {
  /** HTML template with {{field_id}} placeholders and conditionals */
  html: string;
  /** CSS styles for the template */
  css: string;
  /** Optional JavaScript for interactivity (runs in sandboxed iframe) */
  js?: string;
}

/**
 * Custom page definition for adventure creators
 * Each page gets its own tab in the Stats view
 */
export interface SchemaPage {
  /** Unique identifier for the page */
  id: string;
  /** Display name shown in tab */
  name: string;
  /** Icon name (from lucide-react) */
  icon?: string;
  /** Display order in navigation */
  order?: number;
  /** Custom HTML/CSS/JS template for this page */
  template: SchemaTemplate;
}

export interface CharacterSchema {
  /** Schema version for migrations */
  version: number;
  /** Schema name (e.g., "D&D 5e", "Call of Cthulhu") */
  name: string;
  /** Description of the system */
  description?: string;
  /** Field definitions */
  fields: SchemaField[];
  /** Categories for organizing fields */
  categories?: SchemaCategory[];
  /** Custom HTML/CSS/JS template for character sheet (optional) */
  template?: SchemaTemplate;
  /** Uploaded resources (images, fonts) for use in templates */
  resources?: SchemaResource[];
  /** Whether this schema contains custom JavaScript (triggers warning) */
  hasCustomJS?: boolean;
  /** Custom pages defined by adventure creator (each gets its own tab) */
  pages?: SchemaPage[];
}

/** Category for organizing schema fields in UI */
export interface SchemaCategory {
  id: string;
  name: string;
  order?: number;
  collapsed?: boolean;
}

// ============================================
// CHARACTER DATA
// ============================================

/** Runtime character data matching the schema */
export interface CharacterData {
  /** Field values keyed by field ID */
  values: Record<string, CharacterFieldValue>;
}

/** Item in an object list - flexible structure for inventory-like lists */
export interface ListItemObject {
  name: string;
  emoji?: string;
  description?: string;
  quantity?: number;
  [key: string]: string | number | boolean | undefined;
}

export type CharacterFieldValue =
  | number
  | string
  | boolean
  | string[]
  | ListItemObject[]
  | (string | ListItemObject)[]
  | { current: number; max: number };

// ============================================
// SCHEMA HELPERS
// ============================================

/**
 * Create default character data from a schema
 */
export function createDefaultCharacterData(
  schema: CharacterSchema
): CharacterData {
  const values: Record<string, CharacterFieldValue> = {};

  for (const field of schema.fields) {
    switch (field.type) {
      case "number":
        values[field.id] = field.defaultValue ?? 0;
        break;
      case "derived":
        // Derived fields start at 0, will be calculated
        values[field.id] = 0;
        break;
      case "resource":
        values[field.id] = {
          current: field.defaultValue ?? field.defaultMax ?? 0,
          max: field.defaultMax ?? 0,
        };
        break;
      case "text":
        values[field.id] = field.defaultValue ?? "";
        break;
      case "list":
        values[field.id] = field.defaultValue ?? [];
        break;
      case "boolean":
        values[field.id] = field.defaultValue ?? false;
        break;
      case "select":
        values[field.id] = field.defaultValue ?? "";
        break;
    }
  }

  // Calculate derived fields
  recalculateDerivedFields(schema, values);

  return { values };
}

/**
 * Recalculate all derived fields based on current values
 */
export function recalculateDerivedFields(
  schema: CharacterSchema,
  values: Record<string, CharacterFieldValue>
): void {
  const derivedFields = schema.fields.filter(
    (f): f is DerivedField => f.type === "derived"
  );

  for (const field of derivedFields) {
    values[field.id] = evaluateFormula(field.formula, values);
  }
}

/**
 * Evaluate a formula string with variable substitution
 * Supports: {{variable}}, basic math, floor(), ceil(), min(), max(), abs()
 */
export function evaluateFormula(
  formula: string,
  values: Record<string, CharacterFieldValue>
): number {
  // Replace {{variable}} with actual values
  let expression = formula.replace(
    /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g,
    (_, varName) => {
      const value = values[varName];
      if (value === undefined) return "0";

      // Handle different value types
      if (typeof value === "number") return String(value);
      if (typeof value === "boolean") return value ? "1" : "0";
      if (typeof value === "object" && "current" in value)
        return String(value.current);
      if (Array.isArray(value)) return String(value.length);
      return "0";
    }
  );

  // Whitelist of allowed functions
  const allowedFunctions: Record<string, (...args: number[]) => number> = {
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    min: Math.min,
    max: Math.max,
    abs: Math.abs,
  };

  // Process functions from innermost to outermost using balanced parenthesis matching
  let maxIterations = 50;
  while (maxIterations-- > 0) {
    let foundFunction = false;

    for (const [name, fn] of Object.entries(allowedFunctions)) {
      // Find function calls with balanced parentheses
      const funcStart = expression.indexOf(name + "(");
      if (funcStart === -1) continue;

      // Make sure it's a standalone function call (not part of another word)
      if (funcStart > 0 && /[a-zA-Z_]/.test(expression[funcStart - 1]))
        continue;

      // Find the matching closing parenthesis
      const argsStart = funcStart + name.length + 1;
      let depth = 1;
      let argsEnd = argsStart;

      while (argsEnd < expression.length && depth > 0) {
        if (expression[argsEnd] === "(") depth++;
        if (expression[argsEnd] === ")") depth--;
        argsEnd++;
      }

      if (depth !== 0) continue; // Unbalanced

      // Extract arguments and evaluate
      const argsStr = expression.slice(argsStart, argsEnd - 1);

      // Split arguments at top-level commas only
      const args: string[] = [];
      let currentArg = "";
      let parenDepth = 0;

      for (const char of argsStr) {
        if (char === "(") parenDepth++;
        if (char === ")") parenDepth--;
        if (char === "," && parenDepth === 0) {
          args.push(currentArg.trim());
          currentArg = "";
        } else {
          currentArg += char;
        }
      }
      if (currentArg.trim()) args.push(currentArg.trim());

      // Evaluate each argument
      const argValues = args.map((arg) => {
        try {
          return evaluateMathExpression(arg);
        } catch {
          return 0;
        }
      });

      // Replace the function call with its result
      const result = fn(...argValues);
      expression =
        expression.slice(0, funcStart) +
        String(result) +
        expression.slice(argsEnd);

      foundFunction = true;
      break; // Restart loop to handle nested functions
    }

    if (!foundFunction) break;
  }

  return evaluateMathExpression(expression);
}

/**
 * Safely evaluate a math expression (no eval)
 * Supports: +, -, *, /, parentheses
 */
function evaluateMathExpression(expr: string): number {
  // Remove whitespace
  expr = expr.replace(/\s/g, "");

  // Validate - only allow numbers, operators, and parentheses
  if (!/^[0-9+\-*/().]+$/.test(expr)) {
    console.warn(`Invalid math expression: ${expr}`);
    return 0;
  }

  try {
    // Use Function constructor (safer than eval, but still sandboxed)
    const result = new Function(`return (${expr})`)();
    return typeof result === "number" && isFinite(result) ? result : 0;
  } catch {
    return 0;
  }
}

/**
 * Get a numeric value from character data (handles resources)
 */
export function getNumericValue(
  values: Record<string, CharacterFieldValue>,
  fieldId: string
): number {
  const value = values[fieldId];
  if (value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "object" && "current" in value) return value.current;
  if (Array.isArray(value)) return value.length;
  return 0;
}

/**
 * Create a variable resolver for the dice formula system
 */
export function createSchemaResolver(
  schema: CharacterSchema,
  values: Record<string, CharacterFieldValue>
): (name: string) => number | undefined {
  return (name: string) => {
    // Direct field lookup
    if (name in values) {
      return getNumericValue(values, name);
    }

    return undefined;
  };
}

// ============================================
// SCHEMA VALIDATION
// ============================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a character schema
 */
export function validateSchema(schema: CharacterSchema): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!schema.name) {
    errors.push("Schema must have a name");
  }

  if (!schema.fields || schema.fields.length === 0) {
    errors.push("Schema must have at least one field");
  }

  const fieldIds = new Set<string>();
  for (const field of schema.fields || []) {
    // Check for duplicate IDs
    if (fieldIds.has(field.id)) {
      errors.push(`Duplicate field ID: ${field.id}`);
    }
    fieldIds.add(field.id);

    // Check for valid ID format
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field.id)) {
      errors.push(
        `Invalid field ID format: ${field.id} (must be alphanumeric with underscores, starting with letter)`
      );
    }

    // Validate derived field formulas
    if (field.type === "derived") {
      const vars = field.formula.match(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g);
      if (vars) {
        for (const v of vars) {
          const varName = v.slice(2, -2);
          if (varName !== field.id && !fieldIds.has(varName)) {
            warnings.push(
              `Derived field "${field.id}" references unknown field: ${varName}`
            );
          }
        }
      }
    }

    // Validate select field options
    if (
      field.type === "select" &&
      (!field.options || field.options.length === 0)
    ) {
      errors.push(`Select field "${field.id}" must have at least one option`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================
// TEMPLATE PROCESSING
// ============================================

/**
 * Process a template string with field values
 * Supports:
 * - {{fieldId}} - Simple value substitution
 * - {{fieldId.current}} / {{fieldId.max}} - Resource sub-values
 * - {{length fieldId}} - Array length
 * - {{#if fieldId}}...{{/if}} - Conditional blocks (truthy check)
 * - {{#if (expr)}}...{{/if}} - Conditional with expression (see below)
 * - {{#unless fieldId}}...{{/unless}} - Inverse conditional
 * - {{#unless (expr)}}...{{/unless}} - Inverse conditional with expression
 * - {{#each fieldId}}...{{/each}} - List iteration ({{this}} for item, {{@index}}, {{@first}}, {{@last}} for position)
 * - {{#times N}}...{{/times}} - Repeat content N times ({{@index}} available)
 * - {{#compare fieldId "op" value}}...{{/compare}} - Comparison (op: ==, !=, >, <, >=, <=)
 * - {{resource:resourceId}} - Resource URL substitution
 * - {{percent fieldId}} - Resource as percentage (current/max * 100)
 * - {{modifier fieldId}} - Number with +/- prefix (e.g., +3, -1)
 * - {{subtract a b}}, {{add a b}}, {{mul a b}}, {{div a b}} - Math operations
 * - #icon(name) - Resolves to game icon (e.g., #icon(sword), #icon(health))
 *
 * Expression syntax for conditionals:
 * - (compare left "op" right) - Comparison: (compare health.current "<" (div health.max 2))
 * - (filter array "prop" "value") - Filter array: (filter inventory "category" "weapon")
 * - (or expr1 expr2 ...) - Boolean OR: (or (filter inv "cat" "a") (filter inv "cat" "b"))
 * - (and expr1 expr2 ...) - Boolean AND
 * - (not expr) - Boolean NOT
 * - (gt a b), (lt a b), (eq a b) - Comparisons returning boolean
 * - (div a b), (mul a b), (add a b), (sub a b) - Math operations
 */
export function processTemplate(
  template: string,
  values: Record<string, CharacterFieldValue>,
  resources?: SchemaResource[],
  baseUrl?: string
): string {
  let result = template;

  // Decode HTML entities inside template expressions ({{...}})
  // This handles cases where < > are encoded as &lt; &gt; in HTML content
  result = result.replace(/\{\{([^}]+)\}\}/g, (match, content) => {
    const decoded = content
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'");
    return `{{${decoded}}}`;
  });

  // Icon resolution: #icon(name) - resolves to best-matching icon and renders as img
  // This allows AI-generated templates to use readable icon names that get
  // fuzzy-matched to actual icons from our icon database
  result = result.replace(/#icon\(([^)]+)\)/g, (_, iconName) => {
    const resolved = resolveIconName(iconName.trim());

    // Check if it's an emoji
    if (/\p{Extended_Pictographic}/u.test(resolved)) {
      return `<span style="font-size: 1em; line-height: 1;">${resolved}</span>`;
    }

    // Check if it's a game-icon and render using CSS mask
    // This works in sandboxed iframes with absolute URLs
    const iconPath = getGameIconPath(resolved);
    if (iconPath) {
      // Build absolute URL if baseUrl provided (needed for sandboxed iframes)
      const fullUrl = baseUrl ? `${baseUrl}${iconPath}` : iconPath;
      // Use mask-image with LUMINANCE mode: the SVG has black background + white icon paths
      // In luminance mode: white = opaque, black = transparent
      // Must explicitly set mask-mode: luminance (default is alpha which doesn't work for these SVGs)
      return `<span style="display: inline-block; width: 1.5em; height: 1.5em; vertical-align: -0.3em; background-color: currentColor; -webkit-mask-image: url('${fullUrl}'); mask-image: url('${fullUrl}'); -webkit-mask-mode: luminance; mask-mode: luminance; -webkit-mask-size: contain; mask-size: contain; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center;"></span>`;
    }

    // Fallback: return a placeholder circle
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width: 1em; height: 1em; display: inline-block; vertical-align: -0.125em; fill: none; stroke: currentColor; stroke-width: 2;"><circle cx="12" cy="12" r="10"/></svg>`;
  });

  // Resource URL substitution: {{resource:id}}
  result = result.replace(/\{\{resource:([a-zA-Z0-9_-]+)\}\}/g, (_, id) => {
    const resource = resources?.find((r) => r.id === id);
    return resource?.url ?? "";
  });

  // Helper to resolve a value reference like "fieldId", "fieldId.current", "fieldId.max"
  const resolveValueRef = (
    ref: string,
    contextValues: Record<string, CharacterFieldValue> = values
  ): number | string => {
    const parts = ref.split(".");
    const fieldId = parts[0];
    const prop = parts[1];

    const value = contextValues[fieldId];
    if (value === undefined) return 0;

    if (prop) {
      if (
        typeof value === "object" &&
        value !== null &&
        "current" in value &&
        (prop === "current" || prop === "max")
      ) {
        return value[prop as "current" | "max"];
      }
      // For object items in arrays (this.property)
      if (typeof value === "object" && value !== null && prop in value) {
        return (value as Record<string, unknown>)[prop] as number | string;
      }
      return 0;
    }

    if (typeof value === "number") return value;
    if (typeof value === "object" && "current" in value) return value.current;
    if (typeof value === "string") return value;
    return 0;
  };

  // Helper to evaluate simple expressions like (div a b), (mul a b), etc.
  // Also handles nested expressions recursively
  const evalExpression = (
    expr: string,
    contextValues: Record<string, CharacterFieldValue> = values
  ): number | boolean | unknown[] => {
    expr = expr.trim();

    // Handle nested parenthetical expressions by finding matching parens
    if (expr.startsWith("(")) {
      // Find the function name and parse arguments respecting nesting
      const funcEndIdx = expr.indexOf(" ", 1);
      if (funcEndIdx === -1) return 0;
      const func = expr.slice(1, funcEndIdx);
      const argsStr = expr.slice(funcEndIdx + 1, expr.length - 1);

      // Parse arguments respecting nested parentheses
      const args: string[] = [];
      let current = "";
      let depth = 0;
      let inQuote = false;

      for (let i = 0; i < argsStr.length; i++) {
        const char = argsStr[i];
        if (char === '"' && argsStr[i - 1] !== "\\") {
          inQuote = !inQuote;
          current += char;
        } else if (!inQuote && char === "(") {
          depth++;
          current += char;
        } else if (!inQuote && char === ")") {
          depth--;
          current += char;
        } else if (!inQuote && char === " " && depth === 0) {
          if (current.trim()) args.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      if (current.trim()) args.push(current.trim());

      // Evaluate based on function
      switch (func) {
        case "div": {
          const val1 = Number(evalExpression(args[0], contextValues));
          const val2 = Number(evalExpression(args[1], contextValues));
          return val2 !== 0 ? Math.floor(val1 / val2) : 0;
        }
        case "mul": {
          const val1 = Number(evalExpression(args[0], contextValues));
          const val2 = Number(evalExpression(args[1], contextValues));
          return val1 * val2;
        }
        case "add": {
          const val1 = Number(evalExpression(args[0], contextValues));
          const val2 = Number(evalExpression(args[1], contextValues));
          return val1 + val2;
        }
        case "sub": {
          const val1 = Number(evalExpression(args[0], contextValues));
          const val2 = Number(evalExpression(args[1], contextValues));
          return val1 - val2;
        }
        case "mod": {
          const val1 = Number(evalExpression(args[0], contextValues));
          const val2 = Number(evalExpression(args[1], contextValues));
          return val2 !== 0 ? val1 % val2 : 0;
        }
        case "min": {
          const val1 = Number(evalExpression(args[0], contextValues));
          const val2 = Number(evalExpression(args[1], contextValues));
          return Math.min(val1, val2);
        }
        case "max": {
          const val1 = Number(evalExpression(args[0], contextValues));
          const val2 = Number(evalExpression(args[1], contextValues));
          return Math.max(val1, val2);
        }
        case "compare": {
          // (compare left "op" right) - returns boolean
          const left = Number(evalExpression(args[0], contextValues));
          const op = args[1].replace(/"/g, "");
          const right = Number(evalExpression(args[2], contextValues));
          switch (op) {
            case "==":
              return left === right;
            case "!=":
              return left !== right;
            case ">":
              return left > right;
            case "<":
              return left < right;
            case ">=":
              return left >= right;
            case "<=":
              return left <= right;
            default:
              return false;
          }
        }
        case "or": {
          // (or expr1 expr2 ...) - returns true if any expression is truthy
          for (const arg of args) {
            const result = evalExpression(arg, contextValues);
            if (isTruthyValue(result)) return true;
          }
          return false;
        }
        case "and": {
          // (and expr1 expr2 ...) - returns true if all expressions are truthy
          for (const arg of args) {
            const result = evalExpression(arg, contextValues);
            if (!isTruthyValue(result)) return false;
          }
          return true;
        }
        case "not": {
          // (not expr) - negates the expression
          const result = evalExpression(args[0], contextValues);
          return !isTruthyValue(result);
        }
        case "filter": {
          // (filter arrayField "property" "value") - returns filtered array
          const arrayFieldName = args[0];
          const prop = args[1].replace(/"/g, "");
          const val = args[2].replace(/"/g, "");

          // Get the array from values
          const arrayValue = contextValues[arrayFieldName];
          if (!Array.isArray(arrayValue)) return [];

          return arrayValue.filter((item) => {
            if (typeof item === "object" && item !== null) {
              return (item as Record<string, unknown>)[prop] === val;
            }
            return false;
          });
        }
        case "gt": {
          // (gt a b) - greater than, returns boolean
          const a = Number(evalExpression(args[0], contextValues));
          const b = Number(evalExpression(args[1], contextValues));
          return a > b;
        }
        case "lt": {
          // (lt a b) - less than, returns boolean
          const a = Number(evalExpression(args[0], contextValues));
          const b = Number(evalExpression(args[1], contextValues));
          return a < b;
        }
        case "eq": {
          // (eq a b) - equals, returns boolean
          const a = evalExpression(args[0], contextValues);
          const b = evalExpression(args[1], contextValues);
          return a === b;
        }
        default:
          return 0;
      }
    }

    // Not an expression, try to resolve as value reference or parse as number
    const resolved = resolveValueRef(expr, contextValues);
    if (typeof resolved === "number") return resolved;
    if (typeof resolved === "string") {
      const num = parseFloat(resolved);
      return isNaN(num) ? 0 : num;
    }
    return 0;
  };

  // Helper to check if a value is truthy
  const isTruthyValue = (val: unknown): boolean => {
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === "boolean") return val;
    if (typeof val === "number") return val !== 0;
    if (typeof val === "string") return val !== "";
    return !!val;
  };

  // Enhanced evalCompare that supports field.property refs and expressions
  const evalCompareEnhanced = (
    leftExpr: string,
    op: string,
    rightExpr: string,
    contextValues: Record<string, CharacterFieldValue> = values
  ): boolean => {
    const left = evalExpression(leftExpr, contextValues);
    const right = evalExpression(rightExpr, contextValues);

    switch (op) {
      case "==":
        return left === right;
      case "!=":
        return left !== right;
      case ">":
        return left > right;
      case "<":
        return left < right;
      case ">=":
        return left >= right;
      case "<=":
        return left <= right;
      default:
        return false;
    }
  };

  // Process {{#each fieldId}}...{{/each}} blocks
  // Supports both simple string arrays ({{this}}) and object arrays ({{this.property}})
  // Also supports dotted field access like {{#each harm.tracks}}
  result = result.replace(
    /\{\{#each\s+([a-zA-Z_][a-zA-Z0-9_.]*)\.?\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_, fieldPath, content) => {
      // Support dotted paths like "harm.tracks"
      const parts = fieldPath.split(".");
      let value: unknown = values[parts[0]];
      for (let i = 1; i < parts.length && value !== undefined; i++) {
        if (typeof value === "object" && value !== null) {
          value = (value as Record<string, unknown>)[parts[i]];
        } else {
          value = undefined;
        }
      }
      if (!Array.isArray(value)) return "";
      const arrayLength = value.length;
      return value
        .map((item, index) => {
          let itemContent = content;
          const isFirst = index === 0;
          const isLast = index === arrayLength - 1;

          // Handle object arrays: {{this.property}}
          if (typeof item === "object" && item !== null) {
            const objItem = item as Record<string, unknown>;
            // Replace {{this.property}} with actual values
            itemContent = itemContent.replace(
              /\{\{this\.([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g,
              (_match: string, prop: string) => {
                const propValue = objItem[prop];
                if (propValue === undefined || propValue === null) return "";
                return String(propValue);
              }
            );
            // Handle {{#if this.property}}...{{/if}} for object properties
            itemContent = itemContent.replace(
              /\{\{#if\s+this\.([a-zA-Z_][a-zA-Z0-9_]*)\}\}([\s\S]*?)\{\{\/if\}\}/g,
              (_match: string, prop: string, ifContent: string) => {
                const propValue = objItem[prop];
                const isTruthy =
                  propValue !== undefined &&
                  propValue !== null &&
                  propValue !== false &&
                  propValue !== 0 &&
                  propValue !== "";
                return isTruthy ? ifContent : "";
              }
            );
            // For {{this}} on objects, use the 'name' property or JSON representation
            itemContent = itemContent.replace(
              /\{\{this\}\}/g,
              objItem.name ? String(objItem.name) : JSON.stringify(item)
            );
          } else {
            // Handle simple string/number arrays: {{this}}
            itemContent = itemContent.replace(/\{\{this\}\}/g, String(item));
          }

          // Replace position variables
          itemContent = itemContent.replace(/\{\{@index\}\}/g, String(index));
          itemContent = itemContent.replace(/\{\{@first\}\}/g, String(isFirst));
          itemContent = itemContent.replace(/\{\{@last\}\}/g, String(isLast));

          // Handle {{#if @last}}...{{/if}} and {{#unless @last}}...{{/unless}}
          itemContent = itemContent.replace(
            /\{\{#if\s+@last\}\}([\s\S]*?)\{\{\/if\}\}/g,
            (_: string, ifContent: string) => (isLast ? ifContent : "")
          );
          itemContent = itemContent.replace(
            /\{\{#unless\s+@last\}\}([\s\S]*?)\{\{\/unless\}\}/g,
            (_: string, unlessContent: string) => (!isLast ? unlessContent : "")
          );
          itemContent = itemContent.replace(
            /\{\{#if\s+@first\}\}([\s\S]*?)\{\{\/if\}\}/g,
            (_: string, ifContent: string) => (isFirst ? ifContent : "")
          );
          itemContent = itemContent.replace(
            /\{\{#unless\s+@first\}\}([\s\S]*?)\{\{\/unless\}\}/g,
            (_: string, unlessContent: string) =>
              !isFirst ? unlessContent : ""
          );

          return itemContent;
        })
        .join("");
    }
  );

  // Process {{#compare expr "op" expr}}...{{/compare}} blocks
  // Supports field.property references and (func arg1 arg2) expressions
  // Accepts both single and double quotes around the operator
  result = result.replace(
    /\{\{#compare\s+([^\s"']+)\s+["']([^"']+)["']\s+([^}]+)\}\}([\s\S]*?)\{\{\/compare\}\}/g,
    (_, leftExpr, op, rightExpr, content) => {
      return evalCompareEnhanced(leftExpr.trim(), op, rightExpr.trim())
        ? content
        : "";
    }
  );

  // Process {{#if field op value}}...{{/if}} - inline comparison syntax
  // e.g., {{#if sanity.current < 50}}, {{#if health.current >= 100}}
  // Must come BEFORE the s-expression and simple field patterns
  // Use a function to find the matching {{/if}} to handle nested blocks
  const processInlineIfComparisons = (input: string): string => {
    const ifPattern = /\{\{#if\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s*(>=|<=|!=|==|>|<)\s*(\d+(?:\.\d+)?)\s*\}\}/g;
    let output = input;
    let match;
    
    while ((match = ifPattern.exec(input)) !== null) {
      const fullMatch = match[0];
      const leftExpr = match[1];
      const op = match[2];
      const rightExpr = match[3];
      const startIdx = match.index;
      
      // Find the matching {{/if}}
      let depth = 1;
      let searchIdx = startIdx + fullMatch.length;
      let endIdx = -1;
      
      while (searchIdx < input.length && depth > 0) {
        const nextIf = input.indexOf('{{#if', searchIdx);
        const nextEndIf = input.indexOf('{{/if}}', searchIdx);
        
        if (nextEndIf === -1) break;
        
        if (nextIf !== -1 && nextIf < nextEndIf) {
          depth++;
          searchIdx = nextIf + 5;
        } else {
          depth--;
          if (depth === 0) {
            endIdx = nextEndIf;
          }
          searchIdx = nextEndIf + 7;
        }
      }
      
      if (endIdx !== -1) {
        const content = input.slice(startIdx + fullMatch.length, endIdx);
        const conditionResult = evalCompareEnhanced(leftExpr.trim(), op, rightExpr.trim());
        const replacement = conditionResult ? content : '';
        output = output.slice(0, startIdx) + replacement + output.slice(endIdx + 7);
        // Reset pattern to search from beginning since string changed
        ifPattern.lastIndex = 0;
        input = output;
      }
    }
    
    return output;
  };
  result = processInlineIfComparisons(result);

  // Process {{#if (expression)}}...{{/if}} - general expression syntax
  // Handles any s-expression: (compare ...), (or ...), (and ...), (filter ...), (gt ...), (lt ...), etc.
  // Must come BEFORE the simple {{#if fieldId}} pattern
  result = result.replace(
    /\{\{#if\s+(\([^]*?\))\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (match, expr, content) => {
      // Need to find matching closing paren for the expression
      // Count parens to handle nested expressions like (compare a "<" (div b 2))
      let parenDepth = 0;
      let exprEnd = 0;
      for (let i = 0; i < expr.length; i++) {
        if (expr[i] === "(") parenDepth++;
        else if (expr[i] === ")") {
          parenDepth--;
          if (parenDepth === 0) {
            exprEnd = i + 1;
            break;
          }
        }
      }
      if (parenDepth !== 0) return match; // Malformed expression

      const fullExpr = expr.slice(0, exprEnd);
      const result = evalExpression(fullExpr);
      return isTruthyValue(result) ? content : "";
    }
  );

  // Process {{#if fieldId}}...{{/if}} blocks (simple truthy check)
  result = result.replace(
    /\{\{#if\s+([a-zA-Z_][a-zA-Z0-9_.]*)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, fieldId, content) => {
      // Support field.property syntax in if checks
      // First check raw values for booleans/arrays before resolving
      const rawValue = values[fieldId.split(".")[0]];
      if (rawValue === false) return "";
      if (Array.isArray(rawValue) && rawValue.length === 0) return "";

      const resolved = resolveValueRef(fieldId);
      const isTruthy = resolved !== 0 && resolved !== "";
      return isTruthy ? content : "";
    }
  );

  // Process {{#unless (expression)}}...{{/unless}} - general expression syntax
  // Must come BEFORE the simple {{#unless fieldId}} pattern
  result = result.replace(
    /\{\{#unless\s+(\([^]*?\))\}\}([\s\S]*?)\{\{\/unless\}\}/g,
    (match, expr, content) => {
      // Need to find matching closing paren for the expression
      let parenDepth = 0;
      let exprEnd = 0;
      for (let i = 0; i < expr.length; i++) {
        if (expr[i] === "(") parenDepth++;
        else if (expr[i] === ")") {
          parenDepth--;
          if (parenDepth === 0) {
            exprEnd = i + 1;
            break;
          }
        }
      }
      if (parenDepth !== 0) return match; // Malformed expression

      const fullExpr = expr.slice(0, exprEnd);
      const result = evalExpression(fullExpr);
      return !isTruthyValue(result) ? content : "";
    }
  );

  // Process {{#unless field op value}}...{{/unless}} - inline comparison syntax
  // e.g., {{#unless sanity.current < 50}}, {{#unless health.current >= 100}}
  const processInlineUnlessComparisons = (input: string): string => {
    const unlessPattern = /\{\{#unless\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s*(>=|<=|!=|==|>|<)\s*(\d+(?:\.\d+)?)\s*\}\}/g;
    let output = input;
    let match;
    
    while ((match = unlessPattern.exec(input)) !== null) {
      const fullMatch = match[0];
      const leftExpr = match[1];
      const op = match[2];
      const rightExpr = match[3];
      const startIdx = match.index;
      
      // Find the matching {{/unless}}
      let depth = 1;
      let searchIdx = startIdx + fullMatch.length;
      let endIdx = -1;
      
      while (searchIdx < input.length && depth > 0) {
        const nextUnless = input.indexOf('{{#unless', searchIdx);
        const nextEndUnless = input.indexOf('{{/unless}}', searchIdx);
        
        if (nextEndUnless === -1) break;
        
        if (nextUnless !== -1 && nextUnless < nextEndUnless) {
          depth++;
          searchIdx = nextUnless + 9;
        } else {
          depth--;
          if (depth === 0) {
            endIdx = nextEndUnless;
          }
          searchIdx = nextEndUnless + 11;
        }
      }
      
      if (endIdx !== -1) {
        const content = input.slice(startIdx + fullMatch.length, endIdx);
        const conditionResult = evalCompareEnhanced(leftExpr.trim(), op, rightExpr.trim());
        const replacement = !conditionResult ? content : '';
        output = output.slice(0, startIdx) + replacement + output.slice(endIdx + 11);
        // Reset pattern to search from beginning since string changed
        unlessPattern.lastIndex = 0;
        input = output;
      }
    }
    
    return output;
  };
  result = processInlineUnlessComparisons(result);

  // Process {{#unless fieldId}}...{{/unless}} blocks
  result = result.replace(
    /\{\{#unless\s+([a-zA-Z_][a-zA-Z0-9_.]*)\}\}([\s\S]*?)\{\{\/unless\}\}/g,
    (_, fieldId, content) => {
      // Support field.property syntax in unless checks
      // First check raw values for booleans/arrays before resolving
      const rawValue = values[fieldId.split(".")[0]];
      if (rawValue === false) return content; // unless falsy = show content
      if (Array.isArray(rawValue) && rawValue.length === 0) return content;

      const resolved = resolveValueRef(fieldId);
      const isTruthy = resolved !== 0 && resolved !== "";
      return !isTruthy ? content : "";
    }
  );

  // Process {{#times N}}...{{/times}} - repeat content N times
  // Supports both literal numbers and field references
  result = result.replace(
    /\{\{#times\s+([^\}]+)\}\}([\s\S]*?)\{\{\/times\}\}/g,
    (_, countExpr, content) => {
      // Try to resolve the count - could be a number or a field reference
      const trimmedExpr = countExpr.trim();
      let count: number;

      // Check if it's a field.property reference (e.g., harm.max)
      if (trimmedExpr.includes(".")) {
        const resolved = resolveValueRef(trimmedExpr);
        count =
          typeof resolved === "number"
            ? resolved
            : parseInt(String(resolved)) || 0;
      } else if (/^\d+$/.test(trimmedExpr)) {
        // It's a literal number
        count = parseInt(trimmedExpr);
      } else {
        // Try as a field reference
        const value = values[trimmedExpr];
        if (typeof value === "number") {
          count = value;
        } else if (typeof value === "object" && value && "max" in value) {
          count = value.max;
        } else {
          count = parseInt(String(value)) || 0;
        }
      }

      if (count <= 0 || count > 100) return ""; // Safety limit

      return Array.from({ length: count }, (_, index) => {
        let itemContent = content;
        itemContent = itemContent.replace(/\{\{@index\}\}/g, String(index));
        return itemContent;
      }).join("");
    }
  );

  // Process {{length fieldId}} - get array length
  result = result.replace(
    /\{\{length\s+([a-zA-Z_][a-zA-Z0-9_.]*)\}\}/g,
    (_, fieldPath) => {
      // Support dotted paths like "inventory" or "harm.tracks"
      const parts = fieldPath.split(".");
      let value: unknown = values[parts[0]];
      for (let i = 1; i < parts.length && value !== undefined; i++) {
        if (typeof value === "object" && value !== null) {
          value = (value as Record<string, unknown>)[parts[i]];
        } else {
          value = undefined;
        }
      }
      if (Array.isArray(value)) return String(value.length);
      return "0";
    }
  );

  // Process {{percent fieldId}} - resource percentage
  result = result.replace(
    /\{\{percent\s+([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g,
    (_, fieldId) => {
      const value = values[fieldId];
      if (typeof value === "object" && "current" in value && value.max > 0) {
        return String(Math.round((value.current / value.max) * 100));
      }
      return "0";
    }
  );

  // Process {{modifier fieldId}} - D&D-style modifier with +/- prefix
  result = result.replace(
    /\{\{modifier\s+([a-zA-Z_][a-zA-Z0-9_.]*)\}\}/g,
    (_, fieldId) => {
      const resolved = resolveValueRef(fieldId);
      const num =
        typeof resolved === "number"
          ? resolved
          : parseFloat(String(resolved)) || 0;
      return num >= 0 ? `+${num}` : String(num);
    }
  );

  // Process {{subtract a b}} - subtraction helper
  result = result.replace(
    /\{\{subtract\s+([^\s}]+)\s+([^\s}]+)\}\}/g,
    (_, aExpr, bExpr) => {
      const a = Number(evalExpression(aExpr));
      const b = Number(evalExpression(bExpr));
      return String(a - b);
    }
  );

  // Process {{add a b}} - addition helper
  result = result.replace(
    /\{\{add\s+([^\s}]+)\s+([^\s}]+)\}\}/g,
    (_, aExpr, bExpr) => {
      const a = Number(evalExpression(aExpr));
      const b = Number(evalExpression(bExpr));
      return String(a + b);
    }
  );

  // Process {{multiply a b}} / {{mul a b}} - multiplication helper
  result = result.replace(
    /\{\{(?:multiply|mul)\s+([^\s}]+)\s+([^\s}]+)\}\}/g,
    (_, aExpr, bExpr) => {
      const a = Number(evalExpression(aExpr));
      const b = Number(evalExpression(bExpr));
      return String(a * b);
    }
  );

  // Process {{divide a b}} / {{div a b}} - division helper
  result = result.replace(
    /\{\{(?:divide|div)\s+([^\s}]+)\s+([^\s}]+)\}\}/g,
    (_, aExpr, bExpr) => {
      const a = Number(evalExpression(aExpr));
      const b = Number(evalExpression(bExpr));
      return b !== 0 ? String(Math.floor(a / b)) : "0";
    }
  );

  // Process {{fieldId.current}} and {{fieldId.max}} for resources
  result = result.replace(
    /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\.(current|max)\}\}/g,
    (_, fieldId, prop) => {
      const value = values[fieldId];
      if (typeof value === "object" && "current" in value) {
        return String(value[prop as "current" | "max"]);
      }
      return "0";
    }
  );

  // Process {{fieldId.trueLabel || 'fallback'}} and {{fieldId.falseLabel || 'fallback'}} for booleans
  result = result.replace(
    /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\.(trueLabel|falseLabel)\s*(?:\|\|\s*['"]([^'"]*)['"]\s*)?\}\}/g,
    (_, fieldId, prop, fallback) => {
      const value = values[fieldId];
      if (typeof value === "boolean") {
        if (prop === "trueLabel") {
          return value ? fallback || "Yes" : "";
        } else {
          return !value ? fallback || "No" : "";
        }
      }
      return fallback ?? "";
    }
  );

  // Simple value substitution: {{fieldId}} or {{fieldId || 'fallback'}}
  result = result.replace(
    /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\|\|\s*['"]([^'"]*)['"]\s*)?\}\}/g,
    (_, fieldId, fallback) => {
      const value = values[fieldId];
      if (value === undefined || value === null || value === "") {
        return fallback ?? "";
      }
      if (typeof value === "boolean") return value ? "Yes" : "No";
      if (Array.isArray(value)) return value.join(", ");
      if (typeof value === "object" && "current" in value) {
        return `${value.current}/${value.max}`;
      }
      return String(value);
    }
  );

  return result;
}

/** Extra context values that can be used in templates beyond schema fields */
export interface TemplateContext {
  playerName?: string;
  playerSummary?: string;
}

/**
 * Build a complete HTML document for sandboxed iframe rendering
 */
export function buildTemplateDocument(
  schema: CharacterSchema,
  values: Record<string, CharacterFieldValue>,
  context?: TemplateContext,
  baseUrl?: string
): string {
  if (!schema.template) return "";

  // Merge context values with field values (context values take precedence as fallbacks)
  const allValues: Record<string, CharacterFieldValue> = {
    ...values,
    // Add context values if not already defined in schema fields
    ...(context?.playerName && !values.playerName
      ? { playerName: context.playerName }
      : {}),
    ...(context?.playerSummary && !values.playerSummary
      ? { playerSummary: context.playerSummary }
      : {}),
  };

  const processedHtml = processTemplate(
    schema.template.html,
    allValues,
    schema.resources,
    baseUrl
  );
  const css = schema.template.css || "";
  const js = schema.template.js || "";

  // Create values object for JS access (include context values)
  const valuesJson = JSON.stringify(allValues);

  // Base URL for resolving relative paths (like /icons/...)
  const baseTag = baseUrl ? `<base href="${baseUrl}" />` : "";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${baseTag}
  <style>
    * { box-sizing: border-box; }
    html, body { 
      margin: 0; 
      padding: 0;
      font-family: system-ui, -apple-system, sans-serif;
      background: transparent;
      color: #e5e7eb;
      overflow: visible;
      height: auto;
      /* Mobile-friendly defaults */
      width: 100%;
      max-width: 100%;
      overflow-x: hidden;
    }
    /* Ensure images and other content don't overflow */
    img, svg, canvas, video, iframe { max-width: 100%; height: auto; }
    /* Base responsive container */
    body > * { max-width: 100%; }
    ${css}
  </style>
</head>
<body>
  ${processedHtml}
  <script>
    // Make field values available to custom JS
    window.characterData = ${valuesJson};
    
    // Helper function to get field value
    window.getField = function(fieldId) {
      return window.characterData[fieldId];
    };
    
    // Report height to parent
    function reportHeight() {
      const height = Math.max(
        document.body.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.scrollHeight,
        document.documentElement.offsetHeight
      );
      window.parent.postMessage({ type: 'iframeHeight', height: height }, '*');
    }
    
    // Custom JS from template (runs after DOM is ready)
    document.addEventListener('DOMContentLoaded', function() {
      try {
        ${js}
      } catch (e) {
        console.error('Template JS error:', e);
      }
      // Report height after content loads
      reportHeight();
      setTimeout(reportHeight, 100);
      setTimeout(reportHeight, 300);
      setTimeout(reportHeight, 500);
      setTimeout(reportHeight, 1000);
    });
    
    // Also report on window load (for images/fonts)
    window.addEventListener('load', function() {
      reportHeight();
      setTimeout(reportHeight, 100);
    });
  </script>
</body>
</html>
  `.trim();
}

/**
 * Build a complete HTML document for a custom page
 */
export function buildPageTemplateDocument(
  page: SchemaPage,
  schema: CharacterSchema,
  values: Record<string, CharacterFieldValue>,
  context?: TemplateContext,
  baseUrl?: string
): string {
  if (!page.template) return "";

  // Merge context values with field values
  const allValues: Record<string, CharacterFieldValue> = {
    ...values,
    ...(context?.playerName && !values.playerName
      ? { playerName: context.playerName }
      : {}),
    ...(context?.playerSummary && !values.playerSummary
      ? { playerSummary: context.playerSummary }
      : {}),
  };

  const processedHtml = processTemplate(
    page.template.html,
    allValues,
    schema.resources,
    baseUrl
  );
  const css = page.template.css || "";
  const js = page.template.js || "";

  // Create values object for JS access (include context values)
  const valuesJson = JSON.stringify(allValues);

  // Base URL for resolving relative paths (like /icons/...)
  const baseTag = baseUrl ? `<base href="${baseUrl}" />` : "";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${baseTag}
  <style>
    * { box-sizing: border-box; }
    html, body { 
      margin: 0; 
      padding: 0;
      font-family: system-ui, -apple-system, sans-serif;
      background: transparent;
      color: #e5e7eb;
      overflow: visible;
      height: auto;
      /* Mobile-friendly defaults */
      width: 100%;
      max-width: 100%;
      overflow-x: hidden;
    }
    /* Ensure images and other content don't overflow */
    img, svg, canvas, video, iframe { max-width: 100%; height: auto; }
    /* Base responsive container */
    body > * { max-width: 100%; }
    ${css}
  </style>
</head>
<body>
  ${processedHtml}
  <script>
    // Make field values available to custom JS
    window.characterData = ${valuesJson};
    
    // Helper function to get field value
    window.getField = function(fieldId) {
      return window.characterData[fieldId];
    };
    
    // Report height to parent
    function reportHeight() {
      const height = Math.max(
        document.body.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.scrollHeight,
        document.documentElement.offsetHeight
      );
      window.parent.postMessage({ type: 'iframeHeight', height: height }, '*');
    }
    
    // Custom JS from template (runs after DOM is ready)
    document.addEventListener('DOMContentLoaded', function() {
      try {
        ${js}
      } catch (e) {
        console.error('Page JS error:', e);
      }
      // Report height after content loads
      reportHeight();
      setTimeout(reportHeight, 100);
      setTimeout(reportHeight, 300);
      setTimeout(reportHeight, 500);
      setTimeout(reportHeight, 1000);
    });
    
    // Also report on window load (for images/fonts)
    window.addEventListener('load', function() {
      reportHeight();
      setTimeout(reportHeight, 100);
    });
  </script>
</body>
</html>
  `.trim();
}

// ============================================
// PRESET SCHEMAS
// ============================================

/**
 * D&D 5e-style character schema
 */
export const DND5E_SCHEMA: CharacterSchema = {
  version: 1,
  name: "D&D 5e",
  description: "Dungeons & Dragons 5th Edition character sheet",
  categories: [
    { id: "attributes", name: "Attributes", order: 1 },
    { id: "combat", name: "Combat", order: 2 },
    { id: "skills", name: "Skills", order: 3 },
    { id: "info", name: "Character Info", order: 4 },
  ],
  template: {
    html: `
<div class="sheet">
  <header class="header">
    <div class="character-name">{{characterName}}</div>
    <div class="character-details">
      <span class="detail">{{race}}</span>
      <span class="divider">•</span>
      <span class="detail">{{class}}</span>
      <span class="divider">•</span>
      <span class="detail">Level {{Level}}</span>
    </div>
  </header>

  <div class="main-content">
    <div class="attributes-column">
      <div class="attribute-block">
        <div class="attr-score">{{Strength}}</div>
        <div class="attr-mod">{{STR_mod}}</div>
        <div class="attr-name">STR</div>
      </div>
      <div class="attribute-block">
        <div class="attr-score">{{Dexterity}}</div>
        <div class="attr-mod">{{DEX_mod}}</div>
        <div class="attr-name">DEX</div>
      </div>
      <div class="attribute-block">
        <div class="attr-score">{{Constitution}}</div>
        <div class="attr-mod">{{CON_mod}}</div>
        <div class="attr-name">CON</div>
      </div>
      <div class="attribute-block">
        <div class="attr-score">{{Intelligence}}</div>
        <div class="attr-mod">{{INT_mod}}</div>
        <div class="attr-name">INT</div>
      </div>
      <div class="attribute-block">
        <div class="attr-score">{{Wisdom}}</div>
        <div class="attr-mod">{{WIS_mod}}</div>
        <div class="attr-name">WIS</div>
      </div>
      <div class="attribute-block">
        <div class="attr-score">{{Charisma}}</div>
        <div class="attr-mod">{{CHA_mod}}</div>
        <div class="attr-name">CHA</div>
      </div>
    </div>

    <div class="combat-column">
      <div class="combat-stats">
        <div class="combat-stat ac">
          <div class="stat-value">{{AC}}</div>
          <div class="stat-label">Armor Class</div>
        </div>
        <div class="combat-stat prof">
          <div class="stat-value">+{{proficiency}}</div>
          <div class="stat-label">Proficiency</div>
        </div>
      </div>

      <div class="hp-section">
        <div class="hp-label">Hit Points</div>
        <div class="hp-bar">
          <div class="hp-fill" style="width: {{percent HP}}%"></div>
          <div class="hp-text">{{HP.current}} / {{HP.max}}</div>
        </div>
      </div>
    </div>
  </div>
</div>
    `,
    css: `
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap');

.sheet {
  font-family: 'Crimson Text', Georgia, serif;
  background: linear-gradient(135deg, #2d1f1a 0%, #1a1310 100%);
  color: #e8d4b8;
  padding: 24px;
  border-radius: 12px;
  border: 3px solid #8b6914;
  box-shadow: 
    inset 0 0 60px rgba(0,0,0,0.5),
    0 0 20px rgba(139, 105, 20, 0.3);
  position: relative;
  overflow: hidden;
}

.sheet::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: url("data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  opacity: 0.03;
  pointer-events: none;
}

.header {
  text-align: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 2px solid #8b6914;
}

.character-name {
  font-family: 'Cinzel', serif;
  font-size: 2rem;
  font-weight: 700;
  color: #ffd700;
  text-shadow: 0 2px 4px rgba(0,0,0,0.5);
  letter-spacing: 2px;
}

.character-details {
  margin-top: 8px;
  font-size: 1rem;
  color: #c4a574;
}

.divider {
  margin: 0 8px;
  color: #8b6914;
}

.main-content {
  display: flex;
  gap: 24px;
}

.attributes-column {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  flex: 0 0 auto;
}

.attribute-block {
  background: linear-gradient(145deg, #3d2a1f 0%, #251810 100%);
  border: 2px solid #6b4c1a;
  border-radius: 8px;
  padding: 12px 16px;
  text-align: center;
  min-width: 80px;
  position: relative;
}

.attribute-block::after {
  content: '';
  position: absolute;
  top: 4px; left: 4px; right: 4px; bottom: 4px;
  border: 1px solid rgba(139, 105, 20, 0.3);
  border-radius: 4px;
  pointer-events: none;
}

.attr-score {
  font-size: 1.5rem;
  font-weight: 700;
  color: #ffd700;
}

.attr-mod {
  font-size: 1.1rem;
  color: #90ee90;
  margin: 4px 0;
}

.attr-name {
  font-family: 'Cinzel', serif;
  font-size: 0.75rem;
  color: #a08060;
  letter-spacing: 1px;
  text-transform: uppercase;
}

.combat-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.combat-stats {
  display: flex;
  gap: 16px;
}

.combat-stat {
  flex: 1;
  background: linear-gradient(145deg, #1a2a3a 0%, #0d1520 100%);
  border: 2px solid #4a6080;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
}

.combat-stat.ac {
  border-color: #6080a0;
  background: linear-gradient(145deg, #1a2535 0%, #0d1218 100%);
}

.stat-value {
  font-family: 'Cinzel', serif;
  font-size: 1.8rem;
  font-weight: 700;
  color: #87ceeb;
}

.stat-label {
  font-size: 0.8rem;
  color: #6a8aa8;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-top: 4px;
}

.hp-section {
  background: linear-gradient(145deg, #2a1a1a 0%, #1a0d0d 100%);
  border: 2px solid #8b2020;
  border-radius: 8px;
  padding: 16px;
}

.hp-label {
  font-family: 'Cinzel', serif;
  font-size: 0.9rem;
  color: #cc6666;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 8px;
}

.hp-bar {
  height: 32px;
  background: #1a0808;
  border-radius: 4px;
  position: relative;
  overflow: hidden;
  border: 1px solid #5a1515;
}

.hp-fill {
  height: 100%;
  background: linear-gradient(90deg, #8b0000 0%, #dc143c 50%, #ff4444 100%);
  border-radius: 3px;
  transition: width 0.3s ease;
  box-shadow: 0 0 10px rgba(220, 20, 60, 0.5);
}

.hp-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-weight: 700;
  font-size: 1rem;
  color: white;
  text-shadow: 0 1px 3px rgba(0,0,0,0.8);
}
    `,
  },
  fields: [
    // Attributes
    {
      id: "Strength",
      name: "Strength",
      type: "number",
      category: "attributes",
      defaultValue: 10,
      min: 1,
      max: 30,
    },
    {
      id: "Dexterity",
      name: "Dexterity",
      type: "number",
      category: "attributes",
      defaultValue: 10,
      min: 1,
      max: 30,
    },
    {
      id: "Constitution",
      name: "Constitution",
      type: "number",
      category: "attributes",
      defaultValue: 10,
      min: 1,
      max: 30,
    },
    {
      id: "Intelligence",
      name: "Intelligence",
      type: "number",
      category: "attributes",
      defaultValue: 10,
      min: 1,
      max: 30,
    },
    {
      id: "Wisdom",
      name: "Wisdom",
      type: "number",
      category: "attributes",
      defaultValue: 10,
      min: 1,
      max: 30,
    },
    {
      id: "Charisma",
      name: "Charisma",
      type: "number",
      category: "attributes",
      defaultValue: 10,
      min: 1,
      max: 30,
    },
    // Derived modifiers
    {
      id: "STR_mod",
      name: "STR Modifier",
      type: "derived",
      category: "attributes",
      formula: "floor(({{Strength}} - 10) / 2)",
      readonly: true,
    },
    {
      id: "DEX_mod",
      name: "DEX Modifier",
      type: "derived",
      category: "attributes",
      formula: "floor(({{Dexterity}} - 10) / 2)",
      readonly: true,
    },
    {
      id: "CON_mod",
      name: "CON Modifier",
      type: "derived",
      category: "attributes",
      formula: "floor(({{Constitution}} - 10) / 2)",
      readonly: true,
    },
    {
      id: "INT_mod",
      name: "INT Modifier",
      type: "derived",
      category: "attributes",
      formula: "floor(({{Intelligence}} - 10) / 2)",
      readonly: true,
    },
    {
      id: "WIS_mod",
      name: "WIS Modifier",
      type: "derived",
      category: "attributes",
      formula: "floor(({{Wisdom}} - 10) / 2)",
      readonly: true,
    },
    {
      id: "CHA_mod",
      name: "CHA Modifier",
      type: "derived",
      category: "attributes",
      formula: "floor(({{Charisma}} - 10) / 2)",
      readonly: true,
    },
    // Combat
    {
      id: "Level",
      name: "Level",
      type: "number",
      category: "combat",
      defaultValue: 1,
      min: 1,
      max: 20,
    },
    {
      id: "proficiency",
      name: "Proficiency Bonus",
      type: "derived",
      category: "combat",
      formula: "floor(({{Level}} - 1) / 4) + 2",
      readonly: true,
    },
    {
      id: "HP",
      name: "Hit Points",
      type: "resource",
      category: "combat",
      defaultMax: 10,
      regenerates: true,
      regenRates: { quick: 0, short: 25, long: 100 },
    },
    {
      id: "AC",
      name: "Armor Class",
      type: "derived",
      category: "combat",
      formula: "10 + {{DEX_mod}}",
      readonly: true,
    },
    // Info
    {
      id: "characterName",
      name: "Character Name",
      type: "text",
      category: "info",
    },
    {
      id: "race",
      name: "Race",
      type: "text",
      category: "info",
    },
    {
      id: "class",
      name: "Class",
      type: "text",
      category: "info",
    },
  ],
};

/**
 * Call of Cthulhu-style character schema
 */
export const COC_SCHEMA: CharacterSchema = {
  version: 1,
  name: "Call of Cthulhu 7e",
  description: "Call of Cthulhu 7th Edition investigator sheet",
  categories: [
    { id: "characteristics", name: "Characteristics", order: 1 },
    { id: "derived", name: "Derived Attributes", order: 2 },
    { id: "skills", name: "Investigative Skills", order: 3 },
  ],
  template: {
    html: `
<div class="investigator-sheet">
  <div class="header-section">
    <div class="title-area">
      <div class="game-title">CALL OF CTHULHU</div>
      <div class="subtitle">Investigator Sheet</div>
    </div>
    <div class="era-badge">1920s</div>
  </div>

  <div class="main-grid">
    <div class="characteristics-panel">
      <div class="panel-header">CHARACTERISTICS</div>
      <div class="char-grid">
        <div class="char-item">
          <span class="char-label">STR</span>
          <span class="char-value">{{STR}}</span>
        </div>
        <div class="char-item">
          <span class="char-label">CON</span>
          <span class="char-value">{{CON}}</span>
        </div>
        <div class="char-item">
          <span class="char-label">SIZ</span>
          <span class="char-value">{{SIZ}}</span>
        </div>
        <div class="char-item">
          <span class="char-label">DEX</span>
          <span class="char-value">{{DEX}}</span>
        </div>
        <div class="char-item">
          <span class="char-label">APP</span>
          <span class="char-value">{{APP}}</span>
        </div>
        <div class="char-item">
          <span class="char-label">INT</span>
          <span class="char-value">{{INT}}</span>
        </div>
        <div class="char-item">
          <span class="char-label">POW</span>
          <span class="char-value">{{POW}}</span>
        </div>
        <div class="char-item">
          <span class="char-label">EDU</span>
          <span class="char-value">{{EDU}}</span>
        </div>
      </div>
    </div>

    <div class="derived-panel">
      <div class="vital-stat hp">
        <div class="vital-icon">♥</div>
        <div class="vital-info">
          <div class="vital-label">Hit Points</div>
          <div class="vital-bar">
            <div class="vital-fill hp-fill" style="width: {{percent HP}}%"></div>
          </div>
          <div class="vital-numbers">{{HP.current}} / {{HP.max}}</div>
        </div>
      </div>

      <div class="vital-stat sanity">
        <div class="vital-icon">🜏</div>
        <div class="vital-info">
          <div class="vital-label">Sanity</div>
          <div class="vital-bar">
            <div class="vital-fill sanity-fill" style="width: {{percent Sanity}}%"></div>
          </div>
          <div class="vital-numbers">{{Sanity.current}} / {{Sanity.max}}</div>
        </div>
      </div>

      <div class="vital-stat luck">
        <div class="vital-icon">🍀</div>
        <div class="vital-info">
          <div class="vital-label">Luck</div>
          <div class="vital-bar">
            <div class="vital-fill luck-fill" style="width: {{percent Luck}}%"></div>
          </div>
          <div class="vital-numbers">{{Luck.current}} / {{Luck.max}}</div>
        </div>
      </div>

      <div class="vital-stat mp">
        <div class="vital-icon">★</div>
        <div class="vital-info">
          <div class="vital-label">Magic Points</div>
          <div class="vital-bar">
            <div class="vital-fill mp-fill" style="width: {{percent MP}}%"></div>
          </div>
          <div class="vital-numbers">{{MP.current}} / {{MP.max}}</div>
        </div>
      </div>
    </div>
  </div>

  <div class="eldritch-warning">
    <span class="warning-icon">⚠</span>
    <span class="warning-text">The oldest and strongest emotion of mankind is fear...</span>
  </div>
</div>
    `,
    css: `
@import url('https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&family=Special+Elite&display=swap');

.investigator-sheet {
  font-family: 'IM Fell English', serif;
  background: linear-gradient(145deg, #1a1f1a 0%, #0d120d 100%);
  color: #c4ccb8;
  padding: 24px;
  border-radius: 4px;
  border: 2px solid #2a3a2a;
  position: relative;
  overflow: hidden;
}

.investigator-sheet::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: 
    radial-gradient(ellipse at 20% 30%, rgba(0, 50, 0, 0.1) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 70%, rgba(30, 0, 50, 0.1) 0%, transparent 50%);
  pointer-events: none;
}

.header-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid #3a4a3a;
}

.title-area {
  text-align: left;
}

.game-title {
  font-family: 'Special Elite', monospace;
  font-size: 1.5rem;
  color: #6a8a5a;
  letter-spacing: 4px;
  text-shadow: 0 0 10px rgba(100, 140, 80, 0.3);
}

.subtitle {
  font-size: 0.9rem;
  color: #5a6a5a;
  font-style: italic;
  margin-top: 4px;
}

.era-badge {
  font-family: 'Special Elite', monospace;
  background: #2a3a2a;
  color: #8a9a7a;
  padding: 8px 16px;
  border: 1px solid #4a5a4a;
  border-radius: 2px;
  font-size: 0.9rem;
}

.main-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.characteristics-panel, .derived-panel {
  background: rgba(20, 30, 20, 0.5);
  border: 1px solid #3a4a3a;
  border-radius: 4px;
  padding: 16px;
}

.panel-header {
  font-family: 'Special Elite', monospace;
  font-size: 0.85rem;
  color: #7a8a6a;
  letter-spacing: 2px;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px dashed #3a4a3a;
}

.char-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.char-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: rgba(30, 40, 30, 0.5);
  border: 1px solid #3a4a3a;
  border-radius: 2px;
}

.char-label {
  font-family: 'Special Elite', monospace;
  font-size: 0.8rem;
  color: #6a7a6a;
}

.char-value {
  font-size: 1.2rem;
  font-weight: bold;
  color: #aaba9a;
}

.vital-stat {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding: 12px;
  background: rgba(30, 40, 30, 0.3);
  border-radius: 4px;
}

.vital-stat:last-child {
  margin-bottom: 0;
}

.vital-icon {
  font-size: 1.5rem;
  width: 40px;
  text-align: center;
}

.vital-stat.hp .vital-icon { color: #cc6666; }
.vital-stat.sanity .vital-icon { color: #9966cc; }
.vital-stat.luck .vital-icon { color: #66aa66; }
.vital-stat.mp .vital-icon { color: #6699cc; }

.vital-info {
  flex: 1;
}

.vital-label {
  font-size: 0.85rem;
  color: #8a9a7a;
  margin-bottom: 6px;
}

.vital-bar {
  height: 16px;
  background: #1a1f1a;
  border: 1px solid #3a4a3a;
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 4px;
}

.vital-fill {
  height: 100%;
  transition: width 0.3s ease;
}

.hp-fill { background: linear-gradient(90deg, #662222, #aa4444); }
.sanity-fill { background: linear-gradient(90deg, #442266, #7744aa); }
.luck-fill { background: linear-gradient(90deg, #224422, #448844); }
.mp-fill { background: linear-gradient(90deg, #224466, #4488aa); }

.vital-numbers {
  font-family: 'Special Elite', monospace;
  font-size: 0.8rem;
  color: #6a7a6a;
  text-align: right;
}

.eldritch-warning {
  margin-top: 20px;
  padding: 12px 16px;
  background: rgba(50, 30, 40, 0.3);
  border: 1px solid #4a3a4a;
  border-radius: 2px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.warning-icon {
  color: #aa6666;
  font-size: 1rem;
}

.warning-text {
  font-style: italic;
  font-size: 0.85rem;
  color: #7a6a7a;
}
    `,
  },
  fields: [
    // Characteristics (rolled 3d6 * 5 or 2d6+6 * 5)
    {
      id: "STR",
      name: "Strength",
      type: "number",
      category: "characteristics",
      defaultValue: 50,
      min: 0,
      max: 99,
    },
    {
      id: "CON",
      name: "Constitution",
      type: "number",
      category: "characteristics",
      defaultValue: 50,
      min: 0,
      max: 99,
    },
    {
      id: "SIZ",
      name: "Size",
      type: "number",
      category: "characteristics",
      defaultValue: 50,
      min: 0,
      max: 99,
    },
    {
      id: "DEX",
      name: "Dexterity",
      type: "number",
      category: "characteristics",
      defaultValue: 50,
      min: 0,
      max: 99,
    },
    {
      id: "APP",
      name: "Appearance",
      type: "number",
      category: "characteristics",
      defaultValue: 50,
      min: 0,
      max: 99,
    },
    {
      id: "INT",
      name: "Intelligence",
      type: "number",
      category: "characteristics",
      defaultValue: 50,
      min: 0,
      max: 99,
    },
    {
      id: "POW",
      name: "Power",
      type: "number",
      category: "characteristics",
      defaultValue: 50,
      min: 0,
      max: 99,
    },
    {
      id: "EDU",
      name: "Education",
      type: "number",
      category: "characteristics",
      defaultValue: 50,
      min: 0,
      max: 99,
    },
    // Derived
    {
      id: "HP",
      name: "Hit Points",
      type: "resource",
      category: "derived",
      defaultMax: 10,
      regenerates: true,
      regenRates: { quick: 0, short: 10, long: 50 },
    },
    {
      id: "Sanity",
      name: "Sanity",
      type: "resource",
      category: "derived",
      defaultMax: 50,
      regenerates: false,
    },
    {
      id: "Luck",
      name: "Luck",
      type: "resource",
      category: "derived",
      defaultMax: 50,
      regenerates: false,
    },
    {
      id: "MP",
      name: "Magic Points",
      type: "resource",
      category: "derived",
      defaultMax: 10,
      regenerates: true,
      regenRates: { quick: 0, short: 25, long: 100 },
    },
  ],
};

/**
 * Simple/Narrative schema (minimal rules)
 */
export const NARRATIVE_SCHEMA: CharacterSchema = {
  version: 1,
  name: "Narrative",
  description: "Simple narrative-focused character with minimal mechanics",
  categories: [
    { id: "core", name: "Core Traits", order: 1 },
    { id: "info", name: "Character", order: 2 },
  ],
  template: {
    html: `
<div class="narrative-sheet">
  <div class="character-header">
    <div class="name-section">
      <div class="character-name">{{characterName}}</div>
      {{#if concept}}
      <div class="character-concept">{{concept}}</div>
      {{/if}}
    </div>
  </div>

  <div class="traits-container">
    <div class="trait-card physique">
      <div class="trait-icon">💪</div>
      <div class="trait-info">
        <div class="trait-name">Physique</div>
        <div class="trait-value">{{Physique}}</div>
      </div>
      <div class="trait-desc">Strength & Endurance</div>
    </div>

    <div class="trait-card finesse">
      <div class="trait-icon">🎯</div>
      <div class="trait-info">
        <div class="trait-name">Finesse</div>
        <div class="trait-value">{{Finesse}}</div>
      </div>
      <div class="trait-desc">Agility & Precision</div>
    </div>

    <div class="trait-card mind">
      <div class="trait-icon">🧠</div>
      <div class="trait-info">
        <div class="trait-name">Mind</div>
        <div class="trait-value">{{Mind}}</div>
      </div>
      <div class="trait-desc">Intellect & Reasoning</div>
    </div>

    <div class="trait-card spirit">
      <div class="trait-icon">✨</div>
      <div class="trait-info">
        <div class="trait-name">Spirit</div>
        <div class="trait-value">{{Spirit}}</div>
      </div>
      <div class="trait-desc">Will & Presence</div>
    </div>
  </div>

  <div class="stress-section">
    <div class="stress-header">
      <span class="stress-label">Stress</span>
      <span class="stress-numbers">{{Stress.current}} / {{Stress.max}}</span>
    </div>
    <div class="stress-track">
      <div class="stress-fill" style="width: {{percent Stress}}%"></div>
      <div class="stress-segments">
        <div class="segment"></div>
        <div class="segment"></div>
        <div class="segment"></div>
        <div class="segment"></div>
        <div class="segment"></div>
        <div class="segment"></div>
        <div class="segment"></div>
        <div class="segment"></div>
        <div class="segment"></div>
        <div class="segment"></div>
      </div>
    </div>
    <div class="stress-warning">
      {{#compare Stress.current ">=" 8}}
      <span class="warning-text">⚠ Near breaking point</span>
      {{/compare}}
    </div>
  </div>
</div>
    `,
    css: `
@import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&family=Caveat:wght@500&display=swap');

.narrative-sheet {
  font-family: 'Quicksand', sans-serif;
  background: linear-gradient(135deg, #1e1e2e 0%, #2d2d44 100%);
  color: #e0e0e8;
  padding: 28px;
  border-radius: 20px;
  position: relative;
  overflow: hidden;
}

.narrative-sheet::before {
  content: '';
  position: absolute;
  top: -50%; left: -50%;
  width: 200%; height: 200%;
  background: radial-gradient(circle at 30% 30%, rgba(147, 112, 219, 0.08) 0%, transparent 50%),
              radial-gradient(circle at 70% 70%, rgba(100, 149, 237, 0.08) 0%, transparent 50%);
  animation: float 20s ease-in-out infinite;
  pointer-events: none;
}

@keyframes float {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  50% { transform: translate(-2%, -2%) rotate(1deg); }
}

.character-header {
  text-align: center;
  margin-bottom: 28px;
  position: relative;
  z-index: 1;
}

.character-name {
  font-family: 'Caveat', cursive;
  font-size: 2.5rem;
  font-weight: 500;
  color: #fff;
  text-shadow: 0 2px 20px rgba(147, 112, 219, 0.4);
  letter-spacing: 2px;
}

.character-concept {
  font-size: 1rem;
  color: #a0a0b8;
  font-style: italic;
  margin-top: 8px;
}

.traits-container {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 24px;
  position: relative;
  z-index: 1;
}

.trait-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 20px;
  text-align: center;
  transition: all 0.3s ease;
  backdrop-filter: blur(10px);
}

.trait-card:hover {
  transform: translateY(-4px);
  border-color: rgba(255, 255, 255, 0.2);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.trait-card.physique { border-top: 3px solid #e57373; }
.trait-card.finesse { border-top: 3px solid #81c784; }
.trait-card.mind { border-top: 3px solid #64b5f6; }
.trait-card.spirit { border-top: 3px solid #ba68c8; }

.trait-icon {
  font-size: 2rem;
  margin-bottom: 8px;
}

.trait-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.trait-name {
  font-weight: 600;
  font-size: 1rem;
  color: #e8e8f0;
}

.trait-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
}

.trait-card.physique .trait-value { color: #e57373; }
.trait-card.finesse .trait-value { color: #81c784; }
.trait-card.mind .trait-value { color: #64b5f6; }
.trait-card.spirit .trait-value { color: #ba68c8; }

.trait-desc {
  font-size: 0.75rem;
  color: #8888a0;
}

.stress-section {
  background: rgba(255, 100, 100, 0.1);
  border: 1px solid rgba(255, 100, 100, 0.2);
  border-radius: 12px;
  padding: 20px;
  position: relative;
  z-index: 1;
}

.stress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.stress-label {
  font-weight: 600;
  color: #ff8a80;
  text-transform: uppercase;
  font-size: 0.85rem;
  letter-spacing: 2px;
}

.stress-numbers {
  font-size: 1rem;
  color: #e0e0e8;
}

.stress-track {
  height: 24px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 12px;
  position: relative;
  overflow: hidden;
}

.stress-fill {
  position: absolute;
  top: 0; left: 0; bottom: 0;
  background: linear-gradient(90deg, #ff6b6b, #ee5a5a);
  border-radius: 12px;
  transition: width 0.5s ease;
  box-shadow: 0 0 20px rgba(255, 107, 107, 0.4);
}

.stress-segments {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
}

.segment {
  flex: 1;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
}

.segment:last-child {
  border-right: none;
}

.stress-warning {
  margin-top: 12px;
  min-height: 20px;
}

.warning-text {
  font-size: 0.85rem;
  color: #ff8a80;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
    `,
  },
  fields: [
    {
      id: "characterName",
      name: "Name",
      type: "text",
      category: "info",
    },
    {
      id: "concept",
      name: "Concept",
      type: "text",
      category: "info",
      description: "A brief description of who your character is",
    },
    {
      id: "Physique",
      name: "Physique",
      type: "number",
      category: "core",
      description: "Physical strength, endurance, and athleticism",
      defaultValue: 2,
      min: -2,
      max: 4,
    },
    {
      id: "Finesse",
      name: "Finesse",
      type: "number",
      category: "core",
      description: "Agility, dexterity, and precision",
      defaultValue: 2,
      min: -2,
      max: 4,
    },
    {
      id: "Mind",
      name: "Mind",
      type: "number",
      category: "core",
      description: "Intelligence, knowledge, and reasoning",
      defaultValue: 2,
      min: -2,
      max: 4,
    },
    {
      id: "Spirit",
      name: "Spirit",
      type: "number",
      category: "core",
      description: "Willpower, charisma, and presence",
      defaultValue: 2,
      min: -2,
      max: 4,
    },
    {
      id: "Stress",
      name: "Stress",
      type: "resource",
      category: "core",
      description: "Mental and physical strain",
      defaultValue: 0,
      defaultMax: 10,
      regenerates: true,
      regenRates: { quick: 20, short: 50, long: 100 },
    },
  ],
};

/** Available preset schemas */
export const PRESET_SCHEMAS: Record<string, CharacterSchema> = {
  dnd5e: DND5E_SCHEMA,
  coc: COC_SCHEMA,
  narrative: NARRATIVE_SCHEMA,
};

/** Default character schema used when adventures don't define a custom one */
export const DEFAULT_CHARACTER_SCHEMA: CharacterSchema = DND5E_SCHEMA;
