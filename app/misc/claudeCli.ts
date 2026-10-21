/**
 * Playing on the player's own Claude subscription through the `claude` CLI
 * they installed and signed in to themselves (docs/claude-gm-design.md §4,
 * implementation plan B2). Desktop only.
 *
 * providerFetch.ts sends every request for a subscription model here, before
 * anything else, so the GM loop, its gates, callSideModel and the Designer
 * need no changes: this returns the same SSE frames as /api/generate-stream
 * and the same JSON as /api/generate.
 *
 * Each request is one CLI run. The app keeps its own GM loop (decision 11):
 * a round that offers tools runs in structured mode, where a JSON schema
 * makes the CLI answer `{narration, tool_calls}` with its own tools off, and
 * the app executes those calls like any provider's. A request without tools
 * streams plain text. Nothing here reads, stores or relays a credential
 * (design §5.2): the desktop app's Rust command (src-tauri/src/claude_cli.rs)
 * builds the command line and launches the unmodified binary.
 */

import { Channel, invoke } from "@tauri-apps/api/core";
import {
  abortErrorFor,
  ChatMessage,
  GenerateRequestBody,
  GenerateSuccess,
} from "./providerCall";
import {
  CLAUDE_CLI_MODELS,
  ClaudeCliFamily,
  isClaudeCliModel,
} from "./claudeCliModels";
import { logger } from "./logger";

export {
  isClaudeCliModel,
  isClaudeCliAvailablePlatform,
  getClaudeCliStatus,
} from "./claudeCliModels";
export type { ClaudeCliModelKey, ClaudeCliStatus } from "./claudeCliModels";

// ============================================================
// Rendering a request for the CLI
// ============================================================

type CliEffort = "low" | "medium" | "high" | "xhigh";

/**
 * The tier's effort for `--effort`. Claude 5.5's thinking cannot be turned
 * off, so `none` runs at `low`. A call with no effort of its own (a side
 * agent) gets `medium`, Claude's own default on Opus and Haiku.
 */
export function mapEffort(effort: string | undefined): CliEffort {
  switch (effort) {
    case "none":
    case "low":
      return "low";
    case "high":
      return "high";
    case "xhigh":
      return "xhigh";
    default:
      return "medium";
  }
}

interface ToolDefinition {
  type?: string;
  function?: { name?: string; description?: string; parameters?: unknown };
}

function toolNamesOf(tools: ToolDefinition[]): string[] {
  const names: string[] = [];
  for (const tool of tools) {
    const name = tool?.function?.name;
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

/**
 * The round's response schema: `{narration, tool_calls}`, with the round's
 * tool names as an enum and `minItems: 1` only when a gate forced a tool
 * call. Tool *arguments* are not in it - their schemas would not fit
 * Windows' command line - so the executors validate them, as they do for
 * every provider.
 */
export function buildRoundSchema(toolNames: string[], forced: boolean): string {
  return JSON.stringify({
    type: "object",
    additionalProperties: false,
    required: ["narration", "tool_calls"],
    properties: {
      narration: { type: "string" },
      tool_calls: {
        type: "array",
        ...(forced ? { minItems: 1 } : {}),
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "arguments"],
          properties: {
            name: { type: "string", enum: toolNames },
            arguments: { type: "object" },
          },
        },
      },
    },
  });
}

