# The model picker, simplified — implementation plan

2026-10-23. Status: **plan, revised after Codex's review, awaiting the
author's go.** It builds [`model-picker-design.md`](model-picker-design.md)
(decisions 118–123) and adds no product decisions of its own. The calls it
had to make are in §8, and the review is in §9.

## 0. Shape

- **One branch, `claude/model-picker`, one PR, four slices**, each a commit.
- **Slice 1 is an engine change**: the ladder, the slot helpers, narration
  following Default, combat's effort floor, the classifier's model, and
  skipping identical tiers. The `engine-review` agent runs on the PR before
  it merges.
- **No `StoryData` change, no new storage key, no new synced key.**
- Built by an `implementer` (Sonnet) from this file. The baseline (suite count,
  `tsc`, lint counts of the touched files) is taken by the planning session
  before the first edit.

## 1. What the code does today (facts the slices rely on)

| piece | where | note |
|---|---|---|
| the ladder | `REASONING_TIERS`, `app/misc/reasoningTiers.ts:103` | four `{modelKey, reasoningEffort, note}`: Haiku none, Haiku none, GLM 5.3 high, Sonnet xhigh; `TOP_TIER = length - 1` |
| efforts | `REASONING_EFFORTS` (36) | `none < low < normal < high < xhigh`, cheapest first |
| overrides | `getTierOverrides` / `setTierOverride` / `resetTierOverrides` (190–220) | localStorage `reasoningTierOverrides`, a positional JSON array of `TierOverride \| null`, synced (`syncableSettingsKeys.ts:24`). `getTierOverrides` turns unknown keys into null and aliases retired ones, and `setTierOverride` writes that **filtered** array back. That's why the new setter must not copy it (§2). |
| effective ladder | `getEffectiveTiers` (240) | applies an override only if `runsOnThisDevice` (subscription rule, decisions 16 and 29) |
| narration | `NARRATION_MODEL_KEY` (132), `getEffectiveNarrationModelKey` (280), `getEffectiveNarrationEffort` (325) | own keys `narrationModelOverride` / `narrationEffortOverride`, synced. Read by `generation.ts` (1056, 1080, 2054, 2057), `story/page.tsx` (129, 3621, 4828), `layerSettings.ts:237` (the side agents' keyless fallback), `resolveObserverRewriteModel`, `turnCostEstimate.ts` (339–340), `ContextViewer.tsx` (398). |
| subscription notice | `getSubscriptionFallbacks` (361) | one entry per blocked tier and one for narration, labelled `Tier N` / `Narration`. Shown by `story/page.tsx:1015` and `ClaudeSubscriptionPanel.tsx:30`. The panel's instructions also name "a tier or the narration voice" (151) and "under Architecture" (169). |
| classifier | `generation.ts:2178–2215` | only when `isClassificationAmbiguous`; runs on `getEffectiveTiers()[0]` at its effort, `maxTokens: 10`. Priced by `turnCostEstimate.ts:375` on `resolveTier(0)`. |
| Observer retry | `generation.ts:1599–1611` | on `tier_escalation_missed`, rolls the turn back and reruns at `min(TOP_TIER, tierUsed + 1)` through `applyTierEscalation` |
| error step-down | `generation.ts:2538–2552` | a non-OK GM response retries on `fallbackTier(failedTier)`, one lower |
| the cap | `applyTierEscalation` (611–640) | counts requests for the top tier (`tier3CallsInScene`), not calls; floors put a turn on tier 3 without counting |
| Settings | `AIConfigTab.tsx` (1,186 lines) | narration banner (401–434); TurnCostPanel (440); the "Reasoning Tiers" card (442–565, including the false fallback line at 560–564); ClaudeSubscriptionPanel (567); Custom Models (570–660), with live `customModels` state refreshed on `custom-models-changed` (85–92); "Recent Tier Calls" (671–690); generation settings |
| side-agent pickers | `ArchitectureSettingsTab.tsx` (574 lines) | `StageOverrideCard` (~170–240); a custom-models snapshot taken once (260); Memory Keeper 401, Reflection 411, Director Assistant 421, Story Progress 431 with its check-in interval slider, Observer 465, then Observer Checks 479 |
| sync | `syncManager.ts:580, 706, 730` | writes localStorage directly, then fires `SYNC_COMPLETED_EVENT` (`yourStorySyncCompleted`), not the reasoning event |
| tier badge | `StoryTurn.tsx:365–375` | `T{n}`, tooltip "model · effort effort"; `ReasoningTierDisplay` (28–33) |
| cost panel | `turnCostEstimate.ts:294–340`, `TurnCostPanel.tsx:170–175` | "Assuming tier N (model, effort) for the GM" |

## 2. Slice 1 — the engine (`app/misc/`)

**`reasoningTiers.ts`:**

- **The ladder** (decision 122). The `note`s stay. `NARRATION_MODEL_KEY` stays
  `GLM 5.3`, now documented as Default's shipped model.

  | tier | model | effort |
  |---|---|---|
  | 0 | GLM 5.3 | none |
  | 1 | GLM 5.3 | none |
  | 2 | GLM 5.3 | high |
  | 3 | Claude Sonnet 5.5 | xhigh |

- **Slot helpers**, over the same storage:

```ts
export type ModelSlot = "default" | "advanced";
/** The tier entries each slot fills: Default 0–2, Advanced 3 (decision 119). */
export const SLOT_TIERS: Record<ModelSlot, readonly number[]> = { default: [0, 1, 2], advanced: [3] };
export function slotForTier(tier: number): ModelSlot;            // 0–2 → default, 3 → advanced
/** The slot's saved choice: tier 1's override for Default, tier 3's for Advanced; null when unset. */
export function getSlotOverride(slot: ModelSlot): TierOverride | null;
/** Default's entries 0 and 2 when they differ from entry 1 (null = default), for the Mixed line and notice. */
export function getDefaultSlotMix(): { tier: 0 | 2; modelKey: AnyModelKey; reasoningEffort: ReasoningEffort }[];
/** Writes this slot's entries, keeps every other entry byte for byte, one write, one change event; null clears. */
export function setSlotOverride(slot: ModelSlot, override: TierOverride | null): void;
/** What the slot runs on here and now: `getEffectiveTiers()[1]` for Default, `[3]` for Advanced. */
export function getEffectiveSlot(slot: ModelSlot): { modelKey: AnyModelKey; reasoningEffort: ReasoningEffort };
```

  - **Default means tier 1 and only tier 1**, both in `getSlotOverride` and
    in `getEffectiveSlot`. Narration reads it too. Tiers 0 and 2 never stand
    in for it. They show only in the Mixed line.
  - **`setSlotOverride` reads the raw stored array, not
    `getTierOverrides()`.** It parses the JSON, pads to four entries,
    replaces only its own indices, and writes back. An entry whose model
    this build doesn't know (a newer build's choice, synced here) survives an
    edit of the other slot. Malformed JSON is treated as four nulls, as
    today.
  - `setTierOverride` and `resetTierOverrides` stay exported for the tests.
