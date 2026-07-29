"use client";

import { useMemo } from "react";
import { DynamicIcon } from "@/app/components/DynamicIcon";
import { DraggableScroll } from "@/app/components/DraggableScroll";
import { LocalStory } from "@/app/misc/localStoryManager";
import { LocalAdventure } from "@/app/misc/localAdventureManager";
import { LocalFolder } from "@/app/misc/localFolderManager";
import { getRelativeTime } from "@/app/misc/relativeTime";
import { LibraryScope } from "./libraryScope";
import type { NoteCounts } from "./NotesLibraryTab";

/** How many stories the quick-play rail offers before "See all". */
const RECENT_STORY_COUNT = 8;

interface LibraryHomeProps {
  stories: LocalStory[];
  adventures: LocalAdventure[];
  folders: LocalFolder[];
  noteCounts: NoteCounts;
  onOpenFolder: (scope: LibraryScope) => void;
  onOpenStories: () => void;
  onOpenAdventures: () => void;
  onOpenNotes: () => void;
  onContinueStory: (storyId: string) => void;
  onNewFolder: () => void;
  onImportFolder: () => void;
}

export default function LibraryHome({
  stories,
  adventures,
  folders,
  noteCounts,
  onOpenFolder,
  onOpenStories,
  onOpenAdventures,
  onOpenNotes,
  onContinueStory,
  onNewFolder,
  onImportFolder,
}: LibraryHomeProps) {
  const recentStories = useMemo(
    () =>
      [...stories]
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )
        .slice(0, RECENT_STORY_COUNT),
    [stories],
  );

  const countsFor = (folderId: string) => ({
    stories: stories.filter((s) => s.folder_id === folderId).length,
    adventures: adventures.filter((a) => a.folder_id === folderId).length,
    notes: noteCounts.byFolder[folderId] || 0,
  });

  const unfiledCounts = {
    stories: stories.filter((s) => !s.folder_id).length,
    adventures: adventures.filter((a) => !a.folder_id).length,
    notes: noteCounts.unfiled,
  };

  const hasUnfiled =
    unfiledCounts.stories + unfiledCounts.adventures + unfiledCounts.notes > 0;

  return (
    <div className="space-y-8">
      {/* ---------------------------------------------------------------
          Quick play - the reason most visits happen at all, so it sits
          above the fold rather than behind a tab.
         --------------------------------------------------------------- */}
      {recentStories.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-bold">Jump back in</h2>
            <button
              onClick={onOpenStories}
              className="text-sm text-blue-300/70 hover:text-white transition-colors"
            >
              All stories ({stories.length})
            </button>
          </div>
          <DraggableScroll className="pb-2" innerClassName="gap-3 px-1">
            {recentStories.map((story) => {
              const folder = folders.find((f) => f.id === story.folder_id);
              return (
                <button
                  key={story.id}
                  onClick={() => onContinueStory(story.id)}
                  className="w-56 shrink-0 text-left p-4 rounded-xl bg-linear-to-br from-blue-900/60 to-purple-900/30 border border-blue-800/40 hover:border-purple-500/50 transition-all active:scale-[0.98]"
                >
                  <div className="flex items-center gap-2 mb-2 text-xs text-blue-200/50">
                    <DynamicIcon name="Clock" className="w-3.5 h-3.5" />
                    {getRelativeTime(String(story.updatedAt))}
                  </div>
                  <h3 className="font-semibold line-clamp-2 mb-3 min-h-[2.5rem]">
                    {story.title}
                  </h3>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-blue-200/60">
                      Ch. {(story.storyData?.currentChapter ?? 0) + 1}
                    </span>
                    {folder && (
                      <span
                        className="text-xs flex items-center gap-1 truncate"
                        style={{ color: folder.color }}
                      >
                        <DynamicIcon
                          name={folder.icon}
                          className="w-3 h-3 shrink-0"
                        />
                        <span className="truncate">{folder.name}</span>
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 text-sm font-medium text-purple-300">
                    <DynamicIcon name="Play" className="w-4 h-4" />
                    Continue
                  </div>
                </button>
              );
            })}
          </DraggableScroll>
        </section>
      )}

      {/* ---------------------------------------------------------------
          Folders - the primary way into everything else.
         --------------------------------------------------------------- */}
      <section>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-lg font-bold">Folders</h2>
          <div className="flex gap-2">
            <button
              onClick={onImportFolder}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-900/50 hover:bg-blue-800/60 border border-blue-700/50 rounded-lg text-sm transition-colors"
            >
              <DynamicIcon name="Upload" className="w-4 h-4" />
              <span className="hidden sm:inline">Import</span>
            </button>
            <button
              onClick={onNewFolder}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-lg text-sm font-medium transition-colors"
            >
              <DynamicIcon name="Plus" className="w-4 h-4" />
              New Folder
            </button>
          </div>
        </div>

        {folders.length === 0 && !hasUnfiled ? (
          <div className="bg-blue-950/50 rounded-2xl p-10 text-center border border-blue-800/30">
            <DynamicIcon
              name="FolderPlus"
              className="w-14 h-14 text-blue-400/30 mx-auto mb-4"
            />
            <h3 className="text-lg font-bold mb-2">No Folders Yet</h3>
            <p className="text-blue-200/60 mb-6">
              Folders hold a campaign&apos;s stories, adventures and notes
              together in one place.
            </p>
            <button
              onClick={onNewFolder}
              className="px-6 py-3 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 font-semibold rounded-xl transition-colors"
            >
              New Folder
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {folders.map((folder) => {
              const counts = countsFor(folder.id);
              return (
                <FolderTile
                  key={folder.id}
                  icon={folder.icon}
                  color={folder.color}
                  name={folder.name}
                  counts={counts}
                  onClick={() =>
                    onOpenFolder({ kind: "folder", folderId: folder.id })
                  }
                />
              );
            })}
            {hasUnfiled && (
              <FolderTile
                icon="FileText"
                color="#64748b"
                name="Uncategorized"
                counts={unfiledCounts}
                onClick={() => onOpenFolder({ kind: "unfiled" })}
              />
            )}
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------------
          Flat views, for searching across folders.
         --------------------------------------------------------------- */}
      <section>
        <h2 className="text-lg font-bold mb-3">Browse everything</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <BrowseRow
            icon="Book"
            label="Stories"
            count={stories.length}
            onClick={onOpenStories}
          />
          <BrowseRow
            icon="Gamepad2"
            label="Adventures"
            count={adventures.length}
            onClick={onOpenAdventures}
          />
          <BrowseRow
            icon="NotebookText"
            label="Notes"
            count={noteCounts.total}
            onClick={onOpenNotes}
          />
        </div>
      </section>
    </div>
  );
}

function FolderTile({
  icon,
  color,
  name,
  counts,
  onClick,
}: {
  icon: string;
  color: string;
  name: string;
  counts: { stories: number; adventures: number; notes: number };
  onClick: () => void;
}) {
  const parts = [
    counts.stories > 0
      ? `${counts.stories} stor${counts.stories === 1 ? "y" : "ies"}`
      : null,
    counts.adventures > 0
      ? `${counts.adventures} adventure${counts.adventures === 1 ? "" : "s"}`
      : null,
    counts.notes > 0
      ? `${counts.notes} note${counts.notes === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);

  return (
    <button
      onClick={onClick}
      className="text-left p-4 rounded-xl border bg-blue-950/50 border-blue-800/30 hover:bg-blue-900/50 hover:border-blue-700/50 transition-all active:scale-[0.98]"
      style={{ borderTop: `3px solid ${color}` }}
    >
      <span
        className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
        style={{ backgroundColor: `${color}30` }}
      >
        <DynamicIcon name={icon} className="w-5 h-5" style={{ color }} />
      </span>
      <h3 className="font-semibold truncate mb-1">{name}</h3>
      <p className="text-xs text-blue-200/50 line-clamp-2">
        {parts.length === 0 ? "Empty" : parts.join(" · ")}
      </p>
    </button>
  );
}

function BrowseRow({
  icon,
  label,
  count,
  onClick,
}: {
  icon: string;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-4 rounded-xl bg-blue-950/50 border border-blue-800/30 hover:bg-blue-900/50 hover:border-blue-700/50 transition-all active:scale-[0.98]"
    >
      <DynamicIcon name={icon} className="w-5 h-5 text-blue-300/70" />
      <span className="font-medium">{label}</span>
      <span className="text-sm text-blue-200/50">{count}</span>
      <div className="flex-1" />
      <DynamicIcon
        name="ChevronRight"
        className="w-4 h-4 text-blue-300/50"
      />
    </button>
  );
}