function parseArguments(raw: unknown): unknown {
  if (typeof raw !== "string") return raw ?? {};
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Prefills the CLI cannot take: a trailing assistant message, and inside the
 * current turn (after the last user message) a plain assistant message
 * directly before one that carries tool calls - the GM's `<thinking>`
 * prefill once a round has been appended after it.
 */
function dropPrefills(messages: ChatMessage[]): ChatMessage[] {
  let end = messages.length;
  while (end > 0 && messages[end - 1].role === "assistant" && !messages[end - 1].tool_calls?.length) {
    end--;
  }
  const kept = messages.slice(0, end);
  const lastUser = kept.map((m) => m.role).lastIndexOf("user");
  return kept.filter((m, i) => {
    if (i <= lastUser || m.role !== "assistant" || m.tool_calls?.length) return true;
    const next = kept[i + 1];
    return !(next?.role === "assistant" && next.tool_calls?.length);
  });
}

function renderBlock(message: ChatMessage, toolNameById: Map<string, string>): string {
  if (message.role === "user") return `[User]\n${message.content}`;
  if (message.role === "system") return `[System note]\n${message.content}`;
  if (message.role === "tool") {
    const id = message.tool_call_id ?? "";
    const name = toolNameById.get(id);
    return `[Tool result${name ? ` · ${name}` : ""}${id ? ` · ${id}` : ""}]\n${message.content}`;
  }
  const parts: string[] = ["[You]"];
  if (message.content) parts.push(message.content);
  const calls = (message.tool_calls ?? [])
    .filter((tc) => tc?.function?.name)
    .map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: parseArguments(tc.function.arguments),
    }));
  if (calls.length > 0) parts.push(`Tool calls: ${JSON.stringify(calls)}`);
  return parts.join("\n");
}

function renderTools(tools: ToolDefinition[]): string {
  const lines = [
    "## Tools",
    "",
    "The game engine runs these tools for you. Ask for them in `tool_calls`; you cannot run them yourself.",
  ];
  for (const tool of tools) {
    const fn = tool?.function;
    if (!fn?.name) continue;
    lines.push("", `### ${fn.name}`);
    if (fn.description) lines.push(fn.description);
    lines.push(`Parameters (JSON Schema): ${JSON.stringify(fn.parameters ?? {})}`);
  }
  return lines.join("\n");
}

const TRANSCRIPT_GUIDE =
  "The conversation is a series of blocks. [User] blocks come from the game engine and the player " +
  "(a line starting with > is the player's action). [You] blocks are your own earlier replies, with " +
  "the tool calls you asked for. [Tool result] blocks are what the engine returned for a call. " +
  "[System note] blocks are instructions from the app. The blocks in the message continue the ones above.";

const STRUCTURED_PROTOCOL = [
  "## How to answer",
  "",
  TRANSCRIPT_GUIDE,
  "",
  "Write only your next reply, as the JSON object the response format asks for:",
  '- "narration": your reply\'s text, exactly as you would write it, including any <thinking> notes the instructions above ask for. It may be empty when this round only asks for tools.',
  '- "tool_calls": the tools the engine should run now, each as {"name": …, "arguments": {…}}, with arguments that match that tool\'s parameters. Leave it empty when you need no tool.',
  "The engine runs the tools and shows you their results in the next round.",
].join("\n");

const PLAIN_PROTOCOL = [
  "## How to answer",
  "",
  TRANSCRIPT_GUIDE,
  "",
  "Write only your next reply, as plain text.",
].join("\n");

/**
 * Renders a request into the CLI's system prompt (a file) and its prompt
 * (stdin). Deterministic: the same messages render to the same bytes. The
 * leading system messages, the tool list, every message before the one the
 * caller marked `cacheBreakpoint` (the GM's stable base), and the answer
 * protocol make up the system prompt, which is therefore identical in every
 * round of a turn, so the CLI's prompt cache can serve it. Everything from
 * the marked message on is the prompt, and since a later round only appends
 * messages, its prompt starts with the earlier round's byte for byte.
 */
