/**
 * Campaign slice 3: session zero builds the campaign record. The steps per
 * mode, readiness (a record, or a plan note for older stories), the approval
 * hash, start_game's refusals and warnings, the setup card's projection, and
 * the block the GM reads.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  executeGMTools,
  type GMInteractionHandlers,
  type SetupConfirmationRequest,
} from "@/app/misc/gmExecutor";
import {
  currentSetupHashes,
  getSetupProgress,
  hasCampaignPlan,
  hashCampaignRecord,
} from "@/app/misc/campaignPlan";
import { getCreationSteps, getRequiredSteps } from "@/app/misc/setupSteps";
import { buildSessionZeroBlock } from "@/app/misc/ai_staged";
import { setupStripState } from "@/app/misc/setupStrip";
import { publicCampaignView } from "@/app/misc/campaign/publicView";
import { missingStyleParts, styleWarningLine } from "@/app/misc/campaign/styles";
import { emptyCampaign } from "@/app/misc/campaign/types";
import type { CampaignRecord } from "@/app/misc/campaign/types";
import type { StoryData, StoryLore } from "@/app/misc/structs";
import { QUICK_COVERED } from "./helpers/setupCovered";
import { clock, front, record, stubUuids } from "./helpers/campaignFixtures";

beforeEach(() => {
  vi.restoreAllMocks();
  stubUuids();
});

const CANARY = "ZEBRA-TRUTH-4471";

function note(overrides: Partial<StoryLore>): StoryLore {
  return {
    title: "Note",
    content: "text",
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
    type: "lore",
    ...overrides,
  } as StoryLore;
}
const sheet = () =>
  note({ title: "Character: Hero", content: "Hero, a courier.", type: "character_sheet" });
const plan = () =>
  note({ title: "Campaign Plan", content: "# Plan\nOpening Image", type: "gm_plan" });

function story(overrides: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "New Story",
    premise: "",
    sessionZeroActive: true,
    scene: { parts: [] },
    lore: [sheet()],
    memory: [],
    npcs: [],
    threads: [],
    setup: { mode: "quick", conceptDone: true, covered: QUICK_COVERED },
    ...overrides,
  } as unknown as StoryData;
}

/** A ready record: a style and one faction. */
function readyRecord(extra: Partial<CampaignRecord> = {}): CampaignRecord {
  return record({
    style: "mystery",
    pitch: { premise: "A drowned village", tone: ["eerie"] },
    safety: { lines: [], veils: [] },
    factions: [{ id: "fac_a", name: "The Marlows", goal: "keep the mill" }],
    ...extra,
  });
}

let n = 0;
const call = (name: string, args: Record<string, unknown>) => ({
  id: `c${++n}`,
  function: { name, arguments: JSON.stringify(args) },
});

function cardHandlers(approved = true) {
  const requests: SetupConfirmationRequest[] = [];
  const h: GMInteractionHandlers = {
    requestSetupConfirmation: async (req) => {
      requests.push(req);
      return approved ? { approved: true } : { dismissed: true };
    },
  };
  return { h, requests };
}

