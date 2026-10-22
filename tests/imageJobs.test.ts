/**
 * The picture queue (imageJobs.ts): first in first out and one at a time; a
 * finished picture lands on the CURRENT StoryData, not the copy it was queued
 * against; the cost is recorded at the catalog price on the turn that asked;
 * Stop cancels by turn; one retry on busy and none on declined; and every
 * terminal state writes a Debug Logs line. No network: the provider calls and
 * the store are injected.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const logSpy = vi.hoisted(() => ({
  action: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/app/misc/logger", () => ({ logger: logSpy }));

import {
  BUSY_RETRY_DELAY_MS,
  buildImagePrompt,
  cancelImageJobsForTurn,
  characterLine,
  enqueueImageJob,
  getImageJobState,
  resetImageJobsForTests,
  subscribeImageJobs,
  type ImageJobDeps,
  type ImageJobIO,
  type ImageJobRequest,
  type ImageJobState,
} from "@/app/misc/imageJobs";
import { DEFAULT_IMAGE_SETTINGS } from "@/app/misc/imageSettings";
import { beginTurnCost, getTurnCostReport } from "@/app/misc/turnCost";
import type { StoryData } from "@/app/misc/structs";
import type { StoredImage } from "@/app/misc/imageStore";

const PNG_URI = "data:image/png;base64,iVBORw0KGgo=";

function story(): StoryData {
  return {
    story_name: "S",
    player_name: "Hero",
    premise: "",
    scene: {
      parts: [
        { id: "p1", content: "The harbour wakes.", user: false, role: "assistant", imageUrl: "" },
      ],
    },
    npcs: [
      {
        id: "n1",
        name: "Kessa",
        description: "A tall smuggler with a scarred chin.",
        role: "",
        status: "alive",
        relationship: "",
        attitude: "neutral",
        createdAt: 0,
      },
    ],
    lore: [
      { title: "Hero sheet", type: "character_sheet", content: "A weathered sailor." },
      { title: "Harbour", content: "x" },
    ],
  } as unknown as StoryData;
}

type FalResult = Awaited<ReturnType<ImageJobIO["generateFal"]>>;

interface Harness {
  deps: ImageJobDeps;
  current: { sd: StoryData };
  saved: StoredImage[];
  falCalls: { model: string; prompt: string; signal?: AbortSignal }[];
  sleeps: number[];
  settled: { id: string; state: ImageJobState }[];
  setFal: (fn: ImageJobIO["generateFal"]) => void;
}

function harness(): Harness {
  const current = { sd: story() };
  const saved: StoredImage[] = [];
  const falCalls: Harness["falCalls"] = [];
  const sleeps: number[] = [];
  const settled: Harness["settled"] = [];
  let fal: ImageJobIO["generateFal"] = async () => ({
    ok: true,
    dataUri: PNG_URI,
    width: 1024,
    height: 768,
  });
  let n = 0;
  const deps: ImageJobDeps = {
    keys: { falKey: "k" },
    getSettings: () => DEFAULT_IMAGE_SETTINGS,
    getStoryData: () => current.sd,
    patchStoryData: (fn) => {
      current.sd = fn(current.sd);
    },
    onSettled: (id, state) => settled.push({ id, state }),
    io: {
      generateFal: (req) => {
        falCalls.push({ model: req.model, prompt: req.prompt, signal: req.signal });
        return fal(req);
      },
      saveImage: async (img) => {
        saved.push(img);
      },
      getImage: async () => null,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      newId: () => `job-${++n}`,
    },
  };
  return { deps, current, saved, falCalls, sleeps, settled, setFal: (f) => (fal = f) };
}

function request(overrides: Partial<ImageJobRequest> = {}): ImageJobRequest {
  return {
    storyId: "story-1",
    subject: "scene",
    description: "Dawn light on the harbour",
    featuring: [],
    target: { kind: "scenePart", partId: "p1" },
    requestedBy: "gm",
    ...overrides,
  };
}

/** Waits until a job reaches a terminal state. */
function untilSettled(jobId: string): Promise<ImageJobState> {
  return new Promise((resolve) => {
    const check = () => {
      const s = getImageJobState(jobId);
      if (s && s.status !== "pending") return resolve(s);
    };
    check();
    const off = subscribeImageJobs((id) => {
      if (id === jobId) {
        const s = getImageJobState(jobId);
        if (s && s.status !== "pending") {
          off();
          resolve(s);
        }
      }
    });
  });
}

