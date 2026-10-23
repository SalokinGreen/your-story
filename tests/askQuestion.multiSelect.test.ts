/**
 * Multi-select questions (decision 146, docs/session-zero-design.md 3.7):
 * the executor's formatting, the party protocol round-trip and the host's
 * cleaning of an answer from a phone.
 */
import { describe, expect, it } from "vitest";
import {
  executeGMTools,
  type AskQuestionAnswer,
  type GMAskQuestionResult,
  type GMInteractionHandlers,
} from "@/app/misc/gmExecutor";
import {
  addRequest,
  buildPlayerView,
  createPartyHost,
  handleConnect,
  handlePhoneMessage,
  type PartyHostState,
} from "@/app/misc/party/partyHost";
import {
  PARTY_SPOTLIGHT_COOLDOWN_MS,
  parsePhoneMessage,
  type PhoneMessage,
} from "@/app/misc/party/protocol";
import type { StoryData } from "@/app/misc/structs";

const STORY = {
  story_name: "S",
  premise: "",
  scene: { parts: [] },
  lore: [],
  memory: [],
  npcs: [],
} as unknown as StoryData;

const OPTIONS = [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }];

async function ask(
  questions: Record<string, unknown>[],
  answer: AskQuestionAnswer | null,
) {
  const h: GMInteractionHandlers = { requestPlayerAnswer: async () => answer };
  const out = await executeGMTools(
    [{ id: "q1", function: { name: "ask_question", arguments: JSON.stringify({ questions }) } }],
    STORY,
    {},
    h,
  );
  const result = out.results[0];
  return { result, answers: (result.result as GMAskQuestionResult).answers };
}

describe("ask_question multi_select: the executor", () => {
  const q = { question: "Which?", options: OPTIONS, multi_select: true };

  it("lists every pick, in option order", async () => {
    const { result, answers } = await ask([q], {
      answers: [{ selectedLabels: ["C", "A"], skipped: false }],
    });
    expect(result.success).toBe(true);
    expect(result.contextForStory).toContain('→ "A", "C"');
    expect(answers[0]).toMatchObject({ answer: "A, C", skipped: false });
  });

  it("drops labels that are not among the options, and repeats", async () => {
    const { result, answers } = await ask([q], {
      answers: [{ selectedLabels: ["B", "Z", "B", "nope"], skipped: false }],
    });
    expect(result.contextForStory).toContain('→ "B"');
    expect(result.contextForStory).not.toContain("Z");
    expect(answers[0].answer).toBe("B");
  });

  it("adds custom text to the picks", async () => {
    const { result } = await ask([q], {
      answers: [{ selectedLabels: ["A"], customText: "and a storm", skipped: false }],
    });
    expect(result.contextForStory).toContain('→ "A", "and a storm"');
  });

  it("keeps custom text alone when nothing valid was ticked", async () => {
    const { answers } = await ask([q], {
      answers: [{ selectedLabels: ["Z"], customText: "something else", skipped: false }],
    });
    expect(answers[0]).toMatchObject({ answer: "something else", skipped: false });
  });

  it("reads a skipped item, and an item with only invalid picks, as skipped", async () => {
    const skipped = await ask([q], { answers: [{ skipped: true }] });
    expect(skipped.result.success).toBe(false);
    expect(skipped.answers[0].skipped).toBe(true);
    const invalid = await ask([q], { answers: [{ selectedLabels: ["Z"], skipped: false }] });
    expect(invalid.answers[0].skipped).toBe(true);
    expect(invalid.result.contextForStory).toContain("Skipped");
  });

  it("skipping the whole batch still comes back as skipped", async () => {
    const { result } = await ask([q], null);
    expect(result.success).toBe(false);
    expect(result.contextForStory).toContain("skipped");
  });

  it("ignores selectedLabels on a single-choice question", async () => {
    const { result } = await ask([{ question: "Which?", options: OPTIONS }], {
      answers: [{ selectedLabels: ["A", "B"], skipped: false }],
    });
    expect(result.success).toBe(false);
  });

  it("formats a single-choice answer as before", async () => {
    const { result } = await ask([{ question: "Which?", options: OPTIONS }], {
      answers: [{ selectedLabel: "B", skipped: false }],
    });
    expect(result.contextForStory).toContain('→ "B"');
  });
});

