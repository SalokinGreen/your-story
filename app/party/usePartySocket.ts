"use client";

// The phone's connection to the desktop table (docs/party-mode-design.md
// §4.2). A plain WebSocket back to the host that served this page, with the
// QR token in the query. It reconnects with backoff, pings to notice a dead
// socket (a phone that slept), and reclaims its seat with the key the
// desktop gave it. Runs over plain HTTP, so it uses no crypto.subtle,
// crypto.randomUUID, clipboard or service worker.

import { useCallback, useEffect, useRef, useState } from "react";
import type { DesktopMessage, PhoneMessage, PlayerView } from "../misc/party/protocol";

export type ConnectionState = "connecting" | "open" | "reconnecting" | "failed";

const SEAT_STORAGE_KEY = "yourStoryPartySeat";
const PING_EVERY_MS = 10_000;
const PONG_WITHIN_MS = 8_000;
// Connection attempts that never opened, in a row, before giving up. After a
// restart of the table the token is wrong and every attempt gets a 403.
const MAX_FAILED_ATTEMPTS = 6;

interface SavedSeat {
  token: string;
  playerId: string;
  seatKey: string;
}

function loadSeat(token: string): SavedSeat | null {
  try {
    const raw = localStorage.getItem(SEAT_STORAGE_KEY);
    if (!raw) return null;
    const seat = JSON.parse(raw) as Partial<SavedSeat>;
    // A seat is good for one table session, and each session has its own token.
    if (seat.token !== token || !seat.playerId || !seat.seatKey) return null;
    return seat as SavedSeat;
  } catch {
    return null;
  }
}

function saveSeat(seat: SavedSeat): void {
  try {
    localStorage.setItem(SEAT_STORAGE_KEY, JSON.stringify(seat));
  } catch {
    // The seat just won't survive a reload.
  }
}

function clearSeat(): void {
  try {
    localStorage.removeItem(SEAT_STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

export interface PartySocket {
  state: ConnectionState;
  view: PlayerView | null;
  // When the current view arrived, so lockouts (sent as time remaining) can
  // be counted down against this phone's own clock.
  viewAt: number;
  toast: { id: number; text: string } | null;
  send: (message: PhoneMessage) => boolean;
  retry: () => void;
}

export function usePartySocket(token: string | null): PartySocket {
  const [state, setState] = useState<ConnectionState>("connecting");
  const [view, setView] = useState<PlayerView | null>(null);
  const [viewAt, setViewAt] = useState(0);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!token) return;
    let stopped = false;
    let attempt = 0;
    let failedInARow = 0;
    let toastId = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let pongTimer: ReturnType<typeof setTimeout> | null = null;

    const clearTimers = () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (pingTimer) clearInterval(pingTimer);
      if (pongTimer) clearTimeout(pongTimer);
      retryTimer = pingTimer = pongTimer = null;
    };

    const ping = (socket: WebSocket) => {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: "ping" } satisfies PhoneMessage));
      if (!pongTimer) {
        // No answer: the socket is dead without having said so. Closing it
        // starts a reconnect.
        pongTimer = setTimeout(() => socket.close(), PONG_WITHIN_MS);
      }
    };

    const handle = (data: unknown) => {
      if (typeof data !== "string") return;
      let msg: DesktopMessage;
      try {
        msg = JSON.parse(data) as DesktopMessage;
      } catch {
        return;
      }
      switch (msg.type) {
        case "welcome":
        case "view": {
          setView(msg.view);
          setViewAt(Date.now());
          if (msg.view.me) {
            saveSeat({ token, playerId: msg.view.me.id, seatKey: msg.view.me.seatKey });
          } else if (msg.type === "welcome" && loadSeat(token)) {
            // The desktop doesn't know our key any more (the table was
            // reopened): drop it and rejoin from the form.
            clearSeat();
          }
          break;
        }
        case "toast":
          toastId += 1;
          setToast({ id: toastId, text: msg.text });
          break;
        case "pong":
          if (pongTimer) clearTimeout(pongTimer);
          pongTimer = null;
          break;
      }
    };

    const connect = () => {
      if (stopped) return;
      setState(attempt === 0 ? "connecting" : "reconnecting");
      const scheme = location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${scheme}//${location.host}/ws?t=${encodeURIComponent(token)}`);
      socketRef.current = socket;
      let opened = false;

      socket.onopen = () => {
        opened = true;
        attempt = 0;
        failedInARow = 0;
        setState("open");
        const seat = loadSeat(token);
        const hello: PhoneMessage = {
          type: "hello",
          token,
          playerId: seat?.playerId,
          seatKey: seat?.seatKey,
        };
        socket.send(JSON.stringify(hello));
        pingTimer = setInterval(() => ping(socket), PING_EVERY_MS);
      };
      socket.onmessage = (e) => handle(e.data);
      socket.onerror = () => {
        // onclose follows and does the work.
      };
      socket.onclose = () => {
        if (pingTimer) clearInterval(pingTimer);
        if (pongTimer) clearTimeout(pongTimer);
        pingTimer = pongTimer = null;
        if (stopped || socketRef.current !== socket) return;
        socketRef.current = null;
        if (!opened) failedInARow += 1;
        if (failedInARow >= MAX_FAILED_ATTEMPTS) {
          setState("failed");
          return;
        }
        setState("reconnecting");
        const delay = Math.min(8000, 500 * 2 ** attempt) + Math.random() * 300;
        attempt += 1;
        retryTimer = setTimeout(connect, delay);
      };
    };

    // A phone coming back from sleep: don't wait out the backoff.
    const onVisible = () => {
      if (document.visibilityState !== "visible" || stopped) return;
      const socket = socketRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        ping(socket);
      } else if (!socket || socket.readyState === WebSocket.CLOSED) {
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = null;
        if (failedInARow < MAX_FAILED_ATTEMPTS) connect();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    retryRef.current = () => {
      clearTimers();
      attempt = 0;
      failedInARow = 0;
      const socket = socketRef.current;
      socketRef.current = null;
      socket?.close();
      connect();
    };

    connect();
    return () => {
      stopped = true;
      clearTimers();
      document.removeEventListener("visibilitychange", onVisible);
      const socket = socketRef.current;
      socketRef.current = null;
      socket?.close();
    };
  }, [token]);

  const send = useCallback((message: PhoneMessage): boolean => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }, []);

  const retry = useCallback(() => retryRef.current(), []);

  return { state, view, viewAt, toast, send, retry };
}
