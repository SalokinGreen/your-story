import { describe, expect, it } from "vitest";
import {
  isWrappedInParens,
  parsePlayerLine,
  wrapOutOfCharacter,
} from "@/app/story/playerLine";
import type { CouchPlayer } from "@/app/misc/structs";
import { buildTurnText } from "@/app/misc/party/turnText";

const ana: CouchPlayer = { id: "a", name: "Ana", color: "#22c55e" };
const bo: CouchPlayer = { id: "b", name: "Bo", color: "#3b82f6" };

describe("parsePlayerLine", () => {
  it("solo play: one unnamed segment, the leading > removed", () => {
    expect(parsePlayerLine(">I open the door", [])).toEqual([
      { speaker: undefined, name: undefined, body: "I open the door", ooc: false },
    ]);
  });

  it("a colon in solo text is not a speaker name", () => {
    const [seg] = parsePlayerLine(">I say: hello there", []);
    expect(seg.name).toBeUndefined();
    expect(seg.body).toBe("I say: hello there");
  });

  it("a known couch name carries its player", () => {
    const [seg] = parsePlayerLine("> Ana: I draw my sword", [ana, bo]);
    expect(seg.speaker).toBe(ana);
    expect(seg.name).toBe("Ana");
    expect(seg.body).toBe("I draw my sword");
  });

  it("an unknown name keeps the name with no speaker", () => {
    const [seg] = parsePlayerLine("> Zed: hi", [ana, bo]);
    expect(seg.name).toBe("Zed");
    expect(seg.speaker).toBeUndefined();
  });

  it("three queued lines from two speakers are three segments", () => {
    const queued = buildTurnText([
      { playerId: "a", name: "Ana", text: "I climb" },
      { playerId: "b", name: "Bo", text: "I watch the door" },
      { playerId: "a", name: "Ana", text: "and I jump" },
    ])!;
    const segs = parsePlayerLine(queued.text, [ana, bo]);
    expect(segs.map((s) => [s.name, s.body])).toEqual([
      ["Ana", "I climb"],
      ["Bo", "I watch the door"],
      ["Ana", "and I jump"],
    ]);
    expect(segs[0].speaker).toBe(ana);
    expect(segs[1].speaker).toBe(bo);
  });

  it("an unprefixed line joins the segment before it", () => {
    const segs = parsePlayerLine(
      "> Ana: first line\nsecond line\n> Bo: other",
      [ana, bo],
    );
    expect(segs).toHaveLength(2);
    expect(segs[0].body).toBe("first line\nsecond line");
  });

  it("detects out-of-character text per segment", () => {
    const segs = parsePlayerLine("> Ana: (can we skip this?)\n> Bo: I nod", [
      ana,
      bo,
    ]);
    expect(segs[0].ooc).toBe(true);
    expect(segs[0].body).toBe("can we skip this?");
    expect(segs[1].ooc).toBe(false);
    expect(parsePlayerLine(">(can we skip?)", [])[0].ooc).toBe(true);
  });

  it("(a) and (b) is not out of character", () => {
    const [seg] = parsePlayerLine(">(a) and (b)", []);
    expect(seg.ooc).toBe(false);
    expect(seg.body).toBe("(a) and (b)");
    expect(isWrappedInParens("(a (nested) b)")).toBe(true);
  });
});

describe("wrapOutOfCharacter", () => {
  it("wraps plain text in round brackets", () => {
    expect(wrapOutOfCharacter("is this safe?")).toBe("(is this safe?)");
  });

  it("is idempotent", () => {
    const once = wrapOutOfCharacter("is this safe?");
    expect(wrapOutOfCharacter(once)).toBe(once);
    expect(wrapOutOfCharacter("(a) and (b)")).toBe("((a) and (b))");
  });
});