describe("party protocol: multi-select answers", () => {
  const msg = (answers: unknown): string =>
    JSON.stringify({ type: "answer", requestId: "r1", answers });

  it("round-trips selectedLabels", () => {
    const sent: PhoneMessage = {
      type: "answer",
      requestId: "r1",
      answers: [{ selectedLabels: ["A", "C"], customText: "x", skipped: false }],
    };
    expect(parsePhoneMessage(JSON.stringify(sent))).toMatchObject({
      type: "answer",
      answers: [{ selectedLabels: ["A", "C"], customText: "x", skipped: false }],
    });
  });

  it("leaves selectedLabels off a single-choice answer", () => {
    const parsed = parsePhoneMessage(msg([{ selectedLabel: "A", skipped: false }]));
    expect(parsed).not.toBeNull();
    expect(parsed && "answers" in parsed && parsed.answers[0]).not.toHaveProperty("selectedLabels");
  });

  it("rejects a malformed or oversized selectedLabels", () => {
    expect(parsePhoneMessage(msg([{ selectedLabels: "A", skipped: false }]))).toBeNull();
    expect(parsePhoneMessage(msg([{ selectedLabels: [1], skipped: false }]))).toBeNull();
    expect(
      parsePhoneMessage(msg([{ selectedLabels: ["a", "b", "c", "d", "e"], skipped: false }])),
    ).toBeNull();
  });
});

describe("party host: multi-select questions", () => {
  const TOKEN = "t";
  function seated(): { state: PartyHostState; id: string } {
    let n = 0;
    let st = createPartyHost({
      token: TOKEN,
      cooldownMs: PARTY_SPOTLIGHT_COOLDOWN_MS,
      newId: () => `id${++n}`,
    });
    st = handleConnect(st, "c1").state;
    st = handlePhoneMessage(st, "c1", { type: "hello", token: TOKEN }, 0).state;
    st = handlePhoneMessage(st, "c1", { type: "join", name: "Mara", color: "#22c55e" }, 0).state;
    return { state: st, id: st.clients["c1"].playerId! };
  }

  function offered(allowCustom?: boolean) {
    const { state, id } = seated();
    const withReq = addRequest(state, {
      requestId: "q1",
      playerId: id,
      kind: "question",
      request: {
        questions: [
          {
            question: "Which?",
            options: OPTIONS,
            multi_select: true,
            ...(allowCustom === undefined ? {} : { allow_custom: allowCustom }),
          },
          { question: "One?", options: OPTIONS },
        ],
      },
    }).state;
    return { state: withReq, id };
  }

  it("marks a multi-select question in the phone's view, and only that one", () => {
    const { state, id } = offered();
    const view = buildPlayerView(state, STORY, id, 0);
    const req = view.requests[0];
    expect(req.kind).toBe("question");
    if (req.kind !== "question") return;
    expect(req.questions[0].multiSelect).toBe(true);
    expect(req.questions[1]).not.toHaveProperty("multiSelect");
  });

  it("keeps the offered, ticked labels in option order, once each", () => {
    const { state } = offered();
    const step = handlePhoneMessage(
      state,
      "c1",
      {
        type: "answer",
        requestId: "q1",
        answers: [
          { selectedLabels: ["C", "Z", "A", "C"], customText: " plus\nmore ", skipped: false },
          { selectedLabel: "B", skipped: false },
        ],
      },
      0,
    );
    expect(step.effects[0]).toEqual({
      kind: "resolve_question",
      requestId: "q1",
      answer: {
        answers: [
          { selectedLabels: ["A", "C"], customText: "plus more", skipped: false },
          { selectedLabel: "B", skipped: false },
        ],
      },
    });
  });

  it("drops custom text when the GM disallowed it, and skips an empty answer", () => {
    const { state } = offered(false);
    const step = handlePhoneMessage(
      state,
      "c1",
      {
        type: "answer",
        requestId: "q1",
        answers: [
          { selectedLabels: ["B"], customText: "nope", skipped: false },
          { skipped: true },
        ],
      },
      0,
    );
    expect(step.effects[0]).toMatchObject({
      answer: { answers: [{ selectedLabels: ["B"], skipped: false }, { skipped: true }] },
    });
    const empty = handlePhoneMessage(
      state,
      "c1",
      {
        type: "answer",
        requestId: "q1",
        answers: [{ selectedLabels: ["Z"], skipped: false }, { skipped: true }],
      },
      0,
    );
    expect(empty.effects[0]).toMatchObject({
      answer: { answers: [{ skipped: true }, { skipped: true }] },
    });
  });
});
