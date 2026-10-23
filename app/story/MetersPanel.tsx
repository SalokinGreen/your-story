"use client";

import { useState } from "react";
import { DynamicIcon } from "@/app/components/DynamicIcon";
import { currentThreshold } from "@/app/misc/metersAndTracks";
import type {
  Meter,
  ProgressTrack,
  SceneChallenge,
} from "@/app/misc/structs";

interface MetersPanelProps {
  meters?: Meter[];
  progressTracks?: ProgressTrack[];
  activeChallenge?: SceneChallenge;
}

/** A track has ten boxes of four ticks each (metersAndTracks.ts). */
const TRACK_BOXES = 10;
const TICKS_PER_BOX = 4;

function pct(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

function MeterBar({ meter }: { meter: Meter }) {
  const fill = pct(meter.value, meter.min, meter.max);
  const capAt = pct(meter.cap, meter.min, meter.max);
  const floorAt = pct(meter.floor, meter.min, meter.max);
  const threshold = currentThreshold(meter);
  const capLowered = meter.cap < meter.max;
  const floorRaised = meter.floor > meter.min;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-ys-text font-medium truncate">{meter.name}</span>
        <span className="text-ys-muted tabular-nums shrink-0">
          {meter.value}/{meter.max}
          {capLowered ? ` (cap ${meter.cap})` : ""}
          {floorRaised ? ` (floor ${meter.floor})` : ""}
        </span>
      </div>
      <div
        className="relative h-2.5 mt-1 rounded-full bg-ys-surface-2 overflow-hidden"
        role="meter"
        aria-label={meter.name}
        aria-valuemin={meter.min}
        aria-valuemax={meter.max}
        aria-valuenow={meter.value}
      >
        {/* The part above the current cap can't be reached: dimmed and hatched. */}
        {capLowered && (
          <div
            className="absolute inset-y-0 right-0 bg-ys-bg"
            style={{ width: `${100 - capAt}%` }}
          />
        )}
        {floorRaised && (
          <div
            className="absolute inset-y-0 left-0 bg-ys-bg"
            style={{ width: `${floorAt}%` }}
          />
        )}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-ys-accent"
          style={{ width: `${fill}%` }}
        />
        {(meter.thresholds ?? []).map((t) => (
          <div
            key={`${t.at}:${t.label}`}
            className="absolute inset-y-0 w-px bg-ys-surface-2"
            style={{ left: `${pct(t.at, meter.min, meter.max)}%` }}
            title={`${t.label} at ${t.at}`}
          />
        ))}
      </div>
      {threshold && (
        <p className="text-[11px] text-ys-text/80 mt-0.5">
          {threshold.label}
        </p>
      )}
    </div>
  );
}

function TrackBoxes({ track }: { track: ProgressTrack }) {
  const dim = track.status !== "active";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span
          className={`font-medium truncate ${dim ? "text-ys-muted" : "text-ys-text"}`}
        >
          {track.name}
        </span>
        <span className="text-ys-muted shrink-0 capitalize">
          {track.rank} {track.kind}
          {dim ? ` · ${track.status}` : ""}
        </span>
      </div>
      <div
        className={`flex gap-1 mt-1 ${dim ? "opacity-50" : ""}`}
        role="img"
        aria-label={`${track.name}: ${Math.floor(track.ticks / TICKS_PER_BOX)} of ${TRACK_BOXES} boxes filled`}
      >
        {Array.from({ length: TRACK_BOXES }, (_, box) => {
          const ticks = Math.min(
            TICKS_PER_BOX,
            Math.max(0, track.ticks - box * TICKS_PER_BOX),
          );
          return (
            <div
              key={box}
              className={`flex-1 h-4 rounded-sm border grid grid-cols-4 gap-px p-px ${
                ticks === TICKS_PER_BOX
                  ? "border-ys-accent/60 bg-ys-accent/40"
                  : "border-ys-border bg-ys-surface"
              }`}
            >
              {Array.from({ length: TICKS_PER_BOX }, (_, tick) => (
                <div
                  key={tick}
                  className={
                    tick < ticks && ticks < TICKS_PER_BOX
                      ? "bg-ys-accent/80 rounded-[1px]"
                      : ""
                  }
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChallengeLine({ challenge }: { challenge: SceneChallenge }) {
  if (challenge.mode === "tally") {
    const tally = challenge.tally ?? 0;
    return (
      <p className="text-xs text-ys-text">
        Round {Math.min((challenge.recorded ?? 0) + 1, challenge.rounds)} of{" "}
        {challenge.rounds} · tally {tally > 0 ? `+${tally}` : tally}
      </p>
    );
  }
  const need =
    challenge.requiredSuccesses ?? Math.floor(challenge.rounds / 2) + 1;
  const lose = challenge.maxFailures ?? Math.floor(challenge.rounds / 2) + 1;
  return (
    <p className="text-xs text-ys-text">
      {challenge.currentSuccesses} of {need} successes ·{" "}
      {challenge.currentFailures} of {lose} failures
    </p>
  );
}

/**
 * The player's panel for a system story: meters as bars (a lowered cap dims the
 * part above it), progress tracks as ten boxes of four ticks, and the live
 * challenge's round and tally. Hidden meters are the GM's and are left out.
 * Renders nothing when there is nothing to show, so a story without a system
 * sees no change. Keys come from the data, never from Math.random or the clock.
 */
export default function MetersPanel({
  meters,
  progressTracks,
  activeChallenge,
}: MetersPanelProps) {
  const [open, setOpen] = useState(true);

  const visibleMeters = (meters ?? []).filter((m) => !m.hidden);
  const tracks = progressTracks ?? [];
  const challenge = activeChallenge?.active ? activeChallenge : undefined;
  if (visibleMeters.length === 0 && tracks.length === 0 && !challenge) {
    return null;
  }

  // Group by owner in first-seen order.
  const owners: string[] = [];
  for (const o of [
    ...visibleMeters.map((m) => m.owner),
    ...tracks.map((t) => t.owner),
  ]) {
    if (!owners.includes(o)) owners.push(o);
  }

  return (
    <section
      className="bg-ys-surface backdrop-blur-xl rounded-2xl border border-ys-border p-3 sm:p-4 shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
      aria-label="Meters and tracks"
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-bold text-ys-text">
          <DynamicIcon name="Gauge" className="w-4 h-4 text-ys-accent" />
          Meters and tracks
        </span>
        <DynamicIcon
          name={open ? "ChevronUp" : "ChevronDown"}
          className="w-4 h-4 text-ys-muted"
        />
      </button>

      {open && (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {challenge && (
            <div className="sm:col-span-2 rounded-xl border border-ys-warning/20 bg-ys-warning/5 px-3 py-2">
              <p className="text-xs font-semibold text-ys-text">
                {challenge.name}
              </p>
              <ChallengeLine challenge={challenge} />
            </div>
          )}
          {owners.map((owner) => (
            <div key={owner} className="space-y-2.5 min-w-0">
              <h3 className="text-[11px] uppercase tracking-wide text-ys-muted">
                {owner === "world" ? "World" : owner}
              </h3>
              {visibleMeters
                .filter((m) => m.owner === owner)
                .map((m) => (
                  <MeterBar key={m.id} meter={m} />
                ))}
              {tracks
                .filter((t) => t.owner === owner)
                .map((t) => (
                  <TrackBoxes key={t.id} track={t} />
                ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
