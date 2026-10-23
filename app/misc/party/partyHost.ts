// Party mode's host: a pure state machine the desktop runs for the phones at
// the table. No React and no transport. The usePartyHost hook feeds it phone
// messages and connection events, then carries out the effects it returns
// (send a view, submit a turn, transcribe a take…). See
// docs/party-mode-design.md and docs/party-mode-implementation-plan.md (S2).
//
// Rules that live here:
// - The spotlight is floorControl's talking stick, with party mode's own
//   cooldown (decision 24). In party mode it gates every line: typed, a
//   choice tap, or a voice take (decision 26).
// - Lines queue; Go from anyone sends the queue as one turn, built by the same
//   buildTurnText as couch co-op's Generate bubble (decision 23).
// - buildPlayerView is the only thing that builds what a phone is told, and
//   it is the redaction boundary: see its comment.

import type { CouchPlayer, PlayerArchetype, StoryData, StoryLore } from "../structs";
import type {
  AskQuestionAnswer,
  AskQuestionRequest,
  ManualRollRequest,
} from "../gmExecutor";
import { ARCHETYPE_INFO } from "../gmAdvice";
import {
  createFloor,
  isLockedOut,
  pruneLockouts,
  releaseFloor,
  takeFloor,
  type FloorState,
} from "../multiplayer/floorControl";
import { PLAYER_PALETTE } from "../multiplayer/palette";
import { buildTurnText } from "./turnText";
import {
  PARTY_ARCHETYPES,
  PARTY_MAX_LINE_CHARS,
  PARTY_MAX_NAME_CHARS,
  PARTY_MAX_QUEUE_LINES,
  PARTY_MAX_SEATS,
  PARTY_MAX_TAKE_BYTES,
  PARTY_PROTOCOL_VERSION,
  type AnswerItem,
  type LineKind,
  type PartyRequestView,
  type PhoneMessage,
  type PlayerView,
} from "./protocol";

// ---------------------------------------------------------------- state

export interface PartyPlayer {
  id: string;
  name: string;
  color: string;
  archetype?: PlayerArchetype;
  personalityTags?: string[];
  wishTags?: string[];
  // The connection holding this seat, or null while nobody is.
  clientId: string | null;
  // The phone's proof that it holds this seat, for reconnecting. Null for a
  // seat from the story's roster that no phone has claimed this session.
  seatKey: string | null;
}

export interface PartyClient {
  helloed: boolean;
  playerId: string | null;
}

export interface QueuedLine {
  id: string;
  playerId: string;
  name: string;
  color: string;
  text: string;
  kind: LineKind | "voice";
}

export type PartyRequest =
  | { requestId: string; playerId: string; kind: "roll"; request: ManualRollRequest }
  | { requestId: string; playerId: string; kind: "question"; request: AskQuestionRequest };

interface VoiceTake {
  takeId: string;
  chunks: string[];
  bytes: number;
  mimeType: string;
}

export interface PartyHostState {
  token: string;
  // Random ids for new seats, seat keys and queued lines. Injected so tests
  // are deterministic; the hook passes a crypto-backed one.
  newId: () => string;
  players: PartyPlayer[];
  clients: Record<string, PartyClient>;
  floor: FloorState;
  cooldownMs: number;
  queue: QueuedLine[];
  turn: "idle" | "generating";
  requests: PartyRequest[];
  // At most one take in flight per player, by player id.
  takes: Record<string, VoiceTake>;
}

export type PartyEffect =
  | { kind: "send_view"; clientId: string; welcome?: boolean }
  // Send every connected phone its own view.
  | { kind: "broadcast" }
  | { kind: "toast"; clientId: string; text: string }
  | { kind: "pong"; clientId: string }
  | { kind: "kick"; clientId: string; reason: string }
  | { kind: "submit_turn"; text: string; speakerIds: string[]; inputKind: "freeform" | "voice" }
  | { kind: "transcribe"; playerId: string; chunks: string[]; mimeType: string }
  // value null: the player asked the desktop to roll for them.
  | { kind: "resolve_roll"; requestId: string; value: string | null }
  | { kind: "resolve_question"; requestId: string; answer: AskQuestionAnswer }
  // A seat was added, claimed or removed: write the roster into the story.
  // removedIds are seats to take out of it; everything else is merged in.
  | { kind: "roster_changed"; removedIds?: string[] };

