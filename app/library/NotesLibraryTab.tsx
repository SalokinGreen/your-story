"use client";

import { useEffect, useRef, useState } from "react";
import { useNotification } from "@/app/misc/NotificationContext";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import { DynamicIcon } from "@/app/components/DynamicIcon";
import FullScreenView from "@/app/components/FullScreenView";
import NewFolderDialog from "@/app/components/NewFolderDialog";
import { DraggableScroll } from "../components/DraggableScroll";
import { LibrarySkeleton } from "@/app/components/Skeleton";
import PDFImporter from "@/app/components/PDFImporter";
import { LoreType, StoryLore } from "@/app/misc/structs";
import {
  listLibraryNotes,
  createLibraryNote,
  updateLibraryNote,
  deleteLibraryNote,
  bulkDeleteLibraryNotes,
  bulkMoveLibraryNotes,
  LibraryNote,
} from "@/app/misc/localNotesLibraryManager";
import { migrateTablesLibraryToNotes } from "@/app/misc/tablesLibraryMigration";
import { customTableToNote } from "@/app/misc/tableNotes";
import { createLocalFolder, LocalFolder } from "@/app/misc/localFolderManager";
import {
  downloadLibraryNotes,
  readLibraryNotesFile,
} from "@/app/misc/notesLibraryExport";
import { readLibraryTablesFile } from "@/app/misc/tablesLibraryExport";
import { getRelativeTime } from "@/app/misc/relativeTime";
import {
  ALL_SCOPE,
  LibraryScope,
  scopeFolderId,
  scopeKey,
  scopeMatches,
} from "./libraryScope";

const NOTE_TYPE_OPTIONS: { value: LoreType; label: string }[] = [
  { value: "lore", label: "📜 Lore" },
  { value: "secret", label: "🔒 Secret" },
  { value: "table", label: "🎲 Table" },
  { value: "mechanics", label: "⚙️ Mechanics" },
  { value: "character_sheet", label: "🧙 Character Sheet" },
  { value: "dm_instructions", label: "📌 GM Instructions" },
  { value: "story_instructions", label: "📌 Story Instructions" },
];

function noteTypeLabel(type?: LoreType): string {
  return NOTE_TYPE_OPTIONS.find((o) => o.value === type)?.label || "📜 Lore";
}

/** How many note cards to add each time the list is expanded. */
const PAGE_SIZE = 60;

/** Note counts the home screen needs to label folders without re-reading IDB. */
export interface NoteCounts {
  total: number;
  byFolder: Record<string, number>;
  unfiled: number;
}

export function countNotesByFolder(notes: LibraryNote[]): NoteCounts {
  const byFolder: Record<string, number> = {};
  let unfiled = 0;
  for (const note of notes) {
    if (note.folderId) {
      byFolder[note.folderId] = (byFolder[note.folderId] || 0) + 1;
    } else {
      unfiled++;
    }
  }
  return { total: notes.length, byFolder, unfiled };
}

interface NotesLibraryTabProps {
  onCountsChange?: (counts: NoteCounts) => void;
  // Folders are shared with the Stories/Adventures tabs (localFolderManager),
  // so state is lifted to the parent page and kept in sync across tabs.
  folders: LocalFolder[];
  setFolders: React.Dispatch<React.SetStateAction<LocalFolder[]>>;
  // Folder export modal also lives on the parent page (it needs to reach
  // across stories/notes/tables), so opening it is just a callback.
  onExportFolder: (folder: LocalFolder) => void;
  scope?: LibraryScope;
}

