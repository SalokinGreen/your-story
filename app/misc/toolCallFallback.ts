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
 * Tag names that only ever come from leaked tool-call markup, never from
 * narration. Everything else about the tag - what wraps the name, how it is
 * spaced - is treated as noise.
 */
const MARKUP_TAG_NAMES = new Set([
  "tool_calls",
  "function_calls",
  "invoke",
  "parameter",
]);

interface MarkupTag {
  /** index of "<" */
  start: number;
  /** index just past ">" */
  end: number;
  closing: boolean;
  name: string;
  attrs: string;
}

// Any `<...>` with no nested angle bracket. Bounded so a stray "<" in prose
// can't drag the scanner across the whole scene looking for a partner.
const ANY_TAG_RE = /<([^<>]{0,600})>/g;
const ATTR_START_RE = /\s[A-Za-z_][\w-]*\s*=/;
const TRAILING_IDENTIFIER_RE = /([A-Za-z_][A-Za-z0-9_]*)[^A-Za-z0-9_]*$/;

function readAttr(attrs: string, attrName: string): string | null {
  const match = attrs.match(
    new RegExp(String.raw`\b${attrName}\s*=\s*"([^"]*)"`, "i"),
  );
  return match ? match[1] : null;
}

/**
 * Find the leaked tool-call tags in `content`, whatever namespace token the
 * backend wrapped them in.
 *
 * The tag name is read as the last identifier before the attributes, so
 * `<|DSML|invoke name="x">` (DeepSeek), `<||DSML||invoke name="x">` (GLM
 * 5.2), a full-width-piped or space-padded variant of either, `<ns:invoke
 * name="x">` and a bare `<invoke name="x">` all read as the same `invoke`
 * tag. Hard-coding one spelling is what let GLM's leak through twice; the
 * structure underneath has been identical every time, so that is what gets
 * matched.
 *
 * `invoke`/`parameter` additionally require a `name="..."` attribute, so
 * prose that merely brackets those words (`<Note: parameter of the ward>`)
 * is not mistaken for markup and cut out of the narration.
 */
function scanMarkupTags(content: string): MarkupTag[] {
  if (!content.includes("<")) return [];

  const tags: MarkupTag[] = [];
  ANY_TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ANY_TAG_RE.exec(content)) !== null) {
    const inner = match[1].trim();
    const closing = inner.startsWith("/");
    const body = closing ? inner.slice(1) : inner;

    const attrStart = body.search(ATTR_START_RE);
    const namePart = attrStart === -1 ? body : body.slice(0, attrStart);
    const attrs = attrStart === -1 ? "" : body.slice(attrStart);

    const name = namePart.match(TRAILING_IDENTIFIER_RE)?.[1]?.toLowerCase();
    if (!name || !MARKUP_TAG_NAMES.has(name)) continue;
    if (
      !closing &&
      (name === "invoke" || name === "parameter") &&
      readAttr(attrs, "name") === null
    ) {
      continue;
    }

    tags.push({
      start: match.index,
      end: match.index + match[0].length,
      closing,
      name,
      attrs,
    });
  }

  return tags;
}

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

/**
 * Recover tool call(s) leaked as the model's internal tool-call markup
 * (`<|DSML|invoke ...>`, `<||DSML||invoke ...>`, `<invoke ...>`, …) instead
 * of a real `tool_calls` entry. Returns null unless at least one invoke tag
 * is found, so ordinary prose is untouched.
 */
function extractMarkupToolCalls(content: string): FallbackToolCall[] | null {
  const tags = scanMarkupTags(content);
  if (!tags.some((t) => t.name === "invoke" && !t.closing)) return null;

  const calls: FallbackToolCall[] = [];
  let current: { name: string; args: Record<string, unknown> } | null = null;
  let openParam: { name: string; attrs: string; valueStart: number } | null =
    null;

  const closeCurrent = () => {
    if (!current) return;
    calls.push({
      id: generateFallbackId(),
      type: "function",
      function: {
        name: current.name,
        arguments: JSON.stringify(current.args),
      },
    });
    current = null;
    openParam = null;
  };

  for (const tag of tags) {
    if (tag.name === "invoke") {
      if (tag.closing) {
        closeCurrent();
      } else {
        // An invoke that never closed (truncated generation) still yields
        // whatever parameters did arrive - better than dropping the call.
        closeCurrent();
        const name = readAttr(tag.attrs, "name");
        if (name) current = { name, args: {} };
      }
      continue;
    }

    if (tag.name === "parameter" && current) {
      if (tag.closing) {
        if (openParam) {
          current.args[openParam.name] = coerceMarkupParamValue(
            content.slice(openParam.valueStart, tag.start),
            openParam.attrs,
          );
          openParam = null;
        }
      } else {
        const name = readAttr(tag.attrs, "name");
        if (name) {
          openParam = { name, attrs: tag.attrs, valueStart: tag.end };
        }
      }
    }
  }

  closeCurrent();

  return calls.length > 0 ? calls : null;
}

/**
 * Remove leaked tool-call markup from text that is about to be shown to the
 * player or written into conversation history. Recovering the call (above)
 * fixes the mechanics; this is what keeps the raw `<||DSML||invoke ...>`
 * dump out of the narration. Safe to call on a partial streaming buffer: an
 * opener whose closer hasn't arrived yet takes everything after it with it,
 * so the markup never flashes on screen as it streams.
 */
export function stripLeakedToolCallMarkup(content: string): string {
  const tags = scanMarkupTags(content);
  if (tags.length === 0) return content;

  // Cut whole open→close regions rather than individual tags, so parameter
  // values (a character sheet, a search query) go with them.
  const cuts: Array<[number, number]> = [];
  let regionStart: number | null = null;
  let depth = 0;

  for (const tag of tags) {
    if (!tag.closing) {
      if (depth === 0) regionStart = tag.start;
      depth++;
      continue;
    }
    if (depth > 0) {
      depth--;
      if (depth === 0 && regionStart !== null) {
        cuts.push([regionStart, tag.end]);
        regionStart = null;
      }
    } else {
      // A closer whose opener never arrived is still markup, not narration.
      cuts.push([tag.start, tag.end]);
    }
  }
  if (depth > 0 && regionStart !== null) {
    cuts.push([regionStart, content.length]);
  }

  let cleaned = "";
  let cursor = 0;
  for (const [start, end] of cuts) {
    cleaned += content.slice(cursor, start);
    cursor = end;
  }
  cleaned += content.slice(cursor);

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
