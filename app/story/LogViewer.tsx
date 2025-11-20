"use client";

import { useState, useEffect, useRef } from "react";
import { logger, LogEntry } from "../misc/logger";
import { DynamicIcon } from "../components/DynamicIcon";

export default function LogViewer() {
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
        return "text-red-500";
      case "warning":
        return "text-yellow-500";
      case "ai_request":
        return "text-blue-500";
      case "ai_response":
        return "text-green-500";
      case "action":
        return "text-purple-500";
      case "state_change":
        return "text-orange-500";
      default:
        return "text-gray-500 dark:text-gray-400";
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
        <h3 className="font-bold text-lg text-gray-900 dark:text-white">
          Session Log
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => {
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
              const blob = new Blob([text], { type: "text/plain" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `story-log-${Date.now()}.txt`;
              a.click();
            }}
            className="px-3 py-1 text-sm bg-blue-100 text-blue-600 rounded hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 flex items-center gap-1"
          >
            <DynamicIcon name="Download" className="w-4 h-4" /> Export
          </button>
          <button
            onClick={() => logger.clear()}
            className="px-3 py-1 text-sm bg-red-100 text-red-600 rounded hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 flex items-center gap-1"
          >
            <DynamicIcon name="Trash2" className="w-4 h-4" /> Clear
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-xs bg-white dark:bg-gray-800">
        {logs.length === 0 && (
          <div className="text-center text-gray-400 py-8">
            No logs recorded in this session.
          </div>
        )}
        {logs.map((log, i) => (
          <div
            key={i}
            className="border-b border-gray-100 dark:border-gray-700 pb-2 last:border-0"
          >
            <div className="flex gap-2 mb-1">
              <span className="text-gray-400">
                [{formatTime(log.timestamp)}]
              </span>
              <span className={`font-bold uppercase ${getColor(log.type)}`}>
                {log.type}
              </span>
            </div>
            <div className="text-gray-800 dark:text-gray-200 wrap-break-words whitespace-pre-wrap">
              {log.message}
            </div>
            {log.data && (
              <details className="mt-1">
                <summary className="cursor-pointer text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 select-none">
                  Data Payload
                </summary>
                <pre className="bg-gray-50 dark:bg-gray-900 p-2 rounded mt-1 overflow-x-auto text-gray-600 dark:text-gray-300">
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