- **Combat's floor (decision 123).** In `getEffectiveTiers`, tier 2's
  effort becomes the higher of its resolved effort and `high`, by
  `REASONING_EFFORTS` order. That applies whether the effort came from an
  override or from the default. A small exported helper,
  `atLeastEffort(e, floor)`, does the comparison.
- **Narration follows Default.**
  - `getEffectiveNarrationModelKey()` returns
    `getEffectiveSlot("default").modelKey`.
  - `getEffectiveNarrationEffort()` returns its `reasoningEffort`.
  - The narration getters and setters stay exported but are no longer read on
    the play path. Their keys stay in `syncableSettingsKeys.ts`, so an older
    device keeps its voice.
  - Every caller in §1 keeps calling the same two functions. That includes
    the side agents' keyless fallback and the Observer's rewrite, which now
    follow Default.
- **`getSubscriptionFallbacks()`** checks every stored entry, not one per
  slot.
  - A blocked entry 3 gives `{slot: "Advanced"}`.
  - Blocked entries among 0–2 give one `Default` entry. If Default is Mixed
    and not every blocked entry is in it, the slot reads `"Default, tier 2"`
    (or `"tiers 0 and 2"`), and `fallbackModelKey` is each entry's shipped
    model.
  - The `Narration` entry goes.
