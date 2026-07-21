// Host/guest session logic layered on top of a MultiplayerTransport. This is
// deliberately transport- and React-agnostic (see useNetSession.ts for the
// React wrapper) so it can be unit-tested with a fake in-memory transport
// instead of a real WebRTC connection.
//
// Messaging model: every message is broadcast (no per-peer addressing).
// That's safe because only a host-role NetSession ever acts on
// "presence_join"/"player_action", and only a guest-role NetSession ever
// acts on "state_snapshot" - everyone else just ignores message types they
// don't own. This sidesteps having to identify "which connected peer is the
// host" in Trystero's full-mesh rooms (there's no such concept at the
// transport level - only PeerJS's star topology has one, and there it's
// irrelevant since broadcast already reaches just the host/guests as
// appropriate).
import { getLocalPlayerId } from "@/app/misc/localPlayerId";
import type { StoryData } from "@/app/misc/structs";
import type { MultiplayerTransport } from "./transport";
import { createTransport, generateRoomCode } from "./transports";
import type {
  MPBackend,
  MPRole,
  PlayerActionKind,
  PresenceActivityState,
  RoomId,
  WireMessage,
} from "./types";

export interface NetSessionInfo {
  role: MPRole;
  backend: MPBackend;
  roomId: RoomId;
  myLocalPlayerId: string;
  displayName: string;
  color: string;
}

export interface ValidatedGuestAction {
  localPlayerId: string;
  kind: PlayerActionKind;
  choiceIndex: number | null;
  text: string | null;
}

// Physical dice mode, relayed over the wire: a host asking *me* (the guest
// this fired for - NetSession already filtered by forPlayerId) to throw.
export interface DiceThrowRelayRequest {
  requestId: string;
  sides: number;
  count: number;
  formula: string;
  reason: string;
  dc?: number;
}

export interface DiceThrowRelayResult {
  requestId: string;
  faces: number[] | null;
}

export interface GuestJoinedInfo {
  localPlayerId: string;
  displayName: string;
  color: string;
}

export class NetSession {
  readonly role: MPRole;
  readonly backend: MPBackend;
  readonly roomId: RoomId;
  readonly myLocalPlayerId: string;

  private readonly transport: MultiplayerTransport;
  private readonly displayName: string;
  private readonly color: string;
  // Trust map: transport-level peerId -> the localPlayerId that peer proved
  // ownership of via presence_join. Host-only. player_action's own
  // claimedSpeakerIds/playerId are never trusted directly - see
  // handleMessage below.
  private readonly seatOwners = new Map<string, string>();
  private nextSeq = 0;
  // Host-only: requestId -> the localPlayerId a dice_throw_request was sent
  // to, so an incoming dice_throw_result can be checked against the peer's
  // proven seat identity before being accepted - same distrust-the-payload
  // pattern as player_action above.
  private readonly pendingDiceThrows = new Map<string, string>();

  private readonly snapshotListeners = new Set<(data: StoryData) => void>();
  private readonly guestActionListeners = new Set<
    (action: ValidatedGuestAction) => void
  >();
  private readonly guestJoinedListeners = new Set<
    (info: GuestJoinedInfo) => void
  >();
  private readonly peerLeftListeners = new Set<(localPlayerId: string) => void>();
  private readonly activityListeners = new Set<
    (localPlayerId: string, state: PresenceActivityState) => void
  >();
  private readonly hostDisconnectedListeners = new Set<() => void>();
  private readonly backendSwitchListeners = new Set<(to: MPBackend) => void>();
  private readonly diceThrowRequestListeners = new Set<
    (request: DiceThrowRelayRequest) => void
  >();
  private readonly diceThrowResultListeners = new Set<
    (result: DiceThrowRelayResult) => void
  >();

  private constructor(
    role: MPRole,
    backend: MPBackend,
    roomId: RoomId,
    transport: MultiplayerTransport,
    displayName: string,
    color: string,
  ) {
    this.role = role;
    this.backend = backend;
    this.roomId = roomId;
    this.transport = transport;
    this.displayName = displayName;
    this.color = color;
    this.myLocalPlayerId = getLocalPlayerId();

    this.transport.onMessage((peerId, msg) => this.handleMessage(peerId, msg));

    if (role === "guest") {
      // Re-announced on every new mesh peer (not just the host) - redundant
      // in Trystero's full-mesh rooms when there are 3+ participants, but
      // harmless (host-side Map.set is idempotent) and keeps this adapter-
      // agnostic rather than trying to guess which peerId is the host.
      this.transport.onPeerJoin(() => {
        this.transport.send({
          type: "presence_join",
          playerId: this.myLocalPlayerId,
          name: this.displayName,
          color: this.color,
        });
      });
    }

    this.transport.onPeerLeave((peerId) => {
      if (this.role === "host") {
        const localPlayerId = this.seatOwners.get(peerId);
        if (!localPlayerId) return;
        this.seatOwners.delete(peerId);
        this.peerLeftListeners.forEach((cb) => cb(localPlayerId));
      } else {
        // A guest only ever has one link - to the host - regardless of
        // backend (Trystero mesh or PeerJS star), so any peer-leave here
        // means the host went away.
        this.hostDisconnectedListeners.forEach((cb) => cb());
      }
    });
  }

