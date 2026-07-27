"use client";

import { useState } from "react";
import { DynamicIcon } from "@/app/components/DynamicIcon";

/**
 * Shape shared by a finished CustomTable and a half-written one from the
 * live stream (which has no id yet).
 */
export interface PreviewTable {
  name: string;
  description?: string;
  entries: { text: string; weight: number }[];
  streaming?: boolean;
}

/** How many rows are shown before the card has to be expanded. */
const COLLAPSED_ROWS = 4;

/**
 * One extracted random table, rendered as an actual table with each row's
 * odds worked out - a table's whole point is the spread of its results,
 * which a list of strings doesn't show.
 */
export default function TablePreviewCard({
  table,
  defaultExpanded = false,
}: {
  table: PreviewTable;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const totalWeight = table.entries.reduce(
    (sum, entry) => sum + (entry.weight > 0 ? entry.weight : 1),
    0,
  );
  const rows = expanded ? table.entries : table.entries.slice(0, COLLAPSED_ROWS);
  const hidden = table.entries.length - rows.length;

  return (
    <div
      className={`rounded-xl border bg-white/[0.03] transition-colors hover:border-purple-400/30 ${
        table.streaming
          ? "border-purple-400/30 shadow-[0_0_0_1px_rgba(168,85,247,0.12)]"
          : "border-white/10"
      }`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-3 flex items-start gap-3"
      >
        <span className="shrink-0 mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center bg-purple-500/15 text-purple-200 ring-1 ring-purple-400/25">
          <DynamicIcon name="Table" className="w-4 h-4" />
        </span>

        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-white text-sm [overflow-wrap:anywhere]">
              {table.name || (
                <span className="text-blue-300/50 italic">Writing…</span>
              )}
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] leading-none bg-white/5 text-blue-200/70">
              {table.entries.length} row
              {table.entries.length === 1 ? "" : "s"}
            </span>
          </span>
          {table.description && (
            <span className="block text-xs text-blue-200/60 mt-1 line-clamp-2">
              {table.description}
            </span>
          )}
        </span>

        <span className="shrink-0 flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-purple-300">Table</span>
          <span className="text-blue-300/40">
            <DynamicIcon
              name={expanded ? "ChevronUp" : "ChevronDown"}
              className="w-4 h-4"
            />
          </span>
        </span>
      </button>

      {table.entries.length > 0 && (
        <div className="px-3 pb-3 -mt-1">
          <div className="rounded-lg bg-black/20 overflow-hidden">
            {rows.map((entry, i) => {
              const weight = entry.weight > 0 ? entry.weight : 1;
              const share = totalWeight > 0 ? (weight / totalWeight) * 100 : 0;
              return (
                <div
                  key={`${entry.text}-${i}`}
                  className="relative flex items-center gap-2 px-2.5 py-1.5 border-b border-white/5 last:border-b-0"
                >
                  {/* Odds as a bar behind the row - readable at a glance
                      without a second column of numbers to parse. */}
                  <span
                    className="absolute inset-y-0 left-0 bg-purple-500/10"
                    style={{ width: `${share}%` }}
                    aria-hidden
                  />
                  <span className="relative flex-1 min-w-0 text-xs text-blue-100/85 [overflow-wrap:anywhere]">
                    {entry.text}
                  </span>
                  <span className="relative shrink-0 text-[10px] tabular-nums text-purple-200/70">
                    {share >= 0.5 ? share.toFixed(0) : share.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
          {hidden > 0 && (
            <button
              onClick={() => setExpanded(true)}
              className="mt-1.5 text-[11px] text-purple-300/70 hover:text-purple-200"
            >
              Show {hidden} more row{hidden === 1 ? "" : "s"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