beforeEach(() => {
  resetImageJobsForTests();
  logSpy.action.mockClear();
  logSpy.warn.mockClear();
  logSpy.error.mockClear();
});

describe("queue order", () => {
  it("runs one job at a time, first in first out", async () => {
    const h = harness();
    const releases: Array<(r: FalResult) => void> = [];
    h.setFal(
      () =>
        new Promise<FalResult>((resolve) => {
          releases.push(resolve);
        }),
    );
    const a = enqueueImageJob(request({ description: "first" }), h.deps);
    const b = enqueueImageJob(request({ description: "second" }), h.deps);
    await vi.waitFor(() => expect(h.falCalls).toHaveLength(1));
    // The second has not started while the first is still painting.
    expect(h.falCalls[0].prompt).toContain("first");
    expect(getImageJobState(b)).toEqual({ status: "pending" });

    releases[0]({ ok: true, dataUri: PNG_URI, width: 1024, height: 768 });
    await untilSettled(a);
    await vi.waitFor(() => expect(h.falCalls).toHaveLength(2));
    expect(h.falCalls[1].prompt).toContain("second");
    releases[1]({ ok: true, dataUri: PNG_URI, width: 1024, height: 768 });
    expect(await untilSettled(b)).toEqual({ status: "done", imageId: b });
    expect(h.saved.map((s) => s.id)).toEqual([a, b]);
  });
});

describe("attaching to the current StoryData", () => {
  it("adds the card at once and keeps whatever the turn did meanwhile", async () => {
    const h = harness();
    let release!: (r: FalResult) => void;
    h.setFal(() => new Promise<FalResult>((r) => (release = r)));
    const id = enqueueImageJob(request({ requestedBy: "player" }), h.deps);

    // The card exists as soon as the job is queued, so it survives a reload.
    expect(h.current.sd.scene.parts[0].images).toEqual([
      { imageId: id, requestedBy: "player", description: "Dawn light on the harbour" },
    ]);

    // The turn moves on while the picture paints: a new part, an edited NPC.
    h.current.sd = {
      ...h.current.sd,
      scene: {
        parts: [
          ...h.current.sd.scene.parts,
          { id: "p2", content: "Next turn", user: false, role: "assistant", imageUrl: "" },
        ],
      },
      npcs: h.current.sd.npcs.map((n) => ({ ...n, description: "edited since" })),
    } as StoryData;

    await vi.waitFor(() => expect(h.falCalls).toHaveLength(1));
    release({ ok: true, dataUri: PNG_URI, width: 1024, height: 768 });
    await untilSettled(id);

    // Nothing the turn did was undone, and the ref was not added twice.
    expect(h.current.sd.scene.parts).toHaveLength(2);
    expect(h.current.sd.npcs[0].description).toBe("edited since");
    expect(h.current.sd.scene.parts[0].images).toHaveLength(1);
  });

  it("puts a finished portrait on the NPC, the player and a note", async () => {
    const h = harness();
    const npc = enqueueImageJob(
      request({ subject: "npc", target: { kind: "npc", npcId: "n1" }, skipInitialAttach: true }),
      h.deps,
    );
    await untilSettled(npc);
    const player = enqueueImageJob(
      request({ subject: "player", target: { kind: "player" }, skipInitialAttach: true }),
      h.deps,
    );
    await untilSettled(player);
    const lore = enqueueImageJob(
      request({ subject: "location", target: { kind: "lore", loreTitle: "Harbour" }, skipInitialAttach: true }),
      h.deps,
    );
    await untilSettled(lore);
    expect(h.current.sd.npcs[0].portraitImageId).toBe(npc);
    expect(h.current.sd.playerPortraitImageId).toBe(player);
    expect(h.current.sd.lore.find((l) => l.title === "Harbour")?.imageId).toBe(lore);
  });

  it("does not patch StoryData when queued with skipInitialAttach (the GM executor's clone)", () => {
    const h = harness();
    h.setFal(() => new Promise<FalResult>(() => {}));
    enqueueImageJob(request({ skipInitialAttach: true }), h.deps);
    expect(h.current.sd.scene.parts[0].images).toBeUndefined();
  });

  it("takes a pending portrait id back off the NPC when the picture does not come", async () => {
    const h = harness();
    h.setFal(async () => ({ ok: false, kind: "failed", message: "boom" }));
    const id = enqueueImageJob(
      request({ subject: "npc", target: { kind: "npc", npcId: "n1" } }),
      h.deps,
    );
    // Pending id was attached at once...
    expect(h.current.sd.npcs[0].portraitImageId).toBe(id);
    await untilSettled(id);
    // ...and removed when the job failed, so the GM may try again.
    expect(h.current.sd.npcs[0].portraitImageId).toBeUndefined();
  });
});

