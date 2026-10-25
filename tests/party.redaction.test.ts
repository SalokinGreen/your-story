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
import { publicCampaignView } from "@/app/misc/campaign/publicView";

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
  judgeFinding: "LEAK_JUDGE_FINDING",
  summary: "LEAK_SCENE_SUMMARY",
  apiKey: "sk-or-v1-LEAKEDKEY",
  // The campaign record: only publicCampaignView's fields (the CAMPAIGN_OK
  // strings below) reach a phone; a canary sits in every other field.
  campaignSecret: "LEAK_CAMPAIGN_SECRET",
  campaignTruth: "LEAK_CAMPAIGN_TRUTH",
  campaignKeyPhrase: "LEAK_CAMPAIGN_KEYPHRASE",
  campaignDoom: "LEAK_CAMPAIGN_DOOM",
  campaignDanger: "LEAK_CAMPAIGN_DANGER",
  campaignImpulse: "LEAK_CAMPAIGN_IMPULSE",
  campaignPortent: "LEAK_CAMPAIGN_PORTENT",
  campaignLineKeyword: "LEAK_CAMPAIGN_LINE_KEYWORD",
  campaignClock: "LEAK_CAMPAIGN_HIDDEN_CLOCK",
  campaignCancelledClock: "LEAK_CAMPAIGN_CANCELLED_CLOCK",
  campaignOnFill: "LEAK_CAMPAIGN_ONFILL",
  campaignPerson: "LEAK_CAMPAIGN_PERSON",
  campaignVoice: "LEAK_CAMPAIGN_VOICE",
  campaignFactionGoal: "LEAK_CAMPAIGN_FACTION_GOAL",
  campaignMethods: "LEAK_CAMPAIGN_METHODS",
  campaignUnfoundClue: "LEAK_CAMPAIGN_UNFOUND_CLUE",
  campaignClueWhere: "LEAK_CAMPAIGN_CLUE_WHERE",
  campaignBeatTitle: "LEAK_CAMPAIGN_BEAT_TITLE",
  campaignBeatSummary: "LEAK_CAMPAIGN_BEAT_SUMMARY",
  campaignEnd: "LEAK_CAMPAIGN_END_STATE",
};

