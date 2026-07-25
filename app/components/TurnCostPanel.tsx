"use client";

/**
 * "What does a turn cost?" - both halves of it.
 *
 * PREDICTION comes from turnCostEstimate.ts, which walks every API call a
 * turn makes against the user's live configuration (tier ladder, reasoning
 * effort, per-layer model overrides, Memory Size, observer settings,
 * cadences) and prices them. It re-reads that configuration whenever the
 * settings change, so switching a tier's model updates the number in place.
 *
 * ACTUALS come from turnCost.ts's ledger, which every AI call in the app
 * reports into. The last turn's row keeps updating for a few seconds after
 * the turn returns, as the background layers (Memory Keeper, Observer,
 * Director) land their calls.
 *
 * Dollar figures are raw provider list prices against the player's own BYOK
 * key - no markup, no coins.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { DynamicIcon } from "./DynamicIcon";
import { StoryData } from "@/app/misc/structs";
import {
  TurnCostReport,
  TURN_COST_STAGE_LABELS,
  TURN_COST_UPDATED_EVENT,
  TURN_COST_INPUTS_CHANGED_EVENT,
  formatUsd,
  turnsPerDollar,
  getLatestTurnCostReport,
  resetTurnCostCalibration,
} from "@/app/misc/turnCost";
import {
  TurnCostEstimate,
  estimateTurnCostFromSettings,
  describePredictedTier,
} from "@/app/misc/turnCostEstimate";
import { LAYER_SETTINGS_CHANGED_EVENT } from "@/app/misc/layerSettings";
import { REASONING_CONFIG_CHANGED_EVENT } from "@/app/misc/reasoningTiers";
import { getTierModelDisplayName } from "@/app/misc/reasoningTiers";

interface TurnCostPanelProps {
  /**
   * Live story, when the panel is shown mid-game - lets the prediction use
   * the tier the next turn will actually run at (combat is more expensive)
   * rather than assuming the baseline.
   */
  storyData?: StoryData;
  /** Start with the per-stage breakdown open. */
  defaultExpanded?: boolean;
}