export function renderCliPrompt(
  messages: ChatMessage[],
  tools?: ToolDefinition[],
): { systemPrompt: string; prompt: string } {
  const usable = dropPrefills(messages);

  let firstNonSystem = 0;
  while (firstNonSystem < usable.length && usable[firstNonSystem].role === "system") {
    firstNonSystem++;
  }
  const leadingSystem = usable.slice(0, firstNonSystem).map((m) => m.content);
  const conversation = usable.slice(firstNonSystem);

  const markIndex = conversation.map((m) => !!m.cacheBreakpoint).lastIndexOf(true);
  const stable = markIndex > 0 ? conversation.slice(0, markIndex) : [];
  const current = markIndex > 0 ? conversation.slice(markIndex) : conversation;

  const toolNameById = new Map<string, string>();
  for (const message of conversation) {
    for (const tc of message.tool_calls ?? []) {
      if (tc?.id && tc?.function?.name) toolNameById.set(tc.id, tc.function.name);
    }
  }

  const sections = [...leadingSystem];
  const hasTools = !!tools && tools.length > 0;
  if (hasTools) sections.push(renderTools(tools!));
  if (stable.length > 0) {
    sections.push(
      ["## The session so far", "", ...stable.map((m) => renderBlock(m, toolNameById))].join("\n\n"),
    );
  }
  sections.push(hasTools ? STRUCTURED_PROTOCOL : PLAIN_PROTOCOL);

  return {
    systemPrompt: sections.join("\n\n"),
    prompt: current.map((m) => renderBlock(m, toolNameById)).join("\n\n"),
  };
}

/** Cuts streamed text at the first stop sequence, which the CLI cannot do. */
export class StopCutter {
  private held = "";
  private stopped = false;
  private readonly keep: number;

