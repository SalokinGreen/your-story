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
import type { MPBackend, RoomId } from "./types";

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
    sessionRef.current = session;
    setNetSession(session.info());
    setPeers([]);
  }, []);

  const leaveRoom = useCallback(async () => {
    await sessionRef.current?.leave();
    sessionRef.current = null;
    setNetSession(null);
    setPeers([]);
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

  const sendChoice = useCallback((choiceIndex: number) => {
    sessionRef.current?.sendChoice(choiceIndex);
  }, []);

  const sendFreeform = useCallback((text: string, speakerIds?: string[]) => {
    sessionRef.current?.sendFreeform(text, speakerIds);
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

  return { netSession, peers, createRoom, joinRoom, leaveRoom, sendChoice, sendFreeform };
}
