"use client";

import { useState } from "react";
import { StoryData } from "../../misc/structs";
import { DynamicIcon } from "../../components/DynamicIcon";
import { useNotification } from "../../misc/NotificationContext";
import {
  compactStoryInPlace,
  buildCondensedStorySeed,
  estimateStoryDataSize,
  summarizeNow,
  COMPACT_NOW_KEEP_PARTS,
  DEFAULT_KEEP_RECENT_PARTS,
  CompactStoryResult,
} from "../../misc/storyCompaction";
import { CompactionApiOptions } from "../../misc/compaction";
import { useBackHandler } from "@/app/misc/useBackHandler";

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
  const [focus, setFocus] = useState("");

  // Android back: out of the spin-off form first, then close; never while
  // working (decision 133).
  useBackHandler(true, () => {
    if (busy) return;
    if (mode !== "menu") setMode("menu");
    else onClose();
  });

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

  // "Compact now": summarise everything but the last two turns, steered by an
  // optional focus. Removes nothing from the story the player reads.
  const handleSummariseNow = async () => {
    setBusy(true);
    try {
      const clone = structuredClone(storyData);
      const sizeBeforeBytes = estimateStoryDataSize(clone);
      const result = await summarizeNow(clone, apiOptions, {
        focus: focus.trim() || undefined,
      });
      if (!result.ran) {
        addNotification(
          "Nothing to summarise yet, or the AI call failed",
          "warning",
        );
        return;
      }
      onCompacted(clone, {
        sizeBeforeBytes,
        sizeAfterBytes: estimateStoryDataSize(clone),
        partsPruned: 0,
        archivedThreads: 0,
        archivedGoals: 0,
        narrativeSummarized: true,
        partsRemoved: 0,
      });
      addNotification(
        `Summarised ${result.partsFolded} earlier exchanges; the last ${COMPACT_NOW_KEEP_PARTS / 2} turns stay word for word`,
        "success",
      );
      onClose();
    } catch (error) {
      console.error("Error summarising story:", error);
      addNotification("Failed to summarise story", "failure");
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
    <div className="fixed inset-0 ys-modal-backdrop flex items-center justify-center z-60 p-4">
      <div className="bg-ys-surface/95 backdrop-blur-2xl rounded-2xl border border-ys-border w-full max-w-md shadow-2xl">
        <div className="p-4 border-b border-ys-border">
          <h3 className="text-lg font-semibold text-ys-text flex items-center gap-2">
            <DynamicIcon name="Minimize2" className="w-5 h-5 text-ys-accent" />
            Compact Story
          </h3>
          <p className="text-sm text-ys-muted mt-1">
            Current size: {formatBytes(currentSize)} · {partCount} exchanges
          </p>
        </div>

        {mode === "menu" && (
          <>
            <div className="p-4 space-y-4">
              <p className="text-sm text-ys-text/80">
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
                  className="mt-1 w-4 h-4 rounded border-ys-border bg-ys-surface accent-ys-warning"
                />
                <span className="text-sm text-ys-muted group-hover:text-ys-text transition-colors">
                  <span className="font-medium text-ys-warning">
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

            <div className="p-4 border-t border-ys-border space-y-2">
              <p className="text-sm text-ys-text/80">
                <span className="font-medium text-ys-accent">Summarise now</span>{" "}
                — folds everything except the last {COMPACT_NOW_KEEP_PARTS / 2}{" "}
                turns into the story-so-far the AI reads. Nothing is removed
                from your story. Say what to hold on to, if you like.
              </p>
              <input
                type="text"
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                placeholder="Focus (optional), e.g. keep everything about the Salon"
                className="w-full px-3 py-2 bg-ys-surface border border-ys-border rounded-xl text-ys-text placeholder-ys-muted focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40 text-sm"
              />
              <button
                onClick={handleSummariseNow}
                disabled={busy}
                className="w-full px-4 py-2 bg-ys-surface hover:bg-ys-surface-2 disabled:opacity-50 text-ys-muted hover:text-ys-text font-medium rounded-lg transition-all border border-ys-border flex items-center justify-center gap-2"
              >
                <DynamicIcon name="Minimize2" className="w-4 h-4" />
                Summarise Now
              </button>
            </div>

            <div className="p-4 border-t border-ys-border flex flex-col gap-2">
              <button
                onClick={handleCompactInPlace}
                disabled={busy}
                className="w-full px-4 py-2 bg-ys-accent disabled:opacity-50 text-ys-on-accent font-medium rounded-lg transition-all shadow-md shadow-ys-accent/40 flex items-center justify-center gap-2"
              >
                {busy ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-ys-border border-t-transparent" />
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
                className="w-full px-4 py-2 bg-ys-surface hover:bg-ys-surface-2 disabled:opacity-50 text-ys-muted hover:text-ys-text font-medium rounded-lg transition-all border border-ys-border flex items-center justify-center gap-2"
              >
                <DynamicIcon name="GitBranch" className="w-4 h-4" />
                Spin Off Condensed Copy
              </button>
              <button
                onClick={onClose}
                disabled={busy}
                className="w-full px-4 py-2 text-ys-accent hover:text-ys-text hover:bg-ys-surface-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {mode === "spinoff-name" && (
          <>
            <div className="p-4 space-y-3">
              <p className="text-sm text-ys-text/80">
                Creates a new story with your character sheet, world lore, and
                a fresh summary of everything that happened so far. This story
                is left completely untouched.
              </p>
              <label className="block text-sm font-medium text-ys-text">
                New Story Name
              </label>
              <input
                type="text"
                value={spinoffName}
                onChange={(e) => setSpinoffName(e.target.value)}
                placeholder="Enter a name for the new story..."
                className="w-full px-3 py-2 bg-ys-surface border border-ys-border rounded-xl text-ys-text placeholder-ys-muted focus:outline-none focus:ring-2 focus:ring-ys-success/40 focus:border-ys-success/40"
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
            <div className="p-4 border-t border-ys-border flex justify-end gap-3">
              <button
                onClick={() => setMode("menu")}
                disabled={busy}
                className="px-4 py-2 text-ys-accent hover:text-ys-text hover:bg-ys-surface-2 rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSpinOff}
                disabled={busy || !spinoffName.trim()}
                className="px-4 py-2 bg-ys-success/15 disabled:text-ys-muted text-ys-success font-medium rounded-lg transition-all flex items-center gap-2 border border-ys-success/40"
              >
                {busy ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-ys-border border-t-transparent" />
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
