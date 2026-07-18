/**
 * Generic tool-argument validation, driven directly off the same ToolSchema
 * JSON-schema-like objects that are sent to the LLM (toolSchemas.ts /
 * gmTools.ts) - a single source of truth instead of hand-written per-tool
 * checks. Previously tool execution only checked that required keys were
 * *present*; this also checks declared types/enums so the model gets a
 * specific, correctable error instead of a generic crash deep in an executor.
 *
 * Deliberately permissive where being strict would just create false
 * positives: unknown/extra properties are ignored (models occasionally add
 * harmless extra fields), and declared-but-unrecognized JSON Schema `type`
 * values are not enforced.
 */

// Minimal structural type - matches the shape used in toolSchemas.ts/gmTools.ts
// without importing their concrete ToolSchema type (avoids a circular import
// between toolSchemas.ts <-> toolValidation.ts).
export interface ToolParamSchema {
  type?: string;
  enum?: unknown[];
  oneOf?: ToolParamSchema[];
  items?: ToolParamSchema;
  [key: string]: unknown;
}

export interface ToolFunctionSchema {
  function: {
    name: string;
    parameters: {
      type: "object";
      properties: Record<string, ToolParamSchema>;
      required?: string[];
    };
  };
}

export interface ToolValidationError {
  param: string;
  message: string;
}

function typeMatches(value: unknown, type: string): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && !Number.isNaN(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    default:
      // Unrecognized declared type (e.g. "null") - don't block on it.
      return true;
  }
}

function schemaAccepts(value: unknown, schema: ToolParamSchema): boolean {
  const errors: ToolValidationError[] = [];
  validateAgainstSchema(value, schema, "", errors);
  return errors.length === 0;
}

function validateAgainstSchema(
  value: unknown,
  schema: ToolParamSchema,
  path: string,
  errors: ToolValidationError[]
): void {
  if (schema.oneOf) {
    const matchesAny = schema.oneOf.some((branch) => schemaAccepts(value, branch));
    if (!matchesAny) {
      errors.push({
        param: path,
        message: `"${path}" (${JSON.stringify(value)}) does not match any allowed form`,
      });
    }
    return;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push({
      param: path,
      message: `"${path}" must be one of [${schema.enum
        .map((v) => JSON.stringify(v))
        .join(", ")}], got ${JSON.stringify(value)}`,
    });
    return;
  }

  if (schema.type && !typeMatches(value, schema.type)) {
    errors.push({
      param: path,
      message: `"${path}" must be of type ${schema.type}, got ${
        Array.isArray(value) ? "array" : typeof value
      }`,
    });
    return;
  }

  if (schema.type === "array" && schema.items && Array.isArray(value)) {
    value.forEach((item, i) =>
      validateAgainstSchema(item, schema.items as ToolParamSchema, `${path}[${i}]`, errors)
    );
  }
}

/**
 * Validate `args` against a tool's declared parameter schema. Returns an
 * empty array when valid.
 */
export function validateToolArgs(
  schema: ToolFunctionSchema,
  args: Record<string, unknown>
): ToolValidationError[] {
  const errors: ToolValidationError[] = [];
  const properties = schema.function.parameters.properties || {};
  const required = schema.function.parameters.required || [];

  for (const key of required) {
    if (!(key in args) || args[key] === undefined || args[key] === null) {
      errors.push({ param: key, message: `missing required parameter "${key}"` });
    }
  }

  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null) continue;
    const propSchema = properties[key];
    if (!propSchema) continue; // unknown/extra param - ignore rather than block
    if (required.includes(key) && errors.some((e) => e.param === key)) continue; // already flagged missing
    validateAgainstSchema(value, propSchema, key, errors);
  }

  return errors;
}

export function formatValidationErrors(
  toolName: string,
  errors: ToolValidationError[]
): string {
  return `Invalid arguments for "${toolName}": ${errors
    .map((e) => e.message)
    .join("; ")}`;
}
