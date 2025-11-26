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
      <div className="min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 dark:border-purple-400"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900 pt-16">
      <div className="max-w-7xl mx-auto p-3 sm:p-6">
        {/* Header */}
        <div className="mb-5">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-3">
            <DynamicIcon name="BookOpen" className="w-8 h-8" />
            My Library
          </h1>
          <p className="text-gray-700 dark:text-gray-300">
            Your stories and adventures all in one place
          </p>
        </div>

        {/* View Toggle */}
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => setView("stories")}
            className={`px-4 py-2 font-semibold rounded-lg transition-all shadow-md ${
              view === "stories"
                ? "bg-purple-600 text-white"
                : "bg-white dark:bg-blue-950 text-gray-900 dark:text-white border-2 border-gray-300 dark:border-gray-600 hover:border-purple-500 dark:hover:border-purple-400"
            }`}
          >
            <DynamicIcon name="Book" className="w-5 h-5 inline-block mr-2" />
            My Stories ({filteredStories.length + filteredLocalStories.length}
            {stories.length + localStories.length !==
            filteredStories.length + filteredLocalStories.length
              ? ` / ${stories.length + localStories.length}`
              : ""}
            )
          </button>
          <button
            onClick={() => setView("adventures")}
            className={`px-4 py-2 font-semibold rounded-lg transition-all shadow-md ${
              view === "adventures"
                ? "bg-purple-600 text-white"
                : "bg-white dark:bg-blue-950 text-gray-900 dark:text-white border-2 border-gray-300 dark:border-gray-600 hover:border-purple-500 dark:hover:border-purple-400"
            }`}
          >
            <DynamicIcon
              name="Gamepad2"
              className="w-5 h-5 inline-block mr-2"
            />
            My Adventures ({filteredAdventures.length + localAdventures.length}
            {adventures.length + localAdventures.length !==
            filteredAdventures.length + localAdventures.length
              ? ` / ${adventures.length + localAdventures.length}`
              : ""}
            )
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
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Folders Sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-white dark:bg-blue-950 rounded-xl shadow-lg p-3 border border-gray-200 dark:border-gray-700 sticky top-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <DynamicIcon name="Folder" className="w-5 h-5" /> Folders
                  </h3>
                  <button
                    onClick={() => setShowNewFolderDialog(true)}
                    className="px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-colors"
                  >
                    <DynamicIcon name="Plus" className="w-4 h-4" />
                  </button>
                </div>

                {/* All Stories */}
                <button
                  onClick={() => setSelectedFolder(null)}
                  className={`w-full text-left px-3 py-2 rounded-lg mb-2 transition-colors flex items-center gap-2 ${
                    selectedFolder === null
                      ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-semibold"
                      : "hover:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                  }`}
                >
                  <DynamicIcon name="Book" className="w-4 h-4" />
                  All Stories ({stories.length + localStories.length})
                </button>

                {/* Uncategorized */}
                <button
                  onClick={() => setSelectedFolder("uncategorized")}
                  className={`w-full text-left px-3 py-2 rounded-lg mb-2 transition-colors flex items-center gap-2 ${
                    selectedFolder === "uncategorized"
                      ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-semibold"
                      : "hover:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                  }`}
                >
                  <DynamicIcon name="FileText" className="w-4 h-4" />
                  Uncategorized (
                  {stories.filter((s) => !s.folder_id).length +
                    localStories.filter((s) => !s.folder_id).length}
                  )
                </button>

                {/* User Folders */}
                {folders.map((folder) => (
                  <div key={folder.id} className="group relative">
                    <button
                      onClick={() => setSelectedFolder(folder.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg mb-2 transition-colors flex items-center gap-2 ${
                        selectedFolder === folder.id
                          ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-semibold"
                          : "hover:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                      }`}
                      style={{ borderLeft: `4px solid ${folder.color}` }}
                    >
                      <DynamicIcon name={folder.icon} className="w-4 h-4" />
                      {folder.name} (
                      {stories.filter((s) => s.folder_id === folder.id).length +
                        localStories.filter((s) => s.folder_id === folder.id)
                          .length}
                      )
                    </button>
                    <div className="absolute right-2 top-2 hidden group-hover:flex gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingFolder(folder);
                        }}
                        className="p-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs"
                      >
                        <DynamicIcon name="Edit2" className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFolder(folder.id);
                        }}
                        className="p-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs"
                      >
                        <DynamicIcon name="Trash2" className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Stories Content */}
            <div className="lg:col-span-3">
              {/* Encryption Migration Banner */}
              <EncryptionMigration
                stories={stories}
                onMigrationComplete={fetchLibraryData}
              />

              {/* Stories Filters */}
              <div className="bg-white dark:bg-blue-950 rounded-xl shadow-lg p-4 mb-4 border border-gray-200 dark:border-gray-700">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Search */}
                  <div>
                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                      <DynamicIcon name="Search" className="w-4 h-4" />
                      Search Stories
                    </label>
                    <input
                      type="text"
                      value={storySearch}
                      onChange={(e) => setStorySearch(e.target.value)}
                      placeholder="Search by name..."
                      className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:border-purple-500 dark:focus:border-purple-400 focus:outline-none text-gray-900 dark:text-white"
                    />
                  </div>

                  {/* Filter */}
                  <div>
                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                      <DynamicIcon
                        name="SlidersHorizontal"
                        className="w-4 h-4"
                      />
                      Filter
                    </label>
                    <select
                      value={storyFilter}
                      onChange={(e) =>
                        setStoryFilter(
                          e.target.value as "all" | "completed" | "inProgress"
                        )
                      }
                      className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:border-purple-500 dark:focus:border-purple-400 focus:outline-none text-gray-900 dark:text-white"
                    >
                      <option value="all">All Stories</option>
                      <option value="inProgress">In Progress</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>

                  {/* Sort */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      <DynamicIcon
                        name="RefreshCw"
                        className="inline-block w-4 h-4 mr-1"
                      />
                      Sort By
                    </label>
                    <select
                      value={storySortBy}
                      onChange={(e) =>
                        setStorySortBy(e.target.value as StorySortBy)
                      }
                      className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:border-purple-500 dark:focus:border-purple-400 focus:outline-none text-gray-900 dark:text-white"
                    >
                      <option value="updated">Last Updated</option>
                      <option value="created">Date Created</option>
                      <option value="name">Name (A-Z)</option>
                      <option value="chapter">Progress</option>
                    </select>
                  </div>
                </div>

                {/* Clear Filters */}
                {(storySearch ||
                  storyFilter !== "all" ||
                  storySortBy !== "updated") && (
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={() => {
                        setStorySearch("");
                        setStoryFilter("all");
                        setStorySortBy("updated");
                      }}
                      className="px-4 py-2 bg-gray-200 dark:bg-gray-900 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors text-sm"
                    >
                      Clear Filters
                    </button>
                  </div>
                )}
              </div>

              {/* Mass Operations Toolbar */}
              {(filteredStories.length > 0 ||
                filteredLocalStories.length > 0) && (
                <div className="bg-white dark:bg-blue-950 rounded-xl shadow-lg p-3 mb-4 border border-gray-200 dark:border-gray-700">
                  {!selectionMode ? (
                    <button
                      onClick={toggleSelectionMode}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
                    >
                      <DynamicIcon name="CheckSquare" className="w-4 h-4" />
                      Select Stories
                    </button>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        {selectedStories.size} selected
                      </span>
                      <button
                        onClick={selectAllStories}
                        className="px-3 py-1.5 bg-gray-200 dark:bg-gray-900 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white text-sm font-semibold rounded-lg transition-colors"
                      >
                        Select All
                      </button>
                      <button
                        onClick={deselectAllStories}
                        className="px-3 py-1.5 bg-gray-200 dark:bg-gray-900 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white text-sm font-semibold rounded-lg transition-colors"
                      >
                        Deselect All
                      </button>
                      {selectedStories.size > 0 && (
                        <>
                          <div className="relative">
                            <button
                              onClick={() =>
                                setShowMassMoveDropdown(!showMassMoveDropdown)
                              }
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
                            >
                              <DynamicIcon
                                name="FolderOpen"
                                className="w-4 h-4"
                              />
                              Move to Folder
                            </button>
                            {showMassMoveDropdown && (
                              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-blue-950 border-2 border-gray-300 dark:border-gray-600 rounded-lg shadow-xl p-2 min-w-[200px] z-50">
                                <button
                                  onClick={() => {
                                    handleMassMove(null);
                                    setShowMassMoveDropdown(false);
                                  }}
                                  className="w-full text-left px-3 py-2 hover:bg-gray-800 dark:hover:bg-gray-700 rounded-lg text-sm text-gray-900 dark:text-white"
                                >
                                  <DynamicIcon
                                    name="FileText"
                                    className="w-4 h-4 inline mr-2"
                                  />
                                  Uncategorized
                                </button>
                                {folders.map((folder) => (
                                  <button
                                    key={folder.id}
                                    onClick={() => {
                                      handleMassMove(folder.id);
                                      setShowMassMoveDropdown(false);
                                    }}
                                    className="w-full text-left px-3 py-2 hover:bg-gray-800 dark:hover:bg-gray-700 rounded-lg text-sm text-gray-900 dark:text-white"
                                    style={{
                                      borderLeft: `4px solid ${folder.color}`,
                                    }}
                                  >
                                    <DynamicIcon
                                      name={folder.icon}
                                      className="w-4 h-4 inline mr-2"
                                    />
                                    {folder.name}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={handleMassDelete}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
                          >
                            <DynamicIcon name="Trash2" className="w-4 h-4" />
                            Delete Selected
                          </button>
                        </>
                      )}
                      <button
                        onClick={toggleSelectionMode}
                        className="ml-auto px-3 py-1.5 bg-gray-200 dark:bg-gray-900 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white text-sm font-semibold rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Stories List */}
              <div className="space-y-4">
                {filteredStories.length === 0 &&
                filteredLocalStories.length === 0 ? (
                  <div className="bg-white dark:bg-blue-950 rounded-2xl shadow-xl p-12 text-center border border-gray-200 dark:border-gray-700">
                    <div className="flex justify-center mb-4">
                      <DynamicIcon
                        name="BookOpen"
                        className="w-16 h-16 text-gray-400"
                      />
                    </div>
                    <h3 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
                      {stories.length === 0
                        ? "No Stories Yet"
                        : "No Stories Match Filters"}
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                      {stories.length === 0
                        ? "Start an adventure from the Explorer to create your first story!"
                        : "Try adjusting your search or filters to find more stories."}
                    </p>
                    {stories.length === 0 && (
                      <button
                        onClick={() => router.push("/explorer")}
                        className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors shadow-md"
                      >
                        Explore Adventures
                      </button>
                    )}
                  </div>
                ) : (
                  filteredStories.map((story) => (
                    <div
                      key={story.id}
                      onClick={() =>
                        selectionMode
                          ? toggleStorySelection(story.id)
                          : router.push(`/story?storyId=${story.id}`)
                      }
                      className={`rounded-xl shadow-md overflow-hidden border-2 transition-all duration-150 cursor-pointer ${
                        selectionMode
                          ? selectedStories.has(story.id)
                            ? "bg-purple-50 dark:bg-purple-900/20 border-purple-500 dark:border-purple-400 shadow-purple-200 dark:shadow-purple-900"
                            : "bg-white dark:bg-blue-950 border-gray-300 dark:border-gray-600 hover:border-purple-400 dark:hover:border-purple-500 hover:shadow-lg hover:-translate-y-0.5"
                          : "bg-white dark:bg-blue-950 border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-lg hover:-translate-y-0.5"
                      } active:scale-[0.98]`}
                    >
                      <div className="p-4">
                        <div className="flex flex-col items-start justify-between gap-2">
                          <div className="flex-1 min-w-0 w-full">
                            <div className="flex items-center gap-3 mb-2">
                              {selectionMode && (
                                <div
                                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                    selectedStories.has(story.id)
                                      ? "bg-purple-600 border-purple-600"
                                      : "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-500"
                                  }`}
                                >
                                  {selectedStories.has(story.id) && (
                                    <DynamicIcon
                                      name="Check"
                                      className="w-3 h-3 text-white"
                                    />
                                  )}
                                </div>
                              )}
                              <h3 className="text-xl font-bold text-gray-900 dark:text-white truncate">
                                {story.story_name}
                              </h3>
                              {story.is_completed && (
                                <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm font-semibold rounded-full flex items-center gap-1">
                                  <DynamicIcon
                                    name="Check"
                                    className="w-3 h-3"
                                  />{" "}
                                  Completed
                                </span>
                              )}
                              {story.is_public && (
                                <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm font-semibold rounded-full flex items-center gap-1">
                                  <DynamicIcon
                                    name="Globe"
                                    className="w-3 h-3"
                                  />{" "}
                                  Public
                                </span>
                              )}
                              {isEncrypted(story.story_data) && (
                                <span
                                  className="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-sm font-semibold rounded-full flex items-center gap-1"
                                  title="This story is encrypted and private"
                                >
                                  <DynamicIcon
                                    name="Lock"
                                    className="w-3 h-3"
                                  />{" "}
                                  Encrypted
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400 mb-3">
                              <span>
                                Created:{" "}
                                {new Date(
                                  story.created_at
                                ).toLocaleDateString()}
                              </span>
                              <span>
                                Updated:{" "}
                                {new Date(
                                  story.updated_at
                                ).toLocaleDateString()}
                              </span>
                              {story.story_data?.currentChapter !==
                                undefined && (
                                <span>
                                  Chapter: {story.story_data.currentChapter + 1}
                                </span>
                              )}
                            </div>
                          </div>
                          {!selectionMode && (
                            <div
                              className="flex gap-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => setMovingStory(story.id)}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-md flex items-center justify-center"
                                title="Move to folder"
                              >
                                <DynamicIcon
                                  name="Folder"
                                  className="w-5 h-5"
                                />
                              </button>
                              <button
                                onClick={() => handleDeleteStory(story.id)}
                                disabled={deleting === story.id}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                              >
                                {deleting === story.id ? (
                                  <DynamicIcon
                                    name="Loader2"
                                    className="w-5 h-5 animate-spin"
                                  />
                                ) : (
                                  <DynamicIcon
                                    name="Trash2"
                                    className="w-5 h-5"
                                  />
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}

                {/* Local/Offline Stories */}
                {filteredLocalStories.map((story) => (
                  <div
                    key={story.id}
                    onClick={() =>
                      selectionMode
                        ? toggleStorySelection(story.id)
                        : router.push(`/story?storyId=${story.id}`)
                    }
                    className={`rounded-xl shadow-md overflow-hidden border-2 transition-all duration-150 cursor-pointer ${
                      selectionMode
                        ? selectedStories.has(story.id)
                          ? "bg-purple-50 dark:bg-purple-900/20 border-purple-500 dark:border-purple-400 shadow-purple-200 dark:shadow-purple-900"
                          : "bg-white dark:bg-blue-950 border-gray-300 dark:border-gray-600 hover:border-purple-400 dark:hover:border-purple-500 hover:shadow-lg hover:-translate-y-0.5"
                        : "bg-white dark:bg-blue-950 border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-lg hover:-translate-y-0.5"
                    } active:scale-[0.98]`}
                  >
                    <div className="p-4">
                      <div className="flex flex-col items-start justify-between gap-2">
                        <div className="flex-1 min-w-0 w-full">
                          <div className="flex items-center gap-3 mb-2">
                            {selectionMode && (
                              <div
                                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                  selectedStories.has(story.id)
                                    ? "bg-purple-600 border-purple-600"
                                    : "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-500"
                                }`}
                              >
                                {selectedStories.has(story.id) && (
                                  <DynamicIcon
                                    name="Check"
                                    className="w-3 h-3 text-white"
                                  />
                                )}
                              </div>
                            )}
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white truncate">
                              {story.title}
                            </h3>
                            <span
                              className="px-3 py-1 bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 text-sm font-semibold rounded-full flex items-center gap-1"
                              title="This story is saved offline"
                            >
                              <DynamicIcon name="Save" className="w-3 h-3" />{" "}
                              Offline
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400 mb-3">
                            <span>
                              Updated:{" "}
                              {new Date(story.updatedAt).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                            {story.preview}
                          </p>
                        </div>
                        {!selectionMode && (
                          <div
                            className="flex gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => setMovingStory(story.id)}
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-md flex items-center justify-center"
                              title="Move to folder"
                            >
                              <DynamicIcon name="Folder" className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleDeleteStory(story.id, true)}
                              disabled={deleting === story.id}
                              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                            >
                              {deleting === story.id ? (
                                <DynamicIcon
                                  name="Loader2"
                                  className="w-5 h-5 animate-spin"
                                />
                              ) : (
                                <DynamicIcon
                                  name="Trash2"
                                  className="w-5 h-5"
                                />
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div>
            {/* Adventures Filters */}
            <div className="bg-white dark:bg-blue-950 rounded-xl shadow-lg p-4 mb-4 border border-gray-200 dark:border-gray-700">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Search */}
                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                    <DynamicIcon name="Search" className="w-4 h-4" />
                    Search Adventures
                  </label>
                  <input
                    type="text"
                    value={adventureSearch}
                    onChange={(e) => setAdventureSearch(e.target.value)}
                    placeholder="Search by title or description..."
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:border-purple-500 dark:focus:border-purple-400 focus:outline-none text-gray-900 dark:text-white"
                  />
                </div>

                {/* Filter */}
                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                    <DynamicIcon name="SlidersHorizontal" className="w-4 h-4" />
                    Filter
                  </label>
                  <select
                    value={adventureFilter}
                    onChange={(e) =>
                      setAdventureFilter(
                        e.target.value as "all" | "published" | "draft"
                      )
                    }
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:border-purple-500 dark:focus:border-purple-400 focus:outline-none text-gray-900 dark:text-white"
                  >
                    <option value="all">All Adventures</option>
                    <option value="published">Published</option>
                    <option value="draft">Drafts</option>
                  </select>
                </div>

                {/* Sort */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    <DynamicIcon
                      name="RefreshCw"
                      className="inline-block w-4 h-4 mr-1"
                    />
                    Sort By
                  </label>
                  <select
                    value={adventureSortBy}
                    onChange={(e) =>
                      setAdventureSortBy(e.target.value as AdventureSortBy)
                    }
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:border-purple-500 dark:focus:border-purple-400 focus:outline-none text-gray-900 dark:text-white"
                  >
                    <option value="updated">Last Updated</option>
                    <option value="created">Date Created</option>
                    <option value="title">Title (A-Z)</option>
                    <option value="rating">Rating</option>
                    <option value="plays">Play Count</option>
                  </select>
                </div>
              </div>

              {/* Clear Filters */}
              {(adventureSearch ||
                adventureFilter !== "all" ||
                adventureSortBy !== "updated") && (
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => {
                      setAdventureSearch("");
                      setAdventureFilter("all");
                      setAdventureSortBy("updated");
                    }}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-900 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors text-sm"
                  >
                    Clear Filters
                  </button>
                </div>
              )}
            </div>

            {/* Adventures List */}
            <div className="space-y-4">
              {/* Adventures View */}
              <div className="mb-4">
                <button
                  onClick={() => router.push("/creator")}
                  className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition-colors shadow-md flex items-center gap-2"
                >
                  <DynamicIcon name="Plus" className="w-5 h-5" /> Create New
                  Adventure
                </button>
              </div>
              {filteredAdventures.length === 0 &&
              localAdventures.length === 0 ? (
                <div className="bg-white dark:bg-blue-950 rounded-2xl shadow-xl p-12 text-center border border-gray-200 dark:border-gray-700">
                  <div className="flex justify-center mb-4">
                    <DynamicIcon
                      name="Gamepad2"
                      className="w-16 h-16 text-gray-400"
                    />
                  </div>
                  <h3 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
                    {adventures.length === 0 && localAdventures.length === 0
                      ? "No Adventures Yet"
                      : "No Adventures Match Filters"}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-6">
                    {adventures.length === 0 && localAdventures.length === 0
                      ? "Create your first adventure and share it with the community!"
                      : "Try adjusting your search or filters to find more adventures."}
                  </p>
                  {adventures.length === 0 && localAdventures.length === 0 && (
                    <button
                      onClick={() => router.push("/creator")}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors shadow-md"
                    >
                      Start Creating
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredAdventures.map((adventure) => (
                    <div
                      key={adventure.id}
                      className="bg-white dark:bg-blue-950 rounded-xl shadow-md overflow-hidden border border-gray-200 dark:border-gray-700 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-150"
                    >
                      {/* Thumbnail */}
                      {adventure.thumbnailUrl ? (
                        <div
                          className="h-40 bg-cover bg-center"
                          style={{
                            backgroundImage: `url(${adventure.thumbnailUrl})`,
                          }}
                        />
                      ) : (
                        <div className="h-40 bg-linear-to-br from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center">
                          <DynamicIcon
                            name="Gamepad2"
                            className="w-16 h-16 text-white"
                          />
                        </div>
                      )}

                      {/* Content */}
                      <div className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex-1 truncate">
                            {adventure.title}
                          </h3>
                          {adventure.isPublished && (
                            <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs font-semibold rounded-full">
                              Published
                            </span>
                          )}
                          {adventure.isFeatured && (
                            <DynamicIcon
                              name="Star"
                              className="w-5 h-5 text-yellow-500 fill-current"
                            />
                          )}
                        </div>
                        <p className="text-gray-600 dark:text-gray-400 text-sm mb-3 line-clamp-2">
                          {adventure.shortDescription}
                        </p>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {adventure.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-semibold rounded-full"
                            >
                              {tag}
                            </span>
                          ))}
                          {adventure.tags.length > 3 && (
                            <span className="px-2 py-1 bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 text-xs font-semibold rounded-full">
                              +{adventure.tags.length - 3}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
                          <span className="flex items-center gap-1">
                            <DynamicIcon
                              name="Star"
                              className="w-4 h-4 text-yellow-500"
                            />{" "}
                            {adventure.rating?.toFixed(1) || "N/A"}
                          </span>
                          <span className="flex items-center gap-1">
                            <DynamicIcon name="Users" className="w-4 h-4" />{" "}
                            {adventure.playCount || 0}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              router.push(`/explorer/${adventure.id}`)
                            }
                            className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors text-sm"
                          >
                            View
                          </button>
                          <button
                            onClick={() =>
                              router.push(`/creator?edit=${adventure.id}`)
                            }
                            className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors text-sm"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteAdventure(adventure.id)}
                            disabled={deleting === adventure.id}
                            className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
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

                  {/* Local/Offline Adventures */}
                  {localAdventures.map((adventure) => (
                    <div
                      key={adventure.id}
                      className="bg-white dark:bg-blue-950 rounded-xl shadow-md overflow-hidden border border-gray-200 dark:border-gray-700 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-150"
                    >
                      {/* Thumbnail */}
                      {adventure.adventureData.thumbnailUrl ? (
                        <div
                          className="h-40 bg-cover bg-center"
                          style={{
                            backgroundImage: `url(${adventure.adventureData.thumbnailUrl})`,
                          }}
                        />
                      ) : (
                        <div className="h-40 bg-linear-to-br from-gray-500 via-gray-600 to-gray-700 flex items-center justify-center">
                          <DynamicIcon
                            name="Save"
                            className="w-16 h-16 text-white"
                          />
                        </div>
                      )}

                      {/* Content */}
                      <div className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex-1 truncate">
                            {adventure.title}
                          </h3>
                          <span
                            className="px-2 py-1 bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 text-xs font-semibold rounded-full flex items-center gap-1"
                            title="This adventure is saved offline"
                          >
                            <DynamicIcon name="Save" className="w-3 h-3" />{" "}
                            Offline
                          </span>
                        </div>
                        <p className="text-gray-600 dark:text-gray-400 text-sm mb-3 line-clamp-2">
                          {adventure.description}
                        </p>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {adventure.adventureData.tags
                            ?.slice(0, 3)
                            .map((tag: string) => (
                              <span
                                key={tag}
                                className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-semibold rounded-full"
                              >
                                {tag}
                              </span>
                            ))}
                          {adventure.adventureData.tags &&
                            adventure.adventureData.tags.length > 3 && (
                              <span className="px-2 py-1 bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 text-xs font-semibold rounded-full">
                                +{adventure.adventureData.tags.length - 3}
                              </span>
                            )}
                        </div>
                        <div className="flex gap-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
                          <span>
                            Updated:{" "}
                            {new Date(adventure.updatedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              router.push(`/explorer/${adventure.id}`)
                            }
                            className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors text-sm"
                          >
                            View
                          </button>
                          <button
                            onClick={() =>
                              router.push(`/creator?edit=${adventure.id}`)
                            }
                            className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors text-sm"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() =>
                              handleDeleteAdventure(adventure.id, true)
                            }
                            disabled={deleting === adventure.id}
                            className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
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
          </div>
        )}
      </div>

      {/* Folder Management Dialogs */}
      {showNewFolderDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-blue-950 rounded-lg p-6 max-w-md w-full">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Create New Folder
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Folder Name
                </label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white"
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Color
                </label>
                <input
                  type="color"
                  value={newFolderColor}
                  onChange={(e) => setNewFolderColor(e.target.value)}
                  className="w-full h-10 rounded-lg cursor-pointer"
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
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-900 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {editingFolder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-blue-950 rounded-lg p-6 max-w-md w-full">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Edit Folder
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Folder Name
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
                  className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white"
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Color
                </label>
                <input
                  type="color"
                  value={newFolderColor}
                  onChange={(e) => setNewFolderColor(e.target.value)}
                  className="w-full h-10 rounded-lg cursor-pointer"
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
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-900 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold rounded-lg transition-colors"
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
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {movingStory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-blue-950 rounded-lg p-6 max-w-md w-full">
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
