// The webview's side of party mode's LAN server (src-tauri/src/party_server.rs).
// Rust serves the phone page and relays WebSocket messages; this is the only
// place that talks to it. Everything it carries is opaque JSON text.
//
// Party mode needs the desktop app: the server exists only there. The web
// build and the Android app (until PR P2) have no bridge.

import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { isStandalone } from "../standalone";

export interface PartyNetInterface {
  name: string;
  ip: string;
  isDefault: boolean;
}

export interface PartyInfo {
  // What the QR code holds: http://<ip>:<port>/party?t=<token>
  url: string;
  ip: string;
  port: number;
  token: string;
  interfaces: PartyNetInterface[];
}

export type PartyServerEvent =
  | { kind: "connected"; clientId: string; userAgent: string }
  | { kind: "message"; clientId: string; json: string }
  | { kind: "disconnected"; clientId: string }
  | { kind: "error"; code: string; message: string };

export type PartyTarget = { kind: "all" } | { kind: "client"; id: string };

// What went wrong, in terms the lobby can explain. The codes are Rust's
// PartyError codes, plus UNAVAILABLE for a build with no server.
export interface PartyError {
  code: string;
  message: string;
}

export interface PartyBridge {
  start(
    opts: { preferredPort?: number; interfaceIp?: string },
    onEvent: (event: PartyServerEvent) => void,
  ): Promise<PartyInfo>;
  send(to: PartyTarget, json: string): Promise<void>;
  kick(clientId: string): Promise<void>;
  stop(): Promise<void>;
}

// Only the desktop app's packaged build has the server.
export function isPartyAvailable(): boolean {
  return isStandalone() && isTauri();
}

export function toPartyError(e: unknown): PartyError {
  if (typeof e === "object" && e !== null && "code" in e && "message" in e) {
    const { code, message } = e as { code: unknown; message: unknown };
    if (typeof code === "string" && typeof message === "string") return { code, message };
  }
  return { code: "UNKNOWN", message: e instanceof Error ? e.message : String(e) };
}

export const tauriPartyBridge: PartyBridge = {
  async start(opts, onEvent) {
    const channel = new Channel<PartyServerEvent>();
    channel.onmessage = onEvent;
    return invoke<PartyInfo>("party_start", { opts, onEvent: channel });
  },
  async send(to, json) {
    await invoke("party_send", { to, json });
  },
  async kick(clientId) {
    await invoke("party_kick", { clientId });
  },
  async stop() {
    await invoke("party_stop");
  },
};
