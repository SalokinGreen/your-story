/**
 * GM prompts, slice 1 (docs/gm-prompt-plan.md): the note-type table says what
 * the code pins, the gates' messages name the right tools and give the GM a
 * way to decline, the setup gate says why it rejected a round, and thread
 * descriptions reach the GM whole. All deterministic: no model.
 */
import { describe, it, expect } from "vitest";
import { buildGMStagePrompt, PINNED_NOTE_TYPES, PINNED_TYPES_LINE } from "@/app/misc/ai_staged";
import { rollGateMessage } from "@/app/misc/gateMessages";
import { ROLL_OR_ORACLE_TOOL_NAMES } from "@/app/misc/reasoningTiers";
import { GOOGLE_ESSENTIAL_TOOLS } from "@/app/misc/providerCall";
import {
  classifySetupRejection,
  quoteWholeSentences,
  setupGateMessage,
} from "@/app/misc/campaignPlan";
import type { CreationProgress } from "@/app/misc/setupSteps";
import type { StoryData, StoryLore } from "@/app/misc/structs";

function story(overrides: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "Test",
    scene: { parts: [] },
    lore: [],
    memory: [],
    npcs: [],
    ...overrides,
  } as unknown as StoryData;
}

function build(s: StoryData, userChoice = "I go") {
  return buildGMStagePrompt({ storyData: s, userChoice });
}

function allText(s: StoryData): string {
  return build(s)
    .messages.map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
    .join("\n");
}

function toolNames(s: StoryData): string[] {
  return (build(s).tools as { function: { name: string } }[]).map((t) => t.function.name);
}

const sentenceBreaks = (text: string) => /[a-z,]\n[a-z]/.test(text);

