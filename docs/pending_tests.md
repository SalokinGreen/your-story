# Pending tests

Checks a session could not perform itself, written as checks a person
performs, with the expected result and — where predictable — what the
failure looks like. Newest at the top, one dated heading per session.

**This file is for work that was impossible, never for work that was merely
extra effort.** A session on the author's machine that can run a check runs
it. A session that confirms an entry deletes it; entries only leave this
file by being tested, not by ageing out. See `CLAUDE.md` → "What a cloud
session cannot do".

## 2026-10-22 — Token savings PR T1: history stubs, fixed start, summaries (`claude/token-savings-t1`)

The suite measures the history sizes and the summary prompt against a
recording `fetch`; no model was called. What needs a real session on the
default models (with the author's go, decision 105):

- **Recall after a stub.** Let the GM read a note, then play twenty turns.
  *Expected:* it still acts on what the note said, or reads it again (the
  stub tells it to). *Failure looks like:* a wrong fact stated with
  confidence, or a `read_notes` of the same note every turn, which means the
  150-token threshold or the summary needs tuning (decision 103).
- **A real summary.** Play past the history budget (21.6k tokens at the
  default Memory Size; shrink the slider to reach it sooner). *Expected:* one
  "History summarization" call in the Debug Logs, a story-so-far with the
  seven headings, and the next turns' history starting right after it.
  *Failure looks like:* a "sliding-window fallback" log line every turn (the
  summary call is failing; its error is in the Debug Logs), or headings
  missing from the summary.
- **Summary instructions.** Add a "Summary Instructions" note ("always keep
  Exposure and Heat changes"), play past a summary. *Expected:* the summary
  keeps them. The note must not appear in the GM's note lists.
- **Summarise Now.** Story menu, Compact Story, type a focus, Summarise Now.
  *Expected:* a success toast, the story text unchanged on screen, and the
  next turn's context (Context Viewer) opening with the summary and the last
  two turns only.
- **The Compact Story dialog on a phone width.** The new Summarise Now block
  was never seen rendered (no browser in this session).

## 2026-10-21 — The model catalog refresh (`claude/catalog-refresh`)

The catalog was checked against OpenRouter's live list and each vendor's
pricing page, and the fallback for removed models is covered by tests. What
no session could do is call the new models: each needs a provider key and
spends the author's money, so each waits for the author's go. One short
request per item is enough.

- **The Designer on Grok 4.5 at effort `none` (the second engine review,
  2026-10-22).** With only an OpenRouter key and no Designer model saved, the
  Designer opens on Grok 4.5, the first catalog model the key unlocks. Its
  effort is `none`, and OpenRouter marks Grok's reasoning mandatory. Send one
  Designer message. *Expected:* a normal reply, with the request carrying
  `reasoning: {effort: "low"}` (the "Side call failed" warning names the
  effort if it fails). *Failure looks like:* a 400 naming `reasoning` or
  `effort`, which would mean the `reasoningMandatory` flag is missing on the
  model, or OpenRouter has changed which models refuse `"none"`.
- **A Mistral Small 4 Designer at effort `high`.** Mistral's reasoning models
  answer with `content` as a list of chunks. Send one Designer message.
  *Expected:* a normal reply in the chat. *Failure looks like:* an error
  naming `trim` or `[object Object]` in the chat, which would mean the
  non-streaming path is not unpacking the list.
- **Does `deepseek-v4-pro` still serve V4 Pro?** DeepSeek's release post says
  it would route to V4.1 Flash from 2026-09-14; its changelog and pricing page
  say it continues at its own price. Send one tiny request on "DeepSeek V4 Pro"
  with a DeepSeek key and look at the reply's `model` field in the Debug Logs.
  *Failure looks like:* a model name containing "flash", or a bill near
  $0.15 / $0.60 per M instead of $0.66 / ## 2026-10-21 — The model catalog refresh (`claude/catalog-refresh`)

The catalog was checked against OpenRouter's live list and each vendor's
pricing page, and the fallback for removed models is covered by tests. What
no session could do is call the new models: each needs a provider key and
spends the author's money, so each waits for the author's go. One short
request per item is enough.

- **The Designer on Grok 4.5 at effort `none` (the second engine review,
  2026-10-22).** With only an OpenRouter key and no Designer model saved, the
  Designer opens on Grok 4.5, the first catalog model the key unlocks. Its
  effort is `none`, and OpenRouter marks Grok's reasoning mandatory. Send one
  Designer message. *Expected:* a normal reply, with the request carrying
  `reasoning: {effort: "low"}` (the "Side call failed" warning names the
  effort if it fails). *Failure looks like:* a 400 naming `reasoning` or
  `effort`, which would mean the `reasoningMandatory` flag is missing on the
  model, or OpenRouter has changed which models refuse `"none"`.
- **A Mistral Small 4 Designer at effort `high`.** Mistral's reasoning models
  answer with `content` as a list of chunks. Send one Designer message.
  *Expected:* a normal reply in the chat. *Failure looks like:* an error
  naming `trim` or `[object Object]` in the chat, which would mean the
  non-streaming path is not unpacking the list.
- **Does `deepseek-v4-pro` still serve V4 Pro?** DeepSeek's release post says
  it would route to V4.1 Flash from 2026-09-14; its changelog and pricing page
  say it continues at its own price. Send one tiny request on "DeepSeek V4 Pro"
  with a DeepSeek key and look at the reply's `model` field in the Debug Logs.
  *Failure looks like:* a model name containing "flash", or a bill near
  $0.15 / $0.60 per M instead of $0.66 / $1.98 (off-peak). Then relabel or
  remove the entry.
- **Does a forced tool call work on Qwen 3.8?** The app sends `tool_choice`
  `auto` to `qwen/qwen3.8…` because a gateway documents a 400 for a forced call
  with thinking on, while OpenRouter lists the parameter as supported. In a
  combat scene on "Qwen 3.8 Max", check that a gated round still produces a
  roll (the gate's message does the forcing). To test the premise itself, send
  `tool_choice: "required"` by hand once; if it works, the safeguard
  (`modelRejectsForcedToolChoice`) can go.
- **Do the new direct ids work on their providers?** One short chat each:
  "Google Gemini 4 Argon" and "Google Gemini 3.8 Flash" (the `models/` prefix
  on Google's OpenAI-compatible endpoint), and "Mistral Large 4" (`mistral-large-4`,
  in public preview). *Failure looks like:* a 404 or "model not found". Also
  note what Google AI Studio bills for the `gemini-flash-latest` alias, which
  the two renamed "latest alias" entries still price from an older model.
- **A GM turn with tools on "DeepSeek V4.1 Flash"** (`deepseek-flash`): a roll
  and a second round, to see the `reasoning_content` replay work on the new
  name. *Failure looks like:* a 400 mentioning `reasoning_content`.
- **A GM turn on "GPT-6.1 Sol" or "GPT-6 Luna"** through OpenRouter. OpenRouter
  lists no `temperature` for them; check the call is not rejected for the
  sampling settings the app sends.
- **The lore image generator with a saved removed model.** The Settings
  fallback was checked in the preview (a tier, the narration voice and the
  Observer each saved as a removed model showed and ran their defaults). The
  image pickers were checked only as a function: with `loreImageGen_provider`
  `openrouter` and `loreImageGen_model` `Flux 2 Flex` saved in localStorage,
  opening a lore entry's image generator should show Nano Banana, not a blank
  or mismatched picker.

**The fixed models (2026-10-22).** Mistral's retired chat models were replaced
(Mistral Small 4, Medium 3.5, Ministral 3 3B and 8B), image prices and ids
were corrected, the OCR summariser and Cartesia TTS moved to their current
names. The ids were read from the vendors' own pages and the request shapes
are covered by tests with a faked `fetch`; none was sent to a provider.

- **A turn with tools on each new Mistral id, with only a Mistral key.**
  Save only a Mistral key, pin the narration voice to "Mistral Small 4" and
  tier 1 to the same, and play a turn that makes the GM roll. Repeat with
  "Mistral Medium 3.5" (`mistral-medium-3-5`), "Ministral 3 8B"
  (`ministral-8b-2512`) and "Ministral 3 3B" (`ministral-3b-2512`). *Expected:*
  the roll happens, the scene arrives, and the Debug Logs name the Mistral id.
  *Failure looks like:* a 404 or "model not found" (the id), a 400 naming
  `tool_choice`, `max_tokens` or `reasoning_effort` (Small 4 and Medium 3.5
  reason, and Mistral may take effort differently from the one value the app
  sends them), or a 400 about the prompt size on Ministral 3 3B (Mistral's page
  says 256k, OpenRouter lists 128k; the catalog follows Mistral).
- **A saved choice of a retired Mistral model.** In localStorage set
  `narrationModelOverride` to `Mistral Small 3.2`, `reasoningTierOverrides`
  to `[{"modelKey":"Mistral Medium 3.1","reasoningEffort":"low"},null,null,null]`,
  `observerModelOverride` to `{"modelKey":"Mistral Nemo","reasoningEffort":"none"}`
  and `designerModel` to `Devstral 2`, with only a Mistral key saved, and reload.
  *Expected:* Settings → AI Config shows Mistral Small 4, Mistral Medium 3.5
  and (Architecture) Ministral 3 8B, `/creator` opens on Mistral Medium 3.5, and
  a turn runs without asking for an OpenRouter key. *Failure looks like:* a
  blank picker, "No key" on a slot that has a Mistral key, or a "Model key …
  not found" line. The PDF importer has its own saved id: set
  `pdfImporterSettings` to `{"aiModel":"mistral-small-2506"}`; the importer's
  model picker should open on Mistral Small 4.
- **A narration line on Cartesia.** With a Cartesia key and a voice ID (try
  the bundled Barbershop Man, and a Professional Voice Clone if you have one),
  switch the voice model to Cartesia and play a narration line. The request
  now carries `Cartesia-Version: 2026-08-14`, `model_id: "sonic-3.6"` and
  `voice` as a string. *Expected:* audio plays. *Failure looks like:* a 400
  with `voice_model_mismatch` on a Professional Voice Clone (Cartesia wants one
  of the voice's own models, `sonic-3.5-2026-05-04` or `sonic-3.6-2026-08-27`,
  and the app sends the undated `sonic-3.6`; if so, the voice needs a model
  field), a 400 naming `voice` or `model_id`, or silence. If it fails for every
  voice, revert `CARTESIA_VERSION` and `CARTESIA_MODEL_ID` in `ttsCall.ts`.
- **One Nano Banana Pro image.** With an OpenRouter key, generate a lore image
  on "Nano Banana Pro" (now `google/gemini-3-pro-image`). *Expected:* an image,
  at about $0.13 in the OpenRouter activity page (the picker shows ~$0.134).
  Then "Nano Banana" (now `google/gemini-3.1-flash-lite-image`, ~$0.034) and
  "GPT-5.4 Image 2" (`openai/gpt-5.4-image-2`, ~$0.045, an estimate). *Failure
  looks like:* "Could not extract image from AI response" (the model returns
  the picture in a shape `extractImageFromOpenRouterResponse` does not read),
  a 404, or a cost far from the figure shown.
- **A DeepInfra image.** Generate a lore image on "FLUX 2 Pro" and on
  "Bria 3.2". *Expected:* about $0.03 and $0.04 on DeepInfra's usage page.
- **The OCR summariser on DeepSeek.** Import a short PDF with the importer's
  model set to a DeepSeek model (its request now names `deepseek-flash`).
  *Failure looks like:* a 400 naming the model.

**The Balanced defaults (decisions 50 and 51).** The default ladder and the
side agents' own default changed in this same branch. Every item here plays
real turns on the author's OpenRouter key, so it waits for the author's go.

- **A fresh profile, one OpenRouter key, four turns.** Clear the saved
  overrides (Settings → AI Config → "Reset all to defaults", and every
  Architecture toggle off), save only an OpenRouter key, and play one banter
  turn, one ordinary check, one combat turn against two enemies (tier 2) and
  one against a single enemy (tier 3, which counts as a boss). *Expected:*
  tiers 0 and 1 run on Claude Haiku 5.5, tier 2 on GLM 5.3, tier 3 on Claude
  Sonnet 5.5, narration on GLM 5.3, and the Observer's judges and the Memory
  Keeper on Claude Haiku 5.5, all visible in the turn cost panel or the Debug
  Logs. *Failure looks like:* a 400 from Claude naming `tool_choice` or a
  forced tool use on a gated round, or naming thinking blocks when the GM
  climbs from Haiku to Sonnet mid-turn; a side-agent line in the Debug Logs
  naming DeepSeek V4 Flash or `Model key … not found`, which means a side
  call still reaches `getModelConfig()` with a key it does not know (a missed
  fallback path); a GLM 5.3 reply that comes back empty because its thinking
  used the whole token cap.
- **A climb to tier 3 in the middle of a turn, from GLM 5.3 and from Haiku.**
  In a combat scene against two enemies (tier 2, GLM 5.3), make the GM raise
  the tier mid-turn: a `formula_roll` with `stakes: "deadly"` raises it
  through `applyStakesEscalation`, so the next round runs on Claude Sonnet
  5.5. Then do the same from an ordinary scene (tier 1, Haiku). *Expected:*
  the Sonnet round succeeds, with the GM's earlier rounds in its history.
  *Failure looks like:* a 400 from Anthropic or OpenRouter naming
  `reasoning_details`, thinking blocks or a signature. That would mean the
  earlier model's reasoning must not be replayed to Claude when the model
  changes inside a turn. The turn then errors out instead of falling back,
  because the tier fallback does not fire for streamed rounds (a provider
  error arrives as an in-stream `error` event; see the `REASONING_TIERS`
  comment in `reasoningTiers.ts`).
- **A gated combat round on GLM 5.3.** In the same two-enemy combat, provoke
  the roll gate (M2) or the plan gate, so that round is forced to
  `tool_choice: "required"` and goes out through OpenRouter to GLM 5.3.
  *Expected:* the gated round calls a tool (a roll). *Failure looks like:* a
  400 naming `tool_choice`, or the model answering in prose again so the gate
  fires a second time.
- **The cap on a tier 3 turn.** Against a single enemy (tier 3, Claude Sonnet
  5.5 at `xhigh`), with the default Response Length of 8,000, read the final
  story round in the Debug Logs. Thinking counts against `max_tokens` on
  Claude, so `xhigh` can use up the cap. *Expected:* the round's finish
  diagnostic shows `truncatedAtCap: false` and the scene arrives whole.
  *Failure looks like:* `truncatedAtCap: true`, an empty final story round,
  or a scene that stops mid-sentence; then tier 3's effort or the 4,096
  `max_tokens` floor needs another look.
- **Haiku's thinking on the side calls.** An unpinned side agent sends effort
  `none` (decision 53), and Claude 5.5's thinking cannot be turned off, so
  `applyReasoningEffort` sends Claude's `none` as `low`, as its GLM branch
  already did. After the four turns above, read the Observer and
  Memory Keeper lines in the turn cost panel. *Failure looks like:* a side
  call costing several times a tenth of a cent, or taking several seconds,
  which would mean OpenRouter is not honouring `reasoning.effort: low` for
  Haiku.
- **The Observer's rewrite on the narration voice (decision 52).** The
  Observer's judges run on Claude Haiku 5.5, but an unpinned Observer's
  rewrite runs on the narration voice (GLM 5.3 by default). In a story with
  violence or mature themes, let the Observer flag a turn (a player-agency or
  outcome mismatch is the easiest to provoke), and read the rewrite's line in
  the Debug Logs. *Expected:* the judge calls name Claude Haiku 5.5 and the
  rewrite call names GLM 5.3, and the rewritten scene keeps its tone.
  *Failure looks like:* a rewrite call naming Haiku (a call site still on the
  judges' options), a refusal or a softened scene, or "Observer rewrite call
  failed, falling back to full-turn reset" every time.
- **An existing profile with only a Mistral or DeepSeek key.** Its saved
  overrides still apply, but a slot with none now defaults to an OpenRouter
  model. *Expected:* a turn that stops with a message naming the missing
  OpenRouter key, and the Settings tier cards showing "No key"; saving an
  OpenRouter key (or picking models on the key it has) fixes it.
- **An OpenRouter-less profile keeps its side agents.** Clear every saved
  override and every key, save only a Mistral key, set the four tiers and the
  narration voice to Mistral models in Settings → AI Config, and play until
  compaction runs (a long story, or a small Memory Size). *Expected:* the turn
  plays, and the Memory Keeper, the Observer and compaction lines in the Debug
  Logs name the Mistral narration model (the side agents fall to the
  narration voice when there is no key for Claude Haiku 5.5's provider), with
  a scene summary appearing once compaction has run. *Failure looks like:* a
  side-agent line naming Claude Haiku 5.5 followed by "No API key configured
  for OpenRouter", or a story whose old history drops out with no summary
  (compaction never ran). The "Compact Story" button in the story menu should
  work on the same profile, on the same model.

**Every call carries an effort (decision 53).** Built and tested against
mocked providers only; the requests below spend the author's OpenRouter key.

- **The narration voice and the Designer at a chosen effort.** In Settings →
  AI Config set the narration voice to Claude Sonnet 5.5 and its new effort
  picker to `high`, and play one turn that needs a separate narration call
  (the GM's last round only calls tools) with suggested choices on. Then open
  `/creator`, set the Designer's model to Claude Sonnet 5.5 and its Effort
  picker to `normal`, and send one message. *Expected:* the "Story stage
  request sent" line in the Debug Logs shows `reasoningEffort: high`; in the
  web preview's network tab the story and choices requests carry
  `"reasoningEffort":"high"` and the Designer's `"normal"`, while the
  Observer's judges and the Memory Keeper carry `"none"` (OpenRouter then
  receives `reasoning: {effort: "low"}` for them, Claude's reading of `none`,
  and `{effort: "high"}` and `{effort: "medium"}` for the other two). A failed
  side call's Debug Logs warning also names the effort it was sent at.
  *Failure looks like:* every call still at `low` (the effort is not reaching
  the request), or a 400 naming `reasoning` (a model that does not take the
  effort the picker offered).
.98 (off-peak). Then relabel or
  remove the entry.
- **Does a forced tool call work on Qwen 3.8?** The app sends `tool_choice`
  `auto` to `qwen/qwen3.8…` because a gateway documents a 400 for a forced call
  with thinking on, while OpenRouter lists the parameter as supported. In a
  combat scene on "Qwen 3.8 Max", check that a gated round still produces a
  roll (the gate's message does the forcing). To test the premise itself, send
  `tool_choice: "required"` by hand once; if it works, the safeguard
  (`modelRejectsForcedToolChoice`) can go.
- **Do the new direct ids work on their providers?** One short chat each:
  "Google Gemini 4 Argon" and "Google Gemini 3.8 Flash" (the `models/` prefix
  on Google's OpenAI-compatible endpoint), and "Mistral Large 4" (`mistral-large-4`,
  in public preview). *Failure looks like:* a 404 or "model not found". Also
  note what Google AI Studio bills for the `gemini-flash-latest` alias, which
  the two renamed "latest alias" entries still price from an older model.
- **A GM turn with tools on "DeepSeek V4.1 Flash"** (`deepseek-flash`): a roll
  and a second round, to see the `reasoning_content` replay work on the new
  name. *Failure looks like:* a 400 mentioning `reasoning_content`.
- **A GM turn on "GPT-6.1 Sol" or "GPT-6 Luna"** through OpenRouter. OpenRouter
  lists no `temperature` for them; check the call is not rejected for the
  sampling settings the app sends.
- **The lore image generator with a saved removed model.** The Settings
  fallback was checked in the preview (a tier, the narration voice and the
  Observer each saved as a removed model showed and ran their defaults). The
  image pickers were checked only as a function: with `loreImageGen_provider`
  `openrouter` and `loreImageGen_model` `Flux 2 Flex` saved in localStorage,
  opening a lore entry's image generator should show Nano Banana, not a blank
  or mismatched picker.

**The fixed models (2026-10-22).** Mistral's retired chat models were replaced
(Mistral Small 4, Medium 3.5, Ministral 3 3B and 8B), image prices and ids
were corrected, the OCR summariser and Cartesia TTS moved to their current
names. The ids were read from the vendors' own pages and the request shapes
are covered by tests with a faked `fetch`; none was sent to a provider.

- **A turn with tools on each new Mistral id, with only a Mistral key.**
  Save only a Mistral key, pin the narration voice to "Mistral Small 4" and
  tier 1 to the same, and play a turn that makes the GM roll. Repeat with
  "Mistral Medium 3.5" (`mistral-medium-3-5`), "Ministral 3 8B"
  (`ministral-8b-2512`) and "Ministral 3 3B" (`ministral-3b-2512`). *Expected:*
  the roll happens, the scene arrives, and the Debug Logs name the Mistral id.
  *Failure looks like:* a 404 or "model not found" (the id), a 400 naming
  `tool_choice`, `max_tokens` or `reasoning_effort` (Small 4 and Medium 3.5
  reason, and Mistral may take effort differently from the one value the app
  sends them), or a 400 about the prompt size on Ministral 3 3B (Mistral's page
  says 256k, OpenRouter lists 128k; the catalog follows Mistral).
- **A saved choice of a retired Mistral model.** In localStorage set
  `narrationModelOverride` to `Mistral Small 3.2`, `reasoningTierOverrides`
  to `[{"modelKey":"Mistral Medium 3.1","reasoningEffort":"low"},null,null,null]`,
  `observerModelOverride` to `{"modelKey":"Mistral Nemo","reasoningEffort":"none"}`
  and `designerModel` to `Devstral 2`, with only a Mistral key saved, and reload.
  *Expected:* Settings → AI Config shows Mistral Small 4, Mistral Medium 3.5
  and (Architecture) Ministral 3 8B, `/creator` opens on Mistral Medium 3.5, and
  a turn runs without asking for an OpenRouter key. *Failure looks like:* a
  blank picker, "No key" on a slot that has a Mistral key, or a "Model key …
  not found" line. The PDF importer has its own saved id: set
  `pdfImporterSettings` to `{"aiModel":"mistral-small-2506"}`; the importer's
  model picker should open on Mistral Small 4.
- **A narration line on Cartesia.** With a Cartesia key and a voice ID (try
  the bundled Barbershop Man, and a Professional Voice Clone if you have one),
  switch the voice model to Cartesia and play a narration line. The request
  now carries `Cartesia-Version: 2026-08-14`, `model_id: "sonic-3.6"` and
  `voice` as a string. *Expected:* audio plays. *Failure looks like:* a 400
  with `voice_model_mismatch` on a Professional Voice Clone (Cartesia wants one
  of the voice's own models, `sonic-3.5-2026-05-04` or `sonic-3.6-2026-08-27`,
  and the app sends the undated `sonic-3.6`; if so, the voice needs a model
  field), a 400 naming `voice` or `model_id`, or silence. If it fails for every
  voice, revert `CARTESIA_VERSION` and `CARTESIA_MODEL_ID` in `ttsCall.ts`.
- **One Nano Banana Pro image.** With an OpenRouter key, generate a lore image
  on "Nano Banana Pro" (now `google/gemini-3-pro-image`). *Expected:* an image,
  at about $0.13 in the OpenRouter activity page (the picker shows ~$0.134).
  Then "Nano Banana" (now `google/gemini-3.1-flash-lite-image`, ~$0.034) and
  "GPT-5.4 Image 2" (`openai/gpt-5.4-image-2`, ~$0.045, an estimate). *Failure
  looks like:* "Could not extract image from AI response" (the model returns
  the picture in a shape `extractImageFromOpenRouterResponse` does not read),
  a 404, or a cost far from the figure shown.
- **A DeepInfra image.** Generate a lore image on "FLUX 2 Pro" and on
  "Bria 3.2". *Expected:* about $0.03 and $0.04 on DeepInfra's usage page.
- **The OCR summariser on DeepSeek.** Import a short PDF with the importer's
  model set to a DeepSeek model (its request now names `deepseek-flash`).
  *Failure looks like:* a 400 naming the model.

**The Balanced defaults (decisions 50 and 51).** The default ladder and the
side agents' own default changed in this same branch. Every item here plays
real turns on the author's OpenRouter key, so it waits for the author's go.

- **A fresh profile, one OpenRouter key, four turns.** Clear the saved
  overrides (Settings → AI Config → "Reset all to defaults", and every
  Architecture toggle off), save only an OpenRouter key, and play one banter
  turn, one ordinary check, one combat turn against two enemies (tier 2) and
  one against a single enemy (tier 3, which counts as a boss). *Expected:*
  tiers 0 and 1 run on Claude Haiku 5.5, tier 2 on GLM 5.3, tier 3 on Claude
  Sonnet 5.5, narration on GLM 5.3, and the Observer's judges and the Memory
  Keeper on Claude Haiku 5.5, all visible in the turn cost panel or the Debug
  Logs. *Failure looks like:* a 400 from Claude naming `tool_choice` or a
  forced tool use on a gated round, or naming thinking blocks when the GM
  climbs from Haiku to Sonnet mid-turn; a side-agent line in the Debug Logs
  naming DeepSeek V4 Flash or `Model key … not found`, which means a side
  call still reaches `getModelConfig()` with a key it does not know (a missed
  fallback path); a GLM 5.3 reply that comes back empty because its thinking
  used the whole token cap.
- **A climb to tier 3 in the middle of a turn, from GLM 5.3 and from Haiku.**
  In a combat scene against two enemies (tier 2, GLM 5.3), make the GM raise
  the tier mid-turn: a `formula_roll` with `stakes: "deadly"` raises it
  through `applyStakesEscalation`, so the next round runs on Claude Sonnet
  5.5. Then do the same from an ordinary scene (tier 1, Haiku). *Expected:*
  the Sonnet round succeeds, with the GM's earlier rounds in its history.
  *Failure looks like:* a 400 from Anthropic or OpenRouter naming
  `reasoning_details`, thinking blocks or a signature. That would mean the
  earlier model's reasoning must not be replayed to Claude when the model
  changes inside a turn. The turn then errors out instead of falling back,
  because the tier fallback does not fire for streamed rounds (a provider
  error arrives as an in-stream `error` event; see the `REASONING_TIERS`
  comment in `reasoningTiers.ts`).
- **A gated combat round on GLM 5.3.** In the same two-enemy combat, provoke
  the roll gate (M2) or the plan gate, so that round is forced to
  `tool_choice: "required"` and goes out through OpenRouter to GLM 5.3.
  *Expected:* the gated round calls a tool (a roll). *Failure looks like:* a
  400 naming `tool_choice`, or the model answering in prose again so the gate
  fires a second time.
- **The cap on a tier 3 turn.** Against a single enemy (tier 3, Claude Sonnet
  5.5 at `xhigh`), with the default Response Length of 8,000, read the final
  story round in the Debug Logs. Thinking counts against `max_tokens` on
  Claude, so `xhigh` can use up the cap. *Expected:* the round's finish
  diagnostic shows `truncatedAtCap: false` and the scene arrives whole.
  *Failure looks like:* `truncatedAtCap: true`, an empty final story round,
  or a scene that stops mid-sentence; then tier 3's effort or the 4,096
  `max_tokens` floor needs another look.
- **Haiku's thinking on the side calls.** An unpinned side agent sends effort
  `none` (decision 53), and Claude 5.5's thinking cannot be turned off, so
  `applyReasoningEffort` sends Claude's `none` as `low`, as its GLM branch
  already did. After the four turns above, read the Observer and
  Memory Keeper lines in the turn cost panel. *Failure looks like:* a side
  call costing several times a tenth of a cent, or taking several seconds,
  which would mean OpenRouter is not honouring `reasoning.effort: low` for
  Haiku.
- **The Observer's rewrite on the narration voice (decision 52).** The
  Observer's judges run on Claude Haiku 5.5, but an unpinned Observer's
  rewrite runs on the narration voice (GLM 5.3 by default). In a story with
  violence or mature themes, let the Observer flag a turn (a player-agency or
  outcome mismatch is the easiest to provoke), and read the rewrite's line in
  the Debug Logs. *Expected:* the judge calls name Claude Haiku 5.5 and the
  rewrite call names GLM 5.3, and the rewritten scene keeps its tone.
  *Failure looks like:* a rewrite call naming Haiku (a call site still on the
  judges' options), a refusal or a softened scene, or "Observer rewrite call
  failed, falling back to full-turn reset" every time.
- **An existing profile with only a Mistral or DeepSeek key.** Its saved
  overrides still apply, but a slot with none now defaults to an OpenRouter
  model. *Expected:* a turn that stops with a message naming the missing
  OpenRouter key, and the Settings tier cards showing "No key"; saving an
  OpenRouter key (or picking models on the key it has) fixes it.
- **An OpenRouter-less profile keeps its side agents.** Clear every saved
  override and every key, save only a Mistral key, set the four tiers and the
  narration voice to Mistral models in Settings → AI Config, and play until
  compaction runs (a long story, or a small Memory Size). *Expected:* the turn
  plays, and the Memory Keeper, the Observer and compaction lines in the Debug
  Logs name the Mistral narration model (the side agents fall to the
  narration voice when there is no key for Claude Haiku 5.5's provider), with
  a scene summary appearing once compaction has run. *Failure looks like:* a
  side-agent line naming Claude Haiku 5.5 followed by "No API key configured
  for OpenRouter", or a story whose old history drops out with no summary
  (compaction never ran). The "Compact Story" button in the story menu should
  work on the same profile, on the same model.

**Every call carries an effort (decision 53).** Built and tested against
mocked providers only; the requests below spend the author's OpenRouter key.

- **The narration voice and the Designer at a chosen effort.** In Settings →
  AI Config set the narration voice to Claude Sonnet 5.5 and its new effort
  picker to `high`, and play one turn that needs a separate narration call
  (the GM's last round only calls tools) with suggested choices on. Then open
  `/creator`, set the Designer's model to Claude Sonnet 5.5 and its Effort
  picker to `normal`, and send one message. *Expected:* the "Story stage
  request sent" line in the Debug Logs shows `reasoningEffort: high`; in the
  web preview's network tab the story and choices requests carry
  `"reasoningEffort":"high"` and the Designer's `"normal"`, while the
  Observer's judges and the Memory Keeper carry `"none"` (OpenRouter then
  receives `reasoning: {effort: "low"}` for them, Claude's reading of `none`,
  and `{effort: "high"}` and `{effort: "medium"}` for the other two). A failed
  side call's Debug Logs warning also names the effort it was sent at.
  *Failure looks like:* every call still at `low` (the effort is not reaching
  the request), or a 400 naming `reasoning` (a model that does not take the
  effort the picker offered).

## 2026-10-21 — Party mode (PR P1): the checks that need real phones

What was verified here: the Rust server's checks (`cargo test`, including a
real WebSocket relay on loopback), the whole TypeScript table
(`tests/party.*.test.ts`), the phone page in a browser against the real
runtime (two players, a steal and its cooldown ring, Go, a roll and a question
routed to the right player, a reconnect, nothing secret on the wire), and,
on the author's own phone and PC before the build, that a phone on this Wi-Fi
reaches a server on this PC (plan §7). What follows needs people, phones or a
live key. Run it from the built app: `RUSTUP_TOOLCHAIN=1.99.1 npx tauri build`,
then `src-tauri/target/release/app.exe`.

- **A real party from the installed app.** Menu → Party Mode → "Open the
  table". The lobby should show a QR code, a `http://192.168.x.x:8787/party?t=…`
  link and the network picker (on this PC the choices include a Tailscale
  address and a VPN-ish adapter; the default should be the wired
  `192.168.0.85`). Scan the QR with a phone on the same Wi-Fi: the join form
  appears. *Failure looks like:* a timeout on the phone (firewall, Public
  network or client isolation: see the lobby's help), or the phone page loading
  unstyled (a `/_next/static/...` path the bundle doesn't have: look at the
  failing request).
- **The Windows Firewall prompt on a fresh install.** The first "Open the
  table" from an installed copy should raise the prompt, once. The lobby's
  note says to allow Private networks only. The spike's rule was created for
  Private and Public together, so check which boxes the prompt really ticks.
  Decline it once and confirm the lobby's "A phone can't connect?" help covers
  it.
- **Two or more phones.** Join with two, a different colour each. Each phone
  should see both names. Take the spotlight on one, then on the other: the
  first should show the amber ring counting 15 s down, and a tap to take it
  back inside that time should be refused with a toast. Move the cooldown
  slider in the Menu and steal again: the next ring should follow it.
- **Lines need the spotlight.** On a phone without it, the text box, the
  suggestion chips and "Add to the queue" should be dead. With it, a typed line
  and a chip both appear in the queue on every phone and on the desktop strip.
- **Go from a phone, and Go from the desktop.** Either should send the queue as
  one turn; the desktop log (Debug Logs → context) should show it as
  `> Name: line` lines, one per queued line, and the strip and every phone
  should show "The GM is working…" until the turn ends. Needs a key, so it
  waits for the author's go.
- **A roll and a question go to the right phone.** Set the adventure to
  manual dice, have the GM ask player A for a roll and put a question to
  player B, by name. Each prompt should appear only on that player's phone; the
  desktop strip should say it is waiting, with "Answer here". A's answer
  ("17", or "Roll for me") and B's picks should reach the GM, and the turn
  should continue. Also tap "Answer here" on the desktop and confirm the phone's
  prompt disappears. Needs a key.
- **The GM writes each player a sheet.** Join a phone to a story that began
  solo. After a turn or two the GM should create `Character: <name>` and the
  phone's "Character" section should fill in. If it doesn't, the "Party
  Table" note (Menu → Notes, GM instructions) isn't reaching the GM. Needs a
  key.
- **A phone sleeps and wakes.** Lock a phone for a minute, unlock it: it should
  show "Reconnecting…" and then its own seat again, with its queue and sheet,
  without the join form. Then close the table and open it again: the phone
  should say it can't reach the table, and after rescanning show the join form
  with the open seat.
- **A secret never reaches a phone.** Put a `secret` note, a `gm_plan` note and
  a `hidden` note in a story and join a phone. In the phone browser's dev tools
  (Network → WS → Messages, or `chrome://inspect` on Android) read every
  message: none of those notes' text should appear. The redaction test proves
  the builder; this proves nothing else sends around it.
- **A guest Wi-Fi.** Put the phone on a guest network with client isolation:
  the page should simply fail to load, and the lobby's help names that case.
- **The table closes with the story, and with a reload.** Open the table, go
  to the library, and confirm the phone says it can't reach the table and that
  `netstat -ano | findstr 8787` shows nothing listening. Then open it again and
  reload the app window (Ctrl+R): the same should hold, and the Menu should show
  the table as closed. *Failure looks like:* a listener still on the port after
  a reload (the `on_page_load` hook in `src-tauri/src/lib.rs`).
- **Removing a player mid-prompt.** In manual dice mode, have the GM ask a
  player on a phone for a roll, then remove that player from the strip. The
  roll prompt should open on the desktop, and answering it should continue the
  turn. The removed phone should say "You were removed from the table" and
  offer "Join again" without reconnecting by itself. Needs a key.
- **Not built yet (PR P2):** the Android app's scanner and "Open in app",
  voice from a phone, and the native WebSocket. A phone cannot speak a line in
  PR P1; the transcription path is wired and tested but has no client.

## 2026-10-21 — Claude on the subscription (Route B of the Claude GM plan)

The author gave the go on 2026-10-21 and the checks were run in the built
desktop app: a played GM turn with rolls, Stop, the Designer, the choices
stage in stream mode, the cost label, side agents staying off the
subscription, and online play blocking it. The results, with numbers, are in
`claude-gm-implementation-plan.md` → "First live run". What is left:

- **Re-check the first-round fix on the subscription (needs the author's
  go: it draws on the plan).** Built but not yet tried live: the answer
  protocol now says the tools are run for the model and shows an example call,
  the Debug Logs gain a "Claude CLI run" line per run, and a first round that
  makes no call *and* claims its tools are down is retried once with a call
  required. Start five or so new stories on "Claude Sonnet (subscription)",
  give each a clear opening message ("gritty fantasy, start with a goblin
  ambush"), and note whether the very first turn comes back with a character
  sheet, mechanics and plan notes and a `start_game`. Before the fix it did
  not about half the time (1 of 2). In Settings → Debug Logs, each run has a
  "Claude CLI run" entry (model, effort, round, wall and model time, the tool
  calls that came back, `subtype`); a fired guard shows as "the first round of
  a fresh conversation claimed its tools were unavailable … retrying once",
  and its second run is the entry with `firstRoundRetry: true` (`round` also
  reads 1 after a gate's re-prompt, so use that flag, not `round`, to find a
  retry).
  *Failure looks like:* a first turn with no calls and no retry line (the
  model worded the claim in a way the detector does not know, or made no claim
  at all, so the guard stayed out of the way: tell the author the wording);
  the retry line followed by a second miss (the CLI is not honouring
  `minItems`); a gratuitous `formula_roll` for "Strike the goblin" in the
  first turn of a story that gave no fight (the protocol's example was copied
  too literally).
- **The story stage on the subscription.** The GM wrote its own prose in every
  turn so far, so the separate story stage (the one that cuts the text at the
  `[STOP]` markers) never ran. Stream mode itself is confirmed (the choices
  stage ran in it). To see the story stage: a turn where the GM's last round
  is only tool calls. *Failure looks like:* the text arriving all at once, or
  `[GAME MASTER State Update]` text left in the prose.
- **Stop with an npm-installed CLI.** Confirmed with the native `claude.exe`
  (gone within about a second). With `claude.cmd` from an npm install, Task
  Manager should show no `node.exe` running `claude` after Stop either.
- **Synced settings on the phone or the web build.** Sync from the desktop
  with a subscription tier set, then open Settings → AI Config on another
  device. A "Claude subscription" box should list the tier and say which
  default it uses there, and a turn should run on that default. (The web
  build's box was checked in the preview with the keys set by hand; a real
  sync was not.)
- **Couch co-op with the subscription.** Solo play was used for every
  subscription turn above. Two or more players on one device should run on
  the subscription as well, and so should party mode once it is on master
  (decision 30).
- **macOS and Linux.** Only Windows was built and run; the environment list
  for the child differs there (`claude_cli.rs`, `PASSED_ENV`).

## 2026-10-21 — GLM through Z.ai and OpenRouter (PR C of the Claude GM plan)

Request shaping is unit-tested (`tests/providerCall.zai.test.ts`); no
request has reached Z.ai. A played turn spends the author's Z.ai credit, so
it waits for the author's go.

- **One played turn on "GLM 5.3 (Z.ai)".** Save a Z.ai API key (Settings →
  API Keys, "Z.ai API key (pay-as-you-go, not the Coding Plan)"), set tier 1
  to "GLM 5.3 (Z.ai)" and play a turn in a combat scene so the GM rolls. The
  GM should call `formula_roll`, then narrate; the Debug Logs should show
  "AI generation (stream) complete" lines with `provider: "zai"` and no
  error. Do it once in the desktop app too (`tauri build`), which can reach
  only `https://api.z.ai/api/paas/*`. *Failure looks like:* a 400 naming
  `thinking`, `reasoning_effort` or `tool_choice` (Z.ai changed what GLM-5.3
  accepts); "url not allowed on the configured scope" in the desktop app
  (the allowlist); a 401 or "insufficient balance" with a key that only has
  a GLM Coding Plan behind it - expected, because the plan does not cover
  the general API. Tier 1 runs at effort `none`, which adds the GM's
  `<thinking>` prefill; it is dropped from round 2 on, so `<thinking>` text
  in the prose or a 400 on round 2 would mean it was not.
- **The roll gate on Z.ai.** In the same scene, a turn where the GM first
  narrates without rolling: the gate's re-prompt should get a roll on the
  next round. Z.ai accepts only `tool_choice: "auto"`, so the forcing rests
  on the re-prompt alone. *Failure looks like:* the gate firing twice, then
  prose without a roll.
- **"GLM 5.3 Flash (Z.ai)" as the narration voice.** One turn where the GM
  rolls, so the story stage runs on Flash. *Failure looks like:* "model not
  found" (the id `glm-5.3-flash` is wrong) or a 400 about `stop` (Z.ai takes
  one stop word, and the app sends one).
- **Z.ai's content moderation.** Z.ai's direct API moderates content (error
  code 1301), so a violent or mature scene can fail a turn there that
  OpenRouter's other hosts would answer. Worth knowing before choosing it
  for a dark campaign; not something the app can change.
- **GLM 5.3 through OpenRouter.** With only an OpenRouter key, one turn on
  "GLM 5.3 Flash". Compare the turn cost panel with openrouter.ai/activity:
  the catalog prices it at Z.ai's own $0.15 / $0.50, but OpenRouter may
  route to a cheaper or dearer provider.

## 2026-10-21 — Claude through OpenRouter (Route A of the Claude GM plan)

Request shaping is unit-tested (`tests/providerCall.anthropic.test.ts`), but
no request has reached Claude: a played turn spends the author's OpenRouter
credit, so it waits for the author's go (`claude-gm-implementation-plan.md`
§5).

- **One played turn on Claude Sonnet 5.5.** With an OpenRouter key saved,
  set the tier-1 slot (Settings → AI Config) to "Claude Sonnet 5.5", leave
  its effort at `none`, and play a turn that needs a roll (an attack in a
  combat scene). The GM should call `formula_roll`, then narrate. Then open
  Settings → Debug Logs and read the "AI generation (stream) complete"
  lines: round 1 should show `cacheWriteTokens` in the thousands, round 2
  `cachedTokens` about the same size. *Failure looks like:* a 400 naming
  `budget_tokens` or `thinking` (OpenRouter turning `reasoning.effort` into a
  thinking budget for this model: the effort branch in `applyReasoningEffort`
  needs another shape); a 400 about a thinking block or edited history in
  round 2 (the replay rule in `buildRequestMessages` keeps a block Claude
  will not take); `cachedTokens` 0 in round 2 (the breakpoint is not
  reaching Anthropic, or the prefix before it changed between rounds).
- **The turn's cost matches OpenRouter's bill.** For Claude the ledger takes
  OpenRouter's own `usage.cost`, which prices the cache. The turn cost
  panel's figure for that turn should match openrouter.ai/activity to the
  cent, and round 2 should cost a fraction of round 1. *Failure looks like:*
  round 2 billed about the same as round 1 (no `cost` in the usage, so the
  list-price fallback ran). The "Cost per turn" *estimate* above the tiers
  still uses list prices and will read high for Claude; that is known.
- **Escalating into a Claude tier mid-turn.** Put Claude Opus 5.5 on tier 3
  only, keep Mistral on the others, and play a turn where the GM calls
  `set_reasoning_tier` to go up. The round after the switch continues a tool
  loop another model started, with no thinking block (or Sonnet's, on a
  Sonnet→Opus switch). The turn should carry on. *Failure looks like:* the
  turn fails with an OpenRouter error about thinking blocks; a stream error
  has no tier fallback, so the whole turn errors out.
- **Narration on Claude after a tool round.** Set the narration voice to a
  Claude model, play a turn where the GM rolls, then retry that turn. The
  story stage sends the GM's tool calls and results without a `tools`
  list. *Failure looks like:* a 400 about `tool_use` blocks without tools
  (Anthropic has rejected that before; whether OpenRouter papers over it is
  unknown).
- **The Game Designer on Claude.** Point the Designer at Claude Sonnet 5.5
  (Settings → Architecture) and ask for something that makes it write a
  note. Its draft-state system message comes after the history and changes
  every round. *Failure looks like:* the second round of a tool loop failing
  with an error about thinking blocks or edited history.
- **A side agent on Claude.** Point the Memory Keeper and the Observer at
  Claude Haiku 5.5 and play two turns. Memories should be written and the
  Observer's verdicts should appear in the Debug Logs. Their 200–300 token
  caps are raised to 4,096 for Claude, because thinking counts against the
  cap. *Failure looks like:* no memories and no warnings, which means the
  output was used up by thinking.

## 2026-10-21 — side agents on the narration model (PR #204, decision 19)

A played turn needs the author's keys, so it waits for their go.

*Superseded in part by decision 51 (2026-10-21):* an unpinned side agent no
longer follows the narration model, it runs on Claude Haiku 5.5. Mistral then
retired Small 3.2 (`mistral-small-2506`), so a pin on it now runs on Mistral
Small 4 (`mistral-small-2603`; `LEGACY_MODEL_KEY_ALIASES`). Read
"Mistral Small 3.2" in the checks below as "the model the layer is pinned to":
pin the layers (Settings → Architecture) to a Mistral model to run them. The
failure they guard against, a side call naming `mistral-small-2506` and
falling back to DeepSeek V4 Flash, is still the thing to look for, and the
new default is checked under the catalog refresh above.

- **Side agents with only a Mistral key.** Save only a Mistral key, leave
  every Settings → Architecture override off, and play a few turns. The
  Debug Logs should show the Observer's judges, the Memory Keeper and (every
  10th turn) the Story Progress Observer calling **Mistral Small 3.2**, the
  Memory tab should gain entries, and there should be no "Side call failed"
  warnings. *Failure looks like:* `Model key "mistral-small-2506" not found,
  falling back to DeepSeek V4 Flash` in the console, then `NO_API_KEY` side
  call failures (the pre-#204 behaviour). Without #204 the PR #191 side-call
  check below fails the same way.
- **Mistral Small 3.2 as Observer judge.** For players without a DeepSeek
  key the Observer now runs, and can rewrite or reset a turn, for the first
  time. Over a dozen turns, note whether its flags (Debug Logs, "observer")
  look sensible or fire on clean turns. Too many false flags means pinning
  the Observer to a stronger model, or a different default.

## 2026-10-21 — Stop cancels the provider call in the native apps

The unit tests (`tests/providerFetch.abort.test.ts`) mock the platform fetch;
these need a live key, so they wait for the author's go.

- **Stop mid-turn in the desktop app.** With a key saved, start a turn on a
  model that thinks visibly and press Stop while the GM's reasoning is still
  streaming. The stream should stop within a second, no further GM round or
  story stage should start, and the scene should revert to before the turn.
  On OpenRouter, the Activity page should show that generation cut short
  (far fewer output tokens than a finished turn). Expect a failure toast
  reading "Error: signal is aborted without reason", possibly twice. The web
  build shows the same toast on Stop, so it is not part of this fix; before
  the fix, the desktop app showed "Generation cancelled by user" once the
  round had run out. *Failure looks like:* the
  reasoning keeps streaming after Stop and the turn runs to its end (the
  signal is not reaching Tauri's fetch), or a "Request cancelled" error
  instead of the ordinary cancellation (the AbortError normalisation in
  `providerCall.ts`).
- **Stop mid-turn on Android or iOS**, once a mobile build exists. The UI
  should stop at once, as on the desktop. The provider request itself runs to
  completion and is billed in full: Capacitor's patched `fetch` ignores the
  abort signal, so this is expected, not a failure.

## 2026-10-21 — the native fixes merged after the health check

None of these could run here: they need the author's own API keys (spending
real money), a second person or device, an Android SDK, or a Mac.

- **OpenRouter sign-in in the desktop app (PR #201).** Install the build from
  `npx tauri build`, open Settings → API keys, choose "connect with
  OpenRouter". The system browser should open on openrouter.ai; after
  signing in it shows a code. Paste it into the app's field: the OpenRouter
  key should appear as saved, and a turn should then reach OpenRouter.
  *Failure looks like:* nothing opens (the opener plugin or its `https://*`
  scope in `src-tauri/capabilities/default.json`), or "OpenRouter rejected
  that code" right after a fresh code (the PKCE verifier was not kept).
- **AI side calls in the desktop app with a live key (PR #191).** With only a
  Mistral key saved, play a story long enough to pass the compaction point.
  The Debug Logs should show the Observer and Memory Keeper running, a scene
  summary should appear, and no "Side call failed" warnings. *Failure looks
  like:* a `SyntaxError: Unexpected token '<'` (a call still hitting
  `/api/*`, which Tauri answers with `index.html`).
- **The Game Designer in the desktop app (PR #191).** With a key saved, open
  the creator and send one message. The Designer should reply, and its tool
  calls should edit the draft.
- **TTS and sync in the desktop app (PR #191 added the allowlist hosts).**
  Play a line through Cartesia or ElevenLabs; push and pull through Settings
  → Sync. *Failure looks like:* `url not allowed on the configured scope`
  in the console — a host missing from `src-tauri/capabilities/default.json`.
  A custom sync domain needs its own entry there.
- **The text invite between two devices (PR #198).** Host an online game in
  the desktop app and "Copy invite link": the clipboard should hold a
  sentence with the room code and connection type, not a
  `tauri.localhost` URL. A second device should join with that code
  through "Join a Game".
- **Android and iOS builds.** Never built. `build-apps.yml` (manual
  `workflow_dispatch`) builds an unsigned debug APK and an iOS simulator
  build; triggering it uses the author's Actions minutes, so it waits for
  the author's go. PR #201 changed `android/` and `ios/` project files for
  `@capacitor/browser`.
- **macOS and Linux desktop builds.** Only Windows has been built. On macOS
  and Linux the app origin is `tauri://localhost`, not `http://tauri.localhost`.
