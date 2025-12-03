"use client";

import { useEffect, useCallback } from "react";
import { DynamicIcon } from "./DynamicIcon";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmButtonClass?: string;
  onConfirm: () => void;
  onCancel: () => void;
  icon?: string;
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  confirmButtonClass = "bg-purple-600 hover:bg-purple-700",
  onConfirm,
  onCancel,
  icon = "AlertTriangle",
}: ConfirmDialogProps) {
  // Keyboard shortcuts: Enter to confirm, Escape to cancel
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    },
    [onConfirm, onCancel]
  );

  useEffect(() => {
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-blue-950 rounded-2xl shadow-2xl p-6 max-w-md w-full border-2 border-gray-200 dark:border-gray-700 animate-in zoom-in-95 duration-200">
        {/* Icon & Title */}
        <div className="flex items-center gap-3 mb-4">
          <DynamicIcon
            name={icon as any}
            className="w-10 h-10 text-gray-900 dark:text-white"
          />
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
            {title}
          </h3>
        </div>

        {/* Message */}
        <p className="text-gray-700 dark:text-gray-300 mb-6 leading-relaxed">
          {message}
        </p>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 bg-gray-200 dark:bg-gray-900 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold rounded-lg transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-3 text-white font-semibold rounded-lg transition-colors ${confirmButtonClass}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
