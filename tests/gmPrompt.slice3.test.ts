/**
 * GM prompt plan, slice 3: session zero's block order, the batching chain,
 * `CreationStep.kind` and the fields code sets on a setup question.
 */
import { describe, expect, it } from "vitest";
import { buildSessionZeroBlock } from "@/app/misc/ai_staged";
import { prepareSetupQuestions, executeGMTools } from "@/app/misc/gmExecutor";
import type { AskQuestionItem } from "@/app/misc/gmTools";
import { getCreationSteps, stepKind } from "@/app/misc/setupSteps";
import { BLOOD_AND_BONE } from "@/app/misc/systems/blood-and-bone";
import { BLOOD_AND_BONE_CREATION_STEPS } from "@/app/misc/systems/blood-and-bone/creationSteps";
import { FANTASTIC_REALMS_CREATION_STEPS } from "@/app/misc/systems/fantastic-realms/sheet";
import type { SetupState, StoryData, StoryLore } from "@/app/misc/structs";
import { readFileSync } from "node:fs";
import { parseFixtureText } from "@/app/misc/judges/evalFormat";

const BB_CREATION = BLOOD_AND_BONE.packs[0].notes.find((n) =>
  n.id.endsWith("character-creation"),
)!;
const BB_CORE = BLOOD_AND_BONE.packs[0].notes[0];
const note = (n: { title: string; type: string; content: string; id: string }) =>
  ({
    title: n.title,
    type: n.type,
    content: n.content,
    libraryNoteId: n.id,
    enabled: true,
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
  }) as unknown as StoryLore;

function story(setup: SetupState, lore: StoryLore[] = [], extra: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "T",
    player_name: "Nik",
    sessionZeroActive: true,
    scene: { parts: [] },
    lore,
    memory: [],
    npcs: [],
    setup,
    ...extra,
  } as unknown as StoryData;
}

const OPTS = [{ label: "A" }, { label: "B" }];

describe("the block's order", () => {
  const s = story(
    {
      mode: "full",
      referenceTitles: ["Reference Note"],
      covered: { table: ["setting", "tone", "style", "tone_safety", "campaign"], players: {} },
    },
    [
      note(BB_CORE),
      note(BB_CREATION),
      {
        ...note({ title: "Reference Note", type: "lore", content: "A read note.", id: "x" }),
        libraryNoteId: undefined,
      } as StoryLore,
    ],
  );
  const block = buildSessionZeroBlock(s);
  const at = (needle: string) => {
    const i = block.indexOf(needle);
    expect(i, needle).toBeGreaterThanOrEqual(0);
    return i;
  };

  it("puts the reference first, then the mode lines, and the next step last", () => {
    const creation = at("## CREATION RULES");
    const reference = at("## SETUP REFERENCE");
    const sheet = at("## CHARACTER SHEET TEMPLATE");
    const campaign = at("## CAMPAIGN");
    const rule = at("RULE: until");
    const mode = at("MODE: step by step");
    const asking = at("TAGGING");
    const next = at("NEXT: the setup steps");
    const stepToAsk = at("NEXT STEP TO ASK");
    expect(creation).toBeLessThan(reference);
    expect(reference).toBeLessThan(sheet);
    expect(sheet).toBeLessThan(campaign);
    expect(campaign).toBeLessThan(rule);
    expect(rule).toBeLessThan(mode);
    expect(mode).toBeLessThan(asking);
    expect(asking).toBeLessThan(next);
    expect(next).toBeLessThan(stepToAsk);
  });

  it("the next-step lines are the block's last, and there is one NEXT line", () => {
    const tail = block.slice(block.indexOf("NEXT: the setup steps"));
    expect(tail.trim().split("\n")).toHaveLength(2);
    expect(tail).toContain("NEXT STEP TO ASK: kind (Nik).");
    expect(block.match(/\nNEXT: /g)).toHaveLength(1);
    expect(block).toContain("(What to do next is the last line of this block.)");
  });

  it("states the batching rule once, as a chain by scope", () => {
    expect(block.match(/Batching, by scope/g)).toHaveLength(1);
    expect(block).toContain("a table step may share one `ask_question` with other table steps");
    expect(block).toContain("a player step is asked alone");
    expect(block).not.toContain("asked one at a time");
    expect(block).not.toContain("set allow_custom true");
  });

  it("keeps the starter's review wording", () => {
    const starter = story(
      { mode: "full", covered: { table: ["setting"], players: {} } },
      [],
      { campaign: { origin: "starter", style: "mystery", pitch: { tone: ["dark"] }, factions: [], fronts: [], clocks: [], people: [], secrets: [], locations: [], endStates: [] } } as unknown as Partial<StoryData>,
    );
    const b = buildSessionZeroBlock(starter);
    expect(b).toContain("## CAMPAIGN (shipped built");
    expect(b).toContain("review the shipped campaign");
    expect(b.indexOf("## CAMPAIGN")).toBeLessThan(b.indexOf("MODE: step by step"));
  });
});

