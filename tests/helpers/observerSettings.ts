import type { ObserverSettings } from "@/app/misc/observer";

/**
 * What the Observer's defaults were before decision 187: every judge on, the
 * three prose judges (and the tier judge) allowed to rewrite or reset a turn,
 * sensitivity 5. The suites that exercise the rewrite and reset machinery pass
 * this as `observerSettings` to opt back in, the way a player does in
 * Settings; the new defaults are flag only and would never reach that code.
 */
export const LEGACY_OBSERVER_SETTINGS: ObserverSettings = {
  response_length: { enabled: true, triggersReset: true, sensitivity: 5 },
  player_agency: { enabled: true, triggersReset: true, sensitivity: 5 },
  outcome_narration_mismatch: { enabled: true, triggersReset: true, sensitivity: 5 },
  missing_oracle_or_table: { enabled: true, triggersReset: false, sensitivity: 5 },
  missing_scene_increment: { enabled: true, triggersReset: false, sensitivity: 5 },
  tier_escalation_missed: { enabled: true, triggersReset: true, sensitivity: 5 },
};

/**
 * The decision 187 table, which a player can still choose: only the outcome
 * judge on, as a flag; no judge rewrites or rerolls. Suites about the flag-only
 * path pass this as `observerSettings` (the defaults are decision 220's now).
 */
export const FLAG_ONLY_OBSERVER_SETTINGS: ObserverSettings = {
  response_length: { enabled: false, triggersReset: false, sensitivity: 5 },
  player_agency: { enabled: false, triggersReset: false, sensitivity: 3 },
  outcome_narration_mismatch: { enabled: true, triggersReset: false, sensitivity: 2 },
  missing_oracle_or_table: { enabled: false, triggersReset: false, sensitivity: 5 },
  missing_scene_increment: { enabled: false, triggersReset: false, sensitivity: 5 },
  tier_escalation_missed: { enabled: false, triggersReset: false, sensitivity: 5 },
};