describe("the steps per mode", () => {
  const ids = (s: StoryData) => getCreationSteps(s).map((x) => x.id);

  it("adds style and tone_safety to the world steps, before campaign", () => {
    expect(ids(story())).toEqual([
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

  it("quick mode requires setting, tone and tone_safety; full mode all of them", () => {
    const quick = story({ setup: { mode: "quick" } });
    expect(getRequiredSteps(quick).map((s) => s.id)).toEqual(["setting", "tone", "tone_safety"]);
    const full = story({ setup: { mode: "full" } });
    expect(getRequiredSteps(full).map((s) => s.id)).toContain("style");
    expect(getRequiredSteps(story({ setup: undefined }))).toHaveLength(0);
  });

  it("every step hint stays short enough to read", () => {
    for (const s of getCreationSteps(story())) expect(s.hint.length).toBeLessThan(300);
  });
});

describe("campaign readiness", () => {
  const ready = (s: StoryData) => getSetupProgress(s).campaign;

  it("a plan note still counts, for older stories", () => {
    expect(ready(story({ lore: [sheet(), plan()] }))).toBe(true);
    expect(hasCampaignPlan(story({ lore: [sheet(), plan()] }))).toBe(true);
  });

  it("a record needs a style and a part beyond the pitch", () => {
    expect(ready(story({ campaign: readyRecord() }))).toBe(true);
    expect(ready(story({ campaign: readyRecord({ style: undefined }) }))).toBe(false);
    expect(ready(story({ campaign: readyRecord({ factions: [] }) }))).toBe(false);
    // A pitch and safety alone are not a part beyond the pitch.
    expect(ready(story({ campaign: record({ style: "sandbox", pitch: { premise: "x", tone: ["a"] }, safety: { lines: [], veils: [] } }) }))).toBe(false);
    expect(ready(story())).toBe(false);
  });

  it("each part kind counts as a part beyond the pitch", () => {
    const withPart: Partial<CampaignRecord>[] = [
      { factions: [{ id: "f", name: "F", goal: "g" }] },
      { fronts: [front()] },
      { clocks: [clock()] },
      { people: [{ npcId: "n1" }] },
      { secrets: [{ id: "s", title: "t", truth: "x", keyPhrases: [], revealed: false, clues: [] }] },
      { locations: [{ id: "l", name: "L", features: [], npcIds: [] }] },
      { beats: { list: [{ id: "b", title: "B", summary: "s", status: "current" }] } },
      { endStates: [{ id: "e", text: "t" }] },
    ];
    for (const extra of withPart) {
      expect(ready(story({ campaign: record({ style: "sandbox", ...extra }) }))).toBe(true);
    }
  });

  it("a record made only by the timer migration follows the old plan note", () => {
    const migrated: CampaignRecord = {
      ...emptyCampaign(),
      origin: "migrated",
      style: "sandbox",
      clocks: [clock({ migratedFromTimerId: "t1" })],
    };
    // Even with a style and a clock, origin 'migrated' never counts.
    expect(ready(story({ campaign: migrated }))).toBe(false);
    expect(ready(story({ campaign: migrated, lore: [sheet(), plan()] }))).toBe(true);
  });
});

describe("the approval hash", () => {
  it("has no campaignHash on a story with no record, so old approvals hold", () => {
    const s = story({ lore: [sheet(), plan()] });
    const h = currentSetupHashes(s);
    expect(h.campaignHash).toBeUndefined();
    const approved = { ...s, setup: { ...s.setup, approval: h } } as StoryData;
    expect(getSetupProgress(approved).approved).toBe(true);
  });

  it("a record adds a third hash, and any edit of it cancels the approval", () => {
    const s = story({ campaign: readyRecord() });
    const approved = {
      ...s,
      setup: { ...s.setup, approval: currentSetupHashes(s) },
    } as StoryData;
    expect(currentSetupHashes(s).campaignHash).toBeTruthy();
    expect(getSetupProgress(approved).approved).toBe(true);

    // A hidden part changes: nothing on the card moved, the approval still goes.
    const edited = structuredClone(approved);
    edited.campaign!.secrets = [
      { id: "sec_a", title: "The truth", truth: CANARY, keyPhrases: [], revealed: false, clues: [] },
    ];
    expect(getSetupProgress(edited).approved).toBe(false);
    expect(getSetupProgress(edited).next).toBe("confirm");

    const renamed = structuredClone(approved);
    renamed.campaign!.factions[0].goal = "burn the mill";
    expect(getSetupProgress(renamed).approved).toBe(false);
  });

  it("play state does not change the hash: a tick, a found clue, a revealed secret", () => {
    const rec = readyRecord({
      clocks: [clock()],
      secrets: [
        {
          id: "sec_a",
          title: "t",
          truth: "x",
          keyPhrases: [],
          revealed: false,
          clues: [{ id: "clu_a", text: "c", found: false }],
        },
      ],
    });
    const before = hashCampaignRecord(rec);
    const played = structuredClone(rec);
    played.clocks[0].filled = 3;
    played.clocks[0].crossed = [2];
    played.clocks[0].paused = true;
    played.secrets[0].clues[0].found = true;
    played.secrets[0].revealed = true;
    expect(hashCampaignRecord(played)).toBe(before);
  });

  it("a campaign tool write that changes the record changes the hash; a read does not", async () => {
    const s = story({ campaign: readyRecord() });
    const h0 = currentSetupHashes(s).campaignHash;
    const read = await executeGMTools([call("campaign", { action: "read" })], s);
    expect(currentSetupHashes(read.modifiedStoryData).campaignHash).toBe(h0);
    const add = await executeGMTools(
      [call("campaign", { action: "add", part: "end_state", data: { text: "The mill is saved" } })],
      s,
    );
    expect(add.results[0].success).toBe(true);
    expect(currentSetupHashes(add.modifiedStoryData).campaignHash).not.toBe(h0);
  });
});

describe("start_game", () => {
  it("refuses with no style, naming the campaign tool and that a plan note also counts", async () => {
    const s = story();
    const out = await executeGMTools([call("start_game", { story_name: "X" })], s);
    expect(out.results[0].success).toBe(false);
    const text = out.results[0].contextForStory;
    expect(text).toContain("the campaign is not ready: no style yet");
    expect(text).toContain("campaign tool");
    expect(text).toContain("gm_plan");
    expect(out.modifiedStoryData.sessionZeroActive).toBe(true);
  });

  it("refuses a style with nothing beyond the pitch", async () => {
    const s = story({
      campaign: record({ style: "sandbox", pitch: { premise: "x", tone: ["a"] } }),
    });
    const out = await executeGMTools([call("start_game", { story_name: "X" })], s);
    expect(out.results[0].success).toBe(false);
    expect(out.results[0].contextForStory).toContain("nothing beyond the pitch yet");
  });

  it("refuses when the tone and safety step was never asked", async () => {
    const s = story({
      campaign: readyRecord(),
      setup: { mode: "quick", conceptDone: true, covered: { table: ["setting", "tone"], players: {} } },
    });
    s.setup!.approval = currentSetupHashes(s);
    const out = await executeGMTools([call("start_game", { story_name: "X" })], s);
    expect(out.results[0].success).toBe(false);
    expect(out.results[0].contextForStory).toContain("lines and veils have not been asked");
    expect(out.results[0].contextForStory).toContain('"tone_safety"');
  });

  it("starts on the minimal requirements and warns about the style's other parts", async () => {
    const s = story({ campaign: readyRecord() });
    s.setup!.approval = currentSetupHashes(s);
    const out = await executeGMTools([call("start_game", { story_name: "Drowned" })], s);
    expect(out.results[0].success).toBe(true);
    expect(out.modifiedStoryData.sessionZeroActive).toBe(false);
    // A mystery also expects secrets, a front and end states: named as parts only.
    const text = out.results[0].gmOnlyContext ?? "";
    expect(out.results[0].contextForStory).not.toContain("Prep warning");
    expect(text).toContain("Prep warning: a mystery campaign also expects");
    expect(text).toContain("secrets with clues");
    expect(text).toContain("a front with a clock");
    expect(text).toContain("end states");
  });

  it("keeps a secret's title out of the visible result; the GM's own line carries the authoring checks", async () => {
    const rec = readyRecord({
      secrets: [
        {
          id: "sec_a",
          title: CANARY,
          truth: "x",
          keyPhrases: [],
          revealed: false,
          clues: [{ id: "clu_a", text: "c", found: false }],
        },
      ],
    });
    const s = story({ campaign: rec });
    s.setup!.approval = currentSetupHashes(s);
    const out = await executeGMTools([call("start_game", { story_name: "Drowned" })], s);
    expect(out.results[0].success).toBe(true);
    expect(out.results[0].contextForStory).not.toContain(CANARY);
    expect(out.results[0].gmOnlyContext).toContain(CANARY);
    expect(out.results[0].gmOnlyContext).toContain("clue");
  });

  it("a plan-note story starts as before, with no warnings", async () => {
    const s = story({ lore: [sheet(), plan()] });
    s.setup!.approval = currentSetupHashes(s);
    const out = await executeGMTools([call("start_game", { story_name: "Old" })], s);
    expect(out.results[0].success).toBe(true);
    expect(out.results[0].contextForStory).not.toContain("Prep warning");
    expect(out.results[0].gmOnlyContext).toBeUndefined();
  });
});

describe("confirm_setup with a record and no plan note", () => {
  const hidden = {
    npcs: [{ id: "npc-1", name: "Callum", description: "A ferryman." }],
  } as Partial<StoryData>;

  function secretRecord(): CampaignRecord {
    return readyRecord({
      pitch: { premise: "A drowned village", tone: ["eerie"] },
      safety: {
        lines: [{ id: "saf_a", text: "no harm to children", keywords: ["child"] }],
        veils: [{ id: "saf_b", text: "violence", keywords: ["blood"] }],
      },
      fronts: [
        front({
          doom: `${CANARY} doom`,
          dangers: [{ name: "Hollin", impulse: `${CANARY} impulse` }],
          portents: [{ at: 2, text: `${CANARY} portent` }],
        }),
      ],
      clocks: [
        clock({ id: "clk_a", name: "The barrow wakes", visible: false, onFill: `${CANARY} fill` }),
        clock({ id: "clk_b", name: "Market day", visible: true, segments: 4, filled: 1 }),
      ],
      people: [{ npcId: "npc-1", want: `${CANARY} want`, secret: `${CANARY} secret`, voice: `${CANARY} voice` }],
      secrets: [
        {
          id: "sec_a",
          title: `${CANARY} title`,
          truth: `${CANARY} truth`,
          keyPhrases: [`${CANARY} phrase`],
          revealed: false,
          clues: [{ id: "clu_a", text: `${CANARY} clue`, found: false }],
        },
      ],
      locations: [{ id: "loc_a", name: "The ferry", features: ["a rusted bell"], npcIds: [] }],
      beats: { list: [{ id: "bt_a", title: `${CANARY} beat`, summary: `${CANARY}`, status: "current" }] },
      endStates: [{ id: "end_a", text: `${CANARY} ending` }],
    });
  }

  it("shows the card with the public projection, never a secret", async () => {
    const { h, requests } = cardHandlers();
    const s = story({ ...hidden, campaign: secretRecord() });
    const out = await executeGMTools(
      [call("confirm_setup", { character_summary: "Hero", campaign_hook: "A drowned village." })],
      s,
      {},
      h,
    );
    expect(requests).toHaveLength(1);
    const plan = requests[0].plan;
    expect(plan.note).toBeUndefined();
    expect(plan.campaign?.styleLabel).toBe("Mystery");
    expect(plan.campaign?.lines).toEqual(["no harm to children"]);
    expect(plan.campaign?.veils).toEqual(["violence"]);
    expect(plan.campaign?.factions).toEqual(["The Marlows"]);
    expect(plan.campaign?.clocks).toEqual([{ name: "Market day", segments: 4, filled: 1 }]);
    // Nothing secret anywhere in the request.
    const json = JSON.stringify(requests[0]);
    expect(json).not.toContain(CANARY);
    expect(json).not.toContain("The barrow wakes"); // the hidden clock
    expect(json).not.toContain("keywords");
    expect(out.results[0].success).toBe(true);
  });

  it("approval binds all three hashes and starts the game through executeStartGame", async () => {
    const { h } = cardHandlers();
    const s = story({ ...hidden, campaign: readyRecord() });
    const out = await executeGMTools(
      [call("confirm_setup", { character_summary: "Hero", campaign_hook: "A drowned village.", story_name: "Drowned" })],
      s,
      {},
      h,
    );
    expect(out.results[0].success).toBe(true);
    expect((out.results[0].result as { started?: boolean }).started).toBe(true);
    expect(out.modifiedStoryData.sessionZeroActive).toBe(false);
    expect(out.modifiedStoryData.story_name).toBe("Drowned");
    expect(out.modifiedStoryData.setup?.approval?.campaignHash).toBe(
      hashCampaignRecord(out.modifiedStoryData.campaign!),
    );
    expect(out.results[0].gmOnlyContext).toContain("Prep warning");
    expect(out.results[0].contextForStory).not.toContain("Prep warning");
  });

  it("shows both a plan note and a record when the story has both", async () => {
    const { h, requests } = cardHandlers(false);
    const s = story({ lore: [sheet(), plan()], campaign: readyRecord() });
    await executeGMTools(
      [call("confirm_setup", { character_summary: "Hero", campaign_hook: "x" })],
      s,
      {},
      h,
    );
    expect(requests[0].plan.note?.title).toBe("Campaign Plan");
    expect(requests[0].plan.campaign).toBeDefined();
  });

  it("refuses with neither, pointing at the campaign tool", async () => {
    const { h, requests } = cardHandlers();
    const out = await executeGMTools(
      [call("confirm_setup", { character_summary: "Hero", campaign_hook: "x" })],
      story(),
      {},
      h,
    );
    expect(out.results[0].success).toBe(false);
    expect(out.results[0].contextForStory).toContain("campaign tool");
    expect(requests).toHaveLength(0);
  });

  it("an edit earlier in the batch is on the card and in the approval", async () => {
    const { h, requests } = cardHandlers();
    const s = story({ campaign: readyRecord() });
    const out = await executeGMTools(
      [
        call("campaign", { action: "add", part: "end_state", data: { text: "The mill is saved" } }),
        call("confirm_setup", { character_summary: "Hero", campaign_hook: "x" }),
      ],
      s,
      {},
      h,
    );
    expect(requests).toHaveLength(1);
    expect(out.modifiedStoryData.campaign!.endStates).toHaveLength(1);
    expect(out.modifiedStoryData.setup?.approval?.campaignHash).toBe(
      hashCampaignRecord(out.modifiedStoryData.campaign!),
    );
  });
});

describe("publicCampaignView", () => {
  it("is an allowlist: no secret, doom, portent, want, hidden clock or beat text", () => {
    const rec = readyRecord({
      fronts: [front({ doom: CANARY, portents: [{ at: 1, text: CANARY }], dangers: [{ name: CANARY, impulse: CANARY }] })],
      clocks: [clock({ visible: false, name: CANARY, onFill: CANARY })],
      people: [{ npcId: "n", want: CANARY, secret: CANARY, voice: CANARY }],
      secrets: [
        {
          id: "s",
          title: CANARY,
          truth: CANARY,
          keyPhrases: [CANARY],
          revealed: false,
          clues: [
            { id: "c1", text: CANARY, found: false },
            { id: "c2", text: "a muddy boot print", found: true },
          ],
        },
      ],
      beats: { list: [{ id: "b", title: CANARY, summary: CANARY, status: "current" }] },
      endStates: [{ id: "e", text: CANARY }],
    });
    const view = publicCampaignView(rec);
    expect(JSON.stringify(view)).not.toContain(CANARY);
    expect(view.known).toEqual(["a muddy boot print"]);
    expect(view.fronts[0].stakes).toEqual(["Will the Marlows sell the mill?"]);
  });

  it("leaves out a cancelled clock, and says when safety was asked with none", () => {
    const view = publicCampaignView(
      readyRecord({ clocks: [clock({ cancelled: true, visible: true })] }),
    );
    expect(view.clocks).toEqual([]);
    expect(view.safetyAsked).toBe(true);
    expect(view.lines).toEqual([]);
    expect(publicCampaignView(record()).safetyAsked).toBe(false);
  });
});

describe("the style's expected parts", () => {
  it("names what a style lacks, and nothing for a record without a style", () => {
    expect(missingStyleParts(record())).toEqual([]);
    expect(missingStyleParts(record({ style: "episodic" }))).toEqual([
      "pitch",
      "fronts",
      "locations",
      "people",
    ]);
    expect(styleWarningLine(record({ style: "solo", pitch: { premise: "x", tone: ["a"] }, people: [{ npcId: "n" }] }))).toBe("");
    expect(styleWarningLine(record({ style: "solo" }))).toContain("solo / oracle");
  });
});

describe("the session-zero block", () => {
  it("offers the styles when none is chosen, and the campaign tool", () => {
    const block = buildSessionZeroBlock(story());
    expect(block).toContain("## CAMPAIGN (build it with the `campaign` tool)");
    expect(block).toContain("sandbox");
    expect(block).toContain("adventure_path");
    expect(block).toContain('part "style"');
    expect(block).toContain("Lines and veils:");
    expect(block).toContain("none");
  });

  it("lists the chosen style's expected parts, what is built and what is not", () => {
    const block = buildSessionZeroBlock(story({ campaign: readyRecord() }));
    expect(block).toContain("Style: Mystery.");
    expect(block).toContain("Built: ");
    expect(block).toContain("Still to build: ");
    expect(block).toContain("secrets with clues");
    expect(block).toContain("Every secret wants three clues");
  });

  it("says the game cannot start with nothing beyond the pitch", () => {
    const block = buildSessionZeroBlock(
      story({ campaign: record({ style: "sandbox", pitch: { premise: "x", tone: ["a"] } }) }),
    );
    expect(block).toContain("cannot start until the campaign holds one part beyond the pitch");
  });

  it("carries no secret from the record", () => {
    const rec = readyRecord({
      secrets: [{ id: "s", title: CANARY, truth: CANARY, keyPhrases: [], revealed: false, clues: [] }],
    });
    // The GM builds the record, so it may know it; the block itself only
    // names parts and counts, never text.
    expect(buildSessionZeroBlock(story({ campaign: rec }))).not.toContain(CANARY);
  });

  it("the campaign step's next-step text sends the GM to the tool, not a gm_plan note", () => {
    const block = buildSessionZeroBlock(story());
    // The player has no record and no note: next is the campaign (the sheet exists, quick steps covered).
    expect(block).toContain("→ Campaign");
    expect(block).toContain("NEXT: the campaign.");
    expect(block).not.toContain('type: "gm_plan"');
  });
});

describe("the setup strip", () => {
  it("ticks Campaign for a record with no note, and opens no note", () => {
    const state = setupStripState(story({ campaign: readyRecord() }));
    if (state.kind !== "checklist") throw new Error("checklist expected");
    const item = state.steps.find((x) => x.id === "campaign")!;
    expect(item.done).toBe(true);
    expect(item.noteTitle).toBeUndefined();
    expect(state.awaitingApproval).toBe(true);
  });
});

describe("engine-review fixes", () => {
  it("the campaign step warns that a plan note is shown whole on the card", () => {
    const block = buildSessionZeroBlock(story());
    expect(block).toContain("the player sees that note in full on the card");
    expect(block).toContain("truths, secrets and endings go in the record");
    expect(block).toContain("`secret` note");
  });

  it("a migrated record has a campaign hash, and a change to it changes the hash", () => {
    const migrated: CampaignRecord = {
      ...emptyCampaign(),
      origin: "migrated",
      clocks: [clock({ migratedFromTimerId: "t1" })],
    };
    const s = story({ campaign: migrated });
    const before = currentSetupHashes(s).campaignHash;
    expect(before).toBeTruthy();
    const edited = structuredClone(s);
    edited.campaign!.clocks[0].name = "Renamed";
    expect(currentSetupHashes(edited).campaignHash).not.toBe(before);
    // Play state alone does not.
    const ticked = structuredClone(s);
    ticked.campaign!.clocks[0].filled = 2;
    expect(currentSetupHashes(ticked).campaignHash).toBe(before);
  });
});
