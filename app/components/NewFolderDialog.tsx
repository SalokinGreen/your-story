"use client";

import { useState } from "react";
import { IconPicker } from "@/app/components/IconPicker";

interface NewFolderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, icon: string, color: string) => void;
}

const DEFAULT_ICON = "Folder";
const DEFAULT_COLOR = "#9333ea";

export default function NewFolderDialog({
  isOpen,
  onClose,
  onCreate,
}: NewFolderDialogProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(DEFAULT_ICON);
  const [color, setColor] = useState(DEFAULT_COLOR);

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
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="w-full px-3 py-2 bg-blue-900/50 border border-blue-700/50 rounded-lg text-white placeholder-blue-300/50 focus:outline-none focus:border-purple-500"
              placeholder="My Folder"
              autoFocus
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
        <div className="flex gap-3 mt-6">
          <button
            onClick={handleClose}
            className="flex-1 px-4 py-2 bg-blue-900/50 hover:bg-blue-800/50 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