describe("CreationStep.kind", () => {
  it("is set on every step of the shared lists, Blood & Bone and Fantastic Realms", () => {
    const bare = story({ mode: "full" }, [{ type: "mechanics", enabled: true, title: "M", content: "x" } as StoryLore], {
      multiplayer: {
        enabled: true,
        couchPlayers: [
          { id: "a", name: "Ann" },
          { id: "b", name: "Bo" },
        ],
      },
    } as unknown as Partial<StoryData>);
    const starter = story({ mode: "full" }, [], {
      campaign: { origin: "starter", style: "mystery", pitch: { tone: ["x"] } },
    } as unknown as Partial<StoryData>);
    const all = [
      ...getCreationSteps(bare),
      ...getCreationSteps(starter),
      ...BLOOD_AND_BONE_CREATION_STEPS,
      ...FANTASTIC_REALMS_CREATION_STEPS,
    ];
    expect(all.length).toBeGreaterThan(20);
    for (const st of all) {
      expect(["choice", "creative"], st.id).toContain(st.kind);
    }
    expect(all.find((x) => x.id === "campaign_review")?.kind).toBe("creative");
    expect(all.find((x) => x.id === "abilities")?.kind).toBe("choice");
  });

  it("a step without a kind reads as a choice", () => {
    expect(stepKind({})).toBe("choice");
  });

  it("Blood & Bone picks from lists as choices, the player's own words as creative", () => {
    const kinds = Object.fromEntries(BLOOD_AND_BONE_CREATION_STEPS.map((x) => [x.id, x.kind]));
    expect(kinds).toMatchObject({ kind: "choice", archetype: "choice", stats: "choice", vow: "creative", connections: "creative", gear: "creative" });
  });
});

describe("prepareSetupQuestions", () => {
  const full = story({ mode: "full" });
  const q = (extra: Partial<AskQuestionItem> = {}): AskQuestionItem => ({
    question: "Which?",
    options: OPTS,
    ...extra,
  });

  it("sets allow_custom true on a creative step, whatever the model sent", () => {
    const input = [q({ setup_step: "setting", intro: "Where.", allow_custom: false })];
    const out = prepareSetupQuestions(full, input);
    expect(out.error).toBeUndefined();
    expect(out.questions[0].allow_custom).toBe(true);
    expect(input[0].allow_custom).toBe(false); // input untouched
  });

  it("leaves a choice step, an untagged question and an unknown tag alone", () => {
    const withBB = story({ mode: "full" }, [note(BB_CORE)]);
    const out = prepareSetupQuestions(withBB, [
      q({ setup_step: "kind", intro: "Which Kind." }),
      q(),
      q({ setup_step: "not-a-step" }),
    ]);
    expect(out.error).toBeUndefined();
    expect(out.questions[0].allow_custom).toBeUndefined();
    expect(out.questions[1]).toEqual(q());
    expect(out.questions[2]).toEqual(q({ setup_step: "not-a-step" }));
  });

  it("refuses a tagged item without an intro in full mode, naming the step", () => {
    const out = prepareSetupQuestions(full, [
      q({ setup_step: "setting", intro: "Where." }),
      q({ setup_step: "tone" }),
      q({ setup_step: "tone", intro: "  " }),
    ]);
    expect(out.error).toContain("Missing for: tone");
    expect(out.error).not.toContain("setting,");
  });

  it("asks for an intro on the first item under a tag only", () => {
    const out = prepareSetupQuestions(full, [
      q({ setup_step: "history", intro: "Their past." }),
      q({ setup_step: "history" }),
      q({ setup_step: "history" }),
    ]);
    expect(out.error).toBeUndefined();
    expect(out.questions.every((x) => x.allow_custom === true)).toBe(true);
  });

  it("does not require an intro in quick mode, but still sets allow_custom", () => {
    const quick = story({ mode: "quick" });
    const out = prepareSetupQuestions(quick, [q({ setup_step: "tone" })]);
    expect(out.error).toBeUndefined();
    expect(out.questions[0].allow_custom).toBe(true);
  });
});

describe("executeAskQuestion in session zero", () => {
  const call = (questions: AskQuestionItem[]) => ({
    id: "c1",
    function: { name: "ask_question", arguments: JSON.stringify({ questions }) },
  });

  it("hands the player the filled-in question and refuses a missing intro before asking", async () => {
    let seenAllow: boolean | undefined;
    let asked = 0;
    const handlers = {
      requestPlayerAnswer: async (r: { questions: AskQuestionItem[] }) => {
        asked++;
        seenAllow = r.questions[0].allow_custom;
        return { answers: [{ selectedLabel: "A", skipped: false }] };
      },
    };
    const s = story({ mode: "full" });
    const noIntro = await executeGMTools(
      [call([{ question: "Where?", options: OPTS, setup_step: "setting" }])],
      s,
      {},
      handlers,
      {},
    );
    expect(asked).toBe(0);
    expect(noIntro.results[0].success).toBe(false);
    expect(noIntro.results[0].contextForStory).toContain("needs an `intro`");

    const ok = await executeGMTools(
      [call([{ question: "Where?", options: OPTS, setup_step: "setting", intro: "Where it is set." }])],
      s,
      {},
      handlers,
      {},
    );
    expect(asked).toBe(1);
    expect(seenAllow).toBe(true);
    expect(ok.results[0].success).toBe(true);
  });
});

describe("the behavioural case", () => {
  it("full-mode setup asks one player step per call: the fixture parses", () => {
    const text = readFileSync("evals/generation/setup-full-one-player-step-per-call.json", "utf8");
    const parsed = parseFixtureText(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.fixture.kind).toBe("generation");
  });
});
