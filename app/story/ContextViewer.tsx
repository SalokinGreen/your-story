"use client";

import { useState, useEffect } from "react";
import { StoryData } from "../misc/structs";
import { buildMessages, storyDataToString, ChatMessage } from "../misc/ai";
import { DynamicIcon } from "../components/DynamicIcon";
import { getModelConfig } from "../misc/ai_prices";

interface ContextViewerProps {
  storyData: StoryData;
}

export default function ContextViewer({ storyData }: ContextViewerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [useRawContext, setUseRawContext] = useState(false);
  const [contextString, setContextString] = useState("");
  const [estimatedTokens, setEstimatedTokens] = useState(0);
  const [selectedModel, setSelectedModel] = useState("Prometheus");
  const [showRawJSON, setShowRawJSON] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    // Get current model from localStorage
    const model =
      typeof window !== "undefined"
        ? localStorage.getItem("aiModel") || "Prometheus"
        : "Prometheus";
    setSelectedModel(model);

    // Get model config to determine maxTokens
    const modelConfig = getModelConfig(model);
    const maxTokens = modelConfig.maxTokens;

    console.log("🔍 Context Viewer Debug:", {
      modelName: modelConfig.name,
      maxTokens,
      sceneParts: storyData.scene.parts.length,
      memoryEntries: storyData.memory.length,
      loreEntries: storyData.lore.filter((l) => l.on !== false).length,
    });

    // Build messages using the same function as the API
    const { messages: contextMessages } = buildMessages({
      storyData,
      userChoice: undefined,
      useRawContext,
      maxTokens,
      supportsToolCalling: false, // Context viewer doesn't need tool schemas
    });

    setMessages(contextMessages);

    // Build context string
    const contextStr = storyDataToString(storyData);
    setContextString(contextStr);

    // Estimate tokens (rough approximation: 1 token ≈ 4 characters)
    const totalChars = contextMessages.reduce(
      (sum, msg) => sum + msg.content.length,
      0
    );
    const estimatedTokenCount = Math.ceil(totalChars / 4);
    setEstimatedTokens(estimatedTokenCount);

    console.log("📊 Context Statistics:", {
      totalMessages: contextMessages.length,
      totalChars,
      estimatedTokens: estimatedTokenCount,
      utilizationPercent:
        ((estimatedTokenCount / maxTokens) * 100).toFixed(1) + "%",
      availableSceneParts: storyData.scene.parts.length,
      includedSceneParts: contextMessages.filter(
        (m) => m.role !== "system" && m !== contextMessages[1]
      ).length,
      reservedTokens: 2000,
      availableAfterReserve: maxTokens - 2000,
      allocatedToMemory: Math.floor((maxTokens - 2000) * 0.25),
      allocatedToStoryParts: Math.floor((maxTokens - 2000) * 0.75),
      messagesBreakdown: contextMessages.map((msg, i) => ({
        index: i,
        role: msg.role,
        chars: msg.content.length,
        tokens: Math.ceil(msg.content.length / 4),
        preview:
          msg.content.substring(0, 100) +
          (msg.content.length > 100 ? "..." : ""),
      })),
    });
  }, [storyData, useRawContext]);

  const formatRole = (role: ChatMessage["role"]) => {
    switch (role) {
      case "system":
        return "SYSTEM";
      case "user":
        return "USER";
      case "assistant":
        return "ASSISTANT";
    }
  };

  const getRoleColor = (role: ChatMessage["role"]) => {
    switch (role) {
      case "system":
        return "text-purple-600 dark:text-purple-400";
      case "user":
        return "text-blue-600 dark:text-blue-400";
      case "assistant":
        return "text-green-600 dark:text-green-400";
      default:
        return "text-gray-600 dark:text-gray-400";
    }
  };

  const getRoleBgColor = (role: ChatMessage["role"]) => {
    switch (role) {
      case "system":
        return "bg-purple-50 dark:bg-purple-900/20";
      case "user":
        return "bg-blue-50 dark:bg-blue-900/20";
      case "assistant":
        return "bg-green-50 dark:bg-green-900/20";
      default:
        return "bg-gray-50 dark:bg-gray-900/20";
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const downloadAsJSON = () => {
    const jsonData = JSON.stringify(messages, null, 2);
    const blob = new Blob([jsonData], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `context-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAsText = () => {
    const textData = messages
      .map((msg) => `=== ${formatRole(msg.role)} ===\n\n${msg.content}\n\n`)
      .join("\n");
    const blob = new Blob([textData], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `context-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const modelConfig = getModelConfig(selectedModel);

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] bg-white dark:bg-blue-950 rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <div className="p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 space-y-2">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-base sm:text-lg text-gray-900 dark:text-white flex items-center gap-2">
            <DynamicIcon name="Eye" className="w-5 h-5" />
            AI Context Viewer
          </h3>
          <div className="flex gap-1 sm:gap-2">
            <button
              onClick={() => setShowInfo(!showInfo)}
              className="px-2 sm:px-3 py-1 text-xs sm:text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-600 flex items-center gap-1"
              title="Toggle info"
            >
              <DynamicIcon
                name={showInfo ? "ChevronUp" : "ChevronDown"}
                className="w-4 h-4"
              />
              <span className="hidden sm:inline">Info</span>
            </button>
            <button
              onClick={downloadAsText}
              className="px-2 sm:px-3 py-1 text-xs sm:text-sm bg-green-100 text-green-600 rounded hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 flex items-center gap-1"
              title="Download as text file"
            >
              <DynamicIcon name="FileText" className="w-4 h-4" />
              <span className="hidden sm:inline">TXT</span>
            </button>
            <button
              onClick={downloadAsJSON}
              className="px-2 sm:px-3 py-1 text-xs sm:text-sm bg-blue-100 text-blue-600 rounded hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 flex items-center gap-1"
              title="Download as JSON"
            >
              <DynamicIcon name="Download" className="w-4 h-4" />
              <span className="hidden sm:inline">JSON</span>
            </button>
          </div>
        </div>

        {showInfo && (
          <>
            {/* Stats and Options */}
            <div className="flex flex-wrap gap-2 items-center text-xs sm:text-sm">
              <div className="px-2 sm:px-3 py-1 bg-white dark:bg-blue-950 rounded border border-gray-200 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">
                  Messages:
                </span>{" "}
                <span className="font-semibold text-gray-900 dark:text-white">
                  {messages.length}
                </span>
              </div>
              <div className="px-2 sm:px-3 py-1 bg-white dark:bg-blue-950 rounded border border-gray-200 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">
                  Tokens:
                </span>{" "}
                <span className="font-semibold text-gray-900 dark:text-white">
                  {estimatedTokens.toLocaleString()}
                </span>
              </div>
              <div className="px-2 sm:px-3 py-1 bg-white dark:bg-blue-950 rounded border border-gray-200 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">
                  Context:
                </span>{" "}
                <span className="font-semibold text-gray-900 dark:text-white">
                  {(modelConfig.maxTokens / 1000).toFixed(0)}K
                </span>
              </div>
              <div
                className={`px-2 sm:px-3 py-1 rounded border text-xs ${
                  estimatedTokens > modelConfig.maxTokens * 0.9
                    ? "bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-700 dark:text-red-400"
                    : estimatedTokens > modelConfig.maxTokens * 0.7
                    ? "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700 text-yellow-700 dark:text-yellow-400"
                    : "bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-700 dark:text-green-400"
                }`}
              >
                {estimatedTokens > modelConfig.maxTokens * 0.9
                  ? "⚠️ Near Limit"
                  : estimatedTokens > modelConfig.maxTokens * 0.7
                  ? "⚡ High Usage"
                  : "✓ Normal"}
              </div>
            </div>

            {/* Toggles */}
            <div className="flex flex-wrap gap-2 sm:gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useRawContext}
                  onChange={(e) => setUseRawContext(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                  Use Raw AI Output
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showRawJSON}
                  onChange={(e) => setShowRawJSON(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                  Show Raw JSON
                </span>
              </label>
            </div>

            {/* Token Breakdown */}
            <details className="text-xs bg-white dark:bg-blue-950 rounded border border-gray-200 dark:border-gray-700">
              <summary className="cursor-pointer px-2 sm:px-3 py-2 font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded">
                <DynamicIcon name="PieChart" className="w-3 h-3 inline mr-1" />
                Token Breakdown
              </summary>
              <div className="p-2 sm:p-3 space-y-2 border-t border-gray-200 dark:border-gray-700">
                {messages.map((msg, i) => {
                  const tokens = Math.ceil(msg.content.length / 4);
                  const percentage = ((tokens / estimatedTokens) * 100).toFixed(
                    1
                  );
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-2"
                    >
                      <span
                        className={`${getRoleColor(
                          msg.role
                        )} font-medium truncate`}
                      >
                        {i}. {formatRole(msg.role)}
                      </span>
                      <span className="text-gray-600 dark:text-gray-400 whitespace-nowrap text-xs">
                        {tokens.toLocaleString()}t ({percentage}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </details>

            <div className="text-xs text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
              <DynamicIcon name="Info" className="w-3 h-3 inline mr-1" />
              This shows the exact context sent to the AI. The first USER
              message contains all game state. Scene parts are trimmed to fit
              75% context allocation.
            </div>
          </>
        )}
      </div>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-3 sm:space-y-4">
        {showRawJSON ? (
          <pre className="bg-gray-50 dark:bg-gray-900 p-3 sm:p-4 rounded text-xs overflow-x-auto text-gray-800 dark:text-gray-200 font-mono mx-2 sm:mx-4">
            {JSON.stringify(messages, null, 2)}
          </pre>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`${getRoleBgColor(
                msg.role
              )} rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 mx-2 sm:mx-4`}
            >
              <div className="flex justify-between items-center p-2 sm:p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-blue-950">
                <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                  <DynamicIcon
                    name={
                      msg.role === "system"
                        ? "Settings"
                        : msg.role === "user"
                        ? "User"
                        : "Bot"
                    }
                    className={`w-4 h-4 shrink-0 ${getRoleColor(msg.role)}`}
                  />
                  <span
                    className={`font-bold text-xs sm:text-sm ${getRoleColor(
                      msg.role
                    )}`}
                  >
                    {formatRole(msg.role)}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate hidden sm:inline">
                    ({msg.content.length.toLocaleString()} chars, ~
                    {Math.ceil(msg.content.length / 4).toLocaleString()} tokens)
                  </span>
                </div>
                <button
                  onClick={() => copyToClipboard(msg.content)}
                  className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-900 hover:bg-gray-300 dark:hover:bg-gray-600 rounded flex items-center gap-1 shrink-0"
                  title="Copy to clipboard"
                >
                  <DynamicIcon name="Copy" className="w-3 h-3" />
                  <span className="hidden sm:inline">Copy</span>
                </button>
              </div>
              <div className="p-3 sm:p-4">
                <pre className="whitespace-pre-wrap wrap-break-word text-xs sm:text-sm text-gray-800 dark:text-gray-200 font-sans">
                  {msg.content}
                </pre>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
