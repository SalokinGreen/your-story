"use client";

import { useEffect, useMemo, useState } from "react";
import { DynamicIcon } from "./DynamicIcon";
import FullScreenView from "./FullScreenView";
import { DraggableScroll } from "./DraggableScroll";
import { LoreType } from "@/app/misc/structs";
import {
  LibraryNote,
  listLibraryNotes,
} from "@/app/misc/localNotesLibraryManager";
import { LocalFolder, listLocalFolders } from "@/app/misc/localFolderManager";
import {
  BUILTIN_SYSTEMS,
  builtinPackToLibraryNotes,
} from "@/app/misc/systems";

/** The built-in packs, listed as virtual folders (one per pack), in memory only. */
const BUILTIN_PACKS = BUILTIN_SYSTEMS.flatMap((system) =>
  system.packs.map((pack) => ({
    folderId: `builtin:${pack.id}`,
    title: pack.title,
    notes: builtinPackToLibraryNotes(pack),
  })),
);

const NOTE_TYPE_OPTIONS: { value: LoreType; label: string }[] = [
  { value: "lore", label: "📜 Lore" },
  { value: "secret", label: "🔒 Secret" },
  { value: "mechanics", label: "⚙️ Mechanics" },
  { value: "character_sheet", label: "🧙 Character Sheet" },
  { value: "dm_instructions", label: "📌 GM Instructions" },
  { value: "story_instructions", label: "📌 Story Instructions" },
  { value: "summary_instructions", label: "📌 Summary Instructions" },
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
        setNotes(await listLibraryNotes());
        setFolders(listLocalFolders());
      } catch (e) {
        console.error("Error loading notes library:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen]);

  const builtinPack = BUILTIN_PACKS.find((p) => p.folderId === selectedFolder);

  const filteredNotes = useMemo(() => {
    // A built-in pack is its own virtual folder; the user's folders and "All"
    // never list built-in notes.
    const source =
      BUILTIN_PACKS.find((p) => p.folderId === selectedFolder)?.notes ?? notes;
    return source
      .filter((n) => {
        if (filterType && n.type !== filterType) return false;
        if (n.builtIn) {
          // already narrowed to the pack above
        } else if (selectedFolder === "uncategorized") {
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

  const allNotesSelected =
    filteredNotes.length > 0 &&
    filteredNotes.every((n) => selectedIds.has(n.id));

  const toggleSelectAllNotes = () => {
    setSelectedIds(
      allNotesSelected ? new Set() : new Set(filteredNotes.map((n) => n.id)),
    );
  };

  const totalSelected = selectedIds.size;

  // Cheap, so not memoised: a built-in pack's notes, else the user's folder's.
  const folderNotes: LibraryNote[] =
    selectedFolder === null
      ? []
      : (builtinPack?.notes ?? notes).filter((n) => {
          if (filterType && n.type !== filterType) return false;
          if (builtinPack) return true;
          return selectedFolder === "uncategorized"
            ? !n.folderId
            : n.folderId === selectedFolder;
        });

  const folderLabel =
    selectedFolder === "uncategorized"
      ? "Uncategorized"
      : builtinPack
        ? builtinPack.title
        : folders.find((f) => f.id === selectedFolder)?.name || "";

  const folderAllSelected =
    folderNotes.length > 0 && folderNotes.every((n) => selectedIds.has(n.id));

  const toggleSelectFolder = () => {
    if (folderAllSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        folderNotes.forEach((n) => next.delete(n.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => new Set([...prev, ...folderNotes.map((n) => n.id)]));
    }
  };

  const handleConfirm = () => {
    // Built-in notes are picked by id from their packs, not from the stored list.
    const picked = [...notes, ...BUILTIN_PACKS.flatMap((p) => p.notes)].filter(
      (n) => selectedIds.has(n.id),
    );
    onImport(picked);
  };

  if (!isOpen) return null;

  return (
    <FullScreenView
      title={title}
      subtitle={description}
      icon="Library"
      onClose={onClose}
      className="z-60"
      bodyClassName="p-0"
      footer={
        <div className="flex items-center justify-between p-4">
          <span className="text-xs text-ys-muted">
            {totalSelected} selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-ys-muted hover:bg-ys-surface-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
            {onSkip && (
              <button
                onClick={onSkip}
                className="px-4 py-2 text-sm text-ys-muted bg-ys-surface-2 hover:bg-ys-border border border-ys-border rounded-lg transition-colors"
              >
                {skipLabel}
              </button>
            )}
            <button
              onClick={handleConfirm}
              disabled={totalSelected === 0}
              className="px-4 py-2 text-sm disabled:opacity-40 rounded-lg shadow-md transition-all flex items-center gap-2 bg-ys-accent text-ys-on-accent hover:opacity-90"
            >
              <DynamicIcon name="Import" className="w-4 h-4" />
              {confirmLabel || "Attach Selected"}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col h-full">
        {/* Filters */}
        <div className="p-4 space-y-3 border-b border-ys-border shrink-0">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes or tags..." 
              className="w-full px-3 py-2 pl-9 bg-ys-surface border border-ys-border rounded-lg text-ys-text text-sm placeholder:text-ys-muted focus:outline-none focus:ring-2 focus:ring-ys-accent"
            />
            <DynamicIcon
              name="Search"
              className="absolute left-2.5 top-2.5 w-4 h-4 text-ys-muted"
            />
          </div>

          {!filterType &&
            (folders.length > 0 ||
              BUILTIN_PACKS.length > 0 ||
              notes.some((n) => n.folderId) ||
              false) && (
              <DraggableScroll className="pb-1" innerClassName="gap-2">
                <button
                  onClick={() => setSelectedFolder(null)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                    selectedFolder === null
                      ? "bg-ys-accent text-ys-on-accent hover:opacity-90"
                      : "bg-ys-surface text-ys-muted hover:bg-ys-surface-2"
                  }`}
                >
                  All
                </button>
                {BUILTIN_PACKS.map((pack) => (
                  <button
                    key={pack.folderId}
                    onClick={() => setSelectedFolder(pack.folderId)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                      selectedFolder === pack.folderId
                        ? "bg-ys-accent text-ys-on-accent hover:opacity-90"
                        : "bg-ys-surface text-ys-warning hover:bg-ys-surface-2"
                    }`}
                  >
                    <DynamicIcon name="Package" className="w-3 h-3" />
                    Built-in: {pack.title}
                  </button>
                ))}
                <button
                  onClick={() => setSelectedFolder("uncategorized")}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                    selectedFolder === "uncategorized"
                      ? "bg-ys-accent text-ys-on-accent hover:opacity-90"
                      : "bg-ys-surface text-ys-muted hover:bg-ys-surface-2"
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
                        ? "bg-ys-accent text-ys-on-accent hover:opacity-90"
                        : "bg-ys-surface text-ys-muted hover:bg-ys-surface-2"
                    }`}
                  >
                    <DynamicIcon name={folder.icon} className="w-3 h-3" />
                    {folder.name}
                  </button>
                ))}
              </DraggableScroll>
            )}

          {selectedFolder !== null &&
            folderNotes.length > 0 && (
              <button
                onClick={toggleSelectFolder}
                className={`w-full px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 border ${
                  folderAllSelected
                    ? "bg-ys-accent/10 border-ys-accent text-ys-accent"
                    : "bg-ys-surface border-ys-border text-ys-muted hover:bg-ys-surface-2"
                }`}
              >
                <DynamicIcon
                  name={folderAllSelected ? "SquareCheck" : "FolderOpen"}
                  className="w-3.5 h-3.5"
                />
                {folderAllSelected
                  ? `Deselect All from "${folderLabel}"`
                  : builtinPack
                    ? `Select whole pack (${folderNotes.length} note${folderNotes.length === 1 ? "" : "s"})`
                    : `Select All from "${folderLabel}" (${folderNotes.length} note${folderNotes.length === 1 ? "" : "s"})`}
              </button>
            )}
        </div>

            {/* Select all bar */}
            {filteredNotes.length > 0 && multiSelect && (
              <div className="px-4 pt-3 flex items-center justify-between">
                <button
                  onClick={toggleSelectAllNotes}
                  className="text-xs font-medium text-ys-accent hover:text-ys-accent flex items-center gap-1.5"
                >
                  <DynamicIcon
                    name={allNotesSelected ? "SquareCheck" : "CheckSquare"}
                    className="w-3.5 h-3.5"
                  />
                  {allNotesSelected
                    ? "Deselect All"
                    : `Select All (${filteredNotes.length})`}
                </button>
              </div>
            )}

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
              {loading ? (
                <p className="text-sm text-ys-muted text-center py-8">
                  Loading notes...
                </p>
              ) : filteredNotes.length === 0 ? (
                <p className="text-sm text-ys-muted text-center py-8">
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
                          ? "border-ys-accent bg-ys-accent/10"
                          : "border-ys-border hover:border-ys-accent hover:bg-ys-surface-2"
                      }`}
                    >
                      <div
                        className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center ${
                          isSelected
                            ? "bg-ys-accent border-ys-accent"
                            : "border-ys-border"
                        }`}
                      >
                        {isSelected && (
                          <DynamicIcon
                            name="Check"
                            className="w-3 h-3 text-ys-on-accent"
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ys-text truncate flex items-center gap-1.5">
                          {note.pinned && (
                            <DynamicIcon
                              name="Pin"
                              className="w-3 h-3 text-ys-warning shrink-0"
                            />
                          )}
                          {note.title}
                        </p>
                        {note.tags.length > 0 && (
                          <p className="text-xs text-ys-muted truncate">
                            {note.tags.join(", ")}
                          </p>
                        )}
                      </div>
                      <span className="text-xs px-1.5 py-0.5 rounded-md bg-ys-surface text-ys-muted shrink-0">
                        {noteTypeLabel(note.type)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
      </div>
    </FullScreenView>
  );
}
