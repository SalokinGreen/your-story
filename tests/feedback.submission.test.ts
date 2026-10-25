// What a feedback submission is allowed to hold (docs/feedback-design.md §2):
// the allowlist, the caps, `||hidden||` removed before cutting, the 16 KB body,
// omitted optionals, and the validator that mirrors the Worker.
import { describe, expect, it } from "vitest";
import {
  FEEDBACK_LIMITS,
  appPlatform,
  appVersion,
  bodyBytes,
  buildSubmission,
  newFeedbackId,
  starterIdFor,
  stripHiddenSpans,
  turnAttachmentFrom,
  validateSubmission,
  type FeedbackInput,
} from "@/app/misc/feedback";
import { BUILTIN_SYSTEMS } from "@/app/misc/systems";
import type { ScenePart } from "@/app/misc/structs";

const ID = "abcdef0123456789";

function input(over: Partial<FeedbackInput> = {}): FeedbackInput {
  return {
    id: ID,
    kind: "app",
    text: "Great",
    app: { version: "0.1.0", platform: "desktop" },
    ...over,
  };
}

const ACTION_ROLL = `[Action roll - Ana: Face Danger +Iron: d6 4 + Iron 2 = 6 vs 3 and 8 → WEAK HIT]\n[Reason: leaping the gap]`;

function gmPart(over: Partial<ScenePart> = {}): ScenePart {
  return {
    content: "The gap yawns. You land hard on the far side.",
    imageUrl: "",
    user: false,
    role: "assistant",
    ...over,
  } as ScenePart;
}

function userPart(content: string): ScenePart {
  return { content, imageUrl: "", user: true, role: "user" } as ScenePart;
}

describe("turnAttachmentFrom: an allowlist", () => {
  const SECRET_NOTE = "THE DUKE POISONED THE WELL";
  const REASONING = "I think the player will fall";
  const MEMORY = "Remember: Ana fears heights";
  const TOOL_ARGS = '{"title":"Duke secret","content":"hunter2"}';
  const part = gmPart({
    content: `<thinking>${REASONING}</thinking>The gap yawns. ||the duke watches from the tower|| You land hard.`,
    reasoning: REASONING,
    reasoningTierModelKey: "glm-5.3",
    gmThinking: [REASONING],
    memoryEntries: [MEMORY],
    stateChanges: [MEMORY],
    gmStoryContext: SECRET_NOTE,
    gmConversation: [
      {
        role: "assistant",
        content: REASONING,
        reasoning: REASONING,
        tool_calls: [
          { id: "t1", type: "function", function: { name: "read_notes", arguments: TOOL_ARGS } },
        ],
      },
      { role: "tool", content: `[[HIDDEN_LORE:Duke]]${SECRET_NOTE}[[/HIDDEN_LORE]]`, tool_call_id: "t1" },
    ] as unknown as ScenePart["gmConversation"],
    gmToolCalls: [
      { toolCallId: "t1", toolName: "read_notes", success: true, contextForStory: `[[HIDDEN_LORE:Duke]]${SECRET_NOTE}[[/HIDDEN_LORE]]` },
      { toolCallId: "t2", toolName: "action_roll", success: true, contextForStory: ACTION_ROLL },
      { toolCallId: "t3", toolName: "gm_roll", success: true, hiddenFromPlayer: true, contextForStory: "[GM roll: the ambush is real = 19]" },
      { toolCallId: "t4", toolName: "action_roll", success: false, contextForStory: "[ERROR: bad stat]" },
      { toolCallId: "t5", toolName: "formula_roll", success: true, hiddenFromPlayer: true, contextForStory: "[Roll: 1d20: [19] = **19**]" },
    ],
  });
  const parts = [userPart("> I leap the gap"), part];

  it("holds the player's line, the visible prose, the roll headlines and the model, and nothing else", () => {
    const a = turnAttachmentFrom(parts, 1);
    expect(a).not.toBeNull();
    expect(a!.playerLine).toBe("I leap the gap");
    expect(a!.prose).toBe("The gap yawns.  You land hard.");
    expect(a!.rolls).toEqual(["Face Danger +Iron 6 vs 3, 8 — weak hit"]);
    expect(a!.models).toHaveLength(1);
    expect(Object.keys(a!).sort()).toEqual(["models", "playerLine", "prose", "rolls"]);
  });

  it("carries no reasoning, tool result, tool argument, hidden note, memory or hidden roll", () => {
    const sub = buildSubmission(input({ kind: "turn", turn: turnAttachmentFrom(parts, 1) }));
    const json = JSON.stringify(sub);
    for (const leak of [
      SECRET_NOTE,
      REASONING,
      MEMORY,
      "hunter2",
      "Duke secret",
      "HIDDEN_LORE",
      "the duke watches",
      "the ambush is real",
      "[GM roll",
      "read_notes",
      "ERROR",
      "<thinking>",
    ]) {
      expect(json, leak).not.toContain(leak);
    }
  });

  it("returns null for a player part and for a part that is not there", () => {
    expect(turnAttachmentFrom(parts, 0)).toBeNull();
    expect(turnAttachmentFrom(parts, 9)).toBeNull();
  });

  it("buildSubmission copies only the named fields of its input", () => {
    const dirty = {
      ...input({ kind: "turn" }),
      apiKey: "sk-secret",
      gmConversation: ["secret"],
      turn: {
        playerLine: "hi",
        prose: "p",
        rolls: [],
        models: [],
        reasoning: "secret thoughts",
        toolResults: ["secret"],
      },
    } as unknown as FeedbackInput;
    const json = JSON.stringify(buildSubmission(dirty));
    expect(json).not.toContain("secret");
    expect(json).not.toContain("sk-");
  });
});

