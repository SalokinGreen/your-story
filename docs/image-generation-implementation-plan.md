# Image generation in play — implementation plan

**Status:** waiting for the author's yes. Design:
[`image-generation-design.md`](image-generation-design.md). Decisions 54–61.
File references are from a code map of master at `8869b88`; line numbers are
approximate (`~`) and must be re-checked before editing.

**Builds on the catalog-refresh PR** (`claude/catalog-refresh`: the image
catalog fixes, decisions 50–53). Start from master after that PR merges. If it
has not merged, branch from it and say so in the PR.

## 0. Shape of the work

Two pull requests:

1. **PR I1 — pictures on the host's screen** (slices S1–S9). All four subjects,
   all three providers, the GM tool, the button, Settings and cost.
2. **PR I2 — pictures on guests' devices and party phones** (decision 60).
   It is planned separately once I1 is played. It is listed here only so that
   I1 does not paint it into a corner: picture ids in `StoryData`, the bytes
   sent as their own message.

The choice that keeps I1 tractable: **one queue, one store, one card.** Every
picture, whatever asked for it, becomes an `ImageJob` on one queue
(`imageJobs.ts`). It is saved in one store (`imageStore.ts`) and shown by one
component (`StoryImage.tsx`). The GM tool, the button, the portrait buttons
and Regenerate are four thin ways of putting a job on that queue.

