// The one queue every picture goes through (docs/image-generation-
// implementation-plan.md §0 and S4). The GM's generate_image tool, the
// Illustrate this button, the portrait buttons and Regenerate are four thin
// ways of putting an ImageJob here; imageStore.ts keeps the bytes and
// StoryImage.tsx shows the result.
//
// - One job at a time, first in first out (fal's new accounts allow two
//   concurrent requests, and the queue never needs more than one).
// - A job never blocks a turn: enqueueImageJob returns at once and the job
//   settles in the background.
// - A job never fails silently: every terminal state writes a Debug Logs line
//   and notifies subscribers, so the card always ends in a visible state.
// - Finishing is written against the CURRENT StoryData (deps.patchStoryData),
//   never a copy captured when the job was queued, because the turn has moved
//   on by then.

import type { NPC, StoryData, SceneImageRef, ImageSubject } from "./structs";
import { generateFalImage, type FalImageResult } from "./falImageCall";
import { creatorImageFetch } from "./creatorFetch";
import { imageUrlToDataUri } from "./imageFetch";
import {
  dataUriToBlob,
  getImage,
  saveImage,
  type StoredImage,
} from "./imageStore";
import { shrinkGeneratedImage } from "./imageShrink";
import {
  imageSizeFor,
  pickImageModel,
  pickImageProvider,
  type ImageProvider,
} from "./imageProvider";
import {
  DEFAULT_IMAGE_STYLE,
  type ImageKeys,
  type ImageSettings,
} from "./imageSettings";
import { recordAICall } from "./turnCost";
import { logger } from "./logger";

export type ImageJobTarget =
  | { kind: "scenePart"; partId: string }
  | { kind: "npc"; npcId: string }
  | { kind: "player" }
  | { kind: "lore"; loreTitle: string };

export interface ImageJobRequest {
  storyId: string;
  subject: ImageSubject;
  /** What to show, visually. For Regenerate this is ignored in favour of finalPrompt. */
  description: string;
  /** NPC ids and/or "player" who appear in the picture. */
  featuring: string[];
  target: ImageJobTarget;
  requestedBy: "gm" | "player";
  /** Which turn's cost ledger the picture bills to (the side agents' pattern). */
  costTurnId?: string;
  signal?: AbortSignal;
  /** Regenerate: put the result under this existing id instead of a new one. */
  reuseId?: string;
  /** Regenerate: the exact provider prompt to run again, skipping the builder. */
  finalPrompt?: string;
  /**
   * The caller has already put the id on the target in the StoryData it is
   * about to commit (the GM executor works on a clone mid-turn), so the job
   * must not patch the live StoryData when it is queued.
   */
  skipInitialAttach?: boolean;
}

/**
 * What generateStoryTurn hands the GM executor so generate_image can queue a
 * picture (SubagentContext.imageJobs). Absent or `enabled: false` means the
 * tool refuses; the prompt does not offer it then either.
 */
export interface ImageToolContext {
  enabled: boolean;
  /** The per-scene cap on GM pictures (Settings -> Images). */
  maxPerScene: number;
  /** The id the turn's scene part will have; the picture belongs under it. */
  scenePartId: string;
  /** Queues the job; the executor adds nothing else, the turn supplies the rest. */
  enqueue: (
    req: Pick<ImageJobRequest, "subject" | "description" | "featuring" | "target">,
  ) => string;
  /**
   * Picture ids StoryData points to whose file is not on this device and whose
   * job is not running (cleared, or made on another device, decision 59).
   * The "already has one" checks treat these as no picture.
   */
  missingImageIds?: Set<string>;
  /** The turn's part does not exist yet: this adds the card's ref to it. */
  onSceneImage?: (ref: SceneImageRef) => void;
}

export type ImageJobState =
  | { status: "pending" }
  | { status: "done"; imageId: string }
  | { status: "declined"; message: string; categories?: string[] }
  | { status: "failed"; message: string };

export interface ImageJobIO {
  generateFal: typeof generateFalImage;
  /** DeepInfra and OpenRouter, through the same wrapper the lore-image buttons use. */
  generateOther: (req: {
    provider: Exclude<ImageProvider, "fal">;
    model: string;
    prompt: string;
    size: { width: number; height: number };
    keys: ImageKeys;
    signal?: AbortSignal;
  }) => Promise<
    | { ok: true; dataUri: string }
    | { ok: false; message: string }
  >;
  saveImage: typeof saveImage;
  getImage: typeof getImage;
  sleep: (ms: number) => Promise<void>;
  newId: () => string;
}

