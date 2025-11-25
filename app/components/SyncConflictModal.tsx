"use client";

import React from "react";
import { DynamicIcon } from "./DynamicIcon";

interface SyncConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  storyName: string;
  localUpdatedAt: Date;
  serverUpdatedAt: string;
  localPartCount: number;
  serverPartCount: number;
  onKeepLocal: () => void;
  onKeepServer: () => void;
}

export default function SyncConflictModal({
  isOpen,
  onClose,
  storyName,
  localUpdatedAt,
  serverUpdatedAt,
  localPartCount,
  serverPartCount,
  onKeepLocal,
  onKeepServer,
}: SyncConflictModalProps) {
  if (!isOpen) return null;

  const formatDate = (date: Date | string) => {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const localTime = new Date(localUpdatedAt).getTime();
  const serverTime = new Date(serverUpdatedAt).getTime();
  const localIsNewer = localTime > serverTime;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-linear-to-b from-blue-950 via-blue-950 to-indigo-950 rounded-2xl shadow-2xl border border-amber-500/50 max-w-lg w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-amber-500/30 bg-amber-500/10">
          <div className="p-2 bg-amber-500/20 rounded-lg">
            <DynamicIcon
              name="AlertTriangle"
              className="w-6 h-6 text-amber-400"
            />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Sync Conflict</h2>
            <p className="text-sm text-amber-200/80">{storyName}</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <p className="text-gray-300 text-sm">
            This story has been modified both locally and on the server. Which
            version would you like to keep?
          </p>

          {/* Version comparison */}
          <div className="grid grid-cols-2 gap-3">
            {/* Local version */}
            <button
              onClick={onKeepLocal}
              className={`p-4 rounded-xl border-2 transition-all text-left ${
                localIsNewer
                  ? "border-green-500/50 bg-green-500/10 hover:border-green-400"
                  : "border-purple-500/30 bg-purple-500/5 hover:border-purple-400"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <DynamicIcon
                  name="Smartphone"
                  className="w-4 h-4 text-blue-400"
                />
                <span className="font-semibold text-white text-sm">
                  This Device
                </span>
                {localIsNewer && (
                  <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">
                    Newer
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-400 space-y-1">
                <div className="flex items-center gap-1">
                  <DynamicIcon name="Clock" className="w-3 h-3" />
                  {formatDate(localUpdatedAt)}
                </div>
                <div className="flex items-center gap-1">
                  <DynamicIcon name="FileText" className="w-3 h-3" />
                  {localPartCount} scenes
                </div>
              </div>
            </button>

            {/* Server version */}
            <button
              onClick={onKeepServer}
              className={`p-4 rounded-xl border-2 transition-all text-left ${
                !localIsNewer
                  ? "border-green-500/50 bg-green-500/10 hover:border-green-400"
                  : "border-purple-500/30 bg-purple-500/5 hover:border-purple-400"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <DynamicIcon name="Cloud" className="w-4 h-4 text-purple-400" />
                <span className="font-semibold text-white text-sm">Cloud</span>
                {!localIsNewer && (
                  <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">
                    Newer
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-400 space-y-1">
                <div className="flex items-center gap-1">
                  <DynamicIcon name="Clock" className="w-3 h-3" />
                  {formatDate(serverUpdatedAt)}
                </div>
                <div className="flex items-center gap-1">
                  <DynamicIcon name="FileText" className="w-3 h-3" />
                  {serverPartCount} scenes
                </div>
              </div>
            </button>
          </div>

          <p className="text-xs text-gray-500 text-center">
            The other version will be permanently overwritten.
          </p>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-purple-900/50 bg-blue-900/20">
          <button
            onClick={onClose}
            className="w-full py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Decide Later
          </button>
        </div>
      </div>
    </div>
  );
}