- **`nextDistinctTier(from, direction, tiers)`** (new, pure): the nearest
  tier above or below `from` whose `(modelKey, reasoningEffort)` differs from
  `from`'s in the given effective ladder, or null.

**`generation.ts`:**

- **The classifier (2178–2215)** runs on `resolveSideCallModel(null,
  providerKeys)`, the helper every other side call uses (`layerSettings.ts`).
  - If that model's provider has no key here (`hasKeyForModel`), it runs on
    `getEffectiveSlot("default")` instead. That keeps today's behaviour for a
    desktop player running both slots on their subscription with no
    OpenRouter key.
  - The `classifier` cost stage stays, and `maxTokens` stays 10
    (`providerCall` raises it to 4,096 for Claude and Z.ai).
  - The decision-53 comment is rewritten to say why.
- **The Observer's retry (1599–1611)** asks `applyTierEscalation` for
  `nextDistinctTier(tierUsed, "up", getEffectiveTiers()) ?? TOP_TIER` instead
  of `tierUsed + 1`. The cap and the reset allowance work as today.
- **The error step-down (2538–2552)** uses `nextDistinctTier(failedTier,
  "down", …)` instead of `fallbackTier`. When it's null, the error surfaces
  as today. `fallbackTier` stays for `subagentExecutor.ts:191` (the
  unoffered `delegate_task`).

**`turnCostEstimate.ts:375`:** the classifier line resolves its model and
effort with the same rule as runtime: the side model, else Default. This
needs the provider keys the estimator already receives for the side agents.
Check that it does; if not, pass them in.

**Tests (slice 1).** Each named file gets its expectations moved to the new
ladder. A saved narration override is tested separately: it is still stored
and synced, and it is no longer used.

- `tests/defaultModels.balanced.test.ts`:
  - the ladder (99) and the narration default (108);
  - the provider requests that expect Haiku for tiers 0–1 (191);
  - "saved overrides left alone" (145–153). It splits in two: the narration
    override is kept in storage, and narration now follows Default.
- `tests/generation.effort.test.ts`:
  - the classifier (358–385) gets the side model and `none`;
  - the narration, choices and rewrite blocks (267–357) carry Default's
    effort.
- `tests/effort.settings.test.ts:101–184`: narration effort is Default's,
  and the old key is still in the synced list.
- `tests/reasoningTiers.cliFallback.test.ts`: labels `Default` and
  `Advanced`; a subscription model saved through `setSlotOverride` falls
  back on a phone and in online play; a Mixed Default names its tiers.
- Also update: `tests/generation.sideCallKeys.test.ts:153`,
  `tests/modelCatalog.refresh.test.ts:252`,
  `tests/modelCatalog.legacyAliases.test.ts:271`,
  `tests/providerCall.mandatoryReasoning.test.ts:158` and
  `tests/turnCost.test.ts:656`. Each pins the old ladder, the narration
  voice or the classifier's model.
