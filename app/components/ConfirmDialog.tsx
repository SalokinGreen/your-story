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
  confirmButtonClass = "bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 shadow-md shadow-purple-950/40",
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
      <div className="bg-[#0d1829]/95 backdrop-blur-2xl rounded-2xl shadow-2xl shadow-black/50 p-6 max-w-md w-full border border-white/10 animate-in zoom-in-95 duration-200">
        {/* Icon & Title */}
        <div className="flex items-center gap-3 mb-4">
          <DynamicIcon
            name={icon as any}
            className="w-10 h-10 text-white"
          />
          <h3 className="text-xl font-bold text-white">
            {title}
          </h3>
        </div>

        {/* Message */}
        <p className="text-blue-200/80 mb-6 leading-relaxed">
          {message}
        </p>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold rounded-lg transition-colors"
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
