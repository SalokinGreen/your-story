"use client";

import { useEffect, useState } from "react";
import { useNotification } from "@/app/misc/NotificationContext";
import { DynamicIcon } from "@/app/components/DynamicIcon";
import { LocalFolder } from "@/app/misc/localFolderManager";
import { LocalStory } from "@/app/misc/localStoryManager";
import { LocalAdventure } from "@/app/misc/localAdventureManager";
import { listLibraryNotes, LibraryNote } from "@/app/misc/localNotesLibraryManager";
import { listLibraryTables, LibraryTable } from "@/app/misc/localTablesLibraryManager";
import { downloadFolderLibrary } from "@/app/misc/folderLibraryExport";
import { useBackHandler } from "../misc/useBackHandler";

interface ExportFolderModalProps {
  folder: LocalFolder;
  stories: LocalStory[];
  adventures: LocalAdventure[];
  onClose: () => void;
}

export default function ExportFolderModal({
  folder,
  stories,
  adventures,
  onClose,
}: ExportFolderModalProps) {
  useBackHandler(true, onClose);
  const { addNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<LibraryNote[]>([]);
  const [tables, setTables] = useState<LibraryTable[]>([]);
  const [includeStories, setIncludeStories] = useState(true);
  const [includeAdventures, setIncludeAdventures] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [includeTables, setIncludeTables] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [notesList, tablesList] = await Promise.all([
          listLibraryNotes(),
          listLibraryTables(),
        ]);
        setNotes(notesList);
        setTables(tablesList);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addNotification(`Failed to load folder contents: ${message}`, "failure");
      } finally {
        setLoading(false);
      }
    })();
  }, [addNotification]);

  const folderStories = stories.filter((s) => s.folder_id === folder.id);
  const folderAdventures = adventures.filter((a) => a.folder_id === folder.id);
  const folderNotes = notes.filter((n) => n.folderId === folder.id);
  const folderTables = tables.filter((t) => t.folderId === folder.id);

  const handleExport = async () => {
    const selection: Parameters<typeof downloadFolderLibrary>[1] = {};
    if (includeStories && folderStories.length > 0) selection.stories = folderStories;
    if (includeAdventures && folderAdventures.length > 0)
      selection.adventures = folderAdventures;
    if (includeNotes && folderNotes.length > 0) selection.notes = folderNotes;
    if (includeTables && folderTables.length > 0) selection.tables = folderTables;

    if (
      !selection.stories &&
      !selection.adventures &&
      !selection.notes &&
      !selection.tables
    ) {
      addNotification("Nothing selected to export", "warning");
      return;
    }

    try {
      await downloadFolderLibrary(folder, selection);
    } catch {
      addNotification("Failed to export folder", "failure");
      return;
    }
    addNotification(`Exported folder "${folder.name}"`, "success");
    onClose();
  };

  const rows: {
    key: "stories" | "adventures" | "notes" | "tables";
    label: string;
    icon: string;
    count: number;
    checked: boolean;
    setChecked: (v: boolean) => void;
  }[] = [
    {
      key: "stories",
      label: "Stories",
      icon: "Book",
      count: folderStories.length,
      checked: includeStories,
      setChecked: setIncludeStories,
    },
    {
      key: "adventures",
      label: "Adventures",
      icon: "Gamepad2",
      count: folderAdventures.length,
      checked: includeAdventures,
      setChecked: setIncludeAdventures,
    },
    {
      key: "notes",
      label: "Notes",
      icon: "NotebookText",
      count: folderNotes.length,
      checked: includeNotes,
      setChecked: setIncludeNotes,
    },
    {
      key: "tables",
      label: "Tables",
      icon: "Dices",
      count: folderTables.length,
      checked: includeTables,
      setChecked: setIncludeTables,
    },
  ];

  return (
    <div className="fixed inset-0 ys-modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="ys-modal shadow-2xl p-6 max-w-md w-full">
        <div className="flex items-center gap-2 mb-4">
          <DynamicIcon
            name={folder.icon}
            className="w-5 h-5"
            style={{ color: folder.color }}
          />
          <h2 className="text-xl font-bold">Export &quot;{folder.name}&quot;</h2>
        </div>

        {loading ? (
          <p className="text-ys-muted text-sm py-4">Loading folder contents...</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-ys-muted mb-2">
              Choose what to include in the export file.
            </p>
            {rows.map((row) => (
              <label
                key={row.key}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                  row.count === 0
                    ? "opacity-40 cursor-not-allowed border-ys-border"
                    : "cursor-pointer border-ys-border hover:bg-ys-surface-2"
                }`}
              >
                <input
                  type="checkbox"
                  checked={row.checked && row.count > 0}
                  disabled={row.count === 0}
                  onChange={(e) => row.setChecked(e.target.checked)}
                  className="w-4 h-4 accent-ys-accent"
                />
                <DynamicIcon name={row.icon} className="w-4 h-4" />
                <span className="flex-1">{row.label}</span>
                <span className="text-sm text-ys-muted">{row.count}</span>
              </label>
            ))}
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-ys-surface-2 hover:bg-ys-border border border-ys-border rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={loading}
            className="flex-1 px-4 py-2 font-semibold rounded-lg shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2 bg-ys-accent text-ys-on-accent hover:opacity-90"
          >
            <DynamicIcon name="Download" className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>
    </div>
  );
}