// What the campaign's player view is meant to show.
const CAMPAIGN_OK = {
  premise: "CAMPAIGN_PREMISE_OK",
  tone: "CAMPAIGN_TONE_OK",
  line: "CAMPAIGN_LINE_OK",
  veil: "CAMPAIGN_VEIL_OK",
  faction: "CAMPAIGN_FACTION_OK",
  front: "CAMPAIGN_FRONT_OK",
  stake: "CAMPAIGN_STAKE_OK",
  clock: "CAMPAIGN_CLOCK_OK",
  clue: "CAMPAIGN_CLUE_OK",
  location: "CAMPAIGN_LOCATION_OK",
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
          // The judge layer's private findings (plan slice 3): a phone is told
          // nothing about them, and not the draft a rewrite replaced.
          observerFlags: [
            {
              type: "secret_leak",
              severity: "major",
              detail: FORBIDDEN.judgeFinding,
              correctivePrompt: FORBIDDEN.judgeFinding,
              finding: { evidence: FORBIDDEN.judgeFinding, factIds: [], fix: FORBIDDEN.judgeFinding },
            },
          ],
          observerRewriteOriginal: { content: FORBIDDEN.judgeFinding, flag: { type: "secret_leak", severity: "major", detail: "", correctivePrompt: "" } },
          publicNotice: "revised",
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
      pitch: { premise: CAMPAIGN_OK.premise, tone: [CAMPAIGN_OK.tone] },
      safety: {
        lines: [{ id: "saf_a", text: CAMPAIGN_OK.line, keywords: [FORBIDDEN.campaignLineKeyword] }],
        veils: [{ id: "saf_b", text: CAMPAIGN_OK.veil, keywords: [FORBIDDEN.campaignLineKeyword] }],
      },
      factions: [
        {
          id: "fac_a",
          name: CAMPAIGN_OK.faction,
          goal: FORBIDDEN.campaignFactionGoal,
          methods: FORBIDDEN.campaignMethods,
        },
      ],
      fronts: [
        {
          id: "frt_a",
          name: CAMPAIGN_OK.front,
          dangers: [{ name: FORBIDDEN.campaignDanger, impulse: FORBIDDEN.campaignImpulse }],
          portents: [{ at: 2, text: FORBIDDEN.campaignPortent }],
          doom: FORBIDDEN.campaignDoom,
          stakes: [CAMPAIGN_OK.stake],
          status: "active",
        },
      ],
      clocks: [
        {
          id: "clk_a",
          name: CAMPAIGN_OK.clock,
          segments: 6,
          filled: 1,
          triggers: ["scene"],
          onFill: FORBIDDEN.campaignOnFill,
          visible: true,
          paused: false,
          crossed: [],
        },
        {
          id: "clk_h",
          name: FORBIDDEN.campaignClock,
          segments: 4,
          filled: 3,
          triggers: ["scene"],
          onFill: FORBIDDEN.campaignOnFill,
          visible: false,
          paused: false,
          crossed: [],
        },
        {
          id: "clk_c",
          name: FORBIDDEN.campaignCancelledClock,
          segments: 4,
          filled: 0,
          triggers: ["manual"],
          visible: true,
          paused: true,
          cancelled: true,
          crossed: [],
        },
      ],
      people: [
        {
          npcId: "x",
          want: FORBIDDEN.campaignPerson,
          secret: FORBIDDEN.campaignPerson,
          voice: FORBIDDEN.campaignVoice,
        },
      ],
      secrets: [
        {
          id: "sec_a",
          title: FORBIDDEN.campaignSecret,
          truth: FORBIDDEN.campaignTruth,
          keyPhrases: [FORBIDDEN.campaignKeyPhrase],
          revealed: true,
          clues: [
            { id: "clu_a", text: CAMPAIGN_OK.clue, where: FORBIDDEN.campaignClueWhere, found: true },
            { id: "clu_b", text: FORBIDDEN.campaignUnfoundClue, found: false },
          ],
        },
      ],
      locations: [{ id: "loc_a", name: CAMPAIGN_OK.location, features: [], npcIds: [] }],
      beats: {
        list: [
          { id: "bt_a", title: FORBIDDEN.campaignBeatTitle, summary: FORBIDDEN.campaignBeatSummary, status: "current" },
        ],
        currentId: "bt_a",
      },
      endStates: [{ id: "end_a", text: FORBIDDEN.campaignEnd }],
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
  "campaign",
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

  it("gives a seated phone the campaign's player view and nothing else of the record", () => {
    for (const view of [views.mara, views.tom]) {
      const json = JSON.stringify(view.campaign);
      for (const ok of Object.values(CAMPAIGN_OK)) expect(json, ok).toContain(ok);
      // The projection is exactly publicCampaignView's, no more.
      expect(view.campaign).toEqual(publicCampaignView(story().campaign!));
      // The hidden clock and the cancelled one are not listed.
      expect(view.campaign?.clocks.map((c) => c.name)).toEqual([CAMPAIGN_OK.clock]);
      expect(view.campaign?.known).toEqual([CAMPAIGN_OK.clue]);
    }
  });

  it("gives a phone without a seat no campaign, and a story without a record none", () => {
    expect(views.lobby.campaign).toBeNull();
    const bare = story();
    delete bare.campaign;
    expect(buildPlayerView(s, bare, "mara", 0).campaign).toBeNull();
    expect(buildPlayerView(s, null, "mara", 0).campaign).toBeNull();
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

describe("buildPlayerView: Fantastic Realms hero state (E1)", () => {
  // The grown hero state: conditions, scars, items, counters, the hearth.
  const frStory = {
    ...story(),
    systemState: {
      systemId: "fantastic-realms",
      sessionCount: 0,
      dedupKeys: [],
      fantasticRealms: {
        heroes: {
          mara: {
            name: "Mara",
            rewards: [],
            feats: [
              { id: "feat-1", wording: "LEAK_FEAT_WORDING", burned: true },
              {
                id: "feat-2",
                wording: "LEAK_ITEM_WORDING",
                burned: false,
                kind: "item",
                qualities: ["keen"],
                status: "broken",
              },
            ],
            conditions: [
              { word: "LEAK_CONDITION", cure: "LEAK_CURE" },
              { word: "LEAK_SCAR", scar: true },
            ],
            uses: { "feat-1:rest": 1 },
          },
        },
        partyFeats: [{ id: "party-1", wording: "LEAK_HEARTH", burned: false }],
        teamBurnsUsed: 1,
        partyUses: { "party-1:adventure": 1 },
      },
    },
  } as unknown as StoryData;
  const s = seated();

  for (const who of ["mara", "tom", null] as const) {
    it(`sends ${who ?? "the lobby"}'s phone no hero feats, conditions, scars, items, counters or hearth`, () => {
      const view = buildPlayerView(s, frStory, who, 0);
      const json = JSON.stringify(view);
      for (const marker of [
        "LEAK_FEAT_WORDING",
        "LEAK_ITEM_WORDING",
        "LEAK_CONDITION",
        "LEAK_CURE",
        "LEAK_SCAR",
        "LEAK_HEARTH",
        "teamBurnsUsed",
        "partyUses",
        "fantasticRealms",
      ]) {
        expect(json, marker).not.toContain(marker);
      }
      expect(Object.keys(view).sort()).toEqual(ALLOWED_KEYS);
    });
  }
});
