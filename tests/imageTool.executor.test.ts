/**
 * generate_image in the GM executor (docs/image-generation-design.md §3.1):
 * the engine disposes. Everything is checked before anything is queued, a
 * refusal tells the GM why, the per-scene cap resets at the scene boundary, and
 * an accepted call answers at once with the picture queued in the background.
 */
import { describe, it, expect } from "vitest";
import { executeGMTools } from "@/app/misc/gmExecutor";
import { GM_TOOL_NAMES } from "@/app/misc/gmTools";
import { getToolProgressLabel } from "@/app/misc/gmToolLabels";
import { computeSceneKey } from "@/app/misc/reasoningTiers";
import type { ImageToolContext } from "@/app/misc/imageJobs";
import type { NPC, StoryData, StoryLore } from "@/app/misc/structs";

function npc(id: string, name: string, overrides: Partial<NPC> = {}): NPC {
  return {
    id,
    name,
    description: "",
    role: "",
    status: "alive",
    relationship: "",
    attitude: "neutral",
    createdAt: 0,
    ...overrides,
  } as NPC;
}

function story(overrides: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "S",
    player_name: "Hero",
    premise: "",
    scene: { parts: [] },
    stats: [],
    resources: [],
    inventory: [],
    abilities: [],
    achievements: [],
    lore: [{ title: "Harbour", content: "x" } as StoryLore],
    memory: [],
    npcs: [npc("n1", "Kessa"), npc("n2", "Brannock")],
    ...overrides,
  } as StoryData;
}

function call(args: Record<string, unknown>, id = "call-1") {
  return {
    id,
    function: { name: "generate_image", arguments: JSON.stringify(args) },
  };
}

interface Ctx {
  ctx: ImageToolContext;
  enqueued: Parameters<ImageToolContext["enqueue"]>[0][];
  sceneRefs: unknown[];
}

function context(overrides: Partial<ImageToolContext> = {}): Ctx {
  const enqueued: Ctx["enqueued"] = [];
  const sceneRefs: unknown[] = [];
  let n = 0;
  const ctx: ImageToolContext = {
    enabled: true,
    maxPerScene: 2,
    scenePartId: "part-xyz",
    enqueue: (req) => {
      enqueued.push(req);
      return `job-${++n}`;
    },
    onSceneImage: (ref) => sceneRefs.push(ref),
    ...overrides,
  };
  return { ctx, enqueued, sceneRefs };
}

async function run(sd: StoryData, args: Record<string, unknown>, ctx?: ImageToolContext) {
  return executeGMTools([call(args)], sd, {}, {}, ctx ? { imageJobs: ctx } : {});
}

describe("generate_image wiring", () => {
  it("is a GM tool with a label", () => {
    expect(GM_TOOL_NAMES).toContain("generate_image");
    expect(getToolProgressLabel("generate_image")).toBe("Painting a picture");
  });
});

describe("generate_image refusals", () => {
  it("is refused when pictures are off or no key is set (no context, or disabled)", async () => {
    const none = await run(story(), { subject: "scene", description: "x" });
    expect(none.results[0].success).toBe(false);
    expect(none.storyContext).toContain("refused");

    const { ctx, enqueued } = context({ enabled: false });
    const off = await run(story(), { subject: "scene", description: "x" }, ctx);
    expect(off.results[0].success).toBe(false);
    expect(enqueued).toHaveLength(0);
  });

  it("needs a description", async () => {
    const { ctx, enqueued } = context();
    const r = await run(story(), { subject: "scene", description: "   " }, ctx);
    expect(r.results[0].success).toBe(false);
    expect(enqueued).toHaveLength(0);
  });

  it("refuses an NPC that already has a portrait, and an unknown NPC", async () => {
    const { ctx, enqueued } = context();
    const has = story({ npcs: [npc("n1", "Kessa", { portraitImageId: "img" })] });
    const a = await run(has, { subject: "npc", npc_id: "n1", description: "x" }, ctx);
    expect(a.results[0].success).toBe(false);
    expect(a.storyContext).toContain("already has a portrait");

    const b = await run(story(), { subject: "npc", npc_id: "ghost", description: "x" }, ctx);
    expect(b.results[0].success).toBe(false);
    expect(enqueued).toHaveLength(0);
  });

  it("refuses a note that already has a picture, and an unknown note", async () => {
    const { ctx, enqueued } = context();
    const has = story({
      lore: [{ title: "Harbour", content: "x", imageId: "img" } as StoryLore],
    });
    const a = await run(has, { subject: "location", lore_title: "Harbour", description: "x" }, ctx);
    expect(a.results[0].success).toBe(false);
    const thumb = story({
      lore: [{ title: "Harbour", content: "x", thumbnailUrl: "data:..." } as StoryLore],
    });
    const t = await run(thumb, { subject: "location", lore_title: "Harbour", description: "x" }, ctx);
    expect(t.results[0].success).toBe(false);
    const b = await run(story(), { subject: "location", lore_title: "Nowhere", description: "x" }, ctx);
    expect(b.results[0].success).toBe(false);
    expect(enqueued).toHaveLength(0);
  });

  it("refuses a second player portrait", async () => {
    const { ctx, enqueued } = context();
    const r = await run(story({ playerPortraitImageId: "img" }), { subject: "player", description: "x" }, ctx);
    expect(r.results[0].success).toBe(false);
    expect(enqueued).toHaveLength(0);
  });
});

