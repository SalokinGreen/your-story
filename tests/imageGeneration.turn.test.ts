/**
 * generate_image through a real turn (docs/image-generation-design.md §3.1,
 * plan S5): the tool is offered to the GM only when the page handed
 * generateStoryTurn the picture queue's dependencies and a provider key exists;
 * a scene picture's card reaches the page through onSceneImageRequested while
 * the turn's part is still being built; the turn's part carries the id the
 * picture is filed under; and the picture bills to THIS turn's ledger. The
 * provider and the store are injected, so nothing leaves the process.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { generateStoryTurn, type GenerationOptions } from "@/app/misc/generation";
import { NARRATION_MODEL_KEY } from "@/app/misc/reasoningTiers";
import { createMockGMFetch, sseStreamResponse } from "./helpers/mockGMFetch";
import {
  getImageJobState,
  resetImageJobsForTests,
  type ImageJobDeps,
} from "@/app/misc/imageJobs";
import { getTurnCostReport } from "@/app/misc/turnCost";
import type { SceneImageRef, StoryData } from "@/app/misc/structs";

const PROSE = "Dawn breaks over the harbour. Kessa waves from the quay.";
const PNG_URI = "data:image/png;base64,iVBORw0KGgo=";

function story(): StoryData {
  return {
    story_name: "Test Story",
    premise: "Test premise",
    player_name: "Test Player",
    scene: { parts: [] },
    stats: [],
    resources: [],
    inventory: [],
    abilities: [],
    achievements: [],
    lore: [
      {
        title: "Character Sheet",
        content: "Test Player, a thief.",
        type: "character_sheet",
        enabled: true,
      },
    ],
    memory: [],
    npcs: [
      {
        id: "n1",
        name: "Kessa",
        description: "A smuggler.",
        role: "",
        status: "alive",
        relationship: "",
        attitude: "neutral",
        createdAt: 0,
      },
    ],
    sessionZeroActive: false,
  } as unknown as StoryData;
}

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetImageJobsForTests();
});

interface Harness {
  imageDeps: ImageJobDeps;
  falPrompts: string[];
  saved: string[];
  live: { sd: StoryData };
}

function imageHarness(keys: ImageJobDeps["keys"] = { falKey: "fal-key" }): Harness {
  const live = { sd: story() };
  const falPrompts: string[] = [];
  const saved: string[] = [];
  return {
    live,
    falPrompts,
    saved,
    imageDeps: {
      keys,
      getSettings: () => ({
        gmImagesEnabled: true,
        gmImagesPerScene: 2,
        provider: "auto",
        sceneModel: "FLUX.1 schnell",
        settingsVersion: 2,
        portraitModel: "FLUX.2 [pro]",
        referenceModel: "FLUX.2 [pro] edit",
        deepinfraModel: "P-Image",
        openrouterModel: "Nano Banana",
        defaultStyle: "painterly digital illustration, cinematic lighting",
      }),
      getStoryData: () => live.sd,
      patchStoryData: (fn) => {
        live.sd = fn(live.sd);
      },
      io: {
        generateFal: async (req) => {
          falPrompts.push(req.prompt);
          return { ok: true, dataUri: PNG_URI, width: 1024, height: 768 };
        },
        saveImage: async (img) => {
          saved.push(img.id);
        },
        getImage: async () => null,
        sleep: async () => {},
      },
    },
  };
}

async function runTurn(options: {
  rounds: Parameters<typeof createMockGMFetch>[0];
  extra?: Partial<GenerationOptions>;
  onSceneImageRequested?: (ref: SceneImageRef) => void;
}) {
  const gm = createMockGMFetch(options.rounds);
  const gmRequests: { tools?: { function: { name: string } }[] }[] = [];
  global.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    const body = JSON.parse((init?.body as string) ?? "{}");
    if (u.includes("/api/generate-stream") && body.tools) {
      gmRequests.push(body);
      return (gm.fetchMock as unknown as typeof fetch)(url as RequestInfo, init);
    }
    if (u.includes("/api/generate-stream")) {
      return sseStreamResponse({ content: PROSE });
    }
    // Side agents (Observer, Memory Keeper, ...): nothing to report.
    return { ok: true, json: async () => ({ content: "[]" }) } as unknown as Response;
  }) as unknown as typeof fetch;
  vi.spyOn(console, "warn").mockImplementation(() => {});

  const result = await generateStoryTurn(
    story(),
    "I look at the quay",
    {
      storyModel: NARRATION_MODEL_KEY,
      toolsModel: NARRATION_MODEL_KEY,
      choicesModel: NARRATION_MODEL_KEY,
      enableTools: true,
      skipChoices: true,
      replyLength: "medium",
      openRouterKey: "or-key",
      storyId: "story-1",
      ...options.extra,
    },
    { onSceneImageRequested: options.onSceneImageRequested },
  );
  for (let i = 0; i < 40; i++) await new Promise((r) => setTimeout(r, 0));
  return { result, gmRequests };
}

const toolNames = (req: { tools?: { function: { name: string } }[] }) =>
  (req.tools ?? []).map((t) => t.function.name);

describe("generate_image in a real turn", () => {
  it("is not offered when the page gave no picture dependencies", async () => {
    const { gmRequests } = await runTurn({ rounds: [{ content: PROSE }] });
    expect(gmRequests.length).toBeGreaterThan(0);
    expect(toolNames(gmRequests[0])).not.toContain("generate_image");
  });

  it("is not offered when there is no key for any image provider", async () => {
    const h = imageHarness({});
    const { gmRequests } = await runTurn({
      rounds: [{ content: PROSE }],
      extra: { imageJobDeps: h.imageDeps },
    });
    expect(toolNames(gmRequests[0])).not.toContain("generate_image");
  });

  it("is not offered without a story id to file pictures under", async () => {
    const h = imageHarness();
    const { gmRequests } = await runTurn({
      rounds: [{ content: PROSE }],
      extra: { imageJobDeps: h.imageDeps, storyId: undefined },
    });
    expect(toolNames(gmRequests[0])).not.toContain("generate_image");
  });

  it("is offered with keys, queues the picture, and files it under the turn's part", async () => {
    const h = imageHarness();
    const refs: SceneImageRef[] = [];
    const { result, gmRequests } = await runTurn({
      rounds: [
        {
          toolCalls: [
            {
              name: "generate_image",
              arguments: {
                subject: "scene",
                description: "Dawn light on the harbour, a woman waving from the quay",
                featuring: ["n1"],
              },
            },
          ],
        },
        { content: PROSE },
      ],
      extra: { imageJobDeps: h.imageDeps, scenePartId: "part-from-page" },
      onSceneImageRequested: (ref) => refs.push(ref),
    });

    expect(toolNames(gmRequests[0])).toContain("generate_image");
    // The first round's system prompt states the cap.
    expect(JSON.stringify(gmRequests[0])).toContain("at most 2 per scene");

    // The card's ref reached the page while the part was being built...
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ requestedBy: "gm" });
    // ...the part carries the id the page chose...
    expect(result.scenePart?.id).toBe("part-from-page");
    // ...and the picture was painted in the background and saved under the ref's id.
    expect(h.falPrompts).toHaveLength(1);
    expect(h.falPrompts[0]).toContain("Dawn light on the harbour");
    expect(h.falPrompts[0]).toContain("Kessa: A smuggler.");
    expect(h.saved).toEqual([refs[0].imageId]);
    expect(getImageJobState(refs[0].imageId)).toEqual({
      status: "done",
      imageId: refs[0].imageId,
    });

    // The picture billed to this turn's ledger.
    const report = getTurnCostReport(result.meta.costTurnId!)!;
    expect(report.byStage.find((s) => s.stage === "image")?.calls).toBe(1);
  });

  it("assigns the part an id of its own when the page gave none", async () => {
    const { result } = await runTurn({ rounds: [{ content: PROSE }] });
    expect(result.scenePart?.id).toBeTruthy();
  });

  it("refuses beyond the per-scene cap inside the turn", async () => {
    const h = imageHarness();
    const refs: SceneImageRef[] = [];
    const call = (n: number) => ({
      name: "generate_image",
      id: `img-${n}`,
      arguments: { subject: "scene", description: `shot ${n}` },
    });
    const { result } = await runTurn({
      rounds: [
        { toolCalls: [call(1), call(2), call(3)] },
        { content: PROSE },
      ],
      extra: { imageJobDeps: h.imageDeps },
      onSceneImageRequested: (ref) => refs.push(ref),
    });
    // Cap is 2: two queued, the third refused with a reason the GM can read.
    expect(refs).toHaveLength(2);
    const results = result.gmResults?.filter((r) => r.toolName === "generate_image") ?? [];
    expect(results.map((r) => r.success)).toEqual([true, true, false]);
    expect(results[2].contextForStory).toContain("refused");
  });
});
