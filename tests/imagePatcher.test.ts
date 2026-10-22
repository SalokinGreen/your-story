/**
 * Engine review findings 1 and 6: a picture that settles while a turn is in
 * flight must survive the turn's commit, and a job that settles after the page
 * has gone must not write the page's stale state.
 */
import { describe, it, expect } from "vitest";
import { applyStoryPatch, type PatchHost } from "@/app/misc/imagePatcher";
import { attachImageToTarget, detachImageFromTarget } from "@/app/misc/imageJobs";
import type { StoryData } from "@/app/misc/structs";

function story(): StoryData {
  return {
    scene: { parts: [] },
    npcs: [{ id: "n1", name: "Kessa", portraitImageId: "pending-1" }],
    lore: [],
    playerPortraitImageId: "old-player",
  } as unknown as StoryData;
}

/** A page: React state plus the object a running turn mutates and commits from. */
function page(opts: { mounted?: boolean; turn?: boolean } = {}) {
  const live = story();
  const host = {
    state: live as StoryData,
    saved: [] as StoryData[],
    stored: [] as Array<(sd: StoryData) => StoryData>,
    inTurn: opts.turn ?? true,
    live,
  };
  const patchHost: PatchHost = {
    getLive: () => (host.inTurn ? host.live : null),
    getState: () => host.state,
    setState: (n) => {
      host.state = n;
    },
    save: (n) => host.saved.push(n),
    isMounted: () => opts.mounted ?? true,
    patchStored: (fn) => host.stored.push(fn),
  };
  return { host, patchHost };
}

describe("a picture that settles mid-turn", () => {
  it("failure detach (example A) survives the turn's commit", () => {
    const { host, patchHost } = page();
    // The job fails mid-turn and takes the pending id off the NPC...
    applyStoryPatch(patchHost, (sd) =>
      detachImageFromTarget(sd, { kind: "npc", npcId: "n1" }, "pending-1"),
    );
    // ...then the turn mutates its own object and commits a copy of it, as
    // page.tsx's setStoryData({ ...storyData }) does.
    host.live.memory = [];
    host.state = { ...host.live };
    expect(host.state.npcs[0].portraitImageId).toBeUndefined();
  });

  it("a Replace that lands mid-turn (example B) is not undone", () => {
    const { host, patchHost } = page();
    applyStoryPatch(patchHost, (sd) =>
      attachImageToTarget(sd, { kind: "player" }, "new-player", {
        imageId: "new-player",
        requestedBy: "player",
      }),
    );
    host.state = { ...host.live };
    expect(host.state.playerPortraitImageId).toBe("new-player");
  });

  it("keeps the turn's own object (identity) and a key removed by the patch is removed", () => {
    const { host, patchHost } = page();
    const before = host.live;
    applyStoryPatch(patchHost, (sd) =>
      detachImageFromTarget(sd, { kind: "player" }, "old-player"),
    );
    expect(host.live).toBe(before);
    expect("playerPortraitImageId" in host.live).toBe(false);
  });

  it("does not save mid-turn (the turn's own commit saves)", () => {
    const { host, patchHost } = page();
    applyStoryPatch(patchHost, (sd) =>
      detachImageFromTarget(sd, { kind: "npc", npcId: "n1" }, "pending-1"),
    );
    expect(host.saved).toHaveLength(0);
  });

  it("documents the bug: a patch written to a separate copy is lost by the commit", () => {
    const live = story();
    const patched = detachImageFromTarget(
      live,
      { kind: "npc", npcId: "n1" },
      "pending-1",
    ); // what the old patchStoryData did: a new object into state only
    expect(patched.npcs[0].portraitImageId).toBeUndefined();
    const committed = { ...live }; // the turn commits from ITS object
    expect(committed.npcs[0].portraitImageId).toBe("pending-1");
  });
});

describe("no turn in flight", () => {
  it("the patch becomes the state and is saved", () => {
    const { host, patchHost } = page({ turn: false });
    applyStoryPatch(patchHost, (sd) =>
      attachImageToTarget(sd, { kind: "player" }, "p2", { imageId: "p2", requestedBy: "player" }),
    );
    expect(host.state.playerPortraitImageId).toBe("p2");
    expect(host.saved).toHaveLength(1);
  });

  it("a patch that changes nothing writes nothing", () => {
    const { host, patchHost } = page({ turn: false });
    applyStoryPatch(patchHost, (sd) => sd);
    expect(host.saved).toHaveLength(0);
  });
});

describe("after the page has gone", () => {
  it("never touches the stale page's state or saves it; the stored story is patched", () => {
    const { host, patchHost } = page({ mounted: false, turn: false });
    const before = host.state;
    applyStoryPatch(patchHost, (sd) =>
      attachImageToTarget(sd, { kind: "player" }, "p2", { imageId: "p2", requestedBy: "player" }),
    );
    expect(host.state).toBe(before);
    expect(host.saved).toHaveLength(0);
    expect(host.stored).toHaveLength(1);
  });
});
