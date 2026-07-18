"use client";

import { useState } from "react";
import { DynamicIcon } from "./DynamicIcon";
import { getToolProgressLabel } from "../misc/gmToolLabels";

export interface GMProgressEntry {
  type: "thinking" | "tool";
  content?: string;
  result?: {
    success: boolean;
    contextForStory: string;
    toolName: string;
  };
  isStreaming?: boolean;
}

interface GMProgressPanelProps {
  entries: GMProgressEntry[];
  /** GM stage is still actively running (shows a pulsing "in progress" marker). */
  active?: boolean;
}

/**
 * Compact, always-visible summary of what the GM is doing during its
 * tool-calling loop (dice rolls, NPC updates, combat changes, etc.) -
 * collapsed by default to a row of step markers, expandable to a short
 * checklist. Separate from the "Show Thinking" toggle, which reveals the
 * GM's full raw reasoning text - this is meant to be glanceable even for
 * players who never open that.
 */
export function GMProgressPanel({ entries, active = false }: GMProgressPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const steps = entries.filter(
    (e): e is GMProgressEntry & { result: NonNullable<GMProgressEntry["result"]> } =>
      e.type === "tool" && !!e.result
  );

  if (steps.length === 0) return null;

  const lastStep = steps[steps.length - 1];
  const summaryLabel = active
    ? `${getToolProgressLabel(lastStep.result.toolName)}…`
    : `${steps.length} step${steps.length === 1 ? "" : "s"} completed`;

  return (
    <div className="rounded-lg border border-blue-800/30 bg-blue-950/40 overflow-hidden text-sm">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-blue-900/30 transition-colors"
      >
        <span className="font-semibold text-blue-200">Progress</span>
        <DynamicIcon
          name={expanded ? "ChevronUp" : "ChevronDown"}
          className="w-4 h-4 text-blue-300/60"
        />
      </button>

      {!expanded && (
        <div className="px-3 pb-2.5">
          <div className="flex items-center gap-1.5">
            {steps.map((step, idx) => {
              const isLast = idx === steps.length - 1;
              const isPending = isLast && active;
              return (
                <div key={idx} className="flex items-center gap-1.5">
                  {idx > 0 && <div className="w-3 h-px bg-blue-800/50" />}
                  <div
                    className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 ${
                      isPending
                        ? "border-2 border-blue-400 animate-pulse"
                        : step.result.success
                        ? "bg-green-500/80"
                        : "bg-red-500/80"
                    }`}
                    title={getToolProgressLabel(step.result.toolName)}
                  >
                    {!isPending && (
                      <DynamicIcon
                        name={step.result.success ? "Check" : "X"}
                        className="w-2.5 h-2.5 text-blue-950"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-blue-300/50">{summaryLabel}</p>
        </div>
      )}

      {expanded && (
        <div className="px-3 pb-2.5 space-y-1.5">
          {steps.map((step, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <DynamicIcon
                name={step.result.success ? "Check" : "X"}
                className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                  step.result.success ? "text-green-400" : "text-red-400"
                }`}
              />
              <div className="min-w-0">
                <p className="text-blue-200 font-medium">
                  {getToolProgressLabel(step.result.toolName)}
                </p>
                {step.result.contextForStory && (
                  <p className="text-blue-300/50 text-xs mt-0.5 line-clamp-2">
                    {step.result.contextForStory}
                  </p>
                )}
              </div>
            </div>
          ))}
          {active && (
            <div className="flex items-center gap-2 text-blue-300/50 text-xs pt-0.5">
              <span className="w-3.5 h-3.5 flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              </span>
              Working…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
