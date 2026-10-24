The author’s concern is justified: **the Observer can replace already-read prose, race with the next turn, and mistake tool execution status for a game outcome.** Decision 185’s typed-action fix is present in both Observer paths; ordinary second-person movement is now explicitly allowed.

No files changed. The findings below distinguish code defects from rubric risks.

The correctness findings, ranked by impact, are:

1. **P1 — Background results can overwrite newer story state or revise the wrong turn.**  
   [generation.ts:1728](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/app/misc/generation.ts:1728) checks only that the captured array position contains an assistant part. Undo followed by Retry can put a different assistant turn at that position. More broadly, the callbacks publish and save their captured `storyData` object—[page.tsx:334](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/app/story/page.tsx:334), also lines 368 and 386—even after another turn has produced newer state. Each tool batch clones state (`gmExecutor.ts:944`) and assigns it back (`generation.ts:3003`), so those objects can diverge. A late callback can republish older mechanics and history.

   **Fix:** make background judging advisory-only. For background annotations, return a patch identified by story ID, part ID, generation ID, and expected content revision; apply it to current state with those checks. Never save a captured whole-story object.

2. **P1 — The nominally blocking Observer does not reliably keep the turn locked.**  
   With Suggested Choices enabled, [page.tsx:2801](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/app/story/page.tsx:2801) finishes choices and calls `checkBothComplete`, which clears `loadingStage` at line 2546. This happens inside `generateStoryTurnOnce`, **before** the outer Observer runs. Streaming has already cleared `loading` at line 2749. The composer can therefore accept another action while the “blocking” judge is still deciding. An Observer rollback can subsequently discard that action.

   Narration is also readable before judging, and `onStoryComplete` enables TTS at line 2760. “Blocking” currently means waiting to return from the function, not withholding publication.

   **Fix:** keep an authoritative turn-running lock through outer `onComplete`; stage callbacks must not release it. If automatic correction remains, judge buffered prose before publishing it or enabling TTS.

3. **P1 — An Observer retry can apply mechanics twice on the legacy reword path.**  
   [page.tsx:4296](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/app/story/page.tsx:4296) reuses an existing conversation specifically because no original pre-turn snapshot exists. Its mechanical changes are already applied. `generation.ts:901` snapshots that **post-mechanics** state; after an Observer reset, line 963 drops the precomputed conversation and runs fresh tools against it. A meter adjustment, resource expenditure, or other mutation can happen again.

   **Fix:** pass an explicit `allowMechanicalRetry` capability backed by a genuine pre-mechanics snapshot. Reword-only calls must never enter the full-turn retry branch.

4. **P1 — Mechanical omissions can be marked corrected by a prose-only rewrite.**  
   At sensitivity ≥8, the two tool-usage checks become major (`observer.ts:1511`, `1526`). If their reset checkbox is enabled, [generation.ts:1426](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/app/misc/generation.ts:1426) sends them through `rewriteFlaggedNarration`; only tier escalation is excluded. The rewrite cannot call `increment_scene` or consult an oracle, yet its flag is removed and recorded as corrected.

   Agency correction has a related hole: removing “you give her the relic” from prose does not undo any note or meter changes that recorded that gift.

   **Fix:** define correction domains explicitly. Length and text-only mistakes may propose prose changes; missing tools and unauthorized state mutations must remain unresolved until their state effects are addressed. Never label a missing tool “corrected” by changing words.

5. **P1 — Any nonempty rewrite is accepted as authoritative narration.**  
   [observer.ts:949](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/app/misc/observer.ts:949) returns trimmed content without checking truncation, tool calls, refusal text, leaked markup, or whether the requested correction succeeded. The normal narration pipeline performs cleanup that this path bypasses. The caller then replaces prose and reconciles saved GM history around that unverified output.

   **Fix:** validate the response envelope, reject tool-bearing/truncated/refusal responses, and apply the normal narration cleanup. Preserve the original on validation failure. A successful HTTP response is insufficient evidence to mark a flag corrected.

6. **P2 — Outcome checking receives false verdicts and combines unrelated checks.**  
   [observer.ts:1330](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/app/misc/observer.ts:1330) selects every `calculate` result by name. But arithmetic-only calculations return `success:true` (`gmExecutor.ts:1904`), and evaluation errors return `success:false` (`1798`). They reach the judge labeled **SUCCESS** or **FAILURE**.

   The turn-wide mixed-result cap at `observer.ts:1335` also conflates independent checks. One successful attack and one failed escape make every mismatch minor, even if the prose completely reverses the escape. Conversely, a single engine `weak_hit` has `success:true`, so it does not receive that protective cap.

   **Fix:** supply typed verdicts containing execution status, actor, check ID, outcome tier, and outcome grouping. Include `calculate` only when a valid comparison exists and represents adjudication. Determine mixed outcomes per check group, not across the entire turn.

