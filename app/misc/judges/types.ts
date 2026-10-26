/**
 * Shared shapes for the judge layer, version 2 (docs/judge-layer-v2-design.md,
 * plan slice 1). Rung 0 is the facts, rung 1 the deterministic checks, rung 2
 * the re-ask. Nothing here calls a model.
 */
import type { ObserverFlag, StoryData } from "../structs";

/** What a turn's checks read of a story: a StoryData satisfies it, a snapshot is cheaper. */
export type JudgeStoryView = Pick<StoryData, "npcs" | "meters" | "campaign"> &
  Partial<Pick<StoryData, "multiplayer" | "systemState" | "lore">>;

/** The slice of a GMToolResult the checks read. */
export interface JudgeToolResult {
  toolName: string;
  toolCallId: string;
  success: boolean;
  result?: unknown;
  contextForStory?: string;
}

export type FactSourceKind = "tool" | "record" | "sheet" | "npc";

/**
 * What a fact is about, so each judge is handed only the kinds it reads
 * (`selectFactsFor`, plan "Revised after Codex's review", finding 20).
 */
export type FactTopic =
  | "result"
  | "clock"
  | "line"
  | "veil"
  | "secret"
  | "person"
  | "location"
  | "sheet";

/** A fact with provenance (design 11.3). Ids are `f1..fn` per turn. */
export interface Fact {
  id: string;
  source: { kind: FactSourceKind; ref: string };
  /** Whether it held before the turn or after it. */
  when: "before" | "after";
  text: string;
  topic?: FactTopic;
  /** Names the narration can use for what the fact is about (a person, a place). */
  names?: string[];
}

/** The eight rung-3 judges that share one call (design section 3). */
export type JudgeId =
  | "length"
  | "agency"
  | "outcome"
  | "world_consistency"
  | "secret_leak"
  | "lines_veils"
  | "oracle_gap"
  | "tier_gap";

export type JudgeSeverity = "none" | "minor" | "major" | "unknown";

/** One judge's answer (plan, finding 13). `unknown` means: no flag, a Debug Logs line. */
export interface JudgeVerdict {
  severity: JudgeSeverity;
  /** A quote from the narration (the player's line, for the tier judge). */
  evidence: string;
  /** Ids of facts the verdict rests on; every one must exist in the turn's facts. */
  factIds: string[];
  /** One sentence: what to change. */
  fix: string;
}

export type Rung1Check =
  | "event_contract"
  | "departed_person"
  | "line"
  | "secret_phrase"
  | "pacing_clock"
  | "pacing_spotlight"
  | "repeated_phrase"
  | "unrolled_name";

export interface Rung1Hit {
  check: Rung1Check;
  /** Backed by a tool result or a literal match; only these may re-ask. */
  verified: boolean;
  evidence: string;
  factIds: string[];
  /** The message to send the GM, when this hit may be fixed inside the turn. */
  reask?: string;
  /** True when the re-ask is answered with new prose that replaces the draft. */
  replacesProse?: boolean;
  /** The contract that fired, for an event-contract hit. */
  contractId?: string;
  /** A note for the GM's next live block (decision 235), for the pacing checks. */
  note?: string;
}

/** What an event contract's `expects` answers. */
export type ExpectResult =
  | { ok: true }
  | {
      ok: false;
      evidence: string;
      /** Two triggers that owe the same thing share a key, so one hit is made. */
      key?: string;
      /** A real mismatch that asking the GM could only make worse: flag it, never re-ask. */
      flagOnly?: boolean;
    };

/** What a contract reads: the trigger, the turn's results and the story after it. */
export interface ContractTurn {
  trigger: JudgeToolResult;
  results: readonly JudgeToolResult[];
  storyAfter: JudgeStoryView;
}

/**
 * A checkable promise a system's rules make about a turn (design 11.2): when a
 * tool result of this type appears, the turn must contain something else. Only
 * what a tool result can prove belongs here.
 */
export interface EventContract {
  id: string;
  when: {
    tool: string;
    resultType: string;
    /** Narrows the trigger (a hit tier, a named target). */
    require?: (result: unknown) => boolean;
  };
  expects: (turn: ContractTurn) => ExpectResult;
  /** The message that names the exact fix. Called only after `expects` failed. */
  reask: (turn: ContractTurn, failure: Extract<ExpectResult, { ok: false }>) => string;
}

/**
 * A finding both judges agreed on, with the facts the rewrite is handed
 * (judges/confirm.ts `rewriterFactsFor`). The facts here are the safe subset:
 * never a secret's truth, a hidden clock or a hidden roll.
 */
export interface ConfirmedFinding {
  flag: ObserverFlag;
  judge: JudgeId;
  /** The quote from the narration both judges pointed at. */
  evidence: string;
  /** The judge's fix sentence; empty for a finding that keeps none. */
  fix: string;
  facts: Fact[];
}
