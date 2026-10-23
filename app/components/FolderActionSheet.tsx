"use client";

import { useEffect, useState } from "react";
import { DynamicIcon } from "@/app/components/DynamicIcon";
import { IconPicker } from "@/app/components/IconPicker";
import { LocalFolder } from "@/app/misc/localFolderManager";
import { useBackHandler } from "../misc/useBackHandler";

interface FolderActionSheetProps {
  folder: LocalFolder;
  counts: { stories: number; adventures: number; notes: number };
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
  useBackHandler(true, onClose);
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

  const totalItems = counts.stories + counts.adventures + counts.notes;

  return (
    <div
      className="fixed inset-0 ys-modal-backdrop z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-ys-surface border-t sm:border border-ys-border rounded-t-2xl sm:rounded-2xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-h-[90vh] overflow-y-auto"
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
            className="p-2 -mr-2 text-ys-muted hover:text-ys-text hover:bg-ys-surface-2 rounded-lg transition-colors"
            aria-label="Close"
          >
            <DynamicIcon name="X" className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-ys-muted mb-4">
          {totalItems === 0
            ? "Empty folder"
            : [
                counts.stories > 0
                  ? `${counts.stories} stor${counts.stories === 1 ? "y" : "ies"}`
                  : null,
                counts.adventures > 0
                  ? `${counts.adventures} adventure${counts.adventures === 1 ? "" : "s"}`
                  : null,
                counts.notes > 0 ? `${counts.notes} note${counts.notes === 1 ? "" : "s"}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ys-muted mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-ys-surface-2 border border-ys-border rounded-lg text-ys-text placeholder:text-ys-muted focus:outline-none focus:border-ys-accent"
              placeholder="Folder name"
            />
          </div>
          <div>
            <IconPicker label="Icon" value={icon} onChange={setIcon} />
          </div>
          <div>
            <label className="block text-sm font-medium text-ys-muted mb-1">
              Color
            </label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-full h-10 rounded-lg cursor-pointer bg-ys-surface-2"
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!name.trim() || !dirty}
          className="w-full mt-5 px-4 py-2.5 bg-ys-accent text-ys-on-accent hover:opacity-90 font-semibold rounded-lg transition-colors disabled:opacity-40"
        >
          Save Changes
        </button>

        <div className="mt-3 pt-3 border-t border-ys-border space-y-2">
          <button
            onClick={onExport}
            className="w-full flex items-center gap-3 px-3 py-2.5 bg-ys-surface-2 hover:bg-ys-border rounded-lg transition-colors text-sm font-medium"
          >
            <DynamicIcon name="Download" className="w-4 h-4" />
            Export Folder
          </button>
          <button
            onClick={onDelete}
            className="w-full flex items-center gap-3 px-3 py-2.5 bg-ys-danger/15 hover:bg-ys-danger/25 text-ys-danger rounded-lg transition-colors text-sm font-medium"
          >
            <DynamicIcon name="Trash2" className="w-4 h-4" />
            Delete Folder
          </button>
        </div>
      </div>
    </div>
  );
}
