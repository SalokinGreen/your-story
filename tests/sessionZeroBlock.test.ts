/**
 * The session-zero block (docs/session-zero-design.md 3.3-3.4, plan slice 3):
 * one live-block section with the checklist, the next step, the rule, the
 * mode, the sheet template, the creation rules and the setup reference.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  SETUP_QUESTION_NUDGE_AT,
  SETUP_REFERENCE_CAP_TOKENS,
  buildGMStagePrompt,
  buildSessionZeroBlock,
  buildSetupReference,
  estimateTokens,
} from "@/app/misc/ai_staged";
import { executeGMTools } from "@/app/misc/gmExecutor";
import {
  SETUP_REFERENCE_MAX_TITLES,
  currentSetupHashes,
  recordSetupReference,
} from "@/app/misc/campaignPlan";
import { BLOOD_AND_BONE } from "@/app/misc/systems/blood-and-bone";
import type { BuiltinNote } from "@/app/misc/systems/types";
import type { ScenePart, SetupState, StoryData, StoryLore } from "@/app/misc/structs";
import { seededText, warmTokenizer } from "./helpers/turnHarness";

beforeAll(async () => {
  await warmTokenizer();
});

function lore(overrides: Partial<StoryLore>): StoryLore {
  return {
    title: "Note",
    content: "text",
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
    type: "lore",
    enabled: true,
    ...overrides,
  } as StoryLore;
}

const SHEET = lore({
  title: "Character: Hero",
  type: "character_sheet",
  content: "Name: Hero. Kind: Human.",
});
const PLAN = lore({
  title: "Campaign Plan",
  type: "gm_plan",
  content: "# Campaign Plan\n## Current beat - Opening Image",
});

function story(
  overrides: Partial<StoryData> = {},
  notes: StoryLore[] = [],
): StoryData {
  return {
    story_name: "New Story",
    player_name: "Hero",
    premise: "",
    sessionZeroActive: true,
    scene: { parts: [] },
    lore: notes,
    memory: [],
    npcs: [],
    ...overrides,
  } as unknown as StoryData;
}

function bnLore(n: BuiltinNote): StoryLore {
  return lore({
    title: n.title,
    content: n.content,
    type: n.type,
    libraryNoteId: n.id,
    ...(n.visibility ? { visibility: n.visibility } : {}),
  });
}

function bnStory(
  overrides: Partial<StoryData> = {},
  extra: StoryLore[] = [],
): StoryData {
  return story(overrides, [
    ...BLOOD_AND_BONE.packs[0].notes.map(bnLore),
    ...extra,
  ]);
}

const approvedSetup = (s: StoryData, extra: Partial<SetupState> = {}): SetupState => ({
  mode: "quick",
  conceptDone: true,
  approval: currentSetupHashes(s),
  ...extra,
});

describe("buildSessionZeroBlock: the checklist and the next step", () => {
  it("starts on the concept, with ask_question and multi_select", () => {
    const block = buildSessionZeroBlock(story({ setup: { mode: "quick" } }));
    expect(block).toContain("→ Concept");
    expect(block).toContain("· Character");
    expect(block).toContain("NEXT: the concept");
    expect(block).toContain("ask_question");
    expect(block).toContain("multi_select");
    expect(block).toContain("2-4");
  });

  it("treats no mode as the quick setup", () => {
    const block = buildSessionZeroBlock(story());
    expect(block).toContain("MODE: quick setup");
    expect(block).not.toContain("MODE: step by step");
  });

  it("moves to the character once a question was answered", () => {
    const block = buildSessionZeroBlock(
      story({ setup: { mode: "quick", conceptDone: true } }),
    );
    expect(block).toContain("✓ Concept");
    expect(block).toContain("→ Character");
    expect(block).toContain("NEXT: the character");
    expect(block).toContain("character_sheet");
    expect(block).toContain('"Character: <name>"');
  });

  it("moves to the campaign once the sheet exists", () => {
    const block = buildSessionZeroBlock(
      story({ setup: { mode: "quick" } }, [SHEET]),
    );
    expect(block).toContain("✓ Concept");
    expect(block).toContain("✓ Character");
    expect(block).toContain("→ Campaign");
    expect(block).toContain("read_notes");
    expect(block).toContain('type: "gm_plan"');
  });

  it("asks for confirm_setup when sheet and plan exist but are not approved", () => {
    const block = buildSessionZeroBlock(
      story({ setup: { mode: "quick", conceptDone: true } }, [SHEET, PLAN]),
    );
    expect(block).toContain("✓ Campaign");
    expect(block).toContain("→ Approval");
    expect(block).toContain("confirm_setup");
    expect(block).toContain("character_summary");
    expect(block).toContain("campaign_hook");
  });

  it("asks for start_game once approved, and names the intro", () => {
    const base = story({}, [SHEET, PLAN]);
    base.setup = approvedSetup(base);
    const block = buildSessionZeroBlock(base);
    expect(block).toContain("✓ Approval");
    expect(block).toContain("→ Start");
    expect(block).toContain("Call `start_game` now");
    expect(block).toContain("briefing");
  });

  it("falls back to the confirm step when an edit cancelled the approval", () => {
    const base = story({}, [SHEET, PLAN]);
    base.setup = approvedSetup(base);
    base.lore = [{ ...SHEET, content: "Name: Hero. Changed." }, PLAN];
    expect(buildSessionZeroBlock(base)).toContain("→ Approval");
  });

  it("names the players still missing a sheet in couch co-op", () => {
    const block = buildSessionZeroBlock(
      story(
        {
          setup: { mode: "quick", conceptDone: true },
          multiplayer: {
            enabled: true,
            couchPlayers: [
              { id: "a", name: "Ann", color: "red" },
              { id: "b", name: "Bo", color: "blue" },
            ],
          },
        } as Partial<StoryData>,
        [lore({ title: "Character: Ann", type: "character_sheet", content: "Ann sheet" })],
      ),
    );
    expect(block).toContain("Still missing a sheet: Bo");
  });
});

describe("buildSessionZeroBlock: the rule and the mode", () => {
  it("forbids narration until start_game in every step", () => {
    for (const s of [
      story(),
      story({}, [SHEET]),
      story({ setup: { mode: "quick" } }, [SHEET, PLAN]),
    ]) {
      const block = buildSessionZeroBlock(s);
      expect(block).toContain("until `start_game` succeeds you never narrate");
      expect(block).toContain("out-of-character");
    }
  });

  it("quick mode: 2-4 questions, then propose", () => {
    const block = buildSessionZeroBlock(story({ setup: { mode: "quick" } }));
    expect(block).toContain("MODE: quick setup");
    expect(block).toContain("PROPOSE");
  });

  it("full mode: one ask_question per creation step", () => {
    const block = buildSessionZeroBlock(story({ setup: { mode: "full" } }));
    expect(block).toContain("MODE: step by step");
    expect(block).toContain("one `ask_question` per creation step");
    expect(block).not.toContain("MODE: quick setup");
    const character = buildSessionZeroBlock(
      story({ setup: { mode: "full", conceptDone: true } }),
    );
    expect(character).toContain("one creation step at a time");
  });

  it("nudges to propose from the sixth setup question", () => {
    const before = buildSessionZeroBlock(
      story({ setup: { mode: "quick", questionsAsked: SETUP_QUESTION_NUDGE_AT - 1 } }),
    );
    const at = buildSessionZeroBlock(
      story({ setup: { mode: "quick", questionsAsked: SETUP_QUESTION_NUDGE_AT } }),
    );
    expect(before).not.toContain("setup questions. Enough");
    expect(at).toContain(`${SETUP_QUESTION_NUDGE_AT} setup questions. Enough`);
  });
});

describe("buildSessionZeroBlock: the sheet template", () => {
  it("uses the system's template for a freeform story that runs a system", () => {
    const block = buildSessionZeroBlock(bnStory());
    expect(block).toContain("CHARACTER SHEET TEMPLATE");
    expect(block).toContain(BLOOD_AND_BONE.sheetTemplate!.slice(0, 40));
  });

  it("lets the story's own template win over the system's", () => {
    const block = buildSessionZeroBlock(
      bnStory({
        characterSheetTemplate: { template: "OWN-TEMPLATE {{Name | x | y}}" },
      } as Partial<StoryData>),
    );
    expect(block).toContain("OWN-TEMPLATE");
    expect(block).not.toContain(BLOOD_AND_BONE.sheetTemplate!.slice(0, 40));
  });

  it("has no template section without a template or a system", () => {
    expect(buildSessionZeroBlock(story())).not.toContain("CHARACTER SHEET TEMPLATE");
  });
});

describe("buildSessionZeroBlock: the creation rules", () => {
  const creation = BLOOD_AND_BONE.packs[0].notes.find(
    (n) => n.id === BLOOD_AND_BONE.creationNoteId,
  )!;

  it("points at a note the system actually has", () => {
    expect(creation).toBeDefined();
    expect(creation.title).toBe("B&B — Character creation");
  });

  it("carries the creation note in full in full mode and in quick mode", () => {
    for (const mode of ["full", "quick"] as const) {
      const block = buildSessionZeroBlock(bnStory({ setup: { mode } }));
      expect(block).toContain("CREATION RULES");
      expect(block).toContain("Step Zero");
      expect(block).toContain(creation.content.slice(-120));
    }
  });

  it("leaves it out when the note is disabled or the story has no system", () => {
    const disabled = bnStory();
    disabled.lore = disabled.lore.map((n) =>
      n.libraryNoteId === BLOOD_AND_BONE.creationNoteId ? { ...n, enabled: false } : n,
    );
    expect(buildSessionZeroBlock(disabled)).not.toContain("CREATION RULES");
    expect(buildSessionZeroBlock(story())).not.toContain("CREATION RULES");
  });
});

describe("buildSetupReference", () => {
  const A = lore({ title: "Alpha", content: "ALPHA-BODY" });
  const B = lore({ title: "Beta", content: "BETA-BODY" });
  const C = lore({ title: "Gamma", content: "GAMMA-BODY" });

  it("lists notes newest first, once per title", () => {
    const ref = buildSetupReference({
      lore: [A, B, C],
      setup: { referenceTitles: ["Gamma", "Alpha", "gamma", "Beta.md", "Alpha"] },
    });
    expect(ref.indexOf("GAMMA-BODY")).toBeLessThan(ref.indexOf("ALPHA-BODY"));
    expect(ref.indexOf("ALPHA-BODY")).toBeLessThan(ref.indexOf("BETA-BODY"));
    expect(ref.match(/GAMMA-BODY/g)).toHaveLength(1);
    expect(ref.match(/ALPHA-BODY/g)).toHaveLength(1);
  });

  it("leaves out disabled, deleted and pinned-type notes", () => {
    const ref = buildSetupReference({
      lore: [
        A,
        { ...B, enabled: false },
        lore({ title: "Sheet", type: "character_sheet", content: "SHEET-BODY" }),
      ],
      setup: { referenceTitles: ["Alpha", "Beta", "Sheet", "Missing"] },
    });
    expect(ref).toContain("ALPHA-BODY");
    expect(ref).not.toContain("BETA-BODY");
    expect(ref).not.toContain("SHEET-BODY");
    expect(ref).not.toContain("Missing");
  });

  it("is empty when nothing was read", () => {
    expect(buildSetupReference({ lore: [A], setup: {} })).toBe("");
    expect(buildSetupReference({ lore: [A] })).toBe("");
  });

  it("never repeats the creation note", () => {
    const s = bnStory({
      setup: { mode: "full", referenceTitles: ["B&B — Character creation"] },
    });
    const ref = buildSetupReference(s, BLOOD_AND_BONE.creationNoteId);
    expect(ref).toBe("");
    const block = buildSessionZeroBlock(s);
    expect(block.match(/# Step Zero/g)).toHaveLength(1);
    expect(block).not.toContain("SETUP REFERENCE");
  });

  it("carries notes in full to the cap, then lists the rest by title", () => {
    const big1 = lore({ title: "Big one", content: seededText(900, 1) });
    const big2 = lore({ title: "Big two", content: seededText(900, 2) });
    const small = lore({ title: "Small", content: "SMALL-BODY" });
    const ref = buildSetupReference(
      {
        lore: [big1, big2, small],
        setup: { referenceTitles: ["Big one", "Big two", "Small"] },
      },
      undefined,
      1200,
    );
    expect(ref).toContain("### Big one");
    expect(ref).not.toContain("### Big two");
    // Once something is over the cap, everything after it is listed by title.
    expect(ref).not.toContain("SMALL-BODY");
    expect(ref).toContain("- Big two: read_notes it again if you need it");
    expect(ref).toContain("- Small: read_notes it again if you need it");
  });

  it("wraps a hidden note in the hidden-lore markers", () => {
    const ref = buildSetupReference({
      lore: [lore({ title: "Secret", content: "SECRET-BODY", visibility: "hidden" })],
      setup: { referenceTitles: ["Secret"] },
    });
    expect(ref).toContain("[[HIDDEN_LORE:Secret]]");
  });

  it("stays under the cap at its default size", () => {
    const notes = [1, 2, 3, 4, 5].map((i) =>
      lore({ title: `N${i}`, content: seededText(2000, i) }),
    );
    const ref = buildSetupReference({
      lore: notes,
      setup: { referenceTitles: notes.map((n) => n.title) },
    });
    // The headings and the list add a little over the cap's own count.
    expect(estimateTokens(ref)).toBeLessThan(SETUP_REFERENCE_CAP_TOKENS + 400);
    expect(ref).toContain("Too long to carry here");
  });
});

describe("recordSetupReference", () => {
  it("moves read titles to the front, deduped and bounded", () => {
    const s = story({ setup: { referenceTitles: ["Old", "Mid"] } });
    recordSetupReference(s, ["Mid", "New", "new"]);
    expect(s.setup?.referenceTitles).toEqual(["Mid", "New", "Old"]);
    const many = Array.from({ length: SETUP_REFERENCE_MAX_TITLES + 5 }, (_, i) => `T${i}`);
    recordSetupReference(s, many);
    expect(s.setup?.referenceTitles).toHaveLength(SETUP_REFERENCE_MAX_TITLES);
    expect(s.setup?.referenceTitles?.[0]).toBe("T0");
  });

  it("keeps the rest of the setup state", () => {
    const s = story({ setup: { mode: "full", questionsAsked: 2 } });
    recordSetupReference(s, ["A"]);
    expect(s.setup).toMatchObject({ mode: "full", questionsAsked: 2, referenceTitles: ["A"] });
  });

  it("does nothing outside session zero", () => {
    const s = story({ sessionZeroActive: false });
    recordSetupReference(s, ["A"]);
    expect(s.setup).toBeUndefined();
  });

  it("is what a read_notes call does to the executor's working copy", async () => {
    const input = story({}, [lore({ title: "Rules", content: "RULES-BODY", type: "mechanics" })]);
    const out = await executeGMTools(
      [
        {
          id: "c1",
          function: { name: "read_notes", arguments: JSON.stringify({ titles: ["Rules", "Nope"] }) },
        },
      ],
      input,
    );
    expect(out.results[0].success).toBe(true);
    expect(out.modifiedStoryData.setup?.referenceTitles).toEqual(["Rules"]);
    // The input is not mutated, as for every other state change.
    expect(input.setup).toBeUndefined();
  });

  it("does not record a failed read, or a read after start_game", async () => {
    const failed = await executeGMTools(
      [{ id: "c1", function: { name: "read_notes", arguments: JSON.stringify({ titles: ["Nope"] }) } }],
      story(),
    );
    expect(failed.modifiedStoryData.setup?.referenceTitles).toBeUndefined();
    const started = await executeGMTools(
      [{ id: "c2", function: { name: "read_notes", arguments: JSON.stringify({ titles: ["Rules"] }) } }],
      story({ sessionZeroActive: false }, [lore({ title: "Rules", type: "mechanics" })]),
    );
    expect(started.modifiedStoryData.setup).toBeUndefined();
  });
});

function history(turns: number): ScenePart[] {
  const parts: ScenePart[] = [];
  for (let i = 0; i < turns; i++) {
    parts.push(
      { content: `> setup ${i}`, imageUrl: "", user: true, role: "user", choices: [] } as unknown as ScenePart,
      {
        content: `Setup reply ${i}: ${seededText(120, i)}`,
        imageUrl: "",
        user: false,
        role: "assistant",
        choices: [],
      } as unknown as ScenePart,
    );
  }
  return parts;
}

describe("placement in the request", () => {
  it("rides in the last user message with the action, never in the system prompt or stable block", () => {
    const { messages } = buildGMStagePrompt({
      storyData: bnStory({ setup: { mode: "quick" } }),
      userChoice: "I want to be a vampire",
    });
    const marker = "SESSION ZERO - SETTING UP THE STORY";
    expect(messages[0].content).not.toContain(marker);
    expect(messages[1].content).not.toContain(marker);
    expect(messages[1].content).not.toContain("CREATION RULES");
    const lastUser = [...messages].reverse().find((m) => m.role === "user")!;
    expect(lastUser.content).toContain(marker);
    expect(lastUser.content).toContain("> I want to be a vampire");
    expect(lastUser.content.indexOf(marker)).toBeLessThan(
      lastUser.content.indexOf("> I want to be a vampire"),
    );
  });

  it("replaces the four older setup blocks while session zero lasts", () => {
    const active = buildGMStagePrompt({ storyData: story(), userChoice: "hi" });
    const live = [...active.messages].reverse().find((m) => m.role === "user")!
      .content as string;
    expect(live).toContain("SESSION ZERO");
    expect(live).not.toContain("FRESH STORY - SETUP NEEDED");
    expect(live).not.toContain("START OF PLAY");
    expect(live).not.toContain("SETUP UNFINISHED");
    expect(live).not.toContain("SETUP OVERDUE");

    const withSheet = buildGMStagePrompt({
      storyData: story({}, [SHEET]),
      userChoice: "hi",
    });
    const liveSheet = [...withSheet.messages].reverse().find((m) => m.role === "user")!
      .content as string;
    expect(liveSheet).not.toContain("START OF PLAY");
  });

  it("leaves the old blocks alone outside session zero", () => {
    const { messages } = buildGMStagePrompt({
      storyData: story({ sessionZeroActive: false }),
      userChoice: "hi",
    });
    const live = [...messages].reverse().find((m) => m.role === "user")!.content as string;
    expect(live).not.toContain("SESSION ZERO");
    expect(live).toContain("FRESH STORY - SETUP NEEDED");
  });

  it("keeps the base messages and history byte-identical across start_game", () => {
    const parts = history(3);
    const before = buildGMStagePrompt({
      storyData: bnStory({ scene: { parts }, setup: { mode: "quick", conceptDone: true } } as Partial<StoryData>, [SHEET, PLAN]),
      userChoice: "go",
    });
    const after = buildGMStagePrompt({
      storyData: bnStory(
        { scene: { parts }, sessionZeroActive: false, setup: { mode: "quick", conceptDone: true } } as Partial<StoryData>,
        [SHEET, PLAN],
      ),
      userChoice: "go",
    });
    const prefixIdx = before.messages.findIndex((m) => m.cacheBreakpoint === "prefix");
    expect(prefixIdx).toBeGreaterThan(2);
    expect(JSON.stringify(after.messages.slice(0, prefixIdx + 1))).toBe(
      JSON.stringify(before.messages.slice(0, prefixIdx + 1)),
    );
    expect(JSON.stringify(after.tools)).toBe(JSON.stringify(before.tools));
  });

  it("keeps the base messages identical across setup turns while only the block changes", () => {
    const parts = history(3);
    const turn1 = buildGMStagePrompt({
      storyData: bnStory({ scene: { parts }, setup: { mode: "quick" } } as Partial<StoryData>),
      userChoice: "a",
    });
    const turn2 = buildGMStagePrompt({
      storyData: bnStory(
        {
          scene: { parts },
          setup: { mode: "quick", conceptDone: true, referenceTitles: ["B&B — Core rules"] },
        } as Partial<StoryData>,
        [SHEET],
      ),
      userChoice: "b",
    });
    const prefixIdx = turn1.messages.findIndex((m) => m.cacheBreakpoint === "prefix");
    expect(JSON.stringify(turn2.messages.slice(0, prefixIdx + 1))).toBe(
      JSON.stringify(turn1.messages.slice(0, prefixIdx + 1)),
    );
  });
});

describe("the whole setup request, against the GM-stage budget", () => {
  it("fits a full Blood & Bone setup (system prompt, tools, 3 setup turns, the block)", () => {
    const notes = BLOOD_AND_BONE.packs[0].notes;
    const read = ["B&B — Character creation", ...notes.slice(0, 6).map((n) => n.title)];
    const s = bnStory(
      {
        scene: { parts: history(3) },
        setup: {
          mode: "full",
          conceptDone: true,
          questionsAsked: 3,
          referenceTitles: read,
        },
      } as Partial<StoryData>,
      [SHEET],
    );
    const { messages, tools } = buildGMStagePrompt({
      storyData: s,
      userChoice: "Next step please",
    });
    const messageTokens = estimateTokens(JSON.stringify(messages));
    const toolTokens = estimateTokens(JSON.stringify(tools));
    const block = estimateTokens(buildSessionZeroBlock(s));
    const total = messageTokens + toolTokens;
    console.log(
      `[sessionZero] setup request: ${total} tokens (messages ${messageTokens}, tools ${toolTokens}, block ${block})`,
    );
    expect(total).toBeLessThan(36_000);
  });
});
