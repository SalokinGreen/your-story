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
 * Attempt to recover tool call(s) from a model response's `content` string.
 * Returns null if nothing tool-call-shaped is found (the common case - most
 * empty-tool_calls responses really are just narration).
 */
export function extractFallbackToolCalls(
  content: string
): FallbackToolCall[] | null {
  if (!content || !content.trim()) return null;

  const trimmed = content.trim();
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
