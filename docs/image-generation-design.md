# Image generation in play — design

**Status:** approved (decision 109). PR I1 builds it for the host's screen,
except the reference pictures (slice S7), which wait for the live fal checks in
§10; see the implementation plan's "Decisions made during implementation".
Decisions 54–61 in [`decisions.md`](decisions.md) ("Interview eight").
Implementation plan: [`image-generation-implementation-plan.md`](image-generation-implementation-plan.md).
Sources: a fal.ai docs pass and a code map of master at `8869b88`, both
2026-10-21.

## 1. What this is

The GM gets a tool that paints a picture of the moment, and the player gets
an **Illustrate this** button on every turn (decision 54). Four kinds of
picture (decision 55):

| subject | made when | lives on | shown in |
|---|---|---|---|
| scene | the GM calls the tool at a moment that matters, or the player presses the button | the turn (`ScenePart`) | the story feed, under that turn's prose |
| NPC portrait | an NPC's first on-screen appearance | the NPC | the NPCs page, the reaction toast, and as a reference for later scenes |
| player portrait | from the character sheet, by a button or the GM | the story | the character sheet, and as a reference for scenes the player is in |
| location / lore | first arrival at a place that matters, or a key item | the lore note | the Notes page |

The pictures come from **fal.ai** when the player has a fal key, and otherwise
from the DeepInfra or OpenRouter key the lore-image button already uses
(decision 57). The GM's own pictures are capped per scene, and every picture's
price shows in the turn cost panel. A switch turns GM pictures off
(decision 56).

## 2. Out of scope

- **Pictures on guests' devices and party-mode phones.** The first PR shows
  them on the host's screen only; a follow-up sends them (decision 60, §7).
- **Syncing pictures across devices** (decision 59, §5).
- **Moving the existing lore thumbnails** (`StoryLore.thumbnailUrl`, data
  URIs inside `StoryData`) into the new store. They keep working as they are.
- Video, animation, and the player editing a picture by hand.
- Anything past the image provider's own content policy (§4.4).

## 3. How a picture gets made

### 3.1 The GM's tool: `generate_image`

```
generate_image({
  subject: "scene" | "npc" | "player" | "location",
  description: string,        // what to show, visually: who, where, light, mood. ≤ 400 chars
  npc_id?: string,            // subject "npc": whose portrait
  lore_id?: string,           // subject "location": which note it belongs to
  featuring?: string[],       // NPC ids, and "player", who appear in a scene picture
})
```

**The engine disposes.** The executor checks everything before anything is
spent, and refuses with a reason the GM can read:

- GM pictures are on, and the player has a key for an image provider.
- Fewer than the cap (default 2, 0–5 in Settings) GM pictures this scene. The
  counter lives in `StoryData.imageState` and resets when the scene key
  changes, the same `computeSceneKey` boundary `tier3CallsInScene` uses. It
  is a quantity that would otherwise only climb, so the reset is part of the
  design, not a detail.
