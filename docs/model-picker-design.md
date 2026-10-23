# The model picker, simplified — design

2026-10-23. Status: **approved (decision 124) and built on `claude/model-picker`.** Decisions 118–124.
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
- **123:** one effort per slot, except that a combat or rules turn on Default
  never thinks below `high`.

## 1. What the player sees

The model part of Settings → AI becomes one card:

```
 Models
 ┌───────────────────────────────────────────────────────────┐
 │ Default                                     [GLM 5.3   ▾] │
 │ Everyday turns, combat and rules, and the   [none      ▾] │
 │ story's prose. Combat and rules always                    │
 │ think at high or more.                                    │
 ├───────────────────────────────────────────────────────────┤
 │ Advanced                                 [Sonnet 5.5   ▾] │
 │ Session zero, boss fights, deadly stakes    [xhigh     ▾] │
 │ and campaign-shaping moments. The game                    │
 │ switches to it by itself.                                 │
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
  Reflection, Director Assistant, Story Progress Observer with its check-in
  interval, and the Observer), each with today's toggle, model and effort
  controls, plus the "Recent tier calls" log. Closed by default.
- **The Settings screen refreshes after an incoming sync**, so a choice made
  on another device shows here without reopening Settings.
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
- the Observer's escalation retry (with one change, below);
- the GM's `set_reasoning_tier` (still 0–3, with the same description);
- the per-scene cap.

Old saves keep their `ScenePart.reasoningTier` and `reasoningTierState`
numbers. The two slots are a new way of filling the four-entry ladder, not a
new ladder.

- **Storage stays where it is.** `reasoningTierOverrides` stays a four-entry
  synced array.
  - Saving Default writes the same model and effort into entries 0, 1 and 2.
  - Saving Advanced writes entry 3.
  - Saving one slot rewrites only its own entries and copies the others
    byte for byte. A model this build does not know (synced from a newer
    build) is never erased.
  - An older app version on another device reads the same array and plays
    the same models, as long as it knows them; one it does not know reads as
    unset there, as it does today. So sync needs no migration.
- **Reading a slot:**
  - Advanced is entry 3.
  - Default is entry 1, the baseline tier, and only entry 1: what the row
    shows is what most turns actually run on.
  - If entries 0–2 disagree, because a player set them separately before,
    the Default row says "Mixed" and lists what tiers 0 and 2 run on
    instead, until the next save of Default sets all three.
- **The new default ladder (decision 122).**

  | tier | today | after |
  |---|---|---|
  | 0 | Haiku 5.5, none | GLM 5.3, none |
  | 1 | Haiku 5.5, none | GLM 5.3, none |
  | 2 | GLM 5.3, high | GLM 5.3, the Default effort but at least high (decision 123) |
  | 3 | Sonnet 5.5, xhigh | Sonnet 5.5, xhigh |

  GLM 5.3 always thinks, so `none` goes out as `low`, the cheapest it takes
  (decision 53, as for every model that rejects `none`).
- **Combat's floor (decision 123).** Tier 2 runs at the higher of the Default
  effort and `high`. It's applied where the effective ladder is built, so a
  player who sets Default to `xhigh` gets `xhigh` everywhere.
- **Narration follows Default.** The story-continuation call and the choices
  run on the effective Default model and its effort. On most turns the GM's
  own final round already writes the prose, on that tier's model. The saved
  `narrationModelOverride` and `narrationEffortOverride` are no longer read,
  but they stay in storage and in sync so an older device keeps its choice.

## 3. Where this costs or saves

- **Everyday turns cost more.** They move from Haiku to GLM 5.3 (decision
  122). The turn-cost panel shows the new estimate. For an OpenRouter player
  who never touched Settings, this is the one visible change in their bill.
- **Cheap small calls.** The ambiguity classifier ran on tier 0's model
  (Haiku). Under the new ladder that would be GLM 5.3, a thinking model, for
  a one-word answer.
  - It moves to the side-agent default (Haiku, effort `none`), like every
    other small side call. That keeps it cheap and fast whatever the player
    picks for Default.
  - A player who has no key for that model (a desktop player running both
    slots on their Claude subscription) keeps today's behaviour: the
    classifier runs on the Default slot.
  - The turn-cost estimate prices the classifier the same way.
- **Identical tiers are skipped, not retried.** Once Default fills tiers 0
  and 1 with one model and effort, "one tier up" can be the same call. Two
  engine steps assume it isn't:
  - the Observer's retry of a turn that needed more care, which rolls the
    turn back, spends its one reset and reruns one tier up;
  - the step down after a provider error.
  Both now move to the nearest tier whose model or effort actually differs.
  The step down gives up when none differs, and shows the error as today.
- **What the cap counts.** The cap of 3 a scene counts the GM's own requests
  for the top tier (and the Observer's), not every Advanced call. Session
  zero, a single-enemy fight and deadly stakes put a turn on Advanced
  directly, and every round of such a turn runs there. That is today's
  behaviour; the copy no longer promises more.
- **Players who changed tiers keep their choices.** A saved override in any
  slot is untouched. Only unset slots move to the new defaults.

## 4. The subscription, online play and keys

- **The Claude subscription (desktop only)** works per slot as today. A
  subscription model in Default or Advanced falls back to that slot's default
  on a device without the CLI and during online play (`runsOnThisDevice`,
  decisions 16 and 29). The notice names "Default" or "Advanced" instead of
  "Tier N".
  - For a Mixed Default, it names the tiers that fall back ("Default, tier
    2").
  - The subscription panel's instructions, which point at "a tier or the
    narration voice" and at the Architecture tab, follow the new names.
- **A Z.ai-only player** still has to pick "GLM 5.3 (Z.ai)", but now in two
  places instead of five. Both rows show "No key" until they do. Mapping it
  automatically is out of scope (§6).

## 5. What it touches

The full list goes in the implementation plan. In outline:
- `app/misc/reasoningTiers.ts`: the default ladder; Default/Advanced
  getters and setters over the existing array; narration resolving to
  Default; subscription notices in slot names.
- `app/misc/generation.ts`: the classifier call moves to the side-agent
  model, and the Observer's retry and the error step-down skip identical
  tiers. These are engine changes, so `engine-review` runs.
- `app/misc/turnCostEstimate.ts`: the classifier is priced on the model it
  will run on.
- `app/components/AIConfigTab.tsx`: the new card, Advanced settings, and the
  copy fixes.
- `app/components/ArchitectureSettingsTab.tsx`: the pickers move out.
- `app/story/StoryTurn.tsx`: the tag replaces the badge.
- `TurnCostPanel.tsx`, `ClaudeSubscriptionPanel.tsx`, `ContextViewer.tsx`:
  labels.
- Tests: every test that pins the ladder, the narration voice or the
  classifier (the plan lists them), plus new tests for the slot read/write,
  "Mixed", the combat floor and skipping identical tiers.
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
2. **Combat's floor was the author's call** (decision 123, asked after the
   review).
3. **The classifier moves to the cheap side-agent model.** Otherwise moving
   Default to GLM would put a thinking model on a one-word call. A player
   with no key for it keeps it on Default.
4. **A narration voice someone saved is no longer used** (decision 118).
   It stays stored, so an older device still reads it.
5. **The tier badge becomes an "Advanced" tag**, shown only on Advanced
   turns.
6. **The Architecture tab keeps its explanations** and loses only its
   pickers. The Story Progress check-in interval moves with its picker.
7. **Identical tiers are skipped** by the Observer's retry and the error
   step-down, so a retry is never a reroll on the same call.

## 8. Review

Codex (gpt-6.1-sol, high) reviewed this design and its plan on 2026-10-23.
All 13 findings were checked against the code and kept, none dropped:

- the two definitions of Default (now tier 1 only);
- the test scope;
- the cap's copy;
- the Observer's retry and the error step-down across identical tiers;
- the classifier's cost estimate;
- the notices for a Mixed Default;
- keeping entries this build doesn't know;
- the classifier for subscription-only players;
- the moved pickers' custom-model list;
- refreshing after an incoming sync;
- the shipped effort exception (put to the author, decision 123);
- the subscription panel's instructions;
- the check-in interval.
