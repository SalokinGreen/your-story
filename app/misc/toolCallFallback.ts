/**
 * Defensive fallback for a known DeepSeek reliability issue: the model can
 * intermittently emit a tool call as plain text in `content` instead of
 * populating the API response's `tool_calls` field (documented in
 * deepseek-ai/DeepSeek-V3 issue #1244, corroborated by sglang/vllm/ollama
 * issue trackers - `finish_reason: "stop"` with a null `tool_calls` and the
 * call embedded in `content` as text/JSON instead).
 *
 * When `tool_calls` comes back empty/null but tools were offered and
 * `content` looks tool-call-shaped, this recovers a usable tool call rather
 * than silently treating the round as narration-only - which would make
 * the GM stage think no state changes happened when the model actually
 * intended one. Deliberately conservative: only fires on content that
 * parses as JSON matching a recognizable tool-call shape, never on
 * ordinary prose.
 *
 * A second, structurally different leak has also been observed in
 * production: instead of JSON, the model emits its internal XML-ish tool
 * call markup verbatim as text - `<|DSML|tool_calls><|DSML|invoke
 * name="...">"<|DSML|parameter name="..." string="true">value<`
 * `/|DSML|parameter></|DSML|invoke></|DSML|tool_calls>`. This is the same
 * failure mode (inference backend fails to strip/parse its own tool-call
 * template before returning `content`), just a different serialization, so
 * it's recovered the same way via `extractMarkupToolCalls`.
 *
 * The exact delimiter around the namespace token varies by model family and
 * backend - DeepSeek leaked `<|DSML|invoke ...>`, GLM 5.2 leaks the
 * double-piped `<||DSML||invoke ...>`, and a bare `<invoke ...>` (no
 * namespace at all) or a `<ns:invoke ...>` form show up too. The structure
 * underneath is always the same, so the parser matches the structure and
 * treats the namespace token as noise rather than hard-coding one spelling.
 */

export interface FallbackToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

function generateFallbackId(): string {
  return `fallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function tryParseToolCallObject(obj: unknown): FallbackToolCall | null {
  if (!obj || typeof obj !== "object") return null;
  const candidate = obj as Record<string, unknown>;

  // Shape A: { name: "...", arguments: {...} | "..." }
  if (typeof candidate.name === "string" && candidate.arguments !== undefined) {
    return {
      id: generateFallbackId(),
      type: "function",
      function: {
        name: candidate.name,
        arguments:
          typeof candidate.arguments === "string"
            ? candidate.arguments
            : JSON.stringify(candidate.arguments),
      },
    };
  }

  // Shape B: OpenAI-shaped single call { id?, function: { name, arguments } }
  const fn = candidate.function as Record<string, unknown> | undefined;
  if (fn && typeof fn.name === "string") {
    return {
      id: typeof candidate.id === "string" ? candidate.id : generateFallbackId(),
      type: "function",
      function: {
        name: fn.name,
        arguments:
          typeof fn.arguments === "string"
            ? fn.arguments
            : JSON.stringify(fn.arguments ?? {}),
      },
    };
  }

  return null;
}

/**
 * The namespace token that precedes the tag name in leaked tool-call markup:
 * pipe-wrapped (`|DSML|`, `||DSML||`), colon-suffixed (`ns:`), or absent.
 * Matched as noise so one parser covers every spelling seen in the wild.
 */
const NS = String.raw`(?:\|+[^|<>\s]*\|+|[A-Za-z][\w.-]*:)?\s*`;
const WRAPPER = "(?:tool_calls|function_calls)";

const wrapperBlockRe = () =>
  new RegExp(
    String.raw`<\s*${NS}${WRAPPER}\s*>([\s\S]*?)<\s*/\s*${NS}${WRAPPER}\s*>`,
    "i",
  );
const invokeRe = () =>
  new RegExp(
    String.raw`<\s*${NS}invoke\s+name\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\s*/\s*${NS}invoke\s*>`,
    "gi",
  );
/** A trailing `<... invoke ...>` whose closing tag never arrived (truncated
 * generation, or a still-streaming buffer). */
const danglingInvokeRe = () =>
  new RegExp(
    String.raw`<\s*${NS}invoke\s+name\s*=\s*"([^"]*)"[^>]*>([\s\S]*)$`,
    "i",
  );
const parameterRe = () =>
  new RegExp(
    String.raw`<\s*${NS}parameter\s+name\s*=\s*"([^"]*)"([^>]*)>([\s\S]*?)<\s*/\s*${NS}parameter\s*>`,
    "gi",
  );
/** Cheap "is any of this worth parsing" probe, and the cut point used when
 * stripping leaked markup out of player-visible text. */
const markupOpenerRe = () =>
  new RegExp(
    // The `name="` attribute is required on invoke/parameter so prose that
    // happens to bracket those words (`<Note: parameter of the ward>`) is not
    // mistaken for a leaked call and cut out of the narration.
    String.raw`<\s*${NS}(?:${WRAPPER}\s*>|(?:invoke|parameter)\s+name\s*=)`,
    "i",
  );