describe("buildSubmission: caps", () => {
  it("cuts every field to its limit", () => {
    const sub = buildSubmission(
      input({
        kind: "turn",
        text: "x".repeat(5000),
        systemId: "s".repeat(200),
        starterId: "t".repeat(500),
        turn: {
          playerLine: "p".repeat(3000),
          prose: "q".repeat(9000),
          rolls: Array.from({ length: 20 }, () => "r".repeat(500)),
          models: Array.from({ length: 9 }, () => "m".repeat(300)),
        },
      }),
    );
    expect(sub.text).toHaveLength(FEEDBACK_LIMITS.text);
    expect(sub.systemId).toHaveLength(FEEDBACK_LIMITS.systemId);
    expect(sub.starterId).toHaveLength(FEEDBACK_LIMITS.starterId);
    expect(sub.turn!.playerLine).toHaveLength(FEEDBACK_LIMITS.playerLine);
    expect(sub.turn!.prose).toHaveLength(FEEDBACK_LIMITS.prose);
    expect(sub.turn!.rolls).toHaveLength(FEEDBACK_LIMITS.rolls);
    expect(sub.turn!.rolls.every((r) => r.length === FEEDBACK_LIMITS.roll)).toBe(true);
    expect(sub.turn!.models).toHaveLength(FEEDBACK_LIMITS.models);
    expect(sub.turn!.models.every((m) => m.length === FEEDBACK_LIMITS.model)).toBe(true);
    expect(validateSubmission(sub)).toEqual({ ok: true });
  });

  it("removes ||hidden|| spans before cutting, so one straddling the cut point is gone, not half shown", () => {
    const prose = "a".repeat(3995) + "||top secret words||" + "b".repeat(50);
    const sub = buildSubmission(input({ kind: "turn", turn: { playerLine: "", prose, rolls: [], models: [] } }));
    expect(sub.turn!.prose).toBe("a".repeat(3995) + "b".repeat(5));
    expect(sub.turn!.prose).not.toContain("secret");
    expect(sub.turn!.prose).not.toContain("|");
  });

  it("treats an unclosed || as hiding everything after it", () => {
    expect(stripHiddenSpans("open ||never closed and long")).toBe("open ");
    expect(stripHiddenSpans("a ||b|| c ||d|| e")).toBe("a  c  e");
    const sub = buildSubmission(
      input({ kind: "turn", turn: { playerLine: "see ||secret||", prose: "x ||y", rolls: [], models: [] } }),
    );
    expect(sub.turn!.playerLine).toBe("see ");
    expect(sub.turn!.prose).toBe("x ");
  });
});

