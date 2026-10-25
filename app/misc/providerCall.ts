/**
 * Shared AI-provider call logic for the generate/generate-stream "thin proxy"
 * endpoints. Extracted so the exact same request-building/response-parsing
 * code can run in two places:
 *
 *  - The Next.js API routes (app/api/generate, app/api/generate-stream),
 *    used by the normal web build (hosted on Vercel) - the browser calls our
 *    server, our server calls the provider. No CORS concerns since this is a
 *    server-to-server call either way.
 *  - Directly from the client (app/misc/providerFetch.ts) in the standalone
 *    desktop/mobile build (Tauri/Capacitor), which ships no server at all -
 *    the browser/webview calls the provider directly.
 *
 * Both callers get identical behavior (same providers, same prefill/tool
 * quirks, same streaming event shape) since it's the same code either way -
 * see providerFetch.ts for how the standalone path is selected.
 */

import { getModelConfig, AIModelConfig } from "@/app/misc/ai_prices";
import { logger } from "@/app/misc/logger";
import { CustomModel } from "@/app/misc/user_settings";
import {
  extractFallbackToolCalls,
  stripLeakedToolCallMarkup,
} from "@/app/misc/toolCallFallback";
import {
  SamplingSettings,
  filterSettingsForProvider,
} from "@/app/misc/samplingSettings";
import {
  getAbortableProviderFetch,
  hostOf,
  markHostDown,
} from "@/app/misc/platformFetch";

export type Provider =
  | "deepseek"
  | "openrouter"
  | "mistral"
  | "deepinfra"
  | "google"
  // Z.ai's general pay-as-you-go API (decision 18), never its Coding Plan.
  | "zai"
  // The player's Claude subscription through the `claude` CLI, desktop only.
  // providerFetch.ts hands these to claudeCli.ts before anything here runs.
  | "claude-cli";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  reasoning?: string;
  reasoning_details?: any[];
  tool_calls?: any[];
  tool_call_id?: string;
  /**
   * The last message of a prefix the caller keeps byte-identical across the
   * requests that follow. Providers with explicit prompt caching (Claude) put
   * a cache breakpoint here; everyone else ignores it. Three kinds, by how
   * long the prefix lives (see buildRequestMessages):
   * - "prefix": the end of history, reused by the next turn;
   * - "turn": the end of the player's action, reused by every round of this turn;
   * - "round": the latest message of a round, reused by the next round.
   */
  cacheBreakpoint?: "prefix" | "turn" | "round";
}

export interface GenerateRequestBody {
  messages: ChatMessage[];
  tools?: any[];
  // Caller-forced tool_choice (e.g. the M2 roll-invariant gate's retry
  // round, generation.ts). "required" forces a call. "auto" is an explicit
  // choice (a system's turn-end reminder, decision 183): the model may decline
  // the tool, which Google could not do while an unset choice meant
  // "required" there. Unset falls back to the provider's normal default.
  toolChoice?: "required" | "auto";
  model?: string;
  maxTokens?: number;
  temperature?: number;
  openRouterKey?: string;
  deepseekKey?: string;
  googleKey?: string;
  mistralKey?: string;
  deepinfraKey?: string;
  zaiKey?: string;
  customModel?: CustomModel;
  // Streaming-only extras - ignored by generateNonStreaming.
  samplingSettings?: SamplingSettings;
  stop?: string[];
  // Reasoning-tier router: "none" | "low" | "normal" | "high" | "xhigh" -
  // best-effort, translated per-provider below. Ignored by providers/models
  // with no lever for it.
  reasoningEffort?: string;
  // A stable id for the conversation this request belongs to (`ys:<storyId>:gm`),
  // so providers with sticky caching can route a story's requests together.
  // Mistral takes it as `prompt_cache_key`, OpenRouter as `session_id`.
  cacheKey?: string;
}

interface AIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string | null;
      reasoning?: string;
      // DeepSeek's native API returns chain-of-thought here, not `reasoning`.
      reasoning_content?: string;
      reasoning_details?: any[];
      tool_calls?: any[];
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimated_cost?: number; // DeepInfra provides this in dollars
    // OpenRouter: tokens read from / written to the prompt cache (Claude
    // only writes when the request marks a breakpoint). Logged, not priced.
    prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
    // DeepSeek's own API reports its cache here instead.
    prompt_cache_hit_tokens?: number;
  };
}

/**
 * Input tokens a call was served from the provider's prompt cache, and
 * tokens it wrote to one, from whichever usage shape the provider sends:
 * OpenAI-style `prompt_tokens_details` (OpenRouter, Mistral, Z.ai, DeepInfra,
 * Grok, Gemini) or DeepSeek's `prompt_cache_hit_tokens`. Zero and absent
 * figures read as undefined, so a provider that reports nothing and one that
 * reports a miss look the same.
 */
export function readCacheUsage(
  provider: Provider,
  usage:
    | {
        prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
        prompt_cache_hit_tokens?: number;
      }
    | null
    | undefined,
): { cachedTokens?: number; cacheWriteTokens?: number } {
  if (!usage) return {};
  const cached =
    provider === "deepseek"
      ? usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens
      : usage.prompt_tokens_details?.cached_tokens;
  const written = usage.prompt_tokens_details?.cache_write_tokens;
  return {
    ...(cached ? { cachedTokens: cached } : {}),
    ...(written ? { cacheWriteTokens: written } : {}),
  };
}

export interface GenerateSuccess {
  content: string;
  reasoning: string;
  reasoning_details: any[];
  toolCalls: any[];
  /**
   * Why the model stopped (`stop`, `length`, ...), when the provider said. The
   * Observer's rewrite reads it: a reply cut off by the token limit is not a
   * rewritten narration (judge-layer design 3.5).
   */
  finishReason?: string;
  meta: {
    model: string;
    modelName: string;
    provider: Provider;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      /** Of promptTokens, how many came from the provider's prompt cache. */
      cachedTokens?: number;
      /** Tokens written to the cache by this call. */
      cacheWriteTokens?: number;
    };
    /** Provider-reported cost in dollars, when the provider sends one. */
    estimatedCost?: number;
  };
}

export interface GenerateError {
  error: string;
  status: number;
  code?: string;
}

/**
 * Filter tools for Google/Gemini to stay within schema complexity limits.
 * Google's API can only handle ~25-30 tools with complex schemas.
 * We keep only the most essential GM tools.
 */
export const GOOGLE_ESSENTIAL_TOOLS = new Set([
  // Fantastic Realms (systems/fantastic-realms): offered only to its stories
  "manage_feats",
  "feat_roll",
  "initiative_roll",
  "award_xp",
  "take_rest",
  // Core rolling
  "formula_roll",
  "opposed_formula",
  "fate_question",
  // The roll gate's message names it (gateMessages.ts), so Gemini must have it.
  "gm_roll",
  // Required alongside the dice tools, not optional: they report numbers and
  // `calculate` is the only thing that turns those into a pass/fail verdict.
  "calculate",
  // Lookup
  "search_notes",
  "read_notes",
  "search_memory",
  // Tracking
  "create_note",
  "edit_note",
  // NPC management
  "add_npc",
  "update_npc",
  "npc_reaction",
  // Combat essentials
  "start_combat",
  "end_combat",
  "add_combatant",
  "update_combatant_stat",
  "npc_roll",
  // Pictures (only present in the request when imageToolAvailable)
  "generate_image",
  // Session zero ends with start_game, challenges are a three-call loop, and
  // increment_scene is the scene counter (status report 6.14: without these
  // Gemini could not end session zero or run a challenge).
  "start_game",
  "confirm_setup",
  "ask_question",
  "start_challenge",
  "record_challenge_result",
  "cancel_challenge",
  "increment_scene",
  // The campaign record (clocks, fronts, secrets, clues)
  "campaign",
  // System tools (only present for stories that use a system, decision 79).
  "manage_meter",
  "manage_track",
  "end_session",
  "action_roll",
]);

