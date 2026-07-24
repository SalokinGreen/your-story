import { describe, expect, it } from "vitest";
import {
  aggregateBatch,
  clearBatch,
  createBatch,
  isBatchReady,
  passedIds,
  recordInput,
  respondedIds,
  submittedIds,
  type BatchedInput,
} from "../app/misc/multiplayer/turnBatch";

function freeform(playerId: string, name: string, text: string): BatchedInput {
  return { playerId, name, kind: "freeform", text, choiceIndex: null };
}
function pass(playerId: string, name: string): BatchedInput {
  return { playerId, name, kind: "pass", text: null, choiceIndex: null };
}

describe("turnBatch", () => {
  it("is not ready until every expected seat has responded", () => {
    const batch = createBatch();
    const expected = ["host", "g1", "g2"];

    recordInput(batch, freeform("host", "Host", "I open the door"));
    expect(isBatchReady(batch, expected)).toBe(false);

    recordInput(batch, freeform("g1", "Alice", "I follow"));
    expect(isBatchReady(batch, expected)).toBe(false);

    recordInput(batch, pass("g2", "Bob"));
    expect(isBatchReady(batch, expected)).toBe(true);
  });

  it("does not auto-fire when everyone passed (nothing to narrate)", () => {
    const batch = createBatch();
    const expected = ["host", "g1"];
    recordInput(batch, pass("host", "Host"));
    recordInput(batch, pass("g1", "Alice"));
    expect(isBatchReady(batch, expected)).toBe(false);
    expect(aggregateBatch(batch, expected)).toBeNull();
  });

  it("last write wins so a player can revise before the turn fires", () => {
    const batch = createBatch();
    recordInput(batch, freeform("g1", "Alice", "first take"));
    recordInput(batch, freeform("g1", "Alice", "final take"));
    const turn = aggregateBatch(batch, ["g1"]);
    expect(turn?.content).toBe("> Alice: final take");
    expect(submittedIds(batch)).toEqual(["g1"]);
  });

  it("aggregates contributors in expected-seat order, ignoring arrival order", () => {
    const batch = createBatch();
    // Arrive out of order.
    recordInput(batch, freeform("g2", "Bob", "I draw my sword"));
    recordInput(batch, freeform("host", "Host", "I cast light"));
    recordInput(batch, pass("g1", "Alice"));

    const turn = aggregateBatch(batch, ["host", "g1", "g2"]);
    expect(turn).toEqual({
      content: "> Host: I cast light\n> Bob: I draw my sword",
      speakerIds: ["host", "g2"],
    });
  });

  it("keeps already-attributed voice lines verbatim", () => {
    const batch = createBatch();
    recordInput(batch, {
      playerId: "g1",
      name: "Alice",
      kind: "voice",
      text: "> Alice: I whisper a warning",
      choiceIndex: null,
    });
    const turn = aggregateBatch(batch, ["g1"]);
    expect(turn?.content).toBe("> Alice: I whisper a warning");
  });

  it("tracks submitted / passed / responded partitions", () => {
    const batch = createBatch();
    recordInput(batch, freeform("host", "Host", "go north"));
    recordInput(batch, pass("g1", "Alice"));
    expect(submittedIds(batch)).toEqual(["host"]);
    expect(passedIds(batch)).toEqual(["g1"]);
    expect(respondedIds(batch).sort()).toEqual(["g1", "host"]);
  });

  it("clearBatch resets the round", () => {
    const batch = createBatch();
    recordInput(batch, freeform("host", "Host", "x"));
    clearBatch(batch);
    expect(respondedIds(batch)).toEqual([]);
    expect(isBatchReady(batch, ["host"])).toBe(false);
  });
});
