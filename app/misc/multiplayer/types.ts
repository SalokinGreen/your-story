// Shared types for the serverless P2P multiplayer layer (see transport.ts).
// Kept out of structs.ts because these describe transient connection state,
// not persisted StoryData.

import { StoryData, ScenePart, PlayerArchetype } from "@/app/misc/structs";

export type MPBackend = "torrent" | "nostr" | "mqtt" | "peerjs" | "manual";
export type MPRole = "host" | "guest";

// User-selectable subset of MPBackend - "manual" is a fallback the code can
// switch to but never something a player picks from a dropdown, so it's
// deliberately left out of this list. Shared across every host/join UI
// (OnlinePlayEditor, and the Library/home "Host"/"Join a Game" entry points)
// so they can't drift out of sync with each other.
export const MP_BACKEND_OPTIONS: { value: MPBackend; label: string }[] = [
  { value: "torrent", label: "Default (BitTorrent)" },
  { value: "nostr", label: "Nostr" },
  { value: "mqtt", label: "MQTT" },
  { value: "peerjs", label: "PeerJS Cloud" },
];

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
  | {
      type: "presence_join";
      // The CLAIMED player-profile id, which a guest picks when joining: either
      // an existing saved profile's id (resuming that seat from any device) or
      // a freshly-generated id for a brand-new profile. Not necessarily the
      // guest's device id - see NetSession.announceProfile / getLocalPlayerId.
      playerId: string;
      name: string;
      color: string;
      // Full profile fields so the host can rebuild a complete CouchPlayer
      // (bubble + director-layer data), not just a bare name/color seat. Only
      // sent for guest-created profiles; omitted when resuming a saved one the
      // host already has.
      archetype?: PlayerArchetype | null;
      personalityTags?: string[] | null;
      wishTags?: string[] | null;
    }
  | { type: "backend_switch"; to: MPBackend }
  // Host -> guests: who has submitted / passed for the current collection
  // round, and who's still expected. Lets guests show a "waiting on N players"
  // lobby instead of a blind spinner while the host batches everyone's input
  // into a single turn (see turnBatch.ts). "generating" means the batched turn
  // has started; "collecting" means the host is still waiting on inputs.
  | {
      type: "turn_status";
      phase: "collecting" | "generating";
      submittedPlayerIds: string[];
      passedPlayerIds: string[];
      expectedPlayerIds: string[];
      seq: number;
    }
  // Guest -> host: this player has nothing to add this round; count them ready
  // so the turn can fire without waiting on them. Seat-trusted like
  // player_action (the host re-derives the real speaker from its seat map).
  | { type: "player_pass"; playerId: string }
  // Host -> guests: the host's narration as it streams, so guests watch the
  // story being written live (and can TTS it) instead of only seeing the final
  // snapshot. `done` flips true on the last chunk of a turn; the authoritative
  // StoryData still arrives via state_snapshot afterward. turnId lets a guest
  // discard late chunks from a previous turn.
  | {
      type: "story_stream";
      turnId: string;
      text: string;
      stage: "gm" | "story" | "choices" | null;
      done: boolean;
      seq: number;
    }
  // Host -> guests: one relayed MP3 chunk of the host's TTS narration, so
  // guests hear exactly what the host hears without needing their own TTS key.
  // Bytes are base64 to stay JSON-safe across both transports; `index` is the
  // chunk's play order, and a new turnId resets the guest's relay buffer.
  | {
      type: "tts_audio";
      turnId: string;
      index: number;
      dataB64: string;
      done: boolean;
    }
  // Host -> guests: party-voice floor state. Only one player holds the mic at a
  // time; a just-interrupted player is briefly locked out so they can't steal
  // it straight back (see floorControl.ts). Host is authoritative.
  | {
      type: "floor_state";
      holderId: string | null;
      lockedOutIds: string[];
      seq: number;
    }
  // Guest -> host: I tapped my mic and want the floor (last-presser-wins). Host
  // arbitrates and answers with floor_state. Seat-trusted like player_action.
  | { type: "floor_take"; playerId: string }
  // Guest -> host: I released the floor (finished/cancelled my recording).
  | { type: "floor_release"; playerId: string }
  // Physical dice mode: host asks a specific guest (the one whose freeform/
  // voice action triggered this turn) to throw the dice themselves, rather
  // than the host throwing locally on their behalf.
  | {
      type: "dice_throw_request";
      requestId: string;
      forPlayerId: string;
      // Every pool the roll needs, thrown in one toss on the guest's device.
      groups: { sides: number; count: number }[];
      formula: string;
      reason: string;
    }
  | {
      type: "dice_throw_result";
      requestId: string;
      // One face array per requested group, in the same order.
      // null = the targeted guest skipped/cancelled the throw.
      faces: number[][] | null;
    }
  // Out-of-character chat between online players - the GM never sees this,
  // it's not part of StoryData and never enters the AI prompt context.
  | {
      type: "ooc_chat";
      playerId: string;
      displayName: string;
      color: string;
      text: string;
      timestamp: number;
    };
