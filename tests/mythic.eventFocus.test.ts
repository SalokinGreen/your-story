/**
 * M1: mythic.ts used to carry two event-focus tables that had drifted apart
 * - the live `EVENT_FOCUS` (used by generateEventFocus) and a dead,
 * unreferenced `RANDOM_EVENT_FOCUS_TABLE` with different percentage bands
 * (e.g. "Remote event" spanned 1-7 in the live table vs 1-5 in the dead
 * copy). The dead copy has been deleted; this test pins generateEventFocus's
 * actual boundaries so a future edit can't silently reintroduce a second,
 * diverging copy of this table without a test failure.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { generateEventFocus } from "../app/misc/mythic";

function mockRandom(value: number) {
  vi.spyOn(Math, "random").mockReturnValue(value);
}

describe("generateEventFocus", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 'Remote event' for the low end of the range (roll 1)", () => {
    mockRandom(0); // rollD100 -> 1
    const result = generateEventFocus();
    expect(result.roll).toBe(1);
    expect(result.focus).toBe("Remote event");
  });

  it("still returns 'Remote event' at the top of its band (roll 7)", () => {
    mockRandom(0.06); // rollD100 -> 7
    const result = generateEventFocus();
    expect(result.roll).toBe(7);
    expect(result.focus).toBe("Remote event");
  });

  it("moves into 'NPC action' just past the remote-event band (roll 8)", () => {
    mockRandom(0.07); // rollD100 -> 8
    const result = generateEventFocus();
    expect(result.roll).toBe(8);
    expect(result.focus).toBe("NPC action");
  });

  it("returns 'NPC positive' at the top of the table (roll 100)", () => {
    mockRandom(0.999999); // rollD100 -> 100
    const result = generateEventFocus();
    expect(result.roll).toBe(100);
    expect(result.focus).toBe("NPC positive");
  });
});
