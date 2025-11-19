"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";

export type NotificationType = "success" | "failure" | "info" | "warning";

export interface Notification {
  id: string;
  message: string;
  type: NotificationType;
  duration?: number;
}

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (
    message: string,
    type: NotificationType,
    duration?: number
  ) => void;
  removeNotification: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined
);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [queue, setQueue] = useState<Omit<Notification, "id">[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const processQueue = useCallback(() => {
    if (isProcessing || queue.length === 0) return;

    setIsProcessing(true);
    const nextNotification = queue[0];
    const id = Math.random().toString(36).substring(2, 9);
    const notification: Notification = { id, ...nextNotification };

    setNotifications((prev) => [...prev, notification]);
    setQueue((prev) => prev.slice(1));

    // Auto-remove after duration
    if (nextNotification.duration && nextNotification.duration > 0) {
      setTimeout(() => {
        removeNotification(id);
        setIsProcessing(false);
      }, nextNotification.duration);
    } else {
      setIsProcessing(false);
    }
  }, [queue, isProcessing]);

  // Process queue when it changes
  useEffect(() => {
    if (!isProcessing && queue.length > 0) {
      // Small delay between notifications for readability
      setTimeout(() => processQueue(), 300);
    }
  }, [queue, isProcessing, processQueue]);

  const addNotification = useCallback(
    (message: string, type: NotificationType, duration = 4000) => {
      setQueue((prev) => [...prev, { message, type, duration }]);
    },
    []
  );

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return (
    <NotificationContext.Provider
      value={{ notifications, addNotification, removeNotification }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotification must be used within NotificationProvider");
  }
  return context;
}
