// Runs party mode for the desktop: owns the PartyHostState, feeds it what the
// LAN server reports, and carries out the effects it returns (send a phone its
// view, submit a turn, transcribe a take, answer a roll). Plain TypeScript, no
// React: usePartyHost (app/story/usePartyHost.ts) is the thin hook around it,
// and tests drive it with a fake bridge.

import type { CouchPlayer, StoryData } from "../structs";
import type {
  AskQuestionAnswer,
  AskQuestionRequest,
  ManualRollAnswer,
  ManualRollRequest,
} from "../gmExecutor";
import {
  addRequest,
  addTranscribedLine,
  buildPlayerView,
  cancelRequest,
  createPartyHost,
  desktopGo,
  findConnectedPlayerByName,
  handleConnect,
  handleDisconnect,
  handlePhoneMessage,
  nextLockoutExpiry,
  pruneExpired,
  removeSeat,
  rosterMissingFrom,
  rosterOf,
  setCooldown,
  setTurnState,
  syncRoster,
  type PartyEffect,
  type PartyHostState,
  type PartyPlayer,
  type PartyStep,
  type QueuedLine,
} from "./partyHost";
import {
  parsePhoneMessage,
  type DesktopMessage,
} from "./protocol";
import type { PartyBridge, PartyInfo, PartyServerEvent } from "./partyBridge";

export interface PartyPending {
  requestId: string;
  playerId: string;
  playerName: string;
  kind: "roll" | "question";
  request: ManualRollRequest | AskQuestionRequest;
}

// What the table screen shows. Plain data; lockouts are absolute epoch ms so
// the strip can count them down.
export interface PartyTable {
  players: { id: string; name: string; color: string; connected: boolean }[];
  holderId: string | null;
  lockedUntil: Record<string, number>;
  queue: QueuedLine[];
  turn: "idle" | "generating";
  pending: PartyPending[];
}

export interface RosterChange {
  // Seats to upsert into StoryData.multiplayer.couchPlayers.
  players: CouchPlayer[];
  removedIds: string[];
}

export interface RuntimeDeps {
  bridge: PartyBridge;
  getStory: () => StoryData | null;
  applyRoster: (change: RosterChange) => void;
  submitTurn: (
    text: string,
    speakerIds: string[],
    inputKind: "freeform" | "voice",
  ) => Promise<void>;
  // Base64 chunks of one recorded take, back to text.
  transcribe: (chunks: string[], mimeType: string) => Promise<string>;
  onTable: (table: PartyTable | null) => void;
  // The server died after starting (its listener failed).
  onError?: (error: { code: string; message: string }) => void;
  // A roll or question that was on a phone goes back to the desktop's own
  // prompt: its player was removed, or the table closed. The GM's promise is
  // still waiting, and the desktop now answers it.
  onReturnRequest?: (pending: PartyPending) => void;
  cooldownMs: number;
  now?: () => number;
  newId?: () => string;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

function defaultNewId(): string {
  // crypto.getRandomValues is available everywhere the desktop runs; the
  // phone page uses the same call (it has no crypto.randomUUID over HTTP).
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function snapshotTable(s: PartyHostState, pending: PartyPending[], now: number): PartyTable {
  const lockedUntil: Record<string, number> = {};
  for (const [id, until] of s.floor.lockouts) {
    if (until > now) lockedUntil[id] = until;
  }
  return {
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      connected: p.clientId !== null,
    })),
    holderId: s.floor.holderId,
    lockedUntil,
    queue: s.queue,
    turn: s.turn,
    pending,
  };
}

export class PartyRuntime {
  private host: PartyHostState | null = null;
  private info: PartyInfo | null = null;
  // Events that arrive before start() has returned the token.
  private early: PartyServerEvent[] | null = null;
  // requestId -> what to call with the phone's answer.
  private handlers = new Map<string, (answer: unknown) => void>();
  private timer: unknown = null;
  private cooldownMs: number;
  // Bumped by every start and stop, so a stop that lands while start() is
  // still waiting on the server is noticed.
  private epoch = 0;
  // The turn is busy while the page says so, and until a submitted turn's
  // promise settles: the page's own flag can drop between a turn's stages.
  private pageBusy = false;
  private submitting = 0;

