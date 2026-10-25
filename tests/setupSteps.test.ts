/**
 * Creation steps (app/misc/setupSteps.ts, docs/session-zero-detail-design.md
 * 3.1-3.3): which steps a story has per mode, system, mechanics note and
 * player count; the totals; and how they feed getSetupProgress and the gate's
 * words.
 */
import { describe, expect, it } from "vitest";
import {
  SOLO_PLAYER_ID,
  creationTotal,
  getCreationProgress,
  getCreationSteps,
  getRequiredSteps,
} from "@/app/misc/setupSteps";
import {
  premadePlayerIds,
  getSetupProgress,
  setupEngineLine,
  setupGateMessage,
} from "@/app/misc/campaignPlan";
import { BLOOD_AND_BONE } from "@/app/misc/systems/blood-and-bone";
import type { SetupState, StoryData, StoryLore } from "@/app/misc/structs";

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

const BB_NOTE = BLOOD_AND_BONE.packs[0].notes[0];
const bbLore = () =>
  lore({
    title: BB_NOTE.title,
    type: BB_NOTE.type,
    content: BB_NOTE.content,
    libraryNoteId: BB_NOTE.id,
  });

const COUCH = [
  { id: "a", name: "Ann", color: "red" },
  { id: "b", name: "Bo", color: "blue" },
];

function story(
  setup: SetupState | undefined,
  notes: StoryLore[] = [],
  overrides: Partial<StoryData> = {},
): StoryData {
  return {
    story_name: "T",
    player_name: "Nik",
    sessionZeroActive: true,
    scene: { parts: [] },
    lore: notes,
    memory: [],
    npcs: [],
    setup,
    ...overrides,
  } as unknown as StoryData;
}

const ids = (s: StoryData) => getCreationSteps(s).map((x) => x.id);

describe("getCreationSteps", () => {
  it("gives a story with no system the universal steps only, in order", () => {
    expect(ids(story({ mode: "full" }))).toEqual([
      "setting",
      "tone",
      "style",
      "tone_safety",
      "campaign",
      "name_look",
      "history",
      "drives",
    ]);
  });

  it("puts a system's steps between the world and the person", () => {
    expect(ids(story({ mode: "full" }, [bbLore()]))).toEqual([
      "setting",
      "tone",
      "style",
      "tone_safety",
      "campaign",
      "kind",
      "archetype",
      "stats",
      "vow",
      "connections",
      "burden",
      "power",
      "path",
      "gear",
      "name_look",
      "history",
      "drives",
    ]);
  });

  it("has no stress step; the burden hint tells the GM to state it", () => {
    const steps = getCreationSteps(story({ mode: "full" }, [bbLore()]));
    expect(steps.some((s) => /stress/i.test(s.id) || /stress/i.test(s.label))).toBe(false);
    const burden = steps.find((s) => s.id === "burden")!;
    expect(burden.hint).toMatch(/Stress/);
    expect(burden.hint).toMatch(/none/);
  });

  it("gives abilities only to a no-system story with an enabled mechanics note", () => {
    const mech = lore({ title: "Rules", type: "mechanics", content: "Roll 2d6." });
    expect(ids(story({ mode: "full" }, [mech]))).toContain("abilities");
    expect(ids(story({ mode: "full" }, [{ ...mech, enabled: false }]))).not.toContain("abilities");
    expect(ids(story({ mode: "full" }, [lore({ type: "lore" })]))).not.toContain("abilities");
    // A system story uses the system's steps, not the generic one.
    expect(ids(story({ mode: "full" }, [bbLore(), mech]))).not.toContain("abilities");
  });

  it("adds the table step only with two or more players", () => {
    const solo = story({ mode: "full" });
    expect(ids(solo)).not.toContain("cohort");
    const couch = story({ mode: "full" }, [], {
      multiplayer: { enabled: true, couchPlayers: COUCH },
    } as Partial<StoryData>);
    expect(ids(couch)[0]).toBe("cohort");
    // A roster passed in counts too (party seats).
    expect(getCreationSteps(solo, COUCH)[0].id).toBe("cohort");
  });

  it("scopes world steps to the table and the rest to each player", () => {
    const steps = getCreationSteps(story({ mode: "full" }, [bbLore()]));
    for (const s of steps) {
      const table = s.group === "table" || s.group === "world";
      expect(s.scope).toBe(table ? "table" : "player");
      expect(s.hint.length).toBeGreaterThan(10);
      expect(s.hint.length).toBeLessThan(300);
    }
  });
});