describe("cost", () => {
  it("records the picture at the catalog price on the turn that asked", async () => {
    const h = harness();
    const turn = beginTurnCost();
    beginTurnCost(); // a later turn is now open; the picture must still bill to `turn`
    const id = enqueueImageJob(request({ costTurnId: turn }), h.deps);
    await untilSettled(id);
    const report = getTurnCostReport(turn)!;
    const image = report.byStage.find((s) => s.stage === "image")!;
    expect(image.calls).toBe(1);
    expect(image.costUsd).toBeCloseTo(0.0024, 6);
    expect(report.entries[0].modelKey).toBe("FLUX.1 schnell");
    expect(report.hasUnpricedCalls).toBe(false);
  });

  it("bills nothing for a declined picture", async () => {
    const h = harness();
    const turn = beginTurnCost();
    h.setFal(async () => ({ ok: false, kind: "declined", message: "no" }));
    await untilSettled(enqueueImageJob(request({ costTurnId: turn }), h.deps));
    expect(getTurnCostReport(turn)!.calls).toBe(0);
  });

  it("stores the picture with its prompt, model and price for Regenerate", async () => {
    const h = harness();
    const id = enqueueImageJob(request(), h.deps);
    await untilSettled(id);
    expect(h.saved[0]).toMatchObject({
      id,
      storyId: "story-1",
      subject: "scene",
      provider: "fal",
      model: "FLUX.1 schnell",
      costUsd: 0.0024,
    });
    expect(h.saved[0].prompt).toContain("Dawn light on the harbour");
    expect(h.saved[0].prompt).toContain("Style: painterly digital illustration");
  });
});

describe("cancel by turn", () => {
  it("drops queued pictures of that turn and aborts the one painting", async () => {
    const h = harness();
    h.setFal(
      (req) =>
        new Promise<FalResult>((resolve) => {
          req.signal?.addEventListener("abort", () =>
            resolve({ ok: false, kind: "cancelled", message: "Cancelled" }),
          );
        }),
    );
    const turnA = beginTurnCost();
    const first = enqueueImageJob(request({ costTurnId: turnA }), h.deps);
    const second = enqueueImageJob(request({ costTurnId: turnA }), h.deps);
    await vi.waitFor(() => expect(h.falCalls).toHaveLength(1));

    cancelImageJobsForTurn(turnA);

    expect(await untilSettled(first)).toEqual({ status: "failed", message: "Cancelled" });
    expect(await untilSettled(second)).toEqual({ status: "failed", message: "Cancelled" });
    // The queued one never reached the provider, and nothing was saved or billed.
    expect(h.falCalls).toHaveLength(1);
    expect(h.saved).toHaveLength(0);
  });

  it("leaves other turns' pictures alone", async () => {
    const h = harness();
    const turnA = beginTurnCost();
    const turnB = beginTurnCost();
    h.setFal(async () => ({ ok: true, dataUri: PNG_URI, width: 1024, height: 768 }));
    const id = enqueueImageJob(request({ costTurnId: turnB }), h.deps);
    cancelImageJobsForTurn(turnA);
    expect((await untilSettled(id)).status).toBe("done");
  });

  it("an aborted caller signal cancels the job", async () => {
    const h = harness();
    const controller = new AbortController();
    controller.abort();
    const id = enqueueImageJob(request({ signal: controller.signal }), h.deps);
    expect(await untilSettled(id)).toEqual({ status: "failed", message: "Cancelled" });
    expect(h.falCalls).toHaveLength(0);
  });
});

