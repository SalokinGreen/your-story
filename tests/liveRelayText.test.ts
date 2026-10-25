/**
 * What the host relays to online guests as "being written" (liveRelayText.ts):
 * never the previous turn's text left in storyText during a held turn.
 */
import { describe, it, expect } from "vitest";
import { liveRelayText } from "@/app/misc/liveRelayText";

describe("liveRelayText", () => {
  it("prefers the live narration", () => {
    expect(
      liveRelayText({ liveNarrationText: "Live.", storyText: "Old.", storyTextAtTurnStart: "Old." }),
    ).toBe("Live.");
  });

  it("sends nothing while storyText still holds the previous turn's prose", () => {
    expect(
      liveRelayText({ liveNarrationText: "", storyText: "Old.", storyTextAtTurnStart: "Old." }),
    ).toBe("");
  });

  it("sends storyText once it has changed since the turn started", () => {
    expect(
      liveRelayText({ liveNarrationText: "", storyText: "New.", storyTextAtTurnStart: "Old." }),
    ).toBe("New.");
  });
});
