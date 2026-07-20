// PeerJS adapter, using the free public cloud broker (0.peerjs.com, the
// default when no host/port is configured) purely for signaling - kept as a
// backend option structurally independent from Trystero's trackers/relays,
// so a network that blocks one still has a shot at the other.
//
// Unlike Trystero, PeerJS has no room concept - a Peer just connects
// pairwise to another Peer by id. That's fine here because the app is
// already host-authoritative (only host<->guest links are ever needed, no
// guest<->guest mesh), so this adapter is a star: the host's Peer id *is*
// the room code and it accepts N incoming connections; each guest is a Peer
// with an auto-assigned id that connects out to that one code.
import Peer, { type DataConnection } from "peerjs";
import type { MultiplayerTransport } from "../transport";
import type { WireMessage } from "../types";

export function createPeerjsTransport(): MultiplayerTransport {
  let peer: Peer | null = null;
  const connections = new Map<string, DataConnection>();
  const peerJoinCbs: Array<(peerId: string) => void> = [];
  const peerLeaveCbs: Array<(peerId: string) => void> = [];
  const messageCbs: Array<(peerId: string, msg: WireMessage) => void> = [];

  function wireConnection(conn: DataConnection) {
    conn.on("open", () => {
      connections.set(conn.peer, conn);
      for (const cb of peerJoinCbs) cb(conn.peer);
    });
    conn.on("data", (data) => {
      for (const cb of messageCbs) cb(conn.peer, data as WireMessage);
    });
    conn.on("close", () => {
      connections.delete(conn.peer);
      for (const cb of peerLeaveCbs) cb(conn.peer);
    });
  }

  return {
    backend: "peerjs",

    async join(roomId) {
      // Try to claim the room code as our own id first. If it's already
      // taken, PeerJS emits an "unavailable-id" error and we fall back to an
      // auto-assigned id and connect out to the room code instead. This lets
      // one adapter cover both sides of the star without the caller
      // pre-declaring a transport-level role - which peer becomes host is a
      // separate, app-level decision made by session.ts/hostSync.ts (it
      // creates the room first, so it wins the id race in the normal case).
      await new Promise<void>((resolve, reject) => {
        const hostAttempt = new Peer(roomId);

        hostAttempt.on("open", () => {
          peer = hostAttempt;
          peer.on("connection", wireConnection);
          resolve();
        });

        hostAttempt.on("error", (err) => {
          if (err.type !== "unavailable-id") {
            reject(err);
            return;
          }
          hostAttempt.destroy();

          const guestPeer = new Peer();
          guestPeer.on("open", () => {
            peer = guestPeer;
            const conn = guestPeer.connect(roomId);
            wireConnection(conn);
            resolve();
          });
          guestPeer.on("error", (guestErr) => reject(guestErr));
        });
      });
    },

    onPeerJoin(cb) {
      peerJoinCbs.push(cb);
    },
    onPeerLeave(cb) {
      peerLeaveCbs.push(cb);
    },
    onMessage(cb) {
      messageCbs.push(cb);
    },

    send(msg, toPeerId) {
      if (!peer) throw new Error("PeerJS transport not joined yet");
      if (toPeerId) {
        connections.get(toPeerId)?.send(msg);
        return;
      }
      for (const conn of connections.values()) conn.send(msg);
    },

    selfId() {
      // The host's selfId is the room code itself; a guest's is its
      // PeerJS-assigned id, not the host's - callers that need "am I
      // talking to the host" should compare against the known roomId
      // instead of relying on selfId's shape.
      return peer?.open ? peer.id : null;
    },

    async leave() {
      for (const conn of connections.values()) conn.close();
      connections.clear();
      peer?.destroy();
      peer = null;
    },
  };
}