export interface PartyStep {
  state: PartyHostState;
  effects: PartyEffect[];
}

export function createPartyHost(opts: {
  token: string;
  cooldownMs: number;
  newId: () => string;
  // The story's existing roster: seats a phone can claim.
  roster?: CouchPlayer[];
}): PartyHostState {
  return {
    token: opts.token,
    newId: opts.newId,
    players: (opts.roster ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      archetype: p.archetype,
      personalityTags: p.personalityTags,
      wishTags: p.wishTags,
      clientId: null,
      seatKey: null,
    })),
    clients: {},
    floor: createFloor(),
    cooldownMs: opts.cooldownMs,
    queue: [],
    turn: "idle",
    requests: [],
    takes: {},
  };
}

// ---------------------------------------------------------------- helpers

function cloneFloor(floor: FloorState): FloorState {
  return { holderId: floor.holderId, lockouts: new Map(floor.lockouts) };
}

function playerOfClient(s: PartyHostState, clientId: string): PartyPlayer | null {
  const playerId = s.clients[clientId]?.playerId;
  if (!playerId) return null;
  return s.players.find((p) => p.id === playerId) ?? null;
}

function updatePlayer(
  s: PartyHostState,
  playerId: string,
  patch: Partial<PartyPlayer>,
): PartyPlayer[] {
  return s.players.map((p) => (p.id === playerId ? { ...p, ...patch } : p));
}

// One line of text: a newline in a phone's line could forge a "> Name:" line
// for another player in the turn text, so line breaks become spaces.
export function cleanLine(raw: string, max: number = PARTY_MAX_LINE_CHARS): string {
  return raw
    .replace(/[\r\n\u2028\u2029]+/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max)
    .trim();
}

// A name is read by the GM as the "Name:" in "> Name: line", so it can't carry
// the separator or the line marker and fake another speaker.
export function cleanName(raw: string): string {
  return cleanLine(raw.replace(/[:>]+/g, " "), PARTY_MAX_NAME_CHARS).replace(/\s+/g, " ");
}

function isHexColor(c: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(c);
}

function toast(clientId: string, text: string): PartyEffect {
  return { kind: "toast", clientId, text };
}

function secondsLeft(s: PartyHostState, playerId: string, now: number): number {
  const until = s.floor.lockouts.get(playerId) ?? now;
  return Math.max(1, Math.ceil((until - now) / 1000));
}

// ---------------------------------------------------------------- connections

export function handleConnect(s: PartyHostState, clientId: string): PartyStep {
  return {
    state: { ...s, clients: { ...s.clients, [clientId]: { helloed: false, playerId: null } } },
    effects: [],
  };
}

export function handleDisconnect(s: PartyHostState, clientId: string): PartyStep {
  const client = s.clients[clientId];
  if (!client) return { state: s, effects: [] };
  const clients = { ...s.clients };
  delete clients[clientId];
  let next: PartyHostState = { ...s, clients };
  const player = playerOfClient(s, clientId);
  if (player && player.clientId === clientId) {
    const floor = cloneFloor(s.floor);
    // Leaving isn't being interrupted: a plain release, no lockout.
    releaseFloor(floor, player.id);
    const takes = { ...s.takes };
    delete takes[player.id];
    next = { ...next, floor, takes, players: updatePlayer(s, player.id, { clientId: null }) };
  }
  return { state: next, effects: [{ kind: "broadcast" }] };
}

// ---------------------------------------------------------------- phone messages