export interface ImageJobDeps {
  keys: ImageKeys;
  getSettings: () => ImageSettings;
  /** The live StoryData, read when the job runs and when it settles. */
  getStoryData: () => StoryData | null;
  /** Applies a change to the live StoryData (a functional setState). */
  patchStoryData: (fn: (sd: StoryData) => StoryData) => void;
  /** Called once when a job reaches a terminal state (the page toasts a failure). */
  onSettled?: (jobId: string, state: ImageJobState, req: ImageJobRequest) => void;
  io?: Partial<ImageJobIO>;
}

// ----------------------------------------------------------------------
// Queue state (module level: one queue per app)
// ----------------------------------------------------------------------

interface QueuedJob {
  id: string;
  req: ImageJobRequest;
  deps: ImageJobDeps;
  controller: AbortController;
  retried: boolean;
}

const queue: QueuedJob[] = [];
let running: QueuedJob | null = null;
const states = new Map<string, ImageJobState>();
const listeners = new Set<(jobId: string, s: ImageJobState) => void>();

export const BUSY_RETRY_DELAY_MS = 3000;

function setState(job: QueuedJob, state: ImageJobState): void {
  states.set(job.id, state);
  for (const cb of Array.from(listeners)) {
    try {
      cb(job.id, state);
    } catch {
      // a broken subscriber must not stop the queue
    }
  }
}

export function subscribeImageJobs(
  cb: (jobId: string, s: ImageJobState) => void,
): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** The state of a job in this session; undefined for a finished picture reloaded from disk. */
export function getImageJobState(jobId: string): ImageJobState | undefined {
  return states.get(jobId);
}

/** Test seam: forget everything. */
export function resetImageJobsForTests(): void {
  queue.length = 0;
  running = null;
  states.clear();
  listeners.clear();
}

/** How many jobs are queued or running (the Illustrate button greys out while it paints). */
export function pendingImageJobCount(): number {
  return queue.length + (running ? 1 : 0);
}

// ----------------------------------------------------------------------
// The prompt (design §3.3): the description, then the characters, then the style
// ----------------------------------------------------------------------

const PORTRAIT_LINE_CHARS = 200;

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** One line about a character, from their NPC description or the character sheet. */
export function characterLine(storyData: StoryData, id: string): string | null {
  if (id === "player") {
    const sheet = (storyData.lore ?? []).find(
      (l) => l.type === "character_sheet" && l.content?.trim(),
    );
    const name = storyData.player_name?.trim();
    const body = sheet ? clip(sheet.content, PORTRAIT_LINE_CHARS) : "";
    if (!name && !body) return null;
    return body ? `${name || "The player character"}: ${body}` : name;
  }
  const npc = (storyData.npcs ?? []).find((n: NPC) => n.id === id);
  if (!npc) return null;
  const body = clip(npc.description ?? "", PORTRAIT_LINE_CHARS);
  return body ? `${npc.name}: ${body}` : npc.name;
}

export function buildImagePrompt(
  description: string,
  storyData: StoryData | null,
  featuring: string[],
  fallbackStyle: string,
  /** Characters whose looks travel as reference pictures instead of a text line. */
  referenced: Set<string> = new Set(),
): string {
  const parts: string[] = [description.trim().replace(/\s+/g, " ")];
  if (storyData) {
    const lines = featuring
      .filter((id) => !referenced.has(id))
      .map((id) => characterLine(storyData, id))
      .filter((l): l is string => !!l);
    if (lines.length > 0) parts.push(`Characters: ${lines.join(" ")}`);
  }
  const style = storyData?.imageStyle?.trim() || fallbackStyle || DEFAULT_IMAGE_STYLE;
  parts.push(`Style: ${style}. No text, captions or lettering in the picture.`);
  return parts.join("\n\n");
}

/**
 * The reference-picture hook (plan S7, decision 61). Slice S7 is gated on live
 * fal checks that need the author's key and go: does fal's edit endpoint take a
 * data: URI in `image_urls`, and does it keep the face? Until then no job sends
 * references: this returns none, every character goes in as a text line, and
 * pickImageModel is told no character has a portrait, so a scene is painted by
 * the scene model, never the edit model (which would be called with no
 * pictures). S7 fills this in: read each `featuring` member's portrait from the
 * store (at most 3), return their data: URIs and the ids that
 * travelled as references.
 */
