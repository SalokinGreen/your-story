/**
 * The measurement harness behind docs/token-savings-design.md section 2
 * (token-savings plan, slice 1): a deterministic fixture story, a real
 * `generateStoryTurn` driven against a recording `global.fetch`, and the
 * numbers the design cares about - what each GM round is sent, how much of a
 * request two consecutive turns share byte for byte, and how the history the
 * GM is sent compares with what the window counted.
 *
 * Nothing here touches a provider or a key: the scripted replies come from
 * helpers/mockGMFetch.ts. No Math.random and no Date.now, so a fixture and
 * every number measured on it are identical on every run.
 */
import { generateStoryTurn, type GenerationOptions } from "@/app/misc/generation";
import { estimateTokens } from "@/app/misc/tokenCounter";
import type {
  GMConversationMessage,
  ScenePart,
  StoryData,
  StoryLore,
} from "@/app/misc/structs";
import { createMockGMFetch, type ScriptedGMRound } from "./mockGMFetch";

export interface FixtureOptions {
  priorTurns: number; // 16 in the design
  /** null = prose-only history; 1 = a note read every turn; 4 = every fourth turn. */
  readEveryNthTurn: number | null;
  noteTokens: number; // 2,000 per on-demand note
  pinned: { dmInstructions: number; characterSheet: number; plan: number }; // tokens
  memories: number;
  npcs: number;
}

/** The design's story (section 2): 16 turns, 2k notes, a 1.2k sheet, 1.5k DM notes, a 1k plan. */
export const DESIGN_FIXTURE: FixtureOptions = {
  priorTurns: 16,
  readEveryNthTurn: 4,
  noteTokens: 2000,
  pinned: { dmInstructions: 1500, characterSheet: 1200, plan: 1000 },
  memories: 27,
  npcs: 6,
};

/** How many on-demand notes the fixture carries; a read cycles through them. */
export const FIXTURE_NOTE_COUNT = 6;

/**
 * js-tiktoken loads lazily and estimateTokens falls back to chars/4 until it
 * has (tokenCounter.ts), which would make a measurement depend on timing. Wait
 * for the real encoder before measuring anything.
 */
export async function warmTokenizer(): Promise<void> {
  const probe = "hello hello hello hello"; // 4 tokens in cl100k; 6 by chars/4
  for (let i = 0; i < 200; i++) {
    if (estimateTokens(probe) === 4) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("turnHarness: the cl100k tokenizer never finished loading");
}

// ---- deterministic text ----------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = (
  "lantern harbour ledger whisper copper bridge market rumour smoke velvet " +
  "cellar thorn orchard signal coast window iron promise garden ember tavern " +
  "river quiet clerk candle stair weather debt border letter shadow salt " +
  "wagon bell guild mirror courier cinder thread fountain ash ridge toll vow"
).split(" ");

/** About `tokens` tokens of seeded, repeatable prose (never fewer). */
export function seededText(tokens: number, seed: number): string {
  const rand = mulberry32(seed);
  const words: string[] = [];
  let text = "";
  while (estimateTokens(text) < tokens) {
    for (let i = 0; i < 20; i++) {
      words.push(WORDS[Math.floor(rand() * WORDS.length)]);
    }
    text = words.join(" ");
  }
  return text;
}

// ---- the fixture story -----------------------------------------------------

function note(
  title: string,
  type: StoryLore["type"],
  content: string,
): StoryLore {
  return { id: `note-${title}`, title, content, type, enabled: true } as unknown as StoryLore;
}

export function fixtureNoteTitle(n: number): string {
  return `Fixture Note ${(n % FIXTURE_NOTE_COUNT) + 1}`;
}

function toolCall(id: string, name: string, args: object) {
  return {
    id,
    type: "function" as const,
    function: { name, arguments: JSON.stringify(args) },
  };
}

