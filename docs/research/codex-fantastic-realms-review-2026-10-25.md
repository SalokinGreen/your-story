# Codex review — Fantastic Realms design (2026-10-25)

Codex (gpt-6.1-sol, high effort, read-only) reviewed `docs/fantastic-realms-design.md` at commit 42b78968 (decisions 201–215) against the system code. Its answer, verbatim below; how each finding was handled is the table in the design's §9. Findings 1, 2 and the XP half of 11 needed the author: decisions 216–218. Nothing was dropped.

---

Decisions 201–215 can stand. The design still has the following gaps, ranked by severity. No files changed.

1. **High — Combat damage is ambiguous.** Design §§2.1, 2.4, 2.6 use “hit” for both a successful die and a result tier. Foe hearts are “how many hits,” but damage follows tiers; weak-hit damage is unspecified. Add an explicit damage table—for example, miss 0, weak 1 plus cost, hit 1, strong 2, then +1 per magnitude. State whether DC 1 automatic success inflicts ordinary-hit damage. Give numerical harm defaults for misses and weak hits.

2. **High — Initiative has no executable meaning.** §2.6 orders heroes before/after foes, yet foes act only through failed or weak player rolls. What happens when a foe “goes first”? Define that beat explicitly: for example, the foe presents a threat, the slower hero rolls to answer it, and consequences follow that result. Specify initiative frequency and ordering across multiple heroes/foes; preserve decision 212’s formula.

3. **High — Tool resolution can change unexpectedly or lose existing behavior.** §5.1 assumes note membership is stable. `app/misc/systems/resolve.ts:24` actually selects the first matching system from any imported built-in note, with explicit tools-on/off overrides. Mixed packs, imports or deletions can change resolution. Persist system selection, derive it once for old saves, and specify mixed-pack handling. Preserve tools-off and legacy tools-on-without-a-system behavior; retain Blood & Bone’s four tools unchanged.

4. **High — Heart growth exceeds the existing meter boundary.** §5.2 describes Hearts 0–3 and raising its cap. `app/misc/metersAndTracks.ts:224` rejects caps above `max`; every meter also requires a finite maximum, including XP and Level. Define those bounds and an FR-specific operation that grows Hearts’ `max` and `cap` together. Specify whether gained capacity also heals. Keep Blood & Bone’s bounded meters unchanged.

5. **High — A typed result alone never reaches the outcome judge.** §5.2 omits hardcoded filtering in `app/misc/observer.ts:1397` and `:1576`. Existing tiers lack ordinary “hit” and magnitude; mapping it to `success` also inherits a comparison-specific label. Extend extraction, filtering, labels and verdict payloads together. Preserve magnitude and distinguish engine errors from genuine misses, following `executeActionRoll`’s semantics.

6. **High — The promised note-update hook is Blood & Bone-specific.** §5.3 says to reuse `addMissingBuiltinNotes`, but `app/misc/systems/builtinNotes.ts:39` requires Blood & Bone’s exact core ID; setting logic also defaults to Europe by Night and `cross-europe`. Declare core identity and update scope per system. Preserve deleted-note suppression, existing-note contents and all Blood & Bone setting behavior.

7. **High — Burn identity and visibility are undefined.** §§5.2–5.3 combine free-text feat names, durable burns and editable sheet prose. Renaming or sharpening a burned feat can bypass string matching; duplicate spelling variants can inflate pools. Define stable hero/feat identities, validate ownership separately from applicability, and expose burns in the live state and mid-turn state summary. Explicitly state that a base-only 1d6 pool cannot burn: burning requires an applicable, unburned feat.

8. **Medium — Persistence and roll lifecycle need contracts.** §5.2 gives no missing-state initialization, cancelled-roll behavior or manual-dice input. Mirror `action_roll`’s validated manual faces and shared physical-roll helper; record burns only after a completed roll. Add optional, backward-compatible FR state. Verify save/load, sync and Undo preserve it. Existing sync transports whole story blobs; this needs compatibility handling, not a separate sync service.

9. **Medium — Session-zero hooks do not initialize characters automatically.** §§2.8, 5.3 name creation steps and a meter set without requiring its creation. Blood & Bone explicitly instructs `manage_meter create_set` during creation and repairs missing meters in its core. Require the same per-hero initialization for full, quick, premade and joining characters. Define step scopes/hints. Also adapt the shared `history` hint in `app/misc/setupSteps.ts:74`, which currently asks supernatural-transformation questions, while preserving Blood & Bone’s version.

10. **Medium — Foe DCs can double-count words.** §§2.4, 2.6 supply a DC, then say *Armored* raises it; initiative uses “its DC.” Specify whether printed DC already includes permanent words, which situational modifiers apply, and which DC initiative uses. Keep final rolled DC within 2–6. State how multiple harm words combine.

11. **Medium — Party rewards and rest targets are unspecified.** §§2.7, 5.2 leave XP sharing, repeated reward sources and “every hero” unresolved. Specify recipients and allocation, use persistent reward IDs to prevent duplicate awards, and define which heroes participate in a rest. Record the current realm so `take_rest()` can return the correct condition.

12. **Medium — Sharpening contradicts the settled level reward.** §2.7 permits sharpening *instead of* gaining a feat; decision 209 grants a new feat. Keep sharpening as optional wording refinement while still granting the new mechanical feat.

For readability, fix only two further obstacles: replace “a hit” with “successful die” or “Hit result” consistently, and replace §9’s “Nothing is open” with the remaining specification items above. A worked combat example would make damage, burning and initiative substantially easier to follow.