// Matches lore-note titles / NPC names (and their aliases) inside rendered
// story prose, so they can be highlighted (colored by note type) and clicked
// to open that note - see story.tsx's prettify() for where this is consumed.
import { StoryData, LoreType } from "./structs";

export interface MentionCandidate {
  kind: "lore" | "npc";
  id: string; // lore -> StoryLore.title (the identifier used throughout lore.tsx), npc -> NPC.id
  label: string;
  terms: string[];
  colorClass: string;
}

export interface MentionMatcher {
  regex: RegExp;
  termMap: Map<string, MentionCandidate>;
}

// Mirrors lore.tsx's TYPE_CONFIG colors so a highlighted mention matches the
// color the note uses everywhere else in the UI. Note types are categories,
// not meanings, so there are three groups on the theme's tokens: what the
// player knows (accent), the GM's own material (muted) and secrets (warning). Note types are categories,
// not meanings, so there are three groups on the theme's tokens: what the
// player knows (accent), the GM's own material (muted) and secrets (warning). Note types are categories,
// not meanings, so there are three groups on the theme's tokens: what the
// player knows (accent), the GM's own material (muted) and secrets (warning). Note types are categories,
// not meanings, so there are three groups on the theme's tokens: what the
// player knows (accent), the GM's own material (muted) and secrets (warning). Note types are categories,
// not meanings, so there are three groups on the theme's tokens: what the
// player knows (accent), the GM's own material (muted) and secrets (warning). Note types are categories,
// not meanings, so there are three groups on the theme's tokens: what the
// player knows (accent), the GM's own material (muted) and secrets (warning). Note types are categories,
// not meanings, so there are three groups on the theme's tokens: what the
// player knows (accent), the GM's own material (muted) and secrets (warning). Note types are categories,
// not meanings, so there are three groups on the theme's tokens: what the
// player knows (accent), the GM's own material (muted) and secrets (warning). Note types are categories,
// not meanings, so there are three groups on the theme's tokens: what the
// player knows (accent), the GM's own material (muted) and secrets (warning). Note types are categories,
// not meanings, so there are three groups on the theme's tokens: what the
// player knows (accent), the GM's own material (muted) and secrets (warning).
const LORE_TYPE_MENTION_COLORS: Record<string, string> = {
  character_sheet: "text-ys-accent",
  npc: "text-ys-accent",
  item: "text-ys-accent",
  location: "text-ys-accent",
  faction: "text-ys-accent",
  event: "text-ys-accent",
  lore: "text-ys-accent",
  gm_notes: "text-ys-muted",
  mechanics: "text-ys-muted",
  dm_instructions: "text-ys-muted",
  story_instructions: "text-ys-muted",
  summary_instructions: "text-ys-muted",
  secret: "text-ys-warning",
};

// NPC records have no `type` field (see structs.ts), so they get one fixed
// color rather than TYPE_CONFIG's per-type palette - reusing the legacy
// "npc" lore-type color for visual continuity.
const NPC_MENTION_COLOR = "text-ys-accent";

export function buildMentionCandidates(storyData: StoryData): MentionCandidate[] {
  const candidates: MentionCandidate[] = [];

  for (const lore of storyData.lore || []) {
    // Never highlight a secret or disabled note's title - that would spoil
    // or reference something the player hasn't discovered/isn't relevant.
    if (lore.secrtet || lore.enabled === false) continue;
    if (!lore.title?.trim()) continue;
    const type: LoreType = lore.type || "lore";
    candidates.push({
      kind: "lore",
      id: lore.title,
      label: lore.title,
      terms: [lore.title, ...(lore.aliases || [])].filter((t) => t?.trim()),
      colorClass: LORE_TYPE_MENTION_COLORS[type] || LORE_TYPE_MENTION_COLORS.lore,
    });
  }

  for (const npc of storyData.npcs || []) {
    if (!npc.name?.trim()) continue;
    candidates.push({
      kind: "npc",
      id: npc.id,
      label: npc.name,
      terms: [npc.name, ...(npc.aliases || [])].filter((t) => t?.trim()),
      colorClass: NPC_MENTION_COLOR,
    });
  }

  return candidates;
}

function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildMentionMatcher(
  candidates: MentionCandidate[],
): MentionMatcher | null {
  const termMap = new Map<string, MentionCandidate>();
  const seenKeys = new Set<string>();
  const ambiguousKeys = new Set<string>();
  const terms: string[] = [];

  for (const candidate of candidates) {
    for (const rawTerm of candidate.terms) {
      const term = rawTerm.trim();
      if (term.length < 2) continue; // skip single-char terms - too noisy to highlight
      const key = term.toLowerCase();
      if (seenKeys.has(key)) {
        // Same term claimed by more than one note/NPC - too ambiguous to
        // link reliably, so drop it from matching entirely.
        ambiguousKeys.add(key);
        continue;
      }
      seenKeys.add(key);
      termMap.set(key, candidate);
      terms.push(term);
    }
  }

  const usableTerms = terms.filter((t) => !ambiguousKeys.has(t.toLowerCase()));
  for (const key of ambiguousKeys) termMap.delete(key);
  if (usableTerms.length === 0) return null;

  // Longest-first so "Bob Smith" matches whole rather than just "Bob".
  usableTerms.sort((a, b) => b.length - a.length);
  const pattern = usableTerms.map(escapeRegExp).join("|");
  const regex = new RegExp(`\\b(?:${pattern})\\b`, "gi");
  return { regex, termMap };
}

export function splitTextWithMentions(
  text: string,
  matcher: MentionMatcher,
): Array<{ text: string; mention?: MentionCandidate }> {
  const { regex, termMap } = matcher;
  regex.lastIndex = 0;
  const result: Array<{ text: string; mention?: MentionCandidate }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text))) {
    if (match.index > lastIndex) {
      result.push({ text: text.slice(lastIndex, match.index) });
    }
    const candidate = termMap.get(match[0].toLowerCase());
    result.push(candidate ? { text: match[0], mention: candidate } : { text: match[0] });
    lastIndex = match.index + match[0].length;
    if (match[0].length === 0) regex.lastIndex++;
  }
  if (lastIndex < text.length) {
    result.push({ text: text.slice(lastIndex) });
  }
  return result.length ? result : [{ text }];
}

/**
 * The ids of the NPCs a passage names (by name or alias, the same matching
 * that highlights them in the prose), in order of first mention. The
 * Illustrate this button uses it to say who is in the picture.
 */
export function findMentionedNpcIds(storyData: StoryData, text: string): string[] {
  const npcCandidates = buildMentionCandidates(storyData).filter(
    (c) => c.kind === "npc",
  );
  const matcher = buildMentionMatcher(npcCandidates);
  if (!matcher) return [];
  const ids: string[] = [];
  for (const segment of splitTextWithMentions(text, matcher)) {
    const id = segment.mention?.id;
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}
