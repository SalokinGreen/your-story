"use client";

import { useEffect, useMemo, useState } from "react";
import { DynamicIcon } from "./DynamicIcon";
import { DraggableScroll } from "./DraggableScroll";
import { LoreType } from "@/app/misc/structs";
import {
  LibraryNote,
  listLibraryNotes,
} from "@/app/misc/localNotesLibraryManager";
import {
  LibraryTable,
  listLibraryTables,
} from "@/app/misc/localTablesLibraryManager";
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
  onImport: (notes: LibraryNote[], tables: LibraryTable[]) => void;
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
  /** Also let the user browse and bring in saved random/loot tables alongside notes. */
  includeTables?: boolean;
}

type PickerTab = "notes" | "tables";

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
  includeTables = false,
}: LibraryPickerModalProps) {
  const [notes, setNotes] = useState<LibraryNote[]>([]);
  const [tables, setTables] = useState<LibraryTable[]>([]);
  const [folders, setFolders] = useState<LocalFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedTableIds, setSelectedTableIds] = useState<Set<string>>(
    new Set(),
  );
  const [tab, setTab] = useState<PickerTab>("notes");

  useEffect(() => {
    if (!isOpen) return;
    setSelectedIds(new Set());
    setSelectedTableIds(new Set());
    setSearch("");
    setSelectedFolder(null);
    setTab("notes");
    setLoading(true);
    (async () => {
      try {
        const [notesList, tablesList] = await Promise.all([
          listLibraryNotes(),
          includeTables ? listLibraryTables() : Promise.resolve([]),
        ]);
        setNotes(notesList);
        setTables(tablesList);
        setFolders(listLocalFolders());
      } catch (e) {
        console.error("Error loading notes library:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen, includeTables]);

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

  const filteredTables = useMemo(() => {
    return tables
      .filter((t) => {
        if (selectedFolder === "uncategorized") {
          if (t.folderId) return false;
        } else if (selectedFolder && t.folderId !== selectedFolder) {
          return false;
        }
        if (
          search &&
          !t.name.toLowerCase().includes(search.toLowerCase()) &&
          !t.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase()))
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
  }, [tables, selectedFolder, search]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (!multiSelect) return prev.has(id) ? new Set() : new Set([id]);
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectTable = (id: string) => {
    setSelectedTableIds((prev) => {
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
  const allTablesSelected =
    filteredTables.length > 0 &&
    filteredTables.every((t) => selectedTableIds.has(t.id));

  const toggleSelectAllNotes = () => {
    setSelectedIds(
      allNotesSelected ? new Set() : new Set(filteredNotes.map((n) => n.id)),
    );
  };

  const toggleSelectAllTables = () => {
    setSelectedTableIds(
      allTablesSelected
        ? new Set()
        : new Set(filteredTables.map((t) => t.id)),
    );
  };

  const totalSelected = selectedIds.size + selectedTableIds.size;

  const folderNotes = useMemo(() => {
    if (selectedFolder === null) return [];
    return notes.filter((n) => {
      if (filterType && n.type !== filterType) return false;
      return selectedFolder === "uncategorized"
        ? !n.folderId
        : n.folderId === selectedFolder;
    });
  }, [notes, filterType, selectedFolder]);

  const folderTables = useMemo(() => {
    if (selectedFolder === null) return [];
    return tables.filter((t) =>
      selectedFolder === "uncategorized"
        ? !t.folderId
        : t.folderId === selectedFolder,
    );
  }, [tables, selectedFolder]);

  const folderLabel =
    selectedFolder === "uncategorized"
      ? "Uncategorized"
      : folders.find((f) => f.id === selectedFolder)?.name || "";

  const folderAllSelected =
    (folderNotes.length > 0 || folderTables.length > 0) &&
    folderNotes.every((n) => selectedIds.has(n.id)) &&
    folderTables.every((t) => selectedTableIds.has(t.id));

  const toggleSelectFolder = () => {
    if (folderAllSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        folderNotes.forEach((n) => next.delete(n.id));
        return next;
      });
      setSelectedTableIds((prev) => {
        const next = new Set(prev);
        folderTables.forEach((t) => next.delete(t.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => new Set([...prev, ...folderNotes.map((n) => n.id)]));
      setSelectedTableIds(
        (prev) => new Set([...prev, ...folderTables.map((t) => t.id)]),
      );
    }
  };

  const handleConfirm = () => {
    onImport(
      notes.filter((n) => selectedIds.has(n.id)),
      tables.filter((t) => selectedTableIds.has(t.id)),
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0d1829]/95 backdrop-blur-2xl rounded-2xl border border-white/10 w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl shadow-black/50">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 border-b border-white/10">
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
            className="p-1 hover:bg-white/10 rounded-lg transition-colors shrink-0"
          >
            <DynamicIcon name="X" className="w-5 h-5 text-blue-300" />
          </button>
        </div>

        {includeTables && (
          <div className="flex border-b border-white/10">
            <button
              onClick={() => setTab("notes")}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                tab === "notes"
                  ? "text-white border-b-2 border-purple-500 bg-purple-500/5"
                  : "text-blue-300/60 hover:text-blue-200"
              }`}
            >
              <DynamicIcon name="NotebookText" className="w-4 h-4" />
              Notes
              {selectedIds.size > 0 && ` (${selectedIds.size})`}
            </button>
            <button
              onClick={() => setTab("tables")}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                tab === "tables"
                  ? "text-white border-b-2 border-purple-500 bg-purple-500/5"
                  : "text-blue-300/60 hover:text-blue-200"
              }`}
            >
              <DynamicIcon name="Dices" className="w-4 h-4" />
              Tables
              {selectedTableIds.size > 0 && ` (${selectedTableIds.size})`}
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="p-4 space-y-3 border-b border-white/10">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                tab === "tables"
                  ? "Search tables or tags..."
                  : "Search notes or tags..."
              }
              className="w-full px-3 py-2 pl-9 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
            <DynamicIcon
              name="Search"
              className="absolute left-2.5 top-2.5 w-4 h-4 text-blue-300/50"
            />
          </div>

          {!filterType &&
            (folders.length > 0 ||
              notes.some((n) => n.folderId) ||
              tables.some((t) => t.folderId)) && (
              <DraggableScroll className="pb-1" innerClassName="gap-2">
                <button
                  onClick={() => setSelectedFolder(null)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                    selectedFolder === null
                      ? "bg-linear-to-r from-purple-600 to-blue-600 text-white"
                      : "bg-white/5 text-blue-200/70 hover:bg-white/10"
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setSelectedFolder("uncategorized")}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                    selectedFolder === "uncategorized"
                      ? "bg-linear-to-r from-purple-600 to-blue-600 text-white"
                      : "bg-white/5 text-blue-200/70 hover:bg-white/10"
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
                        : "bg-white/5 text-blue-200/70 hover:bg-white/10"
                    }`}
                  >
                    <DynamicIcon name={folder.icon} className="w-3 h-3" />
                    {folder.name}
                  </button>
                ))}
              </DraggableScroll>
            )}

          {selectedFolder !== null &&
            (folderNotes.length > 0 || folderTables.length > 0) && (
              <button
                onClick={toggleSelectFolder}
                className={`w-full px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 border ${
                  folderAllSelected
                    ? "bg-purple-500/10 border-purple-500/50 text-purple-200"
                    : "bg-white/5 border-white/10 text-blue-200/70 hover:bg-white/10"
                }`}
              >
                <DynamicIcon
                  name={folderAllSelected ? "SquareCheck" : "FolderOpen"}
                  className="w-3.5 h-3.5"
                />
                {folderAllSelected
                  ? `Deselect All from "${folderLabel}"`
                  : `Select All from "${folderLabel}" (${folderNotes.length} note${folderNotes.length === 1 ? "" : "s"}${folderTables.length > 0 ? `, ${folderTables.length} table${folderTables.length === 1 ? "" : "s"}` : ""})`}
              </button>
            )}
        </div>

        {tab === "notes" ? (
          <>
            {/* Select all bar */}
            {filteredNotes.length > 0 && multiSelect && (
              <div className="px-4 pt-3 flex items-center justify-between">
                <button
                  onClick={toggleSelectAllNotes}
                  className="text-xs font-medium text-purple-300 hover:text-purple-200 flex items-center gap-1.5"
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
                          : "border-white/10 hover:border-purple-400/30 hover:bg-white/5"
                      }`}
                    >
                      <div
                        className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center ${
                          isSelected
                            ? "bg-purple-600 border-purple-500"
                            : "border-white/20"
                        }`}
                      >
                        {isSelected && (
                          <DynamicIcon
                            name="Check"
                            className="w-3 h-3 text-white"
                          />
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
                      <span className="text-xs px-1.5 py-0.5 rounded-md bg-white/5 text-blue-300/70 shrink-0">
                        {noteTypeLabel(note.type)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <>
            {/* Select all bar */}
            {filteredTables.length > 0 && multiSelect && (
              <div className="px-4 pt-3 flex items-center justify-between">
                <button
                  onClick={toggleSelectAllTables}
                  className="text-xs font-medium text-purple-300 hover:text-purple-200 flex items-center gap-1.5"
                >
                  <DynamicIcon
                    name={allTablesSelected ? "SquareCheck" : "CheckSquare"}
                    className="w-3.5 h-3.5"
                  />
                  {allTablesSelected
                    ? "Deselect All"
                    : `Select All (${filteredTables.length})`}
                </button>
              </div>
            )}

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
              {loading ? (
                <p className="text-sm text-blue-300/50 text-center py-8">
                  Loading tables...
                </p>
              ) : filteredTables.length === 0 ? (
                <p className="text-sm text-blue-300/50 text-center py-8">
                  {tables.length === 0
                    ? "Your tables library is empty. Import a PDF with tables to build it."
                    : "No tables match your search."}
                </p>
              ) : (
                filteredTables.map((tbl) => {
                  const isSelected = selectedTableIds.has(tbl.id);
                  return (
                    <button
                      key={tbl.id}
                      onClick={() => toggleSelectTable(tbl.id)}
                      className={`w-full text-left p-2.5 rounded-lg border transition-all flex items-center gap-3 ${
                        isSelected
                          ? "border-purple-500/50 bg-purple-500/10"
                          : "border-white/10 hover:border-purple-400/30 hover:bg-white/5"
                      }`}
                    >
                      <div
                        className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center ${
                          isSelected
                            ? "bg-purple-600 border-purple-500"
                            : "border-white/20"
                        }`}
                      >
                        {isSelected && (
                          <DynamicIcon
                            name="Check"
                            className="w-3 h-3 text-white"
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate flex items-center gap-1.5">
                          {tbl.pinned && (
                            <DynamicIcon
                              name="Pin"
                              className="w-3 h-3 text-yellow-400 shrink-0"
                            />
                          )}
                          {tbl.name}
                        </p>
                        {tbl.description && (
                          <p className="text-xs text-blue-300/40 truncate">
                            {tbl.description}
                          </p>
                        )}
                      </div>
                      <span className="text-xs px-1.5 py-0.5 rounded-md bg-white/5 text-blue-300/70 shrink-0">
                        {tbl.entries.length} entries
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-white/10">
          <span className="text-xs text-blue-300/50">
            {totalSelected} selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-blue-300 hover:bg-white/10 rounded-lg transition-colors"
            >
              Cancel
            </button>
            {onSkip && (
              <button
                onClick={onSkip}
                className="px-4 py-2 text-sm text-blue-200 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors"
              >
                {skipLabel}
              </button>
            )}
            <button
              onClick={handleConfirm}
              disabled={totalSelected === 0}
              className="px-4 py-2 text-sm bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-40 disabled:from-white/10 disabled:to-white/10 text-white rounded-lg shadow-md shadow-purple-950/40 transition-all flex items-center gap-2"
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