**A live check sits between S5 and S7 (needs the author's go, about $0.10).**
The reference-picture path (S7) depends on fal taking a `data:` URI in
`image_urls` (design §3.4, §10).

## 1. Slices (PR I1)

### S1. The store: `app/misc/imageStore.ts` (new)

A separate IndexedDB database, modelled on `ttsAudioCache.ts` (its header
comment is the precedent to cite).

```ts
export interface StoredImage {
  id: string;            // crypto.randomUUID(), made in the job, never during render
  storyId: string;
  blob: Blob;            // WebP after compression
  mime: string;
  width: number;
  height: number;
  subject: ImageSubject; // "scene" | "npc" | "player" | "location"
  prompt: string;        // the final provider prompt, for Regenerate
  provider: ImageProvider;
  model: string;         // catalog key
  costUsd: number;
  createdAt: number;
}
export async function saveImage(img: StoredImage): Promise<void>;
export async function getImage(id: string): Promise<StoredImage | null>;
export async function deleteImagesForStory(storyId: string): Promise<void>;
export async function deleteOrphans(storyId: string, keep: Set<string>): Promise<number>;
export async function storyImageBytes(storyId: string): Promise<number>;
```

- DB `YourStoryImages`, store `images`, keyPath `id`, index `storyId`.
- Compression: `app/misc/imageCompression.ts` exists with no importers. Use it,
  or `createImageBitmap` plus `OffscreenCanvas.convertToBlob({type:
  "image/webp", quality: 0.85})`, to a long edge of at most 1,024 px. Fall back
  to the original bytes if the WebView lacks `OffscreenCanvas`.
- Wire `deleteImagesForStory` into story deletion (`localStoryManager.ts`
  delete path). Wire `deleteOrphans` into story load (`app/story/page.tsx`
  load effect), keeping every id referenced by `collectImageIds(storyData)`
  (S4).
- Tests use `fake-indexeddb`, if the repo already has it; check
  `ttsAudioCache` tests.

### S2. Types and fields: `app/misc/structs.ts`

```ts
export type ImageSubject = "scene" | "npc" | "player" | "location";
export interface SceneImageRef { imageId: string; requestedBy: "gm" | "player"; }
// ScenePart:   images?: SceneImageRef[];
// NPC:         portraitImageId?: string;
// StoryLore:   imageId?: string;
// StoryData:   playerPortraitImageId?: string;
//              imageStyle?: string;
//              imageState?: { gmImagesInScene: number; lastSceneKey?: string };
```

- All fields are optional, so `ensureStoryDataArrays()` needs no backfill.
  Grep `ScenePart` constructions anyway: the vestigial required `imageUrl: ""`
  stays, untouched.
- `collectImageIds(storyData): Set<string>` lives in `imageStore.ts` and walks
  all four places.

### S3. fal and the provider switch

- **`app/misc/ai_prices.ts`.** A `FAL_IMAGE_MODELS` catalog next to the other
  two:
  - `fal-ai/flux/schnell` at $0.003/MP;
  - `fal-ai/flux-2-pro` at $0.03 for the first MP plus $0.015 per extra MP;
  - `fal-ai/flux-2-pro/edit` at the same price, with `supportsReferences: true`.

  Each entry has `name`, `model`, `pricePerImage` (at 1024×768),
  `supportsReferences`, and `imageSize` defaults. Extend
  `resolveImageModelKey` to `"fal"`.
- **`app/misc/falImageCall.ts`** (new). It calls through
  `getProviderFetch()`, never raw `fetch`:

  ```ts
  export async function generateFalImage(req: {
    falKey: string; model: string; prompt: string;
    imageSize: { width: number; height: number };
    referenceDataUris?: string[];
    signal?: AbortSignal;
  }): Promise<
    | { ok: true; dataUri: string; width: number; height: number; seed?: number }
    | { ok: false; kind: "declined" | "key" | "busy" | "failed"; message: string; categories?: string[] }
  >;
  ```

  - The request is `POST https://fal.run/${model}` with `Authorization: Key ${falKey}`,
    and a body of `{ prompt, image_size, num_images: 1, sync_mode: true,
    output_format: "png", enable_safety_checker: true }`, plus
    `image_urls` for the edit model.
  - The response maps as:
    - `images[0].url` (a `data:` URI under `sync_mode`) → `ok`;
    - `has_nsfw_concepts[0] === true` → `declined`;
    - 422 with `content_policy_violation` → `declined` with its `categories`;
    - 401 or 403 → `key`;
    - 429 → `busy`;
    - anything else → `failed`.
  - A 90 s timeout is combined with the caller's signal.
  - **If the response carries an https URL instead of a `data:` URI** (a model
    that ignores `sync_mode`), fetch it once through `getProviderFetch`, and
    add `https://*.fal.media/*` to the allowlist in the same PR. The live check
    decides whether this is needed.
- **`app/misc/generateImageCall.ts`.** Add an `imageStyle`-aware entry point
  for in-play pictures that drops the hard-coded "game cover style" suffix
  (`~:122`, `~:203`). Lore covers keep the suffix through the existing path.
- **`src-tauri/capabilities/default.json`.** Add `{ "url": "https://fal.run/*" }`.
- **Keys.**
  - `app/misc/APIKeysContext.tsx`: add `falKey` to `APIKeys`, `defaultKeys`,
    `LOCAL_KEYS` and `loadKeys`, following the Z.ai example.
  - `app/components/APIKeysModal.tsx`: add a fal.ai block copied from the Z.ai
    one (`~:488`), linking to `https://fal.ai/dashboard/keys`.
  - Do not add the key to `pickProviderKeys` or `syncableSettingsKeys.ts`
    (decision 58).
- **`app/misc/imageProvider.ts`** (new): `pickImageProvider(settings, keys):
  "fal" | "deepinfra" | "openrouter" | null` (decision 57's `auto`), and
  `pickImageModel(job, provider, settings)` (decision 61's table, design §3.4).

### S4. The queue: `app/misc/imageJobs.ts` (new)

```ts
export interface ImageJobRequest {
  storyId: string;
  subject: ImageSubject;
  description: string;
  featuring: string[];          // NPC ids and/or "player"
  target: { kind: "scenePart"; partId: string } | { kind: "npc"; npcId: string }
        | { kind: "player" } | { kind: "lore"; loreId: string };
  requestedBy: "gm" | "player";
  costTurnId?: string;
  signal?: AbortSignal;
}
export type ImageJobState =
  | { status: "pending" } | { status: "done"; imageId: string }
  | { status: "declined"; message: string } | { status: "failed"; message: string };
export function enqueueImageJob(req: ImageJobRequest, deps: ImageJobDeps): string; // returns jobId
export function subscribeImageJobs(cb: (jobId: string, s: ImageJobState) => void): () => void;
export function cancelImageJobsForTurn(costTurnId: string): void;
```

- **One job at a time** (fal's new-account limit is 2 concurrent requests), in
  FIFO order. One retry on `busy`, after 3 s.
- `deps` carries the keys, the settings, and a `getStoryData` /
  `updateStoryData` pair. That pair attaches the `imageId` to the target
  *when the job finishes*, against the **current** `StoryData`, not a captured
  copy, because the turn has moved on by then.

  The scene target is found by a stable part id. If `ScenePart` has none,
  add `id?: string` set at creation, outside render.
- **The prompt** is built here (design §3.3): description, then character
  lines for `featuring` members without portraits, then
  `storyData.imageStyle ?? DEFAULT_IMAGE_STYLE`. Members with portraits
  become reference `data:` URIs, read from the store, at most 3, but only if
  the chosen model `supportsReferences`.
- **Cost.** `recordAICall({ stage: "image", modelKey, costTurnId,
  providerReportedUsd: price })` (`turnCost.ts` `~:326`). Add `"image"` to
  `TurnCostStage` and to both stage-label records (`~:154`).
- **Logging.** Every terminal state writes a Debug Logs line through `logger`,
  the same place side calls log. A job never fails silently.
- The pending job id is also stored on the target as soon as it is enqueued:
  `ScenePart.images` gets `{ imageId: jobId }`, and the job writes the image
  under that same id. So the card exists immediately and survives a reload.
  After a reload the job itself is gone, so an id with no stored image shows
  Regenerate.

### S5. The GM tool `generate_image` (design §3.1)

The six places from `CLAUDE.md`, using `generate_name` as the template:

1. **Schema.** `app/misc/gmTools.ts`: `GenerateImageParams`, added to the
   `GMToolParams` union (`~:650`), and `generateImageTool` in
   `GM_TOOL_SCHEMAS` (`~:2643`). The description says when to use it and the
   content rules.
2. **Whitelist.** `app/misc/ai_staged.ts`: add the name to `legacyToolNames`
   (`~:1734`) behind a new `imageToolAvailable` option, following the
   `manualDiceMode` precedent (`~:1740`), plus a short `### Pictures` prompt
   section next to `### Naming` (`~:1650`), with the cap and "don't describe
   the picture in prose". `buildGMStagePrompt` gets the flag from
   `generation.ts`, computed from the image settings and keys (S8).
3. **Executor.** `app/misc/gmExecutor.ts`: `executeGenerateImage`, a `case` in
   the `executeGMTools` switch (`~:1100`), and `GMGenerateImageResult` in the
   result union (`~:159`).
   - It validates as in design §3.1 and increments
     `imageState.gmImagesInScene` on the working clone, resetting it when
     `computeSceneKey` changes (copy the `tier3CallsInScene` logic,
     `reasoningTiers.ts` `~:421`/`~:459`).
   - It calls `enqueueImageJob` through a new optional `imageJobs` handle on
     `SubagentContext` (`~:869`; `generation.ts` `~:2741` passes it).
   - The scene target is the part being written this turn: pass its id in the
     context.
   - The result text is short and says "requested, don't describe it".
4. **Google.** `providerCall.ts` `GOOGLE_ESSENTIAL_TOOLS` (`~:145`): add
   `generate_image`.
5. **Label.** `gmToolLabels.ts`: "Painting a picture".
6. **Observer.** Nothing is needed: it keys only on dice and oracle tools
   (`observer.ts` `~:1188`).

The tool pill in the feed stays text. The picture is the card (S6), not the
pill.

### S6. The feed card and the button

- **`app/components/StoryImage.tsx`** (new): `{ imageId, storyId,
  onRegenerate? }`.
  - It reads the store, subscribes to job state, and makes an object URL in an
    effect (revoked on cleanup).
  - It renders pending, done, declined, failed or missing (design §6). Done
    opens `FullScreenView` when tapped.
  - On a guest device, missing shows "Picture on the host's screen" (decision
    60): `useNetSession`'s role is available in `story.tsx`'s props.
- **`app/story/story.tsx`.** Under each part's prose, render
  `part.images?.map(ref => <StoryImage …/>)` after the timeline blocks (the
  prose map `~:1727`). Put the **Illustrate this** button beside
  `TTSControls` (`~:1587`), host only, enabled when `pickImageProvider`
  returns a provider.
- **`app/misc/imagePromptWriter.ts`** (new):
  `writeSceneDescription(prose, storyData, apiOptions): Promise<string>`.
  - It uses `callSideModel` with `resolveSideCallModel(null, keys)` (the
    side-agent default and its effort, decision 53). The system prompt is
    "Describe, in under 60 words, what a camera would see in this moment…",
    with the content rules.
  - On failure, fall back to the prose's first 300 characters.
  - The button calls it, collects `featuring` from the NPC name matching
    `story.tsx` already uses for highlighting (find the helper), then calls
    `enqueueImageJob` with `requestedBy: "player"`.
- **`app/story/page.tsx`.** Hold the job deps (keys, settings,
  `getStoryData` / `setStoryData` through the existing `onUpdateStoryData`
  path) and pass them to `generateStoryTurn` and to the button. Stop's handler
  calls `cancelImageJobsForTurn(costTurnId)`.

### S7. References (after the live check)

- Fill in the reference path in `imageJobs.ts`: the portraits of `featuring`
  members, as `data:` URIs, become `referenceDataUris` for the edit model
  (decision 61).
- **If the live check shows `data:` URIs are refused,** add fal's storage
  upload in `falImageCall.ts` instead. That means a second allowlist entry
  for its upload host, written up in the PR.
- **Fallback at run time:** a refused reference becomes text-only, with
  character lines, and a log line.

### S8. Settings → Images

- **`app/misc/imageSettings.ts`** (new). localStorage, synced through
  `syncableSettingsKeys.ts` (settings, not the key):

  ```ts
  interface ImageSettings {
    gmImagesEnabled: boolean;      // default true
    gmImagesPerScene: number;      // default 2, clamp 0..5
    provider: "auto" | "fal" | "deepinfra" | "openrouter"; // default "auto"
    sceneModel: string; portraitModel: string; referenceModel: string; // per decision 61
    defaultStyle: string;          // DEFAULT_IMAGE_STYLE
  }
  export function getImageSettings(): ImageSettings;
  export function setImageSettings(p: Partial<ImageSettings>): void;
  export function isImageToolAvailable(keys: { falKey?: string; deepInfraKey?: string; openRouterKey?: string }): boolean;
  ```

  Stored model keys are validated against their catalog, as
  `resolveImageModelKey` does. A dropped key reads as the default.
- **The UI.** A new "Images" section. Put it in the Display tab, or a new tab
  if Display is crowded; follow the tab layout in the Settings modal. It holds
  every field above, the per-story style (it edits `storyData.imageStyle` when
  a story is open), the space used (`storyImageBytes`), and "Clear this
  story's pictures". Note that DeepInfra and OpenRouter make no reference
  pictures.

### S9. Portraits and lore pictures in the UI

- **NPCs.** `app/story/npcs.tsx` (`~:496`, `~:575`), `NPCEditor.tsx`
  (`~:349`) and `NPCReactionToast.tsx` (`~:70`) prefer `portraitImageId`,
  through a small `useStoredImageUrl(id)` hook in `StoryImage.tsx`, over
  `custom_symbol_url` and the emoji. Add a "Make portrait" / "Replace"
  button on the NPC.
- **The player.** The character sheet view gets a portrait slot and a "Make
  portrait" button. The description comes from the `character_sheet` note
  through `imagePromptWriter` with a portrait prompt.
- **Lore.** `app/story/lore.tsx` (`~:657`, `~:882`) prefers `imageId` over
  `thumbnailUrl`.

## 2. Tests (Vitest; seed `Math.random`, and stub `crypto.randomUUID` where ids matter)

- **`falImageCall`:** the request shape (header, `sync_mode`, `image_urls` only
  for the edit model). Each failure mapping (422 policy, `has_nsfw_concepts`,
  401, 429, 504). Abort.
- **`imageProvider`:** the `auto` order, the decision-61 model table, and
  references only on a `supportsReferences` model.
- **`imageJobs`:**
  - FIFO and one at a time;
  - attach to the *current* `StoryData`;
  - cost recorded at the catalog price on the job's `costTurnId`;
  - cancel by turn;
  - one retry on `busy`, none on `declined`;
  - a terminal log line for each state.
- **The executor:**
  - the cap, and its reset at the scene key;
  - refused when disabled or keyless;
  - an NPC that already has a portrait is refused;
  - unknown ids are trimmed;
  - the scene part gets its ref at once.
- **The whitelist:** `generate_image` is offered only when `imageToolAvailable`.
  Extend `tests/aiStaged.gmStageToolWhitelist.test.ts`.
- **The Google list** contains it.
- **`imageStore`:** save and get, delete for a story, orphans, bytes.
- **`collectImageIds`** walks all four places.
- **`imageSettings`:** defaults, clamping, and a stale model key.
- **`noRawApiFetch`** stays green: fal goes through `getProviderFetch`.

## 3. What could break, and the check that catches it

| what | check |
|---|---|
| a `ScenePart` built without an id, so a finished job cannot find its turn | an executor test, plus a grep of every `ScenePart` literal |
| the job writing into a stale `StoryData` copy and undoing the turn | the "attach to current" test; in the preview, play a turn while a picture paints |
| an object-URL leak | revoke on unmount; in the preview, scroll a long story and watch memory |
| `OffscreenCanvas` missing in an older Android WebView | a fallback to the original bytes; the APK check |
| fal not on the desktop allowlist, so every call fails in `tauri build` only | `tauri build` plus one picture (live, with the author's go) |
| the button showing for guests, who cannot make pictures | host-only gating; in the preview, join as a guest |
| undo or retry leaving orphans | the orphan sweep on load, plus its test |

## 4. Verification

- `npx vitest run`, `npx tsc --noEmit` and `node scripts/build-standalone.mjs`,
  with the baseline captured first.
- The browser preview, with screenshots:
  - the Settings → Images section;
  - a stubbed job, by setting `localStorage` keys and mocking the fetch in a
    dev-only path, or by driving the store, showing the pending, done,
    declined and missing cards;
  - the Illustrate this button.
- `RUSTUP_TOOLCHAIN=1.99.1 npx tauri build`, then launch: the allowlist entry.
- The `engine-review` agent, before merge.
- **Live (the author's go):** the design §10 checks on the desktop and on the
  APK.

## 5. Deliberately not built in I1

- Guests and party phones (PR I2).
- Sync of pictures.
- Moving old lore thumbnails into the store.
- The Designer setting `imageStyle` on an adventure: a one-field follow-up to
  `set_adventure_info`, worth doing in I2.
- Video, and inpainting by the player.

## Decisions made during implementation

(empty until the build)
