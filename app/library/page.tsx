"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useNotification } from "@/app/misc/NotificationContext";
import { DynamicIcon } from "@/app/components/DynamicIcon";
import { LibrarySkeleton } from "@/app/components/Skeleton";
import {
  listLocalStories,
  LocalStory,
  saveLocalStory,
  startAdventureLocally,
  startFreeformStoryLocally,
} from "@/app/misc/localStoryManager";
import {
  listLocalAdventures,
  saveLocalAdventure,
  LocalAdventure,
} from "@/app/misc/localAdventureManager";
import {
  listLocalFolders,
  createLocalFolder,
  LocalFolder,
} from "@/app/misc/localFolderManager";
import LibraryHome from "./LibraryHome";
import FolderDetailView from "./FolderDetailView";
import StoriesLibraryTab from "./StoriesLibraryTab";
import AdventuresLibraryTab from "./AdventuresLibraryTab";
import NotesLibraryTab, {
  countNotesByFolder,
  NoteCounts,
} from "./NotesLibraryTab";
import { LibraryScope } from "./libraryScope";
import {
  listLibraryNotes,
  libraryNoteToStoryLore,
  createLibraryNote,
} from "@/app/misc/localNotesLibraryManager";
import { migrateTablesLibraryToNotes } from "@/app/misc/tablesLibraryMigration";
import { createLibraryTable } from "@/app/misc/localTablesLibraryManager";
import LibraryPickerModal from "@/app/components/LibraryPickerModal";
import JoinGameModal from "@/app/components/JoinGameModal";
import HostGameModal from "@/app/components/HostGameModal";
import ExportFolderModal from "@/app/components/ExportFolderModal";
import NewFolderDialog from "@/app/components/NewFolderDialog";
import { readFolderLibraryFile } from "@/app/misc/folderLibraryExport";
import { SYNC_COMPLETED_EVENT } from "@/app/misc/syncManager";
import type { StoryLore } from "@/app/misc/structs";

/**
 * Which slice of the library is on screen. Folders are the front door - the
 * home screen is a folder grid plus a quick-play rail, and the flat
 * "everything" lists are one level down from it rather than the default.
 */
type LibraryView =
  | { kind: "home" }
  | { kind: "folder"; scope: LibraryScope }
  | { kind: "stories" }
  | { kind: "adventures" }
  | { kind: "notes" };

const EMPTY_NOTE_COUNTS: NoteCounts = { total: 0, byFolder: {}, unfiled: 0 };

