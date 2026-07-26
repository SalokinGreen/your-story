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
  // presence_join is deferred until a profile is claimed - claim one keyed by
  // the guest's id so the host establishes the seat (mirroring the old
  // auto-announce behavior these tests were written against).
  guest.announceProfile({ profileId: guestId, name: "Guest Name", color: "#222222" });
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
    const guest = await NetSession.joinAsGuest("manual", "TESTROOM", "Guest Name", "#222222");
    // Deferred: the host learns the seat only once the guest claims a profile.
    expect(joined).not.toHaveBeenCalled();
    guest.announceProfile({
      profileId: "guest-1",
      name: "Guest Name",
      color: "#222222",
    });

    expect(joined).toHaveBeenCalledWith({
      localPlayerId: "guest-1",
      displayName: "Guest Name",
      color: "#222222",
      archetype: null,
      personalityTags: null,
      wishTags: null,
    });
  });

  it("carries a claimed profile's full fields to the host on join", async () => {
    const [hostTransport, guestTransport] = createFakeTransportPair();
    createTransport.mockImplementationOnce(() => hostTransport).mockImplementationOnce(() => guestTransport);

    setLocalPlayerId("host-1");
    const host = await NetSession.createHost("manual", "Host Name", "#111111");
    const joined = vi.fn();
    host.onGuestJoined(joined);

    setLocalPlayerId("device-xyz");
    const guest = await NetSession.joinAsGuest("manual", "TESTROOM", "Temp", "#000000");
    // Resume a *saved* profile whose id differs from this device's id - the
    // seat should be keyed by the claimed profile id, not the device.
    guest.announceProfile({
      profileId: "saved-hero",
      name: "Aria",
      color: "#22c55e",
      archetype: "storyteller",
      personalityTags: ["curious"],
      wishTags: ["mystery"],
    });

    expect(joined).toHaveBeenCalledWith({
      localPlayerId: "saved-hero",
      displayName: "Aria",
      color: "#22c55e",
      archetype: "storyteller",
      personalityTags: ["curious"],
      wishTags: ["mystery"],
    });

    // Actions from this peer now attribute to the claimed profile id.
    const action = vi.fn();
    host.onGuestAction(action);
    guest.sendChoice(1);
    expect(action).toHaveBeenCalledWith({
      localPlayerId: "saved-hero",
      kind: "choice",
      choiceIndex: 1,
      text: null,
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

  it("times out joining as guest when no host ever appears, and cleans up the transport", async () => {
    const leaveSpy = vi.fn(async () => {});
    // A transport that connects fine at the signaling level (join()
    // resolves) but never actually finds a peer - the realistic shape of
    // "wrong room code" or "host isn't there" for backends like Trystero,
    // whose join() resolves regardless of whether the room is reachable.
    const deadEndTransport: MultiplayerTransport = {
      backend: "manual",
      async join() {},
      onPeerJoin: () => {},
      onPeerLeave: () => {},
      onMessage: () => {},
      send: () => {},
      selfId: () => null,
      leave: leaveSpy,
    };
    createTransport.mockImplementationOnce(() => deadEndTransport);
    setLocalPlayerId("guest-lonely");

    await expect(
      NetSession.joinAsGuest("manual", "GHOSTRM", "Lonely", "#444444", 20),
    ).rejects.toThrow(/Couldn't find a host with room code "GHOSTRM"/);

    expect(leaveSpy).toHaveBeenCalledTimes(1);
  });

  it("delivers a dice_throw_request only to the guest it was sent for", async () => {
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

    const guest0Heard = vi.fn();
    const guest1Heard = vi.fn();
    guest0.onDiceThrowRequest(guest0Heard);
    guest1.onDiceThrowRequest(guest1Heard);

    host.sendDiceThrowRequest("req-1", "guest-1", {
      groups: [{ sides: 20, count: 1 }],
      formula: "1d20+5",
      reason: "Climb the wall",
    });

    expect(guest1Heard).toHaveBeenCalledWith({
      requestId: "req-1",
      groups: [{ sides: 20, count: 1 }],
      formula: "1d20+5",
      reason: "Climb the wall",
    });
    expect(guest0Heard).not.toHaveBeenCalled();
  });

  it("delivers a targeted guest's dice_throw_result back to the host", async () => {
    const { host, guest } = await createHostAndGuest("host-1", "guest-1");
    const result = vi.fn();
    host.onDiceThrowResult(result);

    host.sendDiceThrowRequest("req-1", "guest-1", {
      groups: [{ sides: 6, count: 2 }],
      formula: "2d6",
      reason: "Push the door",
    });
    guest.sendDiceThrowResult("req-1", [[4, 6]]);

    expect(result).toHaveBeenCalledWith({ requestId: "req-1", faces: [[4, 6]] });
  });

  it("relays every pool of a multi-pool throw, and the per-pool faces back", async () => {
    // A roll like Starforged's 1d6 action die + 2d10 challenge dice is one
    // throw on the guest's device, and its result has to come home as
    // separate pools - flattening them loses which die was which.
    const { host, guest } = await createHostAndGuest("host-1", "guest-1");
    const heard = vi.fn();
    const result = vi.fn();
    guest.onDiceThrowRequest(heard);
    host.onDiceThrowResult(result);

    host.sendDiceThrowRequest("req-1", "guest-1", {
      groups: [
        { sides: 6, count: 1 },
        { sides: 10, count: 2 },
      ],
      formula: "1d6+2 and 2d10",
      reason: "Face danger",
    });

    expect(heard).toHaveBeenCalledWith(
      expect.objectContaining({
        groups: [
          { sides: 6, count: 1 },
          { sides: 10, count: 2 },
        ],
      }),
    );

    guest.sendDiceThrowResult("req-1", [[4], [6, 8]]);
    expect(result).toHaveBeenCalledWith({
      requestId: "req-1",
      faces: [[4], [6, 8]],
    });
  });

  it("ignores a dice_throw_result from a guest the request wasn't sent to", async () => {
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

    const result = vi.fn();
    host.onDiceThrowResult(result);

    // Sent to guest-1, but guest-0 (a different, legitimately-seated peer)
    // tries to answer it - the host must not accept a result from anyone
    // other than the guest it actually asked.
    host.sendDiceThrowRequest("req-1", "guest-1", {
      groups: [{ sides: 6, count: 1 }],
      formula: "1d6",
      reason: "Test",
    });
    guest0.sendDiceThrowResult("req-1", [[3]]);

    expect(result).not.toHaveBeenCalled();
  });

  it("ignores an unsolicited dice_throw_result with an unknown requestId", async () => {
    const { host, guest } = await createHostAndGuest("host-1", "guest-1");
    const result = vi.fn();
    host.onDiceThrowResult(result);

    guest.sendDiceThrowResult("never-requested", [[1]]);

    expect(result).not.toHaveBeenCalled();
  });

  it("delivers a guest's pass to the host with the trusted seat id", async () => {
    const { host, guest } = await createHostAndGuest("host-1", "guest-1");
    const passed = vi.fn();
    host.onGuestPass(passed);

    guest.sendPass();

    expect(passed).toHaveBeenCalledWith("guest-1");
  });

  it("ignores a pass / floor request from an unseated peer", async () => {
    const [hostTransport, rogueTransport] = createFakeTransportPair();
    createTransport.mockImplementationOnce(() => hostTransport);
    setLocalPlayerId("host-1");
    const host = await NetSession.createHost("manual", "Host", "#111111");

    const passed = vi.fn();
    const took = vi.fn();
    host.onGuestPass(passed);
    host.onFloorTake(took);

    rogueTransport.send({ type: "player_pass", playerId: "impostor" });
    rogueTransport.send({ type: "floor_take", playerId: "impostor" });

    expect(passed).not.toHaveBeenCalled();
    expect(took).not.toHaveBeenCalled();
  });

  it("relays party-voice floor take/release to the host, seat-trusted", async () => {
    const { host, guest } = await createHostAndGuest("host-1", "guest-1");
    const took = vi.fn();
    const released = vi.fn();
    host.onFloorTake(took);
    host.onFloorRelease(released);

    guest.sendFloorTake();
    guest.sendFloorRelease();

    expect(took).toHaveBeenCalledWith("guest-1");
    expect(released).toHaveBeenCalledWith("guest-1");
  });

  it("broadcasts turn status, story stream, tts audio and floor state to guests", async () => {
    const { host, guest } = await createHostAndGuest("host-1", "guest-1");
    const turnStatus = vi.fn();
    const storyStream = vi.fn();
    const ttsAudio = vi.fn();
    const floorState = vi.fn();
    guest.onTurnStatus(turnStatus);
    guest.onStoryStream(storyStream);
    guest.onTTSAudio(ttsAudio);
    guest.onFloorState(floorState);

    host.broadcastTurnStatus({
      phase: "collecting",
      submittedPlayerIds: ["host-1"],
      passedPlayerIds: [],
      expectedPlayerIds: ["host-1", "guest-1"],
    });
    host.broadcastStoryStream({
      turnId: "t1",
      text: "The door creaks open",
      stage: "story",
      done: false,
    });
    host.broadcastTTSAudio({ turnId: "t1", index: 0, dataB64: "AAAA", done: false });
    host.broadcastFloorState({ holderId: "guest-1", lockedOutIds: ["host-1"] });

    expect(turnStatus).toHaveBeenCalledWith({
      phase: "collecting",
      submittedPlayerIds: ["host-1"],
      passedPlayerIds: [],
      expectedPlayerIds: ["host-1", "guest-1"],
    });
    expect(storyStream).toHaveBeenCalledWith({
      turnId: "t1",
      text: "The door creaks open",
      stage: "story",
      done: false,
    });
    expect(ttsAudio).toHaveBeenCalledWith({
      turnId: "t1",
      index: 0,
      dataB64: "AAAA",
      done: false,
    });
    expect(floorState).toHaveBeenCalledWith({
      holderId: "guest-1",
      lockedOutIds: ["host-1"],
    });
  });

  it("won't let a guest broadcast host-only feeds or a host send guest-only ones", async () => {
    const { host, guest } = await createHostAndGuest("host-1", "guest-1");
    const guestTurnStatus = vi.fn();
    const hostFloorTake = vi.fn();
    guest.onTurnStatus(guestTurnStatus);
    host.onFloorTake(hostFloorTake);

    // Guest can't broadcast a host-authoritative feed...
    guest.broadcastFloorState({ holderId: "guest-1", lockedOutIds: [] });
    // ...and a host can't send a guest-only floor request.
    host.sendFloorTake();
    host.sendPass();

    expect(guestTurnStatus).not.toHaveBeenCalled();
    expect(hostFloorTake).not.toHaveBeenCalled();
  });
});
