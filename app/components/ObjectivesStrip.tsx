"use client";

import { useState } from "react";
import { StoryData } from "../misc/structs";
import { getActiveObjectives } from "../misc/objectives";
import { DynamicIcon } from "./DynamicIcon";

interface ObjectivesStripProps {
  storyData: StoryData;
  /** Optional: switch to the full Journal/goals page for details. */
  onOpenJournal?: () => void;
}

/**
 * Glanceable "what's currently open" strip - active goals + active story
 * threads, collapsed by default to a single count pill. The full journal
 * page (goals.tsx) still owns the detailed view (descriptions, completed/
 * abandoned history); this is just a lightweight always-visible summary so
 * players don't have to leave the main story view to check.
 */
export function ObjectivesStrip({ storyData, onOpenJournal }: ObjectivesStripProps) {
  const [expanded, setExpanded] = useState(false);
  const objectives = getActiveObjectives(storyData);

  if (objectives.length === 0) return null;

  return (
    <div className="border-b border-blue-800/30 bg-blue-950/20">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between px-3 sm:px-4 py-1.5 text-xs text-blue-300/70 hover:text-blue-200 hover:bg-blue-900/20 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <DynamicIcon name="Target" className="w-3.5 h-3.5" />
          {objectives.length} active objective{objectives.length === 1 ? "" : "s"}
        </span>
        <DynamicIcon
          name={expanded ? "ChevronUp" : "ChevronDown"}
          className="w-3.5 h-3.5"
        />
      </button>

      {expanded && (
        <div className="px-3 sm:px-4 pb-2 space-y-1">
          {objectives.map((objective) => (
            <div
              key={objective.key}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="flex items-center gap-1.5 text-blue-200/80 min-w-0">
                <DynamicIcon
                  name={objective.kind === "goal" ? "Scroll" : "GitBranch"}
                  className="w-3 h-3 shrink-0 text-blue-400/70"
                />
                <span className="truncate">{objective.title}</span>
              </span>
              {objective.detail && (
                <span className="shrink-0 text-blue-400/50">{objective.detail}</span>
              )}
            </div>
          ))}
          {onOpenJournal && (
            <button
              onClick={onOpenJournal}
              className="text-xs text-blue-400 hover:text-blue-300 pt-1"
            >
              View journal →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