export default function NotesLibraryTab({
  onCountsChange,
  folders,
  setFolders,
  onExportFolder,
  scope = ALL_SCOPE,
}: NotesLibraryTabProps) {
  const { addNotification } = useNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [notes, setNotes] = useState<LibraryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  // Only used by the flat view; a folder view pins the filter to its folder.
  const [chipFolder, setChipFolder] = useState<LibraryScope>(scope);
  const activeScope = scope.kind === "all" ? chipFolder : scope;
  // A library can run to thousands of notes (PDF imports produce hundreds at
  // a time), and rendering every card at once is what made this list crawl.
  // Cards are revealed a page at a time instead.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());
  const [showMassMoveDropdown, setShowMassMoveDropdown] = useState(false);

  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [movingNote, setMovingNote] = useState<string | null>(null);

  // OCR/PDF import: ask which folder to save results into before the
  // PDFImporter modal (and its OCR pipeline) opens.
  const [showOcrFolderPrompt, setShowOcrFolderPrompt] = useState(false);
  const [ocrTargetFolder, setOcrTargetFolder] = useState<string | undefined>(
    undefined,
  );
  const [ocrImporterOpen, setOcrImporterOpen] = useState(false);
  const [ocrImporterKey, setOcrImporterKey] = useState(0);

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState<Partial<LibraryNote>>({});
  const [savingNote, setSavingNote] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    icon?: string;
    confirmText?: string;
    cancelText?: string;
    confirmButtonClass?: string;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    onCountsChange?.(countNotesByFolder(notes));
  }, [notes, onCountsChange]);

  const propScopeKey = scopeKey(scope);
  useEffect(() => {
    setChipFolder(scope);
    // Keyed on the scope's identity rather than the object itself - scopes are
    // literals, so a parent re-render would otherwise look like a scope change
    // and wipe the chip selection out from under the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propScopeKey]);

  // Narrowing the list should start it from the top again, not leave the user
  // scrolled past a page boundary of a list they no longer see.
  const activeScopeKey = scopeKey(activeScope);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, activeScopeKey]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showMassMoveDropdown) {
        const target = event.target as HTMLElement;
        if (!target.closest(".relative")) {
          setShowMassMoveDropdown(false);
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMassMoveDropdown]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Random tables live in the notes library now, as `type: "table"`
      // notes. Anything still sitting in the old tables store is moved over
      // before the list is read, so the migration is invisible to the user -
      // they just find their tables among their notes.
      const migrated = await migrateTablesLibraryToNotes();
      const notesList = await listLibraryNotes();
      setNotes(notesList);
      if (migrated > 0) {
        addNotification(
          `Moved ${migrated} table${migrated === 1 ? "" : "s"} into your notes`,
          "success",
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Error loading notes library:", error);
      addNotification(`Failed to load notes library: ${message}`, "failure");
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // Note CRUD
  // ============================================

  const openNewNote = () => {
    setEditingNoteId("new");
    setEditNote({
      title: "",
      content: "",
      type: "lore",
      tags: [],
      relatedCharacters: [],
      relatedLocations: [],
      keys: [],
      source: "manual",
      // A note written while looking at a folder belongs in that folder.
      folderId: scopeFolderId(activeScope) || undefined,
    });
  };

  const openEditNote = (note: LibraryNote) => {
    setEditingNoteId(note.id);
    setEditNote({ ...note });
  };

  const closeNoteEditor = () => {
    setEditingNoteId(null);
    setEditNote({});
  };

  const handleSaveNote = async () => {
    if (!editNote.title?.trim()) {
      addNotification("Please enter a title", "warning");
      return;
    }

    setSavingNote(true);
    try {
      if (editingNoteId === "new") {
        const created = await createLibraryNote({
          title: editNote.title.trim(),
          content: editNote.content || "",
          type: editNote.type || "lore",
          tags: editNote.tags || [],
          folderId: editNote.folderId,
          pinned: editNote.pinned || false,
          source: "manual",
          relatedCharacters: editNote.relatedCharacters || [],
          relatedLocations: editNote.relatedLocations || [],
          keys: editNote.keys || [],
        });
        setNotes((prev) => [created, ...prev]);
        addNotification("Note created", "success");
      } else if (editingNoteId) {
        const updated = await updateLibraryNote(editingNoteId, {
          title: editNote.title.trim(),
          content: editNote.content || "",
          type: editNote.type || "lore",
          tags: editNote.tags || [],
          folderId: editNote.folderId,
          pinned: editNote.pinned || false,
        });
        if (updated) {
          setNotes((prev) =>
            prev.map((n) => (n.id === updated.id ? updated : n)),
          );
        }
        addNotification("Note updated", "success");
      }
      closeNoteEditor();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Error saving note:", error);
      addNotification(`Failed to save note: ${message}`, "failure");
    } finally {
      setSavingNote(false);
    }
  };

  const handleTogglePin = async (note: LibraryNote) => {
    try {
      const updated = await updateLibraryNote(note.id, {
        pinned: !note.pinned,
      });
      if (updated) {
        setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addNotification(`Failed to update note: ${message}`, "failure");
    }
  };

  const handleDeleteNote = (noteId: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "Delete Note?",
      message: "Are you sure you want to delete this note? This action cannot be undone.",
      icon: "Trash2",
      confirmText: "Delete Note",
      confirmButtonClass: "bg-red-600 hover:bg-red-700",
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        try {
          setDeleting(noteId);
          await deleteLibraryNote(noteId);
          setNotes((prev) => prev.filter((n) => n.id !== noteId));
          addNotification("Note deleted", "success");
        } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
          addNotification(`Failed to delete: ${message}`, "failure");
        } finally {
          setDeleting(null);
        }
      },
    });
  };

  const handleMoveNote = async (noteId: string, folderId: string | null) => {
    try {
      const updated = await updateLibraryNote(noteId, {
        folderId: folderId || undefined,
      });
      if (updated) {
        setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      }
      setMovingNote(null);
      addNotification("Note moved", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addNotification(`Failed to move note: ${message}`, "failure");
    }
  };

  // ============================================
  // Selection / bulk actions
  // ============================================

  const toggleSelectionMode = () => {
    setSelectionMode(!selectionMode);
    setSelectedNotes(new Set());
  };

  const toggleNoteSelection = (noteId: string) => {
    const next = new Set(selectedNotes);
    if (next.has(noteId)) {
      next.delete(noteId);
    } else {
      next.add(noteId);
    }
    setSelectedNotes(next);
  };

  const selectAllNotes = () => {
    if (!selectionMode) setSelectionMode(true);
    setSelectedNotes(new Set(filteredNotes.map((n) => n.id)));
  };

  const deselectAllNotes = () => setSelectedNotes(new Set());

  const handleMassDelete = () => {
    if (selectedNotes.size === 0) return;
    const ids = Array.from(selectedNotes);

    setConfirmDialog({
      isOpen: true,
      title: "Delete Multiple Notes?",
      message: `Are you sure you want to delete ${ids.length} note${ids.length === 1 ? "" : "s"}? This action cannot be undone.`,
      icon: "Trash2",
      confirmText: `Delete ${ids.length} Note${ids.length === 1 ? "" : "s"}`,
      confirmButtonClass: "bg-red-600 hover:bg-red-700",
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        try {
          await bulkDeleteLibraryNotes(ids);
          const idSet = new Set(ids);
          setNotes((prev) => prev.filter((n) => !idSet.has(n.id)));
          setSelectedNotes(new Set());
          setSelectionMode(false);
          addNotification(`${ids.length} note${ids.length === 1 ? "" : "s"} deleted`, "success");
        } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
          addNotification(`Failed to delete notes: ${message}`, "failure");
        }
      },
    });
  };

  const handleMassMove = async (folderId: string | null) => {
    if (selectedNotes.size === 0) return;
    const ids = Array.from(selectedNotes);
    try {
      await bulkMoveLibraryNotes(ids, folderId || undefined);
      const idSet = new Set(ids);
      setNotes((prev) =>
        prev.map((n) =>
          idSet.has(n.id) ? { ...n, folderId: folderId || undefined } : n,
        ),
      );
      setSelectedNotes(new Set());
      setSelectionMode(false);
      const folderName = folderId
        ? folders.find((f) => f.id === folderId)?.name || "folder"
        : "Uncategorized";
      addNotification(`${ids.length} note${ids.length === 1 ? "" : "s"} moved to ${folderName}`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addNotification(`Failed to move notes: ${message}`, "failure");
    }
  };

  // ============================================
  // Folder management (shared LocalFolder store)
  // ============================================

  const handleCreateFolder = (name: string, icon: string, color: string) => {
    try {
      const folder = createLocalFolder(name, icon, color);
      setFolders((prev) => [...prev, folder]);
      setShowNewFolderDialog(false);
      addNotification("Folder created successfully", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addNotification(`Failed to create folder: ${message}`, "failure");
    }
  };

  // ============================================
  // Import / Export
  // ============================================

  const handleImportFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    // A previously exported .tables file still imports - its tables just
    // become table notes on the way in, the same as everywhere else.
    if (file.name.toLowerCase().endsWith(".tables")) {
      await importLegacyTablesFile(file);
      return;
    }

    const result = await readLibraryNotesFile(file);
    if (!result.success || !result.notes) {
      addNotification(result.error || "Failed to import notes", "failure");
      return;
    }

    try {
      const created = await Promise.all(
        result.notes.map((n) =>
          createLibraryNote({
            title: n.title,
            content: n.content,
            type: n.type,
            tags: n.tags,
            folderId: undefined,
            pinned: n.pinned,
            source: n.source,
            sourceFile: n.sourceFile,
            relatedCharacters: n.relatedCharacters,
            relatedLocations: n.relatedLocations,
            keys: n.keys,
          }),
        ),
      );
      setNotes((prev) => [...created, ...prev]);
      addNotification(
        `Imported ${created.length} note${created.length === 1 ? "" : "s"}${
          result.warnings.length > 0 ? ` (${result.warnings.length} warning${result.warnings.length === 1 ? "" : "s"})` : ""
        }`,
        "success",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addNotification(`Failed to import notes: ${message}`, "failure");
    }
  };

  const handleExport = () => {
    const toExport =
      selectedNotes.size > 0
        ? notes.filter((n) => selectedNotes.has(n.id))
        : filteredNotes;
    if (toExport.length === 0) {
      addNotification("No notes to export", "warning");
      return;
    }
    downloadLibraryNotes(toExport);
    addNotification(
      `Exported ${toExport.length} note${toExport.length === 1 ? "" : "s"}`,
      "success",
    );
  };

  const handlePDFImportComplete = async (
    data: {
      lore: StoryLore[];
      mechanicNotes: StoryLore[];
      tableNotes: StoryLore[];
      summary: string;
    },
    targetFolder?: string,
  ) => {
    const allNotes = [...data.lore, ...data.mechanicNotes];
    if (allNotes.length === 0 && data.tableNotes.length === 0) return;

    try {
      // Tables come out of the extractor as notes like everything else, so
      // the whole import is one list saved one way.
      const createdNotes = await Promise.all(
        [...allNotes, ...data.tableNotes].map((note) =>
          createLibraryNote({
            title: note.title,
            content: note.content,
            type: note.type || "lore",
            tags: note.tags || [],
            folderId: targetFolder,
            pinned: false,
            source: "ocr",
            relatedCharacters: note.relatedCharacters || [],
            relatedLocations: note.relatedLocations || [],
            keys: note.keys || [],
          }),
        ),
      );
      setNotes((prev) => [...createdNotes, ...prev]);
      const parts = [
        allNotes.length > 0
          ? `${allNotes.length} note${allNotes.length === 1 ? "" : "s"}`
          : null,
        data.tableNotes.length > 0
          ? `${data.tableNotes.length} table${data.tableNotes.length === 1 ? "" : "s"}`
          : null,
      ].filter(Boolean);
      addNotification(
        `Saved ${parts.join(" and ")} from PDF to your library`,
        "success",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addNotification(`Failed to save OCR import: ${message}`, "failure");
    }
  };

  // ============================================
  // Filtering
  // ============================================

  const filteredNotes = notes
    .filter((note) => {
      if (!scopeMatches(activeScope, note.folderId)) return false;
      if (
        search &&
        !note.title.toLowerCase().includes(search.toLowerCase()) &&
        !note.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  /**
   * Reads a legacy .tables export and stores its tables as table notes.
   */
  const importLegacyTablesFile = async (file: File) => {
    const result = await readLibraryTablesFile(file);
    if (!result.success || !result.tables) {
      addNotification(result.error || "Failed to import tables", "failure");
      return;
    }

    try {
      const created = await Promise.all(
        result.tables.map((t) => {
          const note = customTableToNote({
            id: t.name,
            name: t.name,
            description: t.description,
            entries: t.entries,
          });
          return createLibraryNote({
            title: note.title,
            content: note.content,
            type: "table",
            tags: t.tags,
            folderId: undefined,
            pinned: t.pinned,
            source: t.source,
            sourceFile: t.sourceFile,
            relatedCharacters: [],
            relatedLocations: [],
            keys: note.keys || [],
          });
        }),
      );
      setNotes((prev) => [...created, ...prev]);
      addNotification(
        `Imported ${created.length} table${created.length === 1 ? "" : "s"} as notes`,
        "success",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addNotification(`Failed to import tables: ${message}`, "failure");
    }
  };

  const chipClass = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
      active
        ? "bg-linear-to-r from-purple-600 to-blue-600 text-white"
        : "bg-blue-900/50 text-blue-200/70 hover:bg-blue-800/50"
    }`;

  /**
   * Opens the OCR importer. Inside a folder there's nothing to ask - the
   * results belong in the folder you're standing in.
   */
  const startPdfImport = () => {
    if (scope.kind === "folder") {
      setOcrTargetFolder(scope.folderId);
      setOcrImporterKey((k) => k + 1);
      setOcrImporterOpen(true);
      return;
    }
    setShowOcrFolderPrompt(true);
  };

  if (loading && notes.length === 0) {
    return <LibrarySkeleton />;
  }

  const visibleNotes = filteredNotes.slice(0, visibleCount);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <DynamicIcon
            name="Search"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400/50"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes..."
            className="w-full pl-10 pr-4 py-2.5 bg-blue-900/50 border border-blue-700/50 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:border-purple-500/50 focus:bg-blue-900/70 transition-all"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={openNewNote}
            className="flex items-center gap-2 px-4 py-2.5 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-xl transition-colors text-sm font-medium"
          >
            <DynamicIcon name="Plus" className="w-4 h-4" />
            New Note
          </button>
          <button
            onClick={startPdfImport}
            className="flex items-center gap-2 px-4 py-2.5 bg-linear-to-r from-purple-900/30 to-blue-900/30 hover:from-purple-800/40 hover:to-blue-800/40 border border-purple-700/50 rounded-xl transition-colors text-sm font-medium"
          >
            <DynamicIcon name="FileUp" className="w-4 h-4" />
            Import from PDF
          </button>
          {ocrImporterOpen && (
            <PDFImporter
              key={ocrImporterKey}
              startOpen
              compact
              onImportComplete={(data) => {
                handlePDFImportComplete(data, ocrTargetFolder);
              }}
              onClose={() => setOcrImporterOpen(false)}
            />
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-900/50 hover:bg-blue-800/60 border border-blue-700/50 rounded-xl transition-colors text-sm font-medium"
          >
            <DynamicIcon name="Upload" className="w-4 h-4" />
            Import File
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".notes,.json"
            onChange={handleImportFileChange}
            className="hidden"
          />
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-900/50 hover:bg-blue-800/60 border border-blue-700/50 rounded-xl transition-colors text-sm font-medium"
          >
            <DynamicIcon name="Download" className="w-4 h-4" />
            Export
            {selectedNotes.size > 0 ? ` (${selectedNotes.size})` : ""}
          </button>
        </div>
      </div>

      {/* Folder Chips - flat view only; a folder view is already scoped */}
      {scope.kind === "all" && (
        <DraggableScroll className="pb-2" innerClassName="gap-2 px-1">
          <button
            onClick={() => setChipFolder({ kind: "all" })}
            className={chipClass(chipFolder.kind === "all")}
          >
            <DynamicIcon name="NotebookText" className="w-3.5 h-3.5" />
            All ({notes.length})
          </button>
          <button
            onClick={() => setChipFolder({ kind: "unfiled" })}
            className={chipClass(chipFolder.kind === "unfiled")}
          >
            <DynamicIcon name="FileText" className="w-3.5 h-3.5" />
            Uncategorized ({notes.filter((n) => !n.folderId).length})
          </button>
          {folders.map((folder) => (
            <div key={folder.id} className="relative group shrink-0">
              <button
                onClick={() =>
                  setChipFolder({ kind: "folder", folderId: folder.id })
                }
                className={chipClass(
                  chipFolder.kind === "folder" &&
                    chipFolder.folderId === folder.id,
                )}
                style={{ borderLeft: `3px solid ${folder.color}` }}
              >
                <DynamicIcon name={folder.icon} className="w-3.5 h-3.5" />
                {folder.name} (
                {notes.filter((n) => n.folderId === folder.id).length})
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onExportFolder(folder);
                }}
                title="Export folder"
                className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 p-0.5 rounded-full bg-blue-800 hover:bg-purple-600 border border-blue-950 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
              >
                <DynamicIcon name="Download" className="w-3 h-3" />
              </button>
            </div>
          ))}
          <button
            onClick={() => setShowNewFolderDialog(true)}
            className="px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap bg-blue-900/30 text-blue-300/70 hover:bg-blue-800/50 transition-all flex items-center gap-1.5 border border-dashed border-blue-700/50"
          >
            <DynamicIcon name="Plus" className="w-3.5 h-3.5" />
            New Folder
          </button>
        </DraggableScroll>
      )}

      {/* Select mode + selection bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1" />
        {filteredNotes.length > 0 && (
          <>
            <button
              onClick={toggleSelectionMode}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                selectionMode
                  ? "bg-purple-600 text-white"
                  : "bg-blue-900/30 text-blue-200/60 hover:bg-blue-800/40"
              }`}
            >
              <DynamicIcon
                name={selectionMode ? "Check" : "CheckSquare"}
                className="w-3.5 h-3.5"
              />
              {selectionMode ? "Done" : "Select"}
            </button>
            <button
              onClick={selectAllNotes}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-blue-900/30 text-blue-200/60 hover:bg-blue-800/40"
            >
              Select All
            </button>
          </>
        )}
      </div>

      {selectionMode && selectedNotes.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-purple-900/30 border border-purple-700/30 rounded-xl flex-wrap">
          <span className="text-sm font-medium">{selectedNotes.size} selected</span>
          <div className="flex-1" />
          <div className="relative">
            <button
              onClick={() => setShowMassMoveDropdown(!showMassMoveDropdown)}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-sm rounded-lg transition-colors flex items-center gap-2"
            >
              <DynamicIcon name="FolderOpen" className="w-4 h-4" />
              Move
            </button>
            {showMassMoveDropdown && (
              <div className="absolute top-full right-0 mt-1 bg-blue-950 border border-blue-800/50 rounded-lg shadow-xl p-2 min-w-[180px] z-50">
                <button
                  onClick={() => {
                    handleMassMove(null);
                    setShowMassMoveDropdown(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-blue-900/50 rounded-lg text-sm"
                >
                  Uncategorized
                </button>
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    onClick={() => {
                      handleMassMove(folder.id);
                      setShowMassMoveDropdown(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-blue-900/50 rounded-lg text-sm"
                    style={{ borderLeft: `3px solid ${folder.color}` }}
                  >
                    {folder.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={handleExport}
            className="px-3 py-1.5 bg-blue-900/50 hover:bg-blue-800/50 text-sm rounded-lg transition-colors flex items-center gap-2"
          >
            <DynamicIcon name="Download" className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={handleMassDelete}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-sm rounded-lg transition-colors flex items-center gap-2"
          >
            <DynamicIcon name="Trash2" className="w-4 h-4" />
            Delete
          </button>
          <button
            onClick={deselectAllNotes}
            className="px-3 py-1.5 bg-blue-900/50 hover:bg-blue-800/50 text-sm rounded-lg transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* Notes Grid */}
      {filteredNotes.length === 0 ? (
        <div className="bg-blue-950/50 rounded-2xl p-12 text-center border border-blue-800/30">
          <DynamicIcon
            name="NotebookText"
            className="w-16 h-16 text-blue-400/30 mx-auto mb-4"
          />
          <h3 className="text-xl font-bold mb-2">
            {notes.length === 0 ? "No Notes Yet" : "No Notes Match Filters"}
          </h3>
          <p className="text-blue-200/60 mb-6">
            {notes.length === 0
              ? "Write a note or import a PDF to build your library."
              : "Try adjusting your search or folder filter."}
          </p>
          {notes.length === 0 && (
            <button
              onClick={openNewNote}
              className="px-6 py-3 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 font-semibold rounded-xl transition-colors"
            >
              New Note
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {visibleNotes.map((note) => (
            <div
              key={note.id}
              onClick={() =>
                selectionMode ? toggleNoteSelection(note.id) : openEditNote(note)
              }
              className={`group relative p-4 rounded-xl border transition-all cursor-pointer ${
                selectionMode && selectedNotes.has(note.id)
                  ? "bg-purple-900/30 border-purple-500"
                  : "bg-blue-950/50 border-blue-800/30 hover:bg-blue-900/50 hover:border-blue-700/50"
              }`}
            >
              <div className="flex items-start gap-3">
                {selectionMode && (
                  <div
                    className={`mt-1 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors shrink-0 ${
                      selectedNotes.has(note.id)
                        ? "bg-purple-600 border-purple-600"
                        : "border-blue-600"
                    }`}
                  >
                    {selectedNotes.has(note.id) && (
                      <DynamicIcon name="Check" className="w-3 h-3" />
                    )}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {note.pinned && (
                      <DynamicIcon
                        name="Pin"
                        className="w-3.5 h-3.5 text-yellow-400 shrink-0"
                      />
                    )}
                    <h3 className="font-semibold truncate">{note.title}</h3>
                    <span className="px-1.5 py-0.5 bg-gray-500/20 text-gray-400 text-xs rounded shrink-0">
                      {noteTypeLabel(note.type)}
                    </span>
                    {note.source === "ocr" && (
                      <span
                        className="px-1.5 py-0.5 bg-blue-500/20 text-blue-300 text-xs rounded flex items-center gap-1 shrink-0"
                        title="Extracted via OCR"
                      >
                        <DynamicIcon name="ScanText" className="w-3 h-3" />
                        OCR
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-blue-200/50 line-clamp-2 mb-2">
                    {note.content || "No content"}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-blue-200/40">
                    <span>{getRelativeTime(note.updatedAt)}</span>
                    {note.tags.length > 0 && (
                      <span className="truncate">
                        {note.tags.slice(0, 3).join(", ")}
                      </span>
                    )}
                  </div>
                </div>
                {!selectionMode && (
                  <div
                    className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => handleTogglePin(note)}
                      className="p-1.5 hover:bg-blue-800/50 rounded-lg transition-colors"
                      title={note.pinned ? "Unpin" : "Pin"}
                    >
                      <DynamicIcon
                        name="Pin"
                        className={`w-4 h-4 ${note.pinned ? "text-yellow-400" : ""}`}
                      />
                    </button>
                    <button
                      onClick={() => setMovingNote(note.id)}
                      className="p-1.5 hover:bg-blue-800/50 rounded-lg transition-colors"
                      title="Move"
                    >
                      <DynamicIcon name="Folder" className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      disabled={deleting === note.id}
                      className="p-1.5 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                      title="Delete"
                    >
                      {deleting === note.id ? (
                        <DynamicIcon name="Loader2" className="w-4 h-4 animate-spin" />
                      ) : (
                        <DynamicIcon name="Trash2" className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {visibleNotes.length < filteredNotes.length && (
        <button
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          className="w-full py-3 bg-blue-900/40 hover:bg-blue-800/50 border border-blue-800/50 rounded-xl text-sm font-medium transition-colors"
        >
          Show more ({filteredNotes.length - visibleNotes.length} left)
        </button>
      )}

      {/* New/Edit Note Modal */}
      {editingNoteId && (
        <FullScreenView
          title={editingNoteId === "new" ? "New Note" : "Edit Note"}
          icon="FileText"
          onClose={closeNoteEditor}
          footer={
            <div className="max-w-lg mx-auto flex gap-3 p-4">
              <button
                onClick={closeNoteEditor}
                className="flex-1 px-4 py-2 bg-blue-900/50 hover:bg-blue-800/50 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNote}
                disabled={!editNote.title?.trim() || savingNote}
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {savingNote ? "Saving..." : "Save"}
              </button>
            </div>
          }
        >
          <div className="max-w-lg mx-auto space-y-4">
              <div>
                <label className="block text-sm font-medium text-blue-200/70 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={editNote.title || ""}
                  onChange={(e) => setEditNote({ ...editNote, title: e.target.value })}
                  className="w-full px-3 py-2 bg-blue-900/50 border border-blue-700/50 rounded-lg text-white placeholder-blue-300/50 focus:outline-none focus:border-purple-500"
                  placeholder="Note title"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200/70 mb-1">
                  Content
                </label>
                <textarea
                  value={editNote.content || ""}
                  onChange={(e) => setEditNote({ ...editNote, content: e.target.value })}
                  className="w-full h-40 px-3 py-2 bg-blue-900/50 border border-blue-700/50 rounded-lg text-white placeholder-blue-300/50 focus:outline-none focus:border-purple-500 resize-none"
                  placeholder="Note content (supports Markdown)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200/70 mb-1">
                  Type
                </label>
                <select
                  value={editNote.type || "lore"}
                  onChange={(e) =>
                    setEditNote({ ...editNote, type: e.target.value as LoreType })
                  }
                  className="w-full px-3 py-2 bg-blue-900/50 border border-blue-700/50 rounded-lg text-white focus:outline-none focus:border-purple-500"
                >
                  {NOTE_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200/70 mb-1">
                  Folder
                </label>
                <select
                  value={editNote.folderId || ""}
                  onChange={(e) =>
                    setEditNote({ ...editNote, folderId: e.target.value || undefined })
                  }
                  className="w-full px-3 py-2 bg-blue-900/50 border border-blue-700/50 rounded-lg text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="">Uncategorized</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200/70 mb-1">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={(editNote.tags || []).join(", ")}
                  onChange={(e) =>
                    setEditNote({
                      ...editNote,
                      tags: e.target.value
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean),
                    })
                  }
                  className="w-full px-3 py-2 bg-blue-900/50 border border-blue-700/50 rounded-lg text-white placeholder-blue-300/50 focus:outline-none focus:border-purple-500"
                  placeholder="npc, faction, backstory"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-blue-200">
                <input
                  type="checkbox"
                  checked={editNote.pinned || false}
                  onChange={(e) => setEditNote({ ...editNote, pinned: e.target.checked })}
                  className="rounded"
                />
                <DynamicIcon name="Pin" className="w-3.5 h-3.5" />
                Pinned (shown at top of list)
              </label>
          </div>
        </FullScreenView>
      )}

      <NewFolderDialog
        isOpen={showNewFolderDialog}
        onClose={() => setShowNewFolderDialog(false)}
        onCreate={handleCreateFolder}
      />

      {movingNote && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-blue-950 border border-blue-800/50 rounded-xl p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Move to Folder</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              <button
                onClick={() => movingNote && handleMoveNote(movingNote, null)}
                className="w-full p-3 text-left rounded-lg border-2 border-blue-800/50 hover:border-purple-500 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <DynamicIcon name="FolderOpen" className="w-5 h-5" />
                  Uncategorized
                </span>
              </button>
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => movingNote && handleMoveNote(movingNote, folder.id)}
                  className="w-full p-3 text-left rounded-lg border-2 border-blue-800/50 hover:border-purple-500 transition-colors"
                  style={{ borderLeftColor: folder.color, borderLeftWidth: "4px" }}
                >
                  <span className="flex items-center gap-2">
                    <DynamicIcon name={folder.icon} className="w-5 h-5" />
                    {folder.name}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setMovingNote(null)}
              className="w-full mt-4 px-4 py-2 bg-blue-900/50 hover:bg-blue-800/50 font-semibold rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showOcrFolderPrompt && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-blue-950 border border-blue-800/50 rounded-xl p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-1">Import from PDF</h2>
            <p className="text-sm text-blue-200/60 mb-4">
              Which folder should the extracted notes and tables be saved to?
            </p>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              <button
                onClick={() => {
                  setOcrTargetFolder(undefined);
                  setShowOcrFolderPrompt(false);
                  setOcrImporterKey((k) => k + 1);
                  setOcrImporterOpen(true);
                }}
                className="w-full p-3 text-left rounded-lg border-2 border-blue-800/50 hover:border-purple-500 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <DynamicIcon name="FolderOpen" className="w-5 h-5" />
                  Uncategorized
                </span>
              </button>
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => {
                    setOcrTargetFolder(folder.id);
                    setShowOcrFolderPrompt(false);
                    setOcrImporterKey((k) => k + 1);
                    setOcrImporterOpen(true);
                  }}
                  className="w-full p-3 text-left rounded-lg border-2 border-blue-800/50 hover:border-purple-500 transition-colors"
                  style={{ borderLeftColor: folder.color, borderLeftWidth: "4px" }}
                >
                  <span className="flex items-center gap-2">
                    <DynamicIcon name={folder.icon} className="w-5 h-5" />
                    {folder.name}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowOcrFolderPrompt(false)}
              className="w-full mt-4 px-4 py-2 bg-blue-900/50 hover:bg-blue-800/50 font-semibold rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        icon={confirmDialog.icon}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        confirmButtonClass={confirmDialog.confirmButtonClass}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
      />
    </div>
  );
}
