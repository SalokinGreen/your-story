import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  INTERRUPTED_TURN_MAX_AGE_MS,
  clearTurn,
  markTurnEnded,
  markTurnStarted,
  readInterruptedTurn,
  repairInterruptedStory,
  resetLiveTurnIdsForTests,
  type InterruptedTurn,
} from "@/app/misc/interruptedTurn";
import type { StoryData } from "@/app/misc/structs";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    length: 0,
    _data: data,
  };
}

const rec = (over: Partial<InterruptedTurn> = {}): InterruptedTurn => ({
  storyId: "s1",
  turnId: "t1",
  mode: "new",
  text: "I open the door",
  partsBefore: 2,
  startedAt: 1_000,
  ...over,
});

describe("interruptedTurn", () => {
  let store: ReturnType<typeof memoryStorage>;
  beforeEach(() => {
    store = memoryStorage();
    vi.stubGlobal("localStorage", store);
  });
  afterEach(() => vi.unstubAllGlobals());

  // Marks a record, then forgets the live ids as a process restart would.
  const markAndRestart = (r: InterruptedTurn) => {
    markTurnStarted(r);
    resetLiveTurnIdsForTests();
  };

  it("returns null and keeps the record while its turn is live in this process", () => {
    markTurnStarted(rec());
    expect(readInterruptedTurn("s1", 2_000)).toBeNull();
    expect(store._data.has("ys:interruptedTurn:s1")).toBe(true);
    resetLiveTurnIdsForTests();
    expect(readInterruptedTurn("s1", 2_000)).toEqual(rec());
  });

  it("a kept record is offered once its turn has ended in this process", () => {
    markTurnStarted(rec());
    markTurnEnded("t1");
    expect(readInterruptedTurn("s1", 2_000)).toEqual(rec());
  });

  it("marks and reads a record under a per-story key", () => {
    markAndRestart(rec());
    expect(store._data.has("ys:interruptedTurn:s1")).toBe(true);
    expect(readInterruptedTurn("s1", 2_000)).toEqual(rec());
  });

  it("keeps stories apart", () => {
    markAndRestart(rec());
    markAndRestart(rec({ storyId: "s2", turnId: "t9", text: "other" }));
    expect(readInterruptedTurn("s1", 2_000)?.text).toBe("I open the door");
    expect(readInterruptedTurn("s2", 2_000)?.text).toBe("other");
    expect(readInterruptedTurn("s3", 2_000)).toBeNull();
  });

  it("clears only the record of the same turn id", () => {
    markAndRestart(rec());
    clearTurn("s1", "other-turn");
    expect(readInterruptedTurn("s1", 2_000)).not.toBeNull();
    clearTurn("s1", "t1");
    expect(readInterruptedTurn("s1", 2_000)).toBeNull();
  });

  it("a late clear of an older turn leaves a newer turn's record", () => {
    markAndRestart(rec({ turnId: "old" }));
    markAndRestart(rec({ turnId: "new" }));
    clearTurn("s1", "old");
    expect(readInterruptedTurn("s1", 2_000)?.turnId).toBe("new");
  });

  it("drops and returns null past 24 hours", () => {
    markAndRestart(rec());
    const now = 1_000 + INTERRUPTED_TURN_MAX_AGE_MS + 1;
    expect(readInterruptedTurn("s1", now)).toBeNull();
    expect(store._data.has("ys:interruptedTurn:s1")).toBe(false);
  });

  it("still offers a record just inside 24 hours", () => {
    markAndRestart(rec());
    expect(
      readInterruptedTurn("s1", 1_000 + INTERRUPTED_TURN_MAX_AGE_MS),
    ).not.toBeNull();
  });

  it("drops a corrupt record", () => {
    store.setItem("ys:interruptedTurn:s1", "{not json");
    expect(readInterruptedTurn("s1", 2_000)).toBeNull();
    store.setItem("ys:interruptedTurn:s1", JSON.stringify({ turnId: 3 }));
    expect(readInterruptedTurn("s1", 2_000)).toBeNull();
    expect(store._data.has("ys:interruptedTurn:s1")).toBe(false);
  });

  it("never throws when localStorage does", () => {
    const boom = () => {
      throw new Error("blocked");
    };
    vi.stubGlobal("localStorage", {
      getItem: boom,
      setItem: boom,
      removeItem: boom,
    });
    expect(() => markAndRestart(rec())).not.toThrow();
    expect(() => clearTurn("s1", "t1")).not.toThrow();
    expect(readInterruptedTurn("s1", 2_000)).toBeNull();
  });

  it("is a no-op without localStorage", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => markAndRestart(rec())).not.toThrow();
    expect(readInterruptedTurn("s1", 2_000)).toBeNull();
  });
});

describe("repairInterruptedStory", () => {
  const part = (content: string, user: boolean) => ({
    content,
    imageUrl: "",
    user,
    role: user ? ("user" as const) : ("assistant" as const),
    choices: [],
  });
  const storyWith = (n: number) =>
    ({
      scene: {
        parts: Array.from({ length: n }, (_, i) => part(`p${i}`, i % 2 === 0)),
      },
    }) as unknown as StoryData;

  it("cuts back a story that gained the player line and a half reply", () => {
    const story = storyWith(4); // two before, then player line + half reply
    const out = repairInterruptedStory(story, rec({ partsBefore: 2 }));
    expect(out).toBe(story);
    expect(out.scene.parts.map((p) => p.content)).toEqual(["p0", "p1"]);
  });

  it("leaves a story that never gained anything", () => {
    const story = storyWith(2);
    repairInterruptedStory(story, rec({ partsBefore: 2 }));
    expect(story.scene.parts).toHaveLength(2);
  });

  it("never grows a shorter story", () => {
    const story = storyWith(1);
    repairInterruptedStory(story, rec({ partsBefore: 5 }));
    expect(story.scene.parts).toHaveLength(1);
  });

  it("retry: drops an empty trailing assistant part (a killed full reroll)", () => {
    const story = storyWith(2);
    story.scene.parts.push(part("  ", false));
    repairInterruptedStory(story, rec({ mode: "retry", partsBefore: 3 }));
    expect(story.scene.parts.map((p) => p.content)).toEqual(["p0", "p1"]);
  });

  it("retry: keeps a non-empty trailing assistant part", () => {
    const story = storyWith(2);
    repairInterruptedStory(story, rec({ mode: "retry", partsBefore: 2 }));
    expect(story.scene.parts.map((p) => p.content)).toEqual(["p0", "p1"]);
  });

  it("new: leaves an empty trailing assistant part alone", () => {
    const story = storyWith(2);
    story.scene.parts.push(part("", false));
    repairInterruptedStory(story, rec({ mode: "new", partsBefore: 3 }));
    expect(story.scene.parts).toHaveLength(3);
  });
});