function filterToolsForGoogle(tools: any[]): any[] {
  return tools.filter(
    (t) => t?.function?.name && GOOGLE_ESSENTIAL_TOOLS.has(t.function.name),
  );
}

/**
 * Normalize tool call IDs for Mistral API compatibility.
 * Mistral requires tool_call_id to be exactly 9 alphanumeric characters (a-z, A-Z, 0-9).
 * Other providers (DeepSeek, OpenRouter) may use formats like "call_36383327".
 * This function creates a consistent mapping for the request.
 */
function normalizeMistralToolCallIds(messages: ChatMessage[]): ChatMessage[] {
  const idMap = new Map<string, string>();
  let counter = 0;

  const generateId = () => {
    const chars =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const prefix = "tc";
    const num = (counter++).toString().padStart(7, "0");
    if (num.length > 7) {
      let result = "";
      for (let i = 0; i < 9; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    }
    return prefix + num;
  };

  for (const msg of messages) {
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (tc.id && !idMap.has(tc.id)) {
          if (/^[a-zA-Z0-9]{9}$/.test(tc.id)) {
            idMap.set(tc.id, tc.id);
          } else {
            idMap.set(tc.id, generateId());
          }
        }
      }
    }
  }

  return messages.map((msg) => {
    const newMsg = { ...msg };
    if (newMsg.tool_calls) {
      newMsg.tool_calls = newMsg.tool_calls.map((tc: any) => ({
        ...tc,
        id: idMap.get(tc.id) || tc.id,
      }));
    }
    if (newMsg.tool_call_id) {
      newMsg.tool_call_id =
        idMap.get(newMsg.tool_call_id) || newMsg.tool_call_id;
    }
    return newMsg;
  });
}

/**
 * OpenRouter routes this model to Anthropic's Claude: an `anthropic/…` model
 * id, whether from the catalog or a custom model the player added. Claude 5.5
 * returns a 400 for four things this app sends other providers - sampling
 * parameters, a trailing assistant prefill, a forced `tool_choice`, and
 * reasoning effort "none" (its thinking cannot be turned off) - so each of
 * those sites branches on this (docs/claude-gm-design.md §3.2).
 */
export function isAnthropicViaOpenRouter(
  config: Pick<AIModelConfig, "provider" | "model">,
): boolean {
  return (
    config.provider === "openrouter" &&
    config.model.toLowerCase().startsWith("anthropic/")
  );
}

/**
 * OpenRouter models that cannot be sent a forced tool choice
 * (`tool_choice: "required"`): the Qwen 3.8 family, which thinks by default
 * and is reported to answer a forced tool call made with thinking on with a
 * 400 (APIYI's Qwen3.8-Max reference, and the 2026-10-21 model research).
 * OpenRouter itself lists `tool_choice` among Qwen 3.8's supported
 * parameters, so this is a safeguard for an upstream limit it does not
 * advertise. They get "auto" like Claude: the roll and plan gates' own user
 * message does the forcing.
 */
export function modelRejectsForcedToolChoice(
  config: Pick<AIModelConfig, "provider" | "model">,
): boolean {
  return (
    config.provider === "openrouter" &&
    config.model.toLowerCase().startsWith("qwen/qwen3.8")
  );
}

/**
 * Models whose thinking cannot be turned off: Claude 5.5 through OpenRouter,
 * and GLM-5.3 whether straight from Z.ai or through OpenRouter
 * (`z-ai/glm-5.3…`). They get the max_tokens floor below, never effort
 * "none", and the mid-history prefill dropped.
 */
function alwaysThinks(config: Pick<AIModelConfig, "provider" | "model">, provider: Provider): boolean {
  return (
    isAnthropicViaOpenRouter(config) ||
    provider === "zai" ||
    (provider === "openrouter" && config.model.toLowerCase().startsWith("z-ai/glm-5.3"))
  );
}

/**
 * Models whose reasoning cannot be turned off, for the two rules that follow
 * from that alone: effort "none" (or none at all) goes out as "low", and
 * max_tokens never drops below ALWAYS_THINKING_MIN_MAX_TOKENS. That is
 * alwaysThinks, plus the OpenRouter models flagged `reasoningMandatory` in
 * the catalog (Grok 4.5 and 4.7, Qwen 3.8 Max, GPT-6.1 Sol, MiniMax M2),
 * which OpenRouter says reject `effort: "none"`. The prefill handling stays
 * on alwaysThinks: nothing says those models refuse a prefill.
 */
function reasoningCannotBeTurnedOff(
  config: Pick<AIModelConfig, "provider" | "model" | "reasoningMandatory">,
  provider: Provider,
): boolean {
  return (
    alwaysThinks(config, provider) ||
    (provider === "openrouter" && config.reasoningMandatory === true)
  );
}

/**
 * The smallest `max_tokens` a request to a model that always thinks goes out
 * with: Claude 5.5 and GLM-5.3, neither of which can turn thinking off. Thinking counts against `max_tokens`, so the 200-300 token caps the
 * side agents use for a short verdict can be spent before any text arrives;
 * and OpenRouter documents turning `reasoning.effort` into a thinking budget
 * of at least 1,024 tokens that must stay below `max_tokens`. A cap, not a
 * charge: the reply is as short as the prompt asks for.
 */
const ALWAYS_THINKING_MIN_MAX_TOKENS = 4096;

/**
 * The max_tokens a request for `modelKey` actually goes out with: `maxTokens`,
 * raised to ALWAYS_THINKING_MIN_MAX_TOKENS where that floor applies. The GM
 * loop compares these, not the raw caps, before asking a cut-off round again
 * (decision 196), so a raise the floor swallows is not paid for twice.
 */
export function sentMaxTokens(modelKey: string, maxTokens: number): number {
  const config = getModelConfig(modelKey);
  return reasoningCannotBeTurnedOff(config, config.provider as Provider)
    ? Math.max(maxTokens, ALWAYS_THINKING_MIN_MAX_TOKENS)
    : maxTokens;
}

/**
 * Z.ai's general chat-completions endpoint - the only Z.ai URL this app
 * calls. The Coding Plan's endpoints (`/api/coding/paas/v4`, `/api/anthropic`)
 * are for Z.ai's supported coding tools only (decision 18), and the desktop
 * allowlist admits `/api/paas/*` alone, so a Coding Plan key cannot be spent
 * through the app by accident.
 */
export const ZAI_CHAT_COMPLETIONS_URL = "https://api.z.ai/api/paas/v4/chat/completions";

/** Z.ai takes `temperature` only in [0, 1]. */
function clampTemperature(provider: Provider, temperature: number): number {
  return provider === "zai" ? Math.min(1, Math.max(0, temperature)) : temperature;
}

/**
 * Claude only: OpenRouter's own billed figure for the call, which prices the
 * prompt cache (reads at a tenth of the input price); list-price arithmetic
 * on `prompt_tokens` would bill a cached GM round about 20 times over. With
 * OpenRouter's BYOK the provider's charge is reported separately from
 * OpenRouter's fee.
 */
