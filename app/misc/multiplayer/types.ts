// Shared types for the serverless P2P multiplayer layer (see transport.ts).
// Kept out of structs.ts because these describe transient connection state,
// not persisted StoryData.

import { StoryData, ScenePart } from "@/app/misc/structs";

export type MPBackend = "torrent" | "nostr" | "mqtt" | "peerjs" | "manual";
export type MPRole = "host" | "guest";

// Room/peer identifiers are plain alphanumeric so the same code works
// unmodified as both a Trystero roomId and a PeerJS peer id (PeerJS ids must
// start/end alphanumeric; keeping the whole thing alphanumeric sidesteps the
// question entirely for every current and future backend).
export type RoomId = string;

// Every WireMessage field must stay JSON-safe (no functions, Dates,
// undefined) since it crosses both the Trystero and PeerJS wire.
export type PresenceActivityState = "recording" | "processing" | "idle";
export type PlayerActionKind = "choice" | "freeform" | "voice";

export type WireMessage =
  | { type: "state_snapshot"; storyData: StoryData; seq: number }
  | { type: "story_delta"; scenePart: ScenePart; seq: number }
  | {
      type: "player_action";
      kind: PlayerActionKind;
      choiceIndex: number | null;
      text: string | null;
      // Host never trusts this - it re-derives the real speaker from its own
      // peerId -> seat map before applying the action. Carried here only so
      // the host can log/debug a mismatch.
      claimedSpeakerIds: string[] | null;
      playerId: string; // sender's stable local player id, see localPlayerId.ts
    }
  | {
      type: "presence_activity";
      playerId: string;
      state: PresenceActivityState;
    }
  | { type: "presence_join"; playerId: string; name: string; color: string }
  | { type: "backend_switch"; to: MPBackend };
