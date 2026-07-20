import type { MultiplayerTransport } from "../transport";
import type { MPBackend } from "../types";
import { createTrysteroTransport } from "./trystero";
import { createPeerjsTransport } from "./peerjs";

// "manual" (copy-paste/QR SDP exchange, no third-party relay at all) is
// deliberately not implemented yet - see the phased plan; every other
// backend name is wired up here.
export function createTransport(backend: MPBackend): MultiplayerTransport {
  switch (backend) {
    case "torrent":
    case "nostr":
    case "mqtt":
      return createTrysteroTransport(backend);
    case "peerjs":
      return createPeerjsTransport();
    case "manual":
      throw new Error("Manual signaling backend isn't implemented yet");
  }
}

// Room codes double as Trystero roomIds and PeerJS peer ids, so they're kept
// alphanumeric only (PeerJS ids must start/end alphanumeric; keeping the
// whole thing alphanumeric sidesteps the question for every backend).
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const ROOM_CODE_LENGTH = 6;

export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}