function openRouterBilledUsd(usage: unknown): number | undefined {
  const u = usage as
    | { cost?: number; is_byok?: boolean; cost_details?: { upstream_inference_cost?: number } }
    | undefined;
  if (typeof u?.cost !== "number") return undefined;
  const upstream = u.is_byok ? (u.cost_details?.upstream_inference_cost ?? 0) : 0;
  return u.cost + upstream;
}

/**
 * Best-effort reasoning-effort translation per provider. Never throws - if a
 * provider/model has no lever for it, the field is simply omitted. Real
 * protection against a bad interaction is the reasoning-tier router's
 * fallback-to-lower-tier logic (app/misc/reasoningTiers.ts), not this.
 */
function applyReasoningEffort(
  requestBody: any,
  provider: Provider,
  reasoningEffort?: string,
  isClaude = false,
  thinksAlways = false,
): void {
  // Claude 5.5's thinking cannot be disabled ("none" is a 400), so a slot
  // set to "none" runs at the lowest effort Claude has instead. The missing-
  // effort half of this check is a backstop: every caller now sends an effort
  // (decision 53), so a call arriving without one is a bug upstream, and it
  // runs at low rather than at Claude's own default effort, which would make
  // the call slower and dearer.
  if (isClaude && (!reasoningEffort || reasoningEffort === "none")) {
    requestBody.reasoning = { effort: "low" };
    return;
  }

  // GLM-5.3 through OpenRouter (the same model as Z.ai's) and the OpenRouter
  // models flagged reasoningMandatory (reasoningCannotBeTurnedOff): never
  // "none", which they reject, and a call with no effort (the same backstop)
  // runs at low rather than the model's own default.
  if (
    thinksAlways &&
    !isClaude &&
    provider === "openrouter" &&
    (!reasoningEffort || reasoningEffort === "none")
  ) {
    requestBody.reasoning = { effort: "low" };
    return;
  }

  // Z.ai's GLM-5.3 always thinks and takes reasoning_effort low, high or max
  // only (docs.z.ai, chat completions), so the tier's five levels collapse
  // onto those three and thinking is turned on explicitly. "none" runs at low,
  // and so does a call with no effort (the same backstop): Z.ai's default is
  // max.
  if (provider === "zai") {
    requestBody.thinking = { type: "enabled" };
    requestBody.reasoning_effort =
      reasoningEffort === "xhigh"
        ? "max"
        : reasoningEffort === "normal" || reasoningEffort === "high"
          ? "high"
          : "low";
    return;
  }

  // DeepSeek V4's thinking mode is an explicit toggle (`thinking.type`) that
  // DEFAULTS to enabled server-side, so it must be handled before the early
  // return below - including the "none"/undefined case, where we explicitly
  // DISABLE it. Two reasons to disable at effort "none": it matches the tier
  // system's intent (cheap turns skip reasoning), and thinking mode silently
  // rejects temperature/top_p/presence_penalty/frequency_penalty, which the
  // creative-narration tiers rely on. When we DO enable it, strip those
  // unsupported sampling params so the request stays valid.
  if (provider === "deepseek") {
    const wantsThinking = !!reasoningEffort && reasoningEffort !== "none";
    requestBody.thinking = { type: wantsThinking ? "enabled" : "disabled" };
    if (wantsThinking) {
      // DeepSeek maps low/medium -> high and xhigh -> max in thinking mode.
      requestBody.reasoning_effort =
        reasoningEffort === "xhigh" ? "max" : "high";
      delete requestBody.temperature;
      delete requestBody.top_p;
      delete requestBody.presence_penalty;
      delete requestBody.frequency_penalty;
    }
    return;
  }

  // OpenRouter's reasoning.effort enum accepts an explicit "none" value that
  // actually disables reasoning - unlike simply omitting the field, which
  // falls back to whatever the model itself defaults to. Some models default
  // to reasoning ON, so a tier assigned effort "none" has to send this
  // explicitly or it silently keeps paying for reasoning tokens the tier
  // system believes it turned off - see turnCost.ts's
  // REASONING_OUTPUT_MULTIPLIER, which assumes "none" means no reasoning
  // overhead at all. A model whose reasoning is mandatory (Grok 4.5, among
  // others) rejects "none" instead; it never reaches this line, because the
  // branch above sends it "low".
  if (provider === "openrouter" && reasoningEffort === "none") {
    requestBody.reasoning = { effort: "none" };
    return;
  }

  if (!reasoningEffort || reasoningEffort === "none") return;

  if (provider === "mistral") {
    // Mistral only accepts "high" | "none" - collapse the 5-level scale.
    requestBody.reasoning_effort = "high";
  } else if (provider === "openrouter") {
    // OpenRouter accepts none/low/medium/high/xhigh/max across supported model families.
    const effortMap: Record<string, string> = {
      low: "low",
      normal: "medium",
      high: "high",
      xhigh: "xhigh",
    };
    const mapped = effortMap[reasoningEffort];
    if (mapped) {
      requestBody.reasoning = { effort: mapped };
    }
  }
  // deepinfra/google: no confirmed lever for the models this app targets -
  // left as a no-op rather than guessing at an unverified param.
}

function getApiKey(
  provider: Provider,
  body: Pick<
    GenerateRequestBody,
    "openRouterKey" | "deepseekKey" | "googleKey" | "mistralKey" | "deepinfraKey" | "zaiKey"
  >,
): string | null {
  if (provider === "deepseek") return body.deepseekKey || null;
  if (provider === "mistral") return body.mistralKey || null;
  if (provider === "deepinfra") return body.deepinfraKey || null;
  if (provider === "google") return body.googleKey || null;
  if (provider === "zai") return body.zaiKey || null;
  if (provider === "claude-cli") return null; // the CLI's own sign-in, never a key
  return body.openRouterKey || null;
}

const PROVIDER_NAMES: Record<Provider, string> = {
  deepseek: "DeepSeek",
  openrouter: "OpenRouter",
  google: "Google AI Studio",
  mistral: "Mistral",
  deepinfra: "DeepInfra",
  zai: "Z.ai",
  "claude-cli": "Claude (subscription)",
};

/** Check if a string looks like a UUID (custom model ID). */
function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    str,
  );
}

/**
 * Resolve a model key to its config. Custom models are defined client-side
 * (stored in localStorage) and sent directly in the request body.
 */
function resolveModelConfig(
  modelKey: string,
  customModel?: CustomModel,
): { config: AIModelConfig; actualModelId: string } {
  if (!isUUID(modelKey)) {
    const config = getModelConfig(modelKey);
    return { config, actualModelId: config.model };
  }

  if (customModel) {
    const config: AIModelConfig = {
      name: customModel.name,
      original_model: customModel.modelId,
      model: customModel.modelId,
      maxTokens: customModel.contextSize,
      maxOutputTokens: customModel.maxOutputTokens,
      provider: "openrouter",
      supportsToolCalling: true,
      inputPrice: customModel.inputPrice || 0,
      outputPrice: customModel.outputPrice || 0,
      finetunes: [],
      strengths: [],
      weaknesses: [],
      description: "Custom user-defined model",
      bannerUrl: undefined,
    };
    return { config, actualModelId: customModel.modelId };
  }

  console.warn(
    `Custom model UUID "${modelKey}" was not provided in the request, falling back to default`,
  );
  const config = getModelConfig(modelKey);
  return { config, actualModelId: config.model };
}

/**
 * `tool_choice` for a request that offers tools. Google always gets
 * "required"; a caller-forced round (the roll and plan gates) gets
 * "required" - except on Claude, where forced tool use is a 400, on Qwen 3.8
 * (modelRejectsForcedToolChoice), and on Z.ai, which accepts only "auto".
 * There the gate's own user message, which already says a tool call is
 * required, does the forcing. `autoOnly` is true for the first two. A caller
 * that asks for "auto" outright gets it from every provider, Google included.
 */
