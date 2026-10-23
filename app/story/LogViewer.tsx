"use client";

import { useState, useEffect, useRef } from "react";
import { logger, LogEntry } from "../misc/logger";
import { DynamicIcon } from "../components/DynamicIcon";
import { saveFile } from "../misc/saveFile";
import { useNotification } from "../misc/NotificationContext";
import { useFitToViewport } from "../misc/useFitToViewport";

export default function LogViewer() {
  const { ref: panelRef, height: panelHeight } =
    useFitToViewport<HTMLDivElement>();
  const { addNotification } = useNotification();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initial load
    setLogs(logger.getLogs());

    // Listen for updates
    const handleUpdate = () => {
      setLogs(logger.getLogs());
    };

    window.addEventListener("story-log-update", handleUpdate);
    return () => window.removeEventListener("story-log-update", handleUpdate);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getColor = (type: LogEntry["type"]) => {
    switch (type) {
      case "error":
        return "text-ys-danger";
      case "warning":
        return "text-ys-warning";
      case "ai_request":
        return "text-ys-accent";
      case "ai_response":
        return "text-ys-success";
      case "action":
        return "text-ys-text";
      case "state_change":
        return "text-ys-text/70";
      default:
        return "text-ys-muted";
    }
  };

  return (
    <div
      ref={panelRef}
      style={panelHeight ? { height: panelHeight } : undefined}
      className="flex flex-col h-[calc(100dvh-6.5rem)] bg-ys-surface border border-ys-border rounded-lg shadow-lg overflow-hidden">
      <div className="p-4 border-b border-ys-border flex justify-between items-center bg-ys-surface-2">
        <h3 className="font-bold text-lg text-ys-text">
          Session Log
        </h3>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              const text = logs
                .map(
                  (l) =>
                    `[${new Date(
                      l.timestamp
                    ).toISOString()}] ${l.type.toUpperCase()}: ${l.message} ${
                      l.data ? JSON.stringify(l.data) : ""
                    }`
                )
                .join("\n");
              try {
                const { location } = await saveFile(
                  `story-log-${Date.now()}.txt`,
                  text,
                  "text/plain",
                );
                if (location) addNotification(`Saved to ${location}`, "success");
              } catch (error) {
                logger.error("Could not save the session log", {
                  error: String(error),
                });
                addNotification("Could not save the session log", "failure");
              }
            }}
            className="px-3 py-1 text-sm bg-ys-accent/15 text-ys-accent rounded hover:bg-ys-accent/25 flex items-center gap-1"
          >
            <DynamicIcon name="Download" className="w-4 h-4" /> Export
          </button>
          <button
            onClick={() => logger.clear()}
            className="px-3 py-1 text-sm bg-ys-danger/15 text-ys-danger rounded hover:bg-ys-danger/25 flex items-center gap-1"
          >
            <DynamicIcon name="Trash2" className="w-4 h-4" /> Clear
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-xs bg-ys-surface">
        {logs.length === 0 && (
          <div className="text-center text-ys-muted py-8">
            No logs recorded in this session.
          </div>
        )}
        {logs.map((log, i) => (
          <div
            key={i}
            className="border-b border-ys-border pb-2 last:border-0"
          >
            <div className="flex gap-2 mb-1">
              <span className="text-ys-muted">
                [{formatTime(log.timestamp)}]
              </span>
              <span className={`font-bold uppercase ${getColor(log.type)}`}>
                {log.type}
              </span>
            </div>
            <div className="text-ys-text wrap-break-words whitespace-pre-wrap">
              {log.message}
            </div>
            {log.data && (
              <details className="mt-1">
                <summary className="cursor-pointer text-ys-muted hover:text-ys-text select-none">
                  Data Payload
                </summary>
                <pre className="bg-ys-bg p-2 rounded mt-1 overflow-x-auto text-ys-muted">
                  {JSON.stringify(log.data, null, 2)}
                </pre>
              </details>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