  constructor(private deps: RuntimeDeps) {
    this.cooldownMs = deps.cooldownMs;
  }

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  private newId(): string {
    return (this.deps.newId ?? defaultNewId)();
  }

  get running(): boolean {
    return this.host !== null;
  }

  get table(): PartyTable | null {
    return this.host ? this.snapshot(this.host) : null;
  }

  async start(
    opts: { preferredPort?: number; interfaceIp?: string },
    roster: CouchPlayer[],
  ): Promise<PartyInfo> {
    // Claim this start before anything awaits, so a stop that lands at any
    // point after it is noticed.
    const epoch = ++this.epoch;
    await this.teardown(true);
    this.early = [];
    try {
      const info = await this.deps.bridge.start(opts, (e) => this.onEvent(e));
      if (epoch !== this.epoch) {
        // Closed while the server was coming up: take it down again.
        await this.deps.bridge.stop().catch(() => {});
        throw { code: "CANCELLED", message: "The table was closed while it was opening" };
      }
      this.info = info;
      this.host = createPartyHost({
        token: info.token,
        cooldownMs: this.cooldownMs,
        newId: () => this.newId(),
        roster,
      });
      const early = this.early;
      this.early = null;
      this.publish();
      for (const e of early) this.onEvent(e);
      return info;
    } catch (e) {
      this.early = null;
      throw e;
    }
  }

  // returnToDesktop: prompts waiting on a phone go back to the desktop's own
  // modals. Without it (the page is going away, so there is nowhere to show
  // them) they are answered as skipped.
  async stop(opts: { returnToDesktop?: boolean } = {}): Promise<void> {
    this.epoch++;
    await this.teardown(opts.returnToDesktop ?? true);
  }

  private async teardown(returnToDesktop: boolean): Promise<void> {
    const wasRunning = this.host !== null || this.early !== null;
    this.clearExpiryTimer();
    this.releaseRequests(null, returnToDesktop);
    for (const handler of this.handlers.values()) handler(null);
    this.handlers.clear();
    this.pageBusy = false;
    this.submitting = 0;
    this.host = null;
    this.info = null;
    this.early = null;
    this.deps.onTable(null);
    if (wasRunning) {
      try {
        await this.deps.bridge.stop();
      } catch {
        // The server is gone either way.
      }
    }
  }

  // ---------------------------------------------------------------- inputs

  go(): void {
    this.step((s) => desktopGo(s));
  }

  removePlayer(playerId: string): void {
    // Whatever the GM was waiting on from this player goes to the desktop.
    this.releaseRequests(playerId, true);
    this.step((s) => removeSeat(s, playerId));
  }

  setTurnBusy(busy: boolean): void {
    this.pageBusy = busy;
    this.syncTurn();
  }

  private syncTurn(): void {
    const busy = this.pageBusy || this.submitting > 0;
    this.step((s) => setTurnState(s, busy ? "generating" : "idle"));
  }

  // Hand a player's pending prompts back to the desktop (or answer them as
  // skipped when there is nowhere to show them), and forget the phone's side.
  private releaseRequests(playerId: string | null, returnToDesktop: boolean): void {
    const s = this.host;
    if (!s) return;
    for (const r of s.requests) {
      if (playerId !== null && r.playerId !== playerId) continue;
      const handler = this.handlers.get(r.requestId);
      this.handlers.delete(r.requestId);
      const player = s.players.find((p) => p.id === r.playerId);
      if (returnToDesktop && this.deps.onReturnRequest && player) {
        this.deps.onReturnRequest({
          requestId: r.requestId,
          playerId: r.playerId,
          playerName: player.name,
          kind: r.kind,
          request: r.request,
        });
      } else {
        handler?.(null);
      }
    }
  }

  setCooldownMs(ms: number): void {
    this.cooldownMs = ms;
    if (this.host) this.host = setCooldown(this.host, ms);
  }

