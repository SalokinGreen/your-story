/**
 * Token counting shared by every prompt-budget decision (ai_staged.ts's
 * per-stage history pruning, GM context allocation, etc).
 *
 * None of the providers this app talks to (DeepSeek, Google Gemini, Mistral,
 * OpenRouter-routed models) expose their exact tokenizer, so there is no way
 * to get a perfectly accurate count for every model. cl100k_base (GPT-4's
 * encoding) is used as a stand-in - it's close enough for English/markdown
 * text to be far more accurate than a flat chars/4 guess, which is the bar
 * we're actually trying to clear here.
 *
 * The encoder's rank data is loaded lazily via dynamic import so it doesn't
 * bloat the initial bundle; until it's loaded (or if it fails to load, e.g.
 * offline), estimateTokens() falls back to the old chars/4 heuristic so
 * every call site keeps working synchronously without a refactor.
 */

import type { Tiktoken } from "js-tiktoken";

let encoder: Tiktoken | null = null;
let loadStarted = false;

function ensureEncoderLoading(): void {
  if (encoder || loadStarted) return;
  loadStarted = true;
  import("js-tiktoken")
    .then(({ getEncoding }) => {
      encoder = getEncoding("cl100k_base");
    })
    .catch(() => {
      // Stay on the chars/4 fallback (e.g. offline, or the chunk failed to load).
    });
}

const CHARS_PER_TOKEN_FALLBACK = 4;

/**
 * Estimate the token count of `text`. Synchronous by design so it's a
 * drop-in replacement at every existing call site: uses the real BPE
 * tokenizer once it has finished loading, and a chars/4 heuristic before
 * that (typically just the first call or two per page load).
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  ensureEncoderLoading();

  if (encoder) {
    try {
      return encoder.encode(text).length;
    } catch {
      // Fall through to the heuristic if encoding fails for any reason
      // (e.g. pathological input) rather than throwing out of a budget check.
    }
  }

  return Math.ceil(text.length / CHARS_PER_TOKEN_FALLBACK);
}

/**
 * Truncate `text` to fit within `maxTokens`, appending a marker so callers
 * (and the model reading it) can tell the content was cut rather than just
 * ending mid-thought. No-op if text already fits.
 */
export function truncateToTokenBudget(text: string, maxTokens: number): string {
  if (maxTokens <= 0) return "";
  if (estimateTokens(text) <= maxTokens) return text;

  const marker = "\n\n[...truncated to fit context budget...]";
  const markerTokens = estimateTokens(marker);
  const budgetForContent = Math.max(0, maxTokens - markerTokens);

  // Binary search for the longest character-prefix whose token count fits,
  // since token count isn't a simple function of character count.
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi + 1) / 2);
    if (estimateTokens(text.slice(0, mid)) <= budgetForContent) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  return text.slice(0, lo) + marker;
}
