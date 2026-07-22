"use client";

import { useState } from "react";
import { StoryData } from "../../misc/structs";
import { DynamicIcon } from "../../components/DynamicIcon";
import { useNotification } from "../../misc/NotificationContext";
import {
  compactStoryInPlace,
  buildCondensedStorySeed,
  estimateStoryDataSize,
  DEFAULT_KEEP_RECENT_PARTS,
  CompactStoryResult,
} from "../../misc/storyCompaction";
import { CompactionApiOptions } from "../../misc/compaction";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

type Mode = "menu" | "spinoff-name";

export default function CompactStoryModal({
  storyData,
  apiOptions,
  onClose,
  onCompacted,
  onSpinOff,
}: {
  storyData: StoryData;
  apiOptions: CompactionApiOptions;
  onClose: () => void;
  onCompacted: (updated: StoryData, result: CompactStoryResult) => void;
  onSpinOff: (seed: StoryData) => void;
}) {
  const { addNotification } = useNotification();
  const [mode, setMode] = useState<Mode>("menu");
  const [summarizeNarrative, setSummarizeNarrative] = useState(false);
  const [spinoffName, setSpinoffName] = useState(
    `${storyData.story_name} (Continued)`,
  );
  const [busy, setBusy] = useState(false);

  const currentSize = estimateStoryDataSize(storyData);
  const partCount = storyData.scene.parts.length;
  const willSummarize =
    summarizeNarrative && partCount > DEFAULT_KEEP_RECENT_PARTS;

  const handleCompactInPlace = async () => {
    setBusy(true);
    try {
      const clone = structuredClone(storyData);
      const result = await compactStoryInPlace(
        clone,
        { summarizeNarrative },
        summarizeNarrative ? apiOptions : undefined,
      );
      onCompacted(clone, result);
      const freed = result.sizeBeforeBytes - result.sizeAfterBytes;
      const sizeNote = freed > 0 ? `, freed ${formatBytes(freed)}` : "";
      if (summarizeNarrative && !result.narrativeSummarized) {
        addNotification(
          `Story compacted${sizeNote}, but narrative summarization didn't run (nothing new to summarize, or the AI call failed)`,
          "warning",
        );
      } else {
        addNotification(`Story compacted${sizeNote}`, "success");
      }
      onClose();
    } catch (error) {
      console.error("Error compacting story:", error);
      addNotification("Failed to compact story", "failure");
    } finally {
      setBusy(false);
    }
  };

  const handleSpinOff = async () => {
    const name = spinoffName.trim() || `${storyData.story_name} (Continued)`;
    setBusy(true);
    try {
      const seed = await buildCondensedStorySeed(storyData, name, apiOptions);
      onSpinOff(seed);
      addNotification(`Created "${name}"`, "success");
      onClose();
    } catch (error) {
      console.error("Error spinning off condensed story:", error);
      addNotification("Failed to create condensed story", "failure");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-60 p-4">
      <div className="bg-[#0d1829]/95 backdrop-blur-2xl rounded-2xl border border-white/10 w-full max-w-md shadow-2xl shadow-black/50">
        <div className="p-4 border-b border-white/10">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <DynamicIcon name="Minimize2" className="w-5 h-5 text-sky-400" />
            Compact Story
          </h3>
          <p className="text-sm text-blue-300/60 mt-1">
            Current size: {formatBytes(currentSize)} · {partCount} exchanges
          </p>
        </div>

        {mode === "menu" && (
          <>
            <div className="p-4 space-y-4">
              <p className="text-sm text-blue-200/80">
                Always safe: clears old debug/reasoning data from past turns
                and archives resolved threads &amp; completed goals into the
                story summary. Your narrative text is never touched by this
                part.
              </p>

              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={summarizeNarrative}
                  onChange={(e) => setSummarizeNarrative(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-white/20 bg-white/5 accent-orange-500"
                />
                <span className="text-sm text-blue-200 group-hover:text-white transition-colors">
                  <span className="font-medium text-orange-300">
                    Also summarize older narrative
                  </span>{" "}
                  — folds everything except the last {DEFAULT_KEEP_RECENT_PARTS}{" "}
                  exchanges into a short AI summary and removes the original
                  text. This is irreversible for this save; use &quot;Spin Off
                  Condensed Copy&quot; below instead if you want to keep the
                  full original untouched.
                </span>
              </label>
            </div>

            <div className="p-4 border-t border-white/10 flex flex-col gap-2">
              <button
                onClick={handleCompactInPlace}
                disabled={busy}
                className="w-full px-4 py-2 bg-linear-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 disabled:opacity-50 text-white font-medium rounded-lg transition-all shadow-md shadow-sky-950/40 flex items-center justify-center gap-2"
              >
                {busy ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                ) : (
                  <DynamicIcon name="Minimize2" className="w-4 h-4" />
                )}
                {willSummarize
                  ? "Compact This Story (summarizes old text)"
                  : "Compact This Story"}
              </button>
              <button
                onClick={() => setMode("spinoff-name")}
                disabled={busy}
                className="w-full px-4 py-2 bg-white/5 hover:bg-white/10 disabled:opacity-50 text-blue-200 hover:text-white font-medium rounded-lg transition-all border border-white/10 flex items-center justify-center gap-2"
              >
                <DynamicIcon name="GitBranch" className="w-4 h-4" />
                Spin Off Condensed Copy
              </button>
              <button
                onClick={onClose}
                disabled={busy}
                className="w-full px-4 py-2 text-blue-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {mode === "spinoff-name" && (
          <>
            <div className="p-4 space-y-3">
              <p className="text-sm text-blue-200/80">
                Creates a new story with your character sheet, world lore, and
                a fresh summary of everything that happened so far. This story
                is left completely untouched.
              </p>
              <label className="block text-sm font-medium text-blue-200">
                New Story Name
              </label>
              <input
                type="text"
                value={spinoffName}
                onChange={(e) => setSpinoffName(e.target.value)}
                placeholder="Enter a name for the new story..."
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-blue-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400/40"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && spinoffName.trim()) {
                    handleSpinOff();
                  } else if (e.key === "Escape") {
                    setMode("menu");
                  }
                }}
              />
            </div>
            <div className="p-4 border-t border-white/10 flex justify-end gap-3">
              <button
                onClick={() => setMode("menu")}
                disabled={busy}
                className="px-4 py-2 text-blue-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSpinOff}
                disabled={busy || !spinoffName.trim()}
                className="px-4 py-2 bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-white/5 disabled:to-white/5 disabled:text-emerald-300/30 text-white font-medium rounded-lg transition-all shadow-md shadow-emerald-950/40 disabled:shadow-none flex items-center gap-2"
              >
                {busy ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                ) : (
                  <DynamicIcon name="GitBranch" className="w-4 h-4" />
                )}
                Create Story
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
