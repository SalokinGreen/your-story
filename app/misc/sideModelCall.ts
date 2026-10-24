/**
 * The one way to make a non-streaming AI side call: the Observer's judges and
 * rewrite, the Memory Keeper, Reflection, Compaction, the Director Assistant,
 * the Story Progress Observer, delegated sub-agents and the creator's
 * Designer chat. Each of those used to hand-roll its own
 * `fetch("/api/generate")`, and they drifted in two ways that both failed
 * silently:
 *
 * - Some forwarded only three of the five BYOK provider keys, so a call on a
 *   model from a provider they left out came back NO_API_KEY - with default
 *   settings, compaction and reflection never ran at all (status report
 *   §6.13).
 * - All of them bypassed providerFetch, so in the standalone (Tauri/Capacitor)
 *   build, which has no /api/* routes, none of them ever ran (§6.7).
 *
 * callSideModel() fixes both by construction - every call goes through
 * providerFetch and always carries all five keys - and turns a failure into a
 * Debug Logs warning instead of a silent `return null`. It never throws for a
 * failed call; callers keep their own fail-open (or error-surfacing) policy
 * by checking `result.ok`. The one exception is cancellation: an
 * AbortError is re-thrown, because a cancelled call is the caller's own
 * decision, not a failure to log, and the callers that cancel (the Designer)
 * already handle it as control flow.
 */

import { ChatMessage } from "./chatMessage";
import { logger } from "./logger";
import { providerFetch } from "./providerFetch";
import { GenerateSuccess } from "./providerCall";
import { DEFAULT_REASONING_EFFORT } from "./reasoningTiers";
import {
  recordSideCall,
  recordUnansweredSideCall,
  SideCallCostContext,
  TurnCostStage,
} from "./turnCost";
import { getCustomModelIfUUID } from "./user_settings";

/**
 * The six AI-provider keys the /api/generate proxy can pick from. Every key
 * is optional because a user only saves the ones they have; the proxy picks
 * the one the model's provider needs and reports NO_API_KEY if it's absent.
 */
export interface ProviderKeys {
  openRouterKey?: string;
  deepseekKey?: string;
  googleKey?: string;
  mistralKey?: string;
  deepinfraKey?: string;
  zaiKey?: string;
}

/**
 * Copies exactly the six provider keys out of any larger bag (generation
 * options, the APIKeys context) - so a side-call options object can be built
 * with one spread that can't forget a provider, and so unrelated secrets in
 * that bag (TTS, web search) never ride along to the proxy.
 */
export function pickProviderKeys(source: ProviderKeys | undefined): ProviderKeys {
  return {
    openRouterKey: source?.openRouterKey,
    deepseekKey: source?.deepseekKey,
    googleKey: source?.googleKey,
    mistralKey: source?.mistralKey,
    deepinfraKey: source?.deepinfraKey,
    zaiKey: source?.zaiKey,
  };
}

export interface SideModelRequest extends SideCallCostContext {
  /**
   * Turn-cost ledger stage this call is billed to. Omit for calls that run
   * outside a story turn (the Designer), which have no turn to bill.
   */
  stage?: TurnCostStage;
  /** Short human name - shown in the cost breakdown and in Debug Logs on failure. */
  label: string;
  model: string;
  messages: ChatMessage[];
  keys: ProviderKeys | undefined;
  maxTokens?: number;
  temperature?: number;
  /**
   * How hard the model thinks (decision 53): the slot's own effort - the
   * player's pin, the side-agent default, a tier's, the Designer's. Every
   * caller passes one; a request without sends DEFAULT_REASONING_EFFORT
   * ("none"), the cheapest each model allows, rather than leaving the
   * provider's own default (Grok, for one, defaults to high) to apply.
   */
  reasoningEffort?: string;
  tools?: unknown[];
  /** A stable conversation id for provider-side caching (providerCall.ts). */
  cacheKey?: string;
  abortSignal?: AbortSignal;
}

export type SideModelResult =
  | { ok: true; data: GenerateSuccess }
  | { ok: false; error: string; status?: number; code?: string };

function isAbortError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

function logFailure(
  request: SideModelRequest,
  failure: Extract<SideModelResult, { ok: false }>,
): void {
  logger.warn(`Side call failed: ${request.label}`, {
    stage: request.stage,
    model: request.model,
    reasoningEffort: request.reasoningEffort ?? DEFAULT_REASONING_EFFORT,
    status: failure.status,
    code: failure.code,
    error: failure.error,
  });
}

export async function callSideModel(
  request: SideModelRequest,
): Promise<SideModelResult> {
  const keys = pickProviderKeys(request.keys);

  let response: Response;
  try {
    response = await providerFetch(
      "/api/generate",
      {
        messages: request.messages,
        ...(request.tools ? { tools: request.tools } : {}),
        model: request.model,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
        ...keys,
        customModel: getCustomModelIfUUID(request.model),
        reasoningEffort: request.reasoningEffort ?? DEFAULT_REASONING_EFFORT,
        ...(request.cacheKey ? { cacheKey: request.cacheKey } : {}),
      },
      request.abortSignal,
    );
  } catch (error) {
    if (isAbortError(error)) {
      // Sent and cancelled before it answered: the provider may have billed
      // for it, so the turn's ledger says so rather than showing it as free.
      if (request.stage) {
        recordUnansweredSideCall(
          request.stage,
          request.label,
          request.model,
          request,
        );
      }
      throw error;
    }
    const failure = {
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    };
    logFailure(request, failure);
    return failure;
  }

  if (!response.ok) {
    let errorBody: { error?: unknown; code?: unknown } = {};
    try {
      errorBody = (await response.json()) ?? {};
    } catch {
      // No readable error body - fall back to the status alone.
    }
    const failure = {
      ok: false as const,
      status: response.status,
      error:
        typeof errorBody.error === "string" && errorBody.error
          ? errorBody.error
          : `The model call failed (${response.status}).`,
      code: typeof errorBody.code === "string" ? errorBody.code : undefined,
    };
    logFailure(request, failure);
    return failure;
  }

  let data: GenerateSuccess;
  try {
    data = (await response.json()) as GenerateSuccess;
  } catch (error) {
    // The answer arrived (or was cut off) but cannot be read: billable all
    // the same, and its usage is lost, so the cost is unknown.
    if (request.stage) {
      recordUnansweredSideCall(
        request.stage,
        request.label,
        request.model,
        request,
        isAbortError(error) ? "cancelled" : "unreadable answer",
      );
    }
    if (isAbortError(error)) throw error;
    const failure = {
      ok: false as const,
      status: response.status,
      error: `Unreadable response: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
    logFailure(request, failure);
    return failure;
  }

  if (request.stage) {
    recordSideCall(request.stage, request.label, request.model, data, request);
  }
  return { ok: true, data };
}
