"use client";

import PartyLobby from "../../components/PartyLobby";
import type { PartyHostApi } from "../usePartyHost";
import {
  PARTY_COOLDOWN_MAX_MS,
  PARTY_COOLDOWN_MIN_MS,
} from "../../misc/party/partySettings";

// The Menu's party mode section: open and close the table, and the one
// setting. While the table is open the story screen shows the party strip in
// place of couch co-op's voice bubbles.
export default function PartyModeEditor({
  party,
  onlineRoomOpen,
}: {
  party: PartyHostApi;
  onlineRoomOpen: boolean;
}) {
  return (
    <div className="p-4 bg-white/[0.03] backdrop-blur-md rounded-xl border border-white/10 space-y-5">
      <PartyLobby
        party={party}
        blocked={
          onlineRoomOpen
            ? "Leave the online room first: party mode and online play can't run together."
            : undefined
        }
      />
      <label className="block">
        <span className="flex items-center justify-between text-sm text-blue-100">
          <span>Spotlight cooldown</span>
          <span className="font-mono text-white">{Math.round(party.cooldownMs / 1000)} s</span>
        </span>
        <input
          type="range"
          min={PARTY_COOLDOWN_MIN_MS / 1000}
          max={PARTY_COOLDOWN_MAX_MS / 1000}
          step={1}
          value={Math.round(party.cooldownMs / 1000)}
          onChange={(e) => party.setCooldownMs(Number(e.target.value) * 1000)}
          className="mt-2 w-full"
        />
        <span className="block mt-1 text-xs text-blue-200/50">
          When someone takes the spotlight from another player, that player can&apos;t take it back
          for this long. Couch co-op keeps its own 4 seconds.
        </span>
      </label>
    </div>
  );
}
