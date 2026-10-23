import { describe, it, expect } from "vitest";
import { appendTranscript, stillVoice } from "../app/story/composerDraft";

describe("appendTranscript", () => {
  it("puts the transcript into an empty draft as it is", () => {
    expect(appendTranscript("", "  open the door ")).toBe("open the door");
    expect(appendTranscript("   ", "hello")).toBe("hello");
  });

  it("adds it after a space when there is text already", () => {
    expect(appendTranscript("I walk in and", "look around")).toBe(
      "I walk in and look around",
    );
  });

  it("does not double a space the draft already ends with", () => {
    expect(appendTranscript("I walk in ", "look around")).toBe(
      "I walk in look around",
    );
  });

  it("leaves the draft alone for an empty transcript", () => {
    expect(appendTranscript("keep this", "  ")).toBe("keep this");
  });
});

describe("stillVoice", () => {
  it("keeps the voice mark while the draft has text", () => {
    expect(stillVoice(true, "hello")).toBe(true);
  });
  it("drops it once the draft is cleared", () => {
    expect(stillVoice(true, "  ")).toBe(false);
  });
  it("never adds it", () => {
    expect(stillVoice(false, "hello")).toBe(false);
  });
});