export function handlePhoneMessage(
  s: PartyHostState,
  clientId: string,
  msg: PhoneMessage,
  now: number,
): PartyStep {
  const client = s.clients[clientId];
  if (!client) return { state: s, effects: [] };

  if (msg.type === "ping") return { state: s, effects: [{ kind: "pong", clientId }] };
  if (msg.type === "hello") return hello(s, clientId, msg);
  // Nothing but hello counts before hello.
  if (!client.helloed) return { state: s, effects: [] };
  if (msg.type === "join") return join(s, clientId, msg);

  const player = playerOfClient(s, clientId);
  if (!player) {
    if (msg.type === "vad_features") return { state: s, effects: [] };
    return { state: s, effects: [toast(clientId, "Join the table first.")] };
  }

  switch (msg.type) {
    case "spotlight_take": {
      const floor = cloneFloor(s.floor);
      const result = takeFloor(floor, player.id, now, s.cooldownMs);
      if (!result.granted) {
        return {
          state: s,
          effects: [
            toast(
              clientId,
              `You were interrupted. You can take the spotlight back in ${secondsLeft(s, player.id, now)} s.`,
            ),
          ],
        };
      }
      if (!result.changed) return { state: s, effects: [] };
      return { state: { ...s, floor }, effects: [{ kind: "broadcast" }] };
    }
    case "spotlight_release": {
      const floor = cloneFloor(s.floor);
      if (!releaseFloor(floor, player.id).changed) return { state: s, effects: [] };
      return { state: { ...s, floor }, effects: [{ kind: "broadcast" }] };
    }
    case "line":
      return addLine(s, clientId, player, msg.text, msg.kind);
    case "voice_chunk":
      return voiceChunk(s, clientId, player, msg);
    case "go":
      return go(s, clientId);
    case "roll_result":
      return rollResult(s, clientId, player, msg.requestId, msg.value);
    case "answer":
      return answer(s, clientId, player, msg.requestId, msg.answers);
    case "vad_features":
      return { state: s, effects: [] };
  }
}

function hello(
  s: PartyHostState,
  clientId: string,
  msg: Extract<PhoneMessage, { type: "hello" }>,
): PartyStep {
  if (msg.token !== s.token) {
    return { state: s, effects: [{ kind: "kick", clientId, reason: "bad token" }] };
  }
  const effects: PartyEffect[] = [];
  let players = s.players;
  let playerId: string | null = s.clients[clientId]?.playerId ?? null;
  const clients = { ...s.clients };

  if (!playerId && msg.playerId && msg.seatKey) {
    const seat = s.players.find((p) => p.id === msg.playerId);
    if (seat && seat.seatKey !== null && seat.seatKey === msg.seatKey) {
      // A phone back from sleep can arrive before its old socket is noticed
      // as dead: the newest connection wins the seat.
      if (seat.clientId && seat.clientId !== clientId) {
        effects.push({ kind: "kick", clientId: seat.clientId, reason: "seat reopened elsewhere" });
        delete clients[seat.clientId];
      }
      players = players.map((p) => (p.id === seat.id ? { ...p, clientId } : p));
      playerId = seat.id;
    }
  }
  clients[clientId] = { helloed: true, playerId };
  effects.push({ kind: "send_view", clientId, welcome: true });
  if (playerId) effects.push({ kind: "broadcast" });
  return { state: { ...s, players, clients }, effects };
}

