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

  const handleRemove = () => {
    setIsExiting(true);
    setTimeout(() => {
      onRemove();
    }, 500); // Match animation duration
  };

  const getStyles = () => {
    switch (notification.type) {
      case "success":
        return "bg-green-100 dark:bg-green-900 border-green-500 text-green-900 dark:text-green-100";
      case "failure":
        return "bg-red-100 dark:bg-red-900 border-red-500 text-red-900 dark:text-red-100";
      case "warning":
        return "bg-yellow-100 dark:bg-yellow-900 border-yellow-500 text-yellow-900 dark:text-yellow-100";
      case "info":
      default:
        return "bg-blue-100 dark:bg-blue-900 border-blue-500 text-blue-900 dark:text-blue-100";
    }
  };

  const getIcon = () => {
    switch (notification.type) {
      case "success":
        return <DynamicIcon name="Check" className="w-5 h-5" />;
      case "failure":
        return <DynamicIcon name="X" className="w-5 h-5" />;
      case "warning":
        return <DynamicIcon name="AlertTriangle" className="w-5 h-5" />;
      case "info":
      default:
        return <DynamicIcon name="Info" className="w-5 h-5" />;
    }
  };

  return (
    <div
      className={`
        ${getStyles()}
        border-l-4 rounded-lg shadow-lg p-3 sm:p-4 
        pointer-events-auto cursor-pointer
        transition-all duration-500 ease-in-out
        ${
          isExiting
            ? "opacity-0 translate-x-full"
            : "opacity-100 translate-x-0 animate-slide-in"
        }
      `}
      onClick={handleRemove}
    >
      <div className="flex items-start gap-2 sm:gap-3">
        <span className="text-lg sm:text-xl font-bold shrink-0 flex items-center justify-center mt-0.5">
          {getIcon()}
        </span>
        <p className="text-sm sm:text-base font-medium flex-1 wrap-break-word">
          {notification.message}
        </p>
      </div>
    </div>
  );
}
