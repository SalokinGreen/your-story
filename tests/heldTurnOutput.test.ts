/**
 * The narration hold (app/misc/heldTurnOutput.ts, decision 221): the five
 * narration and choices callbacks queue until the caller releases them, and
 * everything else passes through.
 */
import { describe, it, expect } from "vitest";
import { createHeldTurnOutput } from "@/app/misc/heldTurnOutput";
import type { GenerationCallbacks, TokenUsage } from "@/app/misc/generation";
import type { Choice } from "@/app/misc/structs";

const USAGE: TokenUsage = { promptTokens: 1, completionTokens: 2, totalTokens: 3 };
const CHOICES = [{ text: "Open it" }, { text: "Leave" }] as unknown as Choice[];

function recorder() {
  const log: string[] = [];
  const callbacks: GenerationCallbacks = {
    onStoryStart: (narrated) => log.push(`start:${narrated}`),
    onStoryContent: (chunk, full) => log.push(`content:${chunk}|${full}`),
    onStoryComplete: (content, usage) =>
      log.push(`complete:${content}|${usage.totalTokens}`),
    onChoicesStart: () => log.push("choices-start"),
    onChoicesComplete: (choices) => log.push(`choices:${choices.length}`),
    onGMContent: (_d, full) => log.push(`gm:${full}`),
    onGMReasoning: (_d, full) => log.push(`reasoning:${full}`),
  };
  return { log, callbacks };
}

function writeTurn(cb: GenerationCallbacks, text = "The door opens.") {
  cb.onStoryStart?.(true);
  cb.onStoryContent?.("The door", "The door");
  cb.onStoryContent?.(" opens.", text);
  cb.onStoryComplete?.(text, USAGE);
  cb.onChoicesStart?.();
  cb.onChoicesComplete?.(CHOICES, USAGE);
}

describe("createHeldTurnOutput", () => {
  it("queues the narration and choices callbacks and shows nothing", () => {
    const { log, callbacks } = recorder();
    const held = createHeldTurnOutput(callbacks);
    writeTurn(held.callbacks);
    expect(log).toEqual([]);
  });

  it("passes every other callback straight through", () => {
    const { log, callbacks } = recorder();
    const held = createHeldTurnOutput(callbacks);
    held.callbacks.onGMReasoning?.("x", "thinking");
    held.callbacks.onGMContent?.("x", "prose");
    expect(log).toEqual(["reasoning:thinking", "gm:prose"]);
  });

  it("releases the text once, as written, as a story the page must append itself", () => {
    const { log, callbacks } = recorder();
    const held = createHeldTurnOutput(callbacks);
    writeTurn(held.callbacks);
    held.release();
    // narratedByGMStage is false: the held text was never streamed live.
    expect(log).toEqual([
      "start:false",
      "content:The door opens.|The door opens.",
      "complete:The door opens.|3",
    ]);
    held.release();
    expect(log).toHaveLength(3);
  });

  it("releases the rewrite instead of the first draft", () => {
    const { log, callbacks } = recorder();
    const held = createHeldTurnOutput(callbacks);
    writeTurn(held.callbacks);
    held.release("You force the lock.");
    expect(log.join("\n")).toContain("complete:You force the lock.|3");
    expect(log.join("\n")).not.toContain("The door opens.");
  });

  it("keeps the choices apart from the text until they are flushed, in order", () => {
    const { log, callbacks } = recorder();
    const held = createHeldTurnOutput(callbacks);
    writeTurn(held.callbacks);
    held.release();
    expect(log.some((l) => l.startsWith("choices"))).toBe(false);
    held.flushChoices();
    expect(log.slice(-2)).toEqual(["choices-start", "choices:2"]);
    held.flushChoices();
    expect(log.filter((l) => l.startsWith("choices"))).toHaveLength(2);
  });

  it("drops the choices when a rewrite replaced the text they came from", () => {
    const { log, callbacks } = recorder();
    const held = createHeldTurnOutput(callbacks);
    writeTurn(held.callbacks);
    held.release("Rewritten.");
    held.dropChoices();
    held.flushChoices();
    expect(log.some((l) => l.startsWith("choices"))).toBe(false);
  });

  it("discard throws a whole attempt away and holds the next one afresh", () => {
    const { log, callbacks } = recorder();
    const held = createHeldTurnOutput(callbacks);
    writeTurn(held.callbacks, "First attempt.");
    held.discard();
    writeTurn(held.callbacks, "Second attempt.");
    held.release();
    held.flushChoices();
    const text = log.join("\n");
    expect(text).not.toContain("First attempt.");
    expect(text).toContain("complete:Second attempt.|3");
    expect(log.filter((l) => l.startsWith("start")).length).toBe(1);
  });

  it("releases nothing when nothing was written (a Stop shows no text)", () => {
    const { log, callbacks } = recorder();
    const held = createHeldTurnOutput(callbacks);
    held.release();
    held.flushChoices();
    expect(log).toEqual([]);
  });
});

describe("an empty held turn and a continuation after a pause release", () => {
  it("appends no part for an empty turn, but still completes the narration", () => {
    const { log, callbacks } = recorder();
    const held = createHeldTurnOutput(callbacks);
    held.callbacks.onStoryStart?.(false);
    held.callbacks.onStoryComplete?.("", USAGE);
    held.release();
    expect(log.some((l) => l.startsWith("content:"))).toBe(false);
    expect(log).toContain("complete:|3");
  });

  it("still releases a rewrite given for an otherwise empty queue", () => {
    const { log, callbacks } = recorder();
    const held = createHeldTurnOutput(callbacks);
    held.release("Rewritten.");
    expect(log).toContain("content:Rewritten.|Rewritten.");
  });

  it("adds only the tail to the live view when a pause already showed the start", () => {
    const { log, callbacks } = recorder();
    const held = createHeldTurnOutput(callbacks);
    writeTurn(held.callbacks, "First part.\n\nSecond part.");
    held.release(undefined, "First part.");
    expect(log).toContain("gm:Second part.");
    expect(log).toContain("start:true");
    expect(log).toContain("content:First part.\n\nSecond part.|First part.\n\nSecond part.");
  });
});
