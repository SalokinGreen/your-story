/**
 * renderCliPrompt with the stable prefix (token-savings plan slice 5): the
 * system file holds everything up to the "prefix" mark (the stable block and
 * history), so it is byte-identical across a turn's rounds and grows only at
 * its end between turns; the live block, the action and the rounds are stdin.
 */
import { describe, it, expect } from "vitest";
import { renderCliPrompt } from "@/app/misc/claudeCli";
import type { ChatMessage } from "@/app/misc/providerCall";

const TOOLS = [
  {
    type: "function",
    function: { name: "calculate", description: "Math.", parameters: { type: "object" } },
  },
];

/** The GM layout: system, stable block, ack, history, the end of history marked, live+action, prefill. */
const LAYOUT: ChatMessage[] = [
  { role: "system", content: "You ARE the Game Master." },
  { role: "user", content: "## Foundation\nThe DM's notes." },
  { role: "assistant", content: "<thinking>I've reviewed the current game state.</thinking>" },
  { role: "user", content: "> I look around" },
  { role: "assistant", content: "The bridge sways.", cacheBreakpoint: "prefix" },
  { role: "user", content: "## Live\nHP 10\n\n> I attack the goblin", cacheBreakpoint: "turn" },
  { role: "assistant", content: "<thinking>" },
];

const ROUND_1_REPLY: ChatMessage = {
  role: "assistant",
  content: "You lunge.",
  tool_calls: [
    { id: "cli_a_0", type: "function", function: { name: "calculate", arguments: { expression: "1+1" } } },
  ],
};

describe("renderCliPrompt with the stable prefix", () => {
  it("puts everything up to the end of history in the system file", () => {
    const { systemPrompt, prompt } = renderCliPrompt(LAYOUT, TOOLS);
    expect(systemPrompt).toContain("The DM's notes.");
    expect(systemPrompt).toContain("The bridge sways.");
    expect(systemPrompt).not.toContain("HP 10");
    expect(prompt).toBe("[User]\n## Live\nHP 10\n\n> I attack the goblin");
  });

  it("keeps the system file byte-identical across a turn's rounds", () => {
    const round1 = renderCliPrompt(LAYOUT, TOOLS);
    const round2 = renderCliPrompt(
      [
        ...LAYOUT,
        ROUND_1_REPLY,
        { role: "tool", content: "2", tool_call_id: "cli_a_0", cacheBreakpoint: "round" },
      ],
      TOOLS,
    );
    expect(round2.systemPrompt).toBe(round1.systemPrompt);
    expect(round2.prompt.startsWith(round1.prompt)).toBe(true);
  });

  it("grows the system file only at its end between turns", () => {
    const turn1 = renderCliPrompt(LAYOUT, TOOLS).systemPrompt;
    const nextTurn: ChatMessage[] = [
      ...LAYOUT.slice(0, 4),
      { role: "assistant", content: "The bridge sways." },
      { role: "user", content: "> I attack the goblin" },
      { role: "assistant", content: "You lunge.", cacheBreakpoint: "prefix" },
      { role: "user", content: "## Live\nHP 7\n\n> I retreat", cacheBreakpoint: "turn" },
    ];
    const turn2 = renderCliPrompt(nextTurn, TOOLS).systemPrompt;
    // Everything up to the previous turn's last history message is shared.
    const sharedHead = turn1.slice(0, turn1.indexOf("[You]\nThe bridge sways."));
    expect(sharedHead.length).toBeGreaterThan(100);
    expect(turn2.startsWith(sharedHead)).toBe(true);
  });

  it("still splits at a lone 'turn' mark, as before the stable prefix", () => {
    const { systemPrompt, prompt } = renderCliPrompt(
      [
        { role: "system", content: "sys" },
        { role: "user", content: "state" },
        { role: "assistant", content: "ack" },
        { role: "user", content: "> act", cacheBreakpoint: "turn" },
      ],
      TOOLS,
    );
    expect(systemPrompt).toContain("state");
    expect(prompt).toBe("[User]\n> act");
  });
});
