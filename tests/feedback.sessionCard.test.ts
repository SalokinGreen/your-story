// "How was tonight?" (docs/feedback-design.md §6): when the card shows, once
// per night, through a reload, and never on a shared screen.
import { describe, expect, it } from "vitest";
import {
  AFTER_NIGHT_KEY,
  afterNightEnabled,
  endedSessionOf,
  readSessionMarker,
  sessionFeedbackOffer,
  sessionMarkerKey,
  setAfterNightEnabled,
  writeSessionMarker,
  type SessionOfferFlags,
} from "@/app/misc/feedbackSession";
import { SYNCABLE_SETTINGS_KEYS } from "@/app/misc/syncableSettingsKeys";

/** A localStorage that survives "reloads": a new reader over the same map. */
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

const ENDED = (n: number) => ({
  toolCallId: "e",
  toolName: "end_session",
  success: true,
  result: { type: "end_session", sessionCount: n, reset: [] },
  contextForStory: `[Session ${n} ended. Session ${n + 1} begins.]`,
});
const gm = (...calls: unknown[]) => ({ user: false, gmToolCalls: calls });
const player = { user: true };

const ON: SessionOfferFlags = {
  couch: false,
  party: false,
  online: false,
  enabled: true,
  available: true,
};
const none = () => null;

describe("endedSessionOf: an executed end_session only", () => {
  it("reads the night from a successful result", () => {
    expect(endedSessionOf(gm(ENDED(3)))).toBe(3);
  });

  it("ignores a failed call, a refused one, a mention and a different tool", () => {
    expect(endedSessionOf(gm({ ...ENDED(2), success: false }))).toBeNull();
    expect(
      endedSessionOf(
        gm({
          toolName: "end_session",
          success: false,
          contextForStory: "**ERROR** end_session refused",
        }),
      ),
    ).toBeNull();
    // Prose or a tool result that merely says a session ended is not a result.
    expect(
      endedSessionOf(
        gm({ toolName: "read_notes", success: true, contextForStory: "[Session 4 ended]" }),
      ),
    ).toBeNull();
    expect(
      endedSessionOf({ user: false, gmToolCalls: [] }),
    ).toBeNull();
    expect(endedSessionOf({ user: false })).toBeNull();
    expect(
      endedSessionOf(gm({ ...ENDED(2), result: { type: "manage_meter", sessionCount: 2 } })),
    ).toBeNull();
    expect(endedSessionOf(gm({ ...ENDED(0) }))).toBeNull();
  });

  it("never counts a player part", () => {
    expect(endedSessionOf({ user: true, gmToolCalls: [ENDED(1)] })).toBeNull();
  });
});

describe("sessionFeedbackOffer", () => {
  const parts = [player, gm(), player, gm(ENDED(1)), player, gm(), player, gm(ENDED(2)), player, gm()];

  it("offers the newest night, under the part that ended it", () => {
    expect(sessionFeedbackOffer(parts, ON, none)).toEqual({ partIndex: 7, session: 2 });
  });

  it("offers nothing when no turn executed end_session", () => {
    expect(sessionFeedbackOffer([player, gm(), player, gm()], ON, none)).toBeNull();
    expect(
      sessionFeedbackOffer([player, gm({ ...ENDED(1), success: false })], ON, none),
    ).toBeNull();
  });

  it("is off in couch co-op, party mode and online play", () => {
    expect(sessionFeedbackOffer(parts, { ...ON, couch: true }, none)).toBeNull();
    expect(sessionFeedbackOffer(parts, { ...ON, party: true }, none)).toBeNull();
    expect(sessionFeedbackOffer(parts, { ...ON, online: true }, none)).toBeNull();
  });

  it("is off with the Settings switch off, or without a Worker address", () => {
    expect(sessionFeedbackOffer(parts, { ...ON, enabled: false }, none)).toBeNull();
    expect(sessionFeedbackOffer(parts, { ...ON, available: false }, none)).toBeNull();
  });

  it("is gone once that night was dismissed or sent, but not merely offered", () => {
    expect(sessionFeedbackOffer(parts, ON, () => "dismissed")).toBeNull();
    expect(sessionFeedbackOffer(parts, ON, () => "sent")).toBeNull();
    expect(sessionFeedbackOffer(parts, ON, () => "offered")).toEqual({ partIndex: 7, session: 2 });
  });

  it("asks about the newest night only: an older night's answer does not bring it back, and its card does not show", () => {
    // Night 2 dismissed: night 1's turn does not get the card instead.
    expect(
      sessionFeedbackOffer(parts, ON, (n) => (n === 2 ? "dismissed" : null)),
    ).toBeNull();
  });

  it("moves to the next night when a new one ends", () => {
    const later = [...parts, player, gm(ENDED(3))];
    expect(sessionFeedbackOffer(later, ON, (n) => (n === 2 ? "sent" : null))).toEqual({
      partIndex: 11,
      session: 3,
    });
  });
});

describe("the markers, through a reload", () => {
  it("remember offered, dismissed and sent per story and night", () => {
    const store = fakeStorage();
    expect(readSessionMarker("story-a", 2, store)).toBeNull();
    writeSessionMarker("story-a", 2, "offered", store);
    expect(store.map.get(sessionMarkerKey("story-a", 2))).toBe("offered");
    writeSessionMarker("story-a", 2, "dismissed", store);

    // A reload: nothing in memory, only the store.
    const parts = [player, gm(ENDED(2))];
    const offerAfterReload = () =>
      sessionFeedbackOffer(parts, ON, (n) => readSessionMarker("story-a", n, store));
    expect(offerAfterReload()).toBeNull();
    // Another story, and another night, are unaffected.
    expect(readSessionMarker("story-b", 2, store)).toBeNull();
    expect(readSessionMarker("story-a", 3, store)).toBeNull();
  });

  it("an unreadable value is no marker, and a broken store does not throw", () => {
    const store = fakeStorage();
    store.map.set(sessionMarkerKey("s", 1), "garbage");
    expect(readSessionMarker("s", 1, store)).toBeNull();
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(readSessionMarker("s", 1, broken)).toBeNull();
    expect(() => writeSessionMarker("s", 1, "sent", broken)).not.toThrow();
    expect(afterNightEnabled(broken)).toBe(true);
  });
});

describe("the Settings switch", () => {
  it("is on until it is turned off, and remembers", () => {
    const store = fakeStorage();
    expect(afterNightEnabled(store)).toBe(true);
    setAfterNightEnabled(false, store);
    expect(store.map.get(AFTER_NIGHT_KEY)).toBe("false");
    expect(afterNightEnabled(store)).toBe(false);
    setAfterNightEnabled(true, store);
    expect(afterNightEnabled(store)).toBe(true);
  });

  it("is device-only: neither the switch nor a marker is on the sync allowlist", () => {
    const keys: readonly string[] = SYNCABLE_SETTINGS_KEYS;
    expect(keys).not.toContain(AFTER_NIGHT_KEY);
    expect(keys.some((k) => k.startsWith("ys:feedback"))).toBe(false);
  });
});