/* eslint-disable @typescript-eslint/no-unused-vars -- the signature S7 fills in */
export async function resolveReferencePictures(
  _storyData: StoryData | null,
  _featuring: string[],
  _supportsReferences: boolean,
  _io: Pick<ImageJobIO, "getImage">,
): Promise<{ dataUris: string[]; referenced: Set<string> }> {
  return { dataUris: [], referenced: new Set() };
}
/* eslint-enable @typescript-eslint/no-unused-vars */

// ----------------------------------------------------------------------
// Attaching a finished (or pending) picture to what it belongs to
// ----------------------------------------------------------------------

/** Puts imageId on the job's target in sd. Idempotent; returns sd unchanged when the target is gone. */
export function attachImageToTarget(
  sd: StoryData,
  target: ImageJobTarget,
  imageId: string,
  ref: SceneImageRef,
): StoryData {
  switch (target.kind) {
    case "scenePart": {
      const idx = sd.scene.parts.findIndex((p) => p.id === target.partId);
      if (idx < 0) return sd;
      const part = sd.scene.parts[idx];
      if ((part.images ?? []).some((r) => r.imageId === imageId)) return sd;
      const parts = sd.scene.parts.slice();
      parts[idx] = { ...part, images: [...(part.images ?? []), ref] };
      return { ...sd, scene: { ...sd.scene, parts } };
    }
    case "npc": {
      const npcs = sd.npcs ?? [];
      const idx = npcs.findIndex((n) => n.id === target.npcId);
      if (idx < 0 || npcs[idx].portraitImageId === imageId) return sd;
      const next = npcs.slice();
      next[idx] = { ...npcs[idx], portraitImageId: imageId };
      return { ...sd, npcs: next };
    }
    case "player":
      return sd.playerPortraitImageId === imageId
        ? sd
        : { ...sd, playerPortraitImageId: imageId };
    case "lore": {
      const lore = sd.lore ?? [];
      const idx = lore.findIndex((l) => l.title === target.loreTitle);
      if (idx < 0 || lore[idx].imageId === imageId) return sd;
      const next = lore.slice();
      next[idx] = { ...lore[idx], imageId };
      return { ...sd, lore: next };
    }
  }
}

/** Takes a pending id back off an NPC, player or note whose picture did not arrive. */
export function detachImageFromTarget(
  sd: StoryData,
  target: ImageJobTarget,
  imageId: string,
): StoryData {
  switch (target.kind) {
    case "scenePart":
      return sd; // the card stays, showing declined / failed with its own Retry
    case "npc": {
      const npcs = sd.npcs ?? [];
      const idx = npcs.findIndex((n) => n.id === target.npcId);
      if (idx < 0 || npcs[idx].portraitImageId !== imageId) return sd;
      const next = npcs.slice();
      const { portraitImageId: _gone, ...rest } = npcs[idx];
      void _gone;
      next[idx] = rest as NPC;
      return { ...sd, npcs: next };
    }
    case "player": {
      if (sd.playerPortraitImageId !== imageId) return sd;
      const { playerPortraitImageId: _gone, ...rest } = sd;
      void _gone;
      return rest as StoryData;
    }
    case "lore": {
      const lore = sd.lore ?? [];
      const idx = lore.findIndex((l) => l.title === target.loreTitle);
      if (idx < 0 || lore[idx].imageId !== imageId) return sd;
      const next = lore.slice();
      const { imageId: _gone, ...rest } = lore[idx];
      void _gone;
      next[idx] = rest as (typeof lore)[number];
      return { ...sd, lore: next };
    }
  }
}

// ----------------------------------------------------------------------
// Enqueue, cancel, run
// ----------------------------------------------------------------------