describe("what is required, and the totals", () => {
  it("full mode requires every step, quick mode setting, tone and tone_safety, no mode none", () => {
    const bb = [bbLore()];
    expect(getRequiredSteps(story({ mode: "full" }, bb))).toHaveLength(17);
    expect(getRequiredSteps(story({ mode: "quick" }, bb)).map((s) => s.id)).toEqual([
      "setting",
      "tone",
      "tone_safety",
    ]);
    expect(getRequiredSteps(story({}, bb))).toHaveLength(0);
    expect(getRequiredSteps(story(undefined, bb))).toHaveLength(0);
  });

  it("counts a solo Blood & Bone build as 17 and a couch of two as 30", () => {
    expect(creationTotal(story({ mode: "full" }, [bbLore()]))).toBe(17);
    const couch = story({ mode: "full" }, [bbLore()], {
      multiplayer: { enabled: true, couchPlayers: COUCH },
    } as Partial<StoryData>);
    expect(creationTotal(couch)).toBe(30); // 1 cohort + 5 world + 12 x 2
    expect(creationTotal(story({ mode: "quick" }, [bbLore()]))).toBe(3);
    expect(creationTotal(story({}))).toBe(0);
  });
});

describe("getSetupProgress: the interview", () => {
  it("is next while required steps are missing, ahead of the character", () => {
    const p = getSetupProgress(story({ mode: "full" }));
    expect(p.next).toBe("interview");
    expect(p.creation.total).toBe(8);
    expect(p.creation.covered).toBe(0);
    expect(p.creation.missing[0].step.id).toBe("setting");
  });

  it("counts covered steps, per player, and ticks the concept on the first", () => {
    const s = story(
      {
        mode: "full",
        covered: { table: ["setting"], players: { a: ["name_look"], b: [] } },
      },
      [],
      { multiplayer: { enabled: true, couchPlayers: COUCH } } as Partial<StoryData>,
    );
    const p = getSetupProgress(s);
    expect(p.concept).toBe(true);
    // cohort, tone, campaign still to ask; name_look done for Ann only.
    const missing = p.creation.missing.map((m) => `${m.step.id}:${m.player ?? "-"}`);
    expect(missing).toContain("cohort:-");
    expect(missing).toContain("name_look:Bo");
    expect(missing).not.toContain("name_look:Ann");
    expect(missing).not.toContain("setting:-");
    expect(p.creation.covered).toBe(2);
    expect(p.creation.total).toBe(1 + 5 + 3 * 2);
  });

  it("moves on to the character when every required step is covered", () => {
    const base = story({ mode: "quick" });
    const s = story({ mode: "quick", covered: { table: ["setting", "tone", "tone_safety"], players: {} } });
    expect(getSetupProgress(base).next).toBe("interview");
    expect(getSetupProgress(s).next).toBe("character");
    expect(getSetupProgress(s).creation).toMatchObject({ covered: 3, total: 3, missing: [] });
  });

  it("keys solo coverage under 'solo' and ignores ids the story does not have", () => {
    const s = story({
      mode: "quick",
      covered: { table: ["setting", "tone", "ghost"], players: { solo: ["nonsense"] } },
    });
    expect(getCreationProgress(s)).toMatchObject({ covered: 2, total: 3 });
    expect(SOLO_PLAYER_ID).toBe("solo");
  });
});