- `npc_id` / `lore_id` name something that exists. An NPC that already has a
  portrait, or a note that already has a picture, is refused ("already has
  one"); replacing a picture is the player's call, from its card.
- `featuring` is trimmed to known ids.

The player's own button does not count against the cap: it is an explicit
spend.

**It does not block the turn.** A picture takes seconds (fal's schnell is
quoted at 2–8 s, FLUX.2 pro longer; no timing is confirmed yet). The executor
puts a job on the image queue and answers at once: "Picture requested; it will
appear under this turn. Don't describe it in the prose." The GM loop moves on.
The job runs in the background and fills in the card when it lands.

**When to use it** goes in the GM prompt, next to the tool:
- the first arrival somewhere that matters;
- an NPC's first time on screen;
- a reveal or a set piece;
- never routine turns.

Describe what a camera would see. No text, captions or lettering in the
picture. Nothing sexual, and no gore beyond what a fantasy book cover would
show (§4.4).

**Only offered when it can run.** `buildGMStagePrompt` gets an
`imageToolAvailable` flag (GM pictures on, a provider key present) and lists
the tool only then. Otherwise the model is told about a tool it cannot call,
which is a bug family this codebase keeps producing.

### 3.2 The player's button: **Illustrate this**

On each finished turn, next to the voice controls. Pressing it:
1. A small side call writes a visual description from that turn's prose. It
   runs on the side-agent model through `callSideModel` and costs a fraction
   of a cent.
2. That description goes to the same image queue as a scene picture.
3. NPCs named in the prose (the existing name-and-alias matching that
   highlights them) become the `featuring` list.

### 3.3 The prompt the provider gets

Built by the engine, not the model: the description, then the characters, then
the story's art style.

- **Characters:** for anyone in `featuring` without a portrait, one line from
  their NPC description or the character sheet. Anyone with a portrait goes in
  as a reference picture instead (§3.4).
- **Style:** a per-story `imageStyle` string. The default is "painterly
  digital illustration, cinematic lighting". Players set it in the story's
  image settings, and the Game Designer can set it on an adventure later.

The same style line on every picture is what makes a story's pictures look
like one book.

### 3.4 Keeping faces the same (decision 61, "Mixed")

The engine picks the model by job, not the GM:

| job | fal model | about |
|---|---|---|
| scene with nobody who has a portrait, and location | FLUX.1 schnell `fal-ai/flux/schnell` | $0.003 per megapixel |
| NPC or player portrait | FLUX.2 [pro] `fal-ai/flux-2-pro` | $0.03 for the first megapixel |
| scene featuring characters who have portraits | FLUX.2 [pro] edit `fal-ai/flux-2-pro/edit`, the portraits as `image_urls` (at most 3), named `@image1…` in the prompt | $0.03 for the first megapixel |

Each of the three is a Settings choice. **On DeepInfra and OpenRouter there are
no reference pictures**, so portraits still get made, but faces drift between
scenes. The Settings screen says so.

**One unverified piece:** whether fal's edit endpoint takes a portrait as a
`data:` URI in `image_urls`, or needs it uploaded to fal's storage first. The
live check (§10) settles it. If it needs an upload, the reference path adds
fal's storage upload. If that fails at run time, the picture is made from text
with the character lines from §3.3, and the Debug Logs say why.

## 4. Providers

### 4.1 fal.ai (new)

- **Key.** `falKey` in `APIKeysContext`. It stays on the device like every
  other key, is sent only to fal, and is never synced (decision 58). fal's
  docs recommend a server proxy instead, and the app has no server. Its
  guidance is about keys shipped inside an app to the public; here the
  player holds their own key, the same posture as every LLM provider the app
  calls. It does not join `pickProviderKeys`, which is for the six LLM keys
  only.
- **Call.** A synchronous `POST https://fal.run/<model>` with
  `Authorization: Key <falKey>` and `sync_mode: true`. The picture comes back
  in the response as a `data:` URI, so:
  - no public URL is minted (fal's media URLs are public to anyone holding
    them and kept for at least 7 days);
  - nothing needs fetching from fal's CDN;
  - fal skips its request history.
- **Timeout and Stop.** A 90 s timeout and an `AbortSignal`. Stop cancels the
  turn's pending pictures (§8).
- **Failures** (fal's documented errors):
  - **422 `content_policy_violation`:** the card says "The image service
    declined this one", with its categories. Not retried.
  - **`has_nsfw_concepts: true`:** fal sends a black image when its checker
    trips, so this counts as declined too, and the black image is never saved.
  - **429 `concurrent_requests_limit`:** a new account gets 2 concurrent
    requests. The queue runs one job at a time, and it retries once after 3 s.
  - **401 / 403:** "fal rejected the key".
  - **5xx / 504:** "Failed", with a Retry button.
- **Allowlist.** `https://fal.run/*` in `src-tauri/capabilities/default.json`.
  Android needs nothing: `CapacitorHttp` is on, so requests go out natively
  without CORS.

### 4.2 DeepInfra and OpenRouter

They reuse `generateImageCall.ts`, which already works in the native apps
(`creatorImageFetch` runs it in-process in the standalone build), plus the
catalog fixes in the catalog-refresh PR. The cover-art suffix it hard-codes is
replaced by the story's style line for in-play pictures.

### 4.3 Which provider

`auto` means fal if there is a fal key, else DeepInfra, else OpenRouter
(decision 57). Settings can pin one.

### 4.4 Content

fal's acceptable use policy prohibits sexually explicit content and restricts
gore, whatever the model's own safeguards. Its safety checker can be turned
off only with account authorisation, and FLUX.2's `safety_tolerance` is a
level, not an off switch. So:
- the app leaves the checker on;
- the GM is told to keep pictures non-explicit;
- a declined picture is a normal outcome: the turn is never affected.

DeepInfra and OpenRouter apply their own policies.

## 5. Where the bytes live (decision 59)

A separate IndexedDB database, `YourStoryImages`, holds the pictures.
`StoryData` holds only their ids. This follows the precedent
`ttsAudioCache.ts` set for voice audio, for the same reason:

- `StoryData` is one IndexedDB record, rewritten on every save (a 3 s
  debounce).
- The undo stack keeps 8 more copies of it.
- `executeGMTools` clones it every round.
- Online play sends the whole thing to guests on every change.
- Sync pushes all stories as one encrypted blob to a key-value store whose
  values are capped at 25 MiB.

One picture as a data URI is 1–3 MB, so even a few would be stored ten
times over, sent to every guest each turn, and could break sync for every
story.

- **The record:** `{ id, storyId, blob, mime, width, height, subject, prompt,
  provider, model, costUsd, createdAt }`.
- **Compression.** Pictures are scaled to a long edge of at most 1,024 px and
  saved as WebP, about 100–200 KB each, using the unused
  `app/misc/imageCompression.ts`.
- **Display** is through an object URL, revoked when the card unmounts.
- **Missing pictures.** On another device, or after the player clears
  storage, a picture shows as a placeholder with **Regenerate**, which reruns
  the saved prompt and is paid again.
- **Clean-up.** Deleting a story deletes its pictures. On load, pictures that
  nothing in `StoryData` points to any more are deleted, for example after an
  undone turn or a retried one. Settings shows the space used and has "Clear
  this story's pictures".
- **Export.** Story export already drops `data:` and `blob:` URLs, and
  pictures are not exported.

## 6. What the player sees

- **In the feed, under the turn's prose,** one card per scene picture:
  - **pending:** a soft shimmer and "Painting…";
  - **done:** the picture; tap for full screen (`FullScreenView`);
  - **declined:** "The image service declined this one";
  - **failed:** a Retry button.

  Each card has a small cost caption.
- **NPC portraits** replace the emoji or `custom_symbol_url` on the NPCs page
  and in the reaction toast. A Replace button on the NPC makes a new one.
- **The player portrait** shows on the character sheet, with a **Make
  portrait** button.
- **Location and lore pictures** show on the note in the Notes page. A new
  picture wins over an old `thumbnailUrl`.
- **Settings → Images**, a new section:
  - GM pictures on or off;
  - pictures per scene (default 2);
  - provider (auto, fal, DeepInfra, OpenRouter);
  - the three model choices of §3.4;
  - the default style;
  - space used.
- **Cost.** A new `image` stage in the turn cost panel. fal returns no price,
  so each picture is recorded at the catalog's price through `recordAICall`'s
  `providerReportedUsd`. A background picture bills to the turn that asked
  for it (`costTurnId`), as the side agents do.

## 7. Multiplayer and party mode (decision 60)

**First PR: the host's screen only.** Guests receive `StoryData` with the
picture ids but no bytes, so a card says "Picture on the host's screen". The
GM tool runs on the host, so online play needs nothing else.

**The follow-up PR** sends each picture once, as its own message, the way
`tts_audio` carries voice audio outside `StoryData`. The guest caches it in its
own image store. Party-mode phones get the same message once party mode is on
master.

**The Claude subscription route** needs nothing: `claudeCli.ts` renders
whatever tools the request offers.

## 8. How this could go wrong, and the guard

| risk | guard |
|---|---|
| the tool offered when it cannot run (no key, pictures off) | `imageToolAvailable` gates the whitelist; a test checks both ways |
| the GM paints every turn | the engine-side per-scene cap, reset at the scene boundary; the prompt says "moments that matter" |
| a picture fails silently | every job ends in a visible state on its card and a Debug Logs line |
| works on the web build only | fal goes through `getProviderFetch`, the Tauri allowlist and `CapacitorHttp`; checked in `tauri build` and on the APK |
| pictures bloat saves, guests and sync | bytes live outside `StoryData` (§5) |
| "Compact Story" deletes old `gmToolCalls` and `gmConversation` | picture ids live on `ScenePart.images`, never only in a tool result |
| Gemini cannot call the tool | the name is added to `GOOGLE_ESSENTIAL_TOOLS` |
| Stop leaves pictures painting and billing | each job carries the turn's abort signal; Stop cancels that turn's pending pictures |
| a black "NSFW" image saved as if it were the picture | `has_nsfw_concepts` means declined |

## 9. What it costs

At the defaults:
- **A scene picture** with nobody known in it is about $0.002–0.003
  (schnell, 1024×768).
- **A portrait, or a scene with a known face,** is about $0.03 (FLUX.2 pro).
- **At the GM's cap of 2,** a scene spends at most about $0.06 on pictures,
  plus whatever the player asks for. Each **Illustrate this** adds about $0.0005
  for the description call.
- **Through DeepInfra:** about $0.005 (P-Image) to $0.03 (FLUX 2 Pro) per
  picture.
- **Through OpenRouter:** about $0.04 (Nano Banana).

## 10. Live checks before and after the build (need the author's go and a fal key)

Before the reference slice:
1. One schnell picture with `sync_mode: true`. Does a `data:` URI come back,
   and how long does it take?
2. One FLUX.2 pro portrait.
3. One FLUX.2 pro edit with that portrait as a `data:` URI in `image_urls`.
   Is it accepted, and is the face kept?
4. One prompt fal should refuse, to see the real 422 body.

About $0.10 in total. Then the built app, on the desktop and on the APK: a GM
picture, the button, a portrait, a declined picture, and Stop while one is
painting.

## 11. Answered questions

| decision | question | answer |
|---|---|---|
| 54 | When are pictures made? | The GM decides at moments that matter, plus an Illustrate this button |
| 55 | For what? | Scenes, NPC portraits, the player's portrait, locations and lore |
| 56 | Cost control? | A per-scene cap on GM pictures (default 2), each price shown, a switch to turn GM pictures off |
| 57 | Which providers? | fal.ai (new, the default when its key is set), plus DeepInfra and OpenRouter |
| 58 | The fal key on the device, despite fal's advice? | Yes, like every other key |
| 59 | Sync pictures? | No: they stay on the device that made them |
| 60 | Guests and party phones? | In a later PR; the first is host-only |
| 61 | Default fal model? | Mixed: schnell for plain scenes, FLUX.2 pro (and its edit mode with references) for portraits and scenes with a known face |
