/**
 * The session-zero block's step list and rules, and the tool list staying one
 * stable list (docs/session-zero-detail-design.md 3.4). The checklist and the
 * mode lines are in sessionZeroBlock.test.ts.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  SETUP_QUESTION_NUDGE_AT,
  buildGMStagePrompt,
  buildSessionZeroBlock,
} from "@/app/misc/ai_staged";
import { GM_TOOL_MAP } from "@/app/misc/gmTools";
import { BLOOD_AND_BONE } from "@/app/misc/systems/blood-and-bone";
import type { SetupState, StoryData, StoryLore } from "@/app/misc/structs";
import { warmTokenizer } from "./helpers/turnHarness";

vi.setConfig({ testTimeout: 120_000 });

beforeAll(async () => {
  await warmTokenizer();
});

const BB_NOTE = BLOOD_AND_BONE.packs[0].notes[0];
const BB = {
  title: BB_NOTE.title,
  type: BB_NOTE.type,
  content: BB_NOTE.content,
  libraryNoteId: BB_NOTE.id,
  enabled: true,
  relatedCharacters: [],
  relatedLocations: [],
  secrtet: false,
  keys: [],
} as unknown as StoryLore;

function story(setup: SetupState | undefined, lore: StoryLore[] = [], extra: Partial<StoryData> = {}): StoryData {
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

describe("the tagging rule and the step list", () => {
  it("both modes carry the tagging rule; quick names setting and tone", () => {
    const quick = buildSessionZeroBlock(story({ mode: "quick" }));
    expect(quick).toContain("TAGGING");
    expect(quick).toContain("`setup_step`");
    expect(quick).toContain("setting and tone");
    expect(quick).toContain("- setting: →");
    expect(quick).toContain("- tone: ·");
    expect(quick).toContain("NEXT STEP TO ASK: setting");
    // Quick setup is not walked step by step.
    expect(quick).not.toContain("asked one at a time");
    expect(quick).toContain("MODE: quick setup");

    const full = buildSessionZeroBlock(story({ mode: "full" }));
    expect(full).toContain("TAGGING");
    expect(full).toContain("asked one at a time");
  });

  it("full mode lists every step with ✓, → and · and the next step's hint", () => {
    const s = story(
      { mode: "full", covered: { table: ["setting", "tone", "campaign"], players: { solo: ["kind"] } } },
      [BB],
    );
    const block = buildSessionZeroBlock(s);
    expect(block).toContain("- setting: ✓");
    expect(block).toContain("- kind: Nik ✓");
    expect(block).toContain("- archetype: Nik →");
    expect(block).toContain("- stats: Nik ·");
    expect(block).toContain("- drives: Nik ·");
    expect(block).toContain("NEXT STEP TO ASK: archetype (Nik).");
    expect(block).toContain("Setup steps (4/15 asked and answered)");
    // The rules for asking.
    expect(block).toContain("Always give `intro`");
    expect(block).toContain("2-4 options whose descriptions say what each does in play");
    expect(block).toContain("2-4 suggestions and set allow_custom true");
    expect(block).toContain("Do not write the sheet or the plan");
  });

  it("marks each player separately and tells the GM to target them", () => {
    const s = story(
      { mode: "full", covered: { table: ["cohort"], players: { a: ["name_look"] } } },
      [],
      {
        multiplayer: {
          enabled: true,
          couchPlayers: [
            { id: "a", name: "Ann", color: "red" },
            { id: "b", name: "Bo", color: "blue" },
          ],
        },
      } as Partial<StoryData>,
    );
    const block = buildSessionZeroBlock(s);
    expect(block).toContain("- cohort: ✓");
    expect(block).toContain("Ann ✓, Bo ·");
    expect(block).toContain("target_player_name");
  });

  it("full mode ends the interview with 'write the sheet and the plan', not the nudge", () => {
    const s = story({
      mode: "full",
      questionsAsked: SETUP_QUESTION_NUDGE_AT + 4,
      covered: {
        table: ["setting", "tone", "campaign"],
        players: { solo: ["name_look", "history", "drives"] },
      },
    });
    const block = buildSessionZeroBlock(s);
    expect(block).toContain("Every step is covered: write the sheet and the plan");
    expect(block).not.toContain("setup questions. Enough");
    // Mid-interview, even many questions in, full mode does not nudge.
    const mid = buildSessionZeroBlock(story({ mode: "full", questionsAsked: SETUP_QUESTION_NUDGE_AT + 4 }));
    expect(mid).not.toContain("setup questions. Enough");
    // Quick mode keeps its nudge.
    const quick = buildSessionZeroBlock(story({ mode: "quick", questionsAsked: SETUP_QUESTION_NUDGE_AT }));
    expect(quick).toContain(`${SETUP_QUESTION_NUDGE_AT} setup questions. Enough`);
  });

  it("tells the GM that confirm_setup starts the game when Start is pressed", () => {
    const sheet = { title: "Character: Nik", type: "character_sheet", content: "Nik.", enabled: true } as StoryLore;
    const plan = { title: "Campaign Plan", type: "gm_plan", content: "# P", enabled: true } as StoryLore;
    const block = buildSessionZeroBlock(
      story({ mode: "quick", conceptDone: true, covered: { table: ["setting", "tone"], players: {} } }, [sheet, plan]),
    );
    expect(block).toContain("confirm_setup({ character_summary, campaign_hook, story_name, premise })");
    expect(block).toContain("the game starts by itself");
  });
});

describe("the tool list stays one stable list", () => {
  const toolsJson = (s: StoryData) => JSON.stringify(buildGMStagePrompt({ storyData: s, userChoice: "go" }).tools);

  it("is byte-identical in quick mode, full mode and after the game starts", () => {
    const quick = toolsJson(story({ mode: "quick" }));
    const full = toolsJson(story({ mode: "full" }));
    const none = toolsJson(story(undefined));
    const started = toolsJson(story({ mode: "full" }, [], { sessionZeroActive: false }));
    const withSystem = toolsJson(story({ mode: "full" }, [BB], { sessionZeroActive: false }));
    expect(full).toBe(quick);
    expect(none).toBe(quick);
    expect(started).toBe(quick);
    // A system adds only its own (gated) system tools, not step-dependent ones.
    expect(withSystem.length).toBeGreaterThan(quick.length);
  });

  it("carries the new fields in the schemas", () => {
    const ask = JSON.stringify(GM_TOOL_MAP.get("ask_question"));
    expect(ask).toContain('"setup_step"');
    expect(ask).toContain('"intro"');
    const confirm = GM_TOOL_MAP.get("confirm_setup") as unknown as {
      function: { parameters: { properties: Record<string, unknown>; required: string[] } };
    };
    expect(Object.keys(confirm.function.parameters.properties)).toEqual(
      expect.arrayContaining(["story_name", "premise"]),
    );
    // Optional: the call that worked before still validates.
    expect(confirm.function.parameters.required).toEqual(["character_summary", "campaign_hook"]);
  });
});
