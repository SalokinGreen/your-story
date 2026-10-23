# The model picker, simplified — implementation plan

2026-10-23. Status: **plan, awaiting the author's go.** It builds
[`model-picker-design.md`](model-picker-design.md) (decisions 118–122) and adds
no product decisions of its own. The calls it had to make are in §8.

## 0. Shape

- **One branch, `claude/model-picker`, one PR, four slices**, each a commit.
- **One engine change**, in slice 1: the ladder's defaults, the slot helpers,
  narration following Default, and the classifier's model. So the
  `engine-review` agent runs on the PR before it merges.
- **No `StoryData` change, no new storage key, no new synced key.**
- Built by an `implementer` (Sonnet) from this file. The baseline (suite count,
  `tsc`, lint counts of the touched files) is taken by the planning session
  before the first edit.

## 1. What the code does today (facts the slices rely on)

| piece | where | note |
|---|---|---|
| the ladder | `REASONING_TIERS`, `app/misc/reasoningTiers.ts:103` | four `{modelKey, reasoningEffort, note}`: Haiku none, Haiku none, GLM 5.3 high, Sonnet xhigh; `TOP_TIER = length - 1` |
| overrides | `getTierOverrides` / `setTierOverride` / `resetTierOverrides` (190–220) | localStorage `reasoningTierOverrides`, a positional JSON array of `TierOverride \| null`, synced (`syncableSettingsKeys.ts:24`); unknown keys read as null, retired keys aliased |
| effective ladder | `getEffectiveTiers` (240) | applies an override only if `runsOnThisDevice` (subscription rule, decisions 16 and 29) |
| narration | `NARRATION_MODEL_KEY` (132), `getEffectiveNarrationModelKey` (280), `getEffectiveNarrationEffort` (325) | own override keys `narrationModelOverride` / `narrationEffortOverride`, synced; read by `generation.ts` (1056, 1080, 2054, 2057), `story/page.tsx` (129, 3621, 4828), `layerSettings.ts:237` (the side agents' keyless fallback), `turnCostEstimate.ts` (339–340), `ContextViewer.tsx` (398) |
| subscription notice | `getSubscriptionFallbacks` (361) | one entry per blocked slot, labelled `Tier N` / `Narration`; shown by `story/page.tsx:1015` and `ClaudeSubscriptionPanel.tsx:30` |
| classifier | `generation.ts:2178–2215` | only when `isClassificationAmbiguous`; runs on `getEffectiveTiers()[0]` at its effort, `maxTokens: 10` |
| Settings | `AIConfigTab.tsx` (1,186 lines) | narration banner (401–434), TurnCostPanel (440), the "Reasoning Tiers" card (442–565, including the false fallback line at 560–564), ClaudeSubscriptionPanel (567), Custom Models (570–660), "Recent Tier Calls" (671–690), generation settings |
| side-agent pickers | `ArchitectureSettingsTab.tsx` (574 lines) | `StageOverrideCard` (~170–240); Memory Keeper 401, Reflection 411, Director Assistant 421, Story Progress 431, Observer 465, then Observer Checks 479 |
| tier badge | `StoryTurn.tsx:365–375` | `T{n}`, tooltip "model · effort effort"; `ReasoningTierDisplay` (28–33) |
| cost estimate | `turnCostEstimate.ts:294–340`, `TurnCostPanel.tsx:170–175` | "Assuming tier N (model, effort) for the GM" |
| tests pinning the ladder | `tests/defaultModels.balanced.test.ts:99–145`, `tests/generation.effort.test.ts:358–385` (classifier on tier 0's effort), `tests/effort.settings.test.ts:101–184` (narration effort), `tests/reasoningTiers.cliFallback.test.ts` | |

## 2. Slice 1 — the slots in the engine (`app/misc/`)

**`reasoningTiers.ts`:**

- The ladder becomes GLM 5.3 low, GLM 5.3 low, GLM 5.3 high, Sonnet 5.5
  xhigh (decision 122). The `note`s stay. `NARRATION_MODEL_KEY` stays as the
  constant for "the Default slot's shipped model", `GLM 5.3`.
- New slot helpers, over the same storage:

```ts
export type ModelSlot = "default" | "advanced";
/** The tier entries each slot fills: Default 0–2, Advanced 3 (decision 119). */
export const SLOT_TIERS: Record<ModelSlot, readonly number[]> = { default: [0, 1, 2], advanced: [TOP_TIER] };
/** The slot a tier belongs to. */
export function slotForTier(tier: number): ModelSlot
/** The saved choice for a slot: tier 1's (Default's baseline) or tier 3's override; null when unset. */
export function getSlotOverride(slot: ModelSlot): TierOverride | null
/** True when Default's three entries hold different saved values (set separately before). */
export function isDefaultSlotMixed(): boolean
/** Writes the slot's entries in one localStorage write and one change event; null clears them. */
export function setSlotOverride(slot: ModelSlot, override: TierOverride | null): void
/** What the slot runs on here and now: the override if this device can run it, else the default (tier 1's or tier 3's). */
export function getEffectiveSlot(slot: ModelSlot): { modelKey: AnyModelKey; reasoningEffort: ReasoningEffort }
```

  - `getSlotOverride("default")` reads tier 1, the baseline. If tier 1 is
    unset but tier 0 or tier 2 is set, it returns the first set one, so a
    player who set only tier 2 sees it.
  - `isDefaultSlotMixed` compares the three entries' `modelKey` and
    `reasoningEffort`, treating null as "default".
  - `setSlotOverride("default", x)` writes `x` into entries 0, 1 and 2.
    This is where the design's call 2 happens: tier 2 then loses its own
    `high`.
  - `setTierOverride` and `resetTierOverrides` stay exported for the tests
    and older callers.
- **Narration follows Default.**
  - `getEffectiveNarrationModelKey()` returns `getEffectiveSlot("default").modelKey`.
  - `getEffectiveNarrationEffort()` returns its `reasoningEffort`.
  - `getNarrationModelOverride` and `setNarrationModelOverride`, and their
    effort pair, stay exported but are no longer read on the play path. The
    keys stay in `syncableSettingsKeys.ts`, so an older device keeps its
    voice.
  - Every caller in §1 keeps calling the same two functions, so none of them
    changes.
- **`getSubscriptionFallbacks()`** reports per slot, not per tier.
  - At most one `Default` and one `Advanced` entry.
  - The `fallbackModelKey` is the slot's shipped model.
  - The `Narration` entry goes.

**`generation.ts:2178–2215`, the classifier:**

- It runs on `resolveSideCallModel(null, providerKeys)`, the same helper
  every other side call uses (`layerSettings.ts`). That is Haiku at `none`,
  or the narration voice for a player with no OpenRouter key.
- `recordAICall` keeps the `classifier` stage.
- `maxTokens` stays 10. `providerCall` already raises it to 4,096 for Claude
  and Z.ai.
- The comment about decision 53 changes to say why: it's a side call, so it
  runs on the side model.

**Tests:**

- `tests/defaultModels.balanced.test.ts`: the ladder assertion (99) and the
  narration default (108) take the new values. "Saved overrides left alone"
  (145) stays as it is.
- `tests/generation.effort.test.ts:358–385`: the classifier carries the side
  model and `none`, not tier 0's.
- `tests/effort.settings.test.ts:101–184`: rewrite the narration-effort
  block. Narration effort is now the Default slot's effort, and a saved
  `narrationEffortOverride` is ignored. Keep a test that the old key is
  still in the synced list.
- `tests/reasoningTiers.cliFallback.test.ts`: the labels become `Default`
  and `Advanced`, and a subscription model saved through `setSlotOverride`
  falls back on a phone and during online play.
- **New `tests/modelSlots.test.ts`:**
  - `setSlotOverride("default")` writes 0–2 and leaves 3 alone;
    `"advanced"` writes only 3.
  - `getSlotOverride` reads tier 1 first, then 0, then 2.
  - `isDefaultSlotMixed`: true for different entries; false for one write;
    false when all are null.
  - `getEffectiveSlot` skips a subscription model this device can't run.
  - `slotForTier(0..3)`.
  - A four-entry array written by an older build (Haiku in 0 and 1, a custom
    model in 2) reads as mixed, and plays exactly what it says.

## 3. Slice 2 — the Models card (`AIConfigTab.tsx`)

- **Removed:**
  - The narration banner (401–434).
  - The Reasoning Tiers card (442–565), including the false fallback line.
- **New `ModelSlotRow`, inside `AIConfigTab.tsx`, the file's existing
  pattern.**
  - Props: `{ slot: ModelSlot; title: string; description: string }`.
  - A `ModelSelect` with `requireToolCalling`, and an effort `<select>` over
    `REASONING_EFFORTS`.
  - The "No key" badge and the subscription-problem badge, both reused from
    the old tier row.
  - Reset, when `getSlotOverride(slot)` is set: `setSlotOverride(slot,
    null)`.
  - For Default when `isDefaultSlotMixed()`: the line "Mixed: saving here
    sets all three".
- **The card "Models"** holds two rows:
  - **Default:** "Everyday turns, combat and rules, and the story's prose."
  - **Advanced:** "Boss fights, campaign-shaping moments and deadly stakes.
    The GM switches to it by itself, at most {MAX_TIER3_CALLS_PER_SCENE}
    times a scene."
  - The line under the card: "A slot whose model has no key can't run. Pick
    a model you have a key for."
- **TurnCostPanel** stays above the card. **ClaudeSubscriptionPanel** and
  **Custom Models** stay below it. The Custom Models copy changes to "use it
  for Default or Advanced above".
- **The "Advanced settings" disclosure** (a `<details>`, closed) sits after
  Custom Models. It contains the side agents (slice 3) and the "Recent Tier
  Calls" log (671–690, moved in unchanged).
- Re-render on `REASONING_CONFIG_CHANGED_EVENT`, as the tier card does now.

## 4. Slice 3 — the side agents move; the labels follow

- **`ArchitectureSettingsTab.tsx`:**
  - Export `StageOverrideCard` together with the five cards' configuration,
    as a component `SideAgentPickers`.
  - `AIConfigTab`'s Advanced settings renders `<SideAgentPickers />`.
  - The Architecture tab no longer renders the pickers. Each layer card that
    had one gets a line: "Its model is set in AI → Advanced settings."
  - The Observer Checks block (479 on) stays where it is. It isn't a model
    picker.
- **`StoryTurn.tsx`:**
  - `ReasoningTierDisplay` keeps its fields.
  - The `T{n}` badge renders only when `slotForTier(tier) === "advanced"`,
    as a small "Advanced" tag with the same tooltip (model · effort).
  - Default turns render nothing.
  - Update `tests/storyTurn.markup.test.tsx` if it asserts `T2`.
- **`turnCostEstimate.ts` and `TurnCostPanel.tsx:170–175`:** "Assuming
  Default (GLM 5.3, low) for the GM", or "Advanced (…)", from
  `slotForTier(predictedTier.tier)`. The estimate itself is unchanged.
- **`ClaudeSubscriptionPanel.tsx`** and the in-game notice
  (`story/page.tsx:1015`) show the new slot labels. They need no code change
  if they print `fallback.slot`. Check that they do.
- **`ContextViewer.tsx`** (the debug view): leave its tier ladder as it is.
  It's for the curious, and tiers are the truth there.

## 5. Slice 4 — docs and checks

- **`CLAUDE.md`, "Model selection is automatic but overridable":** two
  slots over the four-tier engine, the new default ladder, narration on
  Default, the classifier on the side model. Also fix the sentence "the
  narration model (`narrationModelOverride`) … can be overridden".
- **`docs/decisions.md`:** nothing new unless implementation needs a call.
- **`docs/model-picker-design.md`:** status changes to built.
- **`docs/status-report-2026-10-20.md`:** nothing. It lists no picker bug,
  and the false fallback line was never filed.
- **The `engine-review` agent** on the slice 1 diff, before the PR.
- **Checks** (the `verify` skill):
  - the suite and `tsc` against the baseline; the count moves by the one new
    file and the rewritten blocks; say why;
  - `eslint` on touched files, no new problems;
  - `node scripts/build-standalone.mjs`;
  - the browser preview of Settings → AI at 375 px and on the desktop, in Ink
    and Paper White, covering:
    - a fresh profile;
    - Mixed, after writing an older-build array by hand;
    - a subscription model saved in Advanced, on the web build, which can't
      run it;
    - Advanced settings opened;
    - the Architecture tab;
    - a saved Advanced turn showing its tag.
- **No model calls.** The new ladder's first real turn, which shows the GLM
  default and the side-model classifier in the Debug Logs, waits for the
  author's go. It goes in `docs/pending_tests.md` as a check.

## 6. Risks

- **Synced older devices.** Writing Default fills three entries. An older
  build reads the same three, so it plays the same model. An older build
  that writes one tier separately produces "Mixed" here. That is the
  designed behaviour, and the test in slice 1 covers it.
- **The ladder change reaches every player who never touched Settings.**
  Their everyday turns move to GLM 5.3 at once (decision 122). The cost
  panel shows it, and nothing else does. The PR description says so.
- **`getEffectiveNarrationModelKey` now depends on the tier overrides.** The
  side agents' keyless fallback (`layerSettings.ts:237`) and the Observer's
  rewrite (`resolveObserverRewriteModel`) follow it. For a Z.ai-only player
  who saved "GLM 5.3 (Z.ai)" in Default, the side agents then fall back to
  it, which is an improvement. For one who never chose anything, nothing
  changes: GLM 5.3 through OpenRouter, still with no key.

## 7. Out of scope

- An automatic "GLM 5.3 (Z.ai)" for a Z.ai-only player (design §6).
- The Designer's own picker.
- Renaming tiers in the GM's prompt or in `set_reasoning_tier`.

## 8. Calls this plan made

1. **Default reads tier 1 first.** Tier 1 is the baseline (`SCENE_BASELINE_TIER`),
   the tier most turns actually run on.
2. **The narration override functions stay exported, unused on the play
   path**, rather than being deleted. Deleting them would break the synced
   key's readers in older builds' tests, and removing the key is a
   follow-up.
3. **`SideAgentPickers` is moved by export, not by rewriting**
   `StageOverrideCard`. That keeps the move small.
4. **The debug ContextViewer keeps speaking in tiers.**