function defaultIO(): ImageJobIO {
  return {
    generateFal: generateFalImage,
    generateOther: async ({ provider, model, prompt, size, keys, signal }) => {
      try {
        const response = await creatorImageFetch(
          {
            prompt,
            model,
            imageType: size.width >= size.height ? "banner" : "thumbnail",
            provider,
            openRouterKey: keys.openRouterKey,
            deepInfraKey: keys.deepInfraKey,
            plainPrompt: true,
            size,
          },
          signal,
        );
        const data = (await response.json()) as {
          imageUrl?: string;
          error?: string;
        };
        if (!response.ok || !data.imageUrl) {
          return { ok: false, message: data.error || `Image request failed (${response.status})` };
        }
        // A provider that answers with a link is fetched once, so "done"
        // always means real bytes.
        return await imageUrlToDataUri(data.imageUrl, signal).then((r) =>
          r.ok ? r : { ok: false as const, message: r.message },
        );
      } catch (error) {
        if (signal?.aborted) return { ok: false, message: "Cancelled" };
        return {
          ok: false,
          message: error instanceof Error ? error.message : "The picture request failed.",
        };
      }
    },
    saveImage,
    getImage,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    newId: () => crypto.randomUUID(),
  };
}

/** Puts a picture on the queue and returns its job id (also the id of the stored image). */
export function enqueueImageJob(req: ImageJobRequest, deps: ImageJobDeps): string {
  const io = { ...defaultIO(), ...deps.io };
  const id = req.reuseId ?? io.newId();
  const controller = new AbortController();
  if (req.signal?.aborted) controller.abort();
  else req.signal?.addEventListener("abort", () => controller.abort(), { once: true });
  const job: QueuedJob = { id, req, deps: { ...deps, io }, controller, retried: false };
  setState(job, { status: "pending" });

  if (!req.skipInitialAttach) {
    deps.patchStoryData((sd) =>
      attachImageToTarget(sd, req.target, id, {
        imageId: id,
        requestedBy: req.requestedBy,
        description: req.description,
      }),
    );
  }

  queue.push(job);
  void pump();
  return id;
}

/**
 * Drops the queued pictures of a turn and aborts the one painting. With
 * `only: "gm"` (an Observer reset, a Retry or an Undo: the GM's attempt is
 * being thrown away) a picture the player asked for is left alone, though it
 * bills to the same turn.
 */
export function cancelImageJobsForTurn(
  costTurnId: string,
  only?: "gm",
): void {
  const matches = (job: QueuedJob) =>
    job.req.costTurnId === costTurnId &&
    (only === undefined || job.req.requestedBy === only);
  for (let i = queue.length - 1; i >= 0; i--) {
    const job = queue[i];
    if (!matches(job)) continue;
    queue.splice(i, 1);
    settle(job, { status: "failed", message: "Cancelled" });
  }
  if (running && matches(running)) running.controller.abort();
}

async function pump(): Promise<void> {
  if (running) return;
  const next = queue.shift();
  if (!next) return;
  running = next;
  try {
    await runJob(next);
  } catch (error) {
    settle(next, {
      status: "failed",
      message: error instanceof Error ? error.message : "The picture failed.",
    });
  } finally {
    running = null;
    void pump();
  }
}

function settle(job: QueuedJob, state: ImageJobState): void {
  setState(job, state);
  const where = `${job.req.subject} picture ${job.id.slice(0, 8)}`;
  if (state.status === "done") {
    logger.action(`Image: ${where} done`, { imageId: state.imageId, requestedBy: job.req.requestedBy });
  } else if (state.status === "declined") {
    logger.warn(`Image: ${where} declined`, { message: state.message, categories: state.categories });
  } else if (state.status === "failed") {
    logger.error(`Image: ${where} failed`, { message: state.message });
  }
  if (state.status !== "done") {
    // A portrait or place picture that never came leaves nothing pointing at it.
    job.deps.patchStoryData((sd) => detachImageFromTarget(sd, job.req.target, job.id));
  }
  try {
    job.deps.onSettled?.(job.id, state, job.req);
  } catch {
    // a broken callback must not stop the queue
  }
}