describe("retries", () => {
  it("retries once after 3 seconds when fal is busy", async () => {
    const h = harness();
    let calls = 0;
    h.setFal(async () => {
      calls++;
      return calls === 1
        ? { ok: false, kind: "busy", message: "busy" }
        : { ok: true, dataUri: PNG_URI, width: 1024, height: 768 };
    });
    const id = enqueueImageJob(request(), h.deps);
    expect((await untilSettled(id)).status).toBe("done");
    expect(calls).toBe(2);
    expect(h.sleeps).toEqual([BUSY_RETRY_DELAY_MS]);
  });

  it("gives up after a second busy", async () => {
    const h = harness();
    h.setFal(async () => ({ ok: false, kind: "busy", message: "busy" }));
    const id = enqueueImageJob(request(), h.deps);
    expect((await untilSettled(id)).status).toBe("failed");
    expect(h.falCalls).toHaveLength(2);
  });

  it("never retries a declined picture", async () => {
    const h = harness();
    h.setFal(async () => ({
      ok: false,
      kind: "declined",
      message: "declined",
      categories: ["gore"],
    }));
    const id = enqueueImageJob(request(), h.deps);
    expect(await untilSettled(id)).toEqual({
      status: "declined",
      message: "declined",
      categories: ["gore"],
    });
    expect(h.falCalls).toHaveLength(1);
    expect(h.sleeps).toEqual([]);
    expect(h.saved).toHaveLength(0);
  });
});

describe("a job never fails silently", () => {
  it("logs a line for done, declined and failed, and notifies the page", async () => {
    const h = harness();
    await untilSettled(enqueueImageJob(request(), h.deps));
    expect(logSpy.action).toHaveBeenCalledWith(
      expect.stringContaining("done"),
      expect.anything(),
    );

    h.setFal(async () => ({ ok: false, kind: "declined", message: "no" }));
    await untilSettled(enqueueImageJob(request(), h.deps));
    expect(logSpy.warn).toHaveBeenCalledWith(
      expect.stringContaining("declined"),
      expect.anything(),
    );

    h.setFal(async () => ({ ok: false, kind: "key", message: "fal rejected the key." }));
    await untilSettled(enqueueImageJob(request(), h.deps));
    expect(logSpy.error).toHaveBeenCalledWith(
      expect.stringContaining("failed"),
      expect.objectContaining({ message: "fal rejected the key." }),
    );

    expect(h.settled.map((s) => s.state.status)).toEqual(["done", "declined", "failed"]);
  });

  it("fails visibly when no provider key is set", async () => {
    const h = harness();
    const id = enqueueImageJob(request(), { ...h.deps, keys: {} });
    const state = await untilSettled(id);
    expect(state.status).toBe("failed");
    expect(logSpy.error).toHaveBeenCalled();
  });

  it("fails visibly when the picture cannot be saved", async () => {
    const h = harness();
    const id = enqueueImageJob(request(), {
      ...h.deps,
      io: {
        ...h.deps.io,
        saveImage: async () => {
          throw new Error("quota");
        },
      },
    });
    const state = await untilSettled(id);
    expect(state).toMatchObject({ status: "failed" });
    expect(h.saved).toHaveLength(0);
  });
});

describe("regenerate", () => {
  it("reuses the id and the saved prompt, skipping the builder", async () => {
    const h = harness();
    const id = enqueueImageJob(
      request({ reuseId: "old-picture", finalPrompt: "EXACT SAVED PROMPT" }),
      h.deps,
    );
    expect(id).toBe("old-picture");
    await untilSettled(id);
    expect(h.falCalls[0].prompt).toBe("EXACT SAVED PROMPT");
    expect(h.saved[0].id).toBe("old-picture");
  });
});

describe("the prompt (design §3.3)", () => {
  it("is the description, then the characters, then the story's style", () => {
    const sd = story();
    sd.imageStyle = "ink wash, muted";
    const prompt = buildImagePrompt("  Dawn   light  ", sd, ["n1", "player"], "ignored");
    const lines = prompt.split("\n\n");
    expect(lines[0]).toBe("Dawn light");
    expect(lines[1]).toContain("Kessa: A tall smuggler with a scarred chin.");
    expect(lines[1]).toContain("Hero: A weathered sailor.");
    expect(lines[2]).toContain("Style: ink wash, muted.");
    expect(lines[2]).toContain("No text");
  });

  it("falls back to the default style, and skips characters shown as references", () => {
    const sd = story();
    const prompt = buildImagePrompt("A hall", sd, ["n1"], "painterly", new Set(["n1"]));
    expect(prompt).not.toContain("Kessa");
    expect(prompt).toContain("Style: painterly.");
  });

  it("skips unknown characters", () => {
    expect(characterLine(story(), "ghost")).toBeNull();
  });
});