7. **P2 — Rewrite choices ignore the player’s setting and have another next-turn race.**  
   [generation.ts:1527](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/app/misc/generation.ts:1527) regenerates choices even when `skipChoices` is true. Thus a rewrite makes an unwanted choices call and can display suggestions the player disabled.

   In the background path, `stillNewest` is checked **before** awaiting choices (`1716`). While awaiting, the player can advance; the generic `onChoicesComplete` callback then writes choices to whichever part is last (`page.tsx:2803`) and changes the current choices UI.

   **Fix:** respect `skipChoices`; make derivation return data without UI side effects. Recheck the exact part ID and revision after awaiting, then commit atomically.

8. **P2 — Length-judge infrastructure failure becomes permission to rewrite or reroll.**  
   [observer.ts:733](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/app/misc/observer.ts:733) retains the major deterministic length flag when the justification call fails or its JSON is invalid. If the rewrite also fails, `generation.ts:1558` rolls back and reruns the entire turn. A provider outage can therefore change dice results because prose was long.

   Cancellation is swallowed by the Observer helpers’ broad catches too, although `callSideModel` deliberately rethrows `AbortError`.

   **Fix:** treat unavailable judgment as “unknown/advisory”; retain completed dice and state. Propagate cancellation and check it before any commit or retry. Remove automatic mechanical rerolls as a prose-repair fallback.

9. **P2 — Editing settings mutates the supposedly fixed defaults.**  
   [layerSettings.ts:323](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/app/misc/layerSettings.ts:323) returns `DEFAULT_OBSERVER_SETTINGS` directly when nothing is stored. `setObserverCheckSetting` then assigns into that object at line 349. The first edit changes the exported defaults for the current session; Reset removes storage but returns those mutated defaults.

   Separately, `ArchitectureSettingsTab.tsx:421` assumes every default has `triggersReset:true`, so the default-off reset flags make the pristine configuration look customized.

   **Fix:** always return a fresh deep copy, freeze the default object, and compare UI values against each type’s actual defaults.

10. **P2 — Correction priority favors verbosity over correctness.**  
    [observer.ts:1759](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/app/misc/observer.ts:1759) orders flags length → agency → outcome → tool usage → tier. `generation.ts:1363` takes the first eligible major flag. A long turn can spend the sole correction on shortening while a more consequential outcome or tier flag survives. The speculative rewrite receives conditional instructions about other checks, but does not know their actual findings.

    **Fix:** prefer retaining the completed turn with explicit diagnostics. If corrections remain, select by correction domain and impact; give the rewrite the actual applicable findings. Do not infer that a preventive prompt fixed them.

The rubric risks below are inferred from the prompts; they are **not measured live-model false-positive rates**.

| Check | Concrete legitimate narration at risk | Why it can be misjudged; concrete fix | Does it earn its call? |
|---|---|---|---|
| **`response_length`** — [observer.ts:983](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/app/misc/observer.ts:983) | A 180-word account beginning “The queen finally tells you why your father disappeared,” after the player previously requested the full story and now says “Go on.” | The judge sees the current line and narration, without the history establishing that the explanation was requested or earned. Default hard trips are >90/170/340 words for short/medium/long. Use the existing free pacing feedback; make shortening player-invoked. | **Remove the LLM judge from defaults.** |
| **`player_agency`** — [observer.ts:1098](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/app/misc/observer.ts:1098) | “‘Agreed,’ you say, handing over the toll,” after prior authorization; or “Terror grips you as the fear spell takes hold.” | Current-action-only context loses earlier consent. The judge also lacks tool results/mechanics needed to recognize compelled emotional effects. Default sensitivity expressly includes borderline cases. Supply relevant prior consent and imposed effects; require an exact offending quote and an unambiguous new decision. “You walk the gravel…” is now explicitly allowed. | **Default-off; opt-in flag-only**, sensitivity 0–2. |
| **`outcome_narration_mismatch`** — [observer.ts:1229](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/app/misc/observer.ts:1229) | “The ogre’s blow lands. You fall,” following a successful **ogre** check; “You still cannot afford passage,” after arithmetic calculates the remaining gold. | Boolean labels lack explicit actor/outcome structure; arithmetic is mislabeled. Mechanics are clipped to 2,500 characters, potentially omitting the governing exception. Fix typed evidence first; judge each actual outcome in its actor’s frame. | **Worth retaining as flag-only after that fix.** |
| **`missing_oracle_or_table`** — [observer.ts:1415](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/app/misc/observer.ts:1415) | “The tomb contains a bronze key,” established in a lore note; “The omen is a broken crown,” selected from a table note using `formula_roll`. | The judge gets narration and clipped mechanics, not the relevant lore, action, or actual tool evidence. Its whitelist excludes table-note rolls. Conversely, even a **failed** `roll_table` suppresses the check because only names are inspected (`1483`). Remove the generic invention judge; any system-specific check needs successful, relevant evidence. | **Remove the generic judge.** |
| **`missing_scene_increment`** — [observer.ts:1419](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/app/misc/observer.ts:1419) | “You cross the tavern into its pantry.” | The rubric treats a new location as a scene change; the tool describes a **major** transition (`mythicTools.ts:17`). A pantry step can trigger an unnecessary randomized scene interruption. Give it prior scene context and the adventure’s boundary rule; never fix this by prose replacement. | **Default-off; optional flag-only** for systems that require scene accounting. |
| **`tier_escalation_missed`** — [observer.ts:1567](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/app/misc/observer.ts:1567) | “One wrong word could plunge the kingdom into war.” | Dramatic stakes do not prove inadequate adjudication. The judge sees neither the tool reasoning nor evidence of an actual error. It can demand a reroll of a correct result. Use pre-turn routing and observed execution failures instead. | **Remove the retrospective judge.** |
| **Deterministic consistency** — [consistencyCheck.ts:49](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/app/misc/consistencyCheck.ts:49) | “Marcus is dead. Ada arrives with the news.” Also “Marcus never arrives.” | Any active-presence phrase within 60 characters after the name counts, regardless of subject, sentence boundary, or negation. Restrict matching to the named subject’s clause; suppress negation/retrospective contexts. | **Keep free, diagnostic-only**, without routine player toasts. |

