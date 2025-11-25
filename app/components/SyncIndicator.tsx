"use client";

import React from "react";
import { DynamicIcon } from "./DynamicIcon";
import { SyncStatus } from "../misc/localStoryManager";

interface SyncIndicatorProps {
  status: SyncStatus;
  className?: string;
}

export default function SyncIndicator({
  status,
  className = "",
}: SyncIndicatorProps) {
  const config = {
    synced: {
      icon: "CloudCheck" as const,
      color: "text-green-400",
      title: "Synced with cloud",
    },
    pending: {
      icon: "CloudUpload" as const,
      color: "text-blue-400 animate-pulse",
      title: "Syncing...",
    },
    conflict: {
      icon: "AlertTriangle" as const,
      color: "text-amber-400",
      title: "Sync conflict",
    },
    "local-only": {
      icon: "HardDrive" as const,
      color: "text-gray-400",
      title: "Local only",
    },
  };

  const { icon, color, title } = config[status];

  return (
    <div className={`inline-flex items-center ${className}`} title={title}>
      <DynamicIcon name={icon} className={`w-4 h-4 ${color}`} />
    </div>
  );
}