  static async createHost(
    backend: MPBackend,
    displayName: string,
    color: string,
    // Left undefined for a brand-new room; switchBackend() passes the
    // existing room's id through so a backend swap doesn't change the code
    // guests already have.
    roomId: RoomId = generateRoomCode(),
  ): Promise<NetSession> {
    const transport = createTransport(backend);
    const session = new NetSession("host", backend, roomId, transport, displayName, color);
    await transport.join(roomId, "host");
    return session;
  }

  static async joinAsGuest(
    backend: MPBackend,
    roomId: RoomId,
    displayName: string,
    color: string,
    // Trystero's join() resolves almost instantly regardless of whether the
    // room is actually reachable (it just starts trying strategies in the
    // background) - the only signal that actually means "connected" is a
    // peer showing up, so that's what this waits for instead of trusting
    // join() itself to reject on failure.
    connectTimeoutMs = 20000,
  ): Promise<NetSession> {
    const transport = createTransport(backend);
    const session = new NetSession("guest", backend, roomId, transport, displayName, color);

    const connected = new Promise<void>((resolve) => {
      transport.onPeerJoin(() => resolve());
    });

    await transport.join(roomId, "guest");

    const timedOut = Symbol("timeout");
    let timeoutHandle: ReturnType<typeof setTimeout>;
    const timeoutTimer = new Promise<typeof timedOut>((resolve) => {
      timeoutHandle = setTimeout(() => resolve(timedOut), connectTimeoutMs);
    });

    const result = await Promise.race([connected.then(() => "connected" as const), timeoutTimer]);
    clearTimeout(timeoutHandle!);

    if (result === timedOut) {
      await transport.leave();
      throw new Error(
        `Couldn't find a host with room code "${roomId}" within ${Math.round(connectTimeoutMs / 1000)}s. ` +
          "Double-check the code, and make sure everyone picked the same connection option.",
      );
    }

    return session;
  }

  info(): NetSessionInfo {
    return {
      role: this.role,
      backend: this.backend,
      roomId: this.roomId,
      myLocalPlayerId: this.myLocalPlayerId,
      displayName: this.displayName,
      color: this.color,
    };
  }

  onSnapshot(cb: (data: StoryData) => void): () => void {
    this.snapshotListeners.add(cb);
    return () => this.snapshotListeners.delete(cb);
  }

  onGuestAction(cb: (action: ValidatedGuestAction) => void): () => void {
    this.guestActionListeners.add(cb);
    return () => this.guestActionListeners.delete(cb);
  }

  onGuestJoined(cb: (info: GuestJoinedInfo) => void): () => void {
    this.guestJoinedListeners.add(cb);
    return () => this.guestJoinedListeners.delete(cb);
  }

  onPeerLeft(cb: (localPlayerId: string) => void): () => void {
    this.peerLeftListeners.add(cb);
    return () => this.peerLeftListeners.delete(cb);
  }

  // Guest-only in practice (only the host ever sends dice_throw_request,
  // and never to itself) - fires when a physical dice throw is requested
  // of this session's own player.
  onDiceThrowRequest(cb: (request: DiceThrowRelayRequest) => void): () => void {
    this.diceThrowRequestListeners.add(cb);
    return () => this.diceThrowRequestListeners.delete(cb);
  }

  // Host-only: fires once a targeted guest's dice_throw_result has been
  // checked against their proven seat identity (see handleMessage).
  onDiceThrowResult(cb: (result: DiceThrowRelayResult) => void): () => void {
    this.diceThrowResultListeners.add(cb);
    return () => this.diceThrowResultListeners.delete(cb);
  }

  onActivity(cb: (localPlayerId: string, state: PresenceActivityState) => void): () => void {
    this.activityListeners.add(cb);
    return () => this.activityListeners.delete(cb);
  }

  onHostDisconnected(cb: () => void): () => void {
    this.hostDisconnectedListeners.add(cb);
    return () => this.hostDisconnectedListeners.delete(cb);
  }

  onBackendSwitch(cb: (to: MPBackend) => void): () => void {
    this.backendSwitchListeners.add(cb);
    return () => this.backendSwitchListeners.delete(cb);
  }

  broadcastSnapshot(storyData: StoryData): void {
    if (this.role !== "host") return;
    this.transport.send({
      type: "state_snapshot",
      storyData,
      seq: this.nextSeq++,
    });
  }

  sendChoice(choiceIndex: number): void {
    if (this.role !== "guest") return;
    this.transport.send({
      type: "player_action",
      kind: "choice",
      choiceIndex,
      text: null,
      claimedSpeakerIds: null,
      playerId: this.myLocalPlayerId,
    });
  }

  sendFreeform(text: string, speakerIds?: string[]): void {
    if (this.role !== "guest") return;
    this.transport.send({
      type: "player_action",
      kind: "freeform",
      choiceIndex: null,
      text,
      claimedSpeakerIds: speakerIds && speakerIds.length > 0 ? speakerIds : null,
      playerId: this.myLocalPlayerId,
    });
  }