function resolveToolChoice(
  provider: Provider,
  toolChoice: GenerateRequestBody["toolChoice"],
  autoOnly: boolean,
): "required" | "auto" {
  if (autoOnly || provider === "zai" || toolChoice === "auto") return "auto";
  return toolChoice === "required" || provider === "google" ? "required" : "auto";
}

function buildEndpoint(provider: Provider, hasPrefill: boolean, hasTools: boolean): string {
  if (provider === "deepseek") {
    // Use beta endpoint for prefill support (prefix: true requires beta API)
    // BUT: DeepSeek beta doesn't support prefix + function calling together
    // So only use beta for non-tool calls (story generation)
    return hasPrefill && !hasTools
      ? "https://api.deepseek.com/beta/chat/completions"
      : "https://api.deepseek.com/chat/completions";
  }
  if (provider === "mistral") return "https://api.mistral.ai/v1/chat/completions";
  if (provider === "deepinfra")
    return "https://api.deepinfra.com/v1/openai/chat/completions";
  if (provider === "google")
    return "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
  if (provider === "zai") return ZAI_CHAT_COMPLETIONS_URL;
  return "https://openrouter.ai/api/v1/chat/completions";
}

/**
 * Set once Mistral answers a request with a 400 or 422 that names
 * `prompt_cache_key` (decision 105: Mistral Small 3.2's support is
 * unconfirmed). From then on, this session's Mistral requests leave it out.
 */
let mistralCacheKeyRejected = false;

/**
 * Set when OpenRouter refuses the 1-hour cache TTL (decision 186). It was
 * written from the docs and not yet seen working live, so a 400 that names
 * it is answered by sending the request once more without it, and the rest
 * of the session uses the 5-minute cache only: a refused field must never
 * stop every Claude turn.
 */
let cacheTtlRejected = false;

/** Test hook: forget a TTL rejection. */
export function resetCacheTtlRejected(): void {
  cacheTtlRejected = false;
}

/** Removes every `ttl` from the request's cache_control parts, in place. */
function stripCacheTtl(requestBody: Record<string, unknown>): void {
  const messages = requestBody.messages;
  if (!Array.isArray(messages)) return;
  for (const m of messages as Array<{ content?: unknown }>) {
    if (!Array.isArray(m.content)) continue;
    for (const part of m.content as Array<{ cache_control?: { ttl?: string } }>) {
      if (part.cache_control?.ttl) delete part.cache_control.ttl;
    }
  }
}

/** Test hook: forget a rejection. */
export function resetMistralCacheKeyRejected(): void {
  mistralCacheKeyRejected = false;
}

/** The caller's stable conversation id, in each provider's own field. */
function applyCacheKey(requestBody: Record<string, unknown>, provider: Provider, cacheKey: string | undefined): void {
  if (!cacheKey) return;
  if (provider === "mistral" && !mistralCacheKeyRejected) {
    requestBody.prompt_cache_key = cacheKey;
  } else if (provider === "openrouter") {
    // Keeps OpenRouter routing a story to one upstream provider, and so to its
    // warm cache, for the whole session. OpenRouter caps the id at 128 chars.
    requestBody.session_id = cacheKey.slice(0, 128);
  }
}

/**
 * POSTs a chat request. A Mistral request that carries `prompt_cache_key` and
 * is refused for it is sent once more without it, and later requests skip it.
 */
async function postChatRequest(
  endpoint: string,
  headers: Record<string, string>,
  requestBody: Record<string, unknown>,
  provider: Provider,
  signal: AbortSignal | undefined,
): Promise<Response> {
  const providerFetch = getAbortableProviderFetch(endpoint);
  const send = async () => {
    try {
      return await providerFetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal,
      });
    } catch (error) {
      // A network error before any response from the Android WebView's own
      // fetch most likely means the host stopped answering CORS preflights.
      // Take it off the list for the session, but never replay: the POST may
      // have reached the provider and been billed. The player's Retry goes
      // the native way. An abort is not a host fault.
      if (error instanceof TypeError && signal?.aborted !== true) {
        const downHost = hostOf(endpoint);
        markHostDown(downHost);
        logger.warn(
          `Android WebView fetch failed; ${downHost} now uses native HTTP for this session`,
          { host: downHost, error: error.message },
        );
      }
      throw error;
    }
  };
  const response = await send();
  if (
    !response.ok &&
    provider === "mistral" &&
    requestBody.prompt_cache_key !== undefined &&
    (response.status === 400 || response.status === 422)
  ) {
    const text = await response.clone().text().catch(() => "");
    if (text.includes("prompt_cache_key")) {
      mistralCacheKeyRejected = true;
      delete requestBody.prompt_cache_key;
      logger.action("Mistral rejected prompt_cache_key - retrying without it", {
        status: response.status,
      });
      return send();
    }
  }
  if (
    !response.ok &&
    provider === "openrouter" &&
    response.status === 400 &&
    JSON.stringify(requestBody.messages ?? "").includes('"ttl"')
  ) {
    const text = await response.clone().text().catch(() => "");
    if (/\bttl\b|cache_control/i.test(text)) {
      cacheTtlRejected = true;
      stripCacheTtl(requestBody);
      logger.warn("OpenRouter rejected the 1-hour cache TTL - retrying with the 5-minute cache, and using it for the rest of the session", {
        status: response.status,
        detail: text.slice(0, 200),
      });
      return send();
    }
  }
  return response;
}

function buildHeaders(provider: Provider, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = process.env.NEXT_PUBLIC_SITE_URL || "";
    headers["X-Title"] = "Endless Adventure";
  }
  return headers;
}

/**
 * Models that always think (Claude, GLM-5.3): within the current turn (after
 * the last user message), drop a plain assistant message (no tool calls, no
 * reasoning) that sits directly before another assistant message carrying
 * tool calls or reasoning. In practice that is the GM stage's `<thinking>`
 * prefill once a round has been appended after it: consecutive assistant
 * messages merge into one turn, and for Claude the turn that continues a
 * tool loop must open with its thinking block, not with the prefill's text. Earlier turns are left alone - there a plain
 * assistant message is prose the player read (a round the roll gate sent
 * back, whose re-prompt is not saved), and only the final turn has to open
 * with thinking.
 */
function dropMidHistoryPrefills(messages: ChatMessage[]): ChatMessage[] {
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");
  return messages.filter((m, i) => {
    if (i <= lastUserIndex) return true;
    const next = messages[i + 1];
    const isPlainAssistant =
      m.role === "assistant" && !m.tool_calls?.length && !m.reasoning_details?.length;
    const nextLeadsWithReasoningOrTools =
      next?.role === "assistant" &&
      (!!next.tool_calls?.length || !!next.reasoning_details?.length);
    return !(isPlainAssistant && nextLeadsWithReasoningOrTools);
  });
}

/**
 * Claude only: content-part form with a cache breakpoint. OpenRouter forwards
 * `cache_control` on a text part to Anthropic; without a breakpoint Claude
 * caches nothing and every GM round pays full input price. `ttl: "1h"` keeps
 * the entry an hour instead of five minutes (writes cost 2x input instead of
 * 1.25x, reads stay at a tenth).
 */
function withCacheBreakpoint(content: string, ttl?: "1h"): CachedTextPart[] {
  if (cacheTtlRejected) ttl = undefined;
  return [
    {
      type: "text",
      text: content,
      cache_control: ttl ? { type: "ephemeral", ttl } : { type: "ephemeral" },
    },
  ];
}

