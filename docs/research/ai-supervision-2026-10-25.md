# How AI systems supervise themselves — research for the judge layer (2026-10-25)

A research pass (Claude Haiku researcher) for the author's ask: "AI needs judging
and help … we should look at how other people make AI supervise itself."
**Sourcing caveat from the researcher:** it read abstracts and secondary
summaries, not full papers; figures are as reported and should be checked
before being relied on. Prices were not checked.

## 1. The patterns

| Pattern | How it works | Evidence | Failure modes | Fits our GM when… |
|---|---|---|---|---|
| **LLM-as-a-judge** (pointwise rubric or pairwise) | A judge model scores an output against a rubric, or picks the better of two | GPT-4 judges agreed with human preference >80%, about human–human agreement ([Zheng et al., 2306.05685](https://arxiv.org/abs/2306.05685)) | Position bias (GPT-4 order-consistent 65% of the time, Claude-v1 23.8%, same paper); 12 catalogued biases ([Ye et al., 2410.02736](https://arxiv.org/abs/2410.02736)); self-preference for its own outputs ([Panickssery et al., 2404.13076](https://arxiv.org/abs/2404.13076)); verbosity bias; prompt-template sensitivity changes majority outcomes 25% of the time ([2606.13685](https://arxiv.org/pdf/2606.13685), preprint) | The property has no executable test: tone, agency, loose prose-vs-outcome |
| **Rubric with reasoning steps** (G-Eval, Prometheus) | Chain-of-thought evaluation steps, then a form-filled score | G-Eval Spearman 0.514 with humans on summarisation ([2303.16634](https://arxiv.org/pdf/2303.16634v2.pdf)); Prometheus 13B, Pearson 0.897 on its own rubrics ([2310.08491](https://arxiv.org/abs/2310.08491)) | Judges favour LLM-written text | Any pointwise judge |
| **Critique and revise** (Self-Refine, Reflexion) | Generate, critique, revise in a loop | ~20% absolute gains across seven tasks ([Self-Refine, 2303.17651](https://arxiv.org/abs/2303.17651)); Reflexion 91% HumanEval ([2303.11366](https://arxiv.org/abs/2303.11366)) | **Without external feedback, self-correction often does not help and sometimes makes answers worse** ([Huang et al., "LLMs Cannot Self-Correct Reasoning Yet", 2310.01798](https://arxiv.org/abs/2310.01798)) | The critic has outside signal: an engine verdict, a tool result |
| **Constitutional principles** | Written principles drive critique and revision | [Bai et al., 2212.08073](https://arxiv.org/abs/2212.08073) | Principles alone still need outcome checks | Writing judge rubrics as principles with examples |
| **Verifiers and reward models** | A trained model ranks candidates | [Cobbe et al., 2110.14168](https://arxiv.org/abs/2110.14168); LitBench: Claude 3.7 Sonnet 73% human agreement on creative preference, trained reward models 78% ([2507.00769](https://arxiv.org/abs/2507.00769)) | Training data is the cost | Later, with our own labelled turns |
| **Process vs outcome supervision** | Check each step vs only the final answer | Process beat outcome on MATH ([Lightman et al., 2305.20050](https://arxiv.org/abs/2305.20050)) | Step labels are costly | Our tool steps are already checkable: did it roll, read, record |
| **Guardrail frameworks** | Programmable checks with per-check actions | NeMo Guardrails, incl. streaming output rails ([2310.10501](https://arxiv.org/abs/2310.10501), [NVIDIA blog](https://developer.nvidia.com/blog/stream-smarter-and-safer-learn-how-nvidia-nemo-guardrails-enhance-llm-output-streaming/)); Guardrails AI on-fail actions FIX / REASK / FIX_REASK / FILTER / REFRAIN / NOOP / EXCEPTION ([docs](https://guardrailsai.com/docs/concepts/validator_on_fail_actions)); Llama Guard ([2312.06674](https://arxiv.org/abs/2312.06674)); Constitutional Classifiers score streaming output, ~23.7% overhead reported ([2501.18837](https://arxiv.org/abs/2501.18837)) | Safety-domain, not game-domain | The action ladder: deterministic fix first, re-ask second, flag last |
| **Multi-agent debate** | Agents critique each other | Up to +8 factuality, +26 reasoning ([Du et al., 2305.14325](https://arxiv.org/abs/2305.14325)) | Did not beat self-consistency at equal samples (Huang et al.) | Poor fit per turn: N agents × rounds |
| **Generate N, pick best** | Sample several, select one | Cobbe et al. | N× cost, needs a reliable selector | Rare high-stakes turns only |
| **Deterministic validators first** | Schema or rule checks before any LLM check | Guardrails AI's FIX-before-REASK; constrained decoding (Outlines) | Masking can distort reasoning ([2603.03305](https://arxiv.org/pdf/2603.03305v1), preprint) | Everything we can count or compare |

## 2. Judges of creative writing and roleplay

- **Judgemark** (EQ-Bench): v2 warns of wide confidence intervals ([v2](https://eqbench.com/judgemark-v2.html)); v4 tests the judge itself with anchors and separability ([v4](https://eqbench.com/judgemark-v4.html)); the creative-writing benchmark penalises vocabulary flourish because judges are easily impressed by it ([page](https://eqbench.com/creative_writing_v2.html)).
- **Short stories:** LLM judges agree with each other well and with humans only fairly ([2411.02316](https://arxiv.org/pdf/2411.02316)).
- **Roleplay:** PersonaEval — best LLM judges identify the speaking persona ~69% vs humans 90.8%; "LLM evaluators are not yet reliable for roleplay" ([2508.10014](https://arxiv.org/abs/2508.10014)). RPEval scores in-character consistency ([2505.13157](https://arxiv.org/abs/2505.13157)); PingPong uses a judge ensemble against self-favouring ([2409.06820](https://arxiv.org/html/2409.06820v4)).
- **Reliability:** JudgeBench finds many strong judges barely above random where correctness decides ([2410.12784](https://arxiv.org/abs/2410.12784)).

## 3. AI game masters

- **CALYPSO** — an assistant for a human DM, no judge layer ([2308.07540](https://arxiv.org/abs/2308.07540)).
- **D&D as a dialogue challenge** — ~900 games, 500,000 rolls, predicting game state ([2210.07109](https://arxiv.org/abs/2210.07109)).
- **"Thirteen Hours"** — function calling for state management improved narrative quality and state consistency, judged by humans and unit tests ([2409.06949](https://arxiv.org/abs/2409.06949)). The closest published match to this app.
- **RPGBench** — LLMs write engaging stories but often fail to implement consistent, verifiable mechanics ([2502.00595](https://arxiv.org/abs/2502.00595)).
- **CoC-Seduce** — narrative "rhetorical injection" got adjudicators to break rules; 17.1% average failure under pseudo-logical framing ([2607.02802](https://arxiv.org/pdf/2607.02802), preprint).
- **Products:** AI Dungeon documents user-maintained memory, World Info and Author's Note, no public critic ([Latitude](https://latitudegames.notion.site/What-is-Memory-f2bc3e77bb1b48aca3716aeba21b8d21)); Friends & Fables claims structured state checks before narration on a 5e engine ([blog](https://fables.gg/blog/how-is-friends-and-fables-different-from-chatgpt-ai-dungeon-or-novelai), vendor claim); Hidden Door uses a trope-based story engine, and a 2025 review found its narrative consistency lacking ([review](https://ianbicking.org/blog/2025/08/hidden-door-design-review-llm-driven-game)). No product publicly documents a director or critic model.

## 4. Practical design advice

- **Hold or stream:** stream only text no check can change; hold the rest (NeMo, Constitutional Classifiers). This is the author's decision 221.
- **Severity:** block on high, re-ask or fix on medium, log on low (the Guardrails action ladder; thresholds are ours to set).
- **False positives:** no study quantifies judge false-positive cost in games. Opinion: a fine turn rewritten costs the player more than a missed low-severity flag.
- **Cheap vs strong:** a panel of small judges from different model families beat one large judge at over 7× lower cost, with less self-bias ([PoLL, 2404.18796](https://arxiv.org/abs/2404.18796)); tested on QA, not games.
- **Measuring a judge:** agreement with human labels (Zheng), stability and separability (Judgemark), correctness (JudgeBench). Opinion: hand-label past turns (true, false and missed flags) and A/B the flag rate and the player's Undo rate.

## 5. The ten ideas most worth adopting (researcher's ranking)

1. **Keep deterministic checks deterministic**: length, dice vs verdict, missing tool calls ([Guardrails AI](https://guardrailsai.com/docs/concepts/validator_on_fail_actions)).
2. **Rewrite only with external feedback**: give the rewrite the engine's verdict, not just a judge's opinion ([Huang et al.](https://arxiv.org/abs/2310.01798)).
3. **A judge panel from different model families** for semantic checks ([PoLL](https://arxiv.org/abs/2404.18796); [Panickssery](https://arxiv.org/abs/2404.13076)).
4. **Test for position bias** in any pairwise judge; otherwise use anchored pointwise rubrics ([Zheng](https://arxiv.org/abs/2306.05685); [Ye](https://arxiv.org/abs/2410.02736)).
5. **Reasoning-then-score rubrics with anchors** ([G-Eval](https://arxiv.org/pdf/2303.16634v2.pdf)).
6. **Validate every judge against human labels before enabling it** ([Judgemark v4](https://eqbench.com/judgemark-v4.html); [PersonaEval](https://arxiv.org/abs/2508.10014)).
7. **Check each tool step, not only the final prose** ([Lightman](https://arxiv.org/abs/2305.20050)).
8. **Stream only what checks cannot change** ([NeMo streaming](https://developer.nvidia.com/blog/stream-smarter-and-safer-learn-how-nvidia-nemo-guardrails-enhance-llm-output-streaming/)).
9. **Write judge rules as principles with examples** ([Constitutional AI](https://arxiv.org/abs/2212.08073)).
10. **An adversarial regression set** of turns where the player tries to decide their own outcome ([CoC-Seduce](https://arxiv.org/pdf/2607.02802); [RPGBench](https://arxiv.org/abs/2502.00595)).