  // The story's roster changed at the desktop.
  syncRoster(roster: CouchPlayer[]): void {
    if (!this.host) return;
    this.step((s) => syncRoster(s, roster));
    // Seats the party holds that the story lost (an undo from before the
    // player joined) are written back.
    if (!this.host) return;
    const missing = rosterMissingFrom(this.host, roster);
    if (missing.length > 0) this.deps.applyRoster({ players: missing, removedIds: [] });
  }

  // The story changed (a turn finished, a note was edited): every phone's
  // view may have too.
  refreshViews(): void {
    if (this.host) this.broadcast();
  }

  // ---------------------------------------------------------------- rolls and questions

  // Hand a roll to a phone. Returns its request id, or null when it isn't a
  // party player's roll and the desktop should ask as it always has.
  offerRoll(
    request: ManualRollRequest,
    onAnswer: (answer: ManualRollAnswer | null) => void,
  ): string | null {
    const target = this.targetFor([request.playerName]);
    if (!target) return null;
    return this.offer(target, "roll", request, (a) => onAnswer(a as ManualRollAnswer | null));
  }

  offerQuestion(
    request: AskQuestionRequest,
    onAnswer: (answer: AskQuestionAnswer | null) => void,
  ): string | null {
    const target = this.targetFor(request.questions.map((q) => q.target_player_name));
    if (!target) return null;
    return this.offer(target, "question", request, (a) => onAnswer(a as AskQuestionAnswer | null));
  }

  // The prompt was answered or abandoned at the desktop.
  cancelRequest(requestId: string): void {
    this.handlers.delete(requestId);
    this.step((s) => cancelRequest(s, requestId));
  }

  // Who a roll or question goes to: the one connected party player the GM
  // named; if it named nobody, whoever holds the spotlight. Null (the desktop
  // asks) when the name is nobody on a phone, or names are mixed.
  private targetFor(names: (string | undefined)[]): PartyPlayer | null {
    const s = this.host;
    if (!s) return null;
    const named = Array.from(
      new Set(names.map((n) => n?.trim().toLowerCase()).filter((n): n is string => !!n)),
    );
    if (named.length > 1) return null;
    if (named.length === 1) return findConnectedPlayerByName(s, named[0]);
    const holder = s.players.find((p) => p.id === s.floor.holderId);
    return holder?.clientId ? holder : null;
  }

  private offer(
    target: PartyPlayer,
    kind: "roll" | "question",
    request: ManualRollRequest | AskQuestionRequest,
    onAnswer: (answer: unknown) => void,
  ): string {
    const requestId = this.newId();
    this.handlers.set(requestId, onAnswer);
    this.step((s) =>
      addRequest(
        s,
        kind === "roll"
          ? { requestId, playerId: target.id, kind, request: request as ManualRollRequest }
          : { requestId, playerId: target.id, kind, request: request as AskQuestionRequest },
      ),
    );
    return requestId;
  }

  // ---------------------------------------------------------------- the machinery

  private onEvent(event: PartyServerEvent): void {
    if (!this.host) {
      this.early?.push(event);
      return;
    }
    switch (event.kind) {
      case "connected":
        this.step((s) => handleConnect(s, event.clientId));
        break;
      case "disconnected":
        this.step((s) => handleDisconnect(s, event.clientId));
        break;
      case "message": {
        const msg = parsePhoneMessage(event.json);
        if (!msg) return;
        this.step((s, now) => handlePhoneMessage(s, event.clientId, msg, now));
        break;
      }
      case "error":
        this.deps.onError?.({ code: event.code, message: event.message });
        void this.stop();
        break;
    }
  }

  private step(fn: (s: PartyHostState, now: number) => PartyStep): void {
    const s = this.host;
    if (!s) return;
    const result = fn(s, this.now());
    this.host = result.state;
    this.publish();
    this.scheduleExpiry();
    this.run(result.effects);
  }

  private pending(s: PartyHostState): PartyPending[] {
    return s.requests.flatMap((r) => {
      const player = s.players.find((p) => p.id === r.playerId);
      return player
        ? [{ requestId: r.requestId, playerId: r.playerId, playerName: player.name, kind: r.kind, request: r.request }]
        : [];
    });
  }

