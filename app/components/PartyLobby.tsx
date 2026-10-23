"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { DynamicIcon } from "./DynamicIcon";
import { useNotification } from "../misc/NotificationContext";
import type { PartyHostApi } from "../story/usePartyHost";
import type { PartyError } from "../misc/party/partyBridge";

// What to do about each way the server can fail to start. The codes are the
// ones party_server.rs reports.
export function explainPartyError(error: PartyError): { title: string; steps: string[] } {
  switch (error.code) {
    case "PORT_RESERVED":
      return {
        title: "Windows has reserved the ports Your Story wanted",
        steps: [
          "Windows sets some ports aside for itself, often for Hyper-V or WSL, and refuses to let apps listen on them (error 10013).",
          "Try starting again. Your Story tries ten ports in a row, so a reserved block usually clears on its own.",
          "To see what's reserved, run: netsh interface ipv4 show excludedportrange protocol=tcp",
        ],
      };
    case "PORT_IN_USE":
      return {
        title: "Those ports are already in use",
        steps: ["Another program is listening on them. Close it, or try starting again."],
      };
    case "NO_NETWORK":
      return {
        title: "This PC isn't on a home network",
        steps: ["Connect to the same Wi-Fi or wired network your phones use, then try again."],
      };
    case "UNAVAILABLE":
      return {
        title: "Party mode needs the desktop app",
        steps: ["Phones join through a small server that only the Your Story desktop app runs."],
      };
    default:
      return { title: "Party mode couldn't start", steps: [error.message] };
  }
}

function CantConnectHelp() {
  return (
    <details className="text-xs text-ys-muted">
      <summary className="cursor-pointer text-ys-muted hover:text-ys-text">
        A phone can&apos;t connect?
      </summary>
      <ul className="mt-2 space-y-2 list-disc pl-4">
        <li>
          <span className="text-ys-text">Same Wi-Fi.</span> The phone must be on the same network as
          this PC. A guest network usually blocks phones from reaching other devices (client
          isolation).
        </li>
        <li>
          <span className="text-ys-text">Windows marks the network Public.</span> Open Settings,
          Network &amp; internet, your connection&apos;s properties, and set the network profile to
          Private.
        </li>
        <li>
          <span className="text-ys-text">The firewall prompt was dismissed.</span> Open Windows
          Security, Firewall &amp; network protection, Allow an app through firewall, and tick
          Private for Your Story.
        </li>
        <li>
          <span className="text-ys-text">The wrong network.</span> If this PC has a VPN or other
          adapters, pick the home network&apos;s address above.
        </li>
      </ul>
    </details>
  );
}

export default function PartyLobby({
  party,
  blocked,
  joinOnly,
}: {
  party: PartyHostApi;
  // Why party mode can't start right now (an online room is open), if so.
  blocked?: string;
  // Only what a late joiner needs: the QR and link. No way to change the
  // network or close the table, either of which would drop every phone.
  joinOnly?: boolean;
}) {
  const { addNotification } = useNotification();
  const [picked, setPicked] = useState<string | undefined>(undefined);

  if (!party.available) {
    return (
      <div className="p-4 bg-ys-text/5 rounded-xl border border-ys-border text-sm text-ys-muted">
        Party mode runs in the Your Story desktop app: the desktop is the table, and phones join it
        over your home Wi-Fi.
      </div>
    );
  }

  const explained = party.error ? explainPartyError(party.error) : null;

  if (party.status === "on" && party.info) {
    const { info } = party;
    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
          <div className="bg-white p-3 rounded-xl shrink-0">
            <QRCodeSVG
              value={info.url}
              size={200}
              level="M"
              bgColor="#ffffff"
              fgColor="#000000"
              title="Scan to join the table"
            />
          </div>
          <div className="space-y-3 min-w-0 w-full">
            <p className="text-sm text-ys-text">
              Scan this with a phone on the same Wi-Fi to join the table.
            </p>
            <div className="flex items-center gap-2 p-2 bg-ys-text/5 rounded-lg border border-ys-border">
              <p className="text-xs font-mono text-ys-text break-all select-all grow">{info.url}</p>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(info.url).then(
                    () => addNotification("Link copied", "success"),
                    () => addNotification("Couldn't copy the link", "failure"),
                  );
                }}
                className="p-2 text-ys-muted hover:text-ys-text hover:bg-ys-text/10 rounded-lg transition-colors shrink-0"
                title="Copy the link"
              >
                <DynamicIcon name="Copy" className="w-4 h-4" />
              </button>
            </div>
            {!joinOnly && info.interfaces.length > 1 && (
              <label className="block text-xs text-ys-muted">
                Network
                <select
                  value={picked ?? info.ip}
                  onChange={(e) => {
                    setPicked(e.target.value);
                    void party.start(e.target.value);
                  }}
                  className="mt-1 block w-full bg-ys-text/5 border border-ys-border rounded-lg px-2 py-1.5 text-sm text-ys-text"
                >
                  {info.interfaces.map((i) => (
                    <option key={i.ip} value={i.ip} className="bg-ys-surface text-ys-text">
                      {i.ip} · {i.name}
                      {i.isDefault ? " (default)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
        <CantConnectHelp />
        {!joinOnly && (
          <button
            type="button"
            onClick={() => {
              setPicked(undefined);
              void party.stop();
            }}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-ys-text/5 hover:bg-red-500/20 text-ys-text border border-ys-border"
          >
            Close the table
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 text-sm text-ys-muted">
        <p>
          Everyone plays from their own phone. This desktop shows the story; each phone shows that
          player&apos;s character and controls.
        </p>
        <p>
          Starting opens a small server on your home network for as long as the table is open.{" "}
          <span className="text-ys-text">
            The first time, Windows will ask whether to let Your Story through its firewall. Allow it
            on Private networks only.
          </span>
        </p>
      </div>
      {explained && (
        <div className="p-3 rounded-lg border border-red-400/30 bg-red-500/10 space-y-1">
          <p className="text-sm font-semibold text-red-500">{explained.title}</p>
          <ul className="text-xs text-ys-text space-y-1 list-disc pl-4">
            {explained.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </div>
      )}
      {blocked && <p className="text-xs text-ys-muted">{blocked}</p>}
      <button
        type="button"
        disabled={party.status === "starting" || !!blocked}
        onClick={() => void party.start(picked)}
        className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-ys-text text-ys-bg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {party.status === "starting" ? "Opening the table…" : "Open the table"}
      </button>
    </div>
  );
}

// The lobby as a window, for the table strip's Join button.
export function PartyLobbyModal({
  party,
  onClose,
}: {
  party: PartyHostApi;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-label="Join the table"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 rounded-2xl bg-ys-surface border border-ys-border space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ys-text">Join the table</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-ys-muted hover:text-ys-text hover:bg-ys-text/10 rounded-lg"
            aria-label="Close"
          >
            <DynamicIcon name="X" className="w-4 h-4" />
          </button>
        </div>
        <PartyLobby party={party} joinOnly />
      </div>
    </div>
  );
}
