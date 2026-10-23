import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GMTurn, PlayerLine, TurnWorkLine } from "@/app/story/StoryTurn";
import type { TimelineBlock } from "@/app/misc/turnTimeline";

const HIDDEN_CONTEXT = "[Hidden Roll: 1d20 = 3 SECRETDICE]";

const blocks: TimelineBlock[] = [
  {
    id: "1",
    kind: "tool",
    toolName: "gm_roll",
    hidden: true,
    contextForStory: HIDDEN_CONTEXT,
  },
  {
    id: "2",
    kind: "tool",
    toolName: "fate_question",
    success: true,
    contextForStory: `[Fate Question: "Is it locked?"]\n[Roll: 37 → Normal Yes]`,
  },
  { id: "3", kind: "text", content: "The door **opens**." },
];

describe("story turn markup", () => {
  it("a hidden gm_roll leaves no trace in the markup", () => {
    const html = renderToStaticMarkup(
      createElement(GMTurn, { content: "The door opens.", liveTimeline: blocks }),
    );
    expect(html).not.toContain("SECRETDICE");
    expect(html).not.toContain("gm_roll");
    expect(html).not.toContain("Hidden Roll");
    expect(html).toContain("Oracle: Yes");
  });

  it("a GM turn has no Game Master label", () => {
    const html = renderToStaticMarkup(
      createElement(GMTurn, { content: "The door opens." }),
    );
    expect(html).not.toContain("Game Master");
    expect(html).toContain("The door opens.");
  });

  it("a saved turn whose GM stage did not narrate shows its content once", () => {
    const html = renderToStaticMarkup(
      createElement(GMTurn, {
        content: "Edited prose.",
        gmConversation: [
          { role: "assistant", content: "<thinking>plan</thinking>Old prose." },
        ],
      }),
    );
    expect(html.match(/Edited prose\./g)).toHaveLength(1);
    expect(html).not.toContain("Old prose.");
  });

  it("a saved turn whose GM stage narrated shows the prose once", () => {
    const html = renderToStaticMarkup(
      createElement(GMTurn, {
        content: "Old prose.",
        gmConversation: [{ role: "assistant", content: "Old prose." }],
      }),
    );
    expect(html.match(/Old prose\./g)).toHaveLength(1);
  });

  it("the work line stays collapsed while streaming and says what is happening", () => {
    const html = renderToStaticMarkup(
      createElement(TurnWorkLine, {
        streaming: true,
        blocks: [
          { id: "t", kind: "thinking", content: "secret plan", streaming: true },
        ],
      }),
    );
    expect(html).toContain("Thinking…");
    expect(html).not.toContain("secret plan");
  });

  it("the player's line shows each speaker and the OOC tag", () => {
    const html = renderToStaticMarkup(
      createElement(PlayerLine, {
        content: "> Ana: I climb\n> Bo: (is this safe?)",
        couchPlayers: [{ id: "a", name: "Ana", color: "#22c55e" }],
      }),
    );
    expect(html).toContain("Ana");
    expect(html).toContain("#22c55e");
    expect(html).toContain("to the GM");
    expect(html).toContain("is this safe?");
  });
});
