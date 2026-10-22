// The text a queued multi-player turn sends to the GM: one "> Name: line"
// per queued line, plus the unique ids of everyone who spoke, in first-spoken
// order. Shared by couch co-op's Generate bubble (PlayerBubbles) and party
// mode's Go, so both reach handleCustomInput in exactly the same shape, and
// the spotlight ledger and the GM's "> Name: action" convention see no
// difference between a couch turn and a party turn.

export interface TurnLine {
  playerId: string;
  name: string;
  text: string;
}

export interface QueuedTurn {
  text: string;
  speakerIds: string[];
}

// Null for an empty queue: there is nothing to send.
export function buildTurnText(lines: readonly TurnLine[]): QueuedTurn | null {
  if (lines.length === 0) return null;
  const text = lines.map((l) => `> ${l.name}: ${l.text}`).join("\n");
  const speakerIds = Array.from(new Set(lines.map((l) => l.playerId)));
  return { text, speakerIds };
}
