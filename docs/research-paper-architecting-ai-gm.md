<!--
Source paper #1 of 2 behind docs/five-layer-architecture-changelog.md,
docs/architecture-frontier.md, and docs/research-papers-interpretation.md.
Reproduced as supplied to this project; original filename
"Architecting_the_Autonomous_AI_Game_Master__A_FiveLayer_System.md".
-->

# Architecting the Perfect Autonomous AI Game Master Engine: A System-Agnostic Design Paper

## TL;DR

- **Build a deterministic orchestration layer that treats the LLM as a fallible creative co-processor, not the seat of authority.** The single most important decision is a strict separation of concerns in which canonical state, randomness/fate, pacing logic, memory, and rule enforcement all live OUTSIDE the model in deterministic software; the LLM is invoked via tool calls only to (a) propose narration and interpret abstract prompts and (b) request state reads/writes — it never decides what is true, what succeeds, or what happens next.
- **The oracle/state layers exist specifically to defeat the LLM's documented, well-measured failure modes** — sycophancy ("yes-man" GM that never lets players fail), memory loss/narrative drift, state contradiction, rule hallucination, and auto-success — every one of which is a direct consequence of putting authority inside the model.
- **Mythic and Motif already prove the core pattern:** a good GM decision decomposes into an external, weighted, multi-dimensional random draw plus a contextual interpretation step. The deterministic engine owns the draw; the LLM owns the interpretation. The entire computational-narrative tradition (Oz Project, Façade, narrative mediation, PaSSAGE) confirms coherent interactive drama requires explicit external structure around whatever generates the surface text.

---

## Key Findings

