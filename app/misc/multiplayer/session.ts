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
import type { PlayerArchetype, StoryData } from "@/app/misc/structs";
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

// The full profile a guest claims when joining - either an existing saved
// profile (resumed from the host's story) or a freshly-created one. Carried on
// presence_join so the host can rebuild a complete CouchPlayer.
export interface ClaimedProfile {
  profileId: string;
  name: string;
  color: string;
  archetype?: PlayerArchetype | null;
  personalityTags?: string[] | null;
  wishTags?: string[] | null;
}

// Broadcast to guests each collection round (see turnBatch.ts).
export interface TurnStatus {
  phase: "collecting" | "generating";
  submittedPlayerIds: string[];
  passedPlayerIds: string[];
  expectedPlayerIds: string[];
}

// A relayed slice of the host's live narration.
export interface StoryStreamUpdate {
  turnId: string;
  text: string;
  stage: "gm" | "story" | "choices" | null;
  done: boolean;
}

// One relayed MP3 chunk of the host's TTS narration.
export interface TTSAudioChunk {
  turnId: string;
  index: number;
  dataB64: string;
  done: boolean;
}

// Host-authoritative party-voice floor snapshot.
export interface FloorSnapshot {
  holderId: string | null;
  lockedOutIds: string[];
}

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
  groups: { sides: number; count: number }[];
  formula: string;
  reason: string;
}

export interface DiceThrowRelayResult {
  requestId: string;
  // One face array per requested group, in the same order.
  faces: number[][] | null;
}

export interface GuestJoinedInfo {
  localPlayerId: string;
  displayName: string;
  color: string;
  archetype?: PlayerArchetype | null;
  personalityTags?: string[] | null;
  wishTags?: string[] | null;
}

// Out-of-character chat between online players - never touches StoryData or
// the GM's context, see WireMessage's "ooc_chat" variant.
export interface OOCChatMessage {
  playerId: string;
  displayName: string;
  color: string;
  text: string;
  timestamp: number;
}

export class NetSession {
  readonly role: MPRole;
  readonly backend: MPBackend;
  readonly roomId: RoomId;

  private readonly transport: MultiplayerTransport;
  private displayName: string;
  private color: string;
  // Guest-only: the profile this device has claimed (via announceProfile).
  // Until a guest picks/creates a profile, presence_join isn't sent and this
  // stays null, so the guest's effective id falls back to the device id. The
  // host never picks a profile - it keeps its device id (getLocalPlayerId).
  private announcedProfile: ClaimedProfile | null = null;
  // Captured once at construction so a session's fallback identity stays
  // stable for its whole lifetime, independent of any later getLocalPlayerId()
  // change.
  private readonly deviceId: string = getLocalPlayerId();

  // The id this session acts as on the wire. For a guest that has claimed a
  // saved/created profile, that's the profile id (so the same profile can be
  // resumed from any device); otherwise the stable per-device id. Exposed as a
  // property getter so existing `.myLocalPlayerId` reads stay unchanged.
  get myLocalPlayerId(): string {
    return this.announcedProfile?.profileId ?? this.deviceId;
  }
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
  private readonly oocChatListeners = new Set<(message: OOCChatMessage) => void>();
  // Host-only: a guest's player_pass, seat-validated.
  private readonly guestPassListeners = new Set<(localPlayerId: string) => void>();
  // Host-only: a fresh transport peer connected (before it has announced a
  // profile) - the React layer uses this to push a snapshot so the joiner has
  // the saved-profile list to pick from.
  private readonly hostPeerConnectedListeners = new Set<() => void>();
  // Guest-only: the host's turn-collection status / live narration / relayed
  // TTS / party-voice floor.
  private readonly turnStatusListeners = new Set<(status: TurnStatus) => void>();
  private readonly storyStreamListeners = new Set<(u: StoryStreamUpdate) => void>();
  private readonly ttsAudioListeners = new Set<(c: TTSAudioChunk) => void>();
  private readonly floorStateListeners = new Set<(f: FloorSnapshot) => void>();
  // Host-only: a guest asking for / releasing the party-voice floor,
  // seat-validated.
  private readonly floorTakeListeners = new Set<(localPlayerId: string) => void>();
  private readonly floorReleaseListeners = new Set<(localPlayerId: string) => void>();

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

    this.transport.onMessage((peerId, msg) => this.handleMessage(peerId, msg));

