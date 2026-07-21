"use client";

import { useEffect, useRef, useState } from "react";
import { useNotification } from "@/app/misc/NotificationContext";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import { DynamicIcon } from "@/app/components/DynamicIcon";
import { IconPicker } from "@/app/components/IconPicker";
import { DraggableScroll } from "../components/DraggableScroll";
import { LibrarySkeleton } from "@/app/components/Skeleton";
import PDFImporter from "@/app/components/PDFImporter";
import { LoreType, StoryLore, CustomTable } from "@/app/misc/structs";
import {
  listLibraryNotes,
  createLibraryNote,
  updateLibraryNote,
  deleteLibraryNote,
  bulkDeleteLibraryNotes,
  bulkMoveLibraryNotes,
  unassignFolderFromNotes,
  LibraryNote,
} from "@/app/misc/localNotesLibraryManager";
import {
  listLibraryTables,
  createLibraryTable,
  updateLibraryTable,
  deleteLibraryTable,
  bulkDeleteLibraryTables,
  bulkMoveLibraryTables,
  unassignFolderFromTables,
  LibraryTable,
} from "@/app/misc/localTablesLibraryManager";
import {
  createLocalFolder,
  updateLocalFolder,
  deleteLocalFolder,
  LocalFolder,
} from "@/app/misc/localFolderManager";
import {
  downloadLibraryNotes,
  readLibraryNotesFile,
} from "@/app/misc/notesLibraryExport";
import {
  downloadLibraryTables,
  readLibraryTablesFile,
} from "@/app/misc/tablesLibraryExport";

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

function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString();
}

interface NotesLibraryTabProps {
  onCountChange?: (count: number) => void;
  // Folders are shared with the Stories/Adventures tabs (localFolderManager),
  // so state is lifted to the parent page and kept in sync across tabs.
  folders: LocalFolder[];
  setFolders: React.Dispatch<React.SetStateAction<LocalFolder[]>>;
  // Folder export modal also lives on the parent page (it needs to reach
  // across stories/notes/tables), so opening it is just a callback.
  onExportFolder: (folder: LocalFolder) => void;
}

