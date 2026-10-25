/**
 * buildPlayerView is party mode's redaction boundary (decision 22): a phone
 * never receives StoryData, secrets, the campaign plan, GM instructions,
 * notes that aren't always_reveal, other players' sheets, or any key. This
 * builds a story stuffed with all of those, each carrying a marker string,
 * and checks that none of the markers reach any phone's view, while the
 * things a phone should see do.
 */
import { describe, expect, it } from "vitest";
import {
  buildPlayerView,
  createPartyHost,
  findPlayerSheet,
  handleConnect,
  handlePhoneMessage,
  type PartyHostState,
} from "@/app/misc/party/partyHost";
import type { StoryData, StoryLore } from "@/app/misc/structs";
import { BLOOD_AND_BONE } from "@/app/misc/systems/blood-and-bone";

const TOKEN = "t";

function note(title: string, content: string, extra: Partial<StoryLore> = {}): StoryLore {
  return {
    title,
    content,
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
    ...extra,
  };
}

// Every string here must never appear in any phone's view.
const FORBIDDEN = {
  secretNote: "LEAK_SECRET_NOTE",
  gmPlan: "LEAK_GM_PLAN",
  dmInstructions: "LEAK_DM_INSTRUCTIONS",
  legacyGmNotes: "LEAK_GM_NOTES",
  mechanics: "LEAK_MECHANICS",
  hiddenLore: "LEAK_HIDDEN_LORE",
  toBeRevealed: "LEAK_TO_BE_REVEALED",
  checkPerTurn: "LEAK_CHECK_PER_TURN",
  secretFlag: "LEAK_SECRTET_FLAG",
  disabled: "LEAK_DISABLED",
  maraHiddenSheet: "LEAK_MARA_HIDDEN_SHEET",
  tomSheet: "LEAK_TOM_SHEET",
  tomOwnedSheet: "LEAK_TOM_OWNED_SHEET",
  plainLore: "LEAK_PLAIN_LORE",
  storyInstructions: "LEAK_STORY_INSTRUCTIONS",
  memory: "LEAK_MEMORY",
  npcSecret: "LEAK_NPC",
  authorNotes: "LEAK_AUTHOR_NOTES",
  premise: "LEAK_PREMISE",
  gmThinking: "LEAK_GM_THINKING",
  gmStoryContext: "LEAK_GM_STORY_CONTEXT",
  reasoning: "LEAK_REASONING",
  gmConversation: "LEAK_GM_CONVERSATION",
  summary: "LEAK_SCENE_SUMMARY",
  apiKey: "sk-or-v1-LEAKEDKEY",
  // The campaign record (slice 3): nothing in it reaches a phone until the
  // player's view (slice 6) projects it.
  campaignSecret: "LEAK_CAMPAIGN_SECRET",
  campaignDoom: "LEAK_CAMPAIGN_DOOM",
  campaignLine: "LEAK_CAMPAIGN_LINE",
  campaignClock: "LEAK_CAMPAIGN_CLOCK",
  campaignPerson: "LEAK_CAMPAIGN_PERSON",
};

const MARA_SHEET = "MARA_SHEET_OK";
const NARRATION = "The rain stops. NARRATION_OK";

