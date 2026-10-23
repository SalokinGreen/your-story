"use client";

import { useState } from "react";
import { DynamicIcon } from "@/app/components/DynamicIcon";
import type { LocalAdventure } from "@/app/misc/localAdventureManager";
import {
  BUILTIN_SYSTEMS,
  builtinAdventureToLocal,
  type BuiltinSystem,
} from "@/app/misc/systems";

interface BuiltinSystemsSectionProps {
  /** Starts a starter through the same pre-play flow as a saved adventure. */
  onPlay: (adventure: LocalAdventure) => void;
  /** Saves a copy as a normal adventure and opens it in the Designer. */
  onOpenCopy: (adventure: LocalAdventure) => void;
  /** Defaults to the registry; a test passes its own. */
  systems?: BuiltinSystem[];
}

/**
 * The built-in default systems on the Library home (decision 81): each with
 * its packs (a collapsible list of note titles) and starter adventures. These
 * live in memory, not in IndexedDB, so they have no edit, delete or move
 * controls; the only ways to change one are to play it or open a copy.
 * Renders nothing while the registry is empty.
 */
export default function BuiltinSystemsSection({
  onPlay,
  onOpenCopy,
  systems = BUILTIN_SYSTEMS,
}: BuiltinSystemsSectionProps) {
  const [openPack, setOpenPack] = useState<string | null>(null);
  if (systems.length === 0) return null;

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-lg font-bold">Built-in systems</h2>
        <span className="text-xs text-ys-muted">
          Ready to play, and read-only
        </span>
      </div>
      <div className="space-y-4">
        {systems.map((system) => (
          <div
            key={system.id}
            className="rounded-xl border border-ys-warning/40 p-4 bg-ys-warning/15"
          >
            <h3 className="font-semibold flex items-center gap-2">
              <DynamicIcon name="Package" className="w-4 h-4 text-ys-warning" />
              {system.title}
            </h3>
            <p className="text-sm text-ys-muted mt-1">
              {system.description}
            </p>

            <div className="mt-3 space-y-1.5">
              {system.packs.map((pack) => {
                const isOpen = openPack === pack.id;
                return (
                  <div
                    key={pack.id}
                    className="rounded-lg border border-ys-border bg-ys-surface"
                  >
                    <button
                      onClick={() => setOpenPack(isOpen ? null : pack.id)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm"
                      aria-expanded={isOpen}
                    >
                      <span className="min-w-0">
                        <span className="font-medium">{pack.title}</span>
                        <span className="text-ys-muted">
                          {" "}
                          · {pack.notes.length} note
                          {pack.notes.length === 1 ? "" : "s"}
                        </span>
                      </span>
                      <DynamicIcon
                        name={isOpen ? "ChevronUp" : "ChevronDown"}
                        className="w-4 h-4 text-ys-muted shrink-0"
                      />
                    </button>
                    {isOpen && (
                      <div className="px-3 pb-2">
                        <p className="text-xs text-ys-muted mb-1.5">
                          {pack.description}
                        </p>
                        <ul className="text-xs text-ys-text space-y-0.5 columns-1 sm:columns-2">
                          {pack.notes.map((n) => (
                            <li key={n.id} className="truncate">
                              {n.title}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {system.starters.length > 0 && (
              <div className="mt-3 space-y-2">
                {system.starters.map((starter) => {
                  const local = builtinAdventureToLocal(starter);
                  return (
                    <div
                      key={starter.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ys-border bg-ys-surface px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {local.title}
                        </p>
                        {local.description && (
                          <p className="text-xs text-ys-muted line-clamp-2">
                            {local.description}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => onPlay(local)}
                          className="px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 bg-ys-accent text-ys-on-accent hover:opacity-90"
                        >
                          <DynamicIcon name="Play" className="w-4 h-4" />
                          Play
                        </button>
                        <button
                          onClick={() => onOpenCopy(local)}
                          className="px-3 py-1.5 rounded-lg text-sm bg-ys-surface hover:bg-ys-surface-2 border border-ys-border text-ys-text flex items-center gap-1.5"
                        >
                          <DynamicIcon name="Copy" className="w-4 h-4" />
                          Open a copy in the Designer
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
