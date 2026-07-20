// Backend-agnostic interface every signaling adapter implements. Trystero's
// three strategies (torrent/nostr/mqtt) and PeerJS both hide behind this so
// hostSync/guestSync and the UI never need to know which one is active -
// switching backends mid-session is just tearing down one adapter and
// joining the same roomId under another (see session.ts).
import { MPBackend, MPRole, RoomId, WireMessage } from "./types";

export interface MultiplayerTransport {
  readonly backend: MPBackend;

  // role matters for backends with an inherent asymmetry (PeerJS: only a
  // host claims the room code as its own peer id; a guest always connects
  // out to it) - a backend without that asymmetry (Trystero's mesh) can
  // just ignore it. Passing the wrong role for the caller's actual intent
  // is a caller bug, not something the transport should paper over by
  // guessing.
  join(roomId: RoomId, role: MPRole): Promise<void>;

  onPeerJoin(cb: (peerId: string) => void): void;
  onPeerLeave(cb: (peerId: string) => void): void;
  onMessage(cb: (peerId: string, msg: WireMessage) => void): void;

  // Omitting toPeerId broadcasts to every connected peer.
  send(msg: WireMessage, toPeerId?: string): void;

  // Null until the transport has finished connecting to its signaling
  // channel/broker (Trystero: immediate; PeerJS: after the "open" event).
  selfId(): string | null;

  leave(): Promise<void>;
}
