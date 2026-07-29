"use client";

import { useMemo, useState } from "react";
import { useNotification } from "@/app/misc/NotificationContext";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import { DynamicIcon } from "@/app/components/DynamicIcon";
import FolderActionSheet from "@/app/components/FolderActionSheet";
import {
  LocalFolder,
  updateLocalFolder,
  deleteLocalFolder,
} from "@/app/misc/localFolderManager";
import {
  LocalStory,
  unassignFolderFromStories,
} from "@/app/misc/localStoryManager";
import {
  LocalAdventure,
  unassignFolderFromAdventures,
} from "@/app/misc/localAdventureManager";
import { unassignFolderFromNotes } from "@/app/misc/localNotesLibraryManager";
import StoriesLibraryTab from "./StoriesLibraryTab";
import AdventuresLibraryTab from "./AdventuresLibraryTab";
import NotesLibraryTab, { NoteCounts } from "./NotesLibraryTab";
import { LibraryScope } from "./libraryScope";

type FolderTab = "stories" | "adventures" | "notes";

interface FolderDetailViewProps {
  /** The folder being viewed, or null for the Uncategorized pseudo-folder. */
  folder: LocalFolder | null;
  scope: LibraryScope;
  stories: LocalStory[];
  setStories: React.Dispatch<React.SetStateAction<LocalStory[]>>;
  adventures: LocalAdventure[];
  setAdventures: React.Dispatch<React.SetStateAction<LocalAdventure[]>>;
  folders: LocalFolder[];
  setFolders: React.Dispatch<React.SetStateAction<LocalFolder[]>>;
  noteCounts: NoteCounts;
  onNoteCountsChange: (counts: NoteCounts) => void;
  /** Bumped when notes changed underneath us (import, sync) - remounts the tab. */
  notesRefreshKey: number;
  onBack: () => void;
  onExportFolder: (folder: LocalFolder) => void;
  onHostStory: (storyId: string) => void;
  onPlayAdventure: (adventure: LocalAdventure) => void;
}

export default function FolderDetailView({
  folder,
  scope,
  stories,
  setStories,
  adventures,
  setAdventures,
  folders,
  setFolders,
  noteCounts,
  onNoteCountsChange,
  notesRefreshKey,
  onBack,
  onExportFolder,
  onHostStory,
  onPlayAdventure,
}: FolderDetailViewProps) {
  const { addNotification } = useNotification();
  const [tab, setTab] = useState<FolderTab>("stories");
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    icon?: string;
    confirmText?: string;
    confirmButtonClass?: string;
  }>({ isOpen: false, title: "", message: "", onConfirm: () => {} });

  const matches = (folderId: string | null | undefined) =>
    folder ? folderId === folder.id : !folderId;

  const counts = useMemo(
    () => ({
      stories: stories.filter((s) => matches(s.folder_id)).length,
      adventures: adventures.filter((a) => matches(a.folder_id)).length,
      notes: folder ? noteCounts.byFolder[folder.id] || 0 : noteCounts.unfiled,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stories, adventures, noteCounts, folder],
  );

  const handleSaveFolder = (
    updates: Pick<LocalFolder, "name" | "icon" | "color">,
  ) => {
    if (!folder) return;
    try {
      const updated = updateLocalFolder(folder.id, updates);
      if (!updated) throw new Error("Folder not found");
      setFolders((prev) => prev.map((f) => (f.id === folder.id ? updated : f)));
      setShowActionSheet(false);
      addNotification("Folder updated successfully", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addNotification(`Failed to update folder: ${message}`, "failure");
    }
  };

  const handleDeleteFolder = () => {
    if (!folder) return;
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
            unassignFolderFromAdventures(folder.id),
            unassignFolderFromNotes(folder.id),
          ]);
          setFolders((prev) => prev.filter((f) => f.id !== folder.id));
          setStories((prev) =>
            prev.map((s) =>
              s.folder_id === folder.id ? { ...s, folder_id: null } : s,
            ),
          );
          setAdventures((prev) =>
            prev.map((a) =>
              a.folder_id === folder.id ? { ...a, folder_id: null } : a,
            ),
          );
          setShowActionSheet(false);
          addNotification("Folder deleted successfully", "success");
          // The folder this view is about no longer exists.
          onBack();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          addNotification(`Failed to delete folder: ${message}`, "failure");
        }
      },
    });
  };

  const tabs: { key: FolderTab; label: string; icon: string; count: number }[] =
    [
      { key: "stories", label: "Stories", icon: "Book", count: counts.stories },
      {
        key: "adventures",
        label: "Adventures",
        icon: "Gamepad2",
        count: counts.adventures,
      },
      {
        key: "notes",
        label: "Notes",
        icon: "NotebookText",
        count: counts.notes,
      },
    ];

  const color = folder?.color ?? "#64748b";
  const icon = folder?.icon ?? "FileText";

  return (
    <div className="space-y-4">
      {/*
        No folder name here on purpose: the page's sticky header already
        carries it (and the back arrow), and the tab labels already carry the
        counts, so repeating either just eats the top of a phone screen. The
        colour chip keeps the folder identifiable at a glance.
      */}
      <div className="flex items-center gap-2">
        <span
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${color}30` }}
        >
          <DynamicIcon name={icon} className="w-4.5 h-4.5" style={{ color }} />
        </span>
        <div className="flex gap-2 overflow-x-auto flex-1 min-w-0 py-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex items-center gap-2 ${
                tab === t.key
                  ? "bg-linear-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/25"
                  : "bg-blue-900/50 text-blue-200/70 hover:bg-blue-800/50 hover:text-white"
              }`}
            >
              <DynamicIcon name={t.icon} className="w-4 h-4" />
              {t.label} ({t.count})
            </button>
          ))}
        </div>
        {/* Uncategorized isn't a real folder, so there's nothing to manage. */}
        {folder && (
          <button
            onClick={() => setShowActionSheet(true)}
            title="Rename, recolour, export or delete this folder"
            className="flex items-center gap-2 px-3 py-2 bg-blue-900/50 hover:bg-blue-800/60 border border-blue-700/50 rounded-xl text-sm font-medium transition-colors shrink-0"
          >
            <DynamicIcon name="Settings2" className="w-4 h-4" />
            <span className="hidden sm:inline">Manage</span>
          </button>
        )}
      </div>

      {tab === "stories" && (
        <StoriesLibraryTab
          stories={stories}
          setStories={setStories}
          folders={folders}
          setFolders={setFolders}
          scope={scope}
          onHostStory={onHostStory}
          onExportFolder={onExportFolder}
        />
      )}
      {tab === "adventures" && (
        <AdventuresLibraryTab
          adventures={adventures}
          setAdventures={setAdventures}
          folders={folders}
          setFolders={setFolders}
          scope={scope}
          onPlayAdventure={onPlayAdventure}
        />
      )}
      {tab === "notes" && (
        <NotesLibraryTab
          key={notesRefreshKey}
          folders={folders}
          setFolders={setFolders}
          onExportFolder={onExportFolder}
          onCountsChange={onNoteCountsChange}
          scope={scope}
        />
      )}

      {showActionSheet && folder && (
        <FolderActionSheet
          folder={folder}
          counts={counts}
          onClose={() => setShowActionSheet(false)}
          onSave={handleSaveFolder}
          onExport={() => {
            onExportFolder(folder);
            setShowActionSheet(false);
          }}
          onDelete={handleDeleteFolder}
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
