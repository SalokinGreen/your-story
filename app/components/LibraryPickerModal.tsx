"use client";

import { useEffect, useMemo, useState } from "react";
import { DynamicIcon } from "./DynamicIcon";
import { DraggableScroll } from "./DraggableScroll";
import { LoreType } from "@/app/misc/structs";
import {
  LibraryNote,
  listLibraryNotes,
} from "@/app/misc/localNotesLibraryManager";
import { LocalFolder, listLocalFolders } from "@/app/misc/localFolderManager";

const NOTE_TYPE_OPTIONS: { value: LoreType; label: string }[] = [
  { value: "lore", label: "📜 Lore" },
  { value: "secret", label: "🔒 Secret" },
  { value: "mechanics", label: "⚙️ Mechanics" },
  { value: "character_sheet", label: "🧙 Character Sheet" },
  { value: "dm_instructions", label: "📌 GM Instructions" },
  { value: "story_instructions", label: "📌 Story Instructions" },
];

function noteTypeLabel(type?: LoreType): string {
  return NOTE_TYPE_OPTIONS.find((o) => o.value === type)?.label || "📜 Lore";
}

interface LibraryPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (notes: LibraryNote[]) => void;
  title?: string;
  description?: string;
  /** Restrict the list to a single note type, e.g. "character_sheet" for character reuse. */
  filterType?: LoreType;
  /** false = single-select (picking one at a time). Defaults to true. */
  multiSelect?: boolean;
  confirmLabel?: string;
  /** When provided, shows a secondary button to proceed with zero notes selected. */
  onSkip?: () => void;
  skipLabel?: string;
}

/**
 * Shared "pull from the global Notes Library" picker: folders, search, and
 * type filtering over the same IndexedDB-backed library the Library page's
 * Notes tab manages. Used both at story-creation time (Freeform Story, the
 * library page's Play buttons) and inside the in-game menu's lore editor,
 * so all three entry points browse the library the same way instead of a
 * flat unfiltered list.
 */
