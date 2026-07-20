# Interpreting the Two Research Papers Against the Real Codebase

## What this document is

Two papers now live in this repo, reproduced as supplied:

- `docs/research-paper-architecting-ai-gm.md` — "Architecting the Perfect
  Autonomous AI Game Master Engine: A System-Agnostic Design Paper." Pure
  theory: it never mentions "your-story" and was never meant to. It
  synthesizes prior art (Mythic, Motif, PbtA, Façade, Generative Agents'
  academic lineage, and the LLM-GM failure-mode literature) into a
  five-layer architecture and argues for it in the abstract.
- `docs/research-paper-bridging-theory-to-code.md` — "Bridging Theory to
  Code: Evolving your-story Toward the Five-Layer Architecture." The
  applied follow-up: an attempt to map the first paper's theory onto this
  specific project. Its own caveats section admits it "could not read this
  repo's actual source (blocked by robots.txt)" and inferred this app's
  internals "from a task description alone."

This document is not a summary of either paper — they speak for themselves.
It's an accounting of what happened when their claims met the real code:
what turned out to be exactly right, what turned out to be wrong (and why),
what got adopted, what got deliberately declined, and an honest critical
read of both papers now that there's two full implementation phases of
hindsight. See `docs/five-layer-architecture-changelog.md` for the
blow-by-blow of what was built, and `docs/architecture-frontier.md` for
where this goes next — this document sits between them, explaining *why*
the papers' influence landed the way it did.

## The one idea that mattered most, and held up completely

> "LLM proposes, deterministic engine disposes."

Everything else in both papers — Mythic's Chaos Factor, Motif's stacked
dice, PbtA's bounded move menu, Façade's beat sequencer, Generative Agents'
memory scoring, RPGBench's mechanics-consistency findings, CoC-Seduce's
persuasion-attack benchmark — is different evidence and different
implementation vocabulary for that one sentence. Every mechanism built
across two phases of this session traces back to it without exception, and
it's the one claim from either paper that needed zero revision after
contact with the real code. That's arguably why this effort held together
across a long, multi-session arc without a course-correction on
fundamentals: there was only ever one thesis to stay faithful to; everything
else was translation detail.

## Paper 1, layer by layer: how cleanly the prior art actually transferred

Paper 1 is honest about its own status — "a synthesis, not a fielded
system... no published autonomous AI GM yet implements all five layers."
That honesty held up. Checked against what actually got built:

- **State** (Mythic's Lists — Threads/Characters as both canonical memory
  and a weighted random-draw source) — this layer was already solid before
  either paper was read; `StoryData.npcs`/`threads` arrays, mutated only
  through tool calls, already matched the pattern.
- **Oracle** (Mythic's Fate Chart/Chaos Factor; Motif's three-axis stacked-
  dice oracle) — also already solid (`askFate`/`FATE_CHART`,
  `adjustChaosFactor`, real dice formulas) before this session started.
  Notably, Motif's richer *multi-dimensional* oracle (Answer + Degree +
  Flavor as one roll) was never adopted — this app kept a single
  fate-chart-style yes/no gradient plus separate structured dice, not
  Motif's vector-return design. That's a real, deliberate scope choice, not
  an oversight: the paper offers Motif as a richer alternative pattern, and
  it was implicitly declined in favor of what already worked well.
- **Director** — the layer that *didn't exist at all* before this session,
  and the most literal, mechanism-by-mechanism translation of the paper
  into working code:
  - `selectDirectorMove`'s bounded 4-move menu is PbtA's "bounded action
    menu... make your move, but never speak its name" principle, verbatim.
  - `adjustTension` + `targetTensionForProgress` is Laws'/Freytag's
    hope-fear oscillation target, verbatim.
  - `StoryThread.linkedTimerId`/`threshold` is Harper's "a clock reflects
    fictional state, it doesn't determine it" front-wrapper, verbatim —
    a timer nearing zero surfaces its linked thread; it doesn't
    auto-mutate thread status itself.
  - `couchPlayerFocus` + `playerStyleCounts` is PaSSAGE's player-type
    vector — but *narrowed*, and it's worth being honest about the
    narrowing rather than overselling the connection: PaSSAGE is a learned
    model over Robin Laws' five player types (Fighter, Power Gamer,
    Tactician, Storyteller, Method Actor); `classifyPlayerStyle` and
    `classifyToolActivityStyle` are cheap, deterministic keyword/tool-name
    heuristics over three collapsed buckets (action/social/tactical). It's
    *inspired by* PaSSAGE, not an implementation of it.
