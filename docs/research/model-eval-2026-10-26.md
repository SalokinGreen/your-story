# Model eval, 2026-10-26

The first live runs of `scripts/eval-generation.mjs` (the GM prompt's ten
behavioural cases, `evals/generation/`) and `scripts/eval-judges.mjs` (the 45
drafted judge turns, `evals/turns/public/`), on a temporary DeepInfra key the
author supplied for the day. About $3.50 in all. The labels are still
`drafted` (not checked by the author), the samples are small (5–15 runs per
case), and every model ran through DeepInfra, not OpenRouter: read these as a
first ranking, not a measurement. They led to decisions 257–258.

## The effort finding

Until this day `providerCall.ts` sent DeepInfra **no** reasoning parameter
(its branch was a no-op). Probed by hand the same day: DeepInfra takes
`reasoning_effort` none/low/medium/high/xhigh on every listed model
(non-reasoning models ignore it), and the defaults differ. DeepSeek V4 Flash,
V4 Pro and Gemma 4 do not think unless asked; Kimi K2.6, Qwen3.6 35B and
Nemotron 3 Super think unless told `none`. `chat_template_kwargs.thinking`
does nothing. So every run in the first two tables below was DeepSeek and
Gemma **without** thinking and Kimi and Qwen **with** it, whatever effort the
table names; the effort is now sent (`normal` as `medium`, `none` explicitly).

## GM prompt cases (failed runs)

Before the effort fix (effort not sent):

| Model (DeepInfra) | Failed | Cost | Main misses |
|---|---|---|---|
| DeepSeek V4 Pro | 5/50 | $0.43 | cellar oracle 2, attack prose 2 |
| Kimi K2.6 | 6/50 | $0.55 | setup step skipped 3 |
| Gemma 4 31B | 6/50 | $0.45 | oracle on the gossip question 5/5 |
| Qwen3.6 35B A3B | 9/50 | $0.26 | cellar 3, gossip oracle 3 |
| DeepSeek V4 Flash | 31/300 over four passes | ~$0.25 | cellar oracle, gossip oracle, attack |
| GLM 5.3 (sent `low`, as always) | 10/50 | $0.34 | oracle on the gossip question 5/5 |
| GLM 5.3 Flash | 13/50 | $0.10 | attack 4, cellar 3 |

After the effort fix (thinking really on):

| Model, effort | Failed | Cost | Main misses |
|---|---|---|---|
| DeepSeek V4 Flash, `normal` | 3/50 | $0.05 | cellar 2, setup tag 1 |
| DeepSeek V4 Flash, `high` | 7/50 | $0.05 | attack 4, one each elsewhere |
| DeepSeek V4 Pro, `high` | 5/50 | $0.49 | gossip oracle 3 |

Every model shares the oracle misses: asking `fate_question` on a plain
question an NPC would answer, and inventing what the notes do not establish
(the cellar). That is the GM prompt's oracle step, not one model. The attack
case's "prose lacks the toll-keeper" may be a strict check; the runner keeps
no prose, so it cannot be told apart from a stall.

## Judges (the combined call, 45 turns × 2 runs, effort not sent)

| Judge | DeepSeek V4 Flash | Gemma 4 31B | GLM 5.3 Flash | Qwen3.6 35B |
|---|---|---|---|---|
| outcome | 1.00 / 1.00 | 0.75 / 0.75 | 0.80 / 0.50 | 1.00 / 0.12 |
| world consistency | 1.00 / 1.00 | 1.00 / 1.00 | 1.00 / 0.62 | 1.00 / 0.75 |
| secret leak | 1.00 / 1.00 | 1.00 / 1.00 | 1.00 / 0.25 | 0.67 / 0.50 |
| lines and veils | 1.00 / 1.00 | 1.00 / 1.00 | 1.00 / 1.00 | 0.50 / 0.17 |
| agency | 0.55 / 0.75 | 0.75 / 1.00 | 0.86 / 0.75 | 0.80 / 0.50 |
| length | 0.50 / 0.50 | 0.50 / 0.50 | 0.67 / 0.50 | – / 0.00 |
| oracle gap | 0.11 / 0.25 | 0.33 / 1.00 | – / 1.00 | 0.19 / 0.75 |
| unreadable replies (of 90 per judge) | 0 | 0 | up to 20 | up to 35 |
| cost, p95 | $0.010, 10 s | $0.035, 10 s | $0.014, 52 s | $0.085, 10 s |

Precision at major / recall at any. The default judge model (Claude Haiku
5.5 through OpenRouter) could not run on this key, so `JUDGE_DEFAULT_OVERRIDES`
is unchanged.
