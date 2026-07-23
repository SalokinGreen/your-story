/**
 * Layer 3 periodic story-progress check-in: runStoryProgressObserver only
 * fires the LLM judge every N accepted turns (never every turn), then hands
 * back a holistic pacing note for the GM. Same fetch("/api/generate")
 * mocking pattern as directorAssistant.test.ts/observer.test.ts.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  runStoryProgressObserver,
  findRepeatedPhrases,
} from "../app/misc/storyProgressObserver";
import { StoryData, StoryThread, Goal } from "../app/misc/structs";

function createMockStoryData(overrides: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "Test Story",
    player_name: "Hero",
    premise: "A test adventure",
    scene: { parts: [] },
    stats: [],
    resources: [],
    inventory: [],
    abilities: [],
    lore: [],
    memory: [],
    npcs: [],
    threads: [],
    goals: [],
    ...overrides,
  } as StoryData;
}

function thread(overrides: Partial<StoryThread> = {}): StoryThread {
  return {
    id: "thread-1",
    title: "The Missing Artifact",
    description: "Someone stole the artifact",
    status: "active",
    createdAt: Date.now(),
    ...overrides,
  };
}

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "goal-1",
    title: "Find the artifact",
    shortDescription: "Find it",
    description: "Find the stolen artifact",
    active: true,
    fulfilled: false,
    ...overrides,
  };
}

const apiOptions = { model: "test-model", token: "tok" };

function assistantPart(content: string) {
  return { role: "assistant", user: false, content } as StoryData["scene"]["parts"][number];
}

describe("findRepeatedPhrases", () => {
  it("flags a phrase repeated across at least 3 distinct turns", () => {
    const turns = [
      "Her knuckles went white on the wheel.",
      "Something else entirely happens here.",
      "Her knuckles went white again.",
      "A different sentence with no overlap.",
      "Once more, her knuckles went white.",
    ];

    const result = findRepeatedPhrases(turns);

    // The longer, more specific "her knuckles went white" supersedes the
    // shorter substring it contains (see the dedup test below) - either is
    // an acceptable catch here, so just check the tic was caught at all.
    expect(result.some((c) => c.phrase.includes("knuckles went white"))).toBe(true);
  });

  it("does not flag a phrase repeated in only 2 turns", () => {
    const turns = [
      "Her knuckles went white on the wheel.",
      "Nothing repeats in this turn.",
      "Her knuckles went white again.",
    ];

    const result = findRepeatedPhrases(turns);

    expect(result.some((c) => c.phrase === "knuckles went white")).toBe(false);
  });

  it("counts a phrase once per turn even if it appears twice in the same turn", () => {
    const turns = [
      "white knuckles gripped the wheel, white knuckles never let go.",
      "Elsewhere, nothing similar happens.",
      "white knuckles gripped the railing too.",
    ];

    const result = findRepeatedPhrases(turns);

    // 3 total occurrences, but only 2 distinct turns - below the threshold.
    expect(result.some((c) => c.phrase === "white knuckles")).toBe(false);
  });

  it("ignores phrases made entirely of stopwords", () => {
    const turns = [
      "and then he was in the of it",
      "and then he was in the of it",
      "and then he was in the of it",
    ];

    const result = findRepeatedPhrases(turns);

    expect(result.length).toBe(0);
  });

  it("prefers a longer phrase over a shorter substring it contains", () => {
    const turns = [
      "her white knuckles gripped the wheel",
      "her white knuckles trembled with fear",
      "her white knuckles never relaxed and her white knuckles ached",
    ];

    const result = findRepeatedPhrases(turns);
    const phrases = result.map((c) => c.phrase);

    expect(phrases).toContain("her white knuckles");
    expect(phrases).not.toContain("white knuckles");
  });
});

describe("runStoryProgressObserver", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("is a no-op without calling the API for empty narration", async () => {
    const storyData = createMockStoryData();
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await runStoryProgressObserver(storyData, "", apiOptions, 10);

    expect(result.ran).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storyData.turnsSinceStoryProgressCheck).toBeUndefined();
  });

  it("increments the counter without calling the API while below the interval", async () => {
    const storyData = createMockStoryData();
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await runStoryProgressObserver(
      storyData,
      "Something happens.",
      apiOptions,
      10,
    );

    expect(result.ran).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storyData.turnsSinceStoryProgressCheck).toBe(1);
  });

  it("accumulates the counter across repeated below-interval calls", async () => {
    const storyData = createMockStoryData();
    global.fetch = vi.fn() as unknown as typeof fetch;

    for (let i = 0; i < 4; i++) {
      await runStoryProgressObserver(storyData, `Turn ${i}.`, apiOptions, 10);
    }

    expect(storyData.turnsSinceStoryProgressCheck).toBe(4);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("fires the check and resets the counter once the interval is reached", async () => {
    const storyData = createMockStoryData({
      threads: [thread()],
      goals: [goal()],
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({
          status: "dragging",
          note: "The Missing Artifact thread has stalled - give it a push.",
        }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await runStoryProgressObserver(
      storyData,
      "Nothing much happens.",
      apiOptions,
      1,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.ran).toBe(true);
    expect(result.status).toBe("dragging");
    expect(result.note).toBe(
      "The Missing Artifact thread has stalled - give it a push.",
    );
    expect(storyData.turnsSinceStoryProgressCheck).toBe(0);
  });

  it("only calls the API on the turn the interval is actually reached", async () => {
    const storyData = createMockStoryData();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({ status: "on_track", note: "Keep it up." }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await runStoryProgressObserver(storyData, "Turn 1.", apiOptions, 3);
    expect(fetchMock).not.toHaveBeenCalled();
    await runStoryProgressObserver(storyData, "Turn 2.", apiOptions, 3);
    expect(fetchMock).not.toHaveBeenCalled();
    await runStoryProgressObserver(storyData, "Turn 3.", apiOptions, 3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("resumes counting from zero after a check-in fires", async () => {
    const storyData = createMockStoryData();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({ status: "on_track", note: "Keep it up." }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await runStoryProgressObserver(storyData, "Turn 1.", apiOptions, 2);
    await runStoryProgressObserver(storyData, "Turn 2.", apiOptions, 2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(storyData.turnsSinceStoryProgressCheck).toBe(0);

    await runStoryProgressObserver(storyData, "Turn 3.", apiOptions, 2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(storyData.turnsSinceStoryProgressCheck).toBe(1);
  });

  it("resets the counter even when the API call fails (fails open)", async () => {
    const storyData = createMockStoryData();
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await runStoryProgressObserver(
      storyData,
      "Something happens.",
      apiOptions,
      1,
    );

    expect(result.ran).toBe(true);
    expect(result.status).toBeUndefined();
    expect(result.note).toBeUndefined();
    expect(storyData.turnsSinceStoryProgressCheck).toBe(0);
  });

  it("fails open when the API response isn't ok", async () => {
    const storyData = createMockStoryData();
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;

    const result = await runStoryProgressObserver(storyData, "Turn.", apiOptions, 1);

    expect(result.ran).toBe(true);
    expect(result.note).toBeUndefined();
  });

  it("fails open when the response isn't valid JSON", async () => {
    const storyData = createMockStoryData();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: "not json at all" }),
    }) as unknown as typeof fetch;

    const result = await runStoryProgressObserver(storyData, "Turn.", apiOptions, 1);

    expect(result.ran).toBe(true);
    expect(result.note).toBeUndefined();
  });

  it("rejects an unrecognized status value from the model", async () => {
    const storyData = createMockStoryData();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({ status: "great job", note: "Nice." }),
      }),
    }) as unknown as typeof fetch;

    const result = await runStoryProgressObserver(storyData, "Turn.", apiOptions, 1);

    expect(result.ran).toBe(true);
    expect(result.note).toBeUndefined();
  });

  it("parses a response wrapped in a markdown code fence", async () => {
    const storyData = createMockStoryData();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: '```json\n{"status": "rushing", "note": "Slow down."}\n```',
      }),
    }) as unknown as typeof fetch;

    const result = await runStoryProgressObserver(storyData, "Turn.", apiOptions, 1);

    expect(result.status).toBe("rushing");
    expect(result.note).toBe("Slow down.");
  });

  it("passes deterministically-detected repeated phrases to the judge and surfaces the ones it confirms", async () => {
    const storyData = createMockStoryData({
      scene: {
        parts: [
          assistantPart("Her knuckles went white as she gripped the wheel."),
          assistantPart("Her knuckles went white against the cold railing."),
          assistantPart("His amber eyes watched her from the shadows."),
          assistantPart("Those amber eyes seemed to glow in the dark."),
        ],
      },
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({
          status: "on_track",
          note: "Good momentum.",
          repeated_phrases: ["knuckles went white", "amber eyes"],
          repetition_note:
            "You've leaned on 'knuckles went white' and 'amber eyes' repeatedly - vary the description.",
        }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await runStoryProgressObserver(
      storyData,
      "Her knuckles went white one more time, and his amber eyes never left her.",
      apiOptions,
      1,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const userMessage = requestBody.messages.find((m: { role: string }) => m.role === "user")
      .content as string;
    expect(userMessage).toContain("knuckles went white");
    expect(userMessage).toContain("amber eyes");

    expect(result.repeatedPhrases).toEqual(["knuckles went white", "amber eyes"]);
    expect(result.repetitionNote).toBe(
      "You've leaned on 'knuckles went white' and 'amber eyes' repeatedly - vary the description.",
    );
  });

  it("leaves repeatedPhrases/repetitionNote undefined when the judge confirms none of the candidates", async () => {
    const storyData = createMockStoryData({
      scene: {
        parts: [
          assistantPart("Her knuckles went white as she gripped the wheel."),
          assistantPart("Her knuckles went white against the cold railing."),
        ],
      },
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({
          status: "on_track",
          note: "Good momentum.",
          repeated_phrases: [],
        }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await runStoryProgressObserver(
      storyData,
      "Her knuckles went white one more time.",
      apiOptions,
      1,
    );

    expect(result.repeatedPhrases).toBeUndefined();
    expect(result.repetitionNote).toBeUndefined();
  });

  it("leaves repeatedPhrases/repetitionNote undefined when no phrase clears the deterministic threshold", async () => {
    const storyData = createMockStoryData();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify({ status: "on_track", note: "Keep it up." }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await runStoryProgressObserver(storyData, "Turn.", apiOptions, 1);

    expect(result.repeatedPhrases).toBeUndefined();
    expect(result.repetitionNote).toBeUndefined();
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const userMessage = requestBody.messages.find((m: { role: string }) => m.role === "user")
      .content as string;
    expect(userMessage).not.toContain("mechanical word-counter");
  });

  it("defaults to DEFAULT_STORY_PROGRESS_CHECK_INTERVAL when no interval is passed", async () => {
    const storyData = createMockStoryData();
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    // Default interval is 10 - a single call should not be due yet.
    const result = await runStoryProgressObserver(storyData, "Turn.", apiOptions);

    expect(result.ran).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storyData.turnsSinceStoryProgressCheck).toBe(1);
  });
});