function story(): StoryData {
  return {
    story_name: "The Drowned Bell",
    premise: FORBIDDEN.premise,
    player_name: "",
    player_summary: "",
    author_notes: FORBIDDEN.authorNotes,
    memory: [FORBIDDEN.memory],
    npcs: [{ name: "Ilse", description: FORBIDDEN.npcSecret }],
    lore: [
      note("The Bell", FORBIDDEN.secretNote, { type: "secret" }),
      note("Campaign Plan", FORBIDDEN.gmPlan, { type: "gm_plan" }),
      note("Running this", FORBIDDEN.dmInstructions, { type: "dm_instructions" }),
      note("Old notes", FORBIDDEN.legacyGmNotes, { type: "gm_notes" }),
      note("Rules", FORBIDDEN.mechanics, { type: "mechanics", alwaysOn: true }),
      note("Prose style", FORBIDDEN.storyInstructions, { type: "story_instructions" }),
      note("The cellar", FORBIDDEN.hiddenLore, { type: "lore", visibility: "hidden" }),
      note("The door", FORBIDDEN.toBeRevealed, { visibility: "to_be_revealed" }),
      note("The patrol", FORBIDDEN.checkPerTurn, { visibility: "check_per_turn" }),
      note("Flagged", FORBIDDEN.secretFlag, { secrtet: true }),
      note("The town", FORBIDDEN.plainLore, { type: "lore" }),
      // Mara's real sheet, plus a hidden one and a disabled one with her title.
      note("Character: Mara", MARA_SHEET, { type: "character_sheet" }),
      note("Character: Mara", FORBIDDEN.maraHiddenSheet, { type: "character_sheet", visibility: "hidden" }),
      note("Character: Mara", FORBIDDEN.disabled, { type: "character_sheet", enabled: false }),
      // Tom's sheets, by title and by owner.
      note("Character: Tom", FORBIDDEN.tomSheet, { type: "character_sheet" }),
      note("Tom's real sheet", FORBIDDEN.tomOwnedSheet, { type: "character_sheet", ownerCouchPlayerId: "tom" }),
    ],
    scene: {
      summary: FORBIDDEN.summary,
      parts: [
        { content: "> Mara: I ring the bell.", imageUrl: "", user: true, role: "user" },
        {
          content: NARRATION,
          imageUrl: "",
          user: false,
          role: "assistant",
          gmThinking: [FORBIDDEN.gmThinking],
          gmStoryContext: FORBIDDEN.gmStoryContext,
          reasoning: FORBIDDEN.reasoning,
          gmConversation: [{ role: "assistant", content: FORBIDDEN.gmConversation }],
          choices: [{ text: "Climb the tower" }, { text: "Wait" }],
        },
      ],
    },
    multiplayer: {
      enabled: true,
      couchPlayers: [
        { id: "mara", name: "Mara", color: "#22c55e" },
        { id: "tom", name: "Tom", color: "#3b82f6" },
      ],
    },
    campaign: {
      version: 1,
      style: "mystery",
      pitch: { premise: FORBIDDEN.campaignSecret, tone: [FORBIDDEN.campaignSecret] },
      safety: {
        lines: [{ id: "saf_a", text: FORBIDDEN.campaignLine, keywords: [FORBIDDEN.campaignLine] }],
        veils: [],
      },
      factions: [{ id: "fac_a", name: FORBIDDEN.campaignSecret, goal: FORBIDDEN.campaignSecret }],
      fronts: [
        {
          id: "frt_a",
          name: FORBIDDEN.campaignDoom,
          dangers: [],
          portents: [],
          doom: FORBIDDEN.campaignDoom,
          stakes: [FORBIDDEN.campaignDoom],
          status: "active",
        },
      ],
      clocks: [
        {
          id: "clk_a",
          name: FORBIDDEN.campaignClock,
          segments: 6,
          filled: 1,
          triggers: ["scene"],
          visible: true,
          paused: false,
          crossed: [],
        },
      ],
      people: [{ npcId: "x", want: FORBIDDEN.campaignPerson, secret: FORBIDDEN.campaignPerson }],
      secrets: [
        {
          id: "sec_a",
          title: FORBIDDEN.campaignSecret,
          truth: FORBIDDEN.campaignSecret,
          keyPhrases: [],
          revealed: false,
          clues: [{ id: "clu_a", text: FORBIDDEN.campaignSecret, found: true }],
        },
      ],
      locations: [],
      endStates: [{ id: "end_a", text: FORBIDDEN.campaignSecret }],
    },
  } as unknown as StoryData;
}

function seated(): PartyHostState {
  let s = createPartyHost({
    token: TOKEN,
    cooldownMs: 15000,
    newId: (() => {
      let n = 0;
      return () => `SEATKEY${++n}X`;
    })(),
    roster: story().multiplayer!.couchPlayers,
  });
  for (const [clientId, seatId] of [["c1", "mara"], ["c2", "tom"]] as const) {
    s = handleConnect(s, clientId).state;
    s = handlePhoneMessage(s, clientId, { type: "hello", token: TOKEN }, 0).state;
    s = handlePhoneMessage(s, clientId, { type: "join", name: "", color: "", seatId }, 0).state;
  }
  // Tom has a roll pending; Mara must not see it.
  s = {
    ...s,
    requests: [
      {
        requestId: "r1",
        playerId: "tom",
        kind: "roll",
        request: { title: "TOM_ROLL", description: "", playerName: "Tom" },
      },
    ],
  };
  return s;
}

const ALLOWED_KEYS = [
  "v",
  "storyName",
  "me",
  "sheet",
  "seats",
  "spotlightHolderId",
  "cooldownMs",
  "queue",
  "turn",
  "choices",
  "requests",
  "narration",
  "join",
].sort();

