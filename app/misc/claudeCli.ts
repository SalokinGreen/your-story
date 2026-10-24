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
  getCachedClaudeCliStatus,
  isClaudeCliModel,
  isOnlineSessionActive,
} from "./claudeCliModels";
import { GM_STAGE_AFFIRMATION } from "./ai_staged";
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
 * off, so `none` runs at `low`. Every caller sends an effort (decision 53:
 * the default is `none`, so the narration voice and the Designer on the
 * subscription run at `low` unless the player raises their effort); a call
 * that still arrives without one gets `medium`, Claude's own default on Opus
 * and Haiku.
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
 * Prefills the CLI cannot take: a trailing assistant message, and the GM's
 * `<thinking>` prefill once a round has been appended after it. That prefill
 * is the plain assistant message directly after the message marked
 * `cacheBreakpoint: "turn"` (the player's action, buildGMStagePrompt), followed by
 * another assistant message - the round's reply, whether it called tools,
 * wrote prose a gate then sent back, or led into the story stage. Also, in
 * the current turn (after the last user message), any plain assistant
 * message directly before one that carries tool calls.
 */
function dropPrefills(messages: ChatMessage[]): ChatMessage[] {
  let end = messages.length;
  while (end > 0 && messages[end - 1].role === "assistant" && !messages[end - 1].tool_calls?.length) {
    end--;
  }
  const kept = messages.slice(0, end);
  const lastUser = kept.map((m) => m.role).lastIndexOf("user");
  return kept.filter((m, i) => {
    if (m.role !== "assistant" || m.tool_calls?.length) return true;
    const next = kept[i + 1];
    if (kept[i - 1]?.cacheBreakpoint === "turn" && (next?.role === "assistant" || m.content === GM_STAGE_AFFIRMATION)) {
      return false;
    }
    if (i <= lastUser) return true;
    return !(next?.role === "assistant" && next.tool_calls?.length);
  });
}

/**
 * The transcript is flat text, so a line inside a message that looks like a
 * block header - a player's action, a guest's, an imported note - must not
 * pass for one. Escaped with a backslash; the same input always renders the
 * same bytes.
 */
function escapeHeaders(text: string): string {
  return text.replace(/^\[(User|You|Tool result|System note)\b/gm, "\\[$1");
}

function renderBlock(message: ChatMessage, toolNameById: Map<string, string>): string {
  const content = escapeHeaders(message.content ?? "");
  if (message.role === "user") return `[User]\n${content}`;
  if (message.role === "system") return `[System note]\n${content}`;
  if (message.role === "tool") {
    const id = message.tool_call_id ?? "";
    const name = toolNameById.get(id);
    return `[Tool result${name ? ` · ${name}` : ""}${id ? ` · ${id}` : ""}]\n${content}`;
  }
  const parts: string[] = ["[You]"];
  if (content) parts.push(content);
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

/**
 * The answer-protocol paragraph for a request that offers tools. With the
 * CLI's own tools off, the model sees only its structured-answer channel, and
 * can read the GM prompt's "call the tool" as unfulfillable: in the first live
 * run (docs/claude-gm-implementation-plan.md, "First live run") the first
 * round of a fresh conversation twice made no call, once answering that its
 * "dice and note tools aren't responding". Later rounds, with a call already
 * in the transcript, were fine. So the paragraph says outright that the tools
 * are run for the model and that `tool_calls` is the only way to use one, and
 * shows a call: `formula_roll`'s when it is offered, a shape otherwise. It
 * depends only on the offered tool names, so it renders to the same bytes in
 * every round of a turn and the system prompt stays cacheable.
 */
function structuredProtocol(toolNames: string[]): string {
  const example = toolNames.includes("formula_roll")
    ? '{"narration":"","tool_calls":[{"name":"formula_roll","arguments":{"formulas":["1d20+3"],"reason":"Strike the goblin"}}]}'
    : '{"narration":"<your text, or empty>","tool_calls":[{"name":"<a tool listed above>","arguments":{<that tool\'s parameters>}}]}';
  return [
    "## How to answer",
    "",
    TRANSCRIPT_GUIDE,
    "",
    "Write only your next reply, as the JSON object the response format asks for:",
    '- "narration": your reply\'s text, exactly as you would write it, including any <thinking> notes the instructions above ask for. It may be empty when this round only asks for tools.',
    '- "tool_calls": the tools the engine should run now, each as {"name": …, "arguments": {…}}, with arguments that match that tool\'s parameters.',
    "",
    'You have no tool of your own to call. The tools listed above are run for you by the engine, and the only way to use one is to put it in "tool_calls". They are always available: never say that a tool is unavailable or not responding. When the instructions above tell you to call a tool (a roll, a note, a change to the game state), add the call. When you only need to ask the player something, or have nothing to run, leave "tool_calls" empty.',
    "",
    "Example of a round that asks for one roll; the engine runs it and shows you the result in the next round:",
    example,
  ].join("\n");
}

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
 * caller marked `cacheBreakpoint: "prefix"` (the GM's stable block and
 * history), and the answer protocol make up the system prompt, which is
 * therefore identical in every round of a turn and grows only at its end
 * between turns, so the CLI's prompt cache can serve it. Everything after
 * the marked message is the prompt, and since a later round only appends
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

  // Everything up to and including the "prefix" message (history's end) is
  // the stable part; the live block, the action and the rounds are the prompt.
  // A request marked only "turn" (no prefix) keeps the older split: before the
  // marked action is stable, the action on is the prompt. The split falls back
  // to "all prompt" when it would leave the prompt empty.
  const prefixIndex = conversation.map((m) => m.cacheBreakpoint === "prefix").lastIndexOf(true);
  const turnIndex = conversation.map((m) => m.cacheBreakpoint === "turn").lastIndexOf(true);
  const splitAt =
    prefixIndex >= 0 && prefixIndex < conversation.length - 1
      ? prefixIndex + 1
      : turnIndex > 0
        ? turnIndex
        : 0;
  const stable = splitAt > 0 ? conversation.slice(0, splitAt) : [];
  const current = splitAt > 0 ? conversation.slice(splitAt) : conversation;

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
  sections.push(hasTools ? structuredProtocol(toolNamesOf(tools!)) : PLAIN_PROTOCOL);

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
  | "CLI_BLOCKED_ONLINE"
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
  /** Whole run, and the part spent waiting on the model, in ms. */
  duration_ms?: number;
  duration_api_ms?: number;
  num_turns?: number;
  stop_reason?: string;
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
    invoke("claude_cli_cancel", { requestId }).catch((error: unknown) => {
      logger.warn("Could not stop the claude CLI run", { requestId, error: String(error) });
    });
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
  const cachedTokens = u?.cache_read_input_tokens ?? 0;
  const cacheWriteTokens = u?.cache_creation_input_tokens ?? 0;
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    ...(cachedTokens ? { cachedTokens } : {}),
    ...(cacheWriteTokens ? { cacheWriteTokens } : {}),
  };
}

/**
 * Guards against a CLI that is not using the subscription - an API key in
 * its own configuration would bill the API instead. The start-up event's
 * `apiKeySource` is "none" when the CLI runs on the claude.ai sign-in.
 * Fails closed: a start-up event without the field (a CLI update that
 * renamed it) stops the run too, rather than risk billing an API.
 */
function notOnSubscription(line: CliLine): ClaudeCliError | null {
  if (line.type !== "system" || line.subtype !== "init") return null;
  if (line.apiKeySource === "none") return null;
  return new ClaudeCliError(
    "CLI_FAILED",
    line.apiKeySource
      ? `The claude CLI is set up to use an API key (${line.apiKeySource}), not your Claude subscription, so the run was stopped. Remove the key from the CLI's configuration and sign in with /login.`
      : "The claude CLI did not confirm it is running on your Claude subscription (its start-up event has no apiKeySource), so the run was stopped. The installed CLI version may have changed its output.",
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
 * Which round of the turn a request is, as far as the transcript shows: one
 * more than the assistant messages that made tool calls since the last user
 * message (the player's action, or a gate's re-prompt).
 */
function roundInTranscript(messages: ChatMessage[]): number {
  const lastUser = messages.map((m) => m.role).lastIndexOf("user");
  return 1 + messages.slice(lastUser + 1).filter((m) => m.role === "assistant" && m.tool_calls?.length).length;
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
  firstRoundRetry = false,
): Promise<RunOutcome> {
  const structured = toolNames.length > 0;
  const { systemPrompt, prompt } = renderCliPrompt(body.messages, structured ? body.tools : undefined);
  const family = CLAUDE_CLI_MODELS[body.model as keyof typeof CLAUDE_CLI_MODELS].family;
  const cutter = new StopCutter(body.stop ?? []);
  const startedAt = Date.now();

  // One Debug Logs line per run, so a miss or a slow round can be read back
  // afterwards: the CLI's own events are not kept anywhere else.
  const report = (final: CliLine | null, extra: Record<string, unknown>, failed = false) => {
    const data = {
      model: CLAUDE_CLI_MODELS[body.model as keyof typeof CLAUDE_CLI_MODELS].pinnedId,
      effort: mapEffort(body.reasoningEffort),
      mode: structured ? "structured" : "stream",
      round: roundInTranscript(body.messages),
      forced: body.toolChoice === "required",
      // The one forced retry of a first-round miss; a gate's re-prompt also
      // restarts `round` at 1 and is told apart by this flag.
      firstRoundRetry,
      wallMs: Date.now() - startedAt,
      // The CLI's own timing: the whole run, and the part spent on the model.
      cliMs: final?.duration_ms,
      modelMs: final?.duration_api_ms,
      numTurns: final?.num_turns,
      subtype: final?.subtype,
      isError: final?.is_error,
      stopReason: final?.stop_reason,
      usage: usageOf(final),
      ...extra,
    };
    if (failed) logger.warn("Claude CLI run failed", data);
    else logger.action("Claude CLI run", data);
  };

  let result: CliLine | null = null;
  let failure: ClaudeCliError | null = null;
  let streamedText = "";
  // Whether any text delta arrived - not whether any text was emitted yet,
  // which the stop-sequence hold-back can delay past the end of a short reply.
  let sawDelta = false;

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
        sawDelta = true;
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
  if (failed) {
    report(null, { error: failed.code, stderrTail: exit.stderrTail }, true);
    throw failed;
  }

  if (!structured && cutter.isStopped) {
    report(result as CliLine | null, { stoppedAtMarker: true, textChars: streamedText.length });
    return { answer: null, text: streamedText, usage: usageOf(result) };
  }

  const final = result as CliLine | null;
  if (!final) {
    const error = classifyCliFailure(exit.stderrTail || `exit code ${exit.code ?? "unknown"}`);
    report(null, { error: error.code, exitCode: exit.code, stderrTail: exit.stderrTail }, true);
    throw error;
  }
  if (final.is_error || final.subtype !== "success") {
    const error = classifyCliFailure(final.result || exit.stderrTail || final.subtype || "");
    report(final, { error: error.code, exitCode: exit.code, stderrTail: exit.stderrTail }, true);
    throw error;
  }

  if (structured) {
    const answer = readStructuredAnswer(final.structured_output, toolNames);
    if (!answer) {
      report(final, { error: "CLI_FAILED", reason: "answer did not match the response format", stderrTail: exit.stderrTail }, true);
      throw new ClaudeCliError(
        "CLI_FAILED",
        "The claude CLI's answer did not match the response format (narration and tool calls).",
      );
    }
    report(final, {
      toolCalls: answer.toolCalls.length,
      toolNames: answer.toolCalls.map((c) => c.name),
      narrationChars: answer.narration.length,
    });
    return { answer, text: "", usage: usageOf(final) };
  }

  // No partial events at all: the result carries the text.
  if (!sawDelta && final.result) {
    const out = cutter.push(final.result);
    streamedText += out;
    if (out) onText(out);
  }
  const rest = cutter.flush();
  if (rest) {
    streamedText += rest;
    onText(rest);
  }
  report(final, { textChars: streamedText.length });
  return { answer: null, text: streamedText, usage: usageOf(final) };
}

// ============================================================
// The first round of a fresh conversation
// ============================================================

/**
 * Whether prose claims the model's tools are down. The signature of the
 * first-round miss (see structuredProtocol): "(OOC: my dice and note tools
 * aren't responding on my end ...)". Not exhaustive and not meant to be: the
 * protocol paragraph is the main fix, and this only recognises the claim so
 * the engine can ask once more. A tool-less first reply is otherwise a
 * legitimate answer (a fresh story's GM is told to ask a vague player a
 * question first, and the Designer talks before it builds), so the absence of
 * calls alone must not trigger a retry - and neither may everyday words
 * ("write any notes down", "a broken lantern", "rolling the dice").
 *
 * What it takes is the tool noun itself ("tool(s)", "tool call(s)",
 * "function call(s)") straight beside an outage verb, or the model saying it
 * cannot use or does not have those tools. The reasoning in `<thinking>` is
 * left out: it talks about tools all the time ("I don't call any tools this
 * round") and is not the reply.
 */
const TOOL_NOUN = String.raw`(?:tools?|tool calls?|function calls?)`;
const TOOL_NOUN_PHRASE = String.raw`(?:(?:my|the|these|those|our|all|any)\s+)?(?:(?:dice|note|roll|game|state|lore|npc)(?:\s*(?:,|and|or|&)\s*(?:dice|note|roll|game|state|lore|npc))*\s+)?${TOOL_NOUN}`;
const OUTAGE_STATE = String.raw`(?:unavailable|offline|unresponsive|failing|failed|down(?=\s*(?:[,.;:!?)]|$)|\s+(?:right\s+now|at\s+the\s+moment|for\s+now|currently|on\s+my\s+end))|not\s+(?:responding|working|available|loading|connecting|connected|reachable|accessible|functioning|going\s+through))`;
const OUTAGE_NEGATED = String.raw`(?:aren['’]?t|isn['’]?t|won['’]?t|can['’]?t|cannot|are\s+not|is\s+not|do\s+not|don['’]?t|did\s+not|didn['’]?t|does\s+not|doesn['’]?t)\s+(?:be\s+)?(?:responding|respond|working|work|available|loading|load|connecting|connected|reachable|accessible|functioning|going\s+through)`;
// The CLI's own error wording, which the model repeats when a call it made
// the wrong way is refused ("No such tool available"). Not "no such tool" by
// itself: that is everyday fiction ("there is no such tool in the shed").
const NO_SUCH_TOOL = /\bno\s+such\s+tool\s+(?:is\s+)?available\b/i;
const TOOL_OUTAGE = new RegExp(
  [
    // "my dice and note tools aren't responding", "the tool is unavailable", "tool calls failed"
    String.raw`\b${TOOL_NOUN_PHRASE}\s+(?:(?:are|is|seem\s+to\s+be|appear\s+to\s+be|keep|still|currently|just|have|had)\s+)*(?:${OUTAGE_STATE}|${OUTAGE_NEGATED})\b`,
    // "I can't use my tools", "unable to call any tool"
    String.raw`\b(?:can['’]?t|cannot|(?:am|i['’]?m)\s+(?:not\s+able|unable)\s+to|unable\s+to)\s+(?:seem\s+to\s+)?(?:use|call|run|make|reach|access)\s+(?:any\s+|my\s+|the\s+)?(?:(?:dice|note)\s+)?${TOOL_NOUN}\b`,
    // "I don't have access to my tools"
    String.raw`\b(?:don['’]?t|do\s+not)\s+have\s+(?:any\s+|access\s+to\s+)(?:(?:the|my|any)\s+)?(?:(?:dice|note)\s+)?${TOOL_NOUN}\b`,
    // "came back with a 'No such tool available' error" (the 2026-10-24 playtest)
    NO_SUCH_TOOL.source,
  ].join("|"),
  "i",
);

/** Narration with the model's own `<thinking>` removed (closed or cut off). */
function withoutThinking(text: string): string {
  return text.replace(/<thinking>[\s\S]*?(?:<\/thinking>|$)/gi, "");
}

export function claimsToolsUnavailable(narration: string): boolean {
  return TOOL_OUTAGE.test(withoutThinking(narration));
}

/**
 * The claim, held to a stricter test for a round later in the turn, whose
 * prose may be the story itself: "There is no such tool in the shed" or "you
 * can't use the tools on the bench" must not throw a scene away (engine
 * review of decision 178). There it counts only as the CLI's error wording
 * ("No such tool available") or inside an OOC aside in (round brackets),
 * which is where the 2026-10-24 playtest's stalled setup said it.
 */
export function claimsToolsUnavailableLater(narration: string): boolean {
  const text = withoutThinking(narration);
  if (NO_SUCH_TOOL.test(text)) return true;
  return (text.match(/\([^()]*\)/g) ?? []).some((aside) => TOOL_OUTAGE.test(aside));
}

/** No tool call and no tool result anywhere in the transcript yet. */
function isFreshTranscript(messages: ChatMessage[]): boolean {
  return !messages.some((m) => m.role === "tool" || (m.role === "assistant" && (m.tool_calls?.length ?? 0) > 0));
}


const FORCED_RETRY_NOTE =
  "Your tools are available: the engine runs every call you put in tool_calls. Answer again, this time with at least one tool call that does what the instructions above ask for.";

function sumUsage(a: RunOutcome["usage"], b: RunOutcome["usage"]): RunOutcome["usage"] {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    ...((a.cachedTokens ?? 0) + (b.cachedTokens ?? 0)
      ? { cachedTokens: (a.cachedTokens ?? 0) + (b.cachedTokens ?? 0) }
      : {}),
    ...((a.cacheWriteTokens ?? 0) + (b.cacheWriteTokens ?? 0)
      ? { cacheWriteTokens: (a.cacheWriteTokens ?? 0) + (b.cacheWriteTokens ?? 0) }
      : {}),
  };
}

/**
 * One request to its end. A request that offers tools runs in structured
 * mode, and a round gets one forced retry when it makes no call and claims
 * its tools are down (first seen on the first round of a fresh conversation;
 * the 2026-10-24 playtest saw it mid-setup, after calls had worked, so it is
 * no longer limited to a fresh transcript, decision 178): the same request
 * again with the schema forced (`minItems: 1`, the way the roll gate forces a
 * round) and a note saying the tools work. The failed reply is discarded, not
 * kept in the story or the transcript. At most one retry: the retry is itself
 * forced, so it is never retried, and both runs' usage is counted.
 */
async function runRound(
  body: GenerateRequestBody,
  toolNames: string[],
  onText: (text: string) => void,
  signal?: AbortSignal,
): Promise<RunOutcome> {
  const first = await runToEnd(body, toolNames, onText, signal);
  const answer = first.answer;
  if (
    !answer ||
    toolNames.length === 0 ||
    answer.toolCalls.length > 0 ||
    body.toolChoice === "required" ||
    !(isFreshTranscript(body.messages)
      ? claimsToolsUnavailable(answer.narration)
      : claimsToolsUnavailableLater(answer.narration))
  ) {
    return first;
  }
  logger.warn("Claude CLI: a round claimed its tools were unavailable and made no call - retrying once with a tool call required", {
    narrationPreview: answer.narration.slice(0, 160),
  });
  const retry = await runToEnd(
    {
      ...body,
      toolChoice: "required",
      messages: [...body.messages, { role: "system", content: FORCED_RETRY_NOTE }],
    },
    toolNames,
    onText,
    signal,
    true,
  );
  return { ...retry, usage: sumUsage(first.usage, retry.usage) };
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
  // Decision 29: never launch the CLI for an online session's turns. The
  // tier, narration and layer fallbacks already swap the model; this stops
  // a request that was built before the session began.
  const cached = getCachedClaudeCliStatus();
  const blocked = isOnlineSessionActive()
    ? new ClaudeCliError(
        "CLI_BLOCKED_ONLINE",
        "Claude subscription models are not used during online play, because other players' input would run on your plan. Pick another model, or leave the online session.",
      )
    : cached?.apiProvider && cached.apiProvider !== "firstParty"
      ? new ClaudeCliError(
          "CLI_FAILED",
          `The claude CLI is set up to use ${cached.apiProvider}, not your Claude subscription, so the run was stopped. Check the CLI's own settings.`,
        )
      : null;
  // Unique within the app's lifetime, so tool-call ids never repeat across
  // rounds of a turn (a later round may run on another provider).
  const runTag = `cli${Date.now().toString(36)}${callCounter++}`;

  if (path === "/api/generate-stream") {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        // A late line can still arrive after an abort errored the stream.
        let open = true;
        const emit = (data: unknown) => {
          if (!open) return;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };
        try {
          if (blocked) throw blocked;
          const outcome = await runRound(
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
          open = false;
          controller.close();
        } catch (error) {
          if (signal?.aborted) {
            open = false;
            controller.error(abortErrorFor(signal));
            return;
          }
          const cliError =
            error instanceof ClaudeCliError ? error : classifyCliFailure(String(error));
          logger.error("Claude CLI run failed", { code: cliError.code, error: cliError.message });
          emit({ type: "error", error: cliError.message, code: cliError.code });
          open = false;
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: SSE_HEADERS });
  }

  try {
    if (blocked) throw blocked;
    const outcome = await runRound(body, toolNames, () => {}, signal);
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
