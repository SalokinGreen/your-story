"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StaticIcon } from "./StaticIcon";
import { DynamicIcon } from "./DynamicIcon";
import LibraryPickerModal from "./LibraryPickerModal";
import { libraryNoteToStoryLore } from "../misc/localNotesLibraryManager";
import type { StoryLore } from "../misc/structs";

/**
 * Alternative to the Creator wizard / QuickStartGenres: skip adventure setup
 * entirely and start chatting directly with the GM, who interviews the
 * player briefly and builds the world/character on the fly.
 */
export default function FreeformStoryStart() {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [pickerMode, setPickerMode] = useState<"notes" | "character" | null>(
    null,
  );
  const [attachedLore, setAttachedLore] = useState<StoryLore[]>([]);

  const characterAttached = attachedLore.some(
    (l) => l.type === "character_sheet",
  );
  const noteCount = attachedLore.filter(
    (l) => l.type !== "character_sheet",
  ).length;

  const beginStory = async (initialLore: StoryLore[]) => {
    if (starting) return;
    setStarting(true);
    try {
      const { startFreeformStoryLocally } = await import(
        "../misc/localStoryManager"
      );
      const localId = await startFreeformStoryLocally(
        "Player",
        initialLore.length ? initialLore : undefined,
      );
      router.push(`/story?storyId=${localId}`);
    } catch (error) {
      console.error("Error starting freeform story:", error);
      setStarting(false);
    }
  };

  return (
    <div className="mb-10 flex flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => beginStory(attachedLore)}
          disabled={starting}
          className="group flex items-center gap-3 px-5 py-3 bg-blue-950/50 hover:bg-blue-900/50 text-blue-200 rounded-xl border border-blue-800/30 transition-all hover:border-blue-600/50 disabled:opacity-60"
        >
          <StaticIcon
            name="MessageSquare"
            className="w-5 h-5 text-blue-400 group-hover:text-blue-300"
          />
          <span className="text-left">
            <span className="block font-medium text-white">
              {starting ? "Starting..." : "Freeform Story"}
            </span>
            <span className="block text-xs text-blue-200/50">
              Skip setup - just talk to your GM
            </span>
          </span>
        </button>
        <button
          onClick={() => setPickerMode("character")}
          disabled={starting}
          title="Start as an existing character from your library"
          className={`p-3 rounded-xl border transition-all disabled:opacity-60 relative ${
            characterAttached
              ? "bg-purple-900/40 border-purple-600/50 text-purple-200"
              : "bg-blue-950/50 hover:bg-blue-900/50 border-blue-800/30 text-blue-300 hover:border-blue-600/50"
          }`}
        >
          <DynamicIcon name="User" className="w-5 h-5" />
        </button>
        <button
          onClick={() => setPickerMode("notes")}
          disabled={starting}
          title="Bring in world notes from your library"
          className="p-3 bg-blue-950/50 hover:bg-blue-900/50 text-blue-300 rounded-xl border border-blue-800/30 transition-all hover:border-blue-600/50 disabled:opacity-60 relative"
        >
          <DynamicIcon name="Library" className="w-5 h-5" />
          {noteCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-purple-600 text-white text-[10px] flex items-center justify-center">
              {noteCount}
            </span>
          )}
        </button>
      </div>
      {(characterAttached || noteCount > 0) && (
        <p className="text-xs text-blue-300/50">
          {characterAttached && "Existing character attached"}
          {characterAttached && noteCount > 0 && " + "}
          {noteCount > 0 &&
            `${noteCount} note${noteCount === 1 ? "" : "s"} from your library`}
        </p>
      )}

      <LibraryPickerModal
        isOpen={pickerMode === "character"}
        onClose={() => setPickerMode(null)}
        title="Start as an Existing Character"
        description="Pick a character sheet you've saved to your library."
        confirmLabel="Attach & Continue"
        filterType="character_sheet"
        multiSelect={false}
        onImport={(notes) => {
          const chosen = notes.map(libraryNoteToStoryLore);
          setAttachedLore((prev) => [
            ...prev.filter((l) => l.type !== "character_sheet"),
            ...chosen,
          ]);
          setPickerMode(null);
        }}
      />

      <LibraryPickerModal
        isOpen={pickerMode === "notes"}
        onClose={() => setPickerMode(null)}
        title="Bring World Notes"
        description="Attach saved lore, mechanics, or GM notes before you start."
        confirmLabel="Attach & Continue"
        onImport={(notes) => {
          const chosen = notes.map(libraryNoteToStoryLore);
          setAttachedLore((prev) => [
            ...prev,
            ...chosen.filter(
              (c) => !prev.some((p) => p.libraryNoteId === c.libraryNoteId),
            ),
          ]);
          setPickerMode(null);
        }}
      />
    </div>
  );
}
