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

function describePeerError(err: Error & { type?: string }): Error {
  if (err.type === "unavailable-id") {
    return new Error(
      "That room code is already in use on PeerJS - go back and create a new room to get a fresh code.",
    );
  }
  return err;
}

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

    async join(roomId, role) {
      // Respects the caller's declared role rather than racing to claim the
      // room id and silently falling back - session.ts already decided
      // whether this is a host or a guest, and a name collision on the
      // host side should be a clear, surfaced error, not a silent demotion
      // to guest that leaves a NetSession thinking it's the host while the
      // transport underneath it is actually a spoke.
      await new Promise<void>((resolve, reject) => {
        if (role === "host") {
          const hostPeer = new Peer(roomId);
          hostPeer.on("open", () => {
            peer = hostPeer;
            peer.on("connection", wireConnection);
            resolve();
          });
          hostPeer.on("error", (err) => {
            hostPeer.destroy();
            reject(describePeerError(err));
          });
        } else {
          const guestPeer = new Peer();
          guestPeer.on("open", () => {
            peer = guestPeer;
            const conn = guestPeer.connect(roomId);
            wireConnection(conn);
            resolve();
          });
          guestPeer.on("error", (err) => {
            guestPeer.destroy();
            reject(describePeerError(err));
          });
        }
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
