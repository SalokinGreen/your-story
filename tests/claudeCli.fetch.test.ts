/**
 * claudeCliFetch (app/misc/claudeCli.ts, plan B2) on a scripted CLI
 * (tests/helpers/fakeClaudeCli.ts): it must hand the GM loop the same SSE
 * frames /api/generate-stream does, and side calls the same JSON
 * /api/generate does; every failure is an error with a code, never a
 * silent fallback; and an abort kills the process and rejects as an
 * AbortError.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", async () => (await import("./helpers/fakeClaudeCli")).fakeTauriCore);

import { fakeCli, CliScript } from "./helpers/fakeClaudeCli";
import { claudeCliFetch } from "@/app/misc/claudeCli";
import { providerFetch } from "@/app/misc/providerFetch";
import type { GenerateRequestBody } from "@/app/misc/providerCall";

const TOOLS = [
  { type: "function", function: { name: "formula_roll", description: "Roll.", parameters: { type: "object" } } },
  { type: "function", function: { name: "calculate", description: "Math.", parameters: { type: "object" } } },
];

function gmRound(overrides: Partial<GenerateRequestBody> = {}): GenerateRequestBody {
  return {
    messages: [
      { role: "system", content: "You ARE the Game Master." },
      { role: "user", content: "> I attack the goblin", cacheBreakpoint: true },
    ],
    tools: TOOLS,
    model: "Claude Sonnet (subscription)",
    reasoningEffort: "high",
    ...overrides,
  };
}

/** One SSE frame, as generation.ts's parseSSEStream yields it. */
interface Frame {
  type: string;
  content?: string;
  toolCalls?: { id: string; type: string; function: { name: string; arguments: unknown } }[];
  meta?: unknown;
  error?: string;
  code?: string;
}

/** Reads a Response body the way generation.ts's parseSSEStream does. */
async function frames(response: Response): Promise<Frame[]> {
  const text = await response.text();
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim())
    .filter((d) => d !== "[DONE]")
    .map((d) => JSON.parse(d));
}

beforeEach(() => {
  fakeCli.reset();
});

describe("a GM round (structured mode)", () => {
  it("becomes content, tool_calls and done frames", async () => {
    fakeCli.respond = () => ({
      lines: fakeCli.structured({
        narration: "You lunge at the goblin.",
        tool_calls: [{ name: "formula_roll", arguments: { formulas: ["1d20+3"], reason: "attack" } }],
      }),
    });
    const events = await frames(await claudeCliFetch("/api/generate-stream", gmRound()));
    expect(events.map((e) => e.type)).toEqual(["content", "tool_calls", "done"]);
    expect(events[0].content).toBe("You lunge at the goblin.");
    const [call] = events[1].toolCalls!;
    expect(call.type).toBe("function");
    expect(call.function).toEqual({ name: "formula_roll", arguments: { formulas: ["1d20+3"], reason: "attack" } });
    expect(call.id).toMatch(/^cli\w+_0$/);
    expect(events[2].meta).toEqual({
      model: "claude-sonnet-5-5",
      modelName: "Claude Sonnet (subscription)",
      provider: "claude-cli",
      usage: { promptTokens: 1003, completionTokens: 50, totalTokens: 1053 },
      estimatedCost: 0,
    });
  });

  it("sends the CLI the family, the mapped effort, the schema and the rendered prompt", async () => {
    fakeCli.respond = () => ({ lines: fakeCli.structured({ narration: "ok", tool_calls: [] }) });
    await (await claudeCliFetch("/api/generate-stream", gmRound({ toolChoice: "required" }))).text();
    const [run] = fakeCli.runs;
    expect(run.model).toBe("sonnet");
    expect(run.effort).toBe("high");
    expect(run.mode.kind).toBe("structured");
    const schema = JSON.parse((run.mode as { schema: string }).schema);
    expect(schema.properties.tool_calls.minItems).toBe(1);
    expect(schema.properties.tool_calls.items.properties.name.enum).toEqual(["formula_roll", "calculate"]);
    expect(run.prompt).toBe("[User]\n> I attack the goblin");
    expect(run.systemPrompt).toContain("### formula_roll");
  });

  it("gives tool calls ids that never repeat across rounds", async () => {
    fakeCli.respond = () => ({
      lines: fakeCli.structured({ narration: "", tool_calls: [{ name: "calculate", arguments: {} }] }),
    });
    const first = await frames(await claudeCliFetch("/api/generate-stream", gmRound()));
    const second = await frames(await claudeCliFetch("/api/generate-stream", gmRound()));
    const id = (events: Frame[]) => events.find((e) => e.type === "tool_calls")?.toolCalls?.[0].id;
    expect(id(first)).not.toBe(id(second));
  });

  it("fails, rather than guessing, when the answer is not the round's shape", async () => {
    fakeCli.respond = () => ({ lines: fakeCli.structured({ text: "free-form" }) });
    const events = await frames(await claudeCliFetch("/api/generate-stream", gmRound()));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error", code: "CLI_FAILED" });
  });
});

