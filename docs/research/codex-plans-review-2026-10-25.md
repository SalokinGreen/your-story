# Codex review — the three implementation plans (2026-10-25)

Codex (gpt-6.1-sol, high effort, read-only) reviewed `docs/campaign-format-plan.md`, `docs/judge-layer-v2-plan.md` and `docs/gm-prompt-plan.md` (decision 241) against the code and both prerequisite branches. Verbatim below. All twenty findings were kept and answered in each plan's "Revised after Codex's review" section; none needed the author.

---

Reviewed the current tree and both prerequisite branches. **C**, **J**, and **G** below mean the campaign, judge-v2, and GM-prompt plans. Source paths are under `app/misc/` unless stated. Findings are ranked within the five requested categories.

**1. Wrong assumptions about the code**

1. **Clock events cannot use `success` as execution success.** C slice 1, lines 69–82: graded misses return `success: false` (`gmExecutor.ts:2911`, `:6156`; Fantastic Realms branch `:6709`). Also, `progress_roll` is an action of `manage_track`, not a dispatched tool. **Fix:** extract events from typed result discriminants/outcomes, excluding execution errors, and recognize `manage_track/action=progress_roll`.

2. **The timer compatibility table names the wrong actions.** C slice 1, line 86, delegates to a design table containing `pause`/`resume`; the actual API is `create/advance/toggle_pause/cancel/trigger` (`gmTools.ts:522`, `gmExecutor.ts:5651`). **Fix:** specify translations for every existing action, including early `trigger`, arbitrary legacy capacities, name/ID lookup, and existing result types.

3. **Changing readiness and the modal does not make campaign-only setup work.** C slice 3, lines 169–179: `executeConfirmSetup` independently refuses without a `gm_plan` at `gmExecutor.ts:4077` and constructs a required `plan` payload at `:4082`. Approval immediately calls `executeStartGame` at `:4117`. **Fix:** update that executor, confirmation request types, interaction handlers, and modal together; test approval without any plan note.

4. **The narration builder does not own the conversation.** C slice 2, lines 149–153: `buildStoryContinuationPrompt` returns a string (`ai_staged.ts:2668`); `generation.ts:3712` assembles the GM conversation. **Fix:** replace the actual message assembly, thread the resulting context through `GenerationResult`, and update rewrite callers—including their separate `narrationThoughts` and raw-context inputs.

5. **The proposed setup signature is invalid TypeScript.** G slice 1, lines 43–52 puts required `multiPlayer` after optional `rejected`. Existing callers also include `tests/setupSteps.test.ts:219`, `:238`, besides `generation.ts:3351`. **Fix:** use an options object with defaults and list all callers.

6. **Fantastic Realms’ damage function takes a different shape.** J slice 1, lines 35–42: `foeDamage` accepts `{tier, magnitude}`, while `GMFeatRollResult` contains `{outcome, magnitude}` and currently has no target. **Fix:** add target to parameters, schema and typed result; pass an explicit adapter to `foeDamage`. Match meter `change.requested` and clamping, rather than requiring the observed delta always equal full damage.

**2. Ordering and dependency errors**

7. **The shared order skips prerequisites.** C lines 15–16 orders campaign 1 → judge 1–3, but J slice 3 explicitly requires campaign 2’s narration context. G slices 2–5 require judge 4’s runner; G slice 4 also requires campaign 2. **Fix:** publish one complete dependency graph, placing campaign 2 before judge 3 and judge 4 before behavioural GM slices. Qualify G slice 1’s “no prerequisites” claim for its Fantastic Realms tests.

8. **The dawn judge runs too late to repair mechanics.** G slice 5, lines 125–129 puts detection in the combined judge call, which J runs after narration. The existing repair gate executes inside the GM loop (`generation.ts:3453`) and reserves three remaining rounds (`:3488`). **Fix:** specify a pre-final trigger-evaluation phase that feeds `pendingCheck`, retains previous-turn suppression, and leaves rounds for the Reckoning.

9. **Overlapping edits lack an integration sequence.** All three change `generation.ts`; C3/G1/G3 change setup gates and blocks; C2/J3/G4 change narration and rewrites. G1’s temporary front wording must also be replaced when C1 lands. **Fix:** assign sequential ownership for these functions and require integration checks after each dependent merge. Keep resolved-system roll names in the live block so G2 does not violate the stated cache rule.

**3. Missing implementation contracts**