export default function NotesLibraryTab({
  onCountChange,
  folders,
  setFolders,
  onExportFolder,
}: NotesLibraryTabProps) {
  const { addNotification } = useNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [notes, setNotes] = useState<LibraryNote[]>([]);
  const [tables, setTables] = useState<LibraryTable[]>([]);
  const [subView, setSubView] = useState<"notes" | "tables">("notes");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [showMassMoveDropdown, setShowMassMoveDropdown] = useState(false);

  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderIcon, setNewFolderIcon] = useState("Folder");
  const [newFolderColor, setNewFolderColor] = useState("#9333ea");
  const [editingFolder, setEditingFolder] = useState<LocalFolder | null>(null);
  const [movingNote, setMovingNote] = useState<string | null>(null);
  const [movingTable, setMovingTable] = useState<string | null>(null);

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
    onCountChange?.(notes.length);
  }, [notes, onCountChange]);

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
      const [notesList, tablesList] = await Promise.all([
        listLibraryNotes(),
        listLibraryTables(),
      ]);
      setNotes(notesList);
      setTables(tablesList);
    } catch (error: any) {
      console.error("Error loading notes library:", error);
      addNotification(`Failed to load notes library: ${error.message}`, "failure");
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
      folderId: selectedFolder || undefined,
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
    } catch (error: any) {
      console.error("Error saving note:", error);
      addNotification(`Failed to save note: ${error.message}`, "failure");
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
    } catch (error: any) {
      addNotification(`Failed to update note: ${error.message}`, "failure");
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
        } catch (error: any) {
          addNotification(`Failed to delete: ${error.message}`, "failure");
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
    } catch (error: any) {
      addNotification(`Failed to move note: ${error.message}`, "failure");
    }
  };

  const handleMoveTable = async (tableId: string, folderId: string | null) => {
    try {
      const updated = await updateLibraryTable(tableId, {
        folderId: folderId || undefined,
      });
      if (updated) {
        setTables((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      }
      setMovingTable(null);
      addNotification("Table moved", "success");
    } catch (error: any) {
      addNotification(`Failed to move table: ${error.message}`, "failure");
    }
  };

  // ============================================
  // Selection / bulk actions
  // ============================================

  const toggleSelectionMode = () => {
    setSelectionMode(!selectionMode);
    setSelectedNotes(new Set());
    setSelectedTables(new Set());
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
        } catch (error: any) {
          addNotification(`Failed to delete notes: ${error.message}`, "failure");
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
    } catch (error: any) {
      addNotification(`Failed to move notes: ${error.message}`, "failure");
    }
  };

  // ============================================
  // Folder management (shared LocalFolder store)
  // ============================================

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      addNotification("Please enter a folder name", "warning");
      return;
    }
    try {
      const folder = createLocalFolder(newFolderName, newFolderIcon, newFolderColor);
      setFolders((prev) => [...prev, folder]);
      setNewFolderName("");
      setNewFolderIcon("Folder");
      setNewFolderColor("#9333ea");
      setShowNewFolderDialog(false);
      addNotification("Folder created successfully", "success");
    } catch (error: any) {
      addNotification(`Failed to create folder: ${error.message}`, "failure");
    }
  };

  const handleUpdateFolder = async (
    folderId: string,
    updates: Partial<Pick<LocalFolder, "name" | "icon" | "color">>,
  ) => {
    try {
      const folder = updateLocalFolder(folderId, updates);
      if (!folder) throw new Error("Folder not found");
      setFolders((prev) => prev.map((f) => (f.id === folderId ? folder : f)));
      setEditingFolder(null);
      addNotification("Folder updated successfully", "success");
    } catch (error: any) {
      addNotification(`Failed to update folder: ${error.message}`, "failure");
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "Delete Folder?",
      message: "Are you sure? Notes in this folder will not be deleted, just uncategorized.",
      icon: "Folder",
      confirmText: "Delete Folder",
      confirmButtonClass: "bg-orange-600 hover:bg-orange-700",
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        try {
          deleteLocalFolder(folderId);
          setFolders((prev) => prev.filter((f) => f.id !== folderId));
          setSelectedFolder((prev) => (prev === folderId ? null : prev));
          await Promise.all([
            unassignFolderFromNotes(folderId),
            unassignFolderFromTables(folderId),
          ]);
          setNotes((prev) =>
            prev.map((n) =>
              n.folderId === folderId ? { ...n, folderId: undefined } : n,
            ),
          );
          setTables((prev) =>
            prev.map((t) =>
              t.folderId === folderId ? { ...t, folderId: undefined } : t,
            ),
          );
          addNotification("Folder deleted successfully", "success");
        } catch (error: any) {
          addNotification(`Failed to delete folder: ${error.message}`, "failure");
        }
      },
    });
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
    } catch (error: any) {
      addNotification(`Failed to import notes: ${error.message}`, "failure");
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
      customTables: CustomTable[];
      summary: string;
    },
    targetFolder?: string,
  ) => {
    const allNotes = [...data.lore, ...data.mechanicNotes];
    if (allNotes.length === 0 && data.customTables.length === 0) return;

    try {
      const [createdNotes, createdTables] = await Promise.all([
        Promise.all(
          allNotes.map((note) =>
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
        ),
        Promise.all(
          data.customTables.map((table) =>
            createLibraryTable({
              name: table.name,
              description: table.description,
              entries: table.entries,
              tags: [],
              folderId: targetFolder,
              pinned: false,
              source: "ocr",
            }),
          ),
        ),
      ]);
      setNotes((prev) => [...createdNotes, ...prev]);
      setTables((prev) => [...createdTables, ...prev]);
      const parts = [
        createdNotes.length > 0
          ? `${createdNotes.length} note${createdNotes.length === 1 ? "" : "s"}`
          : null,
        createdTables.length > 0
          ? `${createdTables.length} table${createdTables.length === 1 ? "" : "s"}`
          : null,
      ].filter(Boolean);
      addNotification(
        `Saved ${parts.join(" and ")} from PDF to your library`,
        "success",
      );
    } catch (error: any) {
      addNotification(`Failed to save OCR import: ${error.message}`, "failure");
    }
  };

  // ============================================
  // Filtering
  // ============================================

  const filteredNotes = notes
    .filter((note) => {
      if (selectedFolder !== null) {
        if (selectedFolder === "uncategorized") {
          if (note.folderId) return false;
        } else if (note.folderId !== selectedFolder) {
          return false;
        }
      }
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

  const filteredTables = tables
    .filter((table) => {
      if (selectedFolder !== null) {
        if (selectedFolder === "uncategorized") {
          if (table.folderId) return false;
        } else if (table.folderId !== selectedFolder) {
          return false;
        }
      }
      if (
        search &&
        !table.name.toLowerCase().includes(search.toLowerCase()) &&
        !table.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  const toggleTableSelection = (tableId: string) => {
    const next = new Set(selectedTables);
    if (next.has(tableId)) next.delete(tableId);
    else next.add(tableId);
    setSelectedTables(next);
  };

  const selectAllTables = () => {
    if (!selectionMode) setSelectionMode(true);
    setSelectedTables(new Set(filteredTables.map((t) => t.id)));
  };

  const deselectAllTables = () => setSelectedTables(new Set());

  const handleDeleteTable = (tableId: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "Delete Table?",
      message: "Are you sure you want to delete this table? This action cannot be undone.",
      icon: "Trash2",
      confirmText: "Delete Table",
      confirmButtonClass: "bg-red-600 hover:bg-red-700",
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        try {
          setDeleting(tableId);
          await deleteLibraryTable(tableId);
          setTables((prev) => prev.filter((t) => t.id !== tableId));
          addNotification("Table deleted", "success");
        } catch (error: any) {
          addNotification(`Failed to delete: ${error.message}`, "failure");
        } finally {
          setDeleting(null);
        }
      },
    });
  };

  const handleMassDeleteTables = () => {
    if (selectedTables.size === 0) return;
    const ids = Array.from(selectedTables);

    setConfirmDialog({
      isOpen: true,
      title: "Delete Multiple Tables?",
      message: `Are you sure you want to delete ${ids.length} table${ids.length === 1 ? "" : "s"}? This action cannot be undone.`,
      icon: "Trash2",
      confirmText: `Delete ${ids.length} Table${ids.length === 1 ? "" : "s"}`,
      confirmButtonClass: "bg-red-600 hover:bg-red-700",
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        try {
          await bulkDeleteLibraryTables(ids);
          const idSet = new Set(ids);
          setTables((prev) => prev.filter((t) => !idSet.has(t.id)));
          setSelectedTables(new Set());
          setSelectionMode(false);
          addNotification(`${ids.length} table${ids.length === 1 ? "" : "s"} deleted`, "success");
        } catch (error: any) {
          addNotification(`Failed to delete tables: ${error.message}`, "failure");
        }
      },
    });
  };

  const handleMassMoveTables = async (folderId: string | null) => {
    if (selectedTables.size === 0) return;
    const ids = Array.from(selectedTables);
    try {
      await bulkMoveLibraryTables(ids, folderId || undefined);
      const idSet = new Set(ids);
      setTables((prev) =>
        prev.map((t) =>
          idSet.has(t.id) ? { ...t, folderId: folderId || undefined } : t,
        ),
      );
      setSelectedTables(new Set());
      setSelectionMode(false);
      const folderName = folderId
        ? folders.find((f) => f.id === folderId)?.name || "folder"
        : "Uncategorized";
      addNotification(`${ids.length} table${ids.length === 1 ? "" : "s"} moved to ${folderName}`, "success");
    } catch (error: any) {
      addNotification(`Failed to move tables: ${error.message}`, "failure");
    }
  };

  const handleExportTables = () => {
    const toExport =
      selectedTables.size > 0
        ? tables.filter((t) => selectedTables.has(t.id))
        : filteredTables;
    if (toExport.length === 0) {
      addNotification("No tables to export", "warning");
      return;
    }
    downloadLibraryTables(toExport);
    addNotification(
      `Exported ${toExport.length} table${toExport.length === 1 ? "" : "s"}`,
      "success",
    );
  };

  const handleImportTablesFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const result = await readLibraryTablesFile(file);
    if (!result.success || !result.tables) {
      addNotification(result.error || "Failed to import tables", "failure");
      return;
    }

    try {
      const created = await Promise.all(
        result.tables.map((t) =>
          createLibraryTable({
            name: t.name,
            description: t.description,
            entries: t.entries,
            tags: t.tags,
            folderId: undefined,
            pinned: t.pinned,
            source: t.source,
            sourceFile: t.sourceFile,
          }),
        ),
      );
      setTables((prev) => [...created, ...prev]);
      addNotification(
        `Imported ${created.length} table${created.length === 1 ? "" : "s"}${
          result.warnings.length > 0 ? ` (${result.warnings.length} warning${result.warnings.length === 1 ? "" : "s"})` : ""
        }`,
        "success",
      );
    } catch (error: any) {
      addNotification(`Failed to import tables: ${error.message}`, "failure");
    }
  };

  if (loading && notes.length === 0) {
    return <LibrarySkeleton />;
  }

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
            onClick={() => setShowOcrFolderPrompt(true)}
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
            accept={subView === "notes" ? ".notes,.json" : ".tables,.json"}
            onChange={
              subView === "notes"
                ? handleImportFileChange
                : handleImportTablesFileChange
            }
            className="hidden"
          />
          <button
            onClick={subView === "notes" ? handleExport : handleExportTables}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-900/50 hover:bg-blue-800/60 border border-blue-700/50 rounded-xl transition-colors text-sm font-medium"
          >
            <DynamicIcon name="Download" className="w-4 h-4" />
            Export
            {subView === "notes"
              ? selectedNotes.size > 0
                ? ` (${selectedNotes.size})`
                : ""
              : selectedTables.size > 0
                ? ` (${selectedTables.size})`
                : ""}
          </button>
        </div>
      </div>

      {/* Notes / Tables sub-view toggle */}
      <div className="flex border border-blue-800/40 rounded-xl overflow-hidden w-fit">
        <button
          onClick={() => {
            setSubView("notes");
            setSelectionMode(false);
          }}
          className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
            subView === "notes"
              ? "bg-linear-to-r from-purple-600 to-blue-600 text-white"
              : "bg-blue-950/50 text-blue-200/60 hover:bg-blue-900/50"
          }`}
        >
          <DynamicIcon name="NotebookText" className="w-3.5 h-3.5" />
          Notes ({notes.length})
        </button>
        <button
          onClick={() => {
            setSubView("tables");
            setSelectionMode(false);
          }}
          className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
            subView === "tables"
              ? "bg-linear-to-r from-purple-600 to-blue-600 text-white"
              : "bg-blue-950/50 text-blue-200/60 hover:bg-blue-900/50"
          }`}
        >
          <DynamicIcon name="Dices" className="w-3.5 h-3.5" />
          Tables ({tables.length})
        </button>
      </div>

      {/* Folder Chips */}
      <DraggableScroll className="pb-2" innerClassName="gap-2 px-1">
        <button
          onClick={() => setSelectedFolder(null)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
            selectedFolder === null
              ? "bg-linear-to-r from-purple-600 to-blue-600 text-white"
              : "bg-blue-900/50 text-blue-200/70 hover:bg-blue-800/50"
          }`}
        >
          <DynamicIcon name="NotebookText" className="w-3.5 h-3.5" />
          All ({subView === "notes" ? notes.length : tables.length})
        </button>
        <button
          onClick={() => setSelectedFolder("uncategorized")}
          className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
            selectedFolder === "uncategorized"
              ? "bg-linear-to-r from-purple-600 to-blue-600 text-white"
              : "bg-blue-900/50 text-blue-200/70 hover:bg-blue-800/50"
          }`}
        >
          <DynamicIcon name="FileText" className="w-3.5 h-3.5" />
          Uncategorized (
          {subView === "notes"
            ? notes.filter((n) => !n.folderId).length
            : tables.filter((t) => !t.folderId).length}
          )
        </button>
        {folders.map((folder) => (
          <div key={folder.id} className="relative group shrink-0">
            <button
              onClick={() => setSelectedFolder(folder.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                selectedFolder === folder.id
                  ? "bg-linear-to-r from-purple-600 to-blue-600 text-white"
                  : "bg-blue-900/50 text-blue-200/70 hover:bg-blue-800/50"
              }`}
              style={{ borderLeft: `3px solid ${folder.color}` }}
            >
              <DynamicIcon name={folder.icon} className="w-3.5 h-3.5" />
              {folder.name} (
              {subView === "notes"
                ? notes.filter((n) => n.folderId === folder.id).length
                : tables.filter((t) => t.folderId === folder.id).length}
              )
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onExportFolder(folder);
              }}
              title="Export folder"
              className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 p-0.5 rounded-full bg-blue-800 hover:bg-purple-600 border border-blue-950 opacity-0 group-hover:opacity-100 transition-opacity"
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

      {/* Select mode + selection bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1" />
        {(subView === "notes" ? filteredNotes.length : filteredTables.length) > 0 && (
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
              onClick={subView === "notes" ? selectAllNotes : selectAllTables}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-blue-900/30 text-blue-200/60 hover:bg-blue-800/40"
            >
              Select All
            </button>
          </>
        )}
      </div>

      {subView === "notes" && selectionMode && selectedNotes.size > 0 && (
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

      {subView === "tables" && selectionMode && selectedTables.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-purple-900/30 border border-purple-700/30 rounded-xl flex-wrap">
          <span className="text-sm font-medium">{selectedTables.size} selected</span>
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
                    handleMassMoveTables(null);
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
                      handleMassMoveTables(folder.id);
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
            onClick={handleExportTables}
            className="px-3 py-1.5 bg-blue-900/50 hover:bg-blue-800/50 text-sm rounded-lg transition-colors flex items-center gap-2"
          >
            <DynamicIcon name="Download" className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={handleMassDeleteTables}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-sm rounded-lg transition-colors flex items-center gap-2"
          >
            <DynamicIcon name="Trash2" className="w-4 h-4" />
            Delete
          </button>
          <button
            onClick={deselectAllTables}
            className="px-3 py-1.5 bg-blue-900/50 hover:bg-blue-800/50 text-sm rounded-lg transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* Notes Grid */}
      {subView === "notes" && (filteredNotes.length === 0 ? (
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
          {filteredNotes.map((note) => (
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
                    className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
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
      ))}

      {/* Tables Grid */}
      {subView === "tables" &&
        (filteredTables.length === 0 ? (
          <div className="bg-blue-950/50 rounded-2xl p-12 text-center border border-blue-800/30">
            <DynamicIcon
              name="Dices"
              className="w-16 h-16 text-blue-400/30 mx-auto mb-4"
            />
            <h3 className="text-xl font-bold mb-2">
              {tables.length === 0 ? "No Tables Yet" : "No Tables Match Filters"}
            </h3>
            <p className="text-blue-200/60 mb-6">
              {tables.length === 0
                ? "Import a PDF with tables to build your library - detected tables are saved here automatically."
                : "Try adjusting your search or folder filter."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredTables.map((table) => (
              <div
                key={table.id}
                onClick={() =>
                  selectionMode && toggleTableSelection(table.id)
                }
                className={`group relative p-4 rounded-xl border transition-all ${
                  selectionMode ? "cursor-pointer" : ""
                } ${
                  selectionMode && selectedTables.has(table.id)
                    ? "bg-purple-900/30 border-purple-500"
                    : "bg-blue-950/50 border-blue-800/30 hover:bg-blue-900/50 hover:border-blue-700/50"
                }`}
              >
                <div className="flex items-start gap-3">
                  {selectionMode && (
                    <div
                      className={`mt-1 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors shrink-0 ${
                        selectedTables.has(table.id)
                          ? "bg-purple-600 border-purple-600"
                          : "border-blue-600"
                      }`}
                    >
                      {selectedTables.has(table.id) && (
                        <DynamicIcon name="Check" className="w-3 h-3" />
                      )}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold truncate">{table.name}</h3>
                      <span className="px-1.5 py-0.5 bg-gray-500/20 text-gray-400 text-xs rounded shrink-0">
                        {table.entries.length} entries
                      </span>
                      {table.source === "ocr" && (
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
                      {table.description || "No description"}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-blue-200/40">
                      <span>{getRelativeTime(table.updatedAt)}</span>
                    </div>
                  </div>
                  {!selectionMode && (
                    <div
                      className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => setMovingTable(table.id)}
                        className="p-1.5 hover:bg-blue-800/50 rounded-lg transition-colors"
                        title="Move"
                      >
                        <DynamicIcon name="Folder" className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteTable(table.id)}
                        disabled={deleting === table.id}
                        className="p-1.5 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                        title="Delete"
                      >
                        {deleting === table.id ? (
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
        ))}

      {/* New/Edit Note Modal */}
      {editingNoteId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-blue-950 border border-blue-800/50 rounded-xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {editingNoteId === "new" ? "New Note" : "Edit Note"}
            </h2>
            <div className="space-y-4">
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
            <div className="flex gap-3 mt-6">
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
          </div>
        </div>
      )}

      {/* Folder Dialogs */}
      {showNewFolderDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-blue-950 border border-blue-800/50 rounded-xl p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Create Folder</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-blue-200/70 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                  className="w-full px-3 py-2 bg-blue-900/50 border border-blue-700/50 rounded-lg text-white placeholder-blue-300/50 focus:outline-none focus:border-purple-500"
                  placeholder="My Folder"
                  autoFocus
                />
              </div>
              <div>
                <IconPicker label="Icon" value={newFolderIcon} onChange={setNewFolderIcon} />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200/70 mb-1">
                  Color
                </label>
                <input
                  type="color"
                  value={newFolderColor}
                  onChange={(e) => setNewFolderColor(e.target.value)}
                  className="w-full h-10 rounded-lg cursor-pointer bg-blue-900/50"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowNewFolderDialog(false);
                  setNewFolderName("");
                  setNewFolderIcon("Folder");
                  setNewFolderColor("#9333ea");
                }}
                className="flex-1 px-4 py-2 bg-blue-900/50 hover:bg-blue-800/50 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {editingFolder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-blue-950 border border-blue-800/50 rounded-xl p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Edit Folder</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-blue-200/70 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full px-3 py-2 bg-blue-900/50 border border-blue-700/50 rounded-lg text-white placeholder-blue-300/50 focus:outline-none focus:border-purple-500"
                  placeholder="My Folder"
                  autoFocus
                />
              </div>
              <div>
                <IconPicker label="Icon" value={newFolderIcon} onChange={setNewFolderIcon} />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200/70 mb-1">
                  Color
                </label>
                <input
                  type="color"
                  value={newFolderColor}
                  onChange={(e) => setNewFolderColor(e.target.value)}
                  className="w-full h-10 rounded-lg cursor-pointer bg-blue-900/50"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setEditingFolder(null);
                  setNewFolderName("");
                  setNewFolderIcon("Folder");
                  setNewFolderColor("#9333ea");
                }}
                className="flex-1 px-4 py-2 bg-blue-900/50 hover:bg-blue-800/50 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  editingFolder &&
                  handleUpdateFolder(editingFolder.id, {
                    name: newFolderName,
                    icon: newFolderIcon,
                    color: newFolderColor,
                  })
                }
                disabled={!newFolderName.trim()}
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

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

      {movingTable && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-blue-950 border border-blue-800/50 rounded-xl p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Move to Folder</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              <button
                onClick={() => movingTable && handleMoveTable(movingTable, null)}
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
                  onClick={() => movingTable && handleMoveTable(movingTable, folder.id)}
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
              onClick={() => setMovingTable(null)}
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