describe("buildSubmission: the 16 KB body", () => {
  it("keeps multibyte text under the cap by trimming the prose first", () => {
    const sub = buildSubmission(
      input({
        kind: "turn",
        text: "世".repeat(2000),
        turn: {
          playerLine: "世".repeat(1000),
          prose: "世".repeat(4000),
          rolls: ["世".repeat(200)],
          models: ["m"],
        },
      }),
    );
    expect(bodyBytes(sub)).toBeLessThanOrEqual(FEEDBACK_LIMITS.bodyBytes);
    // The player's words stay whole; the attached prose pays.
    expect(sub.text).toHaveLength(2000);
    expect(sub.turn!.playerLine).toHaveLength(1000);
    expect(sub.turn!.prose.length).toBeGreaterThan(0);
    expect(sub.turn!.prose.length).toBeLessThan(4000);
    expect(validateSubmission(sub)).toEqual({ ok: true });
  });

  it("copes with JSON escapes, which cost up to six bytes a character", () => {
    const sub = buildSubmission(
      input({
        kind: "turn",
        text: "\u0001".repeat(2000),
        turn: { playerLine: "\u0001".repeat(1000), prose: "\u0001".repeat(4000), rolls: [], models: [] },
      }),
    );
    expect(bodyBytes(sub)).toBeLessThanOrEqual(FEEDBACK_LIMITS.bodyBytes);
  });

  it("never cuts a surrogate pair in half", () => {
    const sub = buildSubmission(
      input({ kind: "turn", turn: { playerLine: "", prose: "a" + "😀".repeat(3000), rolls: [], models: [] } }),
    );
    expect(sub.turn!.prose).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
    expect(sub.turn!.prose.length).toBeLessThanOrEqual(4000);
    expect(bodyBytes(sub)).toBeLessThanOrEqual(FEEDBACK_LIMITS.bodyBytes);
  });
});

describe("buildSubmission: optionals", () => {
  it("leaves unset optionals out entirely", () => {
    const sub = buildSubmission(
      input({ rating: null, systemId: "", starterId: null, session: null, turn: null }),
    );
    expect(Object.keys(sub).sort()).toEqual(["app", "id", "kind", "text", "v"]);
    expect(JSON.stringify(sub)).not.toContain("null");
    expect(JSON.stringify(sub)).not.toContain("undefined");
  });

  it("drops a session number on any other kind, and a turn on a kind that has none", () => {
    const turn = { playerLine: "hi", prose: "p", rolls: [], models: [] };
    const sub = buildSubmission(input({ kind: "system", session: 3, turn }));
    expect(sub.session).toBeUndefined();
    expect(sub.turn).toBeUndefined();
    const night = buildSubmission(input({ kind: "session", session: 3, turn }));
    expect(night.session).toBe(3);
    expect(night.turn).toBeDefined();
  });

  it("omits an attachment with nothing in it, and a rating that is not 1-5", () => {
    const empty = buildSubmission(
      input({ kind: "turn", rating: 6, turn: { playerLine: " ", prose: "", rolls: [""], models: [] } }),
    );
    expect(empty.turn).toBeUndefined();
    expect(empty.rating).toBeUndefined();
    expect(buildSubmission(input({ rating: 4 })).rating).toBe(4);
  });
});

