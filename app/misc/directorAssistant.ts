/**
 * Director-layer spotlight tracking: a dedicated LLM side-call that reads
 * one completed turn and judges which active story threads and tracked NPCs
 * meaningfully got the spotlight - the character/thread equivalent of
 * couch-player spotlight tracking (couchPlayerFocus in structs.ts), which
 * only ever covered players, not narrative elements.
 *
 * Same rationale and shape as memoryAgent.ts: a focused, single-purpose pass
 * taken off the GM's own tool-calling loop, called once per accepted turn
 * from generation.ts - gated there to only fire on scene increments (the
 * same cadence AGMTState.tension/chaosFactor already update at), not every
 * turn. Fails open on any error: an infra failure just means the spotlight
 * ledger doesn't update this scene, never blocks the turn.
 *
 * This is deliberately advisory-only, mirroring the "LLM proposes,
 * deterministic engine disposes" split every other Director-layer mechanism
 * already follows (selectDirectorMove, H7's reasoning-tier floor): this
 * module only judges what already happened and updates a neglect ledger.
 * selectDirectorMove is the sole thing that ever decides which move fires;
 * this ledger just gives it a better-informed pick when it already needed to
 * choose a thread/NPC target, in place of the arbitrary activeThreads[0]/
 * first-allied-NPC picks it used before.
 */

import { StoryData } from "./structs";
import { getCustomModelIfUUID } from "./user_settings";

const SYSTEM_PROMPT = `You are the spotlight-tracking layer for an interactive story's AI game master. Read one completed turn (the player's action and the GM's narration) plus a list of the story's currently active plot threads and tracked NPCs.

Decide which threads and NPCs MEANINGFULLY got the spotlight this turn - their situation directly advanced, was focused on, or drove the scene. Do not count a thread or NPC just because their name was mentioned in passing or referenced briefly.

Most turns spotlight zero or one thread/NPC - that is normal, not a failure. Only list ones from the provided lists, using their exact title/name as given.

Respond with ONLY a JSON object, no other text:
{"threads": ["<exact thread title>", ...], "npcs": ["<exact NPC name>", ...]}
Return empty arrays if nothing on the lists meaningfully advanced this turn.`;

export interface DirectorAssistantApiOptions {
  model: string;
  token: string | null;
  openRouterKey?: string;
  deepseekKey?: string;
  googleKey?: string;
  mistralKey?: string;
  deepinfraKey?: string;
  abortSignal?: AbortSignal;
  /** Optional override from layerSettings.ts's director assistant model/effort override - unset preserves prior behavior of never sending this field. */
  reasoningEffort?: string;
}

export interface DirectorAssistantResult {
  ran: boolean;
  spotlightedThreadIds: string[];
  spotlightedNpcNames: string[];
}

interface SpotlightJudgment {
  threads: string[];
  npcs: string[];
}

/** Strips a ```json ... ``` fence if present and parses the first {...} object. */
function extractJudgment(content: string): SpotlightJudgment | null {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : content;
  const objectMatch = candidate.match(/\{[\s\S]*\}/);
  if (!objectMatch) return null;

  try {
    const parsed = JSON.parse(objectMatch[0]);
    if (!parsed || typeof parsed !== "object") return null;
    const threads = Array.isArray(parsed.threads)
      ? parsed.threads.filter((t: unknown): t is string => typeof t === "string")
      : [];
    const npcs = Array.isArray(parsed.npcs)
      ? parsed.npcs.filter((n: unknown): n is string => typeof n === "string")
      : [];
    return { threads, npcs };
  } catch {
    return null;
  }
}

