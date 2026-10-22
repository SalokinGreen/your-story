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
 */
export function markRoundBreakpoint(messages: ChatMessage[], hasRoundHistory: boolean): void {
  if (!hasRoundHistory || messages.length === 0) return;
  const last = messages[messages.length - 1];
  if (!last.content) return;
  messages[messages.length - 1] = { ...last, cacheBreakpoint: "round" };
}
