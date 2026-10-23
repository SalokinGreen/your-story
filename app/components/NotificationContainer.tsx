"use client";

import { useNotification } from "../misc/NotificationContext";
import { useEffect, useState } from "react";
import { DynamicIcon } from "./DynamicIcon";

export default function NotificationContainer() {
  const { notifications, removeNotification } = useNotification();

  return (
    <div className="fixed top-4 right-4 z-100 flex flex-col gap-2 pointer-events-none max-w-sm w-full px-4">
      {notifications.map((notification) => (
        <NotificationToast
          key={notification.id}
          notification={notification}
          onRemove={() => removeNotification(notification.id)}
        />
      ))}
    </div>
  );
}

function NotificationToast({
  notification,
  onRemove,
}: {
  notification: { id: string; message: string; type: string };
  onRemove: () => void;
}) {
  const [isExiting, setIsExiting] = useState(false);
  const [progress, setProgress] = useState(100);

  // Auto-dismiss with progress bar
  useEffect(() => {
    const duration = 4000;
    const interval = 50;
    const step = (interval / duration) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev <= 0) {
          handleRemove();
          return 0;
        }
        return prev - step;
      });
    }, interval);

    return () => clearInterval(timer);
  }, []);

  const handleRemove = () => {
    setIsExiting(true);
    setTimeout(() => {
      onRemove();
    }, 300);
  };

  const getStyles = () => {
    switch (notification.type) {
      case "success":
        return "bg-ys-surface border-ys-success text-ys-text";
      case "failure":
        return "bg-ys-surface border-ys-danger text-ys-text";
      case "warning":
        return "bg-ys-surface border-ys-warning text-ys-text";
      case "info":
      default:
        return "bg-ys-surface border-ys-accent text-ys-text";
    }
  };

  const getIconBg = () => {
    switch (notification.type) {
      case "success":
        return "bg-ys-success";
      case "failure":
        return "bg-ys-danger";
      case "warning":
        return "bg-ys-warning";
      case "info":
      default:
        return "bg-ys-accent";
    }
  };

  const getProgressColor = () => {
    switch (notification.type) {
      case "success":
        return "bg-ys-success";
      case "failure":
        return "bg-ys-danger";
      case "warning":
        return "bg-ys-warning";
      case "info":
      default:
        return "bg-ys-accent";
    }
  };

  const getIcon = () => {
    switch (notification.type) {
      case "success":
        return <DynamicIcon name="Check" className="w-4 h-4 text-ys-bg" />;
      case "failure":
        return <DynamicIcon name="X" className="w-4 h-4 text-ys-bg" />;
      case "warning":
        return (
          <DynamicIcon name="AlertTriangle" className="w-4 h-4 text-ys-bg" />
        );
      case "info":
      default:
        return <DynamicIcon name="Info" className="w-4 h-4 text-ys-bg" />;
    }
  };

  return (
    <div
      className={`
        ${getStyles()}
        border-l-4 rounded-lg shadow-lg overflow-hidden
        pointer-events-auto cursor-pointer
        transition-all duration-300 ease-out backdrop-blur-sm
        ${
          isExiting
            ? "opacity-0 translate-x-full scale-95"
            : "opacity-100 translate-x-0 animate-slide-in"
        }
      `}
      onClick={handleRemove}
    >
      <div className="p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <span
            className={`shrink-0 flex items-center justify-center w-6 h-6 rounded-full ${getIconBg()}`}
          >
            {getIcon()}
          </span>
          <p className="text-sm font-medium flex-1 wrap-break-word pt-0.5 max-h-40 overflow-y-auto">
            {notification.message}
          </p>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleRemove();
            }}
            className="shrink-0 p-1 rounded hover:bg-ys-text/10 transition-colors"
          >
            <DynamicIcon name="X" className="w-4 h-4 opacity-50" />
          </button>
        </div>
      </div>
      {/* Progress bar */}
      <div className="h-1 bg-ys-text/10">
        <div
          className={`h-full ${getProgressColor()} transition-all duration-50 ease-linear`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
