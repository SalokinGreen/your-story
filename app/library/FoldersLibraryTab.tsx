"use client";

import { useEffect, useState } from "react";
import { useNotification } from "@/app/misc/NotificationContext";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import { DynamicIcon } from "@/app/components/DynamicIcon";
import NewFolderDialog from "@/app/components/NewFolderDialog";
import FolderActionSheet from "@/app/components/FolderActionSheet";
import {
  LocalFolder,
  createLocalFolder,
  updateLocalFolder,
  deleteLocalFolder,
} from "@/app/misc/localFolderManager";
import {
  LocalStory,
  unassignFolderFromStories,
} from "@/app/misc/localStoryManager";
import {
  listLibraryNotes,
  unassignFolderFromNotes,
  LibraryNote,
} from "@/app/misc/localNotesLibraryManager";
import {
  listLibraryTables,
  unassignFolderFromTables,
  LibraryTable,
} from "@/app/misc/localTablesLibraryManager";

interface FoldersLibraryTabProps {
  folders: LocalFolder[];
  setFolders: React.Dispatch<React.SetStateAction<LocalFolder[]>>;
  localStories: LocalStory[];
  setLocalStories: React.Dispatch<React.SetStateAction<LocalStory[]>>;
  onExportFolder: (folder: LocalFolder) => void;
  // Notes/tables are cached separately in NotesLibraryTab, so bump its
  // remount key whenever a folder deletion changes their counts.
  onFolderContentsChanged?: () => void;
}