- **Adjudication** — `checkNarrationConsistency` (narration-vs-canon check)
  and the M2 roll-invariant gate (rules check: was an outcome authorized by
  the oracle before being narrated?) both map directly onto paper 1's §4.6.
  Two things from that section were *not* built, and it's worth naming
  both rather than letting them blend into "done": paper 1's **safety
  check** (hard Lines, an X-card command) maps to H6, still open by
  explicit product decision, not solved. Paper 1's **scope check** ("did
  the model invent new canonical entities... new entities are allowed only
  through the entity-creation tool") is *structurally* already true in this
  codebase — NPCs and threads are already only created via `add_npc`/
  `create_thread` tool calls — but this was never framed or tested as its
  own adjudication guarantee. There is, honestly, no test today proving the
  model can't narrate a brand-new named NPC into existence in prose without
  ever calling `add_npc`. That's a real, small, previously-unflagged gap
  this re-read surfaced.
- **Memory** — the four-part shape paper 1 asks for (short-term
  context-window management, rolling summarization, long-term RAG,
  a verbatim canonical-fact cache) turned out to already match this app's
  independently-built shape almost exactly: `compaction.ts` (rolling
  summary), `semanticSearchFallback.ts`/embeddings (RAG), and
  unconditionally-injected `character_sheet`/`mechanics` lore (the
  canonical-fact cache) — all three existed, in that shape, before this
  session touched memory at all. This is the layer where prior art and
  existing implementation converged most closely without either side
  copying the other.

## Paper 2's specific claims about this repo, fact-checked

Paper 2's own caveats section names the fact that it couldn't read the
source as its central limitation. Re-checking its load-bearing claims
against the real code confirms that limitation mattered:

**Turned out wrong:**

- *"your-story's zero-knowledge AES-256-GCM design means the server cannot
  read story content"* — flagged by the paper as "the single biggest open
  design question for this migration." **This is false.** No encryption
  feature has ever existed in this codebase (confirmed by a full-repo grep
  during this session: no `encryption.ts`, no encrypt/decrypt functions
  anywhere). The paper didn't invent this claim — it inherited it from this
  project's *own* pre-existing, also-false documentation
  (`docs/story-encryption.md`, `ENCRYPTION_IMPLEMENTATION.md`, and a claim
  on the public privacy policy page), which got corrected as an incidental
  finding during this session's second research pass, independent of
  anything either paper argued for. The lesson isn't that the paper did bad
  research — it's that "verify claims against source" has to include
  verifying the *project's own docs* against source too, not just trusting
  a written description of the system, because a paper working from
  secondhand material will faithfully propagate whatever errors are already
  in that material.
- *"your-story currently does whole-state → one model call → next
  ScenePart"* / *"the naive architecture this literature warns against"* —
  overstated. A fresh audit with real source access found layers 1, 2, and
  (mostly) 4 already substantially implemented in recognizable form before
  this effort began. This was never the "put the whole game in the prompt"
  architecture paper 1 describes as the field's root failure mode — it's
  closer to a partially-built five-layer system than a naive one. Paper 2
  couldn't know that without reading the code, so it defaulted to assuming
  the worst-case architecture paper 1 warns about.
- The recommended **Postgres event-sourcing migration** was evaluated on
  its technical merits (they're sound as generic advice — see
  `docs/event-sourcing-alternative.md`) and declined, specifically because
  it's justified by problems (JSONB filtering at 2000x slower, no audit
  trail, save-state limitations) that aren't actually observed pain points
  in this app. Worth noting in paper 2's favor: it does flag "migration risk
  for existing user data" as a real cost, which is more product-aware than
  most generic architecture advice bothers to be.
- The recommended **Vercel AI SDK / `generateObject` migration** was
  similarly declined. Paper 2 assumes a "fragile plain-text-fallback JSON
  wrapper" that doesn't match this app's actual mechanism — tool-calling
  plus schema validation already provides the structured-output guarantee
  `generateObject` would add, through a different, already-working path.