- **New `tests/modelSlots.test.ts`:**
  - `setSlotOverride("default")` writes 0–2 and leaves 3 alone; `"advanced"`
    writes only 3.
  - An entry with a model key this build doesn't know survives an edit of
    the other slot, byte for byte.
  - `getSlotOverride` and `getEffectiveSlot("default")` read tier 1 only.
  - `getDefaultSlotMix` is empty after one Default write and lists the
    differing tiers for an older build's array (Haiku in 0, a custom model
    in 2).
  - `getEffectiveSlot` skips a subscription model this device can't run.
  - `slotForTier(0..3)`.
  - Combat's floor: tier 2 is `high` with Default at `none`, and `xhigh`
    with Default at `xhigh`.
  - `nextDistinctTier`: on the shipped ladder, up from 0 is 2 (0 and 1 are
    identical; 2 differs by effort) and down from 1 is null. With Default
    set to `xhigh` everywhere, up from 1 is 3.
- **New, in `tests/generation.effort.test.ts`** or a sibling: an Observer
  `tier_escalation_missed` retry from tier 0 on the shipped ladder reruns on
  tier 2, not tier 1. And the classifier runs on Default for a
  subscription-only desktop profile with no OpenRouter key.

## 3. Slice 2 — the Models card (`AIConfigTab.tsx`)

- **Removed:** the narration banner (401–434) and the Reasoning Tiers card
  (442–565), including the false fallback line.
- **New `ModelSlotRow`, inside `AIConfigTab.tsx`**, the file's existing
  pattern.
  - Props: `{ slot: ModelSlot; title: string; description: string }`.
  - A `ModelSelect` with `requireToolCalling`, and an effort `<select>` over
    `REASONING_EFFORTS`.
  - The "No key" and subscription-problem badges, reused from the old tier
    row.
  - Reset when `getSlotOverride(slot)` is set.
  - For Default, when `getDefaultSlotMix()` is not empty: "Mixed: tier 0
    runs X, tier 2 runs Y. Saving here sets all three."
- **The card "Models":**
  - **Default:** "Everyday turns, combat and rules, and the story's prose.
    Combat and rules always think at high or more."
  - **Advanced:** "Session zero, boss fights, deadly stakes and
    campaign-shaping moments. The game switches to it by itself." There is
    no promise about a count (design §3).
  - Under both: "A slot whose model has no key can't run. Pick a model you
    have a key for."
- **TurnCostPanel** stays above. **ClaudeSubscriptionPanel** and **Custom
  Models** stay below. The Custom Models copy changes to "use it for Default
  or Advanced above".
- **"Advanced settings"** is a closed `<details>` after Custom Models. It
  holds `<SideAgentPickers customModels={customModels} />` (slice 3) and the
  "Recent Tier Calls" log (671–690, moved unchanged).
- **Refresh:** the card re-reads on `REASONING_CONFIG_CHANGED_EVENT` **and**
  on `SYNC_COMPLETED_EVENT`. So does TurnCostPanel, if it doesn't already;
  check `TurnCostPanel.tsx:79–82`.

## 4. Slice 3 — the side agents move; the labels follow

- **`ArchitectureSettingsTab.tsx`:**
  - Extract `SideAgentPickers({ customModels })`, exported. It contains the
    five `StageOverrideCard`s with their state, handlers, the Observer's
    off-note, and the **Story Progress check-in interval slider** (its state
    and handler move with it). Pass in the live `customModels` instead of the
    snapshot at 260.
  - The Architecture tab no longer renders the pickers. Each layer card that
    had one gets the line "Its model is set in AI → Advanced settings."
  - Observer Checks (479 on) stays in the Architecture tab.
- **`StoryTurn.tsx`:** the `T{n}` badge renders only when
  `slotForTier(tier) === "advanced"`, as a small "Advanced" tag with the same
  tooltip. Default turns render nothing. `ReasoningTierDisplay` is
  unchanged. Update `tests/storyTurn.markup.test.tsx` if it asserts a tier
  badge.
- **`TurnCostPanel.tsx:170–175`:** "Assuming Default (GLM 5.3, none) for the
  GM", or "Advanced (…)", from `slotForTier(predictedTier.tier)`.