describe("narration (stream mode)", () => {
  it("streams each text delta as a content frame", async () => {
    fakeCli.respond = () => ({ lines: fakeCli.streamed(["The blade ", "bites deep."]) });
    const events = await frames(
      await claudeCliFetch("/api/generate-stream", gmRound({ tools: undefined })),
    );
    expect(fakeCli.runs[0].mode).toEqual({ kind: "stream" });
    expect(events.filter((e) => e.type === "content").map((e) => e.content).join("")).toBe("The blade bites deep.");
    expect(events[events.length - 1].type).toBe("done");
  });

  it("cuts the text at a stop sequence and stops the process", async () => {
    fakeCli.respond = () => ({
      lines: fakeCli.streamed(["The door opens.", " [GAME MASTER State Update] hp: 3"]),
    });
    const events = await frames(
      await claudeCliFetch(
        "/api/generate-stream",
        gmRound({ tools: undefined, stop: ["[GAME MASTER State Update]", "[STOP]"] }),
      ),
    );
    expect(events.filter((e) => e.type === "content").map((e) => e.content).join("")).toBe("The door opens. ");
    expect(fakeCli.cancels).toEqual([fakeCli.runs[0].requestId]);
  });
});

describe("side calls (/api/generate)", () => {
  it("returns the route's JSON, tool-call arguments as a string", async () => {
    fakeCli.respond = () => ({
      lines: fakeCli.structured({
        narration: "Added a villain.",
        tool_calls: [{ name: "calculate", arguments: { expression: "2" } }],
      }),
    });
    const response = await claudeCliFetch("/api/generate", gmRound());
    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.content).toBe("Added a villain.");
    expect(data.toolCalls[0].function).toEqual({ name: "calculate", arguments: '{"expression":"2"}' });
    expect(data.meta.provider).toBe("claude-cli");
  });

  it("returns plain text when no tools are offered", async () => {
    fakeCli.respond = () => ({ lines: fakeCli.streamed(['{"verdict":"ok"}']) });
    const data = await (await claudeCliFetch("/api/generate", gmRound({ tools: undefined }))).json();
    expect(data.content).toBe('{"verdict":"ok"}');
    expect(data.toolCalls).toEqual([]);
  });

  it("reports a failure as a non-ok response with its code", async () => {
    fakeCli.respond = () => ({ lines: fakeCli.failed("You've hit your weekly limit") });
    const response = await claudeCliFetch("/api/generate", gmRound({ tools: undefined }));
    expect(response.ok).toBe(false);
    expect(await response.json()).toMatchObject({ code: "CLI_USAGE_LIMIT" });
  });
});