Cost and routing have some sound foundations, but the defaults buy many low-value judgments:

- **Ordinary eligible turn:** usually three calls—agency, the shared tool-gap judge, and tier escalation. An adjudicated outcome adds one; excessive length adds one: **up to five judge calls per attempt**. Oracle and scene checks share a call. Session-zero suspension skips them. Background execution saves waiting time, not money. See [observer.ts:1711](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/app/misc/observer.ts:1711).
- Judges default to **Haiku 5.5**, effort `none`; missing-provider-key fallback uses the effective narrator. Rewrites default to the narrator, currently the Default slot, while an Observer pin changes **both judging and rewriting**. These resolutions are implemented coherently in [layerSettings.ts:264](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/app/misc/layerSettings.ts:264).
- Judges request 200 output tokens, but the provider’s always-thinking floor raises the budget to **4,096**, shared with reasoning (`providerCall.ts:376`, `1103`). That is a cap, not measured consumption. The repeated narration/context inputs also matter; rewrites resend the turn’s full conversation.
- The speculative shortening call starts before justification ([generation.ts:1257](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/app/misc/generation.ts:1257)). A justified long response can therefore incur a full, discarded rewrite. **Remove speculation by default.**
- Successful side calls are recorded with their originating turn ID. However, [sideModelCall.ts:186](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/app/misc/sideModelCall.ts:186) records only after receiving readable JSON. An aborted speculative request has no entry even if provider work was billable. **Record attempted/cancelled calls as cost-unknown and reconcile usage where available; do not imply zero cost.**
- The estimate assumes one call per enabled check, double-counts the shared gap judge, omits runtime key fallback, and budgets rewrites even when no check may correct anything: [turnCostEstimate.ts:354](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/app/misc/turnCostEstimate.ts:354), lines 461–501. **Derive estimates from the same eligibility/routing logic as execution**, including speculation and conditional choice regeneration.

There are three significant player-visible problems:

- **Published text changes underneath the player.** This is deliberate in the background path, not just a rendering accident. The warning appears only during `loadingStage === "story"` ([story.tsx:1267](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/app/story/story.tsx:1267)); it does not cover a late background revision. **Make published turns immutable; offer an explicit revision preview.**
- **“Undo revision” is unavailable for an older revised turn.** Background rewriting can change an earlier part, but restoration operates only on the latest part (`page.tsx:4717`), and earlier turns offer Edit only (`story.tsx:1035`). The toast’s recovery instruction can therefore be unusable. **Prevent automatic historical revision; any explicit revision needs restoration attached to that exact turn.**
- **Thinking folds expose GM secrets.** [turnTimeline.ts:407](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/app/misc/turnTimeline.ts:407) turns native reasoning into expandable player content. [StoryTurn.tsx:104](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/app/story/StoryTurn.tsx:104) renders the raw detail. `read_notes` results can contain explicitly hidden lore (`gmExecutor.ts:3532`) and are also expandable; hiding `gm_roll` alone does not protect those secrets. **Keep raw reasoning and GM-only tool results in an explicit debug view; show ordinary players sanitized roll summaries.**

The Settings UI also understates these behaviors: it calls response length free despite its justification call (`ArchitectureSettingsTab.tsx:381`), describes only the “last roll” despite turn-wide checking (`110`), and labels the correction control merely “reset” despite permitting late prose replacement (`543`). **Separate Off / Flag-only / Propose revision, display the effective judge and rewrite models, and disclose conditional calls.**

I reproduced the defaults mutation, arithmetic-as-SUCCESS input, and cross-sentence consistency false positive using actual functions transpiled in memory. Vitest could not execute because this read-only sandbox denies its temporary-directory writes.

**Recommended defaults:** all automatic rewrites and mechanical retries off. Enable only `outcome_narration_mismatch`, flag-only at sensitivity 2, **after** fixing typed verdict inputs; disable it until then. Default the other five judges off. Keep deterministic pacing and consistency diagnostics, with routine warnings confined to debug tools.