describe("the note-type table", () => {
  const system = () => build(story()).messages[0].content as string;

  it("names the pinned types from PINNED_NOTE_TYPES, and the prompt carries that line", () => {
    expect(PINNED_NOTE_TYPES).toEqual(["dm_instructions", "character_sheet", "gm_plan"]);
    for (const t of PINNED_NOTE_TYPES) expect(PINNED_TYPES_LINE).toContain(`\`${t}\``);
    expect(system()).toContain(PINNED_TYPES_LINE);
  });

  it("says mechanics is read on demand and no longer marks any type as always loaded", () => {
    expect(PINNED_TYPES_LINE).toMatch(/\`mechanics\` included, is listed by title/);
    expect(PINNED_TYPES_LINE).toContain("read_notes");
    expect(system()).not.toMatch(/always loaded/i);
    expect(system()).not.toContain("📌 Game rules");
    expect(system()).not.toContain("Pinned types** are loaded in FULL");
  });

  it("uses placeholder example names, not the names the naming rule warns about", () => {
    const row = system().split("\n").filter((l) => l.startsWith("| `npc`"))[0];
    expect(row).toContain("<NPC name>");
    for (const stock of ["Aldric", "Zara", "Kael"]) {
      expect(system().split("NOTE TYPES")[1].split("CAMPAIGN PLAN")[0]).not.toContain(stock);
    }
  });

  it("describes NPCs and fronts as they work", () => {
    const withNpc = story({
      lore: [
        { title: "Mara", content: "x", type: "npc" } as unknown as StoryLore,
        { title: "Campaign Plan", content: "# Plan", type: "gm_plan" } as unknown as StoryLore,
      ],
    });
    expect(allText(withNpc)).toContain("NPC summaries; read the note for more");
    expect(allText(withNpc)).toContain("tick a front's clock yourself with `manage_timer`");
    expect(allText(withNpc)).not.toContain("Fronts advance on their own");
  });
});

describe("thread descriptions", () => {
  it("reach the GM whole", () => {
    const long = `${"The tide rises past the old wall and ".repeat(12)}and the bell rings at last.`;
    expect(long.length).toBeGreaterThan(300);
    const s = story({
      threads: [
        { id: "t1", title: "The tide", description: long, status: "active", priority: "main" },
      ],
    } as Partial<StoryData>);
    const text = allText(s);
    expect(text).toContain(long);
    expect(text).not.toContain(`${long.slice(0, 200).trim()}...`);
  });
});

describe("the legacy setup blocks", () => {
  it("fresh story: the current flow only, with no rationale", () => {
    const text = allText(story({ sessionZeroActive: false }));
    expect(text).toContain("FRESH STORY - SETUP NEEDED");
    expect(text).toContain("This story has no character sheet yet.");
    expect(text).toContain("`create_note`");
    expect(text).not.toContain("the player skipped adventure creation");
    expect(text).not.toContain("start_game` is blocked");
  });

  it("overdue: names confirm_setup, not start_game", () => {
    const parts = Array.from({ length: 12 }, (_, i) => ({
      content: `p${i}`,
      imageUrl: "",
      user: i % 2 === 0,
      role: i % 2 === 0 ? "user" : "assistant",
    }));
    const text = allText(
      story({ sessionZeroActive: false, scene: { parts } } as unknown as Partial<StoryData>),
    );
    expect(text).toContain("No campaign plan exists");
    expect(text).not.toContain("BLOCKED until");
    expect(text).not.toContain("pins your reasoning tier");
  });
});

describe("rollGateMessage", () => {
  const bb = story({
    systemState: { usesSystemTools: true, sessionCount: 0, dedupKeys: [] },
  } as Partial<StoryData>);
  const fr = story({
    systemState: { systemId: "fantastic-realms", sessionCount: 0, dedupKeys: [] },
  } as Partial<StoryData>);

  it("Blood & Bone's gate names action_roll and not feat_roll", () => {
    const msg = rollGateMessage(toolNames(bb));
    expect(msg).toContain("`action_roll`");
    expect(msg).toContain("`formula_roll`");
    expect(msg).not.toContain("feat_roll");
  });

  it("Fantastic Realms' gate names feat_roll and not action_roll", () => {
    const msg = rollGateMessage(toolNames(fr));
    expect(msg).toContain("`feat_roll`");
    expect(msg).not.toContain("action_roll");
  });

  it("names only tools the story is offered, from the gate's own set", () => {
    const msg = rollGateMessage(["formula_roll", "read_notes"]);
    expect(msg).toContain("`formula_roll`");
    expect(msg).not.toContain("read_notes");
    expect(msg).not.toContain("fate_question");
    expect(ROLL_OR_ORACLE_TOOL_NAMES.has("formula_roll")).toBe(true);
  });

  it("points at the declared action, has a decline arm and no mid-sentence newline", () => {
    const msg = rollGateMessage(["formula_roll"]);
    expect(msg).toContain("the action the player declared this turn");
    expect(msg).toContain("If nothing in that action is uncertain");
    expect(msg).not.toContain("\n");
  });

  it("the decline arm ends the turn and does not ask for the scene again", () => {
    const msg = rollGateMessage(["formula_roll"]);
    expect(msg).toContain("reply with nothing more, and do not repeat what you wrote");
  });

  it("names manage_track's progress_roll action when manage_track is offered", () => {
    expect(rollGateMessage(["formula_roll", "manage_track"])).toContain(
      "`manage_track` (action `progress_roll`)",
    );
    expect(rollGateMessage(["formula_roll"])).not.toContain("manage_track");
  });

  it("every roll tool the message can name reaches Gemini", () => {
    for (const n of ["formula_roll", "gm_roll", "opposed_formula", "fate_question", "action_roll", "manage_track"]) {
      expect(GOOGLE_ESSENTIAL_TOOLS.has(n), n).toBe(true);
    }
  });

  it("falls back to a generic phrase when no roll tool is offered", () => {
    expect(rollGateMessage([])).toContain("a roll or oracle tool");
  });
});

describe("setupGateMessage causes", () => {
  const creation = {
    covered: 0,
    total: 1,
    missing: [
      {
        step: { id: "kind", label: "Kind", group: "character", scope: "player", hint: "Pick a Kind." },
        player: "Nik",
      },
    ],
  } as unknown as CreationProgress;

  it("keeps today's text with no options", () => {
    expect(setupGateMessage("character")).toBe(
      'Setup is not finished and this turn has not moved it forward, so the turn cannot end on prose alone. Next step: write the character sheet with create_note (type "character_sheet"), then continue.',
    );
  });

  it("a question in prose is sent through ask_question, with the words quoted back", () => {
    const rejected = "Welcome. What kind of hero do you want to play? I have a few ideas.";
    const cause = classifySetupRejection({ visibleText: rejected, toolNames: [] });
    expect(cause).toBe("prose_question");
    const msg = setupGateMessage("interview", creation, { cause, rejected });
    expect(msg).toContain("has to go through ask_question");
    expect(msg).toContain('You wrote: "Welcome. What kind of hero do you want to play? I have a few ideas."');
    expect(msg).toContain('setup_step "kind"');
  });

  it("a sheet or plan written as prose is saved only by create_note", () => {
    const rejected = "## Character Sheet\n\nName: Mara\nGear: a lantern.";
    const cause = classifySetupRejection({ visibleText: rejected, toolNames: [] });
    expect(cause).toBe("prose_note");
    const msg = setupGateMessage("character", undefined, { cause, rejected });
    expect(msg).toContain("saved only by create_note");
    expect(msg).toContain("write the character sheet with create_note");
  });

  it("a note that did call create_note is not a prose note", () => {
    expect(
      classifySetupRejection({ visibleText: "## Character Sheet\nMara", toolNames: ["create_note"] }),
    ).toBeUndefined();
  });

  it("narration prose before setup is done is not called 'no words'", () => {
    const rejected = "The rain comes down on the harbour. A lantern swings.";
    const cause = classifySetupRejection({ visibleText: rejected, toolNames: [], next: "character" });
    expect(cause).toBeUndefined();
    expect(setupGateMessage("character", undefined, { cause, rejected })).not.toContain("no words");
  });

  it("approved but not started: 'Ready to begin?' gets the start_game message alone", () => {
    const cause = classifySetupRejection({
      visibleText: "Everything looks set. Ready to begin?",
      toolNames: [],
      next: "start_game",
    });
    expect(cause).toBeUndefined();
    const msg = setupGateMessage("start_game", undefined, { cause, rejected: "Ready to begin?" });
    expect(msg).toContain("Call start_game now");
    expect(msg).not.toContain("ask_question");
    expect(msg).not.toContain("You wrote");
  });

  it("next === character with 'does that look right?' gets the sheet message alone", () => {
    const cause = classifySetupRejection({
      visibleText: "Here is the idea. Does that look right?",
      toolNames: [],
      next: "character",
    });
    expect(cause).toBeUndefined();
    const msg = setupGateMessage("character", undefined, { cause });
    expect(msg).toContain("write the character sheet with create_note");
    expect(msg).not.toContain("ask_question");
  });

  it("a bold question line is not a sheet heading", () => {
    expect(
      classifySetupRejection({
        visibleText: "**What is your character's spine?**\nPick one.",
        toolNames: [],
        next: "interview",
      }),
    ).toBe("prose_question");
    expect(
      classifySetupRejection({
        visibleText: "**What is your character's spine?**",
        toolNames: [],
        next: "character",
      }),
    ).toBeUndefined();
  });

  it("a question is a prose question only while a setup question is next", () => {
    for (const next of ["interview", "concept"] as const) {
      expect(classifySetupRejection({ visibleText: "Who are you?", toolNames: [], next })).toBe("prose_question");
    }
    for (const next of ["campaign", "confirm", "start_game"] as const) {
      expect(classifySetupRejection({ visibleText: "Who are you?", toolNames: [], next })).toBeUndefined();
    }
  });

  it("an empty round says there was nothing", () => {
    const cause = classifySetupRejection({ visibleText: "", toolNames: [] });
    expect(cause).toBe("nothing");
    expect(setupGateMessage("campaign", undefined, { cause })).toContain(
      "ended with no words and no tool call",
    );
  });

  it("quotes only whole sentences, on one line, and nothing when the first is too long", () => {
    const q = quoteWholeSentences("One short line.\nTwo is here. " + "x".repeat(400) + " end.", 60);
    expect(q).toBe("One short line. Two is here.");
    expect(quoteWholeSentences("y".repeat(500) + ".", 100)).toBe("");
    expect(quoteWholeSentences("A.\n\nB?", 100)).toBe("A. B?");
  });

  it("target_player_name is named only when several players are at the table", () => {
    expect(setupGateMessage("interview", creation)).not.toContain("target_player_name");
    expect(setupGateMessage("interview", creation, { multiPlayer: false })).not.toContain(
      "target_player_name",
    );
    expect(setupGateMessage("interview", creation, { multiPlayer: true })).toContain(
      'target_player_name "Nik"',
    );
  });

  it("no message breaks a sentence over a newline", () => {
    for (const step of ["interview", "concept", "character", "campaign", "confirm", "start_game"] as const) {
      expect(sentenceBreaks(setupGateMessage(step, creation, { cause: "nothing" }))).toBe(false);
    }
  });
});
