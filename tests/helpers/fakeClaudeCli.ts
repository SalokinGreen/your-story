/**
 * A stand-in for `@tauri-apps/api/core` that plays the desktop app's
 * `claude_cli_*` commands (src-tauri/src/claude_cli.rs) from a script, so
 * claudeCli.ts and a whole turn can run on a mocked CLI.
 *
 * Use it with:
 *   vi.mock("@tauri-apps/api/core", async () =>
 *     (await import("./helpers/fakeClaudeCli")).fakeTauriCore);
 *   import { fakeCli } from "./helpers/fakeClaudeCli";
 *
 * `fakeCli.respond` decides each run's output from its request. A run's
 * lines are delivered on its channel in order, then its exit, the same order
 * the Rust command sends them in.
 */

export interface CliRunRequest {
  requestId: string;
  model: "opus" | "sonnet" | "haiku";
  effort: "low" | "medium" | "high" | "xhigh";
  mode: { kind: "structured"; schema: string } | { kind: "stream" };
  systemPrompt: string;
  prompt: string;
}

export interface CliScript {
  /** NDJSON events, as objects. */
  lines?: object[];
  code?: number | null;
  stderrTail?: string;
  /** Rejects the invoke itself, the way the Rust command reports a launch failure. */
  invokeError?: string;
  /** Keeps the run going until claude_cli_cancel is called for it. */
  hang?: boolean;
}

type ChannelMessage =
  | { type: "line"; json: string }
  | { type: "exit"; code: number | null; stderrTail: string };

class FakeChannel<T = ChannelMessage> {
  onmessage: (message: T) => void = () => {};
}

const INIT_LINE = {
  type: "system",
  subtype: "init",
  apiKeySource: "none",
  tools: [],
  mcp_servers: [],
  model: "claude-sonnet-5-5",
};

export const fakeCli = {
  platform: true,
  status: {
    installed: true,
    version: "2.1.306",
    loggedIn: true,
    authMethod: "claude.ai",
    subscriptionType: "max",
  },
  runs: [] as CliRunRequest[],
  cancels: [] as string[],
  respond: ((): CliScript => {
    throw new Error("fakeCli.respond is not set for this test");
  }) as (req: CliRunRequest) => CliScript,
  releases: new Map<string, () => void>(),

  reset(): void {
    this.platform = true;
    this.status = {
      installed: true,
      version: "2.1.306",
      loggedIn: true,
      authMethod: "claude.ai",
      subscriptionType: "max",
    };
    this.runs = [];
    this.cancels = [];
    this.releases = new Map();
    this.respond = () => {
      throw new Error("fakeCli.respond is not set for this test");
    };
  },

  /** A structured run's lines: init, then a successful result carrying `output`. */
  structured(output: unknown, usage = { input_tokens: 3, cache_creation_input_tokens: 1000, cache_read_input_tokens: 0, output_tokens: 50 }): object[] {
    return [
      INIT_LINE,
      {
        type: "result",
        subtype: "success",
        is_error: false,
        result: JSON.stringify(output),
        structured_output: output,
        usage,
      },
    ];
  },

  /** A stream run's lines: init, one text delta per chunk, then the result. */
  streamed(chunks: string[]): object[] {
    return [
      INIT_LINE,
      ...chunks.map((text) => ({
        type: "stream_event",
        event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
      })),
      {
        type: "result",
        subtype: "success",
        is_error: false,
        result: chunks.join(""),
        usage: { input_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 20 },
      },
    ];
  },

  /** A failed run's lines, the way the CLI reports a refused request. */
  failed(text: string): object[] {
    return [INIT_LINE, { type: "result", subtype: "success", is_error: true, result: text }];
  },
};

async function invoke(command: string, args: Record<string, unknown> = {}): Promise<unknown> {
  if (command === "claude_cli_status") return fakeCli.status;
  if (command === "claude_cli_cancel") {
    const requestId = args.requestId as string;
    fakeCli.cancels.push(requestId);
    fakeCli.releases.get(requestId)?.();
    return undefined;
  }
  if (command !== "claude_cli_run") {
    throw new Error(`fakeClaudeCli: unexpected command ${command}`);
  }
  const req = args.req as CliRunRequest;
  const channel = args.onEvent as FakeChannel;
  fakeCli.runs.push(req);
  const script = fakeCli.respond(req);
  if (script.invokeError) throw script.invokeError;
  // Delivered asynchronously, as the real channel does.
  await Promise.resolve();
  for (const line of script.lines ?? []) {
    channel.onmessage({ type: "line", json: JSON.stringify(line) });
  }
  if (script.hang) {
    await new Promise<void>((resolve) => fakeCli.releases.set(req.requestId, resolve));
    channel.onmessage({ type: "exit", code: null, stderrTail: "" });
    return undefined;
  }
  channel.onmessage({
    type: "exit",
    code: script.code === undefined ? 0 : script.code,
    stderrTail: script.stderrTail ?? "",
  });
  return undefined;
}

export const fakeTauriCore = {
  isTauri: () => fakeCli.platform,
  invoke,
  Channel: FakeChannel,
};