10. **Clock ticking needs turn-scoped state and execution ordering.** C lines 56–82 specifies per-turn deduplication but applies ticks after batches; `executeGMTools` clones state independently per batch (`gmExecutor.ts:936`). **Fix:** define a turn event ledger passed across rounds, including creation order and consumed trigger keys. Apply events at tool boundaries so pause/create/tick ordering within one batch is preserved.

11. **Several required shapes remain undefined.** C lines 31–56 references `Beat` without fields or completion state. `tickClock(clock, …)` returns portents that live on `Front`, with no supplied front/record. Director moves currently have only `targetTimerId` (`structs.ts:1054`). **Fix:** define beat transitions, portent lookup, clock-target references, style visibility defaults, dangling-reference handling, and migration of all timer statuses.

12. **The existing rewrite machinery bypasses the new confirmation contract.** J slices 2–3 do not explicitly replace the speculative length rewrite, first-major selection, or optional mechanical retry retained on `claude/judges-on-build` (`generation.ts:1278`, `:1411`, `:1638`). **Fix:** route every correction through validated findings → confirmation → one rewrite; implement the approved priority and two-confirmation limit, and prevent tool retries from rerolling executed mechanics.

13. **Confirmation and settings need enforceable schemas.** J lines 101–116 checks missing keys, but omits rejecting the same model family. `ObserverSettings` is presently a record of six flag settings (`observer.ts:154`), so `observerSettings.combined` is not a supported switch. **Fix:** define judge IDs, verdict/fact types, quote and fact-ID validation, family checks, settings migration, hold/precondition registrations, and the measured-precision rule for rewrite defaults. Add the confirming picker to `syncableSettingsKeys.ts`.

14. **Private findings still have player-facing exits.** J slice 3, lines 118–125 covers `observerFlags`, but `app/story/page.tsx:2998` displays `detail` in a toast; `app/story/story.tsx:1113` includes it in the undo tooltip. Originals also retain a private `flag`. Online snapshots send the whole shimmed story (`multiplayer/session.ts:441`). **Fix:** use generic notices throughout UI and strip nested findings from guest snapshots; preserve the separately acknowledged campaign-data leak as its existing gap.

15. **Migration changes which legacy behaviour applies.** C lines 60–67 creates a campaign record for timer-only saves; lines 169–171 and the design’s compatibility promise then leave unclear whether their old beat tools use record or legacy semantics. **Fix:** specify legacy-plan precedence for migrated records and test load → save → sync → reload, including timers plus an existing spine.

16. **The sixth tool registration is misidentified.** C lines 106–108 substitutes `KEEP_WHOLE_TOOLS` for CLAUDE.md’s Observer registration. Its “only read results stubbed” requirement also needs action-sensitive logic before the unconditional keep-whole return (`historyStubs.ts:83`). **Fix:** explicitly document Observer treatment, add params/result unions and schema-array registration, and implement action-aware history rendering.

17. **Authoring and step changes omit construction sites.** C4 names schemas/conversions but not `executeDesignerTool` dispatch or cloning its nested campaign (`designer_executor.ts:197`). G3 adds required `CreationStep.kind` without listing shared steps, Blood & Bone’s helper, Fantastic Realms steps, or fixtures. **Fix:** enumerate those edits and verify rejected Designer writes leave the original draft untouched.

**4. Tests that would miss the claimed failures**

18. **The eval format cannot reproduce the proposed behaviours.** J slice 4, lines 134–153 stores facts, tools and prose, but lacks before/after state for event contracts and GM request/settings inputs for G’s prompt cases. **Fix:** define versioned judge and generation fixtures, corresponding exporters, tool-response scripts, scorers, and a numerical acceptance rule for “beyond noise.”

19. **Existing green tests do not prove the new guarantees.** `tests/gmTools.sixPlaces.test.ts` checks Google/label entries mostly toward the whitelist; an omitted campaign registration can pass. Existing budget fixtures contain no campaign. C’s no-record snapshot cannot establish compatibility after timer migration. **Fix:** add explicit campaign registration assertions, campaign-bearing cache/budget fixtures, multi-round clock tests, prohibited-dice re-ask tests, and continuation/rewrite/guest secret-canary tests.

**5. Unmeasured cost and latency**

20. **“One combined call” is not the implemented request budget.** J separates blocking and background calls, permits further splits, and adds confirmations and rewrite; G adds a pre-final dawn call. Splitting judges does not reduce oversized facts if every call repeats them. **Fix:** specify per-judge fact selection and call ceilings; record total and discarded cost, tokens/cache hits, and p50/p95 time until release for clean, split, confirmed, rewritten, timeout and no-key turns. Include campaign briefs and full thread descriptions in context-budget measurements.