  constructor(private readonly stops: string[]) {
    this.keep = stops.reduce((max, s) => Math.max(max, s.length), 0) - 1;
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  /** Text safe to emit now. Holds back what could be the start of a stop sequence. */
  push(text: string): string {
    if (this.stopped) return "";
    this.held += text;
    let cut = -1;
    for (const stop of this.stops) {
      if (!stop) continue;
      const at = this.held.indexOf(stop);
      if (at >= 0 && (cut < 0 || at < cut)) cut = at;
    }
    if (cut >= 0) {
      this.stopped = true;
      const out = this.held.slice(0, cut);
      this.held = "";
      return out;
    }
    if (this.keep <= 0) {
      const out = this.held;
      this.held = "";
      return out;
    }
    const safe = Math.max(0, this.held.length - this.keep);
    const out = this.held.slice(0, safe);
    this.held = this.held.slice(safe);
    return out;
  }

  /** Whatever is still held once the text has ended. */
  flush(): string {
    const out = this.stopped ? "" : this.held;
    this.held = "";
    return out;
  }
}

// ============================================================
// Errors
// ============================================================

export type ClaudeCliErrorCode =
  | "CLI_NOT_FOUND"
  | "CLI_NOT_SIGNED_IN"
  | "CLI_USAGE_LIMIT"
  | "CLI_FAILED";

export class ClaudeCliError extends Error {
  constructor(
    public readonly code: ClaudeCliErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ClaudeCliError";
  }
}

const USAGE_LIMIT_PATTERN = /(session|weekly|usage|5-hour) limit|limit reached/i;
const SIGN_IN_PATTERN = /not logged in|\/login|log ?in again|invalid api key|oauth token|authenticat/i;

/** Maps a failed run's text to a code and the message the turn stops with. */
export function classifyCliFailure(detail: string): ClaudeCliError {
  const text = detail.trim() || "the CLI ended without an answer";
  if (USAGE_LIMIT_PATTERN.test(text)) {
    return new ClaudeCliError(
      "CLI_USAGE_LIMIT",
      `Your Claude plan's usage limit is reached (${text}). The turn was not switched to a paid provider; try again when the limit resets.`,
    );
  }
  if (SIGN_IN_PATTERN.test(text)) {
    return new ClaudeCliError(
      "CLI_NOT_SIGNED_IN",
      "The claude CLI is not signed in. Open a terminal, run `claude`, then `/login`.",
    );
  }
  return new ClaudeCliError("CLI_FAILED", `The claude CLI failed: ${text}`);
}

/** The Rust command's errors arrive as "CODE: detail". */
function errorFromInvoke(raw: unknown): ClaudeCliError {
  const text = typeof raw === "string" ? raw : raw instanceof Error ? raw.message : String(raw);
  const match = /^(CLI_[A-Z_]+):\s*([\s\S]*)$/.exec(text);
  if (match?.[1] === "CLI_NOT_FOUND") {
    return new ClaudeCliError(
      "CLI_NOT_FOUND",
      "The claude CLI was not found. Install Claude Code, then run `claude` and `/login` in a terminal.",
    );
  }
  return classifyCliFailure(match ? match[2] : text);
}

// ============================================================
// One CLI run
// ============================================================

type RustCliEvent =
  | { type: "line"; json: string }
  | { type: "exit"; code: number | null; stderrTail: string };

/** One parsed NDJSON line from `--output-format stream-json`. */
interface CliLine {
  type?: string;
  subtype?: string;
  apiKeySource?: string;
  is_error?: boolean;
  result?: string;
  structured_output?: unknown;
  usage?: {
    input_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    output_tokens?: number;
  };
  event?: { type?: string; delta?: { type?: string; text?: string } };
}

interface CliRunRequest {
  model: ClaudeCliFamily;
  effort: CliEffort;
  mode: { kind: "structured"; schema: string } | { kind: "stream" };
  systemPrompt: string;
  prompt: string;
}

interface CliRunHandle {
  requestId: string;
  /** Resolves with the exit once the run has ended; rejects on abort or a launch error. */
  done: Promise<{ code: number | null; stderrTail: string }>;
  /** Kills the process early (a stop sequence was reached). */
  stop: () => void;
}

let runCounter = 0;

function startRun(
  request: CliRunRequest,
  onLine: (line: CliLine) => void,
  signal?: AbortSignal,
): CliRunHandle {
  const requestId = `cli_${Date.now().toString(36)}_${runCounter++}`;
  const cancel = () => {
    invoke("claude_cli_cancel", { requestId }).catch(() => {});
  };

  const done = new Promise<{ code: number | null; stderrTail: string }>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortErrorFor(signal));
      return;
    }
    const onAbort = () => {
      cancel();
      reject(abortErrorFor(signal));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    const finish = () => signal?.removeEventListener("abort", onAbort);

    const channel = new Channel<RustCliEvent>();
    channel.onmessage = (event) => {
      if (event.type === "line") {
        let parsed: CliLine;
        try {
          parsed = JSON.parse(event.json);
        } catch {
          return; // not an event line
        }
        onLine(parsed);
      } else if (event.type === "exit") {
        finish();
        resolve({ code: event.code, stderrTail: event.stderrTail });
      }
    };

    invoke("claude_cli_run", {
      req: { requestId, ...request },
      onEvent: channel,
    }).catch((error: unknown) => {
      finish();
      reject(errorFromInvoke(error));
    });
  });

  return { requestId, done, stop: cancel };
}

