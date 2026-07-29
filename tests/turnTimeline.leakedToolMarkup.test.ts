/**
 * When an inference backend fails to strip its own tool-call template before
 * returning `content` (see toolCallFallback.ts), the markup arrives on the
 * narration channel and used to be rendered to the player verbatim - a wall
 * of `<||DSML||invoke name="create_note">…` in the middle of the scene.
 * The timeline parser is the single funnel for player-visible GM text, so it
 * is where the leak gets dropped, for live streaming and saved scenes alike.
 */
import { describe, it, expect } from "vitest";
import {
  extractVisibleText,
  parseTaggedContent,
  splitPendingTag,
} from "@/app/misc/turnTimeline";

const GLM_LEAK =
  '<||DSML||tool_calls><||DSML||invoke name="create_note">' +
  '<||DSML||parameter name="title" string="true">Nik</||DSML||parameter>' +
  '<||DSML||parameter name="type" string="true">character_sheet</||DSML||parameter>' +
  "</||DSML||invoke></||DSML||tool_calls>";

describe("leaked tool-call markup never reaches the player", () => {
  it("drops a complete leaked block from visible text", () => {
    const raw = `The lantern gutters.\n\n${GLM_LEAK}\n\nYou step through.`;
    expect(extractVisibleText(raw)).toBe(
      "The lantern gutters.\n\nYou step through."
    );
  });

  it("drops the single-piped DeepSeek spelling too", () => {
    const raw =
      'Before.\n\n<|DSML|invoke name="add_memory">' +
      '<|DSML|parameter name="entry" string="true">Owes 50g</|DSML|parameter>' +
      "</|DSML|invoke>";
    expect(extractVisibleText(raw)).toBe("Before.");
  });

  it("hides a leaked block that is still streaming in, chunk by chunk", () => {
    // Every prefix of the buffer - including the half-arrived opener - has to
    // render as narration only, never as a flash of raw markup on its way in.
    const prose = "The lantern gutters.";
    const raw = `${prose}\n\n${GLM_LEAK}`;
    for (let i = 1; i <= raw.length; i++) {
      const visible = extractVisibleText(raw.slice(0, i));
      expect(prose.startsWith(visible)).toBe(true);
    }
  });

  it("keeps a leaked block out of the timeline blocks entirely", () => {
    const blocks = parseTaggedContent(
      `<thinking>rolling for it</thinking>${GLM_LEAK}The lock clicks.`
    );
    expect(blocks).toEqual([
      { kind: "thinking", content: "rolling for it" },
      { kind: "text", content: "The lock clicks." },
    ]);
  });

  it("holds back a partial namespace token instead of showing it", () => {
    expect(splitPendingTag("You step through.<||DSM")).toEqual({
      safe: "You step through.",
      pending: "<||DSM",
    });
  });

  it("leaves ordinary prose with angle brackets alone", () => {
    const prose = "The gap is < 2 inches wide, and the pressure > 3 atm.";
    expect(extractVisibleText(prose)).toBe(prose);
  });
});