function join(
  s: PartyHostState,
  clientId: string,
  msg: Extract<PhoneMessage, { type: "join" }>,
): PartyStep {
  if (s.clients[clientId]?.playerId) {
    return { state: s, effects: [{ kind: "send_view", clientId }] };
  }
  const seatKey = s.newId();

  if (msg.seatId) {
    const seat = s.players.find((p) => p.id === msg.seatId);
    if (!seat || seat.clientId) {
      return { state: s, effects: [toast(clientId, "Someone has already taken that seat.")] };
    }
    return {
      state: {
        ...s,
        players: updatePlayer(s, seat.id, { clientId, seatKey }),
        clients: { ...s.clients, [clientId]: { helloed: true, playerId: seat.id } },
      },
      effects: [
        { kind: "send_view", clientId, welcome: true },
        { kind: "broadcast" },
        { kind: "roster_changed" },
      ],
    };
  }

  const name = cleanName(msg.name);
  if (!name) return { state: s, effects: [toast(clientId, "Pick a name first.")] };
  if (!isHexColor(msg.color)) return { state: s, effects: [toast(clientId, "Pick a colour.")] };
  if (s.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    return {
      state: s,
      effects: [
        toast(
          clientId,
          `Someone at the table is already called ${name}. If that's you, tap your name under "Your seat".`,
        ),
      ],
    };
  }
  if (s.players.length >= PARTY_MAX_SEATS) {
    return { state: s, effects: [toast(clientId, "The table is full.")] };
  }
  const tags = (list?: string[]) => {
    const cleaned = (list ?? []).map((t) => cleanName(t)).filter(Boolean);
    return cleaned.length > 0 ? cleaned : undefined;
  };
  const player: PartyPlayer = {
    id: `party_${s.newId()}`,
    name,
    color: msg.color.toLowerCase(),
    archetype:
      msg.archetype && PARTY_ARCHETYPES.includes(msg.archetype) ? msg.archetype : undefined,
    personalityTags: tags(msg.personalityTags),
    wishTags: tags(msg.wishTags),
    clientId,
    seatKey,
  };
  return {
    state: {
      ...s,
      players: [...s.players, player],
      clients: { ...s.clients, [clientId]: { helloed: true, playerId: player.id } },
    },
    effects: [
      { kind: "send_view", clientId, welcome: true },
      { kind: "broadcast" },
      { kind: "roster_changed" },
    ],
  };
}

function addLine(
  s: PartyHostState,
  clientId: string,
  player: PartyPlayer,
  rawText: string,
  kind: LineKind,
): PartyStep {
  if (s.turn === "generating") {
    return { state: s, effects: [toast(clientId, "Wait for the GM to finish this turn.")] };
  }
  if (s.floor.holderId !== player.id) {
    return { state: s, effects: [toast(clientId, "Take the spotlight first.")] };
  }
  const text = cleanLine(rawText);
  if (!text) return { state: s, effects: [] };
  if (s.queue.length >= PARTY_MAX_QUEUE_LINES) {
    return { state: s, effects: [toast(clientId, "The queue is full. Tap Go first.")] };
  }
  return { state: queueLine(s, player, text, kind), effects: [{ kind: "broadcast" }] };
}

function queueLine(
  s: PartyHostState,
  player: PartyPlayer,
  text: string,
  kind: QueuedLine["kind"],
): PartyHostState {
  const line: QueuedLine = {
    id: s.newId(),
    playerId: player.id,
    name: player.name,
    color: player.color,
    text,
    kind,
  };
  return { ...s, queue: [...s.queue, line] };
}

function voiceChunk(
  s: PartyHostState,
  clientId: string,
  player: PartyPlayer,
  msg: Extract<PhoneMessage, { type: "voice_chunk" }>,
): PartyStep {
  const current = s.takes[player.id];
  const takes = { ...s.takes };
  let take: VoiceTake;
  if (msg.seq === 0) {
    // A take is accepted on the strength of its first chunk: the player held
    // the spotlight when they started speaking. A later steal doesn't drop
    // what they already said, as with couch co-op's bubbles.
    if (s.turn === "generating") {
      return { state: s, effects: [toast(clientId, "Wait for the GM to finish this turn.")] };
    }
    if (s.floor.holderId !== player.id) {
      return { state: s, effects: [toast(clientId, "Take the spotlight first.")] };
    }
    take = { takeId: msg.takeId, chunks: [], bytes: 0, mimeType: msg.mimeType || "audio/webm" };
  } else if (current && current.takeId === msg.takeId && current.chunks.length === msg.seq) {
    take = current;
  } else {
    // A chunk out of order or for a take we dropped: drop the whole take.
    delete takes[player.id];
    return {
      state: { ...s, takes },
      effects: current ? [toast(clientId, "Part of that recording got lost. Try again.")] : [],
    };
  }
  const bytes = take.bytes + Math.floor((msg.base64.length * 3) / 4);
  if (bytes > PARTY_MAX_TAKE_BYTES) {
    delete takes[player.id];
    return { state: { ...s, takes }, effects: [toast(clientId, "That recording is too long.")] };
  }
  const updated: VoiceTake = { ...take, chunks: [...take.chunks, msg.base64], bytes };
  if (!msg.last) {
    takes[player.id] = updated;
    return { state: { ...s, takes }, effects: [] };
  }
  delete takes[player.id];
  return {
    state: { ...s, takes },
    effects: [
      { kind: "transcribe", playerId: player.id, chunks: updated.chunks, mimeType: updated.mimeType },
    ],
  };
}

