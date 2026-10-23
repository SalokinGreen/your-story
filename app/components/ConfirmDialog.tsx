"use client";

import { useBackHandler } from "../misc/useBackHandler";
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
  confirmButtonClass,
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

  // Android back cancels (decision 133).
  useBackHandler(isOpen, onCancel);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 ys-modal-backdrop flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="ys-modal p-6 max-w-md w-full animate-in zoom-in-95 duration-200">
        {/* Icon & Title */}
        <div className="flex items-center gap-3 mb-4">
          <DynamicIcon
            name={icon as any}
            className="w-10 h-10 text-ys-text"
          />
          <h3 className="text-xl font-bold text-ys-text">
            {title}
          </h3>
        </div>

        {/* Message */}
        <p className="text-ys-muted mb-6 leading-relaxed">
          {message}
        </p>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 bg-ys-text/5 hover:bg-ys-text/10 border border-ys-border text-ys-text font-semibold rounded-lg transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            // A caller that passes a confirmButtonClass is asking for the
            // destructive look (they used to pass red classes); the theme's
            // danger button covers it, whatever the string says. The default is
            // the theme's primary button.
            className={`flex-1 px-4 py-3 font-semibold rounded-lg transition-colors ys-button ${
              confirmButtonClass ? "ys-button--danger" : "ys-button--primary"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