export default function TurnCostPanel({
  storyData,
  defaultExpanded = false,
}: TurnCostPanelProps) {
  const [estimate, setEstimate] = useState<TurnCostEstimate | null>(null);
  const [lastTurn, setLastTurn] = useState<TurnCostReport | null>(null);
  const [expanded, setExpanded] = useState(defaultExpanded);

  const refreshEstimate = useCallback(() => {
    setEstimate(estimateTurnCostFromSettings(storyData));
  }, [storyData]);

  const refreshActuals = useCallback(() => {
    setLastTurn(getLatestTurnCostReport());
  }, []);

  // Estimate is computed client-side only - it reads localStorage for every
  // override, so it can't run during SSR.
  useEffect(() => {
    refreshEstimate();
    refreshActuals();
  }, [refreshEstimate, refreshActuals]);

  useEffect(() => {
    const events = [
      REASONING_CONFIG_CHANGED_EVENT,
      LAYER_SETTINGS_CHANGED_EVENT,
      TURN_COST_INPUTS_CHANGED_EVENT,
      "custom-models-changed",
    ];
    events.forEach((e) => window.addEventListener(e, refreshEstimate));
    return () =>
      events.forEach((e) => window.removeEventListener(e, refreshEstimate));
  }, [refreshEstimate]);

  useEffect(() => {
    const onCostUpdate = () => {
      refreshActuals();
      // A finished turn re-calibrates the estimator, so the prediction moves
      // too - refresh both rather than letting them drift apart on screen.
      refreshEstimate();
    };
    window.addEventListener(TURN_COST_UPDATED_EVENT, onCostUpdate);
    return () =>
      window.removeEventListener(TURN_COST_UPDATED_EVENT, onCostUpdate);
  }, [refreshActuals, refreshEstimate]);

  const predictedTier = useMemo(
    () => (estimate ? describePredictedTier(storyData) : null),
    [estimate, storyData],
  );

  if (!estimate) {
    return (
      <div className="p-4 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-lg">
        <div className="h-4 w-32 bg-white/10 rounded animate-pulse" />
      </div>
    );
  }

  const perDollar = turnsPerDollar(estimate.expectedUsd);
  const maxLineUsd = Math.max(
    ...estimate.lines.map((l) => l.expectedUsd),
    Number.EPSILON,
  );

  return (
    <div className="p-4 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-lg space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-medium text-white flex items-center gap-2">
            <DynamicIcon name="Coins" className="w-4 h-4" />
            Cost per turn
          </h4>
          <p className="text-xs text-blue-300/60 mt-1">
            What one round of play costs on your own API keys - the GM, the
            narration, the choices, and the background layers.
          </p>
        </div>
      </div>

      {/* Headline prediction */}
      <div className="bg-linear-to-r from-purple-600/25 to-blue-600/25 border border-purple-400/20 rounded-lg p-3">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-2xl font-bold text-white tabular-nums">
            {formatUsd(estimate.expectedUsd)}
          </span>
          <span className="text-xs text-blue-200/70">per turn, typically</span>
        </div>
        <div className="text-xs text-blue-200/70 mt-1">
          Range {formatUsd(estimate.lowUsd)} - {formatUsd(estimate.highUsd)}
          {perDollar !== null && (
            <span className="text-blue-200/50">
              {" "}
              &middot; about {perDollar.toLocaleString()} turns per $1
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="bg-black/20 rounded-md px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-wide text-blue-300/50">
              You wait on
            </div>
            <div className="text-sm font-semibold text-white tabular-nums">
              {formatUsd(estimate.foregroundUsd)}
            </div>
          </div>
          <div className="bg-black/20 rounded-md px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-wide text-blue-300/50">
              Background layers
            </div>
            <div className="text-sm font-semibold text-white tabular-nums">
              {formatUsd(estimate.backgroundUsd)}
            </div>
          </div>
        </div>
        {predictedTier && (
          <p className="text-[11px] text-blue-200/50 mt-2">
            Assuming tier {predictedTier.tier} (
            {getTierModelDisplayName(predictedTier.modelKey)}, effort{" "}
            {predictedTier.reasoningEffort}) for the GM
            {storyData ? " on your next turn" : ""}.
          </p>
        )}
      </div>

      {/* Last turn's real spend */}
      {lastTurn && lastTurn.calls > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-lg p-3">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <span className="text-xs text-blue-300/60">
              Last turn actually cost
            </span>
            <span className="text-base font-semibold text-emerald-300 tabular-nums">
              {formatUsd(lastTurn.totalUsd)}
            </span>
          </div>
          <div className="text-[11px] text-blue-300/50 mt-1">
            {lastTurn.calls} API call{lastTurn.calls === 1 ? "" : "s"} &middot;{" "}
            {lastTurn.promptTokens.toLocaleString()} in /{" "}
            {lastTurn.completionTokens.toLocaleString()} out
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {lastTurn.byStage.map((stage) => (
              <span
                key={stage.stage}
                title={`${stage.calls} call(s), ${stage.promptTokens.toLocaleString()} in / ${stage.completionTokens.toLocaleString()} out`}
                className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-blue-200/70"
              >
                {TURN_COST_STAGE_LABELS[stage.stage]}{" "}
                <span className="text-white/80 tabular-nums">
                  {formatUsd(stage.costUsd)}
                </span>
              </span>
            ))}
          </div>
          {lastTurn.hasUnpricedCalls && (
            <p className="text-[11px] text-amber-300/80 mt-2">
              Some calls used models with no price data - the real total is
              higher.
            </p>
          )}
          <p className="text-[11px] text-blue-300/40 mt-2">
            Full per-call breakdown is in Debug Logs, under &ldquo;Turn
            cost&rdquo;.
          </p>
        </div>
      )}

      {/* Per-stage prediction breakdown */}
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between text-xs text-blue-300/70 hover:text-blue-200 py-1"
        >
          <span className="flex items-center gap-1.5">
            <DynamicIcon
              name={expanded ? "ChevronDown" : "ChevronRight"}
              className="w-3.5 h-3.5"
            />
            Where the money goes
          </span>
          <span className="text-blue-300/40">
            {estimate.lines.length} stages
          </span>
        </button>

        {expanded && (
          <div className="space-y-1.5 mt-2">
            {[...estimate.lines]
              .sort((a, b) => b.expectedUsd - a.expectedUsd)
              .map((line) => (
                <div
                  key={`${line.stage}-${line.label}`}
                  className="bg-white/[0.03] border border-white/5 rounded-md px-2.5 py-2"
                  title={line.note}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-white truncate">
                      {line.label}
                    </span>
                    <span className="text-xs text-blue-100 tabular-nums shrink-0">
                      {formatUsd(line.expectedUsd)}
                    </span>
                  </div>
                  {/* Relative-share bar: the point of this panel is spotting
                      which layer dominates, which a column of numbers hides. */}
                  <div className="h-1 bg-white/5 rounded-full mt-1.5 overflow-hidden">
                    <div
                      className="h-full bg-linear-to-r from-purple-400 to-blue-400 rounded-full"
                      style={{
                        width: `${Math.max(2, (line.expectedUsd / maxLineUsd) * 100)}%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap text-[10px] text-blue-300/50">
                    <span className="truncate max-w-[45%]">
                      {line.modelName}
                    </span>
                    {line.reasoningEffort && (
                      <span className="px-1.5 py-px rounded bg-white/5">
                        {line.reasoningEffort}
                      </span>
                    )}
                    <span>
                      {line.expectedCalls < 1
                        ? `${Math.round(line.expectedCalls * 100)}% of turns`
                        : `${line.expectedCalls.toFixed(1)}x`}
                    </span>
                    <span>
                      {line.inputTokens.toLocaleString()} in /{" "}
                      {line.outputTokens.toLocaleString()} out
                    </span>
                    {line.calibrated && (
                      <span
                        title="Sized from your own measured turns, not defaults"
                        className="px-1.5 py-px rounded bg-emerald-500/15 text-emerald-300"
                      >
                        measured
                      </span>
                    )}
                    {line.unpriced && (
                      <span
                        title="This model has no prices set, so it reads as free"
                        className="px-1.5 py-px rounded bg-amber-500/15 text-amber-300"
                      >
                        no price
                      </span>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      <div className="space-y-1 pt-1 border-t border-white/5">
        {estimate.assumptions.map((assumption) => (
          <p key={assumption} className="text-[11px] text-blue-300/40">
            {assumption}
          </p>
        ))}
        {estimate.calibrationSamples > 0 && (
          <button
            onClick={() => {
              resetTurnCostCalibration();
              refreshEstimate();
            }}
            className="text-[11px] text-purple-300/70 hover:text-purple-200 hover:underline"
          >
            Reset measurements
          </button>
        )}
      </div>
    </div>
  );
}