interface CachedTextPart {
  type: "text";
  text: string;
  cache_control: { type: "ephemeral"; ttl?: "1h" };
}

/** Shared message-transform logic (prefill stripping, ID normalization, per-message shaping). */
function buildRequestMessages(
  messages: ChatMessage[],
  provider: Provider,
  hasTools: boolean,
  hasPrefill: boolean,
  config: Pick<AIModelConfig, "provider" | "model">,
): any[] {
  const isClaude = isAnthropicViaOpenRouter(config);
  const thinksAlways = alwaysThinks(config, provider);

  // For DeepSeek/DeepInfra/Mistral/Google with tools: strip the prefill since
  // these providers don't handle prefill well with function calling. Claude
  // 5.5 rejects a trailing prefill outright, with or without tools.
  let processedMessages = messages;
  if (
    hasPrefill &&
    (isClaude ||
      ((provider === "deepseek" ||
        provider === "deepinfra" ||
        provider === "mistral" ||
        provider === "google" ||
        provider === "zai") &&
        hasTools))
  ) {
    processedMessages = messages.slice(0, -1);
  }

  if (thinksAlways) {
    processedMessages = dropMidHistoryPrefills(processedMessages);
  }

  // For Mistral: normalize tool call IDs to match their strict format requirement
  if (provider === "mistral") {
    processedMessages = normalizeMistralToolCallIds(processedMessages);
  }

  // Claude's prompt cache (design §3.3): breakpoints only when the caller
  // marked the end of a stable prefix - the GM stage marks its base messages,
  // which stay byte-identical every round of a turn. Two breakpoints: the
  // system message (reused across turns while the system prompt is
  // unchanged) and the marked message (reused by every later round of this
  // turn). Never on an empty text, which Anthropic rejects. Tool-calling
  // requests only: the tool list is the start of Claude's cached prefix, so
  // the story stage (same base messages, no tools) could never read the GM's
  // entry and would only pay the cache-write premium for one of its own.
  //
  // Up to four breakpoints, Claude's maximum: the system message, then the
  // last message of each mark kind - "prefix" (end of history, reused by the
  // next turn), "turn" (end of the action, reused by every round) and "round"
  // (the latest message, reused by the next round). Marks that land on the
  // same message collapse into one.
  //
  // TTLs (the 2026-10-24 Debug Logs): a player who thinks for more than five
  // minutes between turns found the 5-minute cache gone and paid the 1.25x
  // write on the whole ~60k-token prefix every turn. The breakpoints reused
  // across turns - the system message and "prefix" - live an hour; "turn" and
  // "round", reused only within a turn, keep five minutes. Anthropic requires
  // 1-hour entries before 5-minute ones, which this order is.
  const cacheIndexes = new Map<number, "1h" | undefined>();
  if (isClaude && hasTools) {
    for (const kind of ["prefix", "turn", "round"] as const) {
      for (let i = processedMessages.length - 1; i >= 0; i--) {
        if (processedMessages[i].cacheBreakpoint === kind && processedMessages[i].content) {
          if (!cacheIndexes.has(i)) cacheIndexes.set(i, kind === "prefix" ? "1h" : undefined);
          break;
        }
      }
    }
    if (
      cacheIndexes.size > 0 &&
      processedMessages[0]?.role === "system" &&
      processedMessages[0].content
    ) {
      cacheIndexes.set(0, "1h");
    }
  }

  // Gemini's thought-signature quirk below keys on the model, not the
  // provider: an OpenRouter reply from any other model (Claude's signed
  // thinking included) must not have its reasoning turned into one.
  const isGemini =
    provider === "google" ||
    (provider === "openrouter" && config.model.toLowerCase().startsWith("google/"));

  // Claude's current turn starts after the last user message; tool results
  // are role "tool" here, so a tool loop stays inside one turn.
  let lastUserIndex = -1;
  for (let i = processedMessages.length - 1; i >= 0; i--) {
    if (processedMessages[i].role === "user") {
      lastUserIndex = i;
      break;
    }
  }

  return processedMessages.map((m, index) => {
    const msg: any = {
      role: m.role,
      content: m.content !== undefined ? m.content : "",
    };

    if (isClaude) {
      // Only the current turn's signed thinking blocks go back. Claude needs
      // them to continue a tool loop, and checks that a replayed block sits
      // in history it has not seen edited - the GM's state message changes
      // every turn, so an earlier turn's blocks would fail that check.
      // Plain-text `reasoning` carries no signature and is never replayed.
      if (m.reasoning_details && index > lastUserIndex) {
        msg.reasoning_details = m.reasoning_details;
      }
    } else if ((provider === "openrouter" || provider === "google") && index > lastUserIndex) {
      // Restore reasoning/thinking details for models that require them
      // (Gemini 3 on OpenRouter) - the current turn's tool loop only. An
      // earlier turn's blob is unbudgeted payload that also changes the
      // prefix a provider's cache could match, and Gemini rejects a stale
      // signature outright.
      if (m.reasoning) msg.reasoning = m.reasoning;
      if (m.reasoning_details) msg.reasoning_details = m.reasoning_details;
    }
    if (m.tool_calls) {
      msg.tool_calls = m.tool_calls
        .filter((tc: any) => tc && tc.function && tc.function.name)
        .map((tc: any) => {
          const mapped: any = {
            id: tc.id,
            type: tc.type || "function",
            function: {
              name: tc.function.name,
              arguments:
                typeof tc.function.arguments === "string"
                  ? tc.function.arguments
                  : tc.function.arguments
                    ? JSON.stringify(tc.function.arguments)
                    : "{}",
            },
          };
          if (
            tc.extra_content &&
            (provider === "google" || provider === "openrouter")
          ) {
            mapped.extra_content = tc.extra_content;
          }
          if (!mapped.extra_content && m.reasoning_details && isGemini) {
            const details = m.reasoning_details;
            const matchingDetail = details.find(
              (d: any) =>
                d.id === tc.id ||
                (d.type === "reasoning.encrypted" && details.length === 1),
            );
            if (
              matchingDetail?.data &&
              matchingDetail?.type === "reasoning.encrypted"
            ) {
              mapped.extra_content = {
                google: { thought_signature: matchingDetail.data },
              };
            }
          }
          return mapped;
        });
      if (msg.tool_calls.length === 0) {
        delete msg.tool_calls;
      }
    }
    if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;

    // DeepSeek's thinking mode requires an assistant message that carried
    // tool calls to hand its `reasoning_content` back verbatim, or the very
    // next request fails with 400 "The `reasoning_content` in the thinking
    // mode must be passed back to the API"
    // (api-docs.deepseek.com/guides/thinking_mode). We keep the model's CoT
    // on the message as `reasoning` whatever the provider called it, so map
    // it back to DeepSeek's field name here - unmodified, since truncating
    // or summarizing it is rejected too. Messages without tool calls have
    // theirs ignored by the API, so sending it there costs nothing.
    //
    // The empty-string fallback covers histories where the reasoning is
    // genuinely gone (compaction pruned it, or a legacy save synthesized the
    // tool call without one): the API needs the key present, and omitting it
    // fails every time, so an empty value is the only remaining shot.
    if (provider === "deepseek" && m.role === "assistant") {
      if (m.reasoning) {
        msg.reasoning_content = m.reasoning;
      } else if (msg.tool_calls) {
        msg.reasoning_content = "";
      }
    }

    // Z.ai's thinking guide: inside a tool loop, "thinking blocks should be
    // explicitly preserved and returned together with the tool results", in
    // the same `reasoning_content` field - the current turn's only (after the
    // last user message): earlier turns' reasoning would only be unbudgeted
    // payload. Leaving it out degrades the reply rather than failing, so
    // there is no empty fallback as for DeepSeek.
    if (provider === "zai" && m.role === "assistant" && m.reasoning && index > lastUserIndex) {
      msg.reasoning_content = m.reasoning;
    }

    if (
      index === processedMessages.length - 1 &&
      m.role === "assistant" &&
      ((provider === "mistral" && !hasTools) ||
        (provider === "deepseek" && !hasTools))
    ) {
      msg.prefix = true;
      // A prefill is a message the model continues writing, not one it
      // already finished thinking through - a reasoning_content on it
      // describes thinking that never happened.
      delete msg.reasoning_content;
    }

    if (cacheIndexes.has(index)) {
      msg.content = withCacheBreakpoint(msg.content, cacheIndexes.get(index));
    }
    return msg;
  });
}

