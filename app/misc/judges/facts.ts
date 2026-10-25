/**
 * Rung 0 of the judge ladder: the facts a turn's checks and judges compare the
 * prose against, each with an id, a source and a time (design 11.3).
 *
 * `collectTurnFacts(storyBefore, storyAfter, results)` is pure and cheap. It
 * lists, in a fixed order, the turn's typed tool results, the campaign
 * record's safety lines and still-hidden secrets, its clocks, and the NPCs who
 * are dead or gone. A fact that held before the turn and still holds after is
 * listed once, as "before". The character sheet joins in slice 2 with the
 * world-consistency judge, which is its first reader.
 */
import type { ClockReport } from "../campaign/clocks";
import type { Fact, FactTopic, JudgeId, JudgeStoryView, JudgeToolResult } from "./types";

/** Tool results that carry a ruling or a state change worth handing a judge. */
const FACT_TOOLS: ReadonlySet<string> = new Set([
  "formula_roll",
  "gm_roll",
  "opposed_formula",
  "npc_roll",
  "calculate",
  "action_roll",
  "feat_roll",
  "initiative_roll",
  "record_challenge_result",
  "start_challenge",
  "manage_meter",
  "manage_track",
  "award_xp",
  "take_rest",
  "end_session",
  "start_combat",
  "end_combat",
  "update_combatant_stat",
  "fate_question",
  "roll_table",
  "roll_portent",
  "campaign",
]);

/** The first line of a result's text, bounded, without the player-redacted tail. */
function resultLine(r: JudgeToolResult): string {
  const text = (r.contextForStory ?? "").trim();
  const first = text.split("\n")[0] ?? "";
  return first.length > 320 ? `${first.slice(0, 317)}...` : first;
}

function isErrorText(r: JudgeToolResult): boolean {
  const text = r.contextForStory ?? "";
  return text.startsWith("[ERROR") || text.startsWith("[State Failed");
}

export function collectTurnFacts(
  storyBefore: JudgeStoryView,
  storyAfter: JudgeStoryView,
  results: readonly JudgeToolResult[],
): Fact[] {
  const facts: Fact[] = [];
  const add = (
    kind: Fact["source"]["kind"],
    ref: string,
    when: Fact["when"],
    text: string,
    topic?: FactTopic,
    names?: string[],
  ) => {
    facts.push({
      id: `f${facts.length + 1}`,
      source: { kind, ref },
      when,
      text,
      ...(topic && { topic }),
      ...(names && names.length > 0 && { names }),
    });
  };

  // The turn's tool results, in the order they ran.
  for (const r of results) {
    if (isErrorText(r) || !FACT_TOOLS.has(r.toolName)) continue;
    const line = resultLine(r);
    if (line) add("tool", r.toolCallId, "after", line, "result");
    // A clock tick is its own fact; the line is the GM's, hidden ones included.
    const reports = (r as { clockReports?: ClockReport[] }).clockReports ?? [];
    for (const c of reports) add("tool", r.toolCallId, "after", c.line, "clock");
  }

  // The record, as the turn found it (safety and secrets) and left it (clocks).
  const recordBefore = storyBefore.campaign;
  const recordAfter = storyAfter.campaign;
  for (const kind of ["lines", "veils"] as const) {
    for (const item of recordBefore?.safety?.[kind] ?? []) {
      add(
        "record",
        item.id,
        "before",
        `${kind === "lines" ? "Line" : "Veil"}: ${item.text}`,
        kind === "lines" ? "line" : "veil",
      );
    }
  }
  for (const secret of recordBefore?.secrets ?? []) {
    if (secret.revealed) continue;
    add(
      "record",
      secret.id,
      "before",
      `Unrevealed secret "${secret.title}": ${secret.truth}`,
      "secret",
    );
  }
  for (const clock of recordAfter?.clocks ?? []) {
    if (clock.cancelled) continue;
    add(
      "record",
      clock.id,
      "after",
      `Clock "${clock.name}" ${clock.filled}/${clock.segments}${clock.paused ? " (paused)" : ""}`,
      "clock",
    );
  }

  // People who are no longer here.
  const statusBefore = new Map(
    (storyBefore.npcs ?? []).map((n) => [n.id, n.status] as const),
  );
  for (const npc of storyAfter.npcs ?? []) {
    if (npc.status !== "dead" && npc.status !== "departed") continue;
    const was = statusBefore.get(npc.id);
    add(
      "npc",
      npc.id,
      was === npc.status ? "before" : "after",
      `${npc.name} is ${npc.status}`,
      "person",
      [npc.name],
    );
  }

  // Where the record puts people (the only location link there is, design 11.3).
  const namesById = new Map(
    (storyAfter.npcs ?? []).map((n) => [n.id, n.name] as const),
  );
  for (const loc of recordAfter?.locations ?? []) {
    const here = (loc.npcIds ?? [])
      .map((id) => namesById.get(id))
      .filter((n): n is string => Boolean(n));
    if (here.length === 0) continue;
    const features = loc.features?.length ? ` (${loc.features.join("; ")})` : "";
    add(
      "record",
      loc.id,
      "after",
      `Location "${loc.name}"${features}: the record places ${here.join(", ")} here`,
      "location",
      [loc.name, ...here],
    );
  }

  // The character sheet(s), whole: the gear and conditions the narration must keep.
  for (const note of storyAfter.lore ?? []) {
    if (note.type !== "character_sheet" || note.enabled === false) continue;
    const body = (note.content ?? "").trim();
    if (!body) continue;
    add(
      "sheet",
      note.title || "Character sheet",
      "after",
      `Character sheet "${note.title}": ${body}`,
      "sheet",
    );
  }

  return facts;
}

/**
 * The fact topics each judge reads. A judge is handed only these, so a split
 * call carries less, not the same facts twice (plan, finding 20).
 */
export const JUDGE_FACT_TOPICS: Readonly<Record<JudgeId, readonly FactTopic[]>> = {
  length: ["result"],
  agency: [],
  outcome: ["result"],
  world_consistency: ["person", "location", "sheet", "result"],
  secret_leak: ["secret"],
  lines_veils: ["line", "veil"],
  oracle_gap: ["result"],
  tier_gap: [],
};

/** The facts one judge reads, in the turn's order. */
export function selectFactsFor(judgeId: JudgeId, facts: readonly Fact[]): Fact[] {
  const topics = JUDGE_FACT_TOPICS[judgeId];
  return facts.filter((f) => f.topic !== undefined && topics.includes(f.topic));
}

/**
 * The part of a story the rung-1 checks and the facts read, copied so the turn
 * can change the story after it was taken. Cheap: the campaign record, the
 * NPCs and the meters, not the scene. A failed copy returns the story's own
 * view (the checks then compare a story with itself, which finds nothing).
 */
export function snapshotJudgeView(story: JudgeStoryView): JudgeStoryView {
  try {
    return {
      npcs: structuredClone(story.npcs ?? []),
      meters: structuredClone(story.meters ?? []),
      campaign: story.campaign ? structuredClone(story.campaign) : undefined,
    };
  } catch {
    return story;
  }
}