async function callDirectorAssistantApi(
  narration: string,
  playerChoice: string,
  threadTitles: string[],
  npcNames: string[],
  apiOptions: DirectorAssistantApiOptions
): Promise<SpotlightJudgment | null> {
  const user = `Active threads:\n${
    threadTitles.length ? threadTitles.map((t) => `- ${t}`).join("\n") : "(none)"
  }\n\nTracked NPCs:\n${
    npcNames.length ? npcNames.map((n) => `- ${n}`).join("\n") : "(none)"
  }\n\nPlayer's action:\n"""\n${
    playerChoice.trim() || "(none - opening scene)"
  }\n"""\n\nGM's narration:\n"""\n${narration.trim()}\n"""`;

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiOptions.token}`,
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: user },
        ],
        model: apiOptions.model,
        maxTokens: 200,
        temperature: 0.2,
        openRouterKey: apiOptions.openRouterKey,
        deepseekKey: apiOptions.deepseekKey,
        googleKey: apiOptions.googleKey,
        mistralKey: apiOptions.mistralKey,
        deepinfraKey: apiOptions.deepinfraKey,
        customModel: getCustomModelIfUUID(apiOptions.model),
        reasoningEffort: apiOptions.reasoningEffort,
      }),
      signal: apiOptions.abortSignal,
    });

    if (!response.ok) return null;

    const data = await response.json();
    const content = (data.content || "").trim();
    if (!content) return null;

    return extractJudgment(content);
  } catch {
    return null;
  }
}

/**
 * Reviews the just-finished turn and updates storyData.directorAssistant's
 * spotlight ledger in place: every active thread/NPC's neglect counter goes
 * up by 1, then whichever ones the model judged spotlighted this turn reset
 * to 0. No-op (no API call) when there are no active threads and no tracked
 * NPCs to judge - same "no data, no call" posture as selectDirectorMove's
 * spotlight_tag move. Fails open on any API error: the ledger simply doesn't
 * update this scene, never blocks the turn.
 */
export async function runDirectorAssistant(
  storyData: StoryData,
  narration: string,
  playerChoice: string,
  apiOptions: DirectorAssistantApiOptions
): Promise<DirectorAssistantResult> {
  const activeThreads = (storyData.threads || []).filter(
    (t) => t.status === "active"
  );
  const aliveNpcs = (storyData.npcs || []).filter((n) => n.status === "alive");

  if (activeThreads.length === 0 && aliveNpcs.length === 0) {
    return { ran: false, spotlightedThreadIds: [], spotlightedNpcNames: [] };
  }
  if (!narration.trim()) {
    return { ran: false, spotlightedThreadIds: [], spotlightedNpcNames: [] };
  }

  const threadTitles = activeThreads.map((t) => t.title);
  const npcNames = aliveNpcs.map((n) => n.name);

  const judgment = await callDirectorAssistantApi(
    narration,
    playerChoice,
    threadTitles,
    npcNames,
    apiOptions
  );
  if (judgment === null) {
    return { ran: false, spotlightedThreadIds: [], spotlightedNpcNames: [] };
  }

  const spotlightedTitles = new Set(
    judgment.threads.map((t) => t.trim().toLowerCase())
  );
  const spotlightedNames = new Set(
    judgment.npcs.map((n) => n.trim().toLowerCase())
  );

  storyData.directorAssistant = storyData.directorAssistant || {};
  storyData.directorAssistant.threadSpotlight =
    storyData.directorAssistant.threadSpotlight || {};
  storyData.directorAssistant.npcSpotlight =
    storyData.directorAssistant.npcSpotlight || {};

  const spotlightedThreadIds: string[] = [];
  for (const thread of activeThreads) {
    const spotlighted = spotlightedTitles.has(thread.title.trim().toLowerCase());
    storyData.directorAssistant.threadSpotlight[thread.id] = spotlighted
      ? 0
      : (storyData.directorAssistant.threadSpotlight[thread.id] ?? 0) + 1;
    if (spotlighted) spotlightedThreadIds.push(thread.id);
  }

  const spotlightedNpcNames: string[] = [];
  for (const npc of aliveNpcs) {
    const spotlighted = spotlightedNames.has(npc.name.trim().toLowerCase());
    storyData.directorAssistant.npcSpotlight[npc.name] = spotlighted
      ? 0
      : (storyData.directorAssistant.npcSpotlight[npc.name] ?? 0) + 1;
    if (spotlighted) spotlightedNpcNames.push(npc.name);
  }

  return { ran: true, spotlightedThreadIds, spotlightedNpcNames };
}