function go(s: PartyHostState, clientId: string | null): PartyStep {
  const say = (text: string): PartyEffect[] => (clientId ? [toast(clientId, text)] : []);
  if (s.turn === "generating") return { state: s, effects: say("The GM is already on it.") };
  const turn = buildTurnText(s.queue);
  if (!turn) return { state: s, effects: say("Nothing is queued yet.") };
  const inputKind = s.queue.some((l) => l.kind === "voice") ? "voice" : "freeform";
  return {
    state: { ...s, queue: [], turn: "generating" },
    effects: [
      { kind: "submit_turn", text: turn.text, speakerIds: turn.speakerIds, inputKind },
      { kind: "broadcast" },
    ],
  };
}

function rollResult(
  s: PartyHostState,
  clientId: string,
  player: PartyPlayer,
  requestId: string,
  value: string | null,
): PartyStep {
  const req = s.requests.find(
    (r) => r.requestId === requestId && r.kind === "roll" && r.playerId === player.id,
  );
  if (!req) return { state: s, effects: [{ kind: "send_view", clientId }] };
  return {
    state: { ...s, requests: s.requests.filter((r) => r !== req) },
    effects: [
      { kind: "resolve_roll", requestId, value: value === null ? null : cleanLine(value) },
      { kind: "send_view", clientId },
    ],
  };
}

function answer(
  s: PartyHostState,
  clientId: string,
  player: PartyPlayer,
  requestId: string,
  answers: AnswerItem[],
): PartyStep {
  const req = s.requests.find(
    (r) => r.requestId === requestId && r.kind === "question" && r.playerId === player.id,
  );
  if (!req || req.kind !== "question") {
    return { state: s, effects: [{ kind: "send_view", clientId }] };
  }
  const questions = req.request.questions;
  if (answers.length !== questions.length) {
    return { state: s, effects: [toast(clientId, "Answer every question, or skip it.")] };
  }
  const cleaned = questions.map((q, i) => {
    const a = answers[i];
    if (a.skipped) return { skipped: true };
    if (q.multi_select) {
      // Every ticked label the GM actually offered, once each, in option order.
      const ticked = new Set(a.selectedLabels ?? []);
      const labels = q.options.map((o) => o.label).filter((l, k, all) => ticked.has(l) && all.indexOf(l) === k);
      const extra = q.allow_custom === false ? "" : cleanLine(a.customText ?? "");
      if (labels.length === 0 && !extra) return { skipped: true };
      return {
        ...(labels.length > 0 ? { selectedLabels: labels } : {}),
        ...(extra ? { customText: extra } : {}),
        skipped: false,
      };
    }
    // Only a label the GM actually offered counts as a pick.
    const label = q.options.find((o) => o.label === a.selectedLabel)?.label;
    if (label) return { selectedLabel: label, skipped: false };
    const custom = q.allow_custom === false ? "" : cleanLine(a.customText ?? "");
    return custom ? { customText: custom, skipped: false } : { skipped: true };
  });
  return {
    state: { ...s, requests: s.requests.filter((r) => r !== req) },
    effects: [
      { kind: "resolve_question", requestId, answer: { answers: cleaned } },
      { kind: "send_view", clientId },
    ],
  };
}