describe("buildPlayerView: the redaction boundary", () => {
  const s = seated();
  const views = {
    mara: buildPlayerView(s, story(), "mara", 0),
    tom: buildPlayerView(s, story(), "tom", 0),
    lobby: buildPlayerView(s, story(), null, 0),
  };

  for (const [who, view] of Object.entries(views)) {
    it(`leaks nothing to ${who}'s phone`, () => {
      const json = JSON.stringify(view);
      for (const [what, marker] of Object.entries(FORBIDDEN)) {
        if (who === "tom" && (what === "tomSheet" || what === "tomOwnedSheet")) continue;
        expect(json, `${what} reached ${who}`).not.toContain(marker);
      }
      expect(json).not.toMatch(/sk-or-|sk-[A-Za-z0-9]{8}/);
    });

    it(`gives ${who}'s phone only the fields of a view`, () => {
      expect(Object.keys(view).sort()).toEqual(ALLOWED_KEYS);
    });
  }

  it("carries a question's intro to the phone and nothing else new", () => {
    const withQuestion: PartyHostState = {
      ...s,
      requests: [
        {
          requestId: "q1",
          playerId: "mara",
          kind: "question",
          request: {
            questions: [
              {
                question: "Where is it set?",
                intro: "INTRO_OK a sentence about the setting.",
                options: [{ label: "Paris", description: "Gaslight" }, { label: "Vienna" }],
              },
              { question: "Plain?", options: [{ label: "A" }, { label: "B" }] },
            ],
          },
        },
      ],
    };
    const view = buildPlayerView(withQuestion, story(), "mara", 0);
    expect(Object.keys(view).sort()).toEqual(ALLOWED_KEYS);
    expect(view.requests).toEqual([
      {
        requestId: "q1",
        kind: "question",
        questions: [
          {
            question: "Where is it set?",
            intro: "INTRO_OK a sentence about the setting.",
            options: [{ label: "Paris", description: "Gaslight" }, { label: "Vienna" }],
            allowCustom: true,
          },
          { question: "Plain?", options: [{ label: "A" }, { label: "B" }], allowCustom: true },
        ],
      },
    ]);
  });

  it("shows a player their own sheet, the narration and the choices", () => {
    const json = JSON.stringify(views.mara);
    expect(views.mara.sheet).toEqual({ title: "Character: Mara", content: MARA_SHEET });
    expect(json).toContain("NARRATION_OK");
    expect(views.mara.choices).toEqual(["Climb the tower", "Wait"]);
    expect(views.mara.requests).toEqual([]);
    expect(json).not.toContain("TOM_ROLL");
  });

  it("prefers the sheet a player owns over the title convention", () => {
    expect(views.tom.sheet?.content).toBe(FORBIDDEN.tomOwnedSheet);
    expect(views.tom.requests.map((r) => r.requestId)).toEqual(["r1"]);
  });

  it("tells a phone without a seat nothing but the roster and how to join", () => {
    expect(views.lobby.me).toBeNull();
    expect(views.lobby.sheet).toBeNull();
    expect(views.lobby.narration).toBe("");
    expect(views.lobby.choices).toEqual([]);
    expect(views.lobby.queue).toEqual([]);
    expect(views.lobby.join?.palette.length).toBeGreaterThan(0);
    expect(views.lobby.join?.archetypes.map((a) => a.id)).toContain("storyteller");
  });

  it("never picks a non-character_sheet note as a sheet, whatever its title", () => {
    const st = story();
    st.lore = [note("Character: Mara", FORBIDDEN.secretNote, { type: "secret" })];
    expect(findPlayerSheet(st, { id: "mara", name: "Mara" })).toBeNull();
  });

  it("gives each seat only its own seat key", () => {
    const maraKey = s.players.find((p) => p.id === "mara")!.seatKey!;
    const tomKey = s.players.find((p) => p.id === "tom")!.seatKey!;
    expect(views.mara.me?.seatKey).toBe(maraKey);
    expect(JSON.stringify(views.mara)).not.toContain(tomKey);
    expect(JSON.stringify(views.lobby)).not.toContain(maraKey);
  });
});

describe("buildPlayerView: a built-in system story (Blood & Bone)", () => {
  const starter = BLOOD_AND_BONE.starters[0].adventure.storyTemplate!;
  const bbStory = {
    ...story(),
    premise: starter.premise,
    npcs: starter.npcs,
    meters: starter.meters,
    progressTracks: starter.progressTracks,
    lore: [
      ...(starter.lore ?? []),
      note("Character: Mara", MARA_SHEET, { type: "character_sheet" }),
    ],
  } as unknown as StoryData;
  const s = seated();
  const view = buildPlayerView(s, bbStory, "mara", 0);
  const json = JSON.stringify(view);

  it("sends no rules note, no hidden pack or starter note and no GM instructions", () => {
    const lore = starter.lore ?? [];
    expect(lore.some((l) => l.visibility === "hidden")).toBe(true);
    for (const l of lore) {
      // A distinctive slice of each note's text, past its title line.
      const slice = l.content.slice(40, 100);
      expect(json, l.title).not.toContain(slice);
      expect(json, l.title).not.toContain(l.title);
    }
    expect(json).not.toContain("fledgling");
    expect(json).not.toContain("Running it");
  });

  it("sends no meters, tracks or NPC text, and still shows the player their own sheet", () => {
    expect(json).not.toContain("Slipping Mask");
    expect(json).not.toContain("Find Runa before Callum does");
    expect(json).not.toContain("Callum Reyes");
    expect(view.sheet).toEqual({ title: "Character: Mara", content: MARA_SHEET });
    expect(Object.keys(view).sort()).toEqual(ALLOWED_KEYS);
  });
});
