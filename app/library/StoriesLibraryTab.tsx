"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useNotification } from "@/app/misc/NotificationContext";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import { DynamicIcon } from "@/app/components/DynamicIcon";
import { DraggableScroll } from "@/app/components/DraggableScroll";
import NewFolderDialog from "@/app/components/NewFolderDialog";
import {
  LocalStory,
  deleteLocalStory,
  saveLocalStory,
  getLocalStory,
} from "@/app/misc/localStoryManager";
import {
  LocalFolder,
  createLocalFolder,
} from "@/app/misc/localFolderManager";
import { getRelativeTime } from "@/app/misc/relativeTime";
import { ALL_SCOPE, LibraryScope, scopeMatches } from "./libraryScope";

type StorySortBy = "updated" | "created" | "name" | "chapter";

interface StoriesLibraryTabProps {
  stories: LocalStory[];
  setStories: React.Dispatch<React.SetStateAction<LocalStory[]>>;
  folders: LocalFolder[];
  setFolders: React.Dispatch<React.SetStateAction<LocalFolder[]>>;
  scope?: LibraryScope;
  onHostStory: (storyId: string) => void;
  onExportFolder: (folder: LocalFolder) => void;
  /** Unscoped view only - opens the .folder file picker on the parent page. */
  onImportFolder?: () => void;
}