// ---------------------------------------------------------------- desktop side

// Go from the table screen.
export function desktopGo(s: PartyHostState): PartyStep {
  return go(s, null);
}

// Mirror the story page's generating state, so the queue locks while the GM
// is working and unlocks when it's done.
export function setTurnState(s: PartyHostState, turn: "idle" | "generating"): PartyStep {
  if (s.turn === turn) return { state: s, effects: [] };
  return { state: { ...s, turn }, effects: [{ kind: "broadcast" }] };
}

// A transcribed voice take joins the queue. It was accepted when it started,
// so it queues even if a turn began meanwhile; it waits for the next Go.
export function addTranscribedLine(
  s: PartyHostState,
  playerId: string,
  transcript: string,
): PartyStep {
  const player = s.players.find((p) => p.id === playerId);
  const text = cleanLine(transcript);
  if (!player || !text || s.queue.length >= PARTY_MAX_QUEUE_LINES) {
    return { state: s, effects: [] };
  }
  return { state: queueLine(s, player, text, "voice"), effects: [{ kind: "broadcast" }] };
}

export function setCooldown(s: PartyHostState, cooldownMs: number): PartyHostState {
  return { ...s, cooldownMs };
}

// Drop expired lockouts; a broadcast when that changes what phones show.
export function pruneExpired(s: PartyHostState, now: number): PartyStep {
  const floor = cloneFloor(s.floor);
  if (!pruneLockouts(floor, now)) return { state: s, effects: [] };
  return { state: { ...s, floor }, effects: [{ kind: "broadcast" }] };
}

// The earliest moment a lockout ends, so the hook can wake up then.
export function nextLockoutExpiry(s: PartyHostState): number | null {
  let earliest: number | null = null;
  for (const until of s.floor.lockouts.values()) {
    if (earliest === null || until < earliest) earliest = until;
  }
  return earliest;
}

// The connected seat for a name the GM used (ask_for_roll's player_name,
// ask_question's target_player_name), or null if it's nobody on a phone.
export function findConnectedPlayerByName(
  s: PartyHostState,
  name: string | undefined,
): PartyPlayer | null {
  const wanted = name?.trim().toLowerCase();
  if (!wanted) return null;
  return s.players.find((p) => p.clientId && p.name.toLowerCase() === wanted) ?? null;
}

// Hand a roll or question to that player's phone.
export function addRequest(s: PartyHostState, req: PartyRequest): PartyStep {
  const player = s.players.find((p) => p.id === req.playerId);
  return {
    state: { ...s, requests: [...s.requests, req] },
    effects: player?.clientId ? [{ kind: "send_view", clientId: player.clientId }] : [],
  };
}

// Take a request back: answered at the desktop, or the turn was stopped.
export function cancelRequest(s: PartyHostState, requestId: string): PartyStep {
  const req = s.requests.find((r) => r.requestId === requestId);
  if (!req) return { state: s, effects: [] };
  const player = s.players.find((p) => p.id === req.playerId);
  return {
    state: { ...s, requests: s.requests.filter((r) => r !== req) },
    effects: player?.clientId ? [{ kind: "send_view", clientId: player.clientId }] : [],
  };
}

