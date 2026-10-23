import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  GMTurn,
  PlayerLine,
  TurnActions,
  TurnWorkLine,
  isTurnTap,
} from "@/app/story/StoryTurn";
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

describe("turn actions", () => {
  const noop = () => {};
  const labels = (html: string) =>
    [...html.matchAll(/<button[^>]*aria-label="([^"]+)"/g)].map((m) => m[1]);

  it("the latest turn shows all five actions", () => {
    const html = renderToStaticMarkup(
      createElement(TurnActions, {
        onRetry: noop,
        onUndo: noop,
        onEdit: noop,
        onIllustrate: noop,
        onReadAloud: noop,
      }),
    );
    expect(labels(html)).toEqual([
      "Retry",
      "Undo",
      "Edit",
      "Illustrate",
      "Read aloud",
    ]);
  });

  it("an action whose condition fails is not shown", () => {
    const html = renderToStaticMarkup(
      createElement(TurnActions, { onRetry: noop, onEdit: noop }),
    );
    expect(labels(html)).toEqual(["Retry", "Edit"]);
  });

  it("an earlier turn shows Edit only", () => {
    const html = renderToStaticMarkup(
      createElement(TurnActions, { onEdit: noop }),
    );
    expect(labels(html)).toEqual(["Edit"]);
  });

  it("Undo can read as Undo revision and keeps its title", () => {
    const html = renderToStaticMarkup(
      createElement(TurnActions, {
        onUndo: noop,
        undoLabel: "Undo revision",
        undoTitle: "The Observer revised this response",
      }),
    );
    expect(labels(html)).toEqual(["Undo revision"]);
    expect(html).toContain('title="The Observer revised this response"');
  });

  it("every button is disabled while a turn runs", () => {
    const html = renderToStaticMarkup(
      createElement(TurnActions, { onEdit: noop, onRetry: noop, disabled: true }),
    );
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });

  it("a GM turn gets a focusable Turn actions button, open or not", () => {
    const closed = renderToStaticMarkup(
      createElement(GMTurn, {
        content: "The door opens.",
        onToggleActions: () => {},
        actions: createElement("i", null, "ROW"),
      }),
    );
    expect(closed).toContain('aria-label="Turn actions"');
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).not.toContain("ROW");
    const open = renderToStaticMarkup(
      createElement(GMTurn, {
        content: "The door opens.",
        onToggleActions: () => {},
        actionsOpen: true,
        actions: createElement("i", null, "ROW"),
      }),
    );
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain("ROW");
  });

  it("a turn without the handlers shows no Turn actions button", () => {
    const html = renderToStaticMarkup(
      createElement(GMTurn, { content: "The door opens." }),
    );
    expect(html).not.toContain("Turn actions");
  });

  it("a tap that ends a text selection is not a tap", () => {
    expect(isTurnTap(null, "some words")).toBe(false);
    expect(isTurnTap(null, "")).toBe(true);
  });
});