function usageOf(line: CliLine | null) {
  const u = line?.usage;
  const promptTokens =
    (u?.input_tokens ?? 0) +
    (u?.cache_creation_input_tokens ?? 0) +
    (u?.cache_read_input_tokens ?? 0);
  const completionTokens = u?.output_tokens ?? 0;
  return { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
}

/**
 * Guards against a CLI that is not using the subscription - an API key in
 * its own configuration would bill the API instead. The start-up event's
 * `apiKeySource` is "none" when the CLI runs on the claude.ai sign-in.
 */
function notOnSubscription(line: CliLine): ClaudeCliError | null {
  if (line.type !== "system" || line.subtype !== "init" || !line.apiKeySource) return null;
  if (line.apiKeySource === "none") return null;
  return new ClaudeCliError(
    "CLI_FAILED",
    `The claude CLI is set up to use an API key (${line.apiKeySource}), not your Claude subscription, so the run was stopped. Remove the key from the CLI's configuration and sign in with /login.`,
  );
}

interface StructuredAnswer {
  narration: string;
  toolCalls: { name: string; arguments: Record<string, unknown> }[];
}

/** The shape check on `structured_output`. Anything else is a failure, not a silent fallback. */
export function readStructuredAnswer(output: unknown, toolNames: string[]): StructuredAnswer | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) return null;
  const { narration, tool_calls } = output as { narration?: unknown; tool_calls?: unknown };
  if (typeof narration !== "string" || !Array.isArray(tool_calls)) return null;
  const toolCalls: StructuredAnswer["toolCalls"] = [];
  for (const call of tool_calls) {
    if (!call || typeof call !== "object") return null;
    const { name, arguments: args } = call as { name?: unknown; arguments?: unknown };
    if (typeof name !== "string" || !toolNames.includes(name)) return null;
    if (!args || typeof args !== "object" || Array.isArray(args)) return null;
    toolCalls.push({ name, arguments: args as Record<string, unknown> });
  }
  return { narration, toolCalls };
}

interface RunOutcome {
  /** Structured mode: the answer. Stream mode: null. */
  answer: StructuredAnswer | null;
  /** Stream mode: the text (cut at a stop sequence). */
  text: string;
  usage: ReturnType<typeof usageOf>;
}

/**
 * Runs one request to its end. `onText` receives streamed text as it
 * arrives (stream mode only). Throws ClaudeCliError, or an AbortError on
 * abort.
 */
async function runToEnd(
  body: GenerateRequestBody,
  toolNames: string[],
  onText: (text: string) => void,
  signal?: AbortSignal,
): Promise<RunOutcome> {
  const structured = toolNames.length > 0;
  const { systemPrompt, prompt } = renderCliPrompt(body.messages, structured ? body.tools : undefined);
  const family = CLAUDE_CLI_MODELS[body.model as keyof typeof CLAUDE_CLI_MODELS].family;
  const cutter = new StopCutter(body.stop ?? []);

  let result: CliLine | null = null;
  let failure: ClaudeCliError | null = null;
  let streamedText = "";

  const run = startRun(
    {
      model: family,
      effort: mapEffort(body.reasoningEffort),
      mode: structured
        ? { kind: "structured", schema: buildRoundSchema(toolNames, body.toolChoice === "required") }
        : { kind: "stream" },
      systemPrompt,
      prompt,
    },
    (line) => {
      if (failure || cutter.isStopped) return;
      const notSubscription = notOnSubscription(line);
      if (notSubscription) {
        failure = notSubscription;
        run.stop();
        return;
      }
      if (line.type === "result") {
        result = line;
        return;
      }
      if (
        !structured &&
        line.type === "stream_event" &&
        line.event?.type === "content_block_delta" &&
        line.event.delta?.type === "text_delta" &&
        line.event.delta.text
      ) {
        const out = cutter.push(line.event.delta.text);
        if (out) {
          streamedText += out;
          onText(out);
        }
        if (cutter.isStopped) run.stop();
      }
    },
    signal,
  );

  const exit = await run.done;
  // Assigned from the line callback, which control-flow analysis cannot see.
  const failed = failure as ClaudeCliError | null;
  if (failed) throw failed;

  if (!structured && cutter.isStopped) {
    return { answer: null, text: streamedText, usage: usageOf(result) };
  }

  const final = result as CliLine | null;
  if (!final) {
    throw classifyCliFailure(exit.stderrTail || `exit code ${exit.code ?? "unknown"}`);
  }
  if (final.is_error || final.subtype !== "success") {
    throw classifyCliFailure(final.result || exit.stderrTail || final.subtype || "");
  }

  if (structured) {
    const answer = readStructuredAnswer(final.structured_output, toolNames);
    if (!answer) {
      throw new ClaudeCliError(
        "CLI_FAILED",
        "The claude CLI's answer did not match the response format (narration and tool calls).",
      );
    }
    return { answer, text: "", usage: usageOf(final) };
  }

  // No partial events (or none before the result): the result carries the text.
  if (!streamedText && final.result) {
    const out = cutter.push(final.result);
    streamedText += out;
    if (out) onText(out);
  }
  const rest = cutter.flush();
  if (rest) {
    streamedText += rest;
    onText(rest);
  }
  return { answer: null, text: streamedText, usage: usageOf(final) };
}