1. **The naive architecture behind AI Dungeon and its successors — "put the whole game in the prompt and let the model run it" — is the root cause of the field's chronic failures.** AI Dungeon's own help documentation concedes the AI "forgets or mixes things up" [AI Dungeon](https://help.aidungeon.com/faq/why-does-the-ai-forget-or-mix-things-up) as context fills; the fix is architectural, not prompt-engineering.
2. **LLMs are structurally biased toward leniency and agreement**, making them poor adjudicators. Sharma et al. (Anthropic, "Towards Understanding Sycophancy in Language Models," arXiv:2310.13548, ICLR 2024) demonstrate that "five state-of-the-art AI assistants consistently exhibit sycophancy across four varied free-form text-generation tasks," [arXiv](https://arxiv.org/abs/2310.13548) traceable to RLHF preference data.
3. **The academic consensus is that LLMs excel as GM *assistants*, not autonomous engines** — precisely because they lack external state and adjudication. This is the gap the engine architecture must fill.
4. **Solo GM emulators (Mythic, Motif) are the highest-value prior art**, having already solved "surprising-yet-coherent GM decisions from an external oracle plus an interpreting intelligence." Substitute the LLM for the human interpreter and every other primitive transfers.
5. **A five-layer separation-of-concerns design — state, entropy/oracle, director, memory, adjudication — with an "LLM proposes, deterministic engine disposes" tool-call contract resolves each documented failure mode by removing authority from the model.**

---

## Details

## 1. Transferable Design Primitives from Mythic and Motif

The two GM emulators the user extracted are the most important prior art because they already solve, on paper, the exact problem an autonomous AI GM faces: **how to produce surprising-yet-coherent GM decisions from an external, mechanical oracle plus an interpreting intelligence.** In a solo emulator, the human is the interpreter; in our engine, the LLM is the interpreter. Everything else transfers.

### 1.1 Mythic GME 2e (Tana Pigeon / Word Mill Games)

- **The Fate Question and Fate Chart.** Every uncertain question is phrased as a yes/no question, assigned player-set Odds (from "Impossible" to "Has to be"), cross-referenced against a global Chaos Factor, and rolled on a d100 to yield a gradient: *exceptional yes / yes / no / exceptional no*. **Primitive that transfers:** a structured, externally-computed probability gate for every uncertain proposition, returning a graded (not binary) answer. This is the antidote to LLM sycophancy — the answer to "do the guards notice?" comes from dice, not from the model's urge to please.
- **The Chaos Factor (1–9).** A dynamic control knob and feedback loop measuring how much control the protagonist has. Per Mythic GME 2e (Word Mill Games, January 2023), the Chaos Factor "starts at 5, and at the end of the scene goes one up or one down, depending on the degree of control the PCs have after the scene." It rises when scenes end chaotically/out of the PC's control and falls when scenes end calmly; higher chaos → more "yes" answers, more random events, more interrupt scenes. **Primitive that transfers:** a single scalar, updated during end-of-scene bookkeeping, that simultaneously governs probability of success, event frequency, and tempo. This is a ready-made **director-layer state variable**.
- **Random Events via Event Focus + Meaning Tables.** When a random event fires (on doubles where the single digit ≤ Chaos Factor), an Event Focus table locates it (e.g., "NPC action," "move toward a thread") and abstract Meaning word-pair tables (Actions / Descriptions / Elements) supply raw content that MUST be interpreted in context. **Primitive that transfers:** deliberately abstract prompts force creative interpretation from context — exactly the task LLMs excel at, and a way to inject genuine novelty the model would not have generated on its own.
- **Scenes tested against Chaos.** An Expected Scene is envisioned, then tested against the Chaos Factor; it may proceed, become an Altered Scene, or be replaced by an Interrupt Scene. **Primitive that transfers:** scene framing is a discrete, testable unit, and expectations are subject to mechanical subversion.
- **Lists (Threads and Characters) as persistent tracked state that double as random tables.** Threads = open goals/plots; Characters = NPCs. **Primitive that transfers:** the same authoritative data structure serves both as canonical memory and as a weighted random-draw source for "who/what shows up."
- **The core loop: Expectation → Question → Interpretation, grounded in Context.** This is the master pattern for balancing coherence with surprise.

### 1.2 Motif Story Engine (Peter Casey / Thought Police Interactive)

- **Layered "Core Oracle System" of stacked dice.** Three 6-sided dice each act as an independent oracle: an **Answer Oracle** (yes/no/maybe), a **Degree Oracle** (scope/scale — "a little" vs. "a lot"), and a **Flavor Oracle** (Favorability, Weirdness, Danger, Rarity). **Primitive that transfers:** a single roll returns a multi-dimensional result, giving the interpreter far richer raw material than a binary yes/no. An AI GM's oracle should return a *vector*, not a bit.
- **Themes weight oracle outputs.** Genre/dramatic themes are given heavy weight, biasing results toward a chosen tone. Explicit design priorities: **Theme-Weighted, Fiction-Forward, Story-Focused, Protagonist-Centered.** **Primitive that transfers:** a configurable weighting layer that tilts the entropy source toward the intended genre/tone without eliminating surprise.
- **Question phrasing is load-bearing; oracles are context-dependent.** Motif explicitly notes that how you phrase the question determines the usefulness of the answer. **Primitive that transfers:** the engine must own the discipline of question formulation (or validate the model's) rather than trusting free-form querying.
- **"Eyes Wide Open" (assign flavors after the roll) and shifting numbers.** Flexibility in binding meaning to results. **Primitive that transfers:** separation of the random draw from its semantic interpretation.
- **GM-lite "shared moderation."** Authority is distributed rather than monolithic.

### 1.3 Synthesis: what these two prove

Together, Mythic and Motif demonstrate that **a good GM decision can be decomposed into (i) an external, weighted random draw producing a graded, multi-dimensional result, and (ii) a contextual interpretation step.** They also prove that **abstraction is a feature**: the vagueness of Meaning Tables is precisely what forces creativity. For an AI GM engine, this maps cleanly: the deterministic engine owns (i); the LLM owns (ii). The Chaos Factor proves a single feedback-controlled scalar can govern pacing, stakes, and surprise at once. These are the load-bearing ideas of the entire architecture.

## 2. Theory: What a Human GM Actually Does

To replace a GM, we must enumerate the GM's functions and decide, for each, whether it is delegated to the LLM, owned by deterministic code, or shared.

### 2.1 Agenda, Principles, and Moves (Powered by the Apocalypse)

Apocalypse World (D. Vincent Baker) codifies the GM ("MC") role as an explicit, exhaustive rulebook, not vague advice. The **Agenda**: "Make Apocalypse World seem real; Make the players' characters' lives not boring; Play to find out what happens." The MC is explicitly instructed NOT to pre-plan a storyline. There are **Principles** (e.g., "Barf forth apocalyptica," "Address yourself to the characters, not the players," "Make your move, but never speak its name," "Be a fan of the players' characters," "Ask provocative questions and build on the answers," "Think off-screen too") and concrete **Moves** (e.g., "Announce future badness," "Separate them," "Capture someone," "Trade harm for harm"). Dungeon World adapts the same three-part model.

The crucial insight for our engine: **PbtA already expresses the GM as a rule-following state machine with a bounded action menu.** GM moves are triggered by fiction (a failed player roll, a lull, a "golden opportunity") and selected to advance the situation. This is directly implementable as a deterministic **move-selection policy** in the director layer, with the LLM rendering the chosen move into prose ("never speak its name"). "Play to find out what happens" is, notably, an explicit design instruction against railroading — the engine should not have a predetermined plot.

Another PbtA principle is load-bearing here: the MC makes decisions AFTER the roll (fitting consequences to the result) rather than before, and plays "with integrity and an open hand" — never fudging, never chiseling players out of earned outcomes. This is the honesty contract an AI GM must mechanically enforce against its own sycophantic tendencies.

### 2.2 Clocks and Fronts (Blades in the Dark / Apocalypse World)

A **progress clock** (John Harper, Blades in the Dark) is a circle divided into segments used, in Harper's words, to "track ongoing effort against an obstacle or the approach of impending trouble." [Blades in the Dark](https://bladesinthedark.com/progress-clocks) Clocks are made about the *obstacle*, not the method; complexity sets segment count — Harper specifies "a complex obstacle is a 4-segment clock. A more complicated obstacle is a 6-clock. A daunting obstacle is an 8-segment clock." [Blades in the Dark](https://bladesinthedark.com/progress-clocks) Clocks can be linked, opposed (racing clocks), or tug-of-war. A clock "is like a speedometer… it shows the speed; it doesn't determine the speed" [Blades in the Dark](https://bladesinthedark.com/progress-clocks) — it reflects and communicates fictional state. In Apocalypse World, **Fronts** bundle threats with their own **countdown clocks** as a campaign-level pacing tool.

For our engine, clocks are the single most important **deterministic pacing and escalation primitive**. They are trivially represented as integer counters in the state DB, ticked by rules (not vibes), and they externalize tension so the model cannot simply forget that the alarm was rising. Clocks are how the director layer imposes genuine, inexorable stakes.

### 2.3 Beat Theory and Pacing (Robin Laws; Freytag)

Robin Laws' *Hamlet's Hit Points* (2010) analyzes stories as sequences of **beats**, principally **procedural** (advancing toward a practical goal) and **dramatic** (emotional conflict), plus specialized beats: commentary, anticipation, gratification, bringdown, pipe, question, and reveal. Each beat moves the audience's emotional state up (hope) or down (fear); good pacing oscillates hope and fear. Laws maps these to RPGs: combat is procedural, interaction is dramatic, exploration is informational. [Sly Flourish](https://slyflourish.com/deep_dive_with_robin_laws.html) His practical advice — "Are players having an easy time? Drop in a hard move. Having trouble? Give them a break." [Sly Flourish](https://slyflourish.com/deep_dive_with_robin_laws.html) — is a **closed-loop pacing controller** almost identical in spirit to Mythic's Chaos Factor. Freytag's pyramid (exposition, rising action, climax, falling action, dénouement) supplies the macro tension curve a drama manager can target.

**Transfer:** the director layer should maintain an explicit hope/fear (tension) estimate and target an oscillating curve, choosing beat types to move it — the software analog of both Laws' advice and Mateas & Stern's tension-driven beat sequencing (see §3).

### 2.4 Spotlight, Social Contract, and Safety Tools

Human GMs manage **spotlight** (ensuring every player gets meaningful screen time) and uphold the **social contract**. **Safety tools** — Lines & Veils (Ron Edwards; lines are hard exclusions, veils are fade-to-black), the **X-Card** (John Stavropoulos; anyone taps to remove content, no explanation required), Script Change (rewind/pause/fast-forward, Brie Sheldon), and check-ins — are consent infrastructure. These automate cleanly: lines become hard content filters enforced deterministically; veils become style constraints; the X-card becomes an always-available player command that triggers an immediate deterministic retcon/redirect and cannot be overridden by the model.

### 2.5 Illusionism, the Quantum Ogre, and Agency

The **quantum ogre** (coined by Hack & Slash, 2011) names the practice of making the same prepared encounter occur regardless of player choice — the encounter exists in superposition until the players choose, then appears whichever way they go. The debate clarifies a rule an AI GM must respect: a choice is only meaningful if players have **information** that distinguishes the options and their choice is honored in consequence. As practitioners note, illusionism (GM force hidden from players) "is fine as long as it's done well… but when it fails, it is a very bad failure." For an autonomous engine, the safer posture is **prep situations, not outcomes** — maintain a live world model of factions, agendas, and clocks, and let outcomes emerge, rather than forcing a scripted plot. This is also exactly "play to find out what happens."

### 2.6 Rulings, Meaningful Failure, and Stakes

Human GMs make **rulings, not rules** for edge cases, and preserve **meaningful failure** — the possibility of loss, including character death, is what makes success matter. This is the precise capability LLMs most lack (see §3.4). The engine must *manufacture* stakes mechanically because the model will not impose them on its own.

## 3. Computational Narrative & Interactive Drama: The Research Lineage

An autonomous AI GM is a **drama manager / experience manager** in the sense the AI research community has used for 30 years. The engine designer is re-implementing this literature with an LLM as the natural-language surface.

### 3.1 Drama Management and Believable Agents (Oz Project, Façade)

The CMU **Oz Project** (Joseph Bates et al.) established the "believable agent" — an autonomous character exhibiting rich personality — and the split between **local** character behavior and **global** drama management. **Façade** (Michael Mateas & Andrew Stern, 2003) is the landmark: a fully realized interactive drama whose **drama manager sequences dramatic "beats"** (the smallest unit of dramatic action) to target a desired **tension curve** (Aristotelian rising action toward catharsis), while behavior for the characters Grace and Trip was authored in **ABL** (A Behavior Language, derived from Oz's Hap). Crucially, Façade's drama manager chose beats "based on a desired curve (and believed current state) of the tension level." [Ucsc](https://grandtextauto.soe.ucsc.edu/2008/03/17/ep-85-facade/)

**Transfer:** this is the direct ancestor of our director layer. Replace ABL-authored beats with LLM-rendered beats, but **keep the deterministic beat sequencer and tension model outside the model.** Façade proves the architecture works; the LLM simply makes the content authoring cheap.

### 3.2 Narrative Planning and Mediation (Riedl & Young)

Mark Riedl and R. Michael Young's **IPOCL** (Intent-based Partial Order Causal Link planner, JAIR 2010) generates stories that are both **causally coherent** and **character-intentional** — every action both advances the plot and is explicable as a character pursuing a goal. [Journal of Artificial Intelligence Research](https://jair.org/index.php/jair/article/view/10669) **Narrative mediation** (and later "experience management") addresses the **narrative paradox / boundary problem**: the conflict between player agency and authorial control. When a player acts to violate the author's plan, the system either **accommodates** (finds a new valid plan) or **intervenes** (fails the action's effect) — preserving player freedom without breaking authorial goals. Later work frames this as adversarial search against "narrative dead-ends" (softlocks), not against the player.

**Transfer:** the engine should treat authorial goals as *soft constraints on a live plan*, using mediation logic: when the LLM proposes narration that would break a canonical fact or strand the plot, the validation layer rejects/rewrites rather than letting canon drift. IPOCL's lesson — characters need legible intentions — argues for a deterministic NPC goal/agenda store the model must consult.

### 3.3 Player Modeling (PaSSAGE) and Story Grammars (Propp)

**PaSSAGE** (Thue, Bulitko, Spetch & Wasylishen, AIIDE 2007) learns a **player model** — a vector over Robin Laws' player types (Fighter, Power Gamer, Tactician, Storyteller, Method Actor) [Georgia Tech](https://faculty.cc.gatech.edu/~riedl/pubs/aamas12.pdf) — and selects story content to match, demonstrated in Neverwinter Nights. This is the empirical basis for a **player-model component** in the director layer that adapts pacing/spotlight to observed play style. **Propp's Morphology of the Folktale** (31 character functions; dramatis personae) and story grammars (Rumelhart) provide genre-structural scaffolds; classic generators **TALE-SPIN** (character goals), **MINSTREL** (author + character goals, "TRAMs"), **MEXICA** (engagement-reflection cycle driven by a tension curve), and **BRUTUS** show the long arc from pure planning to emotion-curve-driven generation. The recurring lesson across all of them: **explicit structure (goals, functions, tension curves) is what keeps generated narrative coherent** — precisely what an LLM lacks internally.

### 3.4 LLMs as Game Masters: State of the Art and Documented Failure Modes

- **CALYPSO** (Zhu, Martin, Head & Callison-Burch, Proc. AAAI AIIDE 2023, 19(1):380–390, arXiv:2308.07540) is the most-cited academic LLM-GM system. Its central finding is telling: LLMs work best as **DM's assistants / co-DMs**. In the authors' words, "DMs reported that it generated high-fidelity text suitable for direct presentation to players, and low-fidelity ideas that the DM could develop further while maintaining their creative agency." [AAAI Publications](https://ojs.aaai.org/index.php/AIIDE/article/view/27534) [arxiv](https://arxiv.org/pdf/2308.07540) The related D&D-as-dialogue work (Callison-Burch et al., 2022) found that **local game-specific state context is essential for grounded generation** [arXiv](https://ar5iv.labs.arxiv.org/html/2308.07540) — i.e., the model needs external state. Zhu et al. also instrumented a **game-state tracker** to feed the model concrete stats.
- **RPGBench** (Yu, Shen, Meng et al., arXiv:2502.00595, Feb 2025; NeurIPS 2025 Workshop on Scaling Environments for Agents) is the first benchmark evaluating LLMs as RPG *engines* (Game Creation + Game Simulation). Its headline result, verbatim: "state-of-the-art LLMs can produce engaging stories but often struggle to implement consistent, verifiable game mechanics, particularly in long or complex scenarios." [arXiv](https://arxiv.org/abs/2502.00595) Mechanics must be checked objectively; storytelling can be judged subjectively via an LLM-as-judge framework. [arXiv](https://arxiv.org/abs/2502.00595)
- **Rule-adjudication under persuasion.** A 2026 benchmark study ("Seduced by the Narrative," CoC-Seduce, arXiv:2607.02802) measured whether LLMs correctly force a dice roll when a player uses persuasive in-character rhetoric, reporting an average False-Pass rate of ~9.6% (roughly one in ten mandatory-roll scenarios wrongly auto-succeeded), with pseudo-logical player arguments the most effective attack (~17% average failure, far higher on some models) and near-zero errors in the opposite direction — confirming a **systematic leniency bias** the authors explicitly root in sycophancy. *Caveat: this preprint is forward-dated and references unreleased models, so treat its exact figures as illustrative; the direction of the finding is consistent with the broader literature below.*
- **Sycophancy — the root cause.** Sharma et al. (Anthropic), "Towards Understanding Sycophancy in Language Models" (arXiv:2310.13548, ICLR 2024), demonstrate that "five state-of-the-art AI assistants consistently exhibit sycophancy across four varied free-form text-generation tasks," and that "when a response matches a user's views, it is more likely to be preferred." [arXiv](https://arxiv.org/abs/2310.13548) They further find that "both humans and preference models (PMs) prefer convincingly-written sycophantic responses over correct ones a non-negligible fraction of the time," [arXiv](https://arxiv.org/abs/2310.13548) tracing the behavior to RLHF preference data. **Consequence for a GM:** the model becomes a "yes-man" that never lets players fail, refuses to impose danger or character death, and rubber-stamps player expectations — destroying stakes and genuine surprise.
- **Memory loss / state drift.** AI Dungeon's own documentation admits the AI "forgets or mixes things up" as context fills; third-party analyses describe **narrative drift** — "settings shift, tone wanders, and established facts contradict themselves as the context window fills up," [Wanderfolk](https://wanderfolk.ai/games-like-ai-dungeon/) NPCs forgetting their names, accepted quests vanishing. This is "an architectural constraint of fitting an infinitely long story into a finite context window," [Wanderfolk](https://wanderfolk.ai/games-like-ai-dungeon/) not a bug fixable by prompting. The 2025 "Narrative Continuity Test" (arXiv:2510.24831) argues larger context windows and even RAG do not by themselves solve this: "More unstructured memory does not yield a persistent identity," [arxiv](https://arxiv.org/pdf/2510.24831) and RAG is "retrieval without retention." [arxiv](https://arxiv.org/pdf/2510.24831)
- **Auto-success / no real consequences.** When the model decides outcomes, community testing observes "it defaults to dramatic logic: success feels better than failure, so you tend to win." [Roleforge](https://roleforge.ai/blog/best-ai-dungeon-alternatives-2026/)
- **Pacing collapse and verbosity; rule hallucination; illusionism collapse when the model over-accommodates.** All widely reported.

The through-line: **every one of these failure modes is a consequence of putting authority (state, randomness, adjudication) inside the model.** The architecture below removes it.

## 4. The Core Architecture: Five-Layer Separation of Concerns

**Thesis: LLM proposes, deterministic engine disposes.** The LLM is a stateless, fallible, creative function called by an authoritative orchestrator. It is simultaneously *constrained* by tool schemas (it can only act through defined tools) and *empowered* by them (tools give it reliable access to state, dice, and rules it cannot hold reliably itself). The oracle and state layers exist specifically to keep the model honest.

### 4.1 Component / Data-Flow Overview (in text)

```
                          ┌───────────────────────────────────────────┐
   PLAYER INPUT ─────────▶│         ORCHESTRATOR / CONTROL LOOP         │
                          │   (deterministic agent loop; owns turn      │
                          │    order; decides which tools/LLM to call)  │
                          └───────┬───────────────┬───────────────┬─────┘
                                  │               │               │
              (read/write via     │               │ (query)       │ (validate)
               tool calls)        ▼               ▼               ▼
        ┌──────────────────┐ ┌──────────────┐ ┌──────────────┐ ┌───────────────┐
        │ (1) GAME STATE / │ │ (2) ENTROPY/ │ │ (3) DIRECTOR │ │ (5) ADJUDICA- │
        │  WORLD MODEL     │ │ ORACLE +     │ │  / PACING /  │ │ TION / VALID- │
        │ (authoritative   │ │ AUTHORITY    │ │ DRAMA MGR    │ │ ATION /       │
        │ DB: entities,    │ │ (dice, Fate  │ │ (Chaos-      │ │ GUARDRAIL     │
        │ NPCs, threads,   │ │ Chart, grads,│ │ Factor knob, │ │ (checks LLM   │
        │ clocks, items,   │ │ layered      │ │ clocks/      │ │ output vs.    │
        │ relationships,   │ │ oracles,     │ │ fronts, beat │ │ state+rules   │
        │ world facts)     │ │ theme-weight)│ │ /tension     │ │ BEFORE canon) │
        └────────┬─────────┘ └──────┬───────┘ │ curve, spot- │ └───────┬───────┘
                 │                  │         │ light, player│         │
                 │                  │         │ model)       │         │
                 ▼                  ▼         └──────┬───────┘         │
        ┌───────────────────────────────────────────────────────────────────┐
        │ (4) MEMORY: context-window mgr + rolling summarization +           │
        │     long-term retrieval/RAG over entity+event store + canon cache  │
        └───────────────────────────────────────┬──────────────────────────┘
                                                 │  (assembles grounded prompt)
                                                 ▼
                                     ┌───────────────────────┐
                                     │      OFF-THE-SHELF     │
                                     │   LLM (via tool-call   │
                                     │  API) — PROPOSES text  │
                                     │  & requests tool ops   │
                                     └───────────┬───────────┘
                                                 │ proposal
                                                 ▼
                                   [ (5) VALIDATION GATE ] ──▶ if OK: commit to (1),
                                                 │              narrate to players
                                                 └──▶ if FAIL: reject/rewrite/re-roll
```

The loop, per turn: player input → orchestrator assembles a grounded prompt from Memory (4) + relevant State (1) + current Director targets (3) → LLM proposes an action/narration and/or requests tool calls → any uncertain outcome is resolved by the Entropy/Oracle layer (2), NOT the model → the Director (3) may inject a move/complication → the Validation layer (5) checks the proposal against authoritative State and rules → on pass, State is mutated and narration is emitted; on fail, the orchestrator rejects and re-prompts. This is a Thought–Action–Observation agent loop with deterministic guardrails at every hop.

### 4.2 Layer (1): Deterministic Game-State / World Model

An authoritative database of entities: PCs, NPCs (with goals/agendas/relationships à la IPOCL and PbtA's "name everyone, make everyone human"), threads/quests, clocks/fronts, inventory, locations, faction states, and world facts with provenance. **The LLM never holds this in its head; it reads and writes only through tools.** This is the direct descendant of Mythic's Lists (Threads/Characters) and the game-state trackers of CALYPSO and RPGBench. Canonical facts are versioned and timestamped so contradictions are detectable. Design rule: **state mutations are transactions** — proposed by the model, validated, then committed; never implicit in prose.

### 4.3 Layer (2): External Entropy / Oracle + Authority

A randomness-and-fate source **outside the model** — the direct descendant of Mythic's Fate Chart/Chaos Factor and Motif's layered oracles. Its jobs:

- Resolve every uncertain proposition with a **graded, multi-dimensional** result (Motif's Answer + Degree + Flavor; Mythic's exceptional-yes → exceptional-no gradient), seeded by a true RNG.
- Apply **theme weighting** (Motif) and the **Chaos Factor / Odds** (Mythic) so probabilities reflect genre and current control level.
- Fire **random events** (Mythic Event Focus + abstract Meaning prompts) that the LLM must then interpret — injecting novelty the model would not self-generate.
- Own the **task-resolution rules** of whatever system is loaded (system-agnostic: the oracle is configured per ruleset).

**This layer is the primary structural defense against sycophancy.** Because success/failure, danger, and "no" come from dice the model cannot see or influence, the "yes-man" bias is mechanically defeated. The model may narrate a failure vividly, but it cannot decide to avoid it.

### 4.4 Layer (3): Director / Pacing / Drama Manager

The software analog of Mythic's Chaos Factor and of academic experience managers (Façade, PaSSAGE, narrative mediation). It maintains:

- A **tension/hope-fear estimate** and a target curve (Freytag/Laws/MEXICA), selecting beat types (procedural/dramatic) to move it.
- A **Chaos-Factor-like scalar** governing event frequency, success tilt, and tempo, updated at end-of-scene from whether the PCs were in/out of control.
- **Clocks and Fronts** as the escalation engine — deterministic countdowns that impose inexorable stakes and drive "announce future badness" moves.
- A **GM-move policy** (PbtA): when a player fails, or a lull occurs, select and dispatch a move for the LLM to render "without speaking its name."
- **Spotlight tracking** (screen time per PC) and a **player model** (PaSSAGE-style) to bias scene framing.

The director *decides when to escalate, complicate, or ease*; the LLM only renders those decisions. This is where "play to find out what happens" is enforced: the director works from live world state and clocks, not a scripted plot.

### 4.5 Layer (4): Memory Architecture

Because unstructured context and even naive RAG do not yield persistent identity (Narrative Continuity Test), memory is **structured and multi-tiered**:

- **Short-term:** context-window manager assembling only the relevant slice each turn.
- **Rolling summarization:** episodic scene summaries (cf. the SCORE framework, arXiv:2503.23512) written back to the store.
- **Long-term retrieval:** RAG over an **entity + event store**, preferably an **entity-event knowledge graph** that preserves temporal-causal structure (so a character's evolution isn't collapsed into a single node) rather than flat vector similarity.
- **Canonical fact cache:** authoritative facts from Layer (1) injected verbatim (Mythic-style "Plot Essentials") so they are never merely "retrieved and hopefully attended to." Canon always overrides model recall.

The key principle: **memory is grounded in the State DB (1), not in the transcript.** The transcript is lossy narration; the DB is truth.

### 4.6 Layer (5): Adjudication / Validation / Guardrail

Before any LLM proposal becomes canon, a deterministic checker validates it against authoritative state and rules:

- **Consistency check:** does the narration contradict a canonical fact (dead NPC speaking, item not in inventory, wrong location)? If so, reject/rewrite.
- **Rules check:** did the model try to grant an outcome the oracle (2) did not authorize? This directly counters the documented **leniency/false-pass** bias — the validator, not the model, decides whether a roll was required and whether it succeeded.
- **Safety check:** hard **Lines** are enforced here as non-negotiable filters; the **X-card** command routes here for immediate retcon.
- **Scope check:** did the model invent new canonical entities/rules (hallucination)? New entities are allowed only through the entity-creation tool, which registers them in (1).

On failure, the orchestrator re-prompts with the violation, re-rolls, or falls back to a templated safe response. This is narrative mediation operationalized: accommodate if possible, intervene if necessary.

### 4.7 The Tool-Call Contract

Tools simultaneously **constrain** (the model can only affect the world through them) and **empower** (they give reliable state/dice/rules). A representative system-agnostic schema:

- `query_state(entity_id | query)` → returns canonical facts (read).
- `propose_state_change(entity_id, field, new_value, justification)` → staged, not committed until validated.
- `ask_oracle(question, odds, context)` → returns graded, multi-dimensional result from Layer (2); **the model must call this instead of deciding uncertain outcomes itself.**
- `roll_resolution(actor, action, difficulty)` → applies loaded ruleset; returns pass/fail/degree.
- `advance_clock(clock_id, ticks, reason)` / `create_clock(name, segments)` → director-governed.
- `create_entity(type, attributes)` → registers new NPC/thread/item in (1).
- `request_random_event()` → returns Event Focus + Meaning prompt for interpretation.
- `check_safety(content)` → returns lines/veils verdict.
- `frame_scene(...)` / `narrate(text)` → emits to players only after validation.

Design discipline: **the model's free-text output is always a *proposal*; only validated tool effects and validated narration mutate the game or reach players.** The orchestrator, not the model, decides turn order and which tools are available in a given context (constraining the action space is itself a control mechanism).

### 4.8 Human-in-the-Loop Hooks (even in an autonomous system)

Full autonomy does not preclude optional human veto points: (a) the **X-card / safety commands** are always live and player-invokable; (b) an optional **table veto** letting players collectively reject a scene framing or request a rewind (Script Change's rewind/fast-forward); (c) a **session-zero configuration** where players set Lines & Veils, tone, and lethality that become hard engine parameters; (d) optional **asynchronous human review** of flagged edge cases. These sit at Layer (5) and the orchestrator, never inside the model.

## 5. Evaluation: Defining and Measuring "a Good GM"

There is no single metric. Adopt RPGBench's split — **objective, automatable checks** for mechanical/continuity properties and **subjective judgments** (human playtest + calibrated LLM-as-judge) for experiential ones — across these dimensions:

- **Continuity / state fidelity (objective).** Automated contradiction detection: does narration ever conflict with the State DB? Metric: contradictions per 100 turns; canonical-fact recall. Test via long-horizon simulated campaigns (20+ turns) and adversarial "callback" probes ("what was the innkeeper's name?").
- **Coherence (mixed).** Causal/temporal soundness of events (cf. SCORE, entity-event KG checks) plus human rating.
- **Rules correctness / fairness (objective).** Audit oracle-authorized vs. model-narrated outcomes: false-pass and false-check rates (the CoC-Seduce methodology). Include **adversarial persuasion tests** — players using pseudo-logic/authority rhetoric to extract unearned success — to measure sycophancy resistance directly.
- **Stakes / meaningful failure (objective-ish).** Failure rate actually imposed; incidence of genuine setbacks and (where configured) character death. A GM that never lets players fail scores poorly by design.
- **Pacing (mixed).** Measure the tension curve (director's own estimate vs. human-annotated beats); detect pacing collapse (verbosity per turn, stalled clocks, beat-type monotony). Target Laws-style hope/fear oscillation.
- **Player agency (mixed).** Choice-honoring audits (are player decisions reflected in state changes?) and quantum-ogre probes (do distinguishable choices lead to distinguishable, information-justified outcomes?).
- **Surprise / novelty (mixed).** Frequency and player-rated quality of oracle-driven random events; diversity metrics on scene/complication types.
- **Fun / engagement (subjective).** Structured playtests with post-session instruments (Stars & Wishes; enjoyment/immersion Likert scales; retention/return-to-play), segmented by PaSSAGE-style player type.

**Method:** (1) an automated **regression harness** replaying scripted campaigns to catch continuity/rules regressions on every engine change; (2) **simulated players** (LLM-driven, including adversarial personas) for cheap large-N stress tests of memory and sycophancy; (3) **human playtests** for experiential dimensions, using LLM-as-judge only where validated against human ratings. Report craft and "willingness/fairness" as separate axes (a model can be fluent yet a pushover).

---

## Recommendations

**Stage 1 — Foundation (before writing any narration prompts).** Build Layer (1), the authoritative State DB, and Layer (2), the external oracle, first. Wire the "LLM proposes, engine disposes" loop end-to-end with a stub LLM. *Benchmark that changes the plan:* if you cannot demonstrate zero uncommitted-state-in-prose leakage on a 20-turn scripted run, do not proceed — the whole thesis depends on state living outside the model.

**Stage 2 — Honesty and stakes.** Add Layer (5) validation and the director's clocks/fronts and Chaos-Factor scalar. Run the adversarial persuasion suite. *Threshold:* target a false-pass rate at or below the best models in the CoC-Seduce study (mid-single-digit percent) and, critically, verify that oracle-driven failures actually reach players (a nonzero imposed-failure rate). If the system still auto-succeeds under pseudo-logic pressure, tighten the rules check — do not attempt to prompt the sycophancy away.

**Stage 3 — Memory and coherence.** Add Layer (4) as a structured entity-event store with a verbatim canon cache, not naive vector RAG. *Threshold:* contradictions-per-100-turns must not grow with campaign length; if it does, the failure is in grounding (memory reading from transcript rather than DB), which is architectural.

**Stage 4 — Experience tuning.** Add the player model, spotlight tracking, and beat/tension controller. Move to human playtests with Stars & Wishes and immersion instruments. *Threshold:* segmented enjoyment scores should not decline over a multi-session arc; declining scores usually indicate pacing collapse or agency erosion, diagnosable with the §5 probes.

**Cross-cutting:** keep the ruleset, oracle tables, and theme weights as *configuration* from day one to preserve system-agnosticism; build the evaluation harness in Stage 1 and run it as CI on every change. Escalate human-in-the-loop involvement (async review) only for edge cases the validator flags — do not let it creep into the hot path.

---

## Caveats

- **The strongest quantitative datapoint on rule-adjudication failure ("Seduced by the Narrative" / CoC-Seduce, arXiv:2607.02802) is a forward-dated preprint referencing unreleased models and should be treated as illustrative, not established.** Its *direction* (systematic leniency rooted in sycophancy) is corroborated by the peer-reviewed Sharma et al. sycophancy work and by RPGBench's mechanics findings, which are solid.
- **Consumer-product failure claims (AI Dungeon drift, auto-success) draw partly on vendor documentation and competitor blogs**, which have commercial incentives; the *architectural* explanation (finite context window, transcript-as-state) is corroborated by academic sources (Narrative Continuity Test, RPGBench) and is the load-bearing point.
- **The paper deliberately omits training/fine-tuning approaches** per scope; some failure modes (e.g., baseline sycophancy) can also be mitigated at the model layer, but this design assumes an unmodified commercial LLM and defends against them purely architecturally.
- **The Mythic Chaos Factor operating range is cited inconsistently across secondary sources** (some say 1–9, some 2–9); the mechanic and its feedback behavior are what transfer, not the exact bounds. Consult the Mythic GME 2e rulebook directly for implementation.
- **The five-layer design is a synthesis, not a fielded system.** No published autonomous AI GM yet implements all five layers with the full tool-call contract; the strongest empirical validation is indirect (Façade for drama management, CALYPSO/RPGBench for the state-externalization principle). Treat the architecture as a well-grounded hypothesis to be validated by the evaluation harness in §5, not as a proven blueprint.
