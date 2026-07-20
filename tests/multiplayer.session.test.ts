import { afterEach, describe, expect, it, vi } from "vitest";
import type { StoryData } from "../app/misc/structs";
import type { MultiplayerTransport } from "../app/misc/multiplayer/transport";
import type { WireMessage } from "../app/misc/multiplayer/types";

const createTransport = vi.fn();

vi.mock("../app/misc/multiplayer/transports", () => ({
  createTransport: (...args: unknown[]) => createTransport(...args),
  generateRoomCode: () => "TESTROOM",
}));

// Models a real browser tab's persistent localPlayerId: stable across
// repeated calls (e.g. switchBackend() reconstructing a NetSession for the
// same actor), only changing when a test explicitly simulates moving to a
// different device via setLocalPlayerId().
let currentLocalPlayerId = "unknown-player";
function setLocalPlayerId(id: string) {
  currentLocalPlayerId = id;
}
vi.mock("../app/misc/localPlayerId", () => ({
  getLocalPlayerId: () => currentLocalPlayerId,
}));

// Dynamically imported after the mocks above are registered, so NetSession
// picks up the mocked transport factory and player id source.
const { NetSession } = await import("../app/misc/multiplayer/session");

// Minimal two-ended fake transport: send() on one side synchronously
// delivers to the other side's onMessage listeners, mirroring how a real
// broadcast reaches every other connected peer. Good enough to exercise
// NetSession's routing/trust logic without any real networking.
//
// join() ordering matters here the same way it does for a real transport:
// the host's NetSession constructs and joins first, when no peer exists yet
// (no peerJoin fires). The guest's join() is what actually completes the
// handshake, so it's the one that fires peerJoin on *both* sides - by then
// both NetSessions have already registered their listeners in their
// constructors.
function createFakeTransportPair(): [MultiplayerTransport, MultiplayerTransport] {
  const messageCbsA: Array<(peerId: string, msg: WireMessage) => void> = [];
  const messageCbsB: Array<(peerId: string, msg: WireMessage) => void> = [];
  const peerJoinCbsA: Array<(peerId: string) => void> = [];
  const peerJoinCbsB: Array<(peerId: string) => void> = [];
  const peerLeaveCbsA: Array<(peerId: string) => void> = [];
  const peerLeaveCbsB: Array<(peerId: string) => void> = [];

  const transportA: MultiplayerTransport = {
    backend: "manual",
    async join() {
      // Called first (by the host) - no counterpart connected yet.
    },
    onPeerJoin: (cb) => peerJoinCbsA.push(cb),
    onPeerLeave: (cb) => peerLeaveCbsA.push(cb),
    onMessage: (cb) => messageCbsA.push(cb),
    send: (msg) => messageCbsB.forEach((cb) => cb("peer-a", msg)),
    selfId: () => "peer-a",
    leave: async () => peerLeaveCbsB.forEach((cb) => cb("peer-a")),
  };

  const transportB: MultiplayerTransport = {
    backend: "manual",
    async join() {
      // Called second (by the guest) - completes the handshake for both sides.
      peerJoinCbsB.forEach((cb) => cb("peer-a"));
      peerJoinCbsA.forEach((cb) => cb("peer-b"));
    },
    onPeerJoin: (cb) => peerJoinCbsB.push(cb),
    onPeerLeave: (cb) => peerLeaveCbsB.push(cb),
    onMessage: (cb) => messageCbsB.push(cb),
    send: (msg) => messageCbsA.forEach((cb) => cb("peer-b", msg)),
    selfId: () => "peer-b",
    leave: async () => peerLeaveCbsA.forEach((cb) => cb("peer-b")),
  };

  return [transportA, transportB];
}

