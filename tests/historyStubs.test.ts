import { describe, expect, it, beforeAll } from "vitest";
import {
  STUB_RESULT_THRESHOLD_TOKENS,
  estimateRenderedPartTokens,
  renderHistoryPart,
  stripThinkingForHistory,
  stubToolCallArguments,
  stubToolResult,
} from "@/app/misc/historyStubs";
import { estimateTokens } from "@/app/misc/tokenCounter";
import type { ScenePart } from "@/app/misc/structs";
import { seededText, warmTokenizer } from "./helpers/turnHarness";

beforeAll(async () => {
  await warmTokenizer();
});

const BIG = seededText(600, 1);
const SHORT = "Roll: 17 + 3 = 20";

function assistantPart(
  gmConversation: ScenePart["gmConversation"],
  content = "prose",
): ScenePart {
  return {
    content,
    imageUrl: "",
    user: false,
    role: "assistant",
    gmConversation,
  } as unknown as ScenePart;
}

function call(id: string, name: string, args: object) {
  return {
    id,
    type: "function" as const,
    function: { name, arguments: JSON.stringify(args) },
  };
}

describe("stubToolResult", () => {
  it("keeps a result at or under the threshold verbatim", () => {
    expect(estimateTokens(SHORT)).toBeLessThanOrEqual(STUB_RESULT_THRESHOLD_TOKENS);
    expect(stubToolResult("update_npc", { npc: "Marcus" }, SHORT)).toBe(SHORT);
  });

  it("turns a long read_notes result into a stub naming the note and its size", () => {
    const stub = stubToolResult("read_notes", { titles: ["B&B — Vampire"] }, BIG);
    expect(stub).toMatch(
      /^\[read_notes "B&B — Vampire": [\d,]+ tokens, cleared from history\. Read it again if you need it\.\]$/,
    );
    expect(stub).toContain(estimateTokens(BIG).toLocaleString("en-US"));
  });

  it("stubs any other long result with its tool name and size", () => {
    const stub = stubToolResult("search_memory", { query: "x" }, BIG);
    expect(stub).toMatch(/^\[search_memory: [\d,]+-token result cleared from history\.\]$/);
  });

  it("keeps a dice or oracle result whole, however long", () => {
    const longRoll = `${SHORT}\n${BIG}`;
    expect(stubToolResult("formula_roll", {}, longRoll)).toBe(longRoll);
    expect(stubToolResult("fate_question", {}, longRoll)).toBe(longRoll);
  });
});

describe("stubToolCallArguments", () => {
  it("replaces a long string value and stays valid JSON", () => {
    const args = JSON.stringify({ title: "Character: Mira", content: BIG });
    const parsed = JSON.parse(stubToolCallArguments(args));
    expect(parsed.title).toBe("Character: Mira");
    expect(parsed.content).toMatch(/^\[[\d,]+ tokens, saved\]$/);
  });

  it("reaches into nested values", () => {
    const parsed = JSON.parse(
      stubToolCallArguments(JSON.stringify({ edits: [{ body: BIG, n: 1 }] })),
    );
    expect(parsed.edits[0].n).toBe(1);
    expect(parsed.edits[0].body).toMatch(/tokens, saved/);
  });

  it("leaves short arguments, and arguments that do not parse, untouched", () => {
    const short = JSON.stringify({ npc: "Marcus", status: "dead" });
    expect(stubToolCallArguments(short)).toBe(short);
    const truncated = `{"content":"${BIG}`;
    expect(stubToolCallArguments(truncated)).toBe(truncated);
  });
});

describe("stripThinkingForHistory", () => {
  it("drops <thinking> and keeps the prose", () => {
    expect(stripThinkingForHistory("<thinking>plan</thinking>\nThe door opens.")).toBe(
      "The door opens.",
    );
  });

  it("leaves untagged prose alone", () => {
    expect(stripThinkingForHistory("The door opens.")).toBe("The door opens.");
  });
});

