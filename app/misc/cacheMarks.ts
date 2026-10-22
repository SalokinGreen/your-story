import type { ChatMessage } from "@/app/misc/chatMessage";

/**
 * The conversation id a request carries for provider-side caching (decision
 * 91, design 4.6): `ys:<storyId>:gm` for the GM's rounds and
 * `ys:<storyId>:narration` for the narrator. Mistral takes it as
 * `prompt_cache_key` and OpenRouter as `session_id`. Returned as a spreadable
 * fragment so a request without a story id carries nothing.
 */
export function storyCacheKey(
  storyId: string | undefined,
  stage: "gm" | "narration",
): { cacheKey?: string } {
  return storyId ? { cacheKey: `ys:${storyId}:${stage}` } : {};
}

/**
 * Marks the last message of a GM round's request copy `"round"`, Claude's
 * third cache breakpoint: the next round's request extends it. Replaces the
 * element with a copy (the stored base messages are shared across rounds and
 * must stay unmarked), and only when the round has history appended, because
 * a first round's last message already carries the `"turn"` mark.
 *
 * Never on a `tool` message: OpenRouter types a tool message's content as a
 * string, and a content list with `cache_control` could be refused on every
 * round after a tool call. The mark walks back to the last non-tool message
 * with text; if that one is already marked (the action, say) or there is
 * none, the round gets no mark. A round's tool calls and results then ride
 * uncached until the next text message, which is the price of not risking a 400.
 */
export function markRoundBreakpoint(messages: ChatMessage[], hasRoundHistory: boolean): void {
  if (!hasRoundHistory) return;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "tool" || !m.content) continue;
    if (m.cacheBreakpoint) return;
    messages[i] = { ...m, cacheBreakpoint: "round" };
    return;
  }
}