- **`ClaudeSubscriptionPanel.tsx`:** the slot labels come from
  `getSubscriptionFallbacks`. Rewrite the instructions at 151 ("a tier or the
  narration voice" becomes "Default or Advanced") and 169 ("under
  Architecture" becomes "under AI → Advanced settings").
- **`story/page.tsx:1015`**, the in-game notice: check that it prints
  `fallback.slot` and needs nothing else.
- **`ContextViewer.tsx`** (the debug view) keeps its tier ladder.

## 5. Slice 4 — docs and checks

- **`CLAUDE.md`, "Model selection is automatic but overridable":**
  - two slots over the four-tier engine;
  - the new ladder, and combat's floor;
  - narration on Default, the classifier on the side model, and identical
    tiers skipped;
  - drop the sentence about overriding the narration model.
- **`docs/model-picker-design.md`:** status changes to built.
  **`docs/status-report-2026-10-20.md`:** nothing.
- **The `engine-review` agent** on the slice 1 diff, before the PR.
- **Checks** (the `verify` skill):
  - the suite and `tsc` against the baseline; say why the count moved;
  - `eslint` on touched files, no new problems;
  - `node scripts/build-standalone.mjs`;
  - the browser preview of Settings → AI at 375 px and on the desktop, in Ink
    and Paper White, covering:
    - a fresh profile;
    - Mixed, after writing an older build's array by hand;
    - a subscription model saved in Advanced on the web build;
    - Advanced settings opened, with the check-in interval;
    - the Architecture tab;
    - a Settings refresh after firing `yourStorySyncCompleted` by hand;
    - a saved Advanced turn's tag.
- **No model calls.** The first real turn on the new ladder goes in
  `docs/pending_tests.md`. It should show GLM 5.3 for the GM, Haiku for the
  classifier, and `high` on a combat turn in the Debug Logs.

## 6. Risks

- **The ladder reaches every player who never touched Settings.** Everyday
  turns move to GLM 5.3 at once (decision 122). The cost panel shows it, and
  the PR description says so.
- **Older builds on synced devices.** They play the same models when they
  know the keys. Combat's floor exists only in this build, so an older build
  plays tier 2 at the stored effort. An older build that edits one tier
  makes Default "Mixed" here, which is the designed behaviour.
- **Narration and the side agents' fallback now follow Default.** For a
  Z.ai-only player who saved "GLM 5.3 (Z.ai)" in Default, the side agents
  then fall back to it, which is an improvement. Anyone who never chose
  sees no change.

## 7. Out of scope

- Automatic "GLM 5.3 (Z.ai)" for a Z.ai-only player (design §6).
- The Designer's picker.
- Renaming tiers in the GM's prompt or in `set_reasoning_tier`.
- Counting every Advanced call against the cap (design §3: the copy is fixed
  instead).

## 8. Calls this plan made

1. **Default is tier 1 everywhere**: the row, narration and the classifier's
   fallback.
2. **The narration functions stay exported, unused on the play path.**
   Removing the synced keys is a follow-up.
3. **`SideAgentPickers` is extracted, not rewritten.** It takes the live
   custom-models list as a prop.
4. **The debug ContextViewer keeps speaking in tiers.**
5. **The Observer's retry goes to the next distinct tier, else Advanced.**
   On the shipped ladder that's tier 2 from tiers 0–1, which differs only
   by its `high` effort, and Advanced from tier 2.

## 9. Review

Codex (gpt-6.1-sol, high) reviewed the design and this plan on 2026-10-23.
All 13 findings were checked against the code and kept, none dropped; each is
folded into the slice it belongs to:

- Default's two definitions;
- the missing tests;
- the cap's copy;
- the Observer's retry and the step-down across identical tiers;
- the classifier's estimate;
- notices for a Mixed Default;
- keeping entries this build doesn't know;
- the classifier for subscription-only players;
- the live custom-models list;
- refreshing after sync;
- the effort exception (the author chose combat's floor, decision 123);
- the subscription panel's instructions;
- the check-in interval.