function resolveProviderAndKey(
  body: GenerateRequestBody,
): { provider: Provider; config: AIModelConfig; apiKey: string } | GenerateError {
  const model = body.model && body.model.trim() ? body.model : "DeepSeek V4 Flash";
  const { config } = resolveModelConfig(model, body.customModel);
  const provider = config.provider as Provider;

  // providerFetch sends subscription models to the CLI bridge first, so one
  // only gets here where the CLI cannot run: the web build or a phone.
  if (provider === "claude-cli") {
    return {
      error: `${model} runs only in the desktop app, through the claude CLI signed in to your Claude subscription. Pick another model on this device.`,
      status: 400,
      code: "CLI_UNAVAILABLE",
    };
  }

  const apiKey = getApiKey(provider, body);

  if (!apiKey) {
    return {
      error: `No API key configured for ${PROVIDER_NAMES[provider] || provider}. Please add your API key in Settings.`,
      status: 400,
      code: "NO_API_KEY",
    };
  }

  return { provider, config, apiKey };
}

// ============================================================
// Cancellation
// ============================================================

/**
 * What an aborted call rejects with. In the standalone build the signal is
 * the Stop button's (or the Observer's speculative rewrite's), and the fetch
 * underneath (platformFetch.ts) does not report an abort the way a browser
 * does: Tauri's plugin-http cancels the request but rejects with
 * `Error("Request cancelled")`, or errors the body with that bare string, and
 * Capacitor's patched fetch ignores the signal altogether. Callers recognise
 * a cancellation by `name === "AbortError"` (callSideModel re-throws it, the
 * Designer treats it as control flow), so every abort here surfaces as one.
 */
export function abortErrorFor(signal: AbortSignal | undefined): Error {
  const reason: unknown = signal?.reason;
  if (reason instanceof Error && reason.name === "AbortError") return reason;
  return new DOMException("The operation was aborted.", "AbortError");
}

// ============================================================
// Non-streaming
// ============================================================

/**
 * With a signal, rejects with an AbortError the moment it fires - even when
 * the fetch underneath ignores it (Capacitor's patched fetch, which Google and
 * Z.ai still use on Android and every host uses on iOS), whose request then
 * runs to completion unread. On Android the CORS-listed hosts (platformFetch.ts)
 * go through the WebView's own fetch, which honours the signal.
 */
export function generateNonStreaming(
  body: GenerateRequestBody,
  signal?: AbortSignal,
): Promise<GenerateSuccess | GenerateError> {
  if (!signal) return requestNonStreaming(body);
  if (signal.aborted) return Promise.reject(abortErrorFor(signal));
  return new Promise((resolve, reject) => {
    // The fetch gets a signal of its own, linked to the caller's only while
    // this request runs: Tauri's plugin-http never removes its abort
    // listeners, so on the turn's long-lived signal they would fire for every
    // already-finished request when Stop is pressed.
    const requestAbort = new AbortController();
    const onAbort = () => {
      reject(abortErrorFor(signal));
      requestAbort.abort();
    };
    signal.addEventListener("abort", onAbort, { once: true });
    requestNonStreaming(body, requestAbort.signal)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", onAbort));
  });
}

async function requestNonStreaming(
  body: GenerateRequestBody,
  signal?: AbortSignal,
): Promise<GenerateSuccess | GenerateError> {
  try {
    const { messages, tools, toolChoice, maxTokens = 4000, temperature = 0.7 } = body;
    const model = body.model && body.model.trim() ? body.model : "DeepSeek V4 Flash";

    if (!messages || messages.length === 0) {
      return { error: "Messages are required", status: 400 };
    }

    const resolved = resolveProviderAndKey(body);
    if ("error" in resolved) return resolved;
    const { provider, config, apiKey } = resolved;

    const hasPrefill =
      messages.length > 0 && messages[messages.length - 1].role === "assistant";
    const hasTools = !!(tools && tools.length > 0);

    const endpoint = buildEndpoint(provider, hasPrefill, hasTools);
    const headers = buildHeaders(provider, apiKey);
    const isClaude = isAnthropicViaOpenRouter(config);

    const thinksAlways = reasoningCannotBeTurnedOff(config, provider);
    const requestBody: any = {
      model: config.model,
      messages: buildRequestMessages(messages, provider, hasTools, hasPrefill, config),
      max_tokens: thinksAlways ? Math.max(maxTokens, ALWAYS_THINKING_MIN_MAX_TOKENS) : maxTokens,
    };
    // Claude 5.5 rejects any non-default sampling value.
    if (!isClaude) requestBody.temperature = clampTemperature(provider, temperature);

    if (hasTools) {
      const toolsToUse = provider === "google" ? filterToolsForGoogle(tools!) : tools;
      requestBody.tools = toolsToUse;
      requestBody.tool_choice = resolveToolChoice(provider, toolChoice, isClaude || modelRejectsForcedToolChoice(config));
    }

    applyReasoningEffort(requestBody, provider, body.reasoningEffort, isClaude, thinksAlways);
    applyCacheKey(requestBody, provider, body.cacheKey);

    const response = await postChatRequest(endpoint, headers, requestBody, provider, signal);

    if (!response.ok) {
      const errorText = await response.text();
      return {
        error: `AI API request failed: ${response.status} ${response.statusText} - ${errorText}`,
        status: 500,
      };
    }

    const aiResponse = (await response.json()) as AIResponse;
    // Mistral's reasoning models (Mistral Small 4, Medium 3.5) answer with
    // `content` as a list of text and thinking chunks once reasoning_effort is
    // set; the streaming path already unpacks that (extractContentParts), and
    // every caller of this one expects a string.
    const contentParts = extractContentParts(aiResponse.choices[0]?.message?.content);
    let content = contentParts.text;
    // DeepSeek-native models put CoT in `reasoning_content`; OpenRouter/others
    // in `reasoning`; Mistral in a thinking chunk of `content`. Read whichever
    // is present so reasoning is preserved into saved history regardless of
    // provider.
    const reasoning =
      aiResponse.choices[0]?.message?.reasoning ||
      aiResponse.choices[0]?.message?.reasoning_content ||
      contentParts.thinking ||
      "";
    const reasoning_details = aiResponse.choices[0]?.message?.reasoning_details || [];
    let toolCalls = aiResponse.choices[0]?.message?.tool_calls;

    if ((!toolCalls || toolCalls.length === 0) && hasTools) {
      const recovered = extractFallbackToolCalls(content);
      if (recovered) {
        logger.action(
          "Recovered tool call(s) from content fallback (tool_calls field was empty)",
          { provider, recoveredCount: recovered.length, names: recovered.map((c) => c.function.name) },
        );
        toolCalls = recovered;
        // The call now lives in `toolCalls`; leaving its raw markup in
        // `content` too would both show it to the player and teach the model
        // to repeat the leak next round, since content goes into history.
        content = stripLeakedToolCallMarkup(content);
      }
    }

    const usage = aiResponse.usage || {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };
    const reportedCost = isClaude
      ? openRouterBilledUsd(aiResponse.usage)
      : usage.estimated_cost;

    logger.action("AI generation complete", {
      model: config.model,
      provider,
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      ...readCacheUsage(provider, usage),
      hasToolCalls: !!toolCalls,
    });

    return {
      content,
      reasoning,
      reasoning_details,
      toolCalls: toolCalls || [],
      ...(aiResponse.choices[0]?.finish_reason
        ? { finishReason: aiResponse.choices[0].finish_reason }
        : {}),
      meta: {
        model: config.model,
        modelName: model,
        provider,
        usage: {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
          ...readCacheUsage(provider, usage),
        },
        ...(reportedCost !== undefined && { estimatedCost: reportedCost }),
      },
    };
  } catch (error: any) {
    if (signal?.aborted) throw abortErrorFor(signal);
    logger.error("Generation API error", { error: error.message });
    return { error: error.message || "Internal server error", status: 500 };
  }
}