// Models PeerJS's star topology specifically (not Trystero's mesh): a spoke
// can only ever reach the center directly, mirroring real PeerJS where a
// guest has exactly one DataConnection, to the host. This is the topology
// where NetSession's host-side relay of presence_activity actually matters -
// without it, two guests could never hear each other at all.
function createFakeStarHub(spokeCount: number): MultiplayerTransport[] {
  const ids = ["center", ...Array.from({ length: spokeCount }, (_, i) => `spoke-${i}`)];
  const messageCbs: Array<Array<(peerId: string, msg: WireMessage) => void>> = ids.map(() => []);
  const peerJoinCbs: Array<Array<(peerId: string) => void>> = ids.map(() => []);
  const peerLeaveCbs: Array<Array<(peerId: string) => void>> = ids.map(() => []);

  return ids.map((selfId, index) => ({
    backend: "manual",
    async join() {
      if (index === 0) return; // center joins first, alone - nothing to connect to yet
      peerJoinCbs[0].forEach((cb) => cb(ids[index]));
      peerJoinCbs[index].forEach((cb) => cb(ids[0]));
    },
    onPeerJoin: (cb) => peerJoinCbs[index].push(cb),
    onPeerLeave: (cb) => peerLeaveCbs[index].push(cb),
    onMessage: (cb) => messageCbs[index].push(cb),
    send: (msg) => {
      if (index === 0) {
        for (let i = 1; i < ids.length; i++) {
          messageCbs[i].forEach((cb) => cb(ids[0], msg));
        }
      } else {
        messageCbs[0].forEach((cb) => cb(ids[index], msg));
      }
    },
    selfId: () => ids[index],
    leave: async () => {
      if (index === 0) return;
      peerLeaveCbs[0].forEach((cb) => cb(ids[index]));
      peerLeaveCbs[index].forEach((cb) => cb(ids[0]));
    },
  }));
}

async function createHostAndGuest(hostId: string, guestId: string) {
  const [hostTransport, guestTransport] = createFakeTransportPair();
  createTransport.mockImplementationOnce(() => hostTransport).mockImplementationOnce(() => guestTransport);

  setLocalPlayerId(hostId);
  const host = await NetSession.createHost("manual", "Host Name", "#111111");
  setLocalPlayerId(guestId);
  const guest = await NetSession.joinAsGuest("manual", "TESTROOM", "Guest Name", "#222222");
  return { host, guest };
}

function fakeStoryData(overrides: Partial<StoryData> = {}): StoryData {
  return { story_name: "Test", goals: [], threads: [], ...overrides } as StoryData;
}

afterEach(() => {
  createTransport.mockReset();
  currentLocalPlayerId = "unknown-player";
});