**Turned out right, and directly actionable:**

- **Generative Agents' recency + importance + relevance memory scoring** —
  adopted close to verbatim: `MemoryEntry.timestamp`/`sceneIndex`/
  `entityIds`/`importance`, reranked in `semanticSearchFallback.ts`.
- **Generative Agents' reflection mechanism** — cited by the paper as part
  of the same design (`reflection fires when cumulative importance crosses
  ~150 points`), but not built in this session's original two phases; it's
  what `reflection.ts` implements in the follow-up strengthening pass,
  scaled to this app's own importance range (0-10 per entry, not the
  paper's absolute-150 threshold) rather than copying the number directly.
- **DeepSeek's `tool_choice` behavior and its content-field fallback bug**
  — this is the single cleanest example in either paper of a claim that
  required *zero* access to this repo's source to be useful, and it turned
  out to be a real, live, previously-undiscovered bug in this exact
  codebase: `tool_choice` actually was hardcoded to `"auto"` in both API
  routes, and DeepSeek actually does intermittently emit a tool call as
  plain text instead of populating `tool_calls`, with no defensive parsing
  anywhere. Both were fixed directly from the paper's citations (a GitHub
  issue number, not a guess about this app) without needing to inspect
  anything else about the codebase first.
- **CoC-Seduce's adversarial-persuasion framing and the imposed-failure-
  rate concept** — directly shaped the M2 roll-invariant gate's design and
  the adversarial-persuasion eval suite (F2/F3), even though CoC-Seduce
  itself is a forward-dated, non-peer-reviewed preprint both papers
  correctly flag as illustrative rather than settled.

## Overall critical read, now that both papers have been tested against code

**Paper 1 is stronger than paper 2, and for a specific, structural reason:**
paper 1 never claims more certainty than it has ("a well-grounded
hypothesis... not a proven blueprint"), while paper 2 makes confident,
specific engineering recommendations (a storage rewrite, a framework
migration) about a codebase it explicitly could not see. The parts of paper
2 that turned out valuable are almost entirely the parts that never
depended on seeing the source in the first place — third-party API
behavior (DeepSeek's tool-calling reliability), academic corroboration of
paper 1's failure-mode claims (RPGBench, sycophancy literature, CoC-Seduce),
and transferable design formulas (Generative Agents' memory scoring). The
parts that *did* depend on knowing this specific codebase — the migration
recommendations, the "naive architecture" characterization, the encryption
claim — needed independent re-verification before being trustworthy, and
mostly didn't survive that verification intact.

**Both papers under-weight one thing neither could actually judge from
outside:** this codebase's own accumulated precedent. The deciding factor
in declining event sourcing and the Vercel AI SDK migration wasn't a
counter-argument from either paper — both proposals are individually
reasonable — it was that this repo has a consistent "extend the existing
model, don't replace its architecture" track record (the same posture that
shaped the H5 typed-dispatch refactor, the inventory deprecation, and
everything else this session touched), and a large rewrite for benefits
nothing currently needs cuts directly against that. That's a values
judgment specific to this project that no system-agnostic paper, and no
paper working from a task description instead of the source, could make on
its behalf. It's also exactly why `docs/event-sourcing-alternative.md`
frames its declined recommendation around "when this would become worth
reconsidering" rather than a flat no — the technical proposal itself was
never wrong, it was just untethered from this project's actual, current
constraints.

**The practical takeaway for future research passes on this project:** a
paper that can cite external prior art and third-party API behavior (DeepSeek
issue trackers, published benchmark papers, academic memory-architecture
formulas) is trustworthy roughly in proportion to how well-cited and
falsifiable those specific claims are — check them, and they mostly hold.
A paper making claims about *this specific codebase's current state*
without having read it is not research about your-story, it's a plausible
guess wearing research's clothing, and needs the same fresh-audit treatment
either way, whether or not it's confidently written.

## Where this leaves things

Both papers have now been fully absorbed: everything worth adopting has
been built (see the changelog), everything worth declining has a reasoned
no on record (`docs/event-sourcing-alternative.md`), and everything worth
pursuing further is scoped in `docs/architecture-frontier.md`. Re-reading
either paper again from scratch shouldn't be necessary — this document, the
changelog, and the frontier doc together are the durable record of what
they actually meant for this project.
