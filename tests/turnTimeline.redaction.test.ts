/**
 * The player's view of what the GM read (judge-layer design 4, Codex finding on
 * turnTimeline.ts:407): expanding a read_notes pill or a reasoning fold must
 * not read a hidden or secret note's text. Titles stay; the text becomes
 * "(hidden note)".
 */
import { describe, it, expect } from "vitest";
import {
  HIDDEN_NOTE_PLACEHOLDER,
  buildSavedTimeline,
  redactForPlayer,
  toolResultBlock,
} from "@/app/misc/turnTimeline";

const HIDDEN_NOTE_RESULT =
  "[Read Notes: The Duke, The Gate]\n[Found 2 of 2 notes]" +
  "\n\n---\n### The Duke [[HIDDEN_LORE:The Duke]]\n(HIDDEN FROM PLAYER - do not narrate this content or reveal its existence. To reveal it once the player genuinely discovers it, call edit_note with visibility: \"always_reveal\".)\nThe Duke poisoned his brother." +
  "[[/HIDDEN_LORE]]" +
  "\n\n---\n### The Gate\nA rusted gate, chained shut." +
  "\n---";

const SECRET_NOTE_RESULT =
  "[Read Notes: The Vault, The Gate]\n[Found 2 of 2 notes]" +
  "\n\n---\n### The Vault (Secret)\nThe key is under the third stone." +
  "\n\n---\n### The Gate\nA rusted gate, chained shut." +
  "\n---";

describe("redactForPlayer", () => {
  it("keeps the title and replaces a hidden note's text, marker and all", () => {
    const out = redactForPlayer(HIDDEN_NOTE_RESULT, "read_notes");
    expect(out).toContain("### The Duke");
    expect(out).toContain(HIDDEN_NOTE_PLACEHOLDER);
    expect(out).not.toContain("poisoned");
    expect(out).not.toContain("HIDDEN_LORE");
    expect(out).not.toContain("HIDDEN FROM PLAYER");
    // An ordinary note in the same result is untouched.
    expect(out).toContain("A rusted gate, chained shut.");
  });

  it("replaces the body of a secret-type note, which carries no marker", () => {
    const out = redactForPlayer(SECRET_NOTE_RESULT, "read_notes");
    expect(out).toContain("### The Vault (Secret)");
    expect(out).not.toContain("third stone");
    expect(out).toContain(HIDDEN_NOTE_PLACEHOLDER);
    expect(out).toContain("A rusted gate, chained shut.");
    // The closing rule survives.
    expect(out.trimEnd().endsWith("---")).toBe(true);
  });

  it("leaves an ordinary read_notes result and other tools alone", () => {
    const plain = "[Read Notes: The Gate]\n[Found 1 of 1 notes]\n\n---\n### The Gate\nA rusted gate.\n---";
    expect(redactForPlayer(plain, "read_notes")).toBe(plain);
    // A "(Secret)" lookalike in another tool's text is not touched.
    const other = "\n\n---\n### Thing (Secret)\nbody\n---";
    expect(redactForPlayer(other, "search_memory")).toBe(other);
  });

  it("redacts marker spans inside reasoning text too", () => {
    const thought = "Checking [[HIDDEN_LORE:Heir]]the heir is the baker[[/HIDDEN_LORE]] before I narrate.";
    expect(redactForPlayer(thought)).toBe(`Checking ${HIDDEN_NOTE_PLACEHOLDER} before I narrate.`);
  });

  it("is idempotent", () => {
    const once = redactForPlayer(HIDDEN_NOTE_RESULT, "read_notes");
    expect(redactForPlayer(once, "read_notes")).toBe(once);
    const secretOnce = redactForPlayer(SECRET_NOTE_RESULT, "read_notes");
    expect(redactForPlayer(secretOnce, "read_notes")).toBe(secretOnce);
  });
});

describe("what reaches the player's work line", () => {
  it("redacts a live read_notes result", () => {
    const block = toolResultBlock({
      toolName: "read_notes",
      toolCallId: "t1",
      success: true,
      contextForStory: HIDDEN_NOTE_RESULT,
    });
    expect(block.contextForStory).not.toContain("poisoned");
    expect(block.contextForStory).toContain("### The Duke");
  });

  it("redacts a saved read_notes result when the timeline is rebuilt", () => {
    const blocks = buildSavedTimeline(
      [
        {
          role: "assistant",
          content: "",
          tool_calls: [
            { id: "t1", function: { name: "read_notes", arguments: "{}" } },
          ],
        },
      ],
      new Map([
        [
          "t1",
          {
            success: true,
            toolName: "read_notes",
            contextForStory: SECRET_NOTE_RESULT,
          },
        ],
      ]),
      true,
    );
    const tool = blocks.find((b) => b.kind === "tool")!;
    expect(tool.contextForStory).not.toContain("third stone");
    expect(tool.contextForStory).toContain("### The Vault (Secret)");
  });
});