function metaFor(body: GenerateRequestBody, usage: RunOutcome["usage"]) {
  return {
    model: CLAUDE_CLI_MODELS[body.model as keyof typeof CLAUDE_CLI_MODELS].pinnedId,
    modelName: body.model as string,
    provider: "claude-cli" as const,
    usage,
    // On the subscription: no per-call charge. The CLI's own dollar figure
    // is notional for subscribers (design §4.3).
    estimatedCost: 0,
  };
}

function toolCallsFor(answer: StructuredAnswer, runTag: string) {
  return answer.toolCalls.map((call, i) => ({
    id: `${runTag}_${i}`,
    type: "function" as const,
    function: { name: call.name, arguments: call.arguments },
  }));
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-store, must-revalidate",
  Connection: "keep-alive",
};

let callCounter = 0;

/**
 * The providerFetch branch for a subscription model: the same Response
 * shapes as the API routes.
 */
export async function claudeCliFetch(
  path: "/api/generate" | "/api/generate-stream",
  body: GenerateRequestBody,
  signal?: AbortSignal,
): Promise<Response> {
  if (!isClaudeCliModel(body.model)) {
    throw new Error(`claudeCliFetch called for a non-subscription model: ${body.model}`);
  }
  const toolNames = toolNamesOf(body.tools ?? []);
  // Unique within the app's lifetime, so tool-call ids never repeat across
  // rounds of a turn (a later round may run on another provider).
  const runTag = `cli${Date.now().toString(36)}${callCounter++}`;

  if (path === "/api/generate-stream") {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (data: unknown) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        try {
          const outcome = await runToEnd(
            body,
            toolNames,
            (text) => emit({ type: "content", content: text }),
            signal,
          );
          if (outcome.answer) {
            if (outcome.answer.narration) {
              emit({ type: "content", content: outcome.answer.narration });
            }
            const toolCalls = toolCallsFor(outcome.answer, runTag);
            if (toolCalls.length > 0) emit({ type: "tool_calls", toolCalls });
          }
          emit({ type: "done", meta: metaFor(body, outcome.usage) });
          controller.close();
        } catch (error) {
          if (signal?.aborted) {
            controller.error(abortErrorFor(signal));
            return;
          }
          const cliError =
            error instanceof ClaudeCliError ? error : classifyCliFailure(String(error));
          logger.error("Claude CLI run failed", { code: cliError.code, error: cliError.message });
          emit({ type: "error", error: cliError.message, code: cliError.code });
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: SSE_HEADERS });
  }

  try {
    const outcome = await runToEnd(body, toolNames, () => {}, signal);
    const success: GenerateSuccess = {
      content: outcome.answer ? outcome.answer.narration : outcome.text,
      reasoning: "",
      reasoning_details: [],
      // Arguments as a JSON string, the way providers hand them back.
      toolCalls: outcome.answer
        ? toolCallsFor(outcome.answer, runTag).map((call) => ({
            ...call,
            function: { ...call.function, arguments: JSON.stringify(call.function.arguments) },
          }))
        : [],
      meta: metaFor(body, outcome.usage),
    };
    return new Response(JSON.stringify(success), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (signal?.aborted) throw abortErrorFor(signal);
    const cliError = error instanceof ClaudeCliError ? error : classifyCliFailure(String(error));
    logger.error("Claude CLI run failed", { code: cliError.code, error: cliError.message });
    return new Response(
      JSON.stringify({ error: cliError.message, status: 502, code: cliError.code }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
}