// The story's roster changed at the desktop (a rename in the Menu, an undo
// that restored an older StoryData). A seat follows the story's names and
// colours, and unclaimed seats follow it in being added or removed. But a
// seat a phone has claimed this session belongs to the party: the story's
// roster dropping it (an undo from before the player joined) must not kick
// their phone, so such seats stay, and rosterMissingFrom says what to write
// back. Removing a player on purpose is removeSeat.
export function syncRoster(s: PartyHostState, roster: CouchPlayer[]): PartyStep {
  const byId = new Map(roster.map((p) => [p.id, p]));
  const players: PartyPlayer[] = [];
  let changed = false;
  for (const p of s.players) {
    const r = byId.get(p.id);
    if (!r) {
      if (p.seatKey !== null) {
        players.push(p);
      } else {
        changed = true;
      }
      continue;
    }
    if (r.name !== p.name || r.color !== p.color) changed = true;
    players.push({ ...p, name: r.name, color: r.color });
  }
  for (const r of roster) {
    if (!s.players.some((p) => p.id === r.id)) {
      changed = true;
      players.push({
        id: r.id,
        name: r.name,
        color: r.color,
        archetype: r.archetype,
        personalityTags: r.personalityTags,
        wishTags: r.wishTags,
        clientId: null,
        seatKey: null,
      });
    }
  }
  if (!changed) return { state: s, effects: [] };
  return { state: { ...s, players }, effects: [{ kind: "broadcast" }] };
}

// Seats the party holds that the story's roster has lost, to write back.
export function rosterMissingFrom(s: PartyHostState, roster: CouchPlayer[]): CouchPlayer[] {
  const present = new Set(roster.map((p) => p.id));
  return rosterOf(s).filter((p) => !present.has(p.id));
}

// The host removes a player: their phone is sent away and the seat is gone.
export function removeSeat(s: PartyHostState, playerId: string): PartyStep {
  const seat = s.players.find((p) => p.id === playerId);
  if (!seat) return { state: s, effects: [] };
  const effects: PartyEffect[] = [];
  const clients = { ...s.clients };
  if (seat.clientId) {
    effects.push({ kind: "kick", clientId: seat.clientId, reason: "removed by the host" });
    delete clients[seat.clientId];
  }
  const floor = cloneFloor(s.floor);
  if (floor.holderId === playerId) floor.holderId = null;
  floor.lockouts.delete(playerId);
  const takes = { ...s.takes };
  delete takes[playerId];
  effects.push({ kind: "broadcast" }, { kind: "roster_changed", removedIds: [playerId] });
  return {
    state: {
      ...s,
      players: s.players.filter((p) => p.id !== playerId),
      clients,
      floor,
      takes,
      queue: s.queue.filter((l) => l.playerId !== playerId),
      requests: s.requests.filter((r) => r.playerId !== playerId),
    },
    effects,
  };
}

// The roster as CouchPlayer entries, for writing into StoryData.multiplayer.
export function rosterOf(s: PartyHostState): CouchPlayer[] {
  return s.players.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    ...(p.archetype ? { archetype: p.archetype } : {}),
    ...(p.personalityTags ? { personalityTags: p.personalityTags } : {}),
    ...(p.wishTags ? { wishTags: p.wishTags } : {}),
  }));
}

// ---------------------------------------------------------------- the view

const NARRATION_EXCERPT_CHARS = 1200;

// A note a player may see: on, not marked secret, and set to always_reveal
// (the default when unset). Anything hidden, to-be-revealed or
// check-per-turn is the GM's until it flips the note.
function isPlayerVisible(note: StoryLore): boolean {
  return (
    note.enabled !== false &&
    note.secrtet !== true &&
    (note.visibility === undefined || note.visibility === "always_reveal")
  );
}

// The player's own character sheet: the character_sheet note they own, or
// else the one titled "Character: <name>" that the co-op setup note asks the
// GM to write. Only character_sheet notes are ever considered.
export function findPlayerSheet(story: StoryData, player: { id: string; name: string }): StoryLore | null {
  const sheets = (story.lore ?? []).filter(
    (n) => n.type === "character_sheet" && isPlayerVisible(n),
  );
  const owned = sheets.find((n) => n.ownerCouchPlayerId === player.id);
  if (owned) return owned;
  const title = `character: ${player.name}`.toLowerCase().replace(/\s+/g, " ");
  return (
    sheets.find(
      (n) =>
        !n.ownerCouchPlayerId &&
        n.title.trim().toLowerCase().replace(/\s+/g, " ") === title,
    ) ?? null
  );
}

