"use client";

import { useEffect, useState } from "react";
import { DynamicIcon } from "@/app/components/DynamicIcon";
import { IconPicker } from "@/app/components/IconPicker";
import { LocalFolder } from "@/app/misc/localFolderManager";

interface FolderActionSheetProps {
  folder: LocalFolder;
  counts: { stories: number; notes: number; tables: number };
  onClose: () => void;
  onSave: (updates: Pick<LocalFolder, "name" | "icon" | "color">) => void;
  onExport: () => void;
  onDelete: () => void;
}

/**
 * Bottom sheet used to manage a single folder on tap - combines rename/
 * recolor/re-icon editing with export and delete in one surface so touch
 * users get a single tap target instead of hidden hover affordances.
 */
export default function FolderActionSheet({
  folder,
  counts,
  onClose,
  onSave,
  onExport,
  onDelete,
}: FolderActionSheetProps) {
  const [name, setName] = useState(folder.name);
  const [icon, setIcon] = useState(folder.icon);
  const [color, setColor] = useState(folder.color);

  useEffect(() => {
    setName(folder.name);
    setIcon(folder.icon);
    setColor(folder.color);
  }, [folder]);

  const dirty =
    name.trim() !== folder.name || icon !== folder.icon || color !== folder.color;

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), icon, color });
  };

  const totalItems = counts.stories + counts.notes + counts.tables;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-blue-950 border-t sm:border border-blue-800/50 rounded-t-2xl sm:rounded-2xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${color}30` }}
            >
              <DynamicIcon name={icon} className="w-4 h-4" style={{ color }} />
            </span>
            <h2 className="text-lg font-bold truncate">{folder.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-blue-300/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Close"
          >
            <DynamicIcon name="X" className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-blue-200/50 mb-4">
          {totalItems === 0
            ? "Empty folder"
            : [
                counts.stories > 0
                  ? `${counts.stories} stor${counts.stories === 1 ? "y" : "ies"}`
                  : null,
                counts.notes > 0 ? `${counts.notes} note${counts.notes === 1 ? "" : "s"}` : null,
                counts.tables > 0
                  ? `${counts.tables} table${counts.tables === 1 ? "" : "s"}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-blue-200/70 mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-blue-900/50 border border-blue-700/50 rounded-lg text-white placeholder-blue-300/50 focus:outline-none focus:border-purple-500"
              placeholder="Folder name"
            />
          </div>
          <div>
            <IconPicker label="Icon" value={icon} onChange={setIcon} />
          </div>
          <div>
            <label className="block text-sm font-medium text-blue-200/70 mb-1">
              Color
            </label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-full h-10 rounded-lg cursor-pointer bg-blue-900/50"
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!name.trim() || !dirty}
          className="w-full mt-5 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 font-semibold rounded-lg transition-colors disabled:opacity-40"
        >
          Save Changes
        </button>

        <div className="mt-3 pt-3 border-t border-blue-800/40 space-y-2">
          <button
            onClick={onExport}
            className="w-full flex items-center gap-3 px-3 py-2.5 bg-blue-900/50 hover:bg-blue-800/60 rounded-lg transition-colors text-sm font-medium"
          >
            <DynamicIcon name="Download" className="w-4 h-4" />
            Export Folder
          </button>
          <button
            onClick={onDelete}
            className="w-full flex items-center gap-3 px-3 py-2.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors text-sm font-medium"
          >
            <DynamicIcon name="Trash2" className="w-4 h-4" />
            Delete Folder
          </button>
        </div>
      </div>
    </div>
  );
}
