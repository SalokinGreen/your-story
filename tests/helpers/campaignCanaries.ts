import type { CampaignRecord } from "@/app/misc/campaign/types";

/** One unique string in every field of the record the player must never see. */
export const HIDDEN: Record<string, string> = {
  secretTitle: "CANARY_SECRET_TITLE",
  truth: "CANARY_TRUTH",
  keyPhrase: "CANARY_KEYPHRASE",
  unfoundClue: "CANARY_UNFOUND_CLUE",
  clueWhere: "CANARY_CLUE_WHERE",
  doom: "CANARY_DOOM",
  dangerName: "CANARY_DANGER_NAME",
  dangerImpulse: "CANARY_DANGER_IMPULSE",
  portent: "CANARY_PORTENT",
  hiddenClock: "CANARY_HIDDEN_CLOCK",
  cancelledClock: "CANARY_CANCELLED_CLOCK",
  onFill: "CANARY_ONFILL",
  linkId: "CANARY_LINK_ID",
  factionGoal: "CANARY_FACTION_GOAL",
  factionMethods: "CANARY_FACTION_METHODS",
  want: "CANARY_WANT",
  personSecret: "CANARY_PERSON_SECRET",
  voice: "CANARY_VOICE",
  safetyKeyword: "CANARY_SAFETY_KEYWORD",
  beatTitle: "CANARY_BEAT_TITLE",
  beatSummary: "CANARY_BEAT_SUMMARY",
  endState: "CANARY_END_STATE",
  locationNoteId: "CANARY_LOCATION_NOTE_ID",
  npcId: "CANARY_NPC_ID",
  timerId: "CANARY_TIMER_ID",
};

/** The strings the player's view is meant to carry. */
export const PUBLIC: Record<string, string> = {
  premise: "PUBLIC_PREMISE",
  tone: "PUBLIC_TONE",
  line: "PUBLIC_LINE",
  veil: "PUBLIC_VEIL",
  faction: "PUBLIC_FACTION",
  front: "PUBLIC_FRONT",
  stake: "PUBLIC_STAKE",
  clock: "PUBLIC_CLOCK",
  clue: "PUBLIC_CLUE",
  location: "PUBLIC_LOCATION",
  feature: "PUBLIC_FEATURE",
};

export function canaryCampaign(): CampaignRecord {
  return {
    version: 1,
    origin: "starter",
    style: "mystery",
    pitch: { premise: PUBLIC.premise, tone: [PUBLIC.tone] },
    safety: {
      lines: [{ id: "saf_a", text: PUBLIC.line, keywords: [HIDDEN.safetyKeyword] }],
      veils: [{ id: "saf_b", text: PUBLIC.veil, keywords: [HIDDEN.safetyKeyword] }],
    },
    factions: [
      {
        id: "fac_a",
        name: PUBLIC.faction,
        goal: HIDDEN.factionGoal,
        methods: HIDDEN.factionMethods,
        clockId: HIDDEN.linkId,
      },
    ],
    fronts: [
      {
        id: "frt_a",
        name: PUBLIC.front,
        dangers: [{ name: HIDDEN.dangerName, impulse: HIDDEN.dangerImpulse }],
        portents: [{ at: 2, text: HIDDEN.portent }],
        doom: HIDDEN.doom,
        stakes: [PUBLIC.stake],
        clockId: HIDDEN.linkId,
        status: "doomed",
      },
    ],
    clocks: [
      {
        id: "clk_a",
        name: PUBLIC.clock,
        segments: 6,
        filled: 2,
        triggers: ["scene"],
        link: { kind: "front", id: "frt_a" },
        onFill: HIDDEN.onFill,
        visible: true,
        paused: false,
        crossed: [2],
        migratedFromTimerId: HIDDEN.timerId,
      },
      {
        id: "clk_h",
        name: HIDDEN.hiddenClock,
        segments: 4,
        filled: 3,
        triggers: ["scene"],
        onFill: HIDDEN.onFill,
        visible: false,
        paused: false,
        crossed: [],
      },
      {
        id: "clk_c",
        name: HIDDEN.cancelledClock,
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
      { npcId: HIDDEN.npcId, want: HIDDEN.want, secret: HIDDEN.personSecret, voice: HIDDEN.voice },
    ],
    secrets: [
      {
        id: "sec_a",
        title: HIDDEN.secretTitle,
        truth: HIDDEN.truth,
        keyPhrases: [HIDDEN.keyPhrase],
        revealed: true,
        clues: [
          { id: "clu_a", text: PUBLIC.clue, where: HIDDEN.clueWhere, found: true },
          { id: "clu_b", text: HIDDEN.unfoundClue, found: false },
        ],
      },
    ],
    locations: [
      {
        id: "loc_a",
        name: PUBLIC.location,
        features: [PUBLIC.feature],
        noteId: HIDDEN.locationNoteId,
        npcIds: [HIDDEN.npcId],
      },
    ],
    beats: {
      list: [{ id: "bt_a", title: HIDDEN.beatTitle, summary: HIDDEN.beatSummary, status: "current" }],
      currentId: "bt_a",
    },
    endStates: [{ id: "end_a", text: HIDDEN.endState }],
  };
}
