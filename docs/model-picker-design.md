# The model picker, simplified — design

2026-10-23. Status: **design, awaiting the author's go.** Decisions 118–122.
The implementation plan is a separate document, written after this one is
approved.

## Why

The author: "5 models are unnecessary. We should have 3 models: narration,
default, and advanced. Or just 2. Default and advanced." Settings today shows
a narration voice and four GM tier slots, each with a model and an effort
picker, plus five side-agent pickers in the Architecture tab. A player has
to understand "tier 2" to change any of it.

## The decisions (from the interview, `decisions.md` 118–122)

- **118:** two slots, **Default** and **Advanced**. Narration uses the
  Default model.
- **119:** the engine still chooses per turn, as now. Today's tiers 0–2 run on
  Default and tier 3 on Advanced. The per-scene cap on Advanced calls (3)
  stays.
- **120:** each slot keeps one effort picker.
- **121:** the side agents' pickers move under a collapsed **Advanced
  settings** section.
- **122:** Default starts on **GLM 5.3** and Advanced on **Claude Sonnet
  5.5**.

## 1. What the player sees

The model part of Settings → AI becomes one card:

```
 Models
 ┌───────────────────────────────────────────────────────────┐
 │ Default                                     [GLM 5.3   ▾] │
 │ Everyday turns, combat and rules, and the   [low       ▾] │
 │ story's prose.                                            │
 ├───────────────────────────────────────────────────────────┤
 │ Advanced                                 [Sonnet 5.5   ▾] │
 │ Boss fights, campaign-shaping moments and   [xhigh     ▾] │
 │ deadly stakes. The GM switches to it by                   │
 │ itself, at most 3 times a scene.                          │
 └───────────────────────────────────────────────────────────┘
 ▸ Advanced settings
```

- **Each slot** has a model picker (the existing `ModelSelect`, tool-capable
  models only), an effort picker, a "No key" badge when the player has no key
  for that model, and Reset.
- **The turn-cost panel** stays above the card and speaks in slots: "Assuming
  Default (GLM 5.3, low) for the GM".
- **The custom-models section** stays; its copy says "use it for Default or
  Advanced" instead of "narration or any reasoning tier".
- **Advanced settings** opens to show the side agents (Memory Keeper,
  Reflection, Director Assistant, Story Progress Observer and the Observer),
  each with today's toggle, model and effort controls, plus the "Recent tier
  calls" log. Closed by default.
- **The Architecture tab** keeps its explanation of the five layers. Its
  pickers move to Advanced settings, and each layer card gets a line pointing
  there.
- **The false fallback line goes.** "Tiers with 'no key' will automatically
  fall back to the next-lower tier" is not true: a missing key stops the turn
  with a message (`reasoningTiers.ts` comment, 80–90). The card says instead:
  "A slot whose model has no key can't run. Pick a model you have a key for."
- **In the story**, the per-turn tier badge stops showing `T0`–`T3`. Default
  turns show nothing. An Advanced turn shows a small "Advanced" tag on its
  work line, with the model and effort in its tooltip.

## 2. What happens underneath

**The engine keeps its four tiers.** Everything that decides a turn's weight
keeps working unchanged:

- the combat and session-zero floors;
- the deterministic classifier and the small ambiguity call;
- decay toward the baseline;
- the stakes floor;
- the Observer's escalation retry;
- the GM's `set_reasoning_tier` (still 0–3, with the same description);
- the per-scene cap.

Old saves keep their `ScenePart.reasoningTier` and `reasoningTierState`
numbers. The two slots are a new way of filling the four-entry ladder, not a
new ladder.

- **Storage stays where it is.** `reasoningTierOverrides` stays a four-entry
  synced array.
  - Saving Default writes the same model and effort into entries 0, 1 and 2.
  - Saving Advanced writes entry 3.
  - An older app version on another device reads the same array and plays
    the same models, so sync needs no migration.
- **Reading a slot:**
  - Advanced is entry 3.
  - Default is entry 1, the baseline tier.
  - If entries 0–2 disagree, because a player set them separately before,
    the Default row says "Mixed: saving here sets all three" until the next
    save.