describe("the gate's words name the next step and player", () => {
  it("the re-prompt names the step, its tag, its hint, and keeps the card shut", () => {
    const s = story({ mode: "full", covered: { table: ["setting", "tone", "style", "tone_safety", "campaign"], players: {} } }, [bbLore()]);
    const p = getSetupProgress(s);
    expect(p.next).toBe("interview");
    const msg = setupGateMessage(p.next, p.creation);
    expect(msg).toContain("Kind (Nik)");
    expect(msg).toContain('setup_step "kind"');
    expect(msg).toContain(p.creation.missing[0].step.hint);
    expect(msg).toContain("Do not call confirm_setup yet");
  });

  it("the engine line names the step and the player", () => {
    const s = story({ mode: "full", covered: { table: ["setting", "tone", "style", "tone_safety", "campaign"], players: { solo: ["kind", "archetype", "stats", "vow"] } } }, [bbLore()]);
    const p = getSetupProgress(s);
    expect(setupEngineLine(p.next, p.creation)).toBe(
      "Next up: Connections (Nik). Anything you want to tell me first? Or just say go on.",
    );
  });

  it("the line for a step without a creation step hands the floor back", () => {
    expect(setupEngineLine("concept")).toBe(
      "Next up: a few questions about the game. Anything you want to tell me first? Or just say go on.",
    );
    expect(setupGateMessage("character")).toContain("character_sheet");
  });
});

describe("pre-made characters", () => {
  const sheet = (overrides: Partial<StoryLore> = {}) =>
    lore({ title: "Character: Nik", type: "character_sheet", content: "Nik, a courier.", ...overrides });
  const couchOverrides = {
    multiplayer: { enabled: true, couchPlayers: COUCH },
  } as Partial<StoryData>;

  it("solo: any populated enabled sheet at mode time marks the player pre-made", () => {
    expect(premadePlayerIds(story({}, [sheet()]))).toEqual([SOLO_PLAYER_ID]);
    expect(premadePlayerIds(story({}, [sheet({ content: "  " })]))).toEqual([]);
    expect(premadePlayerIds(story({}, [sheet({ enabled: false })]))).toEqual([]);
    expect(premadePlayerIds(story({}))).toEqual([]);
  });

  it("couch: matches by owner id or a Character: <name> title", () => {
    const s = story({}, [sheet({ title: "Character: Ann" }), sheet({ title: "x", ownerCouchPlayerId: "b" })], couchOverrides);
    expect(premadePlayerIds(s)).toEqual(["a", "b"]);
    const onlyAnn = story({}, [sheet({ title: "Character: Ann" })], couchOverrides);
    expect(premadePlayerIds(onlyAnn)).toEqual(["a"]);
  });

  it("a pre-made player is not asked the player steps; table and world steps still apply", () => {
    const solo = story({ mode: "full", premadeFor: [SOLO_PLAYER_ID] }, [bbLore()]);
    expect(creationTotal(solo)).toBe(5);
    expect(getCreationProgress(solo).missing.map((m) => m.step.id)).toEqual([
      "setting",
      "tone",
      "style",
      "tone_safety",
      "campaign",
    ]);
    const couch = story({ mode: "full", premadeFor: ["a"] }, [bbLore()], couchOverrides);
    expect(creationTotal(couch)).toBe(18); // 1 cohort + 5 world + 12 x Bo
    expect(getCreationProgress(couch).missing.every((m) => m.playerId !== "a")).toBe(true);
    expect(creationTotal(story({ mode: "quick", premadeFor: ["solo"] }))).toBe(3);
  });
});

describe("setupEngineLine hands the floor back (decision 195)", () => {
  it("asks before the sheet and the plan, and offers go on", () => {
    expect(setupEngineLine("character")).toBe(
      "Next up: your character sheet. Anything you want me to know before I write it? Or just say go on.",
    );
    expect(setupEngineLine("campaign")).toContain("Or just say go on.");
    expect(setupEngineLine("start_game")).toBe(
      "Everything's set. Say go on and we'll start.",
    );
  });
});
