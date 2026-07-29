"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useNotification } from "@/app/misc/NotificationContext";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import { DynamicIcon } from "@/app/components/DynamicIcon";
import { DraggableScroll } from "@/app/components/DraggableScroll";
import NewFolderDialog from "@/app/components/NewFolderDialog";
import {
  LocalAdventure,
  deleteLocalAdventure,
  moveLocalAdventure,
} from "@/app/misc/localAdventureManager";
import { LocalFolder, createLocalFolder } from "@/app/misc/localFolderManager";
import { getRelativeTime } from "@/app/misc/relativeTime";
import { ALL_SCOPE, LibraryScope, scopeMatches } from "./libraryScope";

type AdventureSortBy = "updated" | "title";

interface AdventuresLibraryTabProps {
  adventures: LocalAdventure[];
  setAdventures: React.Dispatch<React.SetStateAction<LocalAdventure[]>>;
  folders: LocalFolder[];
  setFolders: React.Dispatch<React.SetStateAction<LocalFolder[]>>;
  scope?: LibraryScope;
  onPlayAdventure: (adventure: LocalAdventure) => void;
}

export default function AdventuresLibraryTab({
  adventures,
  setAdventures,
  folders,
  setFolders,
  scope = ALL_SCOPE,
  onPlayAdventure,
}: AdventuresLibraryTabProps) {
  const router = useRouter();
  const { addNotification } = useNotification();

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<AdventureSortBy>("updated");
  const [chipFolder, setChipFolder] = useState<LibraryScope>(scope);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [movingAdventure, setMovingAdventure] = useState<string | null>(null);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    icon?: string;
    confirmText?: string;
    confirmButtonClass?: string;
  }>({ isOpen: false, title: "", message: "", onConfirm: () => {} });

  useEffect(() => {
    setChipFolder(scope);
  }, [scope]);

  const activeScope = scope.kind === "all" ? chipFolder : scope;

  const filteredAdventures = useMemo(
    () =>
      adventures
        .filter((adventure) => {
          if (!scopeMatches(activeScope, adventure.folder_id)) return false;
          if (search) {
            const needle = search.toLowerCase();
            if (
              !adventure.title.toLowerCase().includes(needle) &&
              !adventure.description.toLowerCase().includes(needle)
            ) {
              return false;
            }
          }
          return true;
        })
        .sort((a, b) =>
          sortBy === "title"
            ? a.title.localeCompare(b.title)
            : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        ),
    [adventures, activeScope, search, sortBy],
  );

  const handleDeleteAdventure = (adventureId: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "Delete Adventure?",
      message:
        "Are you sure you want to delete this adventure? This action cannot be undone.",
      icon: "Trash2",
      confirmText: "Delete Adventure",
      confirmButtonClass: "bg-red-600 hover:bg-red-700",
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        try {
          setDeleting(adventureId);
          await deleteLocalAdventure(adventureId);
          setAdventures((prev) => prev.filter((a) => a.id !== adventureId));
          addNotification("Adventure deleted successfully", "success");
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          addNotification(`Failed to delete: ${message}`, "failure");
        } finally {
          setDeleting(null);
        }
      },
    });
  };

  const handleMoveAdventure = async (
    adventureId: string,
    folderId: string | null,
  ) => {
    try {
      await moveLocalAdventure(adventureId, folderId);
      setAdventures((prev) =>
        prev.map((a) =>
          a.id === adventureId ? { ...a, folder_id: folderId } : a,
        ),
      );
      setMovingAdventure(null);
      addNotification("Adventure moved successfully", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addNotification(`Failed to move adventure: ${message}`, "failure");
    }
  };

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

  const chipClass = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
      active
        ? "bg-linear-to-r from-purple-600 to-blue-600 text-white"
        : "bg-blue-900/50 text-blue-200/70 hover:bg-blue-800/50"
    }`;

  return (
    <div className="space-y-4">
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
            placeholder="Search adventures..."
            className="w-full pl-10 pr-4 py-2.5 bg-blue-900/50 border border-blue-700/50 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:border-purple-500/50 focus:bg-blue-900/70 transition-all"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as AdventureSortBy)}
          className="px-4 py-2.5 bg-blue-900/50 border border-blue-700/50 rounded-xl text-white focus:outline-none focus:border-purple-500/50 transition-all"
        >
          <option value="updated">Recent</option>
          <option value="title">A-Z</option>
        </select>
      </div>

      {scope.kind === "all" && (
        <DraggableScroll className="pb-2" innerClassName="gap-2 px-1">
          <button
            onClick={() => setChipFolder({ kind: "all" })}
            className={chipClass(chipFolder.kind === "all")}
          >
            <DynamicIcon name="Gamepad2" className="w-3.5 h-3.5" />
            All ({adventures.length})
          </button>
          <button
            onClick={() => setChipFolder({ kind: "unfiled" })}
            className={chipClass(chipFolder.kind === "unfiled")}
          >
            <DynamicIcon name="FileText" className="w-3.5 h-3.5" />
            Uncategorized ({adventures.filter((a) => !a.folder_id).length})
          </button>
          {folders.map((folder) => (
            <button
              key={folder.id}
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
              {adventures.filter((a) => a.folder_id === folder.id).length})
            </button>
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

      {filteredAdventures.length === 0 ? (
        <div className="bg-blue-950/50 rounded-2xl p-12 text-center border border-blue-800/30">
          <DynamicIcon
            name="Gamepad2"
            className="w-16 h-16 text-blue-400/30 mx-auto mb-4"
          />
          <h3 className="text-xl font-bold mb-2">
            {adventures.length === 0 ? "No Adventures Yet" : "Nothing Here"}
          </h3>
          <p className="text-blue-200/60 mb-6">
            {adventures.length === 0
              ? "Create your first adventure!"
              : "Try adjusting your search, or file an adventure here."}
          </p>
          {adventures.length === 0 && (
            <button
              onClick={() => router.push("/creator")}
              className="px-6 py-3 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 font-semibold rounded-xl transition-colors"
            >
              Create Adventure
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAdventures.map((adventure) => {
            const folder = folders.find((f) => f.id === adventure.folder_id);
            return (
              <div
                key={adventure.id}
                className="group relative bg-blue-950/50 rounded-xl overflow-hidden border border-blue-800/30 hover:border-blue-700/50 transition-all cursor-pointer"
                onClick={() => onPlayAdventure(adventure)}
              >
                <div className="relative h-32">
                  {adventure.adventureData.thumbnailUrl ? (
                    <div
                      className="absolute inset-0 bg-cover bg-center"
                      style={{
                        backgroundImage: `url(${adventure.adventureData.thumbnailUrl})`,
                      }}
                    />
                  ) : (
                    <div className="absolute inset-0 bg-linear-to-br from-purple-800/60 via-blue-900/60 to-gray-900" />
                  )}
                  <div className="absolute inset-0 bg-linear-to-t from-gray-900/90 via-transparent to-transparent" />

                  {scope.kind === "all" && folder && (
                    <span
                      className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/50 backdrop-blur text-xs rounded flex items-center gap-1"
                      style={{ color: folder.color }}
                    >
                      <DynamicIcon name={folder.icon} className="w-3 h-3" />
                      {folder.name}
                    </span>
                  )}
                </div>

                <div className="p-3">
                  <h3 className="font-semibold truncate mb-1">
                    {adventure.title}
                  </h3>
                  <p className="text-xs text-blue-200/50 line-clamp-2 mb-2">
                    {adventure.description}
                  </p>

                  <div className="flex flex-wrap gap-1 mb-2">
                    {adventure.adventureData.tags
                      ?.slice(0, 2)
                      .map((tag: string) => (
                        <span
                          key={tag}
                          className="px-1.5 py-0.5 bg-purple-500/20 text-purple-300 text-xs rounded"
                        >
                          {tag}
                        </span>
                      ))}
                  </div>

                  <div className="text-xs text-blue-200/40 mb-3">
                    {getRelativeTime(String(adventure.updatedAt))}
                  </div>

                  <div
                    className="flex gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => onPlayAdventure(adventure)}
                      className="flex-1 px-3 py-1.5 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-sm rounded-lg transition-colors"
                    >
                      Play
                    </button>
                    <button
                      onClick={() =>
                        router.push(`/creator?edit=${adventure.id}`)
                      }
                      className="px-3 py-1.5 bg-blue-900/50 hover:bg-blue-800/50 text-sm rounded-lg transition-colors"
                      title="Edit"
                    >
                      <DynamicIcon name="Pencil" className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setMovingAdventure(adventure.id)}
                      className="px-3 py-1.5 bg-blue-900/50 hover:bg-blue-800/50 text-sm rounded-lg transition-colors"
                      title="Move to folder"
                    >
                      <DynamicIcon name="Folder" className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteAdventure(adventure.id)}
                      disabled={deleting === adventure.id}
                      className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <DynamicIcon
                        name={
                          deleting === adventure.id ? "Loader2" : "Trash2"
                        }
                        className={`w-4 h-4 ${
                          deleting === adventure.id ? "animate-spin" : ""
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <NewFolderDialog
        isOpen={showNewFolderDialog}
        onClose={() => setShowNewFolderDialog(false)}
        onCreate={handleCreateFolder}
      />

      {movingAdventure && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-blue-950 border border-blue-800/50 rounded-xl p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Move to Folder</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              <button
                onClick={() => handleMoveAdventure(movingAdventure, null)}
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
                  onClick={() => handleMoveAdventure(movingAdventure, folder.id)}
                  className="w-full p-3 text-left rounded-lg border-2 border-blue-800/50 hover:border-purple-500 transition-colors"
                  style={{
                    borderLeftColor: folder.color,
                    borderLeftWidth: "4px",
                  }}
                >
                  <span className="flex items-center gap-2">
                    <DynamicIcon name={folder.icon} className="w-5 h-5" />
                    {folder.name}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setMovingAdventure(null)}
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
        confirmButtonClass={confirmDialog.confirmButtonClass}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
      />
    </div>
  );
}