describe("generate_image accepted", () => {
  it("queues a scene picture at once and gives the new card to the turn's part", async () => {
    const { ctx, enqueued, sceneRefs } = context();
    const r = await run(
      story(),
      { subject: "scene", description: "Dawn over the harbour", featuring: ["n1", "player", "ghost", "Brannock"] },
      ctx,
    );
    expect(r.results[0].success).toBe(true);
    expect(r.storyContext).toContain("Don't describe it");
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]).toMatchObject({
      subject: "scene",
      description: "Dawn over the harbour",
      // Unknown ids are trimmed; names resolve to ids.
      featuring: ["n1", "player", "n2"],
      target: { kind: "scenePart", partId: "part-xyz" },
    });
    expect(sceneRefs).toEqual([
      { imageId: "job-1", requestedBy: "gm", description: "Dawn over the harbour" },
    ]);
  });

  it("trims a description to 400 characters", async () => {
    const { ctx, enqueued } = context();
    await run(story(), { subject: "scene", description: "a".repeat(900) }, ctx);
    expect(enqueued[0].description).toHaveLength(400);
  });

  it("sets the pending id on the NPC, so a second request is refused", async () => {
    const { ctx, enqueued } = context();
    const first = await run(story(), { subject: "npc", npc_id: "n1", description: "A scarred smuggler" }, ctx);
    expect(first.results[0].success).toBe(true);
    expect(first.modifiedStoryData.npcs[0].portraitImageId).toBe("job-1");
    expect(enqueued[0]).toMatchObject({ subject: "npc", target: { kind: "npc", npcId: "n1" } });

    const again = await run(first.modifiedStoryData, { subject: "npc", npc_id: "n1", description: "x" }, ctx);
    expect(again.results[0].success).toBe(false);
  });

  it("sets the pending id on a note and on the player", async () => {
    const loc = await run(
      story(),
      { subject: "location", lore_title: "harbour", description: "Quays" },
      context().ctx,
    );
    expect(loc.modifiedStoryData.lore[0].imageId).toBe("job-1");
    const me = await run(
      story(),
      { subject: "player", description: "A sailor" },
      context().ctx,
    );
    expect(me.modifiedStoryData.playerPortraitImageId).toBe("job-1");
  });
});

describe("engine review: an id whose file is missing counts as no picture", () => {
  it("lets the GM make a portrait for an NPC whose stored file is gone (cleared, or another device)", async () => {
    const { ctx, enqueued } = context({ missingImageIds: new Set(["gone"]) });
    const sd = story({ npcs: [npc("n1", "Kessa", { portraitImageId: "gone" })] });
    const r = await run(sd, { subject: "npc", npc_id: "n1", description: "x" }, ctx);
    expect(r.results[0].success).toBe(true);
    expect(r.modifiedStoryData.npcs[0].portraitImageId).toBe("job-1");
    expect(enqueued).toHaveLength(1);
  });

  it("same for the player and for a note; a present file still refuses", async () => {
    const { ctx } = context({ missingImageIds: new Set(["gone"]) });
    const player = await run(story({ playerPortraitImageId: "gone" }), { subject: "player", description: "x" }, ctx);
    expect(player.results[0].success).toBe(true);
    const lore = await run(
      story({ lore: [{ title: "Harbour", content: "x", imageId: "gone" } as StoryLore] }),
      { subject: "location", lore_title: "Harbour", description: "x" },
      context({ missingImageIds: new Set(["gone"]) }).ctx,
    );
    expect(lore.results[0].success).toBe(true);
    const present = await run(
      story({ npcs: [npc("n1", "Kessa", { portraitImageId: "here" })] }),
      { subject: "npc", npc_id: "n1", description: "x" },
      ctx,
    );
    expect(present.results[0].success).toBe(false);
  });
});

describe("the per-scene cap", () => {
  it("allows the cap, refuses beyond it, and says why", async () => {
    const { ctx, enqueued } = context({ maxPerScene: 2 });
    let sd = story();
    for (let i = 0; i < 2; i++) {
      const r = await run(sd, { subject: "scene", description: `shot ${i}` }, ctx);
      expect(r.results[0].success).toBe(true);
      sd = r.modifiedStoryData;
    }
    expect(sd.imageState?.gmImagesInScene).toBe(2);
    const third = await run(sd, { subject: "scene", description: "shot 3" }, ctx);
    expect(third.results[0].success).toBe(false);
    expect(third.storyContext).toContain("2 pictures");
    expect(enqueued).toHaveLength(2);
  });

  it("resets when the scene key changes", async () => {
    const { ctx, enqueued } = context({ maxPerScene: 1 });
    let sd = story();
    const first = await run(sd, { subject: "scene", description: "one" }, ctx);
    sd = first.modifiedStoryData;
    expect((await run(sd, { subject: "scene", description: "two" }, ctx)).results[0].success).toBe(false);

    // A new scene: the key the counter was filed under no longer matches.
    sd = { ...sd, combatState: { active: true, name: "Ambush" } } as unknown as StoryData;
    expect(computeSceneKey(sd)).not.toBe(sd.imageState?.lastSceneKey);
    const next = await run(sd, { subject: "scene", description: "three" }, ctx);
    expect(next.results[0].success).toBe(true);
    expect(next.modifiedStoryData.imageState?.gmImagesInScene).toBe(1);
    expect(enqueued).toHaveLength(2);
  });

  it("does not spend the counter on a refused call", async () => {
    const { ctx } = context({ maxPerScene: 2 });
    const r = await run(story(), { subject: "npc", npc_id: "ghost", description: "x" }, ctx);
    expect(r.results[0].success).toBe(false);
    expect(r.modifiedStoryData.imageState).toBeUndefined();
  });
});
