/**
 * The Observer's stored settings (layerSettings.ts): a fresh copy every read
 * (Codex finding 9: the first edit used to change the exported defaults), and
 * a one-time reset of a config saved before the flag-only defaults (decision
 * 187), after which the player's later choices are kept.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import {
  getObserverSettings,
  resetObserverSettings,
  setObserverCheckSetting,
} from "@/app/misc/layerSettings";
import {
  DEFAULT_OBSERVER_SETTINGS,
  OBSERVER_SETTINGS_VERSION,
} from "@/app/misc/observer";

const KEY = "observerCheckSettings";

function stubStorage(entries: Record<string, string> = {}) {
  const map = new Map(Object.entries(entries));
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
  };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", {
    localStorage: storage,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
  return map;
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getObserverSettings", () => {
  it("returns the flag-only defaults when nothing is stored", () => {
    stubStorage();
    expect(getObserverSettings()).toEqual(DEFAULT_OBSERVER_SETTINGS);
  });

  it("returns a fresh copy every call, so an edit cannot change the defaults (finding 9)", () => {
    stubStorage();
    const first = getObserverSettings();
    first.player_agency.enabled = true;
    first.player_agency.triggersReset = true;
    expect(getObserverSettings().player_agency.enabled).toBe(false);
    expect(DEFAULT_OBSERVER_SETTINGS.player_agency.enabled).toBe(false);
  });

  it("an edit then a Reset leaves the pristine defaults, not the edited ones", () => {
    stubStorage();
    setObserverCheckSetting("response_length", { enabled: true, triggersReset: true });
    expect(getObserverSettings().response_length.triggersReset).toBe(true);
    // The exported defaults were assigned into by the old code.
    expect(DEFAULT_OBSERVER_SETTINGS.response_length.enabled).toBe(false);

    resetObserverSettings();
    expect(getObserverSettings()).toEqual(DEFAULT_OBSERVER_SETTINGS);
  });
});

describe("the one-time settings reset (decision 187)", () => {
  const OLD_CONFIG = JSON.stringify({
    response_length: { enabled: true, triggersReset: true, sensitivity: 5 },
    player_agency: { enabled: true, triggersReset: true, sensitivity: 5 },
    outcome_narration_mismatch: { enabled: true, triggersReset: true, sensitivity: 5 },
    missing_oracle_or_table: { enabled: true, triggersReset: false, sensitivity: 5 },
    missing_scene_increment: { enabled: true, triggersReset: false, sensitivity: 5 },
    tier_escalation_missed: { enabled: true, triggersReset: true, sensitivity: 5 },
  });

  it("replaces a config saved before the version with the new defaults", () => {
    const map = stubStorage({ [KEY]: OLD_CONFIG });
    expect(getObserverSettings()).toEqual(DEFAULT_OBSERVER_SETTINGS);

    // ...and stores the version, so it is not done twice.
    expect(JSON.parse(map.get(KEY)!).observerSettingsVersion).toBe(OBSERVER_SETTINGS_VERSION);
  });

  it("keeps the player's choices made after the reset", () => {
    stubStorage({ [KEY]: OLD_CONFIG });
    getObserverSettings(); // the one-time reset
    setObserverCheckSetting("player_agency", { enabled: true, sensitivity: 7 });

    const after = getObserverSettings();
    expect(after.player_agency).toEqual({ enabled: true, triggersReset: false, sensitivity: 7 });
    // ...and the next read does not reset it again.
    expect(getObserverSettings().player_agency.sensitivity).toBe(7);
  });

  it("does not touch a config that already carries the version", () => {
    stubStorage({
      [KEY]: JSON.stringify({
        observerSettingsVersion: OBSERVER_SETTINGS_VERSION,
        response_length: { enabled: true, triggersReset: true, sensitivity: 8 },
      }),
    });
    expect(getObserverSettings().response_length).toEqual({
      enabled: true,
      triggersReset: true,
      sensitivity: 8,
    });
  });

  it("fills a partial stored type from that type's own default", () => {
    stubStorage({
      [KEY]: JSON.stringify({
        observerSettingsVersion: OBSERVER_SETTINGS_VERSION,
        player_agency: { enabled: true },
      }),
    });
    expect(getObserverSettings().player_agency).toEqual({
      enabled: true,
      triggersReset: false,
      sensitivity: 3,
    });
  });
});