describe("validateSubmission mirrors the Worker's rules", () => {
  const good = () => buildSubmission(input({ rating: 3 }));
  const bad = (x: unknown) => validateSubmission(x);

  it("accepts a built submission, rating only, text only and a session night", () => {
    expect(bad(good())).toEqual({ ok: true });
    expect(bad(buildSubmission(input({ text: "" , rating: 5 })))).toEqual({ ok: true });
    expect(bad(buildSubmission(input({ kind: "session", session: 12 })))).toEqual({ ok: true });
  });

  it.each([
    ["an unknown top-level key", { ...good(), extra: 1 }, "extra"],
    ["a wrong version", { ...good(), v: 2 }, "v"],
    ["a short id", { ...good(), id: "abc" }, "id"],
    ["an id with a bad character", { ...good(), id: "abcdefgh!" }, "id"],
    ["an id that is too long", { ...good(), id: "a".repeat(65) }, "id"],
    ["an unknown kind", { ...good(), kind: "bug" }, "kind"],
    ["a fractional rating", { ...good(), rating: 2.5 }, "rating"],
    ["a rating of 6", { ...good(), rating: 6 }, "rating"],
    ["a string rating", { ...good(), rating: "3" }, "rating"],
    ["neither rating nor text", { ...good(), rating: undefined, text: "  " }, "text"],
    ["text over 2000", { ...good(), text: "x".repeat(2001) }, "text"],
    ["a numeric text", { ...good(), text: 5 }, "text"],
    ["a systemId over 64", { ...good(), systemId: "s".repeat(65) }, "systemId"],
    ["a starterId over 128", { ...good(), starterId: "s".repeat(129) }, "starterId"],
    ["no app", { ...good(), app: undefined }, "app"],
    ["an unknown app key", { ...good(), app: { version: "1", platform: "web", os: "x" } }, "app.os"],
    ["an unknown platform", { ...good(), app: { version: "1", platform: "tv" } }, "app.platform"],
    ["a version over 32", { ...good(), app: { version: "v".repeat(33), platform: "web" } }, "app.version"],
    ["session 0", { ...good(), kind: "session", session: 0 }, "session"],
    ["a fractional session", { ...good(), kind: "session", session: 1.5 }, "session"],
    ["session 10001", { ...good(), kind: "session", session: 10001 }, "session"],
    ["an unknown turn key", { ...good(), turn: { playerLine: "", prose: "", rolls: [], models: [], reasoning: "x" } }, "turn.reasoning"],
    ["a playerLine over 1000", { ...good(), turn: { playerLine: "x".repeat(1001), prose: "", rolls: [], models: [] } }, "turn.playerLine"],
    ["a prose over 4000", { ...good(), turn: { playerLine: "", prose: "x".repeat(4001), rolls: [], models: [] } }, "turn.prose"],
    ["13 rolls", { ...good(), turn: { playerLine: "", prose: "", rolls: Array(13).fill("r"), models: [] } }, "turn.rolls"],
    ["a roll over 200", { ...good(), turn: { playerLine: "", prose: "", rolls: ["r".repeat(201)], models: [] } }, "turn.rolls"],
    ["5 models", { ...good(), turn: { playerLine: "", prose: "", rolls: [], models: Array(5).fill("m") } }, "turn.models"],
    ["a model over 80", { ...good(), turn: { playerLine: "", prose: "", rolls: [], models: ["m".repeat(81)] } }, "turn.models"],
    ["a non-string roll", { ...good(), turn: { playerLine: "", prose: "", rolls: [4], models: [] } }, "turn.rolls"],
    ["an array", [], "body"],
    ["null", null, "body"],
  ])("refuses %s", (_name, body, field) => {
    expect(bad(body)).toEqual({ ok: false, field });
  });
});

describe("ids and the platform", () => {
  it("newFeedbackId is random, 32 characters of the allowed alphabet", () => {
    const a = newFeedbackId();
    const b = newFeedbackId();
    expect(a).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(a).toHaveLength(32);
    expect(a).not.toBe(b);
  });

  it("reports package.json's version when the build baked it in, and web outside the native apps", () => {
    expect(appVersion().length).toBeGreaterThan(0);
    expect(appVersion().length).toBeLessThanOrEqual(32);
    expect(appPlatform()).toBe("web");
  });
});

describe("starterIdFor", () => {
  const system = BUILTIN_SYSTEMS[0];
  const graveWatcher = system.starters.find((s) => s.id.endsWith("grave-watcher"))!;

  it("finds the starter a story was begun from by its setting and its notes", () => {
    const template = graveWatcher.adventure.storyTemplate!;
    expect(
      starterIdFor({ lore: template.lore, systemState: template.systemState }, system),
    ).toBe(graveWatcher.id);
  });

  it("is null for a story of the player's own making, or with no system", () => {
    expect(starterIdFor({ lore: [{ title: "My notes" }] }, system)).toBeNull();
    expect(starterIdFor({ lore: graveWatcher.adventure.storyTemplate!.lore }, undefined)).toBeNull();
  });
});
