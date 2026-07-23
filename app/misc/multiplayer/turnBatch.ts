// Networked-multiplayer turn batching: instead of the first player's action
// immediately firing a turn, the host collects one submission per player and
// generates a single combined turn once everyone has responded (or the host
// forces it). Pure and React-agnostic so the readiness/aggregation rules can
// be unit-tested without the page shell.
//
// "Everyone" is the host plus every connected guest; a player who has nothing
// to add this round submits a "pass" so they don't block the turn.

export type BatchInputKind = "choice" | "freeform" | "voice" | "pass";

export interface BatchedInput {
  playerId: string;
  name: string; // display name, for building the "> Name: text" line
  kind: BatchInputKind;
  // Resolved contribution text (choice text, or typed/transcribed input).
  // null for a pass.
  text: string | null;
  // Original choice index when kind === "choice" - attribution/logging only.
  choiceIndex: number | null;
}

export interface TurnBatchState {
  // playerId -> their latest submission this round. Last write wins, so a
  // player can revise (or switch from an action to a pass) before the turn
  // fires.
  inputs: Map<string, BatchedInput>;
}

export interface AggregatedTurn {
  // Combined user-turn content, one "> Name: text" line per contributor.
  content: string;
  // Contributing (non-pass) player ids, in aggregation order - becomes the
  // turn's speakerIds for director-layer spotlight tracking.
  speakerIds: string[];
}

export function createBatch(): TurnBatchState {
  return { inputs: new Map() };
}

export function recordInput(state: TurnBatchState, input: BatchedInput): void {
  state.inputs.set(input.playerId, input);
}

export function clearBatch(state: TurnBatchState): void {
  state.inputs.clear();
}

// Players who submitted a real (non-pass) action this round.
export function submittedIds(state: TurnBatchState): string[] {
  return [...state.inputs.values()]
    .filter((i) => i.kind !== "pass")
    .map((i) => i.playerId);
}

// Players who explicitly passed this round.
export function passedIds(state: TurnBatchState): string[] {
  return [...state.inputs.values()]
    .filter((i) => i.kind === "pass")
    .map((i) => i.playerId);
}

// Every player who has responded at all (submitted or passed).
export function respondedIds(state: TurnBatchState): string[] {
  return [...state.inputs.keys()];
}

// Ready once every expected seat has responded (submitted or passed) AND at
// least one player actually contributed something to narrate. An all-pass
// round never auto-fires - there'd be nothing for the GM to act on.
export function isBatchReady(
  state: TurnBatchState,
  expectedPlayerIds: string[],
): boolean {
  if (expectedPlayerIds.length === 0) return false;
  const responded = new Set(respondedIds(state));
  const everyoneResponded = expectedPlayerIds.every((id) => responded.has(id));
  return everyoneResponded && submittedIds(state).length > 0;
}

// Format one contributor's line. Text that's already attributed (starts with
// ">", e.g. PlayerBubbles voice output "> Name: ...") is kept verbatim;
// anything else is wrapped as "> Name: text" so the GM sees who spoke.
function formatLine(input: BatchedInput): string | null {
  const text = input.text?.trim();
  if (!text) return null;
  if (text.startsWith(">")) return text;
  return `> ${input.name}: ${text}`;
}

// Build the combined user turn from every contributing (non-pass) submission,
// in `order` (the expected-seat order, so output is deterministic regardless
// of arrival order). Returns null if nobody contributed.
export function aggregateBatch(
  state: TurnBatchState,
  order: string[],
): AggregatedTurn | null {
  // Contributors in the requested order first, then any stragglers not in
  // `order` (defensive - shouldn't normally happen).
  const ordered = [
    ...order.filter((id) => state.inputs.has(id)),
    ...respondedIds(state).filter((id) => !order.includes(id)),
  ];

  const lines: string[] = [];
  const speakerIds: string[] = [];
  for (const id of ordered) {
    const input = state.inputs.get(id);
    if (!input || input.kind === "pass") continue;
    const line = formatLine(input);
    if (!line) continue;
    lines.push(line);
    speakerIds.push(id);
  }

  if (lines.length === 0) return null;
  return { content: lines.join("\n"), speakerIds };
}
