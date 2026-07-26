// React wrapper around NetSession: owns the session's lifetime, keeps a
// reactive NetSessionInfo for render, and re-broadcasts storyData to guests
// whenever it changes while the host isn't mid-turn. Turn-completion is just
// one instance of that ("loading flips back to false") - any other
// host-side edit to storyData (e.g. a menu edit) propagates the same way,
// which is the behavior a host-authoritative model wants anyway.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StoryData } from "@/app/misc/structs";
import {
  ClaimedProfile,
  DiceThrowRelayRequest,
  DiceThrowRelayResult,
  FloorSnapshot,
  GuestJoinedInfo,
  NetSession,
  NetSessionInfo,
  OOCChatMessage,
  StoryStreamUpdate,
  TTSAudioChunk,
  TurnStatus,
  ValidatedGuestAction,
} from "./session";
import type { MPBackend, PresenceActivityState, RoomId } from "./types";

interface UseNetSessionParams {
  storyData: StoryData | null;
  loading: boolean;
  // Host-only: called for an incoming, seat-validated guest action.
  onGuestAction: (action: ValidatedGuestAction) => void;
  // Guest-only: called when the host pushes a new authoritative state.
  onSnapshot: (storyData: StoryData) => void;
  // Host-only: called when a new guest announces itself.
  onGuestJoined: (info: GuestJoinedInfo) => void;
  // Host-only: called when a connected guest's link drops.
  onPeerLeft?: (localPlayerId: string) => void;
  // Guest-only: the host is asking this player to physically throw dice.
  onDiceThrowRequest?: (request: DiceThrowRelayRequest) => void;
  // Host-only: a targeted guest's throw settled (or they skipped it).
  onDiceThrowResult?: (result: DiceThrowRelayResult) => void;
  // Host-only: a guest passed the current collection round.
  onGuestPass?: (localPlayerId: string) => void;
  // Guest-only: the host's live turn-collection status.
  onTurnStatus?: (status: TurnStatus) => void;
  // Guest-only: a relayed slice of the host's live narration.
  onStoryStream?: (update: StoryStreamUpdate) => void;
  // Guest-only: a relayed MP3 chunk of the host's TTS narration.
  onTTSAudio?: (chunk: TTSAudioChunk) => void;
  // Guest-only: the host-authoritative party-voice floor changed.
  onFloorState?: (floor: FloorSnapshot) => void;
  // Host-only: a guest asked for / released the party-voice floor.
  onFloorTake?: (localPlayerId: string) => void;
  onFloorRelease?: (localPlayerId: string) => void;
}

