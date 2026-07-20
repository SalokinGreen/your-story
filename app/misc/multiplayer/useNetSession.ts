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
  GuestJoinedInfo,
  NetSession,
  NetSessionInfo,
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
}

export function useNetSession({
  storyData,
  loading,
  onGuestAction,
  onSnapshot,
  onGuestJoined,
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

  // Refs so the long-lived event subscriptions (registered once per
  // session, not once per render) always call the latest callback rather
  // than whatever was passed in on the render that created the session.
  // Synced in an effect, not during render, per React's rules on refs.
  const onGuestActionRef = useRef(onGuestAction);
  const onSnapshotRef = useRef(onSnapshot);
  const onGuestJoinedRef = useRef(onGuestJoined);
  useEffect(() => {
    onGuestActionRef.current = onGuestAction;
    onSnapshotRef.current = onSnapshot;
    onGuestJoinedRef.current = onGuestJoined;
  }, [onGuestAction, onSnapshot, onGuestJoined]);

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
      setPeers((prev) => prev.filter((p) => p.localPlayerId !== localPlayerId));
    });
    session.onActivity((localPlayerId, state) => {
      setActivity((prev) => ({ ...prev, [localPlayerId]: state }));
    });
    session.onHostDisconnected(() => setHostDisconnected(true));
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
    createRoom,
    joinRoom,
    leaveRoom,
    switchBackend,
    sendChoice,
    sendFreeform,
    sendVoice,
    sendActivity,
  };
}