describe("renderHistoryPart", () => {
  const read = [
    {
      role: "assistant" as const,
      content: "<thinking>check</thinking>",
      reasoning: "plain reasoning",
      tool_calls: [call("c1", "read_notes", { titles: ["Salon"] })],
    },
    { role: "tool" as const, content: BIG, tool_call_id: "c1" },
    {
      role: "assistant" as const,
      content: "<thinking>done</thinking>\nThe salon is quiet.",
    },
  ] as ScenePart["gmConversation"];

  it("renders the same part to identical messages twice", () => {
    const part = assistantPart(read);
    expect(JSON.stringify(renderHistoryPart(part, 3))).toBe(
      JSON.stringify(renderHistoryPart(part, 3)),
    );
  });

  it("stubs the long result, drops the thinking, keeps the call and the prose", () => {
    const messages = renderHistoryPart(assistantPart(read), 0);
    expect(messages.map((m) => m.role)).toEqual(["assistant", "tool", "assistant"]);
    expect(messages[0].content).toBe("");
    expect(messages[0].tool_calls?.[0].id).toBe("c1");
    expect(messages[1].content).toMatch(/^\[read_notes "Salon": /);
    expect(messages[1].tool_call_id).toBe("c1");
    expect(messages[2].content).toBe("The salon is quiet.");
  });

  it("keeps plain reasoning on an older tool-call round but drops reasoning_details", () => {
    const withDetails = [
      { ...read![0], reasoning_details: [{ type: "reasoning.encrypted", data: "sig" }] },
      read![1],
      read![2],
    ] as ScenePart["gmConversation"];
    const [first] = renderHistoryPart(assistantPart(withDetails), 0);
    expect(first.reasoning).toBe("plain reasoning");
    expect(first.reasoning_details).toBeUndefined();
    const [recent] = renderHistoryPart(assistantPart(withDetails), 0, {
      isMostRecentRound: true,
    });
    expect(recent.reasoning_details).toHaveLength(1);
  });

  it("stubs a long tool-call argument and keeps a short result", () => {
    const edit = [
      {
        role: "assistant" as const,
        content: "",
        tool_calls: [call("e1", "edit_note", { title: "Character: Mira", content: BIG })],
      },
      { role: "tool" as const, content: "Note updated.", tool_call_id: "e1" },
      { role: "assistant" as const, content: "Done." },
    ] as ScenePart["gmConversation"];
    const messages = renderHistoryPart(assistantPart(edit), 0);
    const args = JSON.parse(messages[0].tool_calls![0].function.arguments);
    expect(args.content).toMatch(/tokens, saved/);
    expect(messages[1].content).toBe("Note updated.");
  });

  it("keeps a dice result", () => {
    const roll = [
      {
        role: "assistant" as const,
        content: "",
        tool_calls: [call("r1", "formula_roll", { formulas: ["1d20+3"] })],
      },
      { role: "tool" as const, content: SHORT, tool_call_id: "r1" },
      { role: "assistant" as const, content: "You hit." },
    ] as ScenePart["gmConversation"];
    expect(renderHistoryPart(assistantPart(roll), 0)[1].content).toBe(SHORT);
  });

  it("renders a user part as the action, and a comment-only one as nothing", () => {
    const user = { content: "open the door", imageUrl: "", user: true, role: "user" } as unknown as ScenePart;
    expect(renderHistoryPart(user, 0)).toEqual([{ role: "user", content: "> open the door" }]);
    const blank = { content: "  ", imageUrl: "", user: true, role: "user" } as unknown as ScenePart;
    expect(renderHistoryPart(blank, 0)).toEqual([]);
  });

  it("replays a legacy part (no gmConversation) with its story output", () => {
    const legacy = {
      content: "The guard nods.",
      imageUrl: "",
      user: false,
      role: "assistant",
    } as unknown as ScenePart;
    expect(renderHistoryPart(legacy, 0)).toEqual([
      { role: "assistant", content: "[STORY OUTPUT]\nThe guard nods." },
    ]);
  });
});

describe("after the engine review", () => {
  it("replays narrator-written prose when the GM only called tools", () => {
    const toolsOnly = [
      { role: "assistant" as const, content: "", tool_calls: [call("u1", "update_npc", { npc: "M" })] },
      { role: "tool" as const, content: "ok", tool_call_id: "u1" },
    ] as ScenePart["gmConversation"];
    const messages = renderHistoryPart(assistantPart(toolsOnly, "The narrator's prose."), 0);
    expect(messages[messages.length - 1]).toEqual({
      role: "assistant",
      content: "The narrator's prose.",
    });
  });

  it("does not repeat prose the conversation already ends on", () => {
    const conversation = [
      { role: "assistant" as const, content: "<thinking>x</thinking>\nThe salon is quiet." },
    ] as ScenePart["gmConversation"];
    const messages = renderHistoryPart(assistantPart(conversation, "The salon is quiet."), 0);
    expect(messages.filter((m) => m.content === "The salon is quiet.")).toHaveLength(1);
  });

  it("replays a thinking-only turn as a placeholder, not as nothing", () => {
    const thinkingOnly = [
      { role: "assistant" as const, content: "<thinking>only thoughts</thinking>" },
    ] as ScenePart["gmConversation"];
    const messages = renderHistoryPart(assistantPart(thinkingOnly, ""), 0);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("assistant");
    expect(messages[0].content).not.toContain("only thoughts");
  });

  it("keeps increment_scene whole and an error's first line in its stub", () => {
    const long = `**ERROR** Note not found.\n${BIG}`;
    expect(stubToolResult("increment_scene", {}, long)).toBe(long);
    const stub = stubToolResult("read_notes", { titles: ["X"] }, long);
    expect(stub.startsWith("**ERROR** Note not found. [read_notes")).toBe(true);
  });

  it("does not count reasoning that is not sent", () => {
    const withReasoning = assistantPart([
      { role: "assistant", content: "", reasoning: seededText(500, 3), tool_calls: [call("c1", "update_npc", {})] },
      { role: "tool", content: "ok", tool_call_id: "c1" },
      { role: "assistant", content: "Done." },
    ] as ScenePart["gmConversation"]);
    expect(estimateRenderedPartTokens(withReasoning, 0)).toBeLessThan(100);
  });
});

describe("estimateRenderedPartTokens", () => {
  it("counts the stub, not the raw result", () => {
    const part = assistantPart([
      { role: "assistant", content: "", tool_calls: [call("c1", "read_notes", { titles: ["Salon"] })] },
      { role: "tool", content: BIG, tool_call_id: "c1" },
      { role: "assistant", content: "The salon is quiet." },
    ] as ScenePart["gmConversation"]);
    const rendered = estimateRenderedPartTokens(part, 0);
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(estimateTokens(BIG) / 3);
  });
});