- **The new default ladder (decision 122).**

  | tier | today | after |
  |---|---|---|
  | 0 | Haiku 5.5, none | GLM 5.3, low |
  | 1 | Haiku 5.5, none | GLM 5.3, low |
  | 2 | GLM 5.3, high | GLM 5.3, high |
  | 3 | Sonnet 5.5, xhigh | Sonnet 5.5, xhigh |

  GLM 5.3 rejects an explicit `none` (it always thinks), so `low` is the
  cheapest it takes.
- **Narration follows Default.** The story-continuation call and the choices
  run on the effective Default model and its effort. On most turns the GM's
  own final round already writes the prose, on that tier's model. The saved
  `narrationModelOverride` and `narrationEffortOverride` are no longer read,
  but they stay in storage and in sync so an older device keeps its choice.

## 3. Where this costs or saves

- **Everyday turns cost more.** They move from Haiku to GLM 5.3 (decision
  122). The turn-cost panel shows the new estimate. For an OpenRouter player
  who never touched Settings, this is the one visible change in their bill.
- **Fewer small calls.** The ambiguity classifier ran on tier 0's model
  (Haiku). Under the new ladder that would be GLM 5.3, a thinking model, for
  a one-word answer. It moves to the side-agent default (Haiku, effort
  `none`, through `resolveSideCallModel`) like every other small side call.
  That keeps it cheap and fast whatever the player picks for Default.
- **Players who changed tiers keep their choices.** A saved override in any
  slot is untouched. Only unset slots move to the new defaults.

## 4. The subscription, online play and keys

- **The Claude subscription (desktop only)** works per slot as today. A
  subscription model in Default or Advanced falls back to that slot's default
  on a device without the CLI and during online play (`runsOnThisDevice`,
  decisions 16 and 29). The notice names "Default" or "Advanced" instead of
  "Tier N".
- **A Z.ai-only player** still has to pick "GLM 5.3 (Z.ai)", but now in two
  places instead of five. Both rows show "No key" until they do. Mapping it
  automatically is out of scope (§6).

## 5. What it touches

The full list goes in the implementation plan. In outline:
- `app/misc/reasoningTiers.ts`: the default ladder; Default/Advanced
  getters and setters over the existing array; narration resolving to
  Default; subscription notices in slot names.
- `app/misc/generation.ts`: the classifier call moves to the side-agent
  model. This is an engine change, so `engine-review` runs.
- `app/components/AIConfigTab.tsx`: the new card, Advanced settings, and the
  copy fixes.
- `app/components/ArchitectureSettingsTab.tsx`: the pickers move out.
- `app/story/StoryTurn.tsx`: the tag replaces the badge.
- `TurnCostPanel.tsx`, `ClaudeSubscriptionPanel.tsx`, `ContextViewer.tsx`:
  labels.
- Tests: `tests/defaultModels.balanced.test.ts` (the ladder),
  `tests/generation.effort.test.ts` (the classifier's model and effort), new
  tests for the slot read/write and "Mixed".
- `CLAUDE.md`'s model-selection paragraph.

## 6. What this does not change

- The GM's prompt, its tool list and `set_reasoning_tier`.
- The side agents' default models (Haiku) and how they fall back.
- The Game Designer's own model picker (on the Designer screen).
- No new synced key.
- Not included: automatically using "GLM 5.3 (Z.ai)" for a player with only
  a Z.ai key. It's worth doing, but it's a separate small change to the key
  fallbacks.

## 7. Calls made in this design, for the author to check

1. **The engine keeps four tiers, and the slots are only the UI.** Rewriting
   the engine to two tiers would touch the combat floors, the classifier,
   `set_reasoning_tier`, the Observer, cost estimates and old saves, and
   gain nothing the player can see.
2. **One Default effort, except that combat and rules still think harder.**
   On the shipped defaults, tier 2 keeps `high`. Once the player saves the
   Default slot (its model or its effort; a stored slot holds both), tier 2
   takes the same model and effort as everyday turns. That is "one effort per
   slot" taken literally; the alternative is a hidden rule that tier 2 is
   never below `high`.
3. **The classifier moves to the cheap side-agent model.** Otherwise moving
   Default to GLM would put a thinking model on a one-word call.
4. **A narration voice someone saved is no longer used** (decision 118).
   It stays stored, so an older device still reads it.
5. **The tier badge becomes an "Advanced" tag**, shown only on Advanced
   turns.
6. **The Architecture tab keeps its explanations** and loses only its
   pickers.
