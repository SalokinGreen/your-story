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
  RoomId,
  WireMessage,
} from "./types";

export interface NetSessionInfo {
  role: MPRole;
  backend: MPBackend;
  roomId: RoomId;
  myLocalPlayerId: string;
}

export interface ValidatedGuestAction {
  localPlayerId: string;
  kind: PlayerActionKind;
  choiceIndex: number | null;
  text: string | null;
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

  private readonly snapshotListeners = new Set<(data: StoryData) => void>();
  private readonly guestActionListeners = new Set<
    (action: ValidatedGuestAction) => void
  >();
  private readonly guestJoinedListeners = new Set<
    (info: GuestJoinedInfo) => void
  >();
  private readonly peerLeftListeners = new Set<(localPlayerId: string) => void>();

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
    } else {
      this.transport.onPeerLeave((peerId) => {
        const localPlayerId = this.seatOwners.get(peerId);
        if (!localPlayerId) return;
        this.seatOwners.delete(peerId);
        this.peerLeftListeners.forEach((cb) => cb(localPlayerId));
      });
    }
  }

  static async createHost(
    backend: MPBackend,
    displayName: string,
    color: string,
  ): Promise<NetSession> {
    const roomId = generateRoomCode();
    const transport = createTransport(backend);
    const session = new NetSession("host", backend, roomId, transport, displayName, color);
    await transport.join(roomId);
    return session;
  }

  static async joinAsGuest(
    backend: MPBackend,
    roomId: RoomId,
    displayName: string,
    color: string,
  ): Promise<NetSession> {
    const transport = createTransport(backend);
    const session = new NetSession("guest", backend, roomId, transport, displayName, color);
    await transport.join(roomId);
    return session;
  }

  info(): NetSessionInfo {
    return {
      role: this.role,
      backend: this.backend,
      roomId: this.roomId,
      myLocalPlayerId: this.myLocalPlayerId,
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

  async leave(): Promise<void> {
    await this.transport.leave();
  }

  private handleMessage(peerId: string, msg: WireMessage): void {
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
      }
    } else if (msg.type === "state_snapshot") {
      this.snapshotListeners.forEach((cb) => cb(msg.storyData));
    }
  }
}
