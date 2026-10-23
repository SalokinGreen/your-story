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
      color: "text-ys-success",
      title: "Synced with cloud",
    },
    pending: {
      icon: "CloudUpload" as const,
      color: "text-ys-accent animate-pulse",
      title: "Syncing...",
    },
    conflict: {
      icon: "AlertTriangle" as const,
      color: "text-ys-warning",
      title: "Sync conflict",
    },
    "local-only": {
      icon: "HardDrive" as const,
      color: "text-ys-muted",
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