export default function FoldersLibraryTab({
  folders,
  setFolders,
  localStories,
  setLocalStories,
  onExportFolder,
  onFolderContentsChanged,
}: FoldersLibraryTabProps) {
  const { addNotification } = useNotification();
  const [notes, setNotes] = useState<LibraryNote[]>([]);
  const [tables, setTables] = useState<LibraryTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [activeFolder, setActiveFolder] = useState<LocalFolder | null>(null);

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    icon?: string;
    confirmText?: string;
    confirmButtonClass?: string;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [notesList, tablesList] = await Promise.all([
          listLibraryNotes(),
          listLibraryTables(),
        ]);
        setNotes(notesList);
        setTables(tablesList);
      } catch (error: any) {
        addNotification(`Failed to load folder contents: ${error.message}`, "failure");
      } finally {
        setLoading(false);
      }
    })();
  }, [addNotification]);

  const countsFor = (folderId: string) => ({
    stories: localStories.filter((s) => s.folder_id === folderId).length,
    notes: notes.filter((n) => n.folderId === folderId).length,
    tables: tables.filter((t) => t.folderId === folderId).length,
  });

  const handleCreateFolder = (name: string, icon: string, color: string) => {
    try {
      const folder = createLocalFolder(name, icon, color);
      setFolders((prev) => [...prev, folder]);
      setShowNewFolderDialog(false);
      addNotification("Folder created successfully", "success");
    } catch (error: any) {
      addNotification(`Failed to create folder: ${error.message}`, "failure");
    }
  };

  const handleSaveFolder = (
    folderId: string,
    updates: Pick<LocalFolder, "name" | "icon" | "color">,
  ) => {
    try {
      const folder = updateLocalFolder(folderId, updates);
      if (!folder) throw new Error("Folder not found");
      setFolders((prev) => prev.map((f) => (f.id === folderId ? folder : f)));
      setActiveFolder(null);
      addNotification("Folder updated successfully", "success");
    } catch (error: any) {
      addNotification(`Failed to update folder: ${error.message}`, "failure");
    }
  };

  const handleDeleteFolder = (folder: LocalFolder) => {
    setConfirmDialog({
      isOpen: true,
      title: "Delete Folder?",
      message: `Are you sure? Items in "${folder.name}" will not be deleted, just uncategorized.`,
      icon: "Trash2",
      confirmText: "Delete Folder",
      confirmButtonClass: "bg-red-600 hover:bg-red-700",
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        try {
          deleteLocalFolder(folder.id);
          await Promise.all([
            unassignFolderFromStories(folder.id),
            unassignFolderFromNotes(folder.id),
            unassignFolderFromTables(folder.id),
          ]);
          setFolders((prev) => prev.filter((f) => f.id !== folder.id));
          setLocalStories((prev) =>
            prev.map((s) =>
              s.folder_id === folder.id ? { ...s, folder_id: null } : s,
            ),
          );
          setNotes((prev) =>
            prev.map((n) =>
              n.folderId === folder.id ? { ...n, folderId: undefined } : n,
            ),
          );
          setTables((prev) =>
            prev.map((t) =>
              t.folderId === folder.id ? { ...t, folderId: undefined } : t,
            ),
          );
          setActiveFolder(null);
          onFolderContentsChanged?.();
          addNotification("Folder deleted successfully", "success");
        } catch (error: any) {
          addNotification(`Failed to delete folder: ${error.message}`, "failure");
        }
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-blue-200/60">
          Folders are shared across Stories, Notes, and Tables. Tap a folder to rename,
          recolor, export, or delete it.
        </p>
        <button
          onClick={() => setShowNewFolderDialog(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-xl transition-colors text-sm font-medium shrink-0"
        >
          <DynamicIcon name="Plus" className="w-4 h-4" />
          New Folder
        </button>
      </div>

      {!loading && folders.length === 0 ? (
        <div className="bg-blue-950/50 rounded-2xl p-12 text-center border border-blue-800/30">
          <DynamicIcon
            name="FolderPlus"
            className="w-16 h-16 text-blue-400/30 mx-auto mb-4"
          />
          <h3 className="text-xl font-bold mb-2">No Folders Yet</h3>
          <p className="text-blue-200/60 mb-6">
            Create a folder to organize your stories, notes, and tables.
          </p>
          <button
            onClick={() => setShowNewFolderDialog(true)}
            className="px-6 py-3 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 font-semibold rounded-xl transition-colors"
          >
            New Folder
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {folders.map((folder) => {
            const counts = countsFor(folder.id);
            const total = counts.stories + counts.notes + counts.tables;
            return (
              <button
                key={folder.id}
                onClick={() => setActiveFolder(folder)}
                className="group text-left p-4 rounded-xl border bg-blue-950/50 border-blue-800/30 hover:bg-blue-900/50 hover:border-blue-700/50 transition-all active:scale-[0.98]"
                style={{ borderTop: `3px solid ${folder.color}` }}
              >
                <span
                  className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
                  style={{ backgroundColor: `${folder.color}30` }}
                >
                  <DynamicIcon name={folder.icon} className="w-5 h-5" style={{ color: folder.color }} />
                </span>
                <h3 className="font-semibold truncate mb-1">{folder.name}</h3>
                <p className="text-xs text-blue-200/50">
                  {total === 0 ? "Empty" : `${total} item${total === 1 ? "" : "s"}`}
                </p>
              </button>
            );
          })}
        </div>
      )}

      <NewFolderDialog
        isOpen={showNewFolderDialog}
        onClose={() => setShowNewFolderDialog(false)}
        onCreate={handleCreateFolder}
      />

      {activeFolder && (
        <FolderActionSheet
          folder={activeFolder}
          counts={countsFor(activeFolder.id)}
          onClose={() => setActiveFolder(null)}
          onSave={(updates) => handleSaveFolder(activeFolder.id, updates)}
          onExport={() => {
            onExportFolder(activeFolder);
            setActiveFolder(null);
          }}
          onDelete={() => handleDeleteFolder(activeFolder)}
        />
      )}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        icon={confirmDialog.icon}
        confirmText={confirmDialog.confirmText}
        confirmButtonClass={confirmDialog.confirmButtonClass}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
      />
    </div>
  );
}
