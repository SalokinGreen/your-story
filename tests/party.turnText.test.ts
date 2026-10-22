/**
 * Party mode's Go and couch co-op's Generate bubble must send the GM the same
 * turn. buildTurnText was moved out of PlayerBubbles.submitLines; this pins it
 * byte for byte against the code as it was before the move.
 */
import { describe, expect, it } from "vitest";
import { buildTurnText, type TurnLine } from "@/app/misc/party/turnText";

// A frozen copy of PlayerBubbles.submitLines' body before the extraction
// (app/components/PlayerBubbles.tsx at b864251, lines 328-330).
function legacySubmitLines(lines: TurnLine[]): { text: string; speakerIds: string[] } | null {
  if (lines.length === 0) return null;
  const text = lines.map((l) => `> ${l.name}: ${l.text}`).join("\n");
  const speakerIds = Array.from(new Set(lines.map((l) => l.playerId)));
  return { text, speakerIds };
}

const FIXTURES: Record<string, TurnLine[]> = {
  empty: [],
  one: [{ playerId: "a", name: "Mara", text: "I open the door." }],
  twoPlayers: [
    { playerId: "a", name: "Mara", text: "I open the door." },
    { playerId: "b", name: "Tom", text: "I keep watch." },
  ],
  repeatedSpeaker: [
    { playerId: "b", name: "Tom", text: "Wait." },
    { playerId: "a", name: "Mara", text: "What?" },
    { playerId: "b", name: "Tom", text: "Did you hear that?" },
  ],
  awkwardText: [
    { playerId: "a", name: "Zoë 🐉", text: "  spaces kept  " },
    { playerId: "c", name: "Name: with colon", text: "line one\nline two" },
    { playerId: "d", name: "", text: "" },
    { playerId: "e", name: "Ünïcödé", text: "\"quotes\" and 'apostrophes' and > arrows" },
  ],
};

describe("buildTurnText", () => {
  for (const [label, lines] of Object.entries(FIXTURES)) {
    it(`matches the old Generate payload byte for byte: ${label}`, () => {
      expect(buildTurnText(lines)).toEqual(legacySubmitLines(lines));
    });
  }

  it("lists each speaker once, in first-spoken order", () => {
    expect(buildTurnText(FIXTURES.repeatedSpeaker)?.speakerIds).toEqual(["b", "a"]);
  });

  it("writes one '> Name: line' per queued line", () => {
    expect(buildTurnText(FIXTURES.twoPlayers)?.text).toBe(
      "> Mara: I open the door.\n> Tom: I keep watch.",
    );
  });
});
