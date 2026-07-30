"use client";

import { useMemo, useState } from "react";
import { DynamicIcon } from "@/app/components/DynamicIcon";
import NotePreviewCard, { PreviewNote } from "./NotePreviewCard";

export type { PreviewNote };

type Filter = "all" | "lore" | "mechanics" | "tables";

/** Above this many entries, a search box earns its place. */
const SEARCH_THRESHOLD = 8;

function matches(text: string, query: string): boolean {
  return text.toLowerCase().includes(query);
}

/**
 * The extracted material from one chunk, file or saved import - lore,
 * mechanics and tables, all of them notes - as cards, filterable by kind and
 * searchable once there are enough of them to hunt through.
 */
export default function ExtractionPreview({
  // Defaulted rather than required-in-practice: these come from records that
  // outlive the code that wrote them (see `noteList` in PDFImporter.tsx), and
  // a saved import missing a list should render the lists it has, not blow up
  // the panel.
  lore = [],
  mechanicNotes = [],
  tableNotes = [],
  streaming = false,
  emptyMessage = "Nothing extracted yet.",
  scrollClass,
}: {
  lore?: PreviewNote[];
  mechanicNotes?: PreviewNote[];
  tableNotes?: PreviewNote[];
  /** True while entries are still arriving, for the live indicator. */
  streaming?: boolean;
  emptyMessage?: string;
  /**
   * Classes that make the list scroll inside a fixed height, e.g.
   * "max-h-72 overflow-y-auto pr-1". Left to the caller (rather than a bare
   * height) so a layout can keep the list scrolling on desktop and let it
   * grow into the page scroll on mobile.
   */
  scrollClass?: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const total = lore.length + mechanicNotes.length + tableNotes.length;
  const needle = query.trim().toLowerCase();

  const visible = useMemo(() => {
    const noteMatches = (note: PreviewNote) =>
      !needle || matches(note.title, needle) || matches(note.content, needle);

    return {
      lore: filter === "all" || filter === "lore" ? lore.filter(noteMatches) : [],
      mechanicNotes:
        filter === "all" || filter === "mechanics"
          ? mechanicNotes.filter(noteMatches)
          : [],
      tableNotes:
        filter === "all" || filter === "tables"
          ? tableNotes.filter(noteMatches)
          : [],
    };
  }, [filter, needle, lore, mechanicNotes, tableNotes]);

  const visibleCount =
    visible.lore.length + visible.mechanicNotes.length + visible.tableNotes.length;

  const filters: { id: Filter; label: string; count: number; active: string }[] = [
    { id: "all", label: "All", count: total, active: "bg-white/15 text-white" },
    {
      id: "lore",
      label: "Lore",
      count: lore.length,
      active: "bg-blue-500/20 text-blue-100 ring-1 ring-blue-400/30",
    },
    {
      id: "mechanics",
      label: "Mechanics",
      count: mechanicNotes.length,
      active: "bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/30",
    },
    {
      id: "tables",
      label: "Tables",
      count: tableNotes.length,
      active: "bg-purple-500/20 text-purple-100 ring-1 ring-purple-400/30",
    },
  ];

  if (total === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 p-6 text-center">
        {streaming ? (
          <div className="flex items-center justify-center gap-2 text-sm text-blue-300/60">
            <DynamicIcon name="LoaderCircle" className="w-4 h-4 animate-spin" />
            Waiting for the first note…
          </div>
        ) : (
          <p className="text-sm text-blue-300/50 italic">{emptyMessage}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {filters.map((entry) => (
          <button
            key={entry.id}
            onClick={() => setFilter(entry.id)}
            disabled={entry.count === 0 && entry.id !== "all"}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
              filter === entry.id
                ? entry.active
                : "bg-white/5 text-blue-300/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            {entry.label}
            <span className="ml-1.5 tabular-nums opacity-70">{entry.count}</span>
          </button>
        ))}
        {streaming && (
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-purple-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            Writing…
          </span>
        )}
      </div>

      {total > SEARCH_THRESHOLD && (
        <div className="relative">
          <span className="text-blue-300/40 absolute left-2.5 top-1/2 -translate-y-1/2">
            <DynamicIcon name="Search" className="w-3.5 h-3.5" />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search these notes…"
            className="w-full pl-8 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-blue-300/40 focus:outline-none focus:border-purple-400/40"
          />
        </div>
      )}

      <div
        className={`space-y-2 ${scrollClass ?? ""}`}
      >
        {visibleCount === 0 && (
          <p className="text-xs text-blue-300/50 italic py-2">
            Nothing matches “{query.trim()}”.
          </p>
        )}
        {visible.lore.map((note, i) => (
          <NotePreviewCard key={`lore-${note.title}-${i}`} note={note} fallbackKind="lore" />
        ))}
        {visible.mechanicNotes.map((note, i) => (
          <NotePreviewCard
            key={`mech-${note.title}-${i}`}
            note={note}
            fallbackKind="mechanics"
          />
        ))}
        {visible.tableNotes.map((note, i) => (
          <NotePreviewCard
            key={`table-${note.title}-${i}`}
            note={note}
            fallbackKind="table"
          />
        ))}
      </div>
    </div>
  );
}
