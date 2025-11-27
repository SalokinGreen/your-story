"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/misc/AuthContext";
import { useNotification } from "@/app/misc/NotificationContext";
import { Adventure } from "@/app/misc/structs";
import { supabase } from "@/app/misc/supabase";
import { authenticatedFetch } from "@/app/misc/getAuthToken";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import { DynamicIcon } from "@/app/components/DynamicIcon";
import { IconPicker } from "@/app/components/IconPicker";
import { isEncrypted } from "@/app/misc/encryption";
import EncryptionMigration from "@/app/components/EncryptionMigration";
import { DraggableScroll } from "../components/DraggableScroll";
import {
  LibrarySkeleton,
  StoryGridSkeleton,
  AdventureGridSkeleton,
  FolderSidebarSkeleton,
} from "@/app/components/Skeleton";
import {
  listLocalStories,
  LocalStory,
  deleteLocalStory,
} from "@/app/misc/localStoryManager";
import {
  listLocalAdventures,
  deleteLocalAdventure,
} from "@/app/misc/localAdventureManager";

interface Story {
  id: string;
  adventure_id: string | null;
  user_id: string;
  story_name: string;
  story_data: any;
  is_completed: boolean;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  folder_id: string | null;
}

interface StoryFolder {
  id: string;
  user_id: string;
  name: string;
  color: string;
  icon: string;
  created_at: string;
  updated_at: string;
}

type LibraryView = "stories" | "adventures";
type StorySortBy = "updated" | "created" | "name" | "chapter";
type AdventureSortBy = "updated" | "created" | "title" | "rating" | "plays";

// Helper for relative time display
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

