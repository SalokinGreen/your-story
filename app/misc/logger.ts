export interface LogEntry {
  timestamp: number;
  type:
    | "info"
    | "warning"
    | "error"
    | "action"
    | "ai_request"
    | "ai_response"
    | "state_change";
  message: string;
  data?: any;
}

const SESSION_STORAGE_KEY = "your-story:session-log";

export const logger = {
  log: (type: LogEntry["type"], message: string, data?: any) => {
    if (typeof window === "undefined") return;

    const entry: LogEntry = {
      timestamp: Date.now(),
      type,
      message,
      data,
    };

    try {
      const existingLogs = logger.getLogs();
      existingLogs.push(entry);
      // Limit logs to prevent storage overflow (e.g., last 1000 entries)
      if (existingLogs.length > 1000) {
        existingLogs.shift();
      }
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(existingLogs));

      // Dispatch event for real-time updates
      window.dispatchEvent(
        new CustomEvent("story-log-update", { detail: entry })
      );
    } catch (e) {
      console.error("Failed to save log", e);
    }
  },

  info: (message: string, data?: any) => logger.log("info", message, data),
  warn: (message: string, data?: any) => logger.log("warning", message, data),
  error: (message: string, data?: any) => logger.log("error", message, data),
  action: (message: string, data?: any) => logger.log("action", message, data),
  ai_request: (message: string, data?: any) =>
    logger.log("ai_request", message, data),
  ai_response: (message: string, data?: any) =>
    logger.log("ai_response", message, data),
  state_change: (message: string, data?: any) =>
    logger.log("state_change", message, data),

  getLogs: (): LogEntry[] => {
    if (typeof window === "undefined") return [];
    try {
      const logs = sessionStorage.getItem(SESSION_STORAGE_KEY);
      return logs ? JSON.parse(logs) : [];
    } catch (e) {
      console.error("Failed to parse logs", e);
      return [];
    }
  },

  clear: () => {
    if (typeof window === "undefined") return;
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("story-log-update"));
  },
};