export default function StoriesLibraryTab({
  stories,
  setStories,
  folders,
  setFolders,
  scope = ALL_SCOPE,
  onHostStory,
  onExportFolder,
  onImportFolder,
}: StoriesLibraryTabProps) {
  const router = useRouter();
  const { addNotification } = useNotification();

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<StorySortBy>("updated");
  // Only meaningful in the flat view; a folder view pins the filter to the
  // folder it was opened for.
  const [chipFolder, setChipFolder] = useState<LibraryScope>(scope);

  const [deleting, setDeleting] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showMassMoveDropdown, setShowMassMoveDropdown] = useState(false);
  const [movingStory, setMovingStory] = useState<string | null>(null);
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

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Reopening the tab under a different folder resets the chip filter, so a
  // folder view never inherits the last flat-view selection.
  useEffect(() => {
    setChipFolder(scope);
  }, [scope]);

  useEffect(() => {
    if (!showMassMoveDropdown) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setShowMassMoveDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMassMoveDropdown]);

  const activeScope = scope.kind === "all" ? chipFolder : scope;

  const filteredStories = useMemo(
    () =>
      stories
        .filter((story) => {
          if (!scopeMatches(activeScope, story.folder_id)) return false;
          if (
            search &&
            !story.title.toLowerCase().includes(search.toLowerCase())
          ) {
            return false;
          }
          return true;
        })
        .sort((a, b) => {
          switch (sortBy) {
            case "updated":
            case "created":
              return (
                new Date(b.updatedAt).getTime() -
                new Date(a.updatedAt).getTime()
              );
            case "name":
              return a.title.localeCompare(b.title);
            case "chapter":
              return (
                (b.storyData?.currentChapter ?? 0) -
                (a.storyData?.currentChapter ?? 0)
              );
            default:
              return 0;
          }
        }),
    [stories, activeScope, search, sortBy],
  );

  // ============================================
  // Mutations
  // ============================================

  const handleDeleteStory = (storyId: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "Delete Story?",
      message:
        "Are you sure you want to delete this story? This action cannot be undone.",
      icon: "Trash2",
      confirmText: "Delete Story",
      confirmButtonClass: "bg-red-600 hover:bg-red-700",
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        try {
          setDeleting(storyId);
          await deleteLocalStory(storyId);
          setStories((prev) => prev.filter((s) => s.id !== storyId));
          addNotification("Story deleted successfully", "success");
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          addNotification(`Failed to delete: ${message}`, "failure");
        } finally {
          setDeleting(null);
        }
      },
    });
  };

  const handleMoveStory = async (storyId: string, folderId: string | null) => {
    try {
      const localStory = await getLocalStory(storyId);
      if (!localStory) throw new Error("Story not found");
      await saveLocalStory(storyId, localStory.storyData, folderId);
      setStories((prev) =>
        prev.map((s) => (s.id === storyId ? { ...s, folder_id: folderId } : s)),
      );
      setMovingStory(null);
      addNotification("Story moved successfully", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addNotification(`Failed to move story: ${message}`, "failure");
    }
  };

  const toggleSelectionMode = () => {
    setSelectionMode(!selectionMode);
    setSelected(new Set());
  };

  const toggleSelection = (storyId: string) => {
    const next = new Set(selected);
    if (next.has(storyId)) next.delete(storyId);
    else next.add(storyId);
    setSelected(next);
  };

  const selectAll = () => {
    if (!selectionMode) setSelectionMode(true);
    setSelected(new Set(filteredStories.map((s) => s.id)));
  };

  const handleMassDelete = () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);

    setConfirmDialog({
      isOpen: true,
      title: "Delete Multiple Stories?",
      message: `Are you sure you want to delete ${ids.length} ${
        ids.length === 1 ? "story" : "stories"
      }? This action cannot be undone.`,
      icon: "Trash2",
      confirmText: `Delete ${ids.length} ${ids.length === 1 ? "Story" : "Stories"}`,
      confirmButtonClass: "bg-red-600 hover:bg-red-700",
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));

        const deletedIds: string[] = [];
        const failedIds: string[] = [];
        // Sequential to avoid racing IndexedDB transactions against each other.
        for (const storyId of ids) {
          try {
            await deleteLocalStory(storyId);
            deletedIds.push(storyId);
          } catch (error) {
            console.error(`Failed to delete story ${storyId}:`, error);
            failedIds.push(storyId);
          }
        }

        const deletedSet = new Set(deletedIds);
        setStories((prev) => prev.filter((s) => !deletedSet.has(s.id)));
        setSelected(new Set());
        setSelectionMode(false);

        if (failedIds.length > 0) {
          addNotification(
            `Deleted ${deletedIds.length} ${
              deletedIds.length === 1 ? "story" : "stories"
            }, ${failedIds.length} failed`,
            "warning",
          );
        } else if (deletedIds.length > 0) {
          addNotification(
            `${deletedIds.length} ${
              deletedIds.length === 1 ? "story" : "stories"
            } deleted successfully`,
            "success",
          );
        }
      },
    });
  };

  const handleMassMove = async (folderId: string | null) => {
    if (selected.size === 0) return;
    try {
      const results = await Promise.allSettled(
        Array.from(selected).map(async (storyId) => {
          const localStory = await getLocalStory(storyId);
          if (localStory) {
            await saveLocalStory(storyId, localStory.storyData, folderId);
          }
          return storyId;
        }),
      );

      const movedIds = new Set<string>();
      const failedCount = results.filter((r) => {
        if (r.status === "fulfilled") {
          movedIds.add(r.value);
          return false;
        }
        return true;
      }).length;

      setStories((prev) =>
        prev.map((s) =>
          movedIds.has(s.id) ? { ...s, folder_id: folderId } : s,
        ),
      );
      setSelected(new Set());
      setSelectionMode(false);

      const folderName = folderId
        ? folders.find((f) => f.id === folderId)?.name || "folder"
        : "Uncategorized";

      addNotification(
        failedCount > 0
          ? `Moved ${movedIds.size} ${
              movedIds.size === 1 ? "story" : "stories"
            } to ${folderName}, ${failedCount} failed`
          : `${movedIds.size} ${
              movedIds.size === 1 ? "story" : "stories"
            } moved to ${folderName}`,
        failedCount > 0 ? "warning" : "success",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addNotification(`Failed to move some stories: ${message}`, "failure");
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
      {/* Search + Sort */}
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
            placeholder="Search stories..."
            className="w-full pl-10 pr-4 py-2.5 bg-blue-900/50 border border-blue-700/50 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:border-purple-500/50 focus:bg-blue-900/70 transition-all"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as StorySortBy)}
          className="px-4 py-2.5 bg-blue-900/50 border border-blue-700/50 rounded-xl text-white focus:outline-none focus:border-purple-500/50 transition-all"
        >
          <option value="updated">Recent</option>
          <option value="created">Created</option>
          <option value="name">A-Z</option>
          <option value="chapter">Progress</option>
        </select>
      </div>

      {/* Folder chips - flat view only */}
      {scope.kind === "all" && (
        <DraggableScroll className="pb-2" innerClassName="gap-2 px-1">
          <button
            onClick={() => setChipFolder({ kind: "all" })}
            className={chipClass(chipFolder.kind === "all")}
          >
            <DynamicIcon name="Book" className="w-3.5 h-3.5" />
            All ({stories.length})
          </button>
          <button
            onClick={() => setChipFolder({ kind: "unfiled" })}
            className={chipClass(chipFolder.kind === "unfiled")}
          >
            <DynamicIcon name="FileText" className="w-3.5 h-3.5" />
            Uncategorized ({stories.filter((s) => !s.folder_id).length})
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
                {stories.filter((s) => s.folder_id === folder.id).length})
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
          {onImportFolder && (
            <button
              onClick={onImportFolder}
              className="px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap bg-blue-900/30 text-blue-300/70 hover:bg-blue-800/50 transition-all flex items-center gap-1.5 border border-dashed border-blue-700/50"
            >
              <DynamicIcon name="Upload" className="w-3.5 h-3.5" />
              Import Folder
            </button>
          )}
        </DraggableScroll>
      )}

      {/* Selection controls */}
      {filteredStories.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex-1" />
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
            onClick={selectAll}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-blue-900/30 text-blue-200/60 hover:bg-blue-800/40"
          >
            Select All
          </button>
        </div>
      )}

      {selectionMode && selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-purple-900/30 border border-purple-700/30 rounded-xl flex-wrap">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex-1" />
          <div className="relative" ref={dropdownRef}>
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
            onClick={handleMassDelete}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-sm rounded-lg transition-colors flex items-center gap-2"
          >
            <DynamicIcon name="Trash2" className="w-4 h-4" />
            Delete
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="px-3 py-1.5 bg-blue-900/50 hover:bg-blue-800/50 text-sm rounded-lg transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* Story list */}
      {filteredStories.length === 0 ? (
        <div className="bg-blue-950/50 rounded-2xl p-12 text-center border border-blue-800/30">
          <DynamicIcon
            name="BookOpen"
            className="w-16 h-16 text-blue-400/30 mx-auto mb-4"
          />
          <h3 className="text-xl font-bold mb-2">
            {stories.length === 0 ? "No Stories Yet" : "Nothing Here"}
          </h3>
          <p className="text-blue-200/60">
            {stories.length === 0
              ? "Start an adventure to create your first story."
              : "Try adjusting your search, or start a story here."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredStories.map((story) => {
            const chapter = story.storyData?.currentChapter ?? 0;
            const folder = folders.find((f) => f.id === story.folder_id);

            return (
              <div
                key={story.id}
                onClick={() =>
                  selectionMode
                    ? toggleSelection(story.id)
                    : router.push(`/story?storyId=${story.id}`)
                }
                className={`group relative p-4 rounded-xl border transition-all cursor-pointer ${
                  selectionMode && selected.has(story.id)
                    ? "bg-purple-900/30 border-purple-500"
                    : "bg-blue-950/50 border-blue-800/30 hover:bg-blue-900/50 hover:border-blue-700/50"
                }`}
              >
                <div className="flex items-start gap-3">
                  {selectionMode && (
                    <div
                      className={`mt-1 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors shrink-0 ${
                        selected.has(story.id)
                          ? "bg-purple-600 border-purple-600"
                          : "border-blue-600"
                      }`}
                    >
                      {selected.has(story.id) && (
                        <DynamicIcon name="Check" className="w-3 h-3" />
                      )}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate mb-1">
                      {story.title}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-blue-200/50">
                      <span>Ch. {chapter + 1}</span>
                      <span>{getRelativeTime(String(story.updatedAt))}</span>
                      {/* The folder is already obvious inside a folder view. */}
                      {scope.kind === "all" && folder && (
                        <span
                          className="flex items-center gap-1 truncate"
                          style={{ color: folder.color }}
                        >
                          <DynamicIcon
                            name={folder.icon}
                            className="w-3 h-3 shrink-0"
                          />
                          {folder.name}
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
                        onClick={() => onHostStory(story.id)}
                        className="p-1.5 hover:bg-blue-800/50 rounded-lg transition-colors"
                        title="Host this story online"
                      >
                        <DynamicIcon name="Wifi" className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setMovingStory(story.id)}
                        className="p-1.5 hover:bg-blue-800/50 rounded-lg transition-colors"
                        title="Move"
                      >
                        <DynamicIcon name="Folder" className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteStory(story.id)}
                        disabled={deleting === story.id}
                        className="p-1.5 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <DynamicIcon
                          name={deleting === story.id ? "Loader2" : "Trash2"}
                          className={`w-4 h-4 ${
                            deleting === story.id ? "animate-spin" : ""
                          }`}
                        />
                      </button>
                    </div>
                  )}
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

      {movingStory && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-blue-950 border border-blue-800/50 rounded-xl p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Move to Folder</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              <button
                onClick={() => handleMoveStory(movingStory, null)}
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
                  onClick={() => handleMoveStory(movingStory, folder.id)}
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
              onClick={() => setMovingStory(null)}
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