describe("NetSession", () => {
  it("host learns the guest's seat from presence_join", async () => {
    // Built manually (not via createHostAndGuest) so the listener can be
    // registered between host creation and guest creation - presence_join
    // fires synchronously as part of the guest's join() handshake, so
    // subscribing afterward would miss it.
    const [hostTransport, guestTransport] = createFakeTransportPair();
    createTransport.mockImplementationOnce(() => hostTransport).mockImplementationOnce(() => guestTransport);

    setLocalPlayerId("host-1");
    const host = await NetSession.createHost("manual", "Host Name", "#111111");
    const joined = vi.fn();
    host.onGuestJoined(joined);

    setLocalPlayerId("guest-1");
    await NetSession.joinAsGuest("manual", "TESTROOM", "Guest Name", "#222222");

    expect(joined).toHaveBeenCalledWith({
      localPlayerId: "guest-1",
      displayName: "Guest Name",
      color: "#222222",
    });
  });

  it("delivers a guest's choice action to the host with the trusted seat id", async () => {
    const { host, guest } = await createHostAndGuest("host-1", "guest-1");
    const action = vi.fn();
    host.onGuestAction(action);

    guest.sendChoice(2);

    expect(action).toHaveBeenCalledWith({
      localPlayerId: "guest-1",
      kind: "choice",
      choiceIndex: 2,
      text: null,
    });
  });

  it("ignores a guest's claimed speaker id and substitutes the trusted seat owner", async () => {
    const { host, guest } = await createHostAndGuest("host-1", "guest-1");
    const action = vi.fn();
    host.onGuestAction(action);

    // A modified client could set claimedSpeakerIds to anything; NetSession
    // must not surface that value at all, only the seat the host itself
    // learned via presence_join.
    guest.sendFreeform("I attack the goblin", ["someone-elses-seat"]);

    expect(action).toHaveBeenCalledTimes(1);
    const delivered = action.mock.calls[0][0];
    expect(delivered.localPlayerId).toBe("guest-1");
    expect(delivered.kind).toBe("freeform");
    expect(delivered.text).toBe("I attack the goblin");
  });

  it("ignores player_action from a peer that never sent presence_join", async () => {
    const [hostTransport, rogueTransport] = createFakeTransportPair();
    createTransport.mockImplementationOnce(() => hostTransport);
    setLocalPlayerId("host-1");
    const host = await NetSession.createHost("manual", "Host", "#111111");

    const action = vi.fn();
    host.onGuestAction(action);

    // Bypass NetSession entirely and send a raw player_action straight over
    // the transport, simulating a peer that connected but never announced
    // itself (or a client that skips presence_join on purpose).
    rogueTransport.send({
      type: "player_action",
      kind: "choice",
      choiceIndex: 0,
      text: null,
      claimedSpeakerIds: null,
      playerId: "impersonator",
    });

    expect(action).not.toHaveBeenCalled();
  });

  it("applies a host's broadcast snapshot on the guest side", async () => {
    const { host, guest } = await createHostAndGuest("host-1", "guest-1");
    const snapshot = vi.fn();
    guest.onSnapshot(snapshot);

    const storyData = fakeStoryData({ story_name: "Broadcast Test" });
    host.broadcastSnapshot(storyData);

    expect(snapshot).toHaveBeenCalledWith(storyData);
  });

  it("does not let a guest broadcast a snapshot or a host send a player action", async () => {
    const { host, guest } = await createHostAndGuest("host-1", "guest-1");
    const hostAction = vi.fn();
    const guestSnapshot = vi.fn();
    host.onGuestAction(hostAction);
    guest.onSnapshot(guestSnapshot);

    guest.broadcastSnapshot(fakeStoryData()); // no-op: guest.role !== "host"
    host.sendChoice(0); // no-op: host.role !== "guest"

    expect(hostAction).not.toHaveBeenCalled();
    expect(guestSnapshot).not.toHaveBeenCalled();
  });

  it("cleans up the seat when the guest's connection drops", async () => {
    const { host, guest } = await createHostAndGuest("host-1", "guest-1");
    const left = vi.fn();
    host.onPeerLeft(left);

    await guest.leave();

    expect(left).toHaveBeenCalledWith("guest-1");

    // With the seat gone, a stray action from that peerId is ignored again.
    const action = vi.fn();
    host.onGuestAction(action);
    guest.sendChoice(0);
    expect(action).not.toHaveBeenCalled();
  });

  it("relays a guest's activity to other guests in a star topology (PeerJS)", async () => {
    const [centerTransport, spoke0, spoke1] = createFakeStarHub(2);
    createTransport
      .mockImplementationOnce(() => centerTransport)
      .mockImplementationOnce(() => spoke0)
      .mockImplementationOnce(() => spoke1);

    setLocalPlayerId("host-1");
    const host = await NetSession.createHost("manual", "Host", "#111111");
    setLocalPlayerId("guest-0");
    const guest0 = await NetSession.joinAsGuest("manual", "TESTROOM", "G0", "#222222");
    setLocalPlayerId("guest-1");
    const guest1 = await NetSession.joinAsGuest("manual", "TESTROOM", "G1", "#333333");

    const hostHeard = vi.fn();
    const guest1Heard = vi.fn();
    const guest0Heard = vi.fn();
    host.onActivity(hostHeard);
    guest1.onActivity(guest1Heard);
    guest0.onActivity(guest0Heard); // should never fire for its own activity

    guest0.sendActivity("recording");

    expect(hostHeard).toHaveBeenCalledWith("guest-0", "recording");
    expect(guest1Heard).toHaveBeenCalledWith("guest-0", "recording");
    expect(guest0Heard).not.toHaveBeenCalled();
  });

  it("tells a guest when the host disconnects", async () => {
    const { host, guest } = await createHostAndGuest("host-1", "guest-1");
    const disconnected = vi.fn();
    guest.onHostDisconnected(disconnected);

    await host.leave();

    expect(disconnected).toHaveBeenCalledTimes(1);
  });

  it("switchBackend preserves role/roomId/identity across a transport swap", async () => {
    const { host } = await createHostAndGuest("host-1", "guest-1");
    const [newHostTransport] = createFakeTransportPair();
    createTransport.mockImplementationOnce(() => newHostTransport);

    // switchBackend runs on the host's own device, so its device identity
    // is still "host-1" - reset it here since createHostAndGuest left the
    // fixture's shared identity pointed at the guest it created last.
    setLocalPlayerId("host-1");
    const switched = await host.switchBackend("peerjs");

    expect(switched.role).toBe("host");
    expect(switched.roomId).toBe(host.roomId);
    expect(switched.backend).toBe("peerjs");
    expect(switched.myLocalPlayerId).toBe(host.myLocalPlayerId);
  });

  it("notifies a guest to follow when the host switches backends", async () => {
    const { host, guest } = await createHostAndGuest("host-1", "guest-1");
    const switchTo = vi.fn();
    guest.onBackendSwitch(switchTo);

    const [newHostTransport] = createFakeTransportPair();
    createTransport.mockImplementationOnce(() => newHostTransport);
    setLocalPlayerId("host-1");
    await host.switchBackend("peerjs");

    expect(switchTo).toHaveBeenCalledWith("peerjs");
  });
});
