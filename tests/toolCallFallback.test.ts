/**
 * extractFallbackToolCalls recovers a tool call from `content` text for a
 * known DeepSeek reliability issue (deepseek-ai/DeepSeek-V3 issue #1244):
 * the model sometimes emits a tool call as plain text instead of populating
 * the API response's tool_calls field. Deliberately conservative - only
 * fires on content that parses as a recognizable tool-call shape, never on
 * ordinary prose.
 */
import { describe, it, expect } from "vitest";
import { extractFallbackToolCalls } from "../app/misc/toolCallFallback";

describe("extractFallbackToolCalls", () => {
  it("returns null for ordinary prose", () => {
    expect(
      extractFallbackToolCalls("The door creaks open as you step inside.")
    ).toBeNull();
  });

  it("returns null for empty content", () => {
    expect(extractFallbackToolCalls("")).toBeNull();
    expect(extractFallbackToolCalls("   ")).toBeNull();
  });

  it("recovers a bare { name, arguments } object", () => {
    const content = JSON.stringify({
      name: "formula_roll",
      arguments: { formula: "1d20+5", dc: 15 },
    });
    const calls = extractFallbackToolCalls(content);
    expect(calls).not.toBeNull();
    expect(calls![0].function.name).toBe("formula_roll");
    expect(JSON.parse(calls![0].function.arguments)).toEqual({
      formula: "1d20+5",
      dc: 15,
    });
  });

  it("recovers an OpenAI-shaped single tool call object", () => {
    const content = JSON.stringify({
      id: "call_123",
      function: { name: "add_npc", arguments: '{"name":"Bob"}' },
    });
    const calls = extractFallbackToolCalls(content);
    expect(calls).not.toBeNull();
    expect(calls![0].id).toBe("call_123");
    expect(calls![0].function.name).toBe("add_npc");
    expect(calls![0].function.arguments).toBe('{"name":"Bob"}');
  });

  it("recovers a { tool_calls: [...] } wrapper", () => {
    const content = JSON.stringify({
      tool_calls: [
        { function: { name: "skip_tools", arguments: { reason: "test" } } },
      ],
    });
    const calls = extractFallbackToolCalls(content);
    expect(calls).not.toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls![0].function.name).toBe("skip_tools");
  });

  it("recovers a bare array of tool-call-shaped objects", () => {
    const content = JSON.stringify([
      { name: "add_memory", arguments: { entry: "Owes 50g" } },
    ]);
    const calls = extractFallbackToolCalls(content);
    expect(calls).not.toBeNull();
    expect(calls![0].function.name).toBe("add_memory");
  });

  it("recovers a tool call wrapped in a markdown code fence", () => {
    const content =
      '```json\n{"name": "resolve_random_event", "arguments": {"id": "evt-1"}}\n```';
    const calls = extractFallbackToolCalls(content);
    expect(calls).not.toBeNull();
    expect(calls![0].function.name).toBe("resolve_random_event");
  });

  it("returns null for valid JSON that isn't tool-call-shaped", () => {
    expect(extractFallbackToolCalls(JSON.stringify({ foo: "bar" }))).toBeNull();
    expect(extractFallbackToolCalls(JSON.stringify([1, 2, 3]))).toBeNull();
  });

  it("assigns unique fallback ids when the source object has none", () => {
    const content = JSON.stringify({ name: "skip_tools", arguments: {} });
    const calls = extractFallbackToolCalls(content);
    expect(calls![0].id).toMatch(/^fallback_/);
  });
});