function narrationExcerpt(story: StoryData): string {
  const parts = story.scene?.parts ?? [];
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (part.user || part.role !== "assistant" || !part.content?.trim()) continue;
    const text = part.content.trim();
    if (text.length <= NARRATION_EXCERPT_CHARS) return text;
    const tail = text.slice(-NARRATION_EXCERPT_CHARS);
    const cut = tail.search(/\s/);
    return `…${cut >= 0 ? tail.slice(cut + 1) : tail}`;
  }
  return "";
}

function currentChoices(story: StoryData): string[] {
  const parts = story.scene?.parts ?? [];
  const last = parts[parts.length - 1];
  if (!last || last.user) return [];
  return (last.choices ?? []).map((c) => c.text).filter((t) => typeof t === "string" && t.trim());
}

function requestView(req: PartyRequest): PartyRequestView {
  if (req.kind === "roll") {
    return {
      requestId: req.requestId,
      kind: "roll",
      title: req.request.title,
      description: req.request.description,
      ...(req.request.formula ? { formula: req.request.formula } : {}),
    };
  }
  return {
    requestId: req.requestId,
    kind: "question",
    questions: req.request.questions.map((q) => ({
      question: q.question,
      options: q.options.map((o) => ({
        label: o.label,
        ...(o.description ? { description: o.description } : {}),
      })),
      allowCustom: q.allow_custom !== false,
      ...(q.multi_select ? { multiSelect: true } : {}),
    })),
  };
}

// THE REDACTION BOUNDARY. Everything a phone ever receives is built here, from
// an explicit list of fields; nothing is spread from StoryData. A view holds:
// the player's own name and colour, their own character sheet, the roster with
// spotlight and cooldown state, the queue, the turn state, the suggested
// choices, this player's pending rolls and questions, and the latest narration.
// It never holds StoryData, other notes (secrets, gm_plan, dm_instructions,
// anything not always_reveal), other players' sheets, or any key.
// tests/party.redaction.test.ts proves it.
export function buildPlayerView(
  s: PartyHostState,
  story: StoryData | null,
  playerId: string | null,
  now: number,
): PlayerView {
  const me = playerId ? (s.players.find((p) => p.id === playerId) ?? null) : null;
  const seats = s.players.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    connected: p.clientId !== null,
    lockoutMs: isLockedOut(s.floor, p.id, now)
      ? (s.floor.lockouts.get(p.id) ?? now) - now
      : 0,
  }));
  const base: Pick<
    PlayerView,
    "v" | "storyName" | "seats" | "spotlightHolderId" | "cooldownMs" | "turn"
  > = {
    v: PARTY_PROTOCOL_VERSION,
    storyName: story?.story_name ?? "",
    seats,
    spotlightHolderId: s.floor.holderId,
    cooldownMs: s.cooldownMs,
    turn: s.turn,
  };
  if (!me || me.seatKey === null) {
    return {
      ...base,
      me: null,
      sheet: null,
      queue: [],
      choices: [],
      requests: [],
      narration: "",
      join: {
        palette: [...PLAYER_PALETTE],
        archetypes: PARTY_ARCHETYPES.map((id) => ({ id, label: ARCHETYPE_INFO[id].label })),
        openSeats: s.players
          .filter((p) => p.clientId === null)
          .map((p) => ({ id: p.id, name: p.name, color: p.color })),
      },
    };
  }
  const sheet = story ? findPlayerSheet(story, me) : null;
  return {
    ...base,
    me: { id: me.id, name: me.name, color: me.color, seatKey: me.seatKey },
    sheet: sheet ? { title: sheet.title, content: sheet.content } : null,
    queue: s.queue.map((l) => ({
      id: l.id,
      playerId: l.playerId,
      name: l.name,
      color: l.color,
      text: l.text,
      kind: l.kind,
    })),
    choices: story ? currentChoices(story) : [],
    requests: s.requests.filter((r) => r.playerId === me.id).map(requestView),
    narration: story ? narrationExcerpt(story) : "",
    join: null,
  };
}