export function useNetSession({
  storyData,
  loading,
  onGuestAction,
  onSnapshot,
  onGuestJoined,
  onPeerLeft,
  onDiceThrowRequest,
  onDiceThrowResult,
  onGuestPass,
  onTurnStatus,
  onStoryStream,
  onTTSAudio,
  onFloorState,
  onFloorTake,
  onFloorRelease,
}: UseNetSessionParams) {
  const sessionRef = useRef<NetSession | null>(null);
  const [netSession, setNetSession] = useState<NetSessionInfo | null>(null);
  // Host-only reactive roster, for a "N players connected" style status
  // display. Keyed by localPlayerId so a reconnect (new presence_join from
  // the same player) updates in place instead of duplicating.
  const [peers, setPeers] = useState<GuestJoinedInfo[]>([]);
  // Everyone's live "who's talking" state, including our own echoed back -
  // NetSession already filters that out, see session.ts's handleMessage.
  const [activity, setActivity] = useState<Record<string, PresenceActivityState>>({});
  // Guest-only: true once the single link to the host has dropped.
  const [hostDisconnected, setHostDisconnected] = useState(false);
  // OOC chat history for the current room - never persisted, never touches
  // StoryData, reset whenever the room is (re)joined or left.
  const [oocMessages, setOOCMessages] = useState<OOCChatMessage[]>([]);

  // Refs so the long-lived event subscriptions (registered once per
  // session, not once per render) always call the latest callback rather
  // than whatever was passed in on the render that created the session.
  // Synced in an effect, not during render, per React's rules on refs.
  const onGuestActionRef = useRef(onGuestAction);
  const onSnapshotRef = useRef(onSnapshot);
  const onGuestJoinedRef = useRef(onGuestJoined);
  const onPeerLeftRef = useRef(onPeerLeft);
  const onDiceThrowRequestRef = useRef(onDiceThrowRequest);
  const onDiceThrowResultRef = useRef(onDiceThrowResult);
  const onGuestPassRef = useRef(onGuestPass);
  const onTurnStatusRef = useRef(onTurnStatus);
  const onStoryStreamRef = useRef(onStoryStream);
  const onTTSAudioRef = useRef(onTTSAudio);
  const onFloorStateRef = useRef(onFloorState);
  const onFloorTakeRef = useRef(onFloorTake);
  const onFloorReleaseRef = useRef(onFloorRelease);
  // Latest storyData, so the host-peer-connected handler can push a current
  // snapshot to a freshly-joined guest without re-subscribing. Synced in an
  // effect (not during render) per React's rules on refs.
  const storyDataRef = useRef(storyData);
  useEffect(() => {
    storyDataRef.current = storyData;
  }, [storyData]);
  useEffect(() => {
    onGuestActionRef.current = onGuestAction;
    onSnapshotRef.current = onSnapshot;
    onGuestJoinedRef.current = onGuestJoined;
    onPeerLeftRef.current = onPeerLeft;
    onDiceThrowRequestRef.current = onDiceThrowRequest;
    onDiceThrowResultRef.current = onDiceThrowResult;
    onGuestPassRef.current = onGuestPass;
    onTurnStatusRef.current = onTurnStatus;
    onStoryStreamRef.current = onStoryStream;
    onTTSAudioRef.current = onTTSAudio;
    onFloorStateRef.current = onFloorState;
    onFloorTakeRef.current = onFloorTake;
    onFloorReleaseRef.current = onFloorRelease;
  }, [
    onGuestAction,
    onSnapshot,
    onGuestJoined,
    onPeerLeft,
    onDiceThrowRequest,
    onDiceThrowResult,
    onGuestPass,
    onTurnStatus,
    onStoryStream,
    onTTSAudio,
    onFloorState,
    onFloorTake,
    onFloorRelease,
  ]);

  // attach() calls itself (indirectly, via this ref) when a guest needs to
  // auto-follow a host's backend switch - going through a ref rather than
  // a direct self-reference to the `attach` const keeps this compatible
  // with React's rules on hook closures.
  const attachRef = useRef<(session: NetSession) => void>(() => {});

  const attach = useCallback((session: NetSession) => {
    session.onGuestAction((action) => onGuestActionRef.current(action));
    session.onSnapshot((data) => onSnapshotRef.current(data));
    session.onGuestJoined((info) => {
      onGuestJoinedRef.current(info);
      setPeers((prev) => {
        const others = prev.filter((p) => p.localPlayerId !== info.localPlayerId);
        return [...others, info];
      });
    });
    session.onPeerLeft((localPlayerId) => {
      onPeerLeftRef.current?.(localPlayerId);
      setPeers((prev) => prev.filter((p) => p.localPlayerId !== localPlayerId));
    });
    session.onActivity((localPlayerId, state) => {
      setActivity((prev) => ({ ...prev, [localPlayerId]: state }));
    });
    session.onHostDisconnected(() => setHostDisconnected(true));
    session.onOOCChat((message) => {
      setOOCMessages((prev) => [...prev, message]);
    });
    session.onDiceThrowRequest((request) => onDiceThrowRequestRef.current?.(request));
    session.onDiceThrowResult((result) => onDiceThrowResultRef.current?.(result));
    session.onGuestPass((localPlayerId) => onGuestPassRef.current?.(localPlayerId));
    session.onTurnStatus((status) => onTurnStatusRef.current?.(status));
    session.onStoryStream((update) => onStoryStreamRef.current?.(update));
    session.onTTSAudio((chunk) => onTTSAudioRef.current?.(chunk));
    session.onFloorState((floor) => onFloorStateRef.current?.(floor));
    session.onFloorTake((localPlayerId) => onFloorTakeRef.current?.(localPlayerId));
    session.onFloorRelease((localPlayerId) => onFloorReleaseRef.current?.(localPlayerId));
    // Host-only: a fresh peer connected - push current state so the joiner has
    // the saved-profile roster to pick from before it claims a seat.
    session.onHostPeerConnected(() => {
      const current = storyDataRef.current;
      if (current) session.broadcastSnapshot(current);
    });
    session.onBackendSwitch(async (to) => {
      try {
        const next = await session.switchBackend(to);
        attachRef.current(next);
      } catch (error) {
        console.error("Failed to follow host's backend switch", error);
      }
    });
    sessionRef.current = session;
    setNetSession(session.info());
    setPeers([]);
    setActivity({});
    setHostDisconnected(false);
    setOOCMessages([]);
  }, []);

  useEffect(() => {
    attachRef.current = attach;
  }, [attach]);

  const leaveRoom = useCallback(async () => {
    await sessionRef.current?.leave();
    sessionRef.current = null;
    setNetSession(null);
    setPeers([]);
    setActivity({});
    setHostDisconnected(false);
    setOOCMessages([]);
  }, []);

  const createRoom = useCallback(
    async (backend: MPBackend, displayName: string, color: string) => {
      await sessionRef.current?.leave();
      const session = await NetSession.createHost(backend, displayName, color);
      attach(session);
    },
    [attach],
  );

  const joinRoom = useCallback(
    async (backend: MPBackend, roomId: RoomId, displayName: string, color: string) => {
      await sessionRef.current?.leave();
      const session = await NetSession.joinAsGuest(backend, roomId, displayName, color);
      attach(session);
    },
    [attach],
  );

  // Host-only: guests pick this up automatically via onBackendSwitch above.
  const switchBackend = useCallback(
    async (to: MPBackend) => {
      if (!sessionRef.current) return;
      const next = await sessionRef.current.switchBackend(to);
      attach(next);
    },
    [attach],
  );

  const sendChoice = useCallback((choiceIndex: number) => {
    sessionRef.current?.sendChoice(choiceIndex);
  }, []);

  const sendFreeform = useCallback((text: string, speakerIds?: string[]) => {
    sessionRef.current?.sendFreeform(text, speakerIds);
  }, []);

  const sendVoice = useCallback((text: string, speakerIds: string[]) => {
    sessionRef.current?.sendVoice(text, speakerIds);
  }, []);

  const sendActivity = useCallback((state: PresenceActivityState) => {
    sessionRef.current?.sendActivity(state);
  }, []);

  const sendOOCChat = useCallback((text: string) => {
    const session = sessionRef.current;
    if (!session) return;
    session.sendOOCChat(text);
    // NetSession's onOOCChat only fires for messages from other peers - add
    // our own to local history right away so it shows up immediately.
    const info = session.info();
    setOOCMessages((prev) => [
      ...prev,
      {
        playerId: info.myLocalPlayerId,
        displayName: info.displayName,
        color: info.color,
        text,
        timestamp: Date.now(),
      },
    ]);
  }, []);

  const sendDiceThrowRequest = useCallback(
    (
      requestId: string,
      forPlayerId: string,
      request: Omit<DiceThrowRelayRequest, "requestId">,
    ) => {
      sessionRef.current?.sendDiceThrowRequest(requestId, forPlayerId, request);
    },
    [],
  );

  const sendDiceThrowResult = useCallback(
    (requestId: string, faces: number[][] | null) => {
      sessionRef.current?.sendDiceThrowResult(requestId, faces);
    },
    [],
  );

  // Guest-only: claim a profile (saved or freshly created) and take a seat.
  const announceProfile = useCallback((profile: ClaimedProfile) => {
    const session = sessionRef.current;
    if (!session) return;
    session.announceProfile(profile);
    setNetSession(session.info());
  }, []);

  const hasAnnouncedProfile = useCallback((): boolean => {
    return sessionRef.current?.hasAnnouncedProfile() ?? false;
  }, []);

  const sendPass = useCallback(() => {
    sessionRef.current?.sendPass();
  }, []);

  const broadcastTurnStatus = useCallback((status: TurnStatus) => {
    sessionRef.current?.broadcastTurnStatus(status);
  }, []);

  const broadcastStoryStream = useCallback((update: StoryStreamUpdate) => {
    sessionRef.current?.broadcastStoryStream(update);
  }, []);

  const broadcastTTSAudio = useCallback((chunk: TTSAudioChunk) => {
    sessionRef.current?.broadcastTTSAudio(chunk);
  }, []);

  const broadcastFloorState = useCallback((floor: FloorSnapshot) => {
    sessionRef.current?.broadcastFloorState(floor);
  }, []);

  const sendFloorTake = useCallback(() => {
    sessionRef.current?.sendFloorTake();
  }, []);

  const sendFloorRelease = useCallback(() => {
    sessionRef.current?.sendFloorRelease();
  }, []);

  useEffect(() => {
    if (!netSession || netSession.role !== "host" || loading || !storyData) return;
    sessionRef.current?.broadcastSnapshot(storyData);
  }, [storyData, loading, netSession]);

  useEffect(() => {
    return () => {
      sessionRef.current?.leave();
    };
  }, []);

  return {
    netSession,
    peers,
    activity,
    hostDisconnected,
    oocMessages,
    createRoom,
    joinRoom,
    leaveRoom,
    switchBackend,
    sendChoice,
    sendFreeform,
    sendVoice,
    sendActivity,
    sendOOCChat,
    sendDiceThrowRequest,
    sendDiceThrowResult,
    announceProfile,
    hasAnnouncedProfile,
    sendPass,
    broadcastTurnStatus,
    broadcastStoryStream,
    broadcastTTSAudio,
    broadcastFloorState,
    sendFloorTake,
    sendFloorRelease,
  };
}
