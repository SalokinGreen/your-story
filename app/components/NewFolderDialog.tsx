"use client";

import { NEW_FOLDER_COLOR } from "../misc/folderColors";
import { useState } from "react";
import { IconPicker } from "@/app/components/IconPicker";
import { useBackHandler } from "../misc/useBackHandler";

interface NewFolderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, icon: string, color: string) => void;
}

const DEFAULT_ICON = "Folder";
const DEFAULT_COLOR = NEW_FOLDER_COLOR;

export default function NewFolderDialog({
  isOpen,
  onClose,
  onCreate,
}: NewFolderDialogProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(DEFAULT_ICON);
  const [color, setColor] = useState(DEFAULT_COLOR);

  useBackHandler(isOpen, onClose);

  if (!isOpen) return null;

  const reset = () => {
    setName("");
    setIcon(DEFAULT_ICON);
    setColor(DEFAULT_COLOR);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreate(name.trim(), icon, color);
    reset();
  };

  return (
    <div className="fixed inset-0 ys-modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="ys-modal p-6 max-w-md w-full">
        <h2 className="text-xl font-bold mb-4">Create Folder</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ys-muted mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="w-full px-3 py-2 bg-ys-surface-2 border border-ys-border rounded-lg text-ys-text placeholder:text-ys-muted focus:outline-none focus:border-ys-accent"
              placeholder="My Folder"
              autoFocus
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
        <div className="flex gap-3 mt-6">
          <button
            onClick={handleClose}
            className="flex-1 px-4 py-2 bg-ys-surface-2 hover:bg-ys-border rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="flex-1 px-4 py-2 bg-ys-accent text-ys-on-accent hover:opacity-90 font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
