/**
 * The campaign brief: what the GM sees of the record every turn, in the live
 * block (the cache rule: anything per-turn goes there). Built in the order of
 * design 14.5 and stopped at about `budgetTokens`; whatever does not fit is
 * named in one line so the GM knows to `campaign read` it.
 *
 * The GM is the reader, so secrets appear here as titles with their clue
 * counts, never their truth, to keep the brief short. The narrator never sees
 * the brief (slice 2 builds its own context).
 */

import { estimateTokens } from "../tokenCounter";
import type { StoryData } from "../structs";
import { effectivePortents, frontForClock } from "./clocks";
import type { CampaignRecord, Clock } from "./types";

export const CAMPAIGN_BRIEF_BUDGET_TOKENS = 800;

/** The next portent a clock has not reached yet, for the brief. */
function nextPortent(record: CampaignRecord, clock: Clock): string | undefined {
  const front = frontForClock(record, clock);
  if (!front) return undefined;
  return effectivePortents(front, clock.segments).find(
    (p) => p.at > clock.filled && !clock.crossed.includes(p.at),
  )?.text;
}

function clockLine(record: CampaignRecord, c: Clock): string {
  const flags: string[] = [];
  if (!c.visible) flags.push("hidden");
  if (c.paused) flags.push("paused");
  const trig = c.triggers.join("/");
  let line = `- ${c.name} ${c.filled}/${c.segments}`;
  if (flags.length) line += ` (${flags.join(", ")})`;
  line += ` [${trig}]`;
  const next = nextPortent(record, c);
  if (next) line += `; next: ${next}`;
  return line;
}

/** People "here": those linked to a location the latest scene names. */
function peopleHere(story: StoryData, record: CampaignRecord): string[] {
  const parts = story.scene?.parts ?? [];
  const last = parts.length > 0 ? parts[parts.length - 1] : undefined;
  const sceneText = (typeof last?.content === "string" ? last.content : "").toLowerCase();
  const out: string[] = [];
  if (!sceneText) return out;
  const npcs = story.npcs ?? [];
  const ids = new Set<string>();
  for (const loc of record.locations) {
    if (!loc.name || !sceneText.includes(loc.name.toLowerCase())) continue;
    for (const id of loc.npcIds) ids.add(id);
    for (const n of npcs) {
      if (n.lastSeen && n.lastSeen.toLowerCase().includes(loc.name.toLowerCase())) ids.add(n.id);
    }
  }
  for (const id of ids) {
    const p = record.people.find((x) => x.npcId === id);
    const npc = npcs.find((n) => n.id === id);
    if (!p?.want || !npc) continue;
    out.push(`- ${npc.name}: wants ${p.want}`);
  }
  return out;
}

interface Group {
  noun: string;
  lines: string[];
}

/**
 * The brief, or "" when the record has nothing to say. Safety (lines and
 * veils) and the style/tone line are always whole; the rest is added in
 * priority order until the budget would be passed.
 */
export function formatCampaignBrief(
  story: StoryData,
  budgetTokens: number = CAMPAIGN_BRIEF_BUDGET_TOKENS,
): string {
  const record = story.campaign;
  if (!record) return "";

  const head: string[] = ["## 🎭 CAMPAIGN (read any part in full with the campaign tool)"];

  // 1. Safety: always whole.
  const safety = record.safety;
  if (safety && safety.lines.length > 0) {
    head.push(`Lines (never on screen): ${safety.lines.map((l) => l.text).join("; ")}`);
  }
  if (safety && safety.veils.length > 0) {
    head.push(`Veils (happen off screen): ${safety.veils.map((v) => v.text).join("; ")}`);
  }

  // 2. Style and tone.
  const styleBits: string[] = [];
  if (record.style) styleBits.push(record.style.replace(/_/g, " "));
  if (record.pitch && record.pitch.tone.length > 0) styleBits.push(record.pitch.tone.join(", "));
  if (styleBits.length > 0) head.push(`Style: ${styleBits.join(" - ")}`);

  const groups: Group[] = [];

  // 3. Clocks, nearest to full first. A full clock has already said its fate
  // in the tick result of the turn it filled, so it is not a line of its own:
  // the filled ones go in one compact line at the very end (step 8), which is
  // the first thing the budget drops.
  const live = record.clocks.filter((c) => !c.cancelled);
  const clocks = live
    .filter((c) => c.filled < c.segments)
    .sort((a, b) => b.filled / b.segments - a.filled / a.segments);
  groups.push({ noun: "clocks", lines: clocks.map((c) => clockLine(record, c)) });

  // 4. The current beat.
  const beat = record.beats?.list.find((b) => b.id === record.beats?.currentId);
  groups.push({
    noun: "beats",
    lines: beat ? [`Current beat: ${beat.title} - ${beat.summary}`] : [],
  });

  // 5. Unrevealed secrets, fewest clues found first.
  const secrets = record.secrets
    .filter((s) => !s.revealed)
    .slice()
    .sort(
      (a, b) =>
        a.clues.filter((c) => c.found).length - b.clues.filter((c) => c.found).length,
    );
  groups.push({
    noun: "secrets",
    lines: secrets.map(
      (s) => `- ${s.title}: ${s.clues.filter((c) => c.found).length} of ${s.clues.length} clues found`,
    ),
  });

  // 6. Stakes questions, from fronts still in play.
  const stakes: string[] = [];
  for (const f of record.fronts) {
    if (f.status !== "active") continue;
    for (const q of f.stakes) stakes.push(`- ${q}`);
  }
  groups.push({ noun: "stakes questions", lines: stakes });

  // 7. The people here.
  groups.push({ noun: "people", lines: peopleHere(story, record) });

  // 8. Clocks already full, one line, last.
  const filled = live.filter((c) => c.filled >= c.segments);
  groups.push({
    noun: "filled clocks",
    lines: filled.length > 0 ? [`Filled (cancel one to clear it): ${filled.map((c) => c.name).join(", ")}`] : [],
  });

  const used = (lines: string[]) => estimateTokens(lines.join("\n"));
  const out = [...head];
  const reserve = 24; // the "(+N ..., read with campaign)" line
  let overflow = false;
  const omitted: string[] = [];
  for (const g of groups) {
    if (g.lines.length === 0) continue;
    let heading = "";
    if (g.noun === "clocks") heading = "Clocks (nearest to full first; the engine ticks miss/scene/rest/session ones on those events, [manual] ones move only when you tick):";
    if (g.noun === "secrets") heading = "Secrets not yet revealed (read one for its truth):";
    if (g.noun === "stakes questions") heading = "Stakes questions:";
    if (g.noun === "people") heading = "People here:";
    let shown = 0;
    for (const line of g.lines) {
      if (overflow) break;
      const add = shown === 0 && heading ? [heading, line] : [line];
      if (used([...out, ...add]) + reserve > budgetTokens) {
        overflow = true;
        break;
      }
      out.push(...add);
      shown++;
    }
    if (shown < g.lines.length) {
      omitted.push(`+${g.lines.length - shown} ${g.noun}`);
      overflow = true;
    }
  }
  if (omitted.length > 0) out.push(`(${omitted.join(", ")}, read with campaign)`);

  // Nothing but the header: say nothing.
  if (out.length === 1) return "";
  return out.join("\n");
}
