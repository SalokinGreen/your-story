/**
 * Recognize "context window exceeded" errors across the providers this app
 * talks to (DeepSeek, Google Gemini, Mistral, OpenRouter-routed models).
 * Client-side token budgeting (see ai_staged.ts) is only an estimate, so a
 * request can still overflow the model's real context window despite
 * fitting the estimated budget - this lets callers retry with less context
 * instead of failing the whole turn.
 */

const OVERFLOW_PATTERNS = [
  /context.?length/i,
  /context.?window/i,
  /maximum context/i,
  /too many tokens/i,
  /exceeds?.{0,30}(maximum|max).{0,20}(context|tokens?)/i,
  /reduce (the )?(length|number of tokens)/i,
  /prompt is too long/i,
  /input is too long/i,
  /token limit/i,
  /request too large/i,
];

export function isContextOverflowError(message: string | undefined): boolean {
  if (!message) return false;
  return OVERFLOW_PATTERNS.some((pattern) => pattern.test(message));
}
