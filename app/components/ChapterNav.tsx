"use client";

import { useState, useRef, useEffect } from "react";
import { ScenePart } from "../misc/structs";
import { computeChapterSegments } from "../misc/chapterNav";
import { DynamicIcon } from "./DynamicIcon";

interface ChapterNavProps {
  parts: ScenePart[];
  currentIndex: number | null;
  onJump: (index: number) => void;
}

/**
 * Compact "jump to chapter" dropdown, computed from ScenePart.endChapter
 * markers. Hidden entirely until there are at least 2 chapters - a single
 * ongoing chapter has nothing to navigate between.
 */
export function ChapterNav({ parts, currentIndex, onJump }: ChapterNavProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const segments = computeChapterSegments(parts);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (segments.length < 2) return null;

  const viewedIndex = currentIndex ?? parts.length - 1;
  const currentChapter =
    [...segments].reverse().find((s) => s.startIndex <= viewedIndex) ??
    segments[0];

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1 text-xs text-blue-300/70 hover:text-blue-200 transition-colors px-1.5 py-1 rounded hover:bg-blue-800/40"
        title="Jump to chapter"
      >
        <DynamicIcon name="BookMarked" className="w-3.5 h-3.5" />
        <span>Ch. {currentChapter.number}</span>
        <DynamicIcon
          name={open ? "ChevronUp" : "ChevronDown"}
          className="w-3 h-3"
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-64 max-h-80 overflow-y-auto rounded-lg border border-blue-800/40 bg-gray-900 shadow-xl py-1">
          {segments.map((segment) => (
            <button
              key={segment.number}
              onClick={() => {
                onJump(segment.startIndex);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-blue-800/40 ${
                segment.number === currentChapter.number
                  ? "bg-blue-800/30 text-white"
                  : "text-blue-200/80"
              }`}
            >
              <div className="font-medium">Chapter {segment.number}</div>
              <div className="text-xs text-blue-300/50 truncate">
                {segment.preview}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
