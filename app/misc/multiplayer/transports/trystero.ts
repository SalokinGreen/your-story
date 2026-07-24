// Trystero adapter, shared across the torrent/nostr/mqtt strategies - they
// all expose an identical joinRoom/Room API, so one implementation covers
// all three "hosting options". NOTE: trystero's own "trystero/torrent" and
// "trystero/mqtt" subpaths are deprecated no-op shims as of 0.25 - the real
// implementations moved to the scoped @trystero-p2p/* packages, which is
// what we import here.
import { joinRoom as joinTorrent } from "@trystero-p2p/torrent";
import { joinRoom as joinNostr } from "@trystero-p2p/nostr";
import { joinRoom as joinMqtt } from "@trystero-p2p/mqtt";
import { selfId, type Room } from "@trystero-p2p/core";
import type { MultiplayerTransport } from "../transport";
import type { WireMessage } from "../types";

export type TrysteroStrategy = "torrent" | "nostr" | "mqtt";

const joinRoomByStrategy: Record<TrysteroStrategy, typeof joinTorrent> = {
  torrent: joinTorrent,
  nostr: joinNostr,
  mqtt: joinMqtt,
};

// Must be globally unique-ish so unrelated Trystero apps don't collide with
// our rooms on the shared trackers/relays.
const APP_ID = "your-story-mp-v1";
const ACTION_NAMESPACE = "mp";

// Trystero's built-in redundancy (how many of its default relays/trackers it
// actually contacts) varies a lot by strategy: nostr tries 5 of ~15 (shuffled
// per appId), mqtt tries 4 of 5, but the torrent strategy only tries a fixed
// 3 of its 5 known public WebTorrent trackers - always the same three, never
// shuffled. Public WSS trackers flake/overload individually often enough
// that this made "torrent" (our default backend) unreliable while the other
// strategies stayed fine. Force it to use all 5 known trackers instead.
const relayConfigByStrategy: Partial<
  Record<TrysteroStrategy, { redundancy: number }>
> = {
  torrent: { redundancy: 5 },
};

// Trystero's makeAction<T> requires T to structurally satisfy its JsonValue
// bound, which StoryData (many optional fields, deep tree) doesn't cleanly
// satisfy under strict mode. We know every WireMessage we construct is
// already JSON-safe (same guarantee StoryData already relies on for
// localStoryManager persistence), so the cast below is a single, deliberate
// boundary-crossing rather than a bound-driven type rewrite of our messages.
interface TypedAction {
  send: (data: WireMessage, options?: { target?: string }) => Promise<void>;
  onMessage: ((data: WireMessage, ctx: { peerId: string }) => void) | null;
}

export function createTrysteroTransport(
  strategy: TrysteroStrategy,
): MultiplayerTransport {
  let room: Room | null = null;
  let action: TypedAction | null = null;
  const peerJoinCbs: Array<(peerId: string) => void> = [];
  const peerLeaveCbs: Array<(peerId: string) => void> = [];
  const messageCbs: Array<(peerId: string, msg: WireMessage) => void> = [];

  return {
    backend: strategy,

    async join(roomId) {
      room = joinRoomByStrategy[strategy](
        { appId: APP_ID, relayConfig: relayConfigByStrategy[strategy] },
        roomId,
      );
      action = room.makeAction(ACTION_NAMESPACE) as unknown as TypedAction;
      action.onMessage = (data, { peerId }) => {
        for (const cb of messageCbs) cb(peerId, data);
      };
      room.onPeerJoin = (peerId) => {
        for (const cb of peerJoinCbs) cb(peerId);
      };
      room.onPeerLeave = (peerId) => {
        for (const cb of peerLeaveCbs) cb(peerId);
      };
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
      if (!action) throw new Error("Trystero transport not joined yet");
      action.send(msg, toPeerId ? { target: toPeerId } : undefined);
    },

    selfId() {
      // Trystero derives one crypto identity per browser tab/session, shared
      // by every strategy package since they all import it from the same
      // @trystero-p2p/core singleton - it's stable regardless of which
      // strategy is active. Gated on `room` so it matches the interface's
      // "null until connected" contract rather than being available pre-join.
      return room ? selfId : null;
    },

    async leave() {
      await room?.leave();
      room = null;
      action = null;
    },
  };
}
