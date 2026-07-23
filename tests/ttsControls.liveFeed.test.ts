import { describe, it, expect } from "vitest";
import {
  extractCompleteSentences,
  withholdOpenSpoiler,
} from "@/app/components/TTSControls";
import { cleanTextForSpeech } from "@/app/misc/ai";

// Replays TTSControls' feedLiveText algorithm against a progressively
// growing raw stream. Regression coverage for a bug where a closed
// ||spoiler|| tag would retroactively shrink the *cleaned* text, desyncing
// the character-offset tracker and silently dropping every sentence spoken
// after it for the rest of the turn.
function simulateLiveFeed(rawChunks: string[]): string[] {
  let raw = "";
  let sentChars = 0;
  const dispatched: string[] = [];

  const feed = (fullRawText: string, flush: boolean) => {
    const pending = fullRawText.slice(sentChars);
    const { safe, held } = flush
      ? { safe: pending, held: "" }
      : withholdOpenSpoiler(pending);
    const { sentences, remainder } = extractCompleteSentences(safe);

    for (const sentence of sentences) {
      const spoken = cleanTextForSpeech(sentence).trim();
      if (spoken) dispatched.push(spoken);
    }
    sentChars = fullRawText.length - (remainder.length + held.length);

    if (flush) {
      const trimmedRemainder = cleanTextForSpeech(remainder).trim();
      if (trimmedRemainder) dispatched.push(trimmedRemainder);
      sentChars = fullRawText.length;
    }
  };

  for (const delta of rawChunks) {
    raw += delta;
    feed(raw, false);
  }
  feed(raw, true);

  return dispatched;
}

describe("live TTS feed (feedLiveText algorithm)", () => {
  it("keeps narrating after a ||spoiler|| tag closes mid-stream", () => {
    const dispatched = simulateLiveFeed([
      "The door creaks open. ",
      "You see a chest. ",
      "Inside is ||the amulet of doom",
      " and a note||. ",
      "You step back and consider your options. ",
    ]);

    expect(dispatched).toEqual([
      "The door creaks open.",
      "You see a chest.",
      "Inside is .",
      "You step back and consider your options.",
    ]);
  });

  it("withholds an unclosed spoiler until the stream ends, then flushes it best-effort", () => {
    const dispatched = simulateLiveFeed([
      "You find a note. ||It says the king is a fraud",
    ]);

    // Nothing complete yet mid-stream - the open spoiler withholds
    // everything after "You find a note." until it closes or the turn
    // ends. It never closes here, so the final flush (no more data is
    // ever coming) speaks the leftover as-is rather than losing it.
    expect(dispatched).toEqual([
      "You find a note.",
      "||It says the king is a fraud",
    ]);
  });

  it("handles multiple spoilers across a whole turn, without ever speaking their contents", () => {
    const dispatched = simulateLiveFeed([
      "You enter. ||Secret one||. ",
      "You look around. ||Secret two, with punctuation.|| ",
      "Finally, you leave. ",
    ]);

    expect(dispatched).toEqual([
      "You enter.",
      ".",
      "You look around.",
      "Finally, you leave.",
    ]);
  });
});