// ============================================================
// Streaming
// ============================================================

/**
 * Split delta content into visible text and reasoning, handling both plain
 * strings and Magistral's array format with thinking/text content parts.
 * Magistral's own CoT ships inline in `content` (not a separate `reasoning`
 * delta field like DeepSeek/OpenRouter), so it has to be pulled out here or
 * it's lost entirely rather than just unstreamed.
 */
function extractContentParts(content: unknown): { text: string; thinking: string } {
  if (typeof content === "string") {
    return { text: content, thinking: "" };
  }
  if (Array.isArray(content)) {
    let text = "";
    let thinking = "";
    for (const part of content) {
      if (typeof part === "string") {
        text += part;
      } else if (part?.type === "text" && typeof part.text === "string") {
        text += part.text;
      } else if (part?.type === "thinking") {
        const chunks = Array.isArray(part.thinking) ? part.thinking : [part.thinking];
        for (const chunk of chunks) {
          if (typeof chunk === "string") thinking += chunk;
          else if (chunk && typeof chunk.text === "string") thinking += chunk.text;
        }
      }
    }
    return { text, thinking };
  }
  if (content && typeof content === "object" && "text" in content) {
    const obj = content as { text?: unknown };
    if (typeof obj.text === "string") {
      return { text: obj.text, thinking: "" };
    }
  }
  return { text: "", thinking: "" };
}

/**
 * With a signal, the returned stream errors with an AbortError the moment it
 * fires, so whoever is reading it stops at once - even when the fetch
 * underneath ignores the signal (Capacitor). That fetch also gets a signal
 * linked to it, which lets Tauri's cancel the provider request itself.
 */