/** A deterministic story shaped like the design's measurement story. */
export function buildFixtureStory(o: FixtureOptions): StoryData {
  const lore: StoryLore[] = [
    note("DM Instructions", "dm_instructions", seededText(o.pinned.dmInstructions, 11)),
    note("Character: Mira", "character_sheet", seededText(o.pinned.characterSheet, 12)),
    note("Campaign Plan", "gm_plan", seededText(o.pinned.plan, 13)),
    note("Rules", "mechanics", seededText(300, 14)),
  ];
  for (let n = 0; n < FIXTURE_NOTE_COUNT; n++) {
    lore.push(
      note(fixtureNoteTitle(n), n % 2 === 0 ? "location" : "npc", seededText(o.noteTokens, 100 + n)),
    );
  }

  const parts: ScenePart[] = [];
  let reads = 0;
  for (let t = 0; t < o.priorTurns; t++) {
    parts.push({
      content: `> I do thing number ${t + 1} with some care.`,
      imageUrl: "",
      user: true,
      role: "user",
      choices: [],
    } as unknown as ScenePart);

    const prose = seededText(150, 1000 + t);
    const thinking = `<thinking>\n${seededText(120, 2000 + t)}\n</thinking>`;
    const reading =
      o.readEveryNthTurn !== null && (t + 1) % o.readEveryNthTurn === 0;
    const conversation: GMConversationMessage[] = [];
    if (reading) {
      const title = fixtureNoteTitle(reads++);
      const id = `call_fixture_${t}`;
      conversation.push({
        role: "assistant",
        content: thinking,
        tool_calls: [toolCall(id, "read_notes", { titles: [title] })],
      });
      conversation.push({
        role: "tool",
        content: `## ${title}\n\n${seededText(o.noteTokens, 3000 + t)}`,
        tool_call_id: id,
      } as GMConversationMessage);
      conversation.push({ role: "assistant", content: prose });
    } else {
      conversation.push({ role: "assistant", content: `${thinking}\n${prose}` });
    }
    parts.push({
      content: prose,
      imageUrl: "",
      user: false,
      role: "assistant",
      choices: [],
      gmConversation: conversation,
    } as unknown as ScenePart);
  }

  const npcs = [];
  for (let n = 0; n < o.npcs; n++) {
    npcs.push({
      id: `npc-${n}`,
      name: `Fixture Person ${n + 1}`,
      description: seededText(30, 400 + n),
      role: "Contact",
      status: "alive",
      relationship: "Acquaintance",
      attitude: "neutral",
      createdAt: 0,
    });
  }

  const memory = [];
  for (let n = 0; n < o.memories; n++) {
    memory.push({
      content: seededText(25, 500 + n),
      timestamp: 1000 + n,
      importance: 3,
    });
  }

  return {
    story_name: "Fixture Story",
    premise: "A fixture premise",
    player_name: "Mira",
    player_summary: "A careful courier",
    intro: "Intro",
    points: 0,
    earnedPointsFromQuests: [],
    earnedPointsFromChapters: [],
    currentChapter: 0,
    max_chapters: 10,
    scene: { parts },
    chapters: [],
    quests: [],
    stats: [],
    resources: [],
    inventory: [],
    achievements: [],
    lore,
    memory,
    momentum: 0,
    maxMomentum: 10,
    relationships: [],
    rpgSystem: "3d6",
    abilities: [],
    level: 1,
    upgradesSpent: 0,
    conditions: [],
    npcs,
  } as unknown as StoryData;
}

// ---- recording a turn ------------------------------------------------------

export interface RecordedRequest {
  url: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  /** Tokens of the whole request as sent: messages plus the tool list. */
  tokens: number;
  /** Tokens of the messages alone. */
  messageTokens: number;
}

const BASE_OPTIONS: GenerationOptions = {
  storyModel: "test-model",
  toolsModel: "test-model",
  choicesModel: "test-model",
  enableTools: true,
  skipChoices: true,
};

/** Scripts a round that reads fixture note `n` (3 of them make the design's turn). */
export function readNoteRound(n: number): ScriptedGMRound {
  return {
    content: "<thinking>I should check the note first.</thinking>",
    toolCalls: [
      { id: `call_read_${n}`, name: "read_notes", arguments: { titles: [fixtureNoteTitle(n)] } },
    ],
  };
}