export default function LibraryPickerModal({
  isOpen,
  onClose,
  onImport,
  title = "Import from Notes Library",
  description = "Bring saved notes into this story.",
  filterType,
  multiSelect = true,
  confirmLabel,
  onSkip,
  skipLabel = "Start Without Notes",
}: LibraryPickerModalProps) {
  const [notes, setNotes] = useState<LibraryNote[]>([]);
  const [folders, setFolders] = useState<LocalFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) return;
    setSelectedIds(new Set());
    setSearch("");
    setSelectedFolder(null);
    setLoading(true);
    (async () => {
      try {
        const notesList = await listLibraryNotes();
        setNotes(notesList);
        setFolders(listLocalFolders());
      } catch (e) {
        console.error("Error loading notes library:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen]);

  const filteredNotes = useMemo(() => {
    return notes
      .filter((n) => {
        if (filterType && n.type !== filterType) return false;
        if (selectedFolder === "uncategorized") {
          if (n.folderId) return false;
        } else if (selectedFolder && n.folderId !== selectedFolder) {
          return false;
        }
        if (
          search &&
          !n.title.toLowerCase().includes(search.toLowerCase()) &&
          !n.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
        return (
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      });
  }, [notes, filterType, selectedFolder, search]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (!multiSelect) return prev.has(id) ? new Set() : new Set([id]);
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    onImport(notes.filter((n) => selectedIds.has(n.id)));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-linear-to-br from-blue-950 to-slate-900 rounded-xl border border-blue-700/40 w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 border-b border-blue-800/40">
          <div>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <DynamicIcon
                name="Library"
                className="w-5 h-5 text-purple-400"
              />
              {title}
            </h3>
            <p className="text-xs text-blue-200/50 mt-0.5">{description}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-blue-800/50 rounded-lg transition-colors shrink-0"
          >
            <DynamicIcon name="X" className="w-5 h-5 text-blue-300" />
          </button>
        </div>

        {/* Filters */}
        <div className="p-4 space-y-3 border-b border-blue-800/30">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes or tags..."
              className="w-full px-3 py-2 pl-9 bg-blue-900/40 border border-blue-700/40 rounded-lg text-white text-sm placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
            <DynamicIcon
              name="Search"
              className="absolute left-2.5 top-2.5 w-4 h-4 text-blue-300/50"
            />
          </div>

          {!filterType && (folders.length > 0 || notes.some((n) => n.folderId)) && (
            <DraggableScroll className="pb-1" innerClassName="gap-2">
              <button
                onClick={() => setSelectedFolder(null)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                  selectedFolder === null
                    ? "bg-linear-to-r from-purple-600 to-blue-600 text-white"
                    : "bg-blue-900/50 text-blue-200/70 hover:bg-blue-800/50"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setSelectedFolder("uncategorized")}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                  selectedFolder === "uncategorized"
                    ? "bg-linear-to-r from-purple-600 to-blue-600 text-white"
                    : "bg-blue-900/50 text-blue-200/70 hover:bg-blue-800/50"
                }`}
              >
                Uncategorized
              </button>
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => setSelectedFolder(folder.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                    selectedFolder === folder.id
                      ? "bg-linear-to-r from-purple-600 to-blue-600 text-white"
                      : "bg-blue-900/50 text-blue-200/70 hover:bg-blue-800/50"
                  }`}
                >
                  <DynamicIcon name={folder.icon} className="w-3 h-3" />
                  {folder.name}
                </button>
              ))}
            </DraggableScroll>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
          {loading ? (
            <p className="text-sm text-blue-300/50 text-center py-8">
              Loading notes...
            </p>
          ) : filteredNotes.length === 0 ? (
            <p className="text-sm text-blue-300/50 text-center py-8">
              {notes.length === 0
                ? "Your notes library is empty. Add notes from the Library page first."
                : "No notes match your search."}
            </p>
          ) : (
            filteredNotes.map((note) => {
              const isSelected = selectedIds.has(note.id);
              return (
                <button
                  key={note.id}
                  onClick={() => toggleSelect(note.id)}
                  className={`w-full text-left p-2.5 rounded-lg border transition-all flex items-center gap-3 ${
                    isSelected
                      ? "border-purple-500/50 bg-purple-500/10"
                      : "border-blue-800/20 hover:border-blue-600/40 hover:bg-blue-500/5"
                  }`}
                >
                  <div
                    className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center ${
                      isSelected
                        ? "bg-purple-600 border-purple-500"
                        : "border-blue-600/50"
                    }`}
                  >
                    {isSelected && (
                      <DynamicIcon name="Check" className="w-3 h-3 text-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate flex items-center gap-1.5">
                      {note.pinned && (
                        <DynamicIcon
                          name="Pin"
                          className="w-3 h-3 text-yellow-400 shrink-0"
                        />
                      )}
                      {note.title}
                    </p>
                    {note.tags.length > 0 && (
                      <p className="text-xs text-blue-300/40 truncate">
                        {note.tags.join(", ")}
                      </p>
                    )}
                  </div>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-300/70 shrink-0">
                    {noteTypeLabel(note.type)}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-blue-800/40">
          <span className="text-xs text-blue-300/50">
            {selectedIds.size} selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-blue-300 hover:bg-blue-800/40 rounded-lg transition-colors"
            >
              Cancel
            </button>
            {onSkip && (
              <button
                onClick={onSkip}
                className="px-4 py-2 text-sm text-blue-200 bg-blue-900/50 hover:bg-blue-800/50 rounded-lg transition-colors"
              >
                {skipLabel}
              </button>
            )}
            <button
              onClick={handleConfirm}
              disabled={selectedIds.size === 0}
              className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 disabled:bg-blue-800/40 disabled:text-blue-400/50 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <DynamicIcon name="Import" className="w-4 h-4" />
              {confirmLabel || "Attach Selected"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