describe("errors", () => {
  async function errorFrame(script: CliScript) {
    fakeCli.respond = () => script;
    const events = await frames(await claudeCliFetch("/api/generate-stream", gmRound()));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
    return events[0];
  }

  it("CLI_NOT_FOUND when the desktop app cannot find the binary", async () => {
    const e = await errorFrame({ invokeError: "CLI_NOT_FOUND: the claude CLI is not installed, or not on PATH" });
    expect(e.code).toBe("CLI_NOT_FOUND");
    expect(e.error).toContain("/login");
  });

  it("CLI_NOT_SIGNED_IN when the CLI asks for a login", async () => {
    const e = await errorFrame({ lines: fakeCli.failed("Invalid API key · Please run /login") });
    expect(e.code).toBe("CLI_NOT_SIGNED_IN");
  });

  it("CLI_USAGE_LIMIT on a session or weekly limit", async () => {
    const e = await errorFrame({ lines: fakeCli.failed("You've hit your session limit · resets 3pm") });
    expect(e.code).toBe("CLI_USAGE_LIMIT");
    expect(e.error).toContain("not switched to a paid provider");
  });

  it("CLI_FAILED with the stderr tail when the process ends without a result", async () => {
    const e = await errorFrame({ lines: [], code: 1, stderrTail: "unknown option '--safe-mode'" });
    expect(e.code).toBe("CLI_FAILED");
    expect(e.error).toContain("unknown option '--safe-mode'");
  });

  it("stops a run that is not on the subscription", async () => {
    fakeCli.respond = () => ({
      lines: [
        { type: "system", subtype: "init", apiKeySource: "ANTHROPIC_API_KEY" },
        { type: "result", subtype: "success", is_error: false, structured_output: { narration: "x", tool_calls: [] } },
      ],
    });
    const events = await frames(await claudeCliFetch("/api/generate-stream", gmRound()));
    expect(events).toHaveLength(1);
    expect(events[0].code).toBe("CLI_FAILED");
    expect(events[0].error).toContain("API key");
    expect(fakeCli.cancels).toHaveLength(1);
  });
});

describe("abort", () => {
  it("kills the process and errors the stream with an AbortError", async () => {
    fakeCli.respond = () => ({ lines: [{ type: "system", subtype: "init", apiKeySource: "none" }], hang: true });
    const controller = new AbortController();
    const response = await claudeCliFetch("/api/generate-stream", gmRound(), controller.signal);
    const reader = response.body!.getReader();
    const read = reader.read();
    await new Promise((r) => setTimeout(r, 0));
    controller.abort();
    await expect(read).rejects.toMatchObject({ name: "AbortError" });
    expect(fakeCli.cancels).toEqual([fakeCli.runs[0].requestId]);
  });

  it("rejects a side call with an AbortError", async () => {
    fakeCli.respond = () => ({ lines: [], hang: true });
    const controller = new AbortController();
    const pending = claudeCliFetch("/api/generate", gmRound({ tools: undefined }), controller.signal);
    await new Promise((r) => setTimeout(r, 0));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fakeCli.cancels).toHaveLength(1);
  });

  it("never launches when already aborted", async () => {
    fakeCli.respond = () => ({ lines: fakeCli.structured({ narration: "", tool_calls: [] }) });
    const controller = new AbortController();
    controller.abort();
    await expect(
      claudeCliFetch("/api/generate", gmRound(), controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fakeCli.runs).toHaveLength(0);
  });
});

describe("providerFetch routing", () => {
  it("sends a subscription model to the CLI on the desktop", async () => {
    fakeCli.respond = () => ({ lines: fakeCli.structured({ narration: "ok", tool_calls: [] }) });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const events = await frames(await providerFetch("/api/generate-stream", gmRound()));
    expect(events[0]).toEqual({ type: "content", content: "ok" });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("off the desktop, never launches anything and leaves the request to the route", async () => {
    fakeCli.platform = false;
    const fetchSpy = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchSpy);
    await providerFetch("/api/generate", gmRound());
    expect(fakeCli.runs).toHaveLength(0);
    expect(fetchSpy).toHaveBeenCalledWith("/api/generate", expect.anything());
    vi.unstubAllGlobals();
  });
});