async function runJob(job: QueuedJob): Promise<void> {
  const { req, deps } = job;
  const io = deps.io as ImageJobIO;
  if (job.controller.signal.aborted) {
    settle(job, { status: "failed", message: "Cancelled" });
    return;
  }

  const settings = deps.getSettings();
  const provider = pickImageProvider(settings, deps.keys);
  if (!provider) {
    settle(job, {
      status: "failed",
      message: "No key for an image provider. Add a fal.ai, DeepInfra or OpenRouter key in Settings.",
    });
    return;
  }

  const storyData = deps.getStoryData();
  const size = imageSizeFor(req.subject);

  // Reference pictures (S7 fills the hook in; none until then).
  const pickedForRefs = pickImageModel({ subject: req.subject, portraitedCharacters: 0 }, provider, settings);
  const refs = await resolveReferencePictures(
    storyData,
    req.featuring,
    pickedForRefs.supportsReferences,
    io,
  );
  const picked = pickImageModel(
    { subject: req.subject, portraitedCharacters: refs.referenced.size },
    provider,
    settings,
  );

  const prompt =
    req.finalPrompt ??
    buildImagePrompt(req.description, storyData, req.featuring, settings.defaultStyle, refs.referenced);

  logger.action(`Image: ${req.subject} picture ${job.id.slice(0, 8)} started`, {
    provider,
    model: picked.modelKey,
    requestedBy: req.requestedBy,
  });

  const attempt = async (): Promise<
    | { ok: true; dataUri: string; width: number; height: number }
    | { ok: false; kind: "declined" | "failed" | "key" | "busy" | "cancelled"; message: string; categories?: string[]; billed?: boolean }
  > => {
    if (provider === "fal") {
      const result: FalImageResult = await io.generateFal({
        falKey: deps.keys.falKey ?? "",
        model: picked.model,
        prompt,
        imageSize: size,
        referenceDataUris: refs.dataUris.length > 0 ? refs.dataUris : undefined,
        signal: job.controller.signal,
      });
      return result;
    }
    const result = await io.generateOther({
      provider,
      model: picked.modelKey,
      prompt,
      size,
      keys: deps.keys,
      signal: job.controller.signal,
    });
    if (!result.ok) {
      return result.message === "Cancelled"
        ? { ok: false, kind: "cancelled", message: "Cancelled" }
        : { ok: false, kind: "failed", message: result.message };
    }
    return { ok: true, dataUri: result.dataUri, width: size.width, height: size.height };
  };

  let result = await attempt();
  if (!result.ok && result.kind === "busy" && !job.retried) {
    job.retried = true;
    await io.sleep(BUSY_RETRY_DELAY_MS);
    if (job.controller.signal.aborted) {
      settle(job, { status: "failed", message: "Cancelled" });
      return;
    }
    result = await attempt();
  }

  const recordCost = () =>
    recordAICall({
      stage: "image",
      label: `${req.subject} picture`,
      modelKey: picked.modelKey,
      promptTokens: 0,
      completionTokens: 0,
      providerReportedUsd: picked.pricePerImage,
      costTurnId: req.costTurnId,
    });

  if (!result.ok) {
    if (result.kind === "declined") {
      // fal's safety checker withheld the picture but still billed for it.
      if (result.billed) recordCost();
      settle(job, { status: "declined", message: result.message, categories: result.categories });
    } else if (result.kind === "cancelled") {
      settle(job, { status: "failed", message: "Cancelled" });
    } else {
      settle(job, { status: "failed", message: result.message });
    }
    return;
  }

  // The job was cancelled while the provider was still answering (an Observer
  // reset, Retry, Undo or Stop): the picture belongs to a discarded attempt, so
  // it is not saved, billed or attached.
  if (job.controller.signal.aborted) {
    settle(job, { status: "failed", message: "Cancelled" });
    return;
  }
  // "Done" must mean a real image, never a link or an error page.
  if (!result.dataUri.startsWith("data:image/")) {
    settle(job, { status: "failed", message: "The provider did not return a picture." });
    return;
  }

  // The picture is in hand: shrink it, keep it, bill it, attach it.
  const raw = dataUriToBlob(result.dataUri);
  const shrunk = await shrinkGeneratedImage(raw, { width: result.width, height: result.height });
  const stored: StoredImage = {
    id: job.id,
    storyId: req.storyId,
    blob: shrunk.blob,
    mime: shrunk.mime,
    width: shrunk.width,
    height: shrunk.height,
    subject: req.subject,
    prompt,
    provider,
    model: picked.modelKey,
    costUsd: picked.pricePerImage,
    createdAt: Date.now(),
  };
  try {
    await io.saveImage(stored);
  } catch (error) {
    settle(job, {
      status: "failed",
      message: `Could not save the picture: ${error instanceof Error ? error.message : "storage error"}`,
    });
    return;
  }

  recordCost();

  deps.patchStoryData((sd) =>
    attachImageToTarget(sd, req.target, job.id, {
      imageId: job.id,
      requestedBy: req.requestedBy,
      description: req.description,
    }),
  );
  settle(job, { status: "done", imageId: job.id });
}