  sendVoice(text: string, speakerIds: string[]): void {
    if (this.role !== "guest") return;
    this.transport.send({
      type: "player_action",
      kind: "voice",
      choiceIndex: null,
      text,
      claimedSpeakerIds: speakerIds.length > 0 ? speakerIds : null,
      playerId: this.myLocalPlayerId,
    });
  }

  sendActivity(state: PresenceActivityState): void {
    this.transport.send({
      type: "presence_activity",
      playerId: this.myLocalPlayerId,
      state,
    });
  }

  // Host-only: ask a specific connected guest to physically throw dice.
  sendDiceThrowRequest(
    requestId: string,
    forPlayerId: string,
    request: Omit<DiceThrowRelayRequest, "requestId">
  ): void {
    if (this.role !== "host") return;
    this.pendingDiceThrows.set(requestId, forPlayerId);
    this.transport.send({
      type: "dice_throw_request",
      requestId,
      forPlayerId,
      ...request,
    });
  }

  // Called by whichever guest a dice_throw_request targeted, once their
  // throw settles (or they skip it - faces: null).
  sendDiceThrowResult(requestId: string, faces: number[] | null): void {
    this.transport.send({ type: "dice_throw_result", requestId, faces });
  }

  async leave(): Promise<void> {
    await this.transport.leave();
  }

  // Tears down this session's transport and rejoins the same room under a
  // different backend, preserving role/roomId/identity. Only meaningful for
  // the host to call directly - it also warns connected guests first, who
  // pick the switch up via onBackendSwitch and call this same method
  // themselves (see useNetSession's auto-follow wiring).
  async switchBackend(to: MPBackend): Promise<NetSession> {
    if (this.role === "host") {
      this.transport.send({ type: "backend_switch", to });
    }
    await this.leave();
    return this.role === "host"
      ? NetSession.createHost(to, this.displayName, this.color, this.roomId)
      : NetSession.joinAsGuest(to, this.roomId, this.displayName, this.color);
  }

  private handleMessage(peerId: string, msg: WireMessage): void {
    if (msg.type === "backend_switch") {
      this.backendSwitchListeners.forEach((cb) => cb(msg.to));
      return;
    }

    if (msg.type === "presence_activity") {
      if (msg.playerId !== this.myLocalPlayerId) {
        this.activityListeners.forEach((cb) => cb(msg.playerId, msg.state));
      }
      if (this.role === "host") {
        // Fan out to every other connected peer. Redundant-but-harmless in
        // Trystero's mesh (they'd already have heard it directly); required
        // in PeerJS's star, where a guest's broadcast only ever reaches the
        // host.
        this.transport.send(msg);
      }
      return;
    }

    if (msg.type === "dice_throw_request") {
      // Always sent by the host, directly reaching every guest in both
      // Trystero's mesh and PeerJS's star (the host has a direct link to
      // each guest) - no relay needed, just filter to the one it's for.
      if (msg.forPlayerId === this.myLocalPlayerId) {
        this.diceThrowRequestListeners.forEach((cb) =>
          cb({
            requestId: msg.requestId,
            sides: msg.sides,
            count: msg.count,
            formula: msg.formula,
            reason: msg.reason,
            dc: msg.dc,
          }),
        );
      }
      return;
    }

    if (this.role === "host") {
      if (msg.type === "presence_join") {
        this.seatOwners.set(peerId, msg.playerId);
        this.guestJoinedListeners.forEach((cb) =>
          cb({ localPlayerId: msg.playerId, displayName: msg.name, color: msg.color }),
        );
      } else if (msg.type === "player_action") {
        // The sender's real identity is whatever presence_join proved for
        // this transport connection - never msg.playerId/claimedSpeakerIds,
        // which a modified client could set to any value.
        const localPlayerId = this.seatOwners.get(peerId);
        if (!localPlayerId) return;
        this.guestActionListeners.forEach((cb) =>
          cb({
            localPlayerId,
            kind: msg.kind,
            choiceIndex: msg.choiceIndex,
            text: msg.text,
          }),
        );
      } else if (msg.type === "dice_throw_result") {
        // Only accept a result from whichever guest this specific
        // requestId was actually sent to (proven via seatOwners, not the
        // guest's own self-reported identity - there isn't one on this
        // message anyway, but the principle matches player_action above).
        const expectedPlayerId = this.pendingDiceThrows.get(msg.requestId);
        if (!expectedPlayerId) return; // unknown or already-resolved
        if (this.seatOwners.get(peerId) !== expectedPlayerId) return;
        this.pendingDiceThrows.delete(msg.requestId);
        this.diceThrowResultListeners.forEach((cb) =>
          cb({ requestId: msg.requestId, faces: msg.faces }),
        );
      }
    } else if (msg.type === "state_snapshot") {
      this.snapshotListeners.forEach((cb) => cb(msg.storyData));
    }
  }
}