export default function LibraryPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { addNotification } = useNotification();
  const [view, setView] = useState<LibraryView>("stories");
  const [stories, setStories] = useState<Story[]>([]);
  const [localStories, setLocalStories] = useState<LocalStory[]>([]);
  const [adventures, setAdventures] = useState<Adventure[]>([]);
  const [localAdventures, setLocalAdventures] = useState<any[]>([]);
  const [folders, setFolders] = useState<StoryFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Filter and sort states
  const [storySearch, setStorySearch] = useState("");
  const [storyFilter, setStoryFilter] = useState<
    "all" | "completed" | "inProgress"
  >("all");
  const [storySortBy, setStorySortBy] = useState<StorySortBy>("updated");
  const [adventureSearch, setAdventureSearch] = useState("");
  const [adventureFilter, setAdventureFilter] = useState<
    "all" | "published" | "draft"
  >("all");
  const [adventureSortBy, setAdventureSortBy] =
    useState<AdventureSortBy>("updated");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  // Mass selection states
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedStories, setSelectedStories] = useState<Set<string>>(
    new Set()
  );
  const [showMassMoveDropdown, setShowMassMoveDropdown] = useState(false);

  // Folder management states
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderIcon, setNewFolderIcon] = useState("Folder");
  const [newFolderColor, setNewFolderColor] = useState("#9333ea");
  const [editingFolder, setEditingFolder] = useState<StoryFolder | null>(null);
  const [movingStory, setMovingStory] = useState<string | null>(null);
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
    if (!authLoading && !user) {
      addNotification("Please sign in to view your library", "warning");
      router.push("/");
    }
  }, [user, authLoading, router, addNotification]);

  useEffect(() => {
    if (user) {
      fetchLibraryData();
    }
  }, [user, view]);

  // Close dropdown when clicking outside
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

  const fetchLibraryData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      if (view === "stories") {
        // Fetch folders
        const foldersResponse = await authenticatedFetch("/api/folders");

        if (foldersResponse.ok) {
          const foldersData = await foldersResponse.json();
          setFolders(foldersData.folders || []);
        }

        // Fetch user's stories
        const response = await authenticatedFetch(
          `/api/stories?userId=${user.id}`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch stories");
        }

        const data = await response.json();
        setStories(data.stories || []);

        // Load local stories
        const localStoriesList = await listLocalStories();
        setLocalStories(localStoriesList);
      } else {
        // Fetch user's adventures
        const response = await authenticatedFetch(
          `/api/adventures?userId=${user.id}`
        );

        if (!response.ok) throw new Error("Failed to fetch adventures");

        const data = await response.json();
        setAdventures(data.adventures || []);

        // Load local adventures from IndexedDB
        try {
          const localAdvs = await listLocalAdventures();
          setLocalAdventures(localAdvs);
        } catch (error) {
          console.error("Error loading local adventures:", error);
          setLocalAdventures([]);
        }
      }
    } catch (error: any) {
      console.error("Error fetching library data:", error);
      addNotification(`Failed to load ${view}: ${error.message}`, "failure");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStory = async (
    storyId: string,
    isOffline: boolean = false
  ) => {
    setConfirmDialog({
      isOpen: true,
      title: "Delete Story?",
      message:
        "Are you sure you want to delete this story? This action cannot be undone.",
      icon: "Trash2",
      confirmText: "Delete Story",
      confirmButtonClass: "bg-red-600 hover:bg-red-700",
      onConfirm: async () => {
        setConfirmDialog({ ...confirmDialog, isOpen: false });
        try {
          setDeleting(storyId);

          if (isOffline) {
            // Delete local story
            await deleteLocalStory(storyId);
            setLocalStories(localStories.filter((s) => s.id !== storyId));
          } else {
            // Delete online story
            const response = await authenticatedFetch(
              `/api/stories/${storyId}`,
              {
                method: "DELETE",
              }
            );

            if (!response.ok) {
              const error = await response.json();
              throw new Error(error.error || "Failed to delete story");
            }

            setStories(stories.filter((s) => s.id !== storyId));
          }

          addNotification("Story deleted successfully", "success");
        } catch (error: any) {
          console.error("Error deleting story:", error);
          addNotification(`Failed to delete: ${error.message}`, "failure");
        } finally {
          setDeleting(null);
        }
      },
    });
  };

  const handleDeleteAdventure = async (
    adventureId: string,
    isOffline: boolean = false
  ) => {
    setConfirmDialog({
      isOpen: true,
      title: "Delete Adventure?",
      message:
        "Are you sure you want to delete this adventure? This action cannot be undone.",
      icon: "Trash2",
      confirmText: "Delete Adventure",
      confirmButtonClass: "bg-red-600 hover:bg-red-700",
      onConfirm: async () => {
        setConfirmDialog({ ...confirmDialog, isOpen: false });
        try {
          setDeleting(adventureId);

          if (isOffline) {
            // Delete local adventure using localAdventureManager
            await deleteLocalAdventure(adventureId);
            setLocalAdventures(
              localAdventures.filter((a) => a.id !== adventureId)
            );
          } else {
            // Delete online adventure
            const response = await authenticatedFetch(
              `/api/adventures/${adventureId}`,
              {
                method: "DELETE",
              }
            );

            if (!response.ok) {
              const error = await response.json();
              throw new Error(error.error || "Failed to delete adventure");
            }

            setAdventures(adventures.filter((a) => a.id !== adventureId));
          }

          addNotification("Adventure deleted successfully", "success");
        } catch (error: any) {
          console.error("Error deleting adventure:", error);
          addNotification(`Failed to delete: ${error.message}`, "failure");
        } finally {
          setDeleting(null);
        }
      },
    });
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      addNotification("Please enter a folder name", "warning");
      return;
    }

    try {
      const response = await authenticatedFetch("/api/folders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newFolderName,
          icon: newFolderIcon,
          color: newFolderColor,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create folder");
      }

      const { folder } = await response.json();
      setFolders([...folders, folder]);
      setNewFolderName("");
      setNewFolderIcon("Folder");
      setNewFolderColor("#9333ea");
      setShowNewFolderDialog(false);
      addNotification("Folder created successfully", "success");
    } catch (error: any) {
      console.error("Error creating folder:", error);
      addNotification(`Failed to create folder: ${error.message}`, "failure");
    }
  };

  const handleUpdateFolder = async (
    folderId: string,
    updates: Partial<StoryFolder>
  ) => {
    try {
      const response = await authenticatedFetch(`/api/folders/${folderId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update folder");
      }

      const { folder } = await response.json();
      setFolders(folders.map((f) => (f.id === folderId ? folder : f)));
      setEditingFolder(null);
      addNotification("Folder updated successfully", "success");
    } catch (error: any) {
      console.error("Error updating folder:", error);
      addNotification(`Failed to update folder: ${error.message}`, "failure");
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "Delete Folder?",
      message:
        "Are you sure? Stories in this folder will not be deleted, just uncategorized.",
      icon: "Folder",
      confirmText: "Delete Folder",
      confirmButtonClass: "bg-orange-600 hover:bg-orange-700",
      onConfirm: async () => {
        setConfirmDialog({ ...confirmDialog, isOpen: false });
        try {
          const response = await authenticatedFetch(
            `/api/folders/${folderId}`,
            {
              method: "DELETE",
            }
          );

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Failed to delete folder");
          }

          setFolders(folders.filter((f) => f.id !== folderId));
          if (selectedFolder === folderId) {
            setSelectedFolder(null);
          }
          // Update stories to remove folder reference
          setStories(
            stories.map((s) =>
              s.folder_id === folderId ? { ...s, folder_id: null } : s
            )
          );
          addNotification("Folder deleted successfully", "success");
        } catch (error: any) {
          console.error("Error deleting folder:", error);
          addNotification(
            `Failed to delete folder: ${error.message}`,
            "failure"
          );
        }
      },
    });
  };

  const handleMoveStory = async (storyId: string, folderId: string | null) => {
    try {
      const response = await authenticatedFetch(`/api/stories/${storyId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ folderId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to move story");
      }

      setStories(
        stories.map((s) =>
          s.id === storyId ? { ...s, folder_id: folderId } : s
        )
      );
      setMovingStory(null);
      addNotification("Story moved successfully", "success");
    } catch (error: any) {
      console.error("Error moving story:", error);
      addNotification(`Failed to move story: ${error.message}`, "failure");
    }
  };

  const handleMoveLocalStory = async (
    storyId: string,
    folderId: string | null
  ) => {
    try {
      // Import the save function
      const { saveLocalStory, getLocalStory } = await import(
        "@/app/misc/localStoryManager"
      );

      // Get the local story
      const localStory = await getLocalStory(storyId);
      if (!localStory) {
        throw new Error("Local story not found");
      }

      // Save with updated folder_id
      await saveLocalStory(storyId, localStory.storyData, folderId);

      // Update local state
      setLocalStories(
        localStories.map((s) =>
          s.id === storyId ? { ...s, folder_id: folderId } : s
        )
      );
      setMovingStory(null);
      addNotification("Local story moved successfully", "success");
    } catch (error: any) {
      console.error("Error moving local story:", error);
      addNotification(
        `Failed to move local story: ${error.message}`,
        "failure"
      );
    }
  };

  // Mass operation handlers
  const toggleSelectionMode = () => {
    setSelectionMode(!selectionMode);
    setSelectedStories(new Set());
  };

  const toggleStorySelection = (storyId: string) => {
    const newSelection = new Set(selectedStories);
    if (newSelection.has(storyId)) {
      newSelection.delete(storyId);
    } else {
      newSelection.add(storyId);
    }
    setSelectedStories(newSelection);
  };

  const selectAllStories = () => {
    const allIds = new Set([
      ...filteredStories.map((s) => s.id),
      ...filteredLocalStories.map((s) => s.id),
    ]);
    setSelectedStories(allIds);
  };

  const deselectAllStories = () => {
    setSelectedStories(new Set());
  };

  const handleMassDelete = () => {
    if (selectedStories.size === 0) return;

    setConfirmDialog({
      isOpen: true,
      title: "Delete Multiple Stories?",
      message: `Are you sure you want to delete ${selectedStories.size} ${
        selectedStories.size === 1 ? "story" : "stories"
      }? This action cannot be undone.`,
      icon: "Trash2",
      confirmText: `Delete ${selectedStories.size} ${
        selectedStories.size === 1 ? "Story" : "Stories"
      }`,
      confirmButtonClass: "bg-red-600 hover:bg-red-700",
      onConfirm: async () => {
        setConfirmDialog({ ...confirmDialog, isOpen: false });
        try {
          const deletePromises = Array.from(selectedStories).map(
            async (storyId) => {
              const isLocal = storyId.startsWith("local_");
              if (isLocal) {
                await deleteLocalStory(storyId);
              } else {
                const response = await authenticatedFetch(
                  `/api/stories/${storyId}`,
                  {
                    method: "DELETE",
                  }
                );
                if (!response.ok) {
                  throw new Error(`Failed to delete story ${storyId}`);
                }
              }
              return storyId;
            }
          );

          // Use allSettled to continue even if some deletions fail
          const results = await Promise.allSettled(deletePromises);

          // Separate successful and failed deletions
          const deletedIds = new Set<string>();
          const failedCount = results.filter((r, index) => {
            if (r.status === "fulfilled") {
              deletedIds.add(r.value);
              return false;
            }
            return true;
          }).length;

          // Update state for successfully deleted stories
          setStories(stories.filter((s) => !deletedIds.has(s.id)));
          setLocalStories(localStories.filter((s) => !deletedIds.has(s.id)));
          setSelectedStories(new Set());
          setSelectionMode(false);

          if (failedCount > 0) {
            addNotification(
              `Deleted ${deletedIds.size} ${
                deletedIds.size === 1 ? "story" : "stories"
              }, ${failedCount} failed`,
              "warning"
            );
          } else {
            addNotification(
              `${deletedIds.size} ${
                deletedIds.size === 1 ? "story" : "stories"
              } deleted successfully`,
              "success"
            );
          }
        } catch (error: any) {
          console.error("Error deleting stories:", error);
          addNotification(
            `Failed to delete some stories: ${error.message}`,
            "failure"
          );
        }
      },
    });
  };

  const handleMassMove = (folderId: string | null) => {
    if (selectedStories.size === 0) return;

    const moveStories = async () => {
      try {
        const movePromises = Array.from(selectedStories).map(
          async (storyId) => {
            const isLocal = storyId.startsWith("local_");
            if (isLocal) {
              const { saveLocalStory, getLocalStory } = await import(
                "@/app/misc/localStoryManager"
              );
              const localStory = await getLocalStory(storyId);
              if (localStory) {
                await saveLocalStory(storyId, localStory.storyData, folderId);
              }
            } else {
              const response = await authenticatedFetch(
                `/api/stories/${storyId}`,
                {
                  method: "PATCH",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ folderId }),
                }
              );
              if (!response.ok) {
                throw new Error(`Failed to move story ${storyId}`);
              }
            }
            return storyId;
          }
        );

        // Use allSettled to continue even if some moves fail
        const results = await Promise.allSettled(movePromises);

        // Separate successful and failed moves
        const movedIds = new Set<string>();
        const failedCount = results.filter((r) => {
          if (r.status === "fulfilled") {
            movedIds.add(r.value);
            return false;
          }
          return true;
        }).length;

        // Update state for successfully moved stories
        setStories(
          stories.map((s) =>
            movedIds.has(s.id) ? { ...s, folder_id: folderId } : s
          )
        );
        setLocalStories(
          localStories.map((s) =>
            movedIds.has(s.id) ? { ...s, folder_id: folderId } : s
          )
        );
        setSelectedStories(new Set());
        setSelectionMode(false);

        const folderName = folderId
          ? folders.find((f) => f.id === folderId)?.name || "folder"
          : "Uncategorized";

        if (failedCount > 0) {
          addNotification(
            `Moved ${movedIds.size} ${
              movedIds.size === 1 ? "story" : "stories"
            } to ${folderName}, ${failedCount} failed`,
            "warning"
          );
        } else {
          addNotification(
            `${movedIds.size} ${
              movedIds.size === 1 ? "story" : "stories"
            } moved to ${folderName}`,
            "success"
          );
        }
      } catch (error: any) {
        console.error("Error moving stories:", error);
        addNotification(
          `Failed to move some stories: ${error.message}`,
          "failure"
        );
      }
    };

    moveStories();
  };

  // Filter and sort stories
  const filteredStories = stories
    .filter((story) => {
      // Folder filter
      if (selectedFolder !== null) {
        if (selectedFolder === "uncategorized") {
          if (story.folder_id !== null) return false;
        } else if (story.folder_id !== selectedFolder) {
          return false;
        }
      }
      // Search filter
      if (
        storySearch &&
        !story.story_name.toLowerCase().includes(storySearch.toLowerCase())
      ) {
        return false;
      }
      // Completion filter
      if (storyFilter === "completed" && !story.is_completed) return false;
      if (storyFilter === "inProgress" && story.is_completed) return false;
      return true;
    })
    .sort((a, b) => {
      switch (storySortBy) {
        case "updated":
          return (
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          );
        case "created":
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        case "name":
          return a.story_name.localeCompare(b.story_name);
        case "chapter":
          const chapterA = a.story_data?.currentChapter ?? 0;
          const chapterB = b.story_data?.currentChapter ?? 0;
          return chapterB - chapterA;
        default:
          return 0;
      }
    });

  // Filter local stories
  const filteredLocalStories = localStories
    .filter((story) => {
      // Folder filter
      if (selectedFolder !== null) {
        if (selectedFolder === "uncategorized") {
          if (story.folder_id !== null) return false;
        } else if (story.folder_id !== selectedFolder) {
          return false;
        }
      }
      // Search filter
      if (
        storySearch &&
        !story.title.toLowerCase().includes(storySearch.toLowerCase())
      ) {
        return false;
      }
      // Local stories are always "in progress"
      if (storyFilter === "completed") return false;
      return true;
    })
    .sort((a, b) => {
      switch (storySortBy) {
        case "updated":
        case "created":
          return (
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
        case "name":
          return a.title.localeCompare(b.title);
        case "chapter":
          const chapterA = a.storyData?.currentChapter ?? 0;
          const chapterB = b.storyData?.currentChapter ?? 0;
          return chapterB - chapterA;
        default:
          return 0;
      }
    });

  // Filter and sort adventures
  const filteredAdventures = adventures
    .filter((adventure) => {
      // Search filter
      if (
        adventureSearch &&
        !adventure.title
          .toLowerCase()
          .includes(adventureSearch.toLowerCase()) &&
        !adventure.description
          .toLowerCase()
          .includes(adventureSearch.toLowerCase())
      ) {
        return false;
      }
      // Published filter
      if (adventureFilter === "published" && !adventure.isPublished)
        return false;
      if (adventureFilter === "draft" && adventure.isPublished) return false;
      return true;
    })
    .sort((a, b) => {
      switch (adventureSortBy) {
        case "updated":
          return (
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
        case "created":
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        case "title":
          return a.title.localeCompare(b.title);
        case "rating":
          return (b.rating || 0) - (a.rating || 0);
        case "plays":
          return (b.playCount || 0) - (a.playCount || 0);
        default:
          return 0;
      }
    });

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-400"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 text-white">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 bg-blue-950/80 backdrop-blur-xl border-b border-blue-800/30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <DynamicIcon name="ArrowLeft" className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold">Library</h1>
          </div>
          <div className="flex items-center gap-2">
            {view === "stories" &&
              (filteredStories.length > 0 ||
                filteredLocalStories.length > 0) && (
                <button
                  onClick={toggleSelectionMode}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectionMode
                      ? "bg-purple-600 text-white"
                      : "hover:bg-white/10"
                  }`}
                >
                  {selectionMode ? "Done" : "Select"}
                </button>
              )}
            <button
              onClick={() =>
                router.push(view === "stories" ? "/explorer" : "/creator")
              }
              className="flex items-center gap-2 px-4 py-2 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-xl transition-colors text-sm font-medium"
            >
              <DynamicIcon name="Plus" className="w-4 h-4" />
              <span className="hidden sm:inline">
                {view === "stories" ? "New Story" : "New Adventure"}
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Tab Pills */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setView("stories")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              view === "stories"
                ? "bg-linear-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/25"
                : "bg-blue-900/50 text-blue-200/70 hover:bg-blue-800/50 hover:text-white"
            }`}
          >
            <DynamicIcon name="Book" className="w-4 h-4 inline-block mr-2" />
            Stories ({stories.length + localStories.length})
          </button>
          <button
            onClick={() => setView("adventures")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              view === "adventures"
                ? "bg-linear-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/25"
                : "bg-blue-900/50 text-blue-200/70 hover:bg-blue-800/50 hover:text-white"
            }`}
          >
            <DynamicIcon
              name="Gamepad2"
              className="w-4 h-4 inline-block mr-2"
            />
            Adventures ({adventures.length + localAdventures.length})
          </button>
        </div>

        {/* Content */}
        {loading ? (
          view === "stories" ? (
            <LibrarySkeleton />
          ) : (
            <AdventureGridSkeleton count={6} />
          )
        ) : view === "stories" ? (
          <div className="space-y-4">
            {/* Encryption Migration Banner */}
            <EncryptionMigration
              stories={stories}
              onMigrationComplete={fetchLibraryData}
            />

            {/* Search + Folder Dropdown + Sort */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <DynamicIcon
                  name="Search"
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400/50"
                />
                <input
                  type="text"
                  value={storySearch}
                  onChange={(e) => setStorySearch(e.target.value)}
                  placeholder="Search stories..."
                  className="w-full pl-10 pr-4 py-2.5 bg-blue-900/50 border border-blue-700/50 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:border-purple-500/50 focus:bg-blue-900/70 transition-all"
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={selectedFolder || "all"}
                  onChange={(e) =>
                    setSelectedFolder(
                      e.target.value === "all" ? null : e.target.value
                    )
                  }
                  className="px-4 py-2.5 bg-blue-900/50 border border-blue-700/50 rounded-xl text-white focus:outline-none focus:border-purple-500/50 transition-all"
                >
                  <option value="all">All Stories</option>
                  <option value="uncategorized">Uncategorized</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
                <select
                  value={storySortBy}
                  onChange={(e) =>
                    setStorySortBy(e.target.value as StorySortBy)
                  }
                  className="px-4 py-2.5 bg-blue-900/50 border border-blue-700/50 rounded-xl text-white focus:outline-none focus:border-purple-500/50 transition-all"
                >
                  <option value="updated">Recent</option>
                  <option value="created">Created</option>
                  <option value="name">A-Z</option>
                  <option value="chapter">Progress</option>
                </select>
              </div>
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
                <DynamicIcon name="Book" className="w-3.5 h-3.5" />
                All ({stories.length + localStories.length})
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
                {stories.filter((s) => !s.folder_id).length +
                  localStories.filter((s) => !s.folder_id).length}
                )
              </button>
              {folders.map((folder) => (
                <button
                  key={folder.id}
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
                  {stories.filter((s) => s.folder_id === folder.id).length +
                    localStories.filter((s) => s.folder_id === folder.id)
                      .length}
                  )
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

            {/* Filter Pills */}
            <div className="flex gap-2">
              {["all", "inProgress", "completed"].map((filter) => (
                <button
                  key={filter}
                  onClick={() =>
                    setStoryFilter(filter as "all" | "completed" | "inProgress")
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    storyFilter === filter
                      ? "bg-purple-600 text-white"
                      : "bg-blue-900/30 text-blue-200/60 hover:bg-blue-800/40"
                  }`}
                >
                  {filter === "all"
                    ? "All"
                    : filter === "inProgress"
                    ? "In Progress"
                    : "Completed"}
                </button>
              ))}
            </div>

            {/* Selection Actions Bar */}
            {selectionMode && selectedStories.size > 0 && (
              <div className="flex items-center gap-3 p-3 bg-purple-900/30 border border-purple-700/30 rounded-xl">
                <span className="text-sm font-medium">
                  {selectedStories.size} selected
                </span>
                <div className="flex-1" />
                <button
                  onClick={selectAllStories}
                  className="px-3 py-1.5 bg-blue-900/50 hover:bg-blue-800/50 text-sm rounded-lg transition-colors"
                >
                  Select All
                </button>
                <div className="relative">
                  <button
                    onClick={() =>
                      setShowMassMoveDropdown(!showMassMoveDropdown)
                    }
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
                  onClick={deselectAllStories}
                  className="px-3 py-1.5 bg-blue-900/50 hover:bg-blue-800/50 text-sm rounded-lg transition-colors"
                >
                  Clear
                </button>
              </div>
            )}

            {/* Stories List */}
            {filteredStories.length === 0 &&
            filteredLocalStories.length === 0 ? (
              <div className="bg-blue-950/50 rounded-2xl p-12 text-center border border-blue-800/30">
                <DynamicIcon
                  name="BookOpen"
                  className="w-16 h-16 text-blue-400/30 mx-auto mb-4"
                />
                <h3 className="text-xl font-bold mb-2">
                  {stories.length === 0
                    ? "No Stories Yet"
                    : "No Stories Match Filters"}
                </h3>
                <p className="text-blue-200/60 mb-6">
                  {stories.length === 0
                    ? "Start an adventure from the Explorer to create your first story!"
                    : "Try adjusting your search or filters."}
                </p>
                {stories.length === 0 && (
                  <button
                    onClick={() => router.push("/explorer")}
                    className="px-6 py-3 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 font-semibold rounded-xl transition-colors"
                  >
                    Explore Adventures
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Cloud Stories */}
                {filteredStories.map((story) => {
                  const chapter = story.story_data?.currentChapter ?? 0;
                  const totalChapters = story.story_data?.chapters?.length ?? 1;
                  const progress = Math.min(
                    100,
                    Math.round((chapter / Math.max(totalChapters, 1)) * 100)
                  );
                  const timeSinceUpdate = getRelativeTime(story.updated_at);

                  return (
                    <div
                      key={story.id}
                      onClick={() =>
                        selectionMode
                          ? toggleStorySelection(story.id)
                          : router.push(`/story?storyId=${story.id}`)
                      }
                      className={`group relative p-4 rounded-xl border transition-all cursor-pointer ${
                        selectionMode && selectedStories.has(story.id)
                          ? "bg-purple-900/30 border-purple-500"
                          : "bg-blue-950/50 border-blue-800/30 hover:bg-blue-900/50 hover:border-blue-700/50"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {selectionMode && (
                          <div
                            className={`mt-1 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors shrink-0 ${
                              selectedStories.has(story.id)
                                ? "bg-purple-600 border-purple-600"
                                : "border-blue-600"
                            }`}
                          >
                            {selectedStories.has(story.id) && (
                              <DynamicIcon name="Check" className="w-3 h-3" />
                            )}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold truncate">
                              {story.story_name}
                            </h3>
                            {story.is_completed && (
                              <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">
                                ?
                              </span>
                            )}
                            {isEncrypted(story.story_data) && (
                              <DynamicIcon
                                name="Lock"
                                className="w-3 h-3 text-emerald-400"
                              />
                            )}
                            {story.is_public && (
                              <DynamicIcon
                                name="Globe"
                                className="w-3 h-3 text-blue-400"
                              />
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-blue-200/50 mb-2">
                            <span>{timeSinceUpdate}</span>
                            <span>Ch. {chapter + 1}</span>
                          </div>
                          {/* Progress Bar */}
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-blue-900/50 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  story.is_completed
                                    ? "bg-green-500"
                                    : "bg-linear-to-r from-purple-500 to-blue-500"
                                }`}
                                style={{
                                  width: `${
                                    story.is_completed ? 100 : progress
                                  }%`,
                                }}
                              />
                            </div>
                            <span className="text-xs text-blue-200/40">
                              {story.is_completed ? "100%" : `${progress}%`}
                            </span>
                          </div>
                        </div>
                        {!selectionMode && (
                          <div
                            className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
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
                              {deleting === story.id ? (
                                <DynamicIcon
                                  name="Loader2"
                                  className="w-4 h-4 animate-spin"
                                />
                              ) : (
                                <DynamicIcon
                                  name="Trash2"
                                  className="w-4 h-4"
                                />
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Local Stories */}
                {filteredLocalStories.map((story) => {
                  const chapter = story.storyData?.currentChapter ?? 0;
                  const timeSinceUpdate = getRelativeTime(
                    String(story.updatedAt)
                  );

                  return (
                    <div
                      key={story.id}
                      onClick={() =>
                        selectionMode
                          ? toggleStorySelection(story.id)
                          : router.push(`/story?storyId=${story.id}`)
                      }
                      className={`group relative p-4 rounded-xl border transition-all cursor-pointer ${
                        selectionMode && selectedStories.has(story.id)
                          ? "bg-purple-900/30 border-purple-500"
                          : "bg-blue-950/50 border-blue-800/30 hover:bg-blue-900/50 hover:border-blue-700/50"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {selectionMode && (
                          <div
                            className={`mt-1 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors shrink-0 ${
                              selectedStories.has(story.id)
                                ? "bg-purple-600 border-purple-600"
                                : "border-blue-600"
                            }`}
                          >
                            {selectedStories.has(story.id) && (
                              <DynamicIcon name="Check" className="w-3 h-3" />
                            )}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold truncate">
                              {story.title}
                            </h3>
                            <span className="px-1.5 py-0.5 bg-gray-500/20 text-gray-400 text-xs rounded flex items-center gap-1">
                              <DynamicIcon
                                name="HardDrive"
                                className="w-3 h-3"
                              />{" "}
                              Local
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-blue-200/50 mb-2">
                            <span>{timeSinceUpdate}</span>
                            <span>Ch. {chapter + 1}</span>
                          </div>
                          {/* Progress Bar */}
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-blue-900/50 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gray-500 rounded-full"
                                style={{ width: "10%" }}
                              />
                            </div>
                            <span className="text-xs text-blue-200/40">
                              New
                            </span>
                          </div>
                        </div>
                        {!selectionMode && (
                          <div
                            className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => setMovingStory(story.id)}
                              className="p-1.5 hover:bg-blue-800/50 rounded-lg transition-colors"
                              title="Move"
                            >
                              <DynamicIcon name="Folder" className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteStory(story.id, true)}
                              disabled={deleting === story.id}
                              className="p-1.5 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                              title="Delete"
                            >
                              {deleting === story.id ? (
                                <DynamicIcon
                                  name="Loader2"
                                  className="w-4 h-4 animate-spin"
                                />
                              ) : (
                                <DynamicIcon
                                  name="Trash2"
                                  className="w-4 h-4"
                                />
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Search + Filter Row */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <DynamicIcon
                  name="Search"
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400/50"
                />
                <input
                  type="text"
                  value={adventureSearch}
                  onChange={(e) => setAdventureSearch(e.target.value)}
                  placeholder="Search adventures..."
                  className="w-full pl-10 pr-4 py-2.5 bg-blue-900/50 border border-blue-700/50 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:border-purple-500/50 focus:bg-blue-900/70 transition-all"
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={adventureFilter}
                  onChange={(e) =>
                    setAdventureFilter(
                      e.target.value as "all" | "published" | "draft"
                    )
                  }
                  className="px-4 py-2.5 bg-blue-900/50 border border-blue-700/50 rounded-xl text-white focus:outline-none focus:border-purple-500/50 transition-all"
                >
                  <option value="all">All</option>
                  <option value="published">Published</option>
                  <option value="draft">Drafts</option>
                </select>
                <select
                  value={adventureSortBy}
                  onChange={(e) =>
                    setAdventureSortBy(e.target.value as AdventureSortBy)
                  }
                  className="px-4 py-2.5 bg-blue-900/50 border border-blue-700/50 rounded-xl text-white focus:outline-none focus:border-purple-500/50 transition-all"
                >
                  <option value="updated">Recent</option>
                  <option value="created">Created</option>
                  <option value="title">A-Z</option>
                  <option value="rating">Rating</option>
                  <option value="plays">Plays</option>
                </select>
              </div>
            </div>

            {/* Adventures Grid */}
            {filteredAdventures.length === 0 && localAdventures.length === 0 ? (
              <div className="bg-blue-950/50 rounded-2xl p-12 text-center border border-blue-800/30">
                <DynamicIcon
                  name="Gamepad2"
                  className="w-16 h-16 text-blue-400/30 mx-auto mb-4"
                />
                <h3 className="text-xl font-bold mb-2">
                  {adventures.length === 0 && localAdventures.length === 0
                    ? "No Adventures Yet"
                    : "No Adventures Match Filters"}
                </h3>
                <p className="text-blue-200/60 mb-6">
                  {adventures.length === 0 && localAdventures.length === 0
                    ? "Create your first adventure and share it with the community!"
                    : "Try adjusting your search or filters."}
                </p>
                {adventures.length === 0 && localAdventures.length === 0 && (
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
                {/* Cloud Adventures */}
                {filteredAdventures.map((adventure) => (
                  <div
                    key={adventure.id}
                    className="group relative bg-blue-950/50 rounded-xl overflow-hidden border border-blue-800/30 hover:border-blue-700/50 transition-all cursor-pointer"
                    onClick={() => router.push(`/explorer/${adventure.id}`)}
                  >
                    {/* Thumbnail */}
                    <div className="relative h-32">
                      {adventure.thumbnailUrl ? (
                        <div
                          className="absolute inset-0 bg-cover bg-center"
                          style={{
                            backgroundImage: `url(${adventure.thumbnailUrl})`,
                          }}
                        />
                      ) : (
                        <div className="absolute inset-0 bg-linear-to-br from-purple-600 via-pink-600 to-blue-600" />
                      )}
                      <div className="absolute inset-0 bg-linear-to-t from-gray-900/90 via-transparent to-transparent" />

                      {/* Badges */}
                      <div className="absolute top-2 right-2 flex gap-1">
                        {adventure.isPublished && (
                          <span className="px-1.5 py-0.5 bg-green-500/20 backdrop-blur text-green-400 text-xs rounded">
                            Published
                          </span>
                        )}
                        {adventure.isFeatured && (
                          <span className="px-1.5 py-0.5 bg-yellow-500/20 backdrop-blur text-yellow-400 text-xs rounded flex items-center gap-0.5">
                            <DynamicIcon
                              name="Star"
                              className="w-3 h-3 fill-current"
                            />{" "}
                            Featured
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-3">
                      <h3 className="font-semibold truncate mb-1">
                        {adventure.title}
                      </h3>
                      <p className="text-xs text-blue-200/50 line-clamp-2 mb-2">
                        {adventure.shortDescription}
                      </p>

                      {/* Tags */}
                      <div className="flex flex-wrap gap-1 mb-2">
                        {adventure.tags.slice(0, 2).map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 bg-purple-500/20 text-purple-300 text-xs rounded"
                          >
                            {tag}
                          </span>
                        ))}
                        {adventure.tags.length > 2 && (
                          <span className="px-1.5 py-0.5 bg-blue-900/50 text-blue-300/50 text-xs rounded">
                            +{adventure.tags.length - 2}
                          </span>
                        )}
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-3 text-xs text-blue-200/40 mb-3">
                        <span className="flex items-center gap-1">
                          <DynamicIcon
                            name="Star"
                            className="w-3 h-3 text-yellow-500"
                          />
                          {adventure.rating?.toFixed(1) || "-"}
                        </span>
                        <span className="flex items-center gap-1">
                          <DynamicIcon name="Play" className="w-3 h-3" />
                          {adventure.playCount || 0}
                        </span>
                      </div>

                      {/* Actions */}
                      <div
                        className="flex gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() =>
                            router.push(`/creator?edit=${adventure.id}`)
                          }
                          className="flex-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-sm rounded-lg transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteAdventure(adventure.id)}
                          disabled={deleting === adventure.id}
                          className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg transition-colors"
                        >
                          {deleting === adventure.id ? (
                            <DynamicIcon
                              name="Loader2"
                              className="w-4 h-4 animate-spin"
                            />
                          ) : (
                            <DynamicIcon name="Trash2" className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Local Adventures */}
                {localAdventures.map((adventure) => (
                  <div
                    key={adventure.id}
                    className="group relative bg-blue-950/50 rounded-xl overflow-hidden border border-blue-800/30 hover:border-blue-700/50 transition-all cursor-pointer"
                    onClick={() => router.push(`/explorer/${adventure.id}`)}
                  >
                    {/* Thumbnail */}
                    <div className="relative h-32">
                      {adventure.adventureData.thumbnailUrl ? (
                        <div
                          className="absolute inset-0 bg-cover bg-center"
                          style={{
                            backgroundImage: `url(${adventure.adventureData.thumbnailUrl})`,
                          }}
                        />
                      ) : (
                        <div className="absolute inset-0 bg-linear-to-br from-gray-600 via-gray-700 to-gray-800" />
                      )}
                      <div className="absolute inset-0 bg-linear-to-t from-gray-900/90 via-transparent to-transparent" />

                      {/* Badge */}
                      <div className="absolute top-2 right-2">
                        <span className="px-1.5 py-0.5 bg-gray-500/20 backdrop-blur text-gray-300 text-xs rounded flex items-center gap-1">
                          <DynamicIcon name="HardDrive" className="w-3 h-3" />{" "}
                          Local
                        </span>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-3">
                      <h3 className="font-semibold truncate mb-1">
                        {adventure.title}
                      </h3>
                      <p className="text-xs text-blue-200/50 line-clamp-2 mb-2">
                        {adventure.description}
                      </p>

                      {/* Tags */}
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

                      {/* Updated */}
                      <div className="text-xs text-blue-200/40 mb-3">
                        {getRelativeTime(adventure.updatedAt)}
                      </div>

                      {/* Actions */}
                      <div
                        className="flex gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() =>
                            router.push(`/creator?edit=${adventure.id}`)
                          }
                          className="flex-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-sm rounded-lg transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() =>
                            handleDeleteAdventure(adventure.id, true)
                          }
                          disabled={deleting === adventure.id}
                          className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg transition-colors"
                        >
                          {deleting === adventure.id ? (
                            <DynamicIcon
                              name="Loader2"
                              className="w-4 h-4 animate-spin"
                            />
                          ) : (
                            <DynamicIcon name="Trash2" className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Folder Management Dialogs */}
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
                <IconPicker
                  label="Icon"
                  value={newFolderIcon}
                  onChange={setNewFolderIcon}
                />
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
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    editingFolder &&
                    handleUpdateFolder(editingFolder.id, {
                      name: newFolderName,
                      icon: newFolderIcon,
                      color: newFolderColor,
                    })
                  }
                  className="w-full px-3 py-2 bg-blue-900/50 border border-blue-700/50 rounded-lg text-white placeholder-blue-300/50 focus:outline-none focus:border-purple-500"
                  placeholder="My Folder"
                  autoFocus
                />
              </div>
              <div>
                <IconPicker
                  label="Icon"
                  value={newFolderIcon}
                  onChange={setNewFolderIcon}
                />
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

      {movingStory && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-blue-950 border border-blue-800/50 rounded-xl p-6 max-w-md w-full">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Move to Folder
            </h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              <button
                onClick={() => {
                  if (!movingStory) return;
                  // Check if it's a local story (starts with 'local_')
                  const isLocal = movingStory.startsWith("local_");
                  if (isLocal) {
                    handleMoveLocalStory(movingStory, null);
                  } else {
                    handleMoveStory(movingStory, null);
                  }
                }}
                className="w-full p-3 text-left rounded-lg border-2 border-gray-300 dark:border-gray-600 hover:border-purple-500 dark:hover:border-purple-400 transition-colors"
              >
                <span className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <DynamicIcon name="FolderOpen" className="w-5 h-5" />{" "}
                  Uncategorized
                </span>
              </button>
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => {
                    if (!movingStory) return;
                    // Check if it's a local story (starts with 'local_')
                    const isLocal = movingStory.startsWith("local_");
                    if (isLocal) {
                      handleMoveLocalStory(movingStory, folder.id);
                    } else {
                      handleMoveStory(movingStory, folder.id);
                    }
                  }}
                  className="w-full p-3 text-left rounded-lg border-2 hover:border-purple-500 dark:hover:border-purple-400 transition-colors"
                  style={{
                    borderLeftColor: folder.color,
                    borderLeftWidth: "4px",
                  }}
                >
                  <span className="text-gray-900 dark:text-white flex items-center gap-2">
                    <DynamicIcon name={folder.icon} className="w-5 h-5" />{" "}
                    {folder.name}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setMovingStory(null)}
              className="w-full mt-4 px-4 py-2 bg-gray-200 dark:bg-gray-900 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold rounded-lg transition-colors"
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