    if (role === "guest") {
      // presence_join is deferred until the player picks/creates a profile
      // (announceProfile) - so a joiner first receives the host's snapshot and
      // chooses a saved profile before claiming a seat. Once announced, we
      // re-announce on every new mesh peer (redundant-but-harmless in
      // Trystero's full mesh; needed so a late-arriving peer learns this
      // seat), rather than guessing which peerId is the host.
      this.transport.onPeerJoin(() => {
        if (this.announcedProfile) this.sendPresenceJoin();
      });
    } else {
      // Host: a fresh peer connecting is the cue to push current state so the
      // joiner can pick a profile. The React layer supplies the snapshot.
      this.transport.onPeerJoin(() => {
        this.hostPeerConnectedListeners.forEach((cb) => cb());
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

  private sendPresenceJoin(): void {
    const profile = this.announcedProfile;
    if (!profile) return;
    this.transport.send({
      type: "presence_join",
      playerId: profile.profileId,
      name: profile.name,
      color: profile.color,
      archetype: profile.archetype ?? null,
      personalityTags: profile.personalityTags ?? null,
      wishTags: profile.wishTags ?? null,
    });
  }

  // Guest-only: claim a profile (a saved one resumed from the host's story, or
  // a freshly-created one) and announce it, taking a seat. Safe to call again
  // to switch profiles before acting. No-op on the host, which already owns
  // its own seat from room creation.
  announceProfile(profile: ClaimedProfile): void {
    if (this.role !== "guest") return;
    this.announcedProfile = profile;
    this.displayName = profile.name;
    this.color = profile.color;
    this.sendPresenceJoin();
  }

  hasAnnouncedProfile(): boolean {
    return this.announcedProfile !== null;
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

  onOOCChat(cb: (message: OOCChatMessage) => void): () => void {
    this.oocChatListeners.add(cb);
    return () => this.oocChatListeners.delete(cb);
  }

  onHostDisconnected(cb: () => void): () => void {
    this.hostDisconnectedListeners.add(cb);
    return () => this.hostDisconnectedListeners.delete(cb);
  }

  onBackendSwitch(cb: (to: MPBackend) => void): () => void {
    this.backendSwitchListeners.add(cb);
    return () => this.backendSwitchListeners.delete(cb);
  }

  // Host-only: a guest passed this collection round.
  onGuestPass(cb: (localPlayerId: string) => void): () => void {
    this.guestPassListeners.add(cb);
    return () => this.guestPassListeners.delete(cb);
  }

  // Host-only: a fresh peer connected (before announcing a profile).
  onHostPeerConnected(cb: () => void): () => void {
    this.hostPeerConnectedListeners.add(cb);
    return () => this.hostPeerConnectedListeners.delete(cb);
  }

  // Guest-only feeds from the host.
  onTurnStatus(cb: (status: TurnStatus) => void): () => void {
    this.turnStatusListeners.add(cb);
    return () => this.turnStatusListeners.delete(cb);
  }

  onStoryStream(cb: (u: StoryStreamUpdate) => void): () => void {
    this.storyStreamListeners.add(cb);
    return () => this.storyStreamListeners.delete(cb);
  }

  onTTSAudio(cb: (c: TTSAudioChunk) => void): () => void {
    this.ttsAudioListeners.add(cb);
    return () => this.ttsAudioListeners.delete(cb);
  }

  onFloorState(cb: (f: FloorSnapshot) => void): () => void {
    this.floorStateListeners.add(cb);
    return () => this.floorStateListeners.delete(cb);
  }

  // Host-only: a guest asking for / releasing the party-voice floor.
  onFloorTake(cb: (localPlayerId: string) => void): () => void {
    this.floorTakeListeners.add(cb);
    return () => this.floorTakeListeners.delete(cb);
  }

  onFloorRelease(cb: (localPlayerId: string) => void): () => void {
    this.floorReleaseListeners.add(cb);
    return () => this.floorReleaseListeners.delete(cb);
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

  // Guest-only: I have nothing to add this round.
  sendPass(): void {
    if (this.role !== "guest") return;
    this.transport.send({ type: "player_pass", playerId: this.myLocalPlayerId });
  }

  // Host-only: broadcast the current collection status / batched-turn phase.
  broadcastTurnStatus(status: TurnStatus): void {
    if (this.role !== "host") return;
    this.transport.send({
      type: "turn_status",
      phase: status.phase,
      submittedPlayerIds: status.submittedPlayerIds,
      passedPlayerIds: status.passedPlayerIds,
      expectedPlayerIds: status.expectedPlayerIds,
      seq: this.nextSeq++,
    });
  }

  // Host-only: relay a slice of the live narration to guests.
  broadcastStoryStream(update: StoryStreamUpdate): void {
    if (this.role !== "host") return;
    this.transport.send({
      type: "story_stream",
      turnId: update.turnId,
      text: update.text,
      stage: update.stage,
      done: update.done,
      seq: this.nextSeq++,
    });
  }

  // Host-only: relay one MP3 chunk of the host's TTS narration.
  broadcastTTSAudio(chunk: TTSAudioChunk): void {
    if (this.role !== "host") return;
    this.transport.send({
      type: "tts_audio",
      turnId: chunk.turnId,
      index: chunk.index,
      dataB64: chunk.dataB64,
      done: chunk.done,
    });
  }

  // Host-only: broadcast the authoritative party-voice floor state.
  broadcastFloorState(floor: FloorSnapshot): void {
    if (this.role !== "host") return;
    this.transport.send({
      type: "floor_state",
      holderId: floor.holderId,
      lockedOutIds: floor.lockedOutIds,
      seq: this.nextSeq++,
    });
  }

  // Guest-only: request / release the party-voice floor.
  sendFloorTake(): void {
    if (this.role !== "guest") return;
    this.transport.send({ type: "floor_take", playerId: this.myLocalPlayerId });
  }

  sendFloorRelease(): void {
    if (this.role !== "guest") return;
    this.transport.send({ type: "floor_release", playerId: this.myLocalPlayerId });
  }

  sendOOCChat(text: string): void {
    this.transport.send({
      type: "ooc_chat",
      playerId: this.myLocalPlayerId,
      displayName: this.displayName,
      color: this.color,
      text,
      timestamp: Date.now(),
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
  sendDiceThrowResult(requestId: string, faces: number[][] | null): void {
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
    const claimed = this.announcedProfile;
    await this.leave();
    if (this.role === "host") {
      return NetSession.createHost(to, this.displayName, this.color, this.roomId);
    }
    const next = await NetSession.joinAsGuest(
      to,
      this.roomId,
      this.displayName,
      this.color,
    );
    // Re-claim the same profile across the swap so the guest keeps their seat
    // rather than being sent back to the profile picker.
    if (claimed) next.announceProfile(claimed);
    return next;
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

    if (msg.type === "ooc_chat") {
      if (msg.playerId !== this.myLocalPlayerId) {
        this.oocChatListeners.forEach((cb) =>
          cb({
            playerId: msg.playerId,
            displayName: msg.displayName,
            color: msg.color,
            text: msg.text,
            timestamp: msg.timestamp,
          }),
        );
      }
      if (this.role === "host") {
        // Same fan-out reasoning as presence_activity above.
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
            groups: msg.groups,
            formula: msg.formula,
            reason: msg.reason,
          }),
        );
      }
      return;
    }

    if (this.role === "host") {
      if (msg.type === "presence_join") {
        this.seatOwners.set(peerId, msg.playerId);
        this.guestJoinedListeners.forEach((cb) =>
          cb({
            localPlayerId: msg.playerId,
            displayName: msg.name,
            color: msg.color,
            archetype: msg.archetype ?? null,
            personalityTags: msg.personalityTags ?? null,
            wishTags: msg.wishTags ?? null,
          }),
        );
      } else if (msg.type === "player_pass") {
        // Seat-trusted exactly like player_action: the pass counts for the
        // seat this peer proved via presence_join, not its self-reported id.
        const localPlayerId = this.seatOwners.get(peerId);
        if (!localPlayerId) return;
        this.guestPassListeners.forEach((cb) => cb(localPlayerId));
      } else if (msg.type === "floor_take") {
        const localPlayerId = this.seatOwners.get(peerId);
        if (!localPlayerId) return;
        this.floorTakeListeners.forEach((cb) => cb(localPlayerId));
      } else if (msg.type === "floor_release") {
        const localPlayerId = this.seatOwners.get(peerId);
        if (!localPlayerId) return;
        this.floorReleaseListeners.forEach((cb) => cb(localPlayerId));
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
    } else if (msg.type === "turn_status") {
      this.turnStatusListeners.forEach((cb) =>
        cb({
          phase: msg.phase,
          submittedPlayerIds: msg.submittedPlayerIds,
          passedPlayerIds: msg.passedPlayerIds,
          expectedPlayerIds: msg.expectedPlayerIds,
        }),
      );
    } else if (msg.type === "story_stream") {
      this.storyStreamListeners.forEach((cb) =>
        cb({ turnId: msg.turnId, text: msg.text, stage: msg.stage, done: msg.done }),
      );
    } else if (msg.type === "tts_audio") {
      this.ttsAudioListeners.forEach((cb) =>
        cb({
          turnId: msg.turnId,
          index: msg.index,
          dataB64: msg.dataB64,
          done: msg.done,
        }),
      );
    } else if (msg.type === "floor_state") {
      this.floorStateListeners.forEach((cb) =>
        cb({ holderId: msg.holderId, lockedOutIds: msg.lockedOutIds }),
      );
    }
  }
}