export default function LibraryPage() {
  const router = useRouter();
  const { addNotification } = useNotification();

  const [view, setView] = useState<LibraryView>({ kind: "home" });
  const [localStories, setLocalStories] = useState<LocalStory[]>([]);
  const [localAdventures, setLocalAdventures] = useState<LocalAdventure[]>([]);
  const [noteCounts, setNoteCounts] = useState<NoteCounts>(EMPTY_NOTE_COUNTS);
  const [folders, setFolders] = useState<LocalFolder[]>([]);
  const [loading, setLoading] = useState(true);

  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [exportingFolder, setExportingFolder] = useState<LocalFolder | null>(
    null,
  );
  const [showJoinGameModal, setShowJoinGameModal] = useState(false);
  const [hostingStoryId, setHostingStoryId] = useState<string | null>(null);
  const [pendingPlay, setPendingPlay] = useState<
    | { kind: "adventure"; adventure: LocalAdventure }
    | { kind: "freeform" }
    | null
  >(null);
  // Remounts the notes tab after an import writes notes behind its back.
  const [notesRefreshKey, setNotesRefreshKey] = useState(0);
  const importFolderInputRef = useRef<HTMLInputElement>(null);

  // Ref to track if we've already loaded data (prevents reload on tab focus)
  const hasLoadedLocalRef = useRef(false);

  // Initial load: everything lives locally now, so this is instant.
  useEffect(() => {
    if (!hasLoadedLocalRef.current) {
      loadLocalData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A background sync writes straight to IndexedDB/localStorage and has no
  // way to update this page's already-loaded state on its own - reload once
  // a sync actually changes something, so newly-pulled-in stories/
  // adventures/folders/notes from another device show up without requiring
  // a manual page reload.
  useEffect(() => {
    function handleSyncCompleted() {
      loadLocalData();
      setNotesRefreshKey((k) => k + 1);
    }
    window.addEventListener(SYNC_COMPLETED_EVENT, handleSyncCompleted);
    return () =>
      window.removeEventListener(SYNC_COMPLETED_EVENT, handleSyncCompleted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadLocalData = async () => {
    hasLoadedLocalRef.current = true;
    setLoading(true);

    try {
      // Legacy structured tables become table notes before anything is
      // counted. This used to happen only when the Notes tab mounted, which
      // is no longer the first thing a visit touches - folder tiles would
      // otherwise undercount until the user happened to open Notes.
      await migrateTablesLibraryToNotes().catch((error) => {
        console.error("Error migrating tables library:", error);
      });

      const [localStoriesList, localAdvs, notesList] = await Promise.all([
        listLocalStories(),
        listLocalAdventures().catch((error) => {
          console.error("Error loading local adventures:", error);
          return [];
        }),
        listLibraryNotes().catch((error) => {
          console.error("Error loading notes library:", error);
          return [];
        }),
      ]);

      setLocalStories(localStoriesList);
      setLocalAdventures(localAdvs);
      setNoteCounts(countNotesByFolder(notesList));
      setFolders(listLocalFolders());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Error loading local data:", error);
      addNotification(`Failed to load library: ${message}`, "failure");
    } finally {
      setLoading(false);
    }
  };

  // Identity-stable so the notes tab's reporting effect doesn't refire on
  // every render of this page.
  const handleNoteCountsChange = useCallback((counts: NoteCounts) => {
    setNoteCounts(counts);
  }, []);

  // ============================================
  // Starting play
  // ============================================

  const beginPendingPlay = async (initialLore: StoryLore[]) => {
    if (!pendingPlay) return;
    const context = pendingPlay;
    setPendingPlay(null);
    try {
      const localId =
        context.kind === "adventure"
          ? await startAdventureLocally(
              context.adventure.adventureData,
              "Player",
              initialLore.length ? initialLore : undefined,
            )
          : await startFreeformStoryLocally(
              "Player",
              initialLore.length ? initialLore : undefined,
            );
      router.push(`/story?storyId=${localId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Error starting story:", error);
      addNotification(`Failed to start: ${message}`, "failure");
    }
  };

  // ============================================
  // Folders
  // ============================================

  const handleCreateFolder = (name: string, icon: string, color: string) => {
    try {
      const folder = createLocalFolder(name, icon, color);
      setFolders((prev) => [...prev, folder]);
      setShowNewFolderDialog(false);
      addNotification("Folder created successfully", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Error creating folder:", error);
      addNotification(`Failed to create folder: ${message}`, "failure");
    }
  };

  const handleImportFolderFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const result = await readFolderLibraryFile(file);
    if (!result.success || !result.folder) {
      addNotification(result.error || "Failed to import folder", "failure");
      return;
    }

    try {
      const newFolder = createLocalFolder(
        result.folder.name,
        result.folder.icon,
        result.folder.color,
      );
      setFolders((prev) => [...prev, newFolder]);

      if (result.stories?.length) {
        await Promise.all(
          result.stories.map((s, index) => {
            const id = `local_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 9)}`;
            return saveLocalStory(id, s.storyData, newFolder.id);
          }),
        );
        setLocalStories(await listLocalStories());
      }

      if (result.adventures?.length) {
        await Promise.all(
          result.adventures.map((a, index) => {
            const id = `local:${Date.now()}_${index}_${Math.random().toString(36).substring(2, 9)}`;
            return saveLocalAdventure(id, a.adventureData, {
              folderId: newFolder.id,
            });
          }),
        );
        setLocalAdventures(await listLocalAdventures());
      }

      if (result.notes?.length) {
        await Promise.all(
          result.notes.map((n) =>
            createLibraryNote({
              title: n.title,
              content: n.content,
              type: n.type,
              tags: n.tags,
              folderId: newFolder.id,
              pinned: n.pinned,
              source: n.source,
              sourceFile: n.sourceFile,
              relatedCharacters: n.relatedCharacters,
              relatedLocations: n.relatedLocations,
              keys: n.keys,
            }),
          ),
        );
        setNoteCounts(countNotesByFolder(await listLibraryNotes()));
      }

      if (result.tables?.length) {
        await Promise.all(
          result.tables.map((t) =>
            createLibraryTable({
              name: t.name,
              description: t.description,
              entries: t.entries,
              tags: t.tags,
              folderId: newFolder.id,
              pinned: t.pinned,
              source: t.source,
              sourceFile: t.sourceFile,
            }),
          ),
        );
      }

      // NotesLibraryTab keeps its own copy of notes; force it to reload if
      // it's currently mounted so the import shows up right away.
      setNotesRefreshKey((k) => k + 1);

      const parts = [
        result.stories?.length
          ? `${result.stories.length} stor${result.stories.length === 1 ? "y" : "ies"}`
          : null,
        result.adventures?.length
          ? `${result.adventures.length} adventure${result.adventures.length === 1 ? "" : "s"}`
          : null,
        result.notes?.length
          ? `${result.notes.length} note${result.notes.length === 1 ? "" : "s"}`
          : null,
        result.tables?.length
          ? `${result.tables.length} table${result.tables.length === 1 ? "" : "s"}`
          : null,
      ].filter(Boolean);
      addNotification(
        `Imported folder "${newFolder.name}"${parts.length ? ` (${parts.join(", ")})` : ""}${
          result.warnings.length > 0
            ? ` - ${result.warnings.length} warning${result.warnings.length === 1 ? "" : "s"}`
            : ""
        }`,
        "success",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Error importing folder:", error);
      addNotification(`Failed to import folder: ${message}`, "failure");
    }
  };

  // ============================================
  // Header
  // ============================================

  // `null` covers both "not in a folder view" and the Uncategorized
  // pseudo-folder, which has no LocalFolder record behind it.
  const activeScope = view.kind === "folder" ? view.scope : null;
  const activeFolder =
    activeScope?.kind === "folder"
      ? folders.find((f) => f.id === activeScope.folderId) || null
      : null;

  const headerTitle = (() => {
    switch (view.kind) {
      case "home":
        return "Library";
      case "stories":
        return "Stories";
      case "adventures":
        return "Adventures";
      case "notes":
        return "Notes";
      case "folder":
        return activeFolder?.name ?? "Uncategorized";
    }
  })();

  const goHome = () => setView({ kind: "home" });
  const goBack = () =>
    view.kind === "home" ? router.push("/") : goHome();

  const showFreeformButton = view.kind === "home" || view.kind === "stories";
  const showNewAdventureButton = view.kind === "adventures";

  if (loading && localStories.length === 0 && localAdventures.length === 0) {
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
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={goBack}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors shrink-0"
              aria-label={view.kind === "home" ? "Back to home" : "Back to library"}
            >
              <DynamicIcon name="ArrowLeft" className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold truncate">{headerTitle}</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowJoinGameModal(true)}
              title="Join someone else's online room with a room code"
              className="flex items-center gap-2 px-4 py-2 bg-blue-900/50 hover:bg-blue-800/60 border border-blue-700/50 rounded-xl transition-colors text-sm font-medium"
            >
              <DynamicIcon name="Wifi" className="w-4 h-4" />
              <span className="hidden sm:inline">Join a Game</span>
            </button>
            {showFreeformButton && (
              <button
                onClick={() => setPendingPlay({ kind: "freeform" })}
                title="Skip adventure setup - talk to the GM and build the world as you play"
                className="flex items-center gap-2 px-4 py-2 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-xl transition-colors text-sm font-medium"
              >
                <DynamicIcon name="MessageCircle" className="w-4 h-4" />
                <span className="hidden sm:inline">Freeform Story</span>
              </button>
            )}
            {showNewAdventureButton && (
              <button
                onClick={() => router.push("/creator")}
                className="flex items-center gap-2 px-4 py-2 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-xl transition-colors text-sm font-medium"
              >
                <DynamicIcon name="Plus" className="w-4 h-4" />
                <span className="hidden sm:inline">New Adventure</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {loading ? (
          <LibrarySkeleton />
        ) : view.kind === "home" ? (
          <LibraryHome
            stories={localStories}
            adventures={localAdventures}
            folders={folders}
            noteCounts={noteCounts}
            onOpenFolder={(scope) => setView({ kind: "folder", scope })}
            onOpenStories={() => setView({ kind: "stories" })}
            onOpenAdventures={() => setView({ kind: "adventures" })}
            onOpenNotes={() => setView({ kind: "notes" })}
            onContinueStory={(storyId) =>
              router.push(`/story?storyId=${storyId}`)
            }
            onNewFolder={() => setShowNewFolderDialog(true)}
            onImportFolder={() => importFolderInputRef.current?.click()}
          />
        ) : view.kind === "folder" ? (
          <FolderDetailView
            notesRefreshKey={notesRefreshKey}
            folder={activeFolder}
            scope={view.scope}
            stories={localStories}
            setStories={setLocalStories}
            adventures={localAdventures}
            setAdventures={setLocalAdventures}
            folders={folders}
            setFolders={setFolders}
            noteCounts={noteCounts}
            onNoteCountsChange={handleNoteCountsChange}
            onBack={goHome}
            onExportFolder={setExportingFolder}
            onHostStory={setHostingStoryId}
            onPlayAdventure={(adventure) =>
              setPendingPlay({ kind: "adventure", adventure })
            }
          />
        ) : view.kind === "stories" ? (
          <StoriesLibraryTab
            stories={localStories}
            setStories={setLocalStories}
            folders={folders}
            setFolders={setFolders}
            onHostStory={setHostingStoryId}
            onExportFolder={setExportingFolder}
            onImportFolder={() => importFolderInputRef.current?.click()}
          />
        ) : view.kind === "adventures" ? (
          <AdventuresLibraryTab
            adventures={localAdventures}
            setAdventures={setLocalAdventures}
            folders={folders}
            setFolders={setFolders}
            onPlayAdventure={(adventure) =>
              setPendingPlay({ kind: "adventure", adventure })
            }
          />
        ) : (
          <NotesLibraryTab
            key={notesRefreshKey}
            folders={folders}
            setFolders={setFolders}
            onExportFolder={setExportingFolder}
            onCountsChange={handleNoteCountsChange}
          />
        )}
      </main>

      <input
        ref={importFolderInputRef}
        type="file"
        accept=".folder,.json"
        onChange={handleImportFolderFileChange}
        className="hidden"
      />

      <NewFolderDialog
        isOpen={showNewFolderDialog}
        onClose={() => setShowNewFolderDialog(false)}
        onCreate={handleCreateFolder}
      />

      <LibraryPickerModal
        isOpen={pendingPlay !== null}
        onClose={() => setPendingPlay(null)}
        title="Bring a Character or Notes"
        description="Attach an existing character sheet, world notes, or random tables before you start, or skip and go in blank."
        confirmLabel="Attach & Start"
        onSkip={() => beginPendingPlay([])}
        onImport={(notes) => beginPendingPlay(notes.map(libraryNoteToStoryLore))}
      />

      <JoinGameModal
        isOpen={showJoinGameModal}
        onClose={() => setShowJoinGameModal(false)}
      />

      <HostGameModal
        isOpen={hostingStoryId !== null}
        onClose={() => setHostingStoryId(null)}
        storyId={hostingStoryId || ""}
      />

      {exportingFolder && (
        <ExportFolderModal
          folder={exportingFolder}
          stories={localStories}
          adventures={localAdventures}
          onClose={() => setExportingFolder(null)}
        />
      )}
    </div>
  );
}
