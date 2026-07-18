import { describe, it, expect } from "vitest";
import { isContextOverflowError } from "../app/misc/apiErrors";

describe("isContextOverflowError", () => {
  it("detects common provider context-overflow phrasings", () => {
    const messages = [
      "AI API error: 400 - This model's maximum context length is 128000 tokens.",
      "400 - context_length_exceeded",
      "Error: prompt is too long: 200000 tokens > 131072 maximum",
      "The input token count exceeds the maximum number of tokens allowed",
      "Please reduce the length of the messages.",
      "400 Bad Request: input is too long for requested model.",
      "Request too large for gpt model in organization",
    ];
    for (const m of messages) {
      expect(isContextOverflowError(m)).toBe(true);
    }
  });

  it("does not flag unrelated errors", () => {
    const messages = [
      "AI API error: 401 - Invalid API key",
      "AI API error: 429 - Rate limit exceeded",
      "Network request failed",
      "AI API error: 500 - Internal server error",
      undefined,
      "",
    ];
    for (const m of messages) {
      expect(isContextOverflowError(m)).toBe(false);
    }
  });
});
