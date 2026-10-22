// How a picture job writes to the story when it settles (engine review of
// PR #219). Three situations, three paths:
//
// - A turn is in flight. The turn mutates its own StoryData object in place
//   (generation.ts's Object.assign) and ends with setStoryData({...storyData})
//   plus a save, which would overwrite anything written to a separate copy. So
//   the patch is applied to THAT object, in place: it survives the turn's
//   commit with no queue to remember to flush. (Chosen over queueing patches
//   because the turn has about fifteen commit points in page.tsx; one in-place
//   write cannot be missed by any of them.) The turn's own commit saves.
// - No turn is running. The patch becomes the new state and is saved.
// - The page has gone (the story was left while a picture painted). The queue
//   is module-level, so the job outlives the page; writing the old page's
//   stale state would save over a newer story. The patch goes to the stored
//   story instead, or is dropped if it is gone.

import type { StoryData } from "./structs";

export interface PatchHost {
  /** The StoryData object a turn in flight is mutating, else null. */
  getLive: () => StoryData | null;
  /** The page's latest StoryData. */
  getState: () => StoryData | null;
  /** Make `next` the page's state (the ref and React state). */
  setState: (next: StoryData) => void;
  save: (next: StoryData) => void;
  isMounted: () => boolean;
  /** The page is gone: apply the patch to the stored story, if any. */
  patchStored: (fn: (sd: StoryData) => StoryData) => void;
}

/** Makes `target` look like `next` without changing its identity. */
export function syncInPlace(target: StoryData, next: StoryData): void {
  const t = target as unknown as Record<string, unknown>;
  for (const key of Object.keys(t)) {
    if (!(key in next)) delete t[key];
  }
  Object.assign(target, next);
}

export function applyStoryPatch(
  host: PatchHost,
  fn: (sd: StoryData) => StoryData,
): void {
  if (!host.isMounted()) {
    host.patchStored(fn);
    return;
  }
  const live = host.getLive();
  if (live) {
    const next = fn(live);
    if (next === live) return;
    syncInPlace(live, next);
    host.setState({ ...live });
    return;
  }
  const current = host.getState();
  if (!current) return;
  const next = fn(current);
  if (next === current) return;
  host.setState(next);
  host.save(next);
}