  private snapshot(s: PartyHostState): PartyTable {
    return snapshotTable(s, this.pending(s), this.now());
  }

  private publish(): void {
    if (this.host) this.deps.onTable(this.snapshot(this.host));
  }

  private clearExpiryTimer(): void {
    if (this.timer !== null) {
      (this.deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>)))(this.timer);
      this.timer = null;
    }
  }

  // Wake when the next lockout ends, so phones and the strip drop its ring.
  private scheduleExpiry(): void {
    this.clearExpiryTimer();
    if (!this.host) return;
    const next = nextLockoutExpiry(this.host);
    if (next === null) return;
    const wait = Math.max(0, next - this.now()) + 25;
    this.timer = (this.deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms)))(() => {
      this.timer = null;
      this.step((s, now) => pruneExpired(s, now));
    }, wait);
  }

  private send(clientId: string, message: DesktopMessage): void {
    this.deps.bridge.send({ kind: "client", id: clientId }, JSON.stringify(message)).catch(() => {
      // The phone is gone; its disconnect event follows.
    });
  }

  private viewFor(clientId: string): DesktopMessage & { type: "view" } {
    const s = this.host!;
    const playerId = s.clients[clientId]?.playerId ?? null;
    return { type: "view", view: buildPlayerView(s, this.deps.getStory(), playerId, this.now()) };
  }

  private broadcast(): void {
    const s = this.host;
    if (!s) return;
    for (const [clientId, client] of Object.entries(s.clients)) {
      if (client.helloed) this.send(clientId, this.viewFor(clientId));
    }
  }

  private run(effects: PartyEffect[]): void {
    for (const e of effects) {
      switch (e.kind) {
        case "send_view": {
          if (!this.host) break;
          const view = this.viewFor(e.clientId);
          this.send(
            e.clientId,
            e.welcome
              ? { type: "welcome", playerId: this.host.clients[e.clientId]?.playerId ?? null, view: view.view }
              : view,
          );
          break;
        }
        case "broadcast":
          this.broadcast();
          break;
        case "toast":
          this.send(e.clientId, { type: "toast", text: e.text });
          break;
        case "pong":
          this.send(e.clientId, { type: "pong" });
          break;
        case "kick":
          // A bad token is not told why; anyone else is, and told not to come
          // straight back.
          if (e.reason !== "bad token") this.send(e.clientId, { type: "kicked", reason: e.reason });
          this.deps.bridge.kick(e.clientId).catch(() => {});
          break;
        case "submit_turn": {
          this.submitting++;
          const epoch = this.epoch;
          this.deps
            .submitTurn(e.text, e.speakerIds, e.inputKind)
            .catch(() => {
              // The turn never started.
            })
            .finally(() => {
              // A table closed (or reopened) since belongs to no one now.
              if (epoch !== this.epoch) return;
              this.submitting = Math.max(0, this.submitting - 1);
              this.syncTurn();
            });
          break;
        }
        case "transcribe":
          this.transcribe(e.playerId, e.chunks, e.mimeType);
          break;
        case "resolve_roll": {
          const handler = this.handlers.get(e.requestId);
          this.handlers.delete(e.requestId);
          handler?.(e.value === null ? null : { rawText: e.value });
          break;
        }
        case "resolve_question": {
          const handler = this.handlers.get(e.requestId);
          this.handlers.delete(e.requestId);
          handler?.(e.answer);
          break;
        }
        case "roster_changed":
          if (this.host) {
            this.deps.applyRoster({ players: rosterOf(this.host), removedIds: e.removedIds ?? [] });
          }
          break;
      }
    }
  }

  private transcribe(playerId: string, chunks: string[], mimeType: string): void {
    this.deps
      .transcribe(chunks, mimeType)
      .then((text) => {
        if (!text.trim()) return;
        this.step((s) => addTranscribedLine(s, playerId, text));
      })
      .catch((err: unknown) => {
        const clientId = this.host?.players.find((p) => p.id === playerId)?.clientId;
        if (clientId) {
          const why = err instanceof Error ? err.message : "Couldn't transcribe that";
          this.send(clientId, { type: "toast", text: why });
        }
      });
  }
}