/** The design's turn: three note reads, then the prose (4 GM rounds). */
export function designTurnRounds(): ScriptedGMRound[] {
  return [
    readNoteRound(0),
    readNoteRound(1),
    readNoteRound(2),
    { content: "<thinking>Enough.</thinking>\nThe courier steps out into the rain." },
  ];
}

/** One turn of generateStoryTurn against a recording fetch; the turn's result too. */
export async function runRecordedTurnWithResult(
  storyData: StoryData,
  opts: {
    input?: string;
    rounds: ScriptedGMRound[];
    options?: Partial<GenerationOptions>;
  },
): Promise<{
  requests: RecordedRequest[];
  scenePart: ScenePart;
  input: string;
}> {
  const input = opts.input ?? "I keep walking.";
  const { fetchMock, gmStageCalls } = createMockGMFetch(opts.rounds);
  const originalFetch = global.fetch;
  global.fetch = fetchMock as unknown as typeof fetch;
  try {
    const result = await generateStoryTurn(
      storyData,
      input,
      { ...BASE_OPTIONS, ...opts.options },
      {},
    );
    if (!result.success) {
      throw new Error(`turnHarness: the scripted turn failed: ${JSON.stringify(result)}`);
    }
    const requests = gmStageCalls().map((c) => ({
      url: c.url,
      body: c.body,
      messageTokens: estimateTokens(JSON.stringify(c.body.messages)),
      tokens:
        estimateTokens(JSON.stringify(c.body.messages)) +
        estimateTokens(JSON.stringify(c.body.tools ?? [])),
    }));
    return { requests, scenePart: result.scenePart, input };
  } finally {
    global.fetch = originalFetch;
  }
}

/** Stubs global.fetch with scripted provider replies and records each GM request. */
export async function runRecordedTurn(
  storyData: StoryData,
  opts: {
    input?: string;
    rounds: ScriptedGMRound[];
    options?: Partial<GenerationOptions>;
  },
): Promise<RecordedRequest[]> {
  return (await runRecordedTurnWithResult(storyData, opts)).requests;
}

/** Appends a finished turn to the story, as the story page does. */
export function appendTurn(
  storyData: StoryData,
  input: string,
  scenePart: ScenePart,
): void {
  storyData.scene.parts.push(
    { content: `> ${input}`, imageUrl: "", user: true, role: "user", choices: [] } as unknown as ScenePart,
    scenePart,
  );
}

// ---- measurements ----------------------------------------------------------

function messageTokens(m: unknown): number {
  return estimateTokens(JSON.stringify(m));
}

/** Tokens of the leading messages two requests share byte for byte. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sharedPrefixTokens(a: any[], b: any[]): number {
  let tokens = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) break;
    tokens += messageTokens(a[i]);
  }
  return tokens;
}

/**
 * Tokens of the history in a GM request: everything between the assistant's
 * acknowledgement of the game state and the final player-action message.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function historyTokensOf(messages: any[]): number {
  const ack = messages.findIndex(
    (m) => m.role === "assistant" && String(m.content).includes("I've reviewed the current game state"),
  );
  let lastUser = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      lastUser = i;
      break;
    }
  }
  if (ack < 0 || lastUser <= ack) return 0;
  return messageTokens(messages.slice(ack + 1, lastUser));
}

/**
 * What a window that counts only prose would have counted for these parts
 * (the old getPartsWithinTokenBudget: text plus flat per-call amounts). The
 * design's "history is 3.5x / 11x what the window counts" is sent / this.
 */
export function proseWindowTokens(parts: ScenePart[]): number {
  let total = 0;
  for (const part of parts) {
    total += estimateTokens(part.raw || part.content);
    total += (part.toolCalls?.length || 0) * 50 + (part.toolResponses?.length || 0) * 30;
  }
  return total;
}
