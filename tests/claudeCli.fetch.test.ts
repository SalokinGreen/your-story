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
import { logger } from "@/app/misc/logger";
import {
  getClaudeCliStatus,
  resetClaudeCliStatusCache,
  setOnlineSessionActive,
} from "@/app/misc/claudeCliModels";
import { getAvailableModelKeys } from "@/app/misc/ai_prices";
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
      { role: "user", content: "> I attack the goblin", cacheBreakpoint: "turn" },
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
  resetClaudeCliStatusCache();
  setOnlineSessionActive(false);
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

  it("emits a reply shorter than the longest stop sequence once, not twice", async () => {
    fakeCli.respond = () => ({ lines: fakeCli.streamed(["The door ", "opens."]) });
    const events = await frames(
      await claudeCliFetch(
        "/api/generate-stream",
        gmRound({ tools: undefined, stop: ["[GAME MASTER State Update]", "[STOP]"] }),
      ),
    );
    expect(events.filter((e) => e.type === "content").map((e) => e.content).join("")).toBe("The door opens.");
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

  it("stops a run whose start-up event cannot confirm the subscription", async () => {
    fakeCli.respond = () => ({
      lines: [
        { type: "system", subtype: "init" },
        { type: "result", subtype: "success", is_error: false, structured_output: { narration: "x", tool_calls: [] } },
      ],
    });
    const events = await frames(await claudeCliFetch("/api/generate-stream", gmRound()));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error", code: "CLI_FAILED" });
    expect(events[0].error).toContain("did not confirm");
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

describe("a CLI pointed at another API provider", () => {
  it("is not usable for the subscription, in the catalog or for a run", async () => {
    resetClaudeCliStatusCache();
    fakeCli.status = { ...fakeCli.status, apiProvider: "bedrock" };
    fakeCli.respond = () => ({ lines: fakeCli.structured({ narration: "ok", tool_calls: [] }) });
    await getClaudeCliStatus(true);

    expect(getAvailableModelKeys({})).not.toContain("Claude Sonnet (subscription)");
    const events = await frames(await claudeCliFetch("/api/generate-stream", gmRound()));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error", code: "CLI_FAILED" });
    expect(events[0].error).toContain("bedrock");
    expect(fakeCli.runs).toHaveLength(0);
  });

  it("is usable when it reports firstParty", async () => {
    resetClaudeCliStatusCache();
    await getClaudeCliStatus(true);
    expect(getAvailableModelKeys({})).toContain("Claude Sonnet (subscription)");
  });
});

describe("online play (decision 29)", () => {
  it("never launches the CLI for a request that arrives during an online session", async () => {
    fakeCli.respond = () => ({ lines: fakeCli.structured({ narration: "ok", tool_calls: [] }) });
    setOnlineSessionActive(true);

    const events = await frames(await claudeCliFetch("/api/generate-stream", gmRound()));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error", code: "CLI_BLOCKED_ONLINE" });
    expect(events[0].error).toContain("online play");

    const side = await claudeCliFetch("/api/generate", gmRound({ tools: undefined }));
    expect(side.ok).toBe(false);
    expect(await side.json()).toMatchObject({ code: "CLI_BLOCKED_ONLINE" });

    expect(fakeCli.runs).toHaveLength(0);
  });

  it("runs again once the session ends", async () => {
    fakeCli.respond = () => ({ lines: fakeCli.structured({ narration: "ok", tool_calls: [] }) });
    setOnlineSessionActive(true);
    setOnlineSessionActive(false);
    const events = await frames(await claudeCliFetch("/api/generate-stream", gmRound()));
    expect(events[0]).toEqual({ type: "content", content: "ok" });
    expect(fakeCli.runs).toHaveLength(1);
  });
});

describe("the first round of a fresh conversation", () => {
  const OOC =
    "(OOC: my dice and note tools aren't responding on my end, so I haven't set up your character sheet.) The bridge sways.";

  /** A fresh conversation: no tool call and no tool result anywhere in it. */
  const fresh = (over: Partial<GenerateRequestBody> = {}) => gmRound(over);

  /** The same turn one round on: a tool call and its result are now in the transcript. */
  const laterRound = (over: Partial<GenerateRequestBody> = {}) =>
    gmRound({
      messages: [
        { role: "system", content: "You ARE the Game Master." },
        { role: "user", content: "> I attack the goblin", cacheBreakpoint: "turn" },
        {
          role: "assistant",
          content: "",
          tool_calls: [{ id: "c0", type: "function", function: { name: "calculate", arguments: '{"expression":"1+1"}' } }],
        },
        { role: "tool", content: "2", tool_call_id: "c0" },
      ],
      ...over,
    });

  it("retries once, forced, when it makes no call and claims its tools are down", async () => {
    let call = 0;
    fakeCli.respond = () => {
      call++;
      return call === 1
        ? { lines: fakeCli.structured({ narration: OOC, tool_calls: [] }) }
        : {
            lines: fakeCli.structured({
              narration: "",
              tool_calls: [{ name: "calculate", arguments: { expression: "14+3 >= 15" } }],
            }),
          };
    };

    const events = await frames(await claudeCliFetch("/api/generate-stream", fresh()));

    expect(fakeCli.runs).toHaveLength(2);
    const schema = (i: number) => JSON.parse((fakeCli.runs[i].mode as { schema: string }).schema);
    expect(schema(0).properties.tool_calls.minItems).toBeUndefined();
    expect(schema(1).properties.tool_calls.minItems).toBe(1);
    // The retry says the tools work, and the failed reply is not in its prompt.
    expect(fakeCli.runs[1].prompt).toContain("[System note]\nYour tools are available");
    expect(fakeCli.runs[1].prompt).not.toContain("aren't responding");
    // The player gets the retried answer only.
    expect(events.map((e) => e.type)).toEqual(["tool_calls", "done"]);
    expect(JSON.stringify(events)).not.toContain("OOC");
  });

  it("counts both runs in the usage it reports", async () => {
    let call = 0;
    fakeCli.respond = () => {
      call++;
      return call === 1
        ? { lines: fakeCli.structured({ narration: OOC, tool_calls: [] }, { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 5 }) }
        : { lines: fakeCli.structured({ narration: "", tool_calls: [{ name: "calculate", arguments: {} }] }, { input_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 7 }) };
    };
    const done = (await frames(await claudeCliFetch("/api/generate-stream", fresh()))).find((e) => e.type === "done");
    expect(done?.meta).toMatchObject({ usage: { promptTokens: 30, completionTokens: 12, totalTokens: 42 } });
  });

  it("never retries more than once, even if the retry makes no call either", async () => {
    fakeCli.respond = () => ({ lines: fakeCli.structured({ narration: OOC, tool_calls: [] }) });
    const events = await frames(await claudeCliFetch("/api/generate-stream", fresh()));
    expect(fakeCli.runs).toHaveLength(2);
    expect(events[events.length - 1].type).toBe("done");
  });

  it("does not retry a tool-less first round that is an ordinary reply", async () => {
    // A fresh story's GM may ask a vague player a question first.
    fakeCli.respond = () => ({
      lines: fakeCli.structured({ narration: "Welcome! What kind of story are you in the mood for?", tool_calls: [] }),
    });
    const events = await frames(await claudeCliFetch("/api/generate-stream", fresh()));
    expect(fakeCli.runs).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "content" });
  });

  it("does not retry a tool-less round later in the turn, whatever it says", async () => {
    fakeCli.respond = () => ({ lines: fakeCli.structured({ narration: OOC, tool_calls: [] }) });
    const events = await frames(await claudeCliFetch("/api/generate-stream", laterRound()));
    expect(fakeCli.runs).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "content" });
  });

  it("does not retry a round the roll gate already forced", async () => {
    fakeCli.respond = () => ({ lines: fakeCli.structured({ narration: OOC, tool_calls: [] }) });
    await frames(await claudeCliFetch("/api/generate-stream", fresh({ toolChoice: "required" })));
    expect(fakeCli.runs).toHaveLength(1);
  });

  it("applies to a side call that offers tools too, through /api/generate", async () => {
    let call = 0;
    fakeCli.respond = () => {
      call++;
      return call === 1
        ? { lines: fakeCli.structured({ narration: OOC, tool_calls: [] }) }
        : { lines: fakeCli.structured({ narration: "ok", tool_calls: [{ name: "calculate", arguments: {} }] }) };
    };
    const data = await (await claudeCliFetch("/api/generate", fresh())).json();
    expect(fakeCli.runs).toHaveLength(2);
    expect(data.toolCalls).toHaveLength(1);
  });

  // The Designer's real shape: its prompt, the chat so far, then a trailing
  // state message. Its first reply to a new draft is usually a question, and
  // "write any notes down" is its ordinary phrasing (engine review).
  const designerRound = (over: Partial<GenerateRequestBody> = {}): GenerateRequestBody => ({
    messages: [
      { role: "system", content: "You are the Game Designer." },
      { role: "user", content: "I want a heist that's already going wrong. What do you think it needs?" },
      { role: "system", content: "## Current adventure state\n(empty)" },
    ],
    tools: [
      { type: "function", function: { name: "set_premise", description: "Set it.", parameters: { type: "object" } } },
      { type: "function", function: { name: "write_note", description: "Write.", parameters: { type: "object" } } },
    ],
    model: "Claude Sonnet (subscription)",
    reasoningEffort: "high",
    ...over,
  });

  it("leaves the Designer's talk-first question alone, and never writes into the draft for it", async () => {
    fakeCli.respond = () => ({
      lines: fakeCli.structured({
        narration: "Love it. Before I write any notes down, one question: is the crew professional or desperate?",
        tool_calls: [],
      }),
    });
    const data = await (await claudeCliFetch("/api/generate", designerRound())).json();
    expect(fakeCli.runs).toHaveLength(1);
    expect(data.toolCalls ?? []).toHaveLength(0);
    expect(data.content).toContain("professional or desperate");
  });

  it("retries the Designer's first round when it does claim its tools are down", async () => {
    let call = 0;
    fakeCli.respond = () => {
      call++;
      return call === 1
        ? { lines: fakeCli.structured({ narration: OOC, tool_calls: [] }) }
        : { lines: fakeCli.structured({ narration: "", tool_calls: [{ name: "set_premise", arguments: { premise: "A heist gone wrong." } }] }) };
    };
    const data = await (await claudeCliFetch("/api/generate", designerRound())).json();
    expect(fakeCli.runs).toHaveLength(2);
    expect(data.toolCalls.map((c: { function: { name: string } }) => c.function.name)).toEqual(["set_premise"]);
    // The retry note goes after the state message, the system prompt is untouched.
    expect(fakeCli.runs[1].systemPrompt).toBe(fakeCli.runs[0].systemPrompt);
    expect(fakeCli.runs[1].prompt).toContain("[System note]\nYour tools are available");
  });

  it("fails the round, with the CLI's code, when the retry itself fails; the first answer is not kept", async () => {
    let call = 0;
    fakeCli.respond = () => {
      call++;
      return call === 1
        ? { lines: fakeCli.structured({ narration: OOC, tool_calls: [] }) }
        : { lines: fakeCli.failed("You've hit your session limit") };
    };
    const events = await frames(await claudeCliFetch("/api/generate-stream", fresh()));
    expect(fakeCli.runs).toHaveLength(2);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error", code: "CLI_USAGE_LIMIT" });
  });

  it("launches no retry when the player stops the turn after the first run", async () => {
    const controller = new AbortController();
    fakeCli.respond = () => {
      queueMicrotask(() => controller.abort());
      return { lines: fakeCli.structured({ narration: OOC, tool_calls: [] }) };
    };
    await expect(claudeCliFetch("/api/generate", fresh(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fakeCli.runs).toHaveLength(1);
  });

  it("does not retry on a claim written only in the model's own thinking", async () => {
    fakeCli.respond = () => ({
      lines: fakeCli.structured({
        narration: "<thinking>I don't call any tools this round; I ask first.</thinking>Which tone do you want?",
        tool_calls: [],
      }),
    });
    await frames(await claudeCliFetch("/api/generate-stream", fresh()));
    expect(fakeCli.runs).toHaveLength(1);
  });

  it("marks the retry in the Debug Logs, so it is told apart from a gate's forced re-prompt", async () => {
    const action = vi.spyOn(logger, "action").mockImplementation(() => {});
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    let call = 0;
    fakeCli.respond = () => {
      call++;
      return call === 1
        ? { lines: fakeCli.structured({ narration: OOC, tool_calls: [] }) }
        : { lines: fakeCli.structured({ narration: "", tool_calls: [{ name: "calculate", arguments: {} }] }) };
    };
    await frames(await claudeCliFetch("/api/generate-stream", fresh()));
    const runs = action.mock.calls.filter((c) => c[0] === "Claude CLI run").map((c) => c[1] as Record<string, unknown>);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({ round: 1, forced: false, firstRoundRetry: false });
    expect(runs[1]).toMatchObject({ round: 1, forced: true, firstRoundRetry: true });
    expect(warn.mock.calls.some((c) => String(c[0]).includes("retrying once"))).toBe(true);
    action.mockRestore();
    warn.mockRestore();
  });
});

describe("per-run diagnostics in the Debug Logs", () => {
  it("logs model, effort, round, timings, the tool calls that came back and the subtype", async () => {
    const action = vi.spyOn(logger, "action").mockImplementation(() => {});
    fakeCli.respond = () => ({
      lines: [
        { type: "system", subtype: "init", apiKeySource: "none" },
        {
          type: "result",
          subtype: "success",
          is_error: false,
          duration_ms: 8123,
          duration_api_ms: 7601,
          num_turns: 2,
          stop_reason: "tool_use",
          structured_output: { narration: "You lunge.", tool_calls: [{ name: "formula_roll", arguments: { formulas: ["1d20"] } }] },
          usage: { input_tokens: 4, cache_creation_input_tokens: 100, cache_read_input_tokens: 50, output_tokens: 20 },
        },
      ],
    });
    await frames(await claudeCliFetch("/api/generate-stream", gmRound()));

    const entry = action.mock.calls.find((c) => c[0] === "Claude CLI run");
    expect(entry).toBeDefined();
    expect(entry![1]).toMatchObject({
      model: "claude-sonnet-5-5",
      effort: "high",
      mode: "structured",
      round: 1,
      forced: false,
      firstRoundRetry: false,
      cliMs: 8123,
      modelMs: 7601,
      numTurns: 2,
      subtype: "success",
      isError: false,
      stopReason: "tool_use",
      toolCalls: 1,
      toolNames: ["formula_roll"],
      narrationChars: 10,
      usage: { promptTokens: 154, completionTokens: 20, totalTokens: 174 },
    });
    expect(typeof (entry![1] as { wallMs: number }).wallMs).toBe("number");
    action.mockRestore();
  });

  it("counts the round from the transcript", async () => {
    const action = vi.spyOn(logger, "action").mockImplementation(() => {});
    fakeCli.respond = () => ({ lines: fakeCli.structured({ narration: "Done.", tool_calls: [] }) });
    await frames(
      await claudeCliFetch(
        "/api/generate-stream",
        gmRound({
          messages: [
            { role: "system", content: "sys" },
            { role: "user", content: "> act" },
            { role: "assistant", content: "", tool_calls: [{ id: "a", type: "function", function: { name: "calculate", arguments: "{}" } }] },
            { role: "tool", content: "1", tool_call_id: "a" },
            { role: "assistant", content: "", tool_calls: [{ id: "b", type: "function", function: { name: "calculate", arguments: "{}" } }] },
            { role: "tool", content: "2", tool_call_id: "b" },
          ],
        }),
      ),
    );
    expect(action.mock.calls.find((c) => c[0] === "Claude CLI run")![1]).toMatchObject({ round: 3 });
    action.mockRestore();
  });

  it("logs a failed run with its subtype and the stderr tail", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    fakeCli.respond = () => ({ lines: [], code: 1, stderrTail: "unknown option '--safe-mode'" });
    await frames(await claudeCliFetch("/api/generate-stream", gmRound()));
    const entry = warn.mock.calls.find((c) => c[0] === "Claude CLI run failed");
    expect(entry![1]).toMatchObject({ error: "CLI_FAILED", exitCode: 1, stderrTail: "unknown option '--safe-mode'", mode: "structured" });
    warn.mockRestore();
  });

  it("logs a usage-limit failure with the CLI's subtype", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    fakeCli.respond = () => ({ lines: fakeCli.failed("You've hit your session limit") });
    await frames(await claudeCliFetch("/api/generate-stream", gmRound()));
    const entry = warn.mock.calls.find((c) => c[0] === "Claude CLI run failed");
    expect(entry![1]).toMatchObject({ error: "CLI_USAGE_LIMIT", subtype: "success", isError: true });
    warn.mockRestore();
  });
});