const markupCloserRe = () =>
  new RegExp(
    String.raw`<\s*/\s*${NS}(?:${WRAPPER}|invoke|parameter)\s*>`,
    "gi",
  );

function decodeMarkupEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function coerceMarkupParamValue(rawValue: string, attrs: string): unknown {
  const value = decodeMarkupEntities(rawValue.trim());
  // An explicit string="true" attribute marks the value as a literal string
  // (matters for things like "3" or "true" that would otherwise parse as a
  // number/boolean rather than the string the tool actually expects).
  if (/\bstring\s*=\s*"true"/i.test(attrs)) return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function parseInvokeBody(name: string, body: string): FallbackToolCall {
  const args: Record<string, unknown> = {};
  const paramRe = parameterRe();
  let paramMatch: RegExpExecArray | null;
  while ((paramMatch = paramRe.exec(body)) !== null) {
    const [, paramName, attrs, rawValue] = paramMatch;
    if (!paramName) continue;
    args[paramName] = coerceMarkupParamValue(rawValue, attrs);
  }

  return {
    id: generateFallbackId(),
    type: "function",
    function: { name, arguments: JSON.stringify(args) },
  };
}

/**
 * Recover tool call(s) leaked as the model's internal `<|DSML|invoke ...>` /
 * `<||DSML||invoke ...>` markup instead of a real `tool_calls` entry.
 * Returns null unless at least one well-formed invoke block is found, so
 * ordinary prose is untouched.
 */
function extractMarkupToolCalls(content: string): FallbackToolCall[] | null {
  if (!markupOpenerRe().test(content)) return null;

  const blockMatch = content.match(wrapperBlockRe());
  const searchSpace = blockMatch ? blockMatch[1] : content;

  const calls: FallbackToolCall[] = [];
  const re = invokeRe();
  let invokeMatch: RegExpExecArray | null;
  let consumedTo = 0;
  while ((invokeMatch = re.exec(searchSpace)) !== null) {
    const [, name, body] = invokeMatch;
    consumedTo = re.lastIndex;
    if (!name) continue;
    calls.push(parseInvokeBody(name, body));
  }

  // An invoke whose closing tag never arrived - the provider truncated the
  // response mid-call. Its complete parameters are still recoverable, and
  // recovering them beats dropping the call (and printing the raw markup at
  // the player) entirely.
  const tail = searchSpace.slice(consumedTo);
  const dangling = tail.match(danglingInvokeRe());
  if (dangling?.[1]) {
    calls.push(parseInvokeBody(dangling[1], dangling[2] ?? ""));
  }

  return calls.length > 0 ? calls : null;
}

/**
 * Remove leaked tool-call markup from text that is about to be shown to the
 * player or written into conversation history. Recovering the call (above)
 * fixes the mechanics; this is what keeps the raw `<||DSML||invoke ...>`
 * dump out of the narration. Safe to call on a partial streaming buffer: an
 * opener with no closer yet cuts everything from the opener onward, so the
 * markup never flashes on screen as it arrives.
 */
export function stripLeakedToolCallMarkup(content: string): string {
  if (
    !content ||
    (!markupOpenerRe().test(content) && !markupCloserRe().test(content))
  ) {
    return content;
  }

  let cleaned = content
    .replace(new RegExp(wrapperBlockRe().source, "gi"), "")
    .replace(invokeRe(), "");

  // A closing tag whose opener was already removed (or never arrived) is
  // markup too, not narration.
  cleaned = cleaned.replace(markupCloserRe(), "");

  // Whatever opener survives is unterminated; nothing after it is narration.
  const opener = cleaned.match(markupOpenerRe());
  if (opener?.index !== undefined) {
    cleaned = cleaned.slice(0, opener.index);
  }

  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Attempt to recover tool call(s) from a model response's `content` string.
 * Returns null if nothing tool-call-shaped is found (the common case - most
 * empty-tool_calls responses really are just narration).
 */
export function extractFallbackToolCalls(
  content: string
): FallbackToolCall[] | null {
  if (!content || !content.trim()) return null;

  const trimmed = content.trim();

  const markupCalls = extractMarkupToolCalls(trimmed);
  if (markupCalls) return markupCalls;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = fenced?.[1] ? [fenced[1].trim(), trimmed] : [trimmed];

  for (const candidate of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }

    const parsedObj = parsed as Record<string, unknown> | unknown[];

    if (
      !Array.isArray(parsedObj) &&
      Array.isArray((parsedObj as Record<string, unknown>)?.tool_calls)
    ) {
      const calls = (
        (parsedObj as Record<string, unknown>).tool_calls as unknown[]
      )
        .map(tryParseToolCallObject)
        .filter((c): c is FallbackToolCall => c !== null);
      if (calls.length > 0) return calls;
    }

    if (Array.isArray(parsedObj)) {
      const calls = parsedObj
        .map(tryParseToolCallObject)
        .filter((c): c is FallbackToolCall => c !== null);
      if (calls.length > 0) return calls;
    }

    const single = tryParseToolCallObject(parsed);
    if (single) return [single];
  }

  return null;
}