export function generateStream(
  body: GenerateRequestBody,
  signal?: AbortSignal,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const emit = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // The fetch's own signal, linked to the caller's only until this stream
      // ends - see generateNonStreaming for why.
      const requestAbort = signal ? new AbortController() : undefined;
      const onAbort = () => {
        controller.error(abortErrorFor(signal));
        requestAbort?.abort();
      };
      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener("abort", onAbort, { once: true });

      try {
        const { messages, tools, toolChoice, maxTokens = 4000, temperature = 0.7, samplingSettings, stop } = body;
        const model = body.model && body.model.trim() ? body.model : "DeepSeek V4 Flash";

        if (!messages || messages.length === 0) {
          emit({ type: "error", error: "Messages are required" });
          controller.close();
          return;
        }

        const resolved = resolveProviderAndKey(body);
        if ("error" in resolved) {
          emit({ type: "error", error: resolved.error, code: resolved.code });
          controller.close();
          return;
        }
        const { provider, config, apiKey } = resolved;

        const hasPrefill =
          messages.length > 0 && messages[messages.length - 1].role === "assistant";
        const hasTools = !!(tools && tools.length > 0);

        const endpoint = buildEndpoint(provider, hasPrefill, hasTools);
        const headers = buildHeaders(provider, apiKey);
        const isClaude = isAnthropicViaOpenRouter(config);

        const thinksAlways = reasoningCannotBeTurnedOff(config, provider);
        const requestBody: any = {
          model: config.model,
          messages: buildRequestMessages(messages, provider, hasTools, hasPrefill, config),
          max_tokens: thinksAlways ? Math.max(maxTokens, ALWAYS_THINKING_MIN_MAX_TOKENS) : maxTokens,
          stream: true,
          stream_options: { include_usage: true },
        };
        // Claude 5.5 rejects any non-default sampling value, so it gets
        // neither the base temperature nor the story stage's settings.
        if (!isClaude) requestBody.temperature = clampTemperature(provider, temperature);

        if (
          samplingSettings &&
          !isClaude &&
          (provider === "mistral" || provider === "deepinfra" || provider === "openrouter")
        ) {
          const filteredSettings = filterSettingsForProvider(samplingSettings, provider);
          if (filteredSettings.temperature !== undefined) {
            requestBody.temperature = filteredSettings.temperature;
          }
          if (filteredSettings.top_p !== undefined) requestBody.top_p = filteredSettings.top_p;
          if (filteredSettings.presence_penalty !== undefined)
            requestBody.presence_penalty = filteredSettings.presence_penalty;
          if (filteredSettings.frequency_penalty !== undefined)
            requestBody.frequency_penalty = filteredSettings.frequency_penalty;

          if (provider === "deepinfra" || provider === "openrouter") {
            if (filteredSettings.min_p !== undefined && filteredSettings.min_p > 0) {
              requestBody.min_p = filteredSettings.min_p;
            }
            if (filteredSettings.top_k !== undefined && filteredSettings.top_k > 0) {
              requestBody.top_k = filteredSettings.top_k;
            }
            if (
              filteredSettings.repetition_penalty !== undefined &&
              filteredSettings.repetition_penalty !== 1.0
            ) {
              requestBody.repetition_penalty = filteredSettings.repetition_penalty;
            }
          }
        }

        if (hasTools) {
          const toolsToUse = provider === "google" ? filterToolsForGoogle(tools!) : tools;
          requestBody.tools = toolsToUse;
          requestBody.tool_choice = resolveToolChoice(provider, toolChoice, isClaude || modelRejectsForcedToolChoice(config));
        }

        applyReasoningEffort(requestBody, provider, body.reasoningEffort, isClaude, thinksAlways);

        if (stop && stop.length > 0) {
          // Z.ai's reference has long taken a single stop word; the story
          // stage's markers are stripped client-side as well.
          requestBody.stop = provider === "zai" ? stop.slice(0, 1) : stop;
        }

        applyCacheKey(requestBody, provider, body.cacheKey);

        const response = await postChatRequest(
          endpoint,
          headers,
          requestBody,
          provider,
          requestAbort?.signal,
        );

        if (!response.ok) {
          const errorText = await response.text();
          emit({ type: "error", error: `AI API error: ${response.status} - ${errorText}` });
          controller.close();
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          emit({ type: "error", error: "No response body" });
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";
        let toolCalls: any[] = [];
        let promptTokens = 0;
        let completionTokens = 0;
        // Tracks the most recent finish_reason seen across chunks. "length"
        // means the provider cut the response off at the token cap - if that
        // happens mid tool-call, the accumulated arguments string will be
        // unterminated JSON. Surfacing this lets callers tell "truncated"
        // apart from "the model just sent nothing", which otherwise look
        // identical once JSON.parse fails on both.
        let lastFinishReason: string | undefined;
        let estimatedCost: number | undefined;
        let cachedTokens: number | undefined;
        let cacheWriteTokens: number | undefined;
        let streamComplete = false;
        let finishSeen = false;

        const processChunk = (parsed: any) => {
          const delta = parsed.choices?.[0]?.delta;
          const finishReason = parsed.choices?.[0]?.finish_reason;
          if (finishReason) lastFinishReason = finishReason;

          if (delta?.content !== undefined && delta?.content !== null) {
            const { text: textContent, thinking: thinkingContent } = extractContentParts(
              delta.content,
            );
            if (textContent) {
              fullContent += textContent;
              emit({ type: "content", content: textContent });
            }
            if (thinkingContent) {
              emit({ type: "reasoning", content: thinkingContent });
            }
          }

          if (delta?.reasoning !== undefined && delta?.reasoning !== null) {
            emit({ type: "reasoning", content: delta.reasoning });
          }

          // DeepSeek's native API (api.deepseek.com) streams chain-of-thought
          // in `reasoning_content`, not the OpenRouter-normalized `reasoning`
          // field handled above. Without this, a BYOK DeepSeek user's thinking
          // is silently dropped and never streamed to the timeline. Emit it as
          // the same `reasoning` event so the client path is provider-agnostic.
          if (
            delta?.reasoning_content !== undefined &&
            delta?.reasoning_content !== null
          ) {
            emit({ type: "reasoning", content: delta.reasoning_content });
          }

          if (delta?.reasoning_details) {
            emit({ type: "reasoning_details", details: delta.reasoning_details });
          }

          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const index = tc.index ?? 0;
              if (!toolCalls[index]) {
                toolCalls[index] = { id: tc.id || "", type: "function", function: { name: "", arguments: "" } };
              }
              if (tc.id) toolCalls[index].id = tc.id;
              if (tc.function?.name) toolCalls[index].function.name = tc.function.name;
              if (tc.function?.arguments) toolCalls[index].function.arguments += tc.function.arguments;
              if (tc.extra_content) toolCalls[index].extra_content = tc.extra_content;
            }
          }

          if (parsed.usage) {
            promptTokens = parsed.usage.prompt_tokens || 0;
            completionTokens = parsed.usage.completion_tokens || 0;
            const reported = isClaude
              ? openRouterBilledUsd(parsed.usage)
              : parsed.usage.estimated_cost;
            if (reported !== undefined) estimatedCost = reported;
            const cacheUsage = readCacheUsage(provider, parsed.usage);
            cachedTokens = cacheUsage.cachedTokens;
            cacheWriteTokens = cacheUsage.cacheWriteTokens;
          }

          // A finish reason does not end the read: OpenRouter (and the
          // OpenAI-style APIs asked for include_usage) send the usage - tokens,
          // cache hits, the billed cost - in a chunk of their own AFTER the
          // one carrying finish_reason. Stopping at the finish lost it, so a
          // streamed turn reported 0 tokens and no cost (the 2026-10-24 Debug
          // Logs). The read now ends on [DONE], the stream closing, or the
          // usage chunk once the finish has been seen.
          if (finishReason === "stop" || finishReason === "end_turn" || finishReason === "length") {
            finishSeen = true;
          }
          if (finishSeen && parsed.usage) {
            streamComplete = true;
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (signal?.aborted) {
            // Only reachable when the fetch ignored the signal - the reader
            // already has its AbortError, so stop reading the provider too.
            await reader.cancel().catch(() => {});
            return;
          }
          if (done || streamComplete) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") {
              streamComplete = true;
              break;
            }
            try {
              processChunk(JSON.parse(data));
              if (streamComplete) break;
            } catch {
              // Skip malformed JSON
            }
          }
        }

        // Process any remaining data in buffer after stream closes - catches
        // edge cases where the last chunk wasn't followed by a newline.
        if (buffer.trim()) {
          const trimmed = buffer.trim();
          if (trimmed.startsWith("data:")) {
            const data = trimmed.slice(5).trim();
            if (data !== "[DONE]") {
              try {
                processChunk(JSON.parse(data));
              } catch {
                // Skip malformed JSON in final buffer
              }
            }
          }
        }

        // Defensive fallback for a known DeepSeek reliability issue: a tool
        // call sometimes arrives as text in content instead of populating
        // the streamed tool_calls deltas (see toolCallFallback.ts). Only
        // attempt recovery when tools were actually offered - otherwise
        // this is just ordinary prose.
        if (toolCalls.length === 0 && hasTools) {
          const recovered = extractFallbackToolCalls(fullContent);
          if (recovered) {
            logger.action(
              "Recovered tool call(s) from content fallback (tool_calls field was empty)",
              { provider, recoveredCount: recovered.length, names: recovered.map((c) => c.function.name) },
            );
            toolCalls = recovered;
          }
        }

        const parsedToolCalls = toolCalls
          .filter((tc) => tc && tc.function?.name)
          .map((tc) => {
            try {
              const parsedArgs =
                typeof tc.function.arguments === "string"
                  ? JSON.parse(tc.function.arguments)
                  : tc.function.arguments;
              return { ...tc, function: { ...tc.function, arguments: parsedArgs } };
            } catch {
              // A "length" finish_reason means the provider cut the response
              // off before this call's arguments finished, so the raw
              // string is unterminated JSON rather than the model genuinely
              // sending no arguments - mark *why* it's empty rather than
              // reporting "missing required parameter" for every field.
              return {
                ...tc,
                argsTruncated: lastFinishReason === "length",
                rawArgumentsPreview: tc.function?.arguments?.substring(0, 200),
                function: { ...tc.function, arguments: {} },
              };
            }
          });

        if (parsedToolCalls.length > 0) {
          emit({ type: "tool_calls", toolCalls: parsedToolCalls });
        }

        logger.action("AI generation (stream) complete", {
          model: config.model,
          provider,
          promptTokens,
          completionTokens,
          cachedTokens,
          cacheWriteTokens,
          hasToolCalls: parsedToolCalls.length > 0,
          finishReason: lastFinishReason,
          estimatedCost,
        });

        emit({
          type: "done",
          meta: {
            model: config.model,
            modelName: model,
            provider,
            finishReason: lastFinishReason,
            usage: {
              promptTokens,
              completionTokens,
              totalTokens: promptTokens + completionTokens,
              ...(cachedTokens ? { cachedTokens } : {}),
              ...(cacheWriteTokens ? { cacheWriteTokens } : {}),
            },
            // The provider's own dollar figure when it reports one (DeepInfra
            // does). Until now this was parsed off the usage chunk and then
            // dropped on the floor here - forwarding it lets the client's
            // per-turn cost ledger (turnCost.ts) prefer a real billed amount
            // over our list-price arithmetic.
            ...(estimatedCost !== undefined && { estimatedCost }),
          },
        });

        controller.close();
      } catch (error: any) {
        // Already errored with an AbortError by onAbort; whatever the fetch
        // threw on the way out ("Request cancelled" from Tauri) is not news.
        if (signal?.aborted) return;
        logger.error("Generation stream error", { error: error.message });
        emit({ type: "error", error: error.message || "Internal server error" });
        controller.close();
      } finally {
        signal?.removeEventListener("abort", onAbort);
      }
    },
  });
}
