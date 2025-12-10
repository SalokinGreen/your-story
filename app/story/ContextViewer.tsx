"use client";

import { useState, useEffect, useRef } from "react";
import { StoryData, getMemoryContents } from "../misc/structs";
import {
  buildStoryPrompt,
  buildToolPrompt,
  buildActionAnalysisPrompt,
  buildGMStagePrompt,
  ChatMessage,
  buildInfoMessage,
  EmbeddingContext,
} from "../misc/ai_staged";
import { DynamicIcon } from "../components/DynamicIcon";
import { getModelConfig, MODEL_PRESETS } from "../misc/ai_prices";

interface ContextViewerProps {
  storyData: StoryData;
}

export default function ContextViewer({ storyData }: ContextViewerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeStage, setActiveStage] = useState<
    "story" | "tools" | "actions" | "gm"
  >("story");
  const [gmStageEnabled, setGmStageEnabled] = useState(true);
  const [contextString, setContextString] = useState("");
  const [estimatedTokens, setEstimatedTokens] = useState(0);
  const [activeModelName, setActiveModelName] = useState("Deepseek Chat");
  const [activeModelConfig, setActiveModelConfig] = useState(
    getModelConfig("Deepseek Chat")
  );
  const [showRawJSON, setShowRawJSON] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showStateChanges, setShowStateChanges] = useState(false);
  const [showGMToolCalls, setShowGMToolCalls] = useState(false);
  const [prunedParts, setPrunedParts] = useState(0);
  const [embeddingsEnabled, setEmbeddingsEnabled] = useState(false);
  const [embeddingThreshold, setEmbeddingThreshold] = useState(0.25);
  const [prefillEnabled, setPrefillEnabled] = useState(true);
  const [embeddingStats, setEmbeddingStats] = useState<{
    loreCount: number;
    memoryCount: number;
    totalLore: number;
    totalMemory: number;
  } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  const scrollToTop = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
  };

  useEffect(() => {
    // Check embeddings setting
    const embEnabled =
      typeof window !== "undefined"
        ? localStorage.getItem("embeddingsEnabled") === "true"
        : false;
    setEmbeddingsEnabled(embEnabled);

    const embThreshold =
      typeof window !== "undefined"
        ? parseFloat(localStorage.getItem("embeddingThreshold") || "0.25")
        : 0.25;
    setEmbeddingThreshold(embThreshold);

    // Check prefill setting (default: true)
    const prefillSetting =
      typeof window !== "undefined" ? localStorage.getItem("usePrefill") : null;
    // If not set, default to true
    setPrefillEnabled(prefillSetting !== "false");

    // Check GM stage setting (default: true)
    const gmEnabled =
      typeof window !== "undefined"
        ? localStorage.getItem("gmStageEnabled") !== "false"
        : true;
    setGmStageEnabled(gmEnabled);

    // Get current preset and custom model overrides from localStorage
    const currentPreset =
      typeof window !== "undefined"
        ? localStorage.getItem("aiPreset") || "custom"
        : "custom";

    const customStoryModel =
      typeof window !== "undefined"
        ? localStorage.getItem("aiModelStory") || ""
        : "";
    const customToolsModel =
      typeof window !== "undefined"
        ? localStorage.getItem("aiModelTools") || ""
        : "";
    const customChoicesModel =
      typeof window !== "undefined"
        ? localStorage.getItem("aiModelChoices") || ""
        : "";

    // Get preset config (fallback to main if invalid)
    const preset = MODEL_PRESETS[currentPreset] || MODEL_PRESETS["custom"];

    // Determine effective models - use custom only if preset is "custom" AND value is set
    const effectiveStoryModel =
      currentPreset === "custom" && customStoryModel
        ? customStoryModel
        : preset.storyModel;
    const effectiveToolsModel =
      currentPreset === "custom" && customToolsModel
        ? customToolsModel
        : preset.toolsModel;
    const effectiveChoicesModel =
      currentPreset === "custom" && customChoicesModel
        ? customChoicesModel
        : preset.choicesModel;

    // Select the model based on active stage
    const currentModel =
      activeStage === "story"
        ? effectiveStoryModel
        : activeStage === "tools" || activeStage === "gm"
        ? effectiveToolsModel
        : effectiveChoicesModel;
    const modelConfig = getModelConfig(currentModel);
    setActiveModelName(currentModel);
    setActiveModelConfig(modelConfig);

    const maxTokens = modelConfig.maxTokens;

    // Calculate embedding stats - what WOULD be sent if embeddings were active
    const activeLoreCount = storyData.lore.filter((l) => l.on !== false).length;
    const totalLoreCount = storyData.lore.length;
    const totalMemoryCount = storyData.memory.length;

    // Embeddings would retrieve up to 8 lore and 15 memories (defaults from EMBEDDING_CONFIG)
    const embeddingLoreLimit = Math.min(8, activeLoreCount);
    const embeddingMemoryLimit = Math.min(15, totalMemoryCount);

    setEmbeddingStats({
      loreCount: embeddingLoreLimit,
      memoryCount: embeddingMemoryLimit,
      totalLore: totalLoreCount,
      totalMemory: totalMemoryCount,
    });

    console.log("🔍 Context Viewer Debug:", {
      modelName: modelConfig.name,
      maxTokens,
      sceneParts: storyData.scene.parts.length,
      memoryEntries: storyData.memory.length,
      loreEntries: storyData.lore.filter((l) => l.on !== false).length,
      activeStage,
      embeddingsEnabled: embEnabled,
    });

    // Build messages using the SAME functions as generation.ts
    let contextMessages: ChatMessage[] = [];
    let prunedCount = 0;

    // If embeddings are enabled, simulate what the embedding context would look like
    // We can't do a real semantic search without a query, so we show top entries by recency/importance
    let simulatedEmbeddingContext: EmbeddingContext | undefined = undefined;

    if (embEnabled && activeStage === "story") {
      // Simulate embedding retrieval: show first 8 lore titles and first 15 memories
      // In reality, these would be semantically selected based on user's choice
      const activeLore = storyData.lore.filter(
        (l) => l.enabled !== false && l.on !== false
      );
      const simulatedLoreTitles = activeLore.slice(0, 8).map((l) => l.title);
      const simulatedMemories = getMemoryContents(storyData.memory.slice(-15)); // Most recent 15

      // Always use embedding context when enabled
      simulatedEmbeddingContext = {
        loreTitles: simulatedLoreTitles,
        memories: simulatedMemories,
      };
    }

    // Get actual GM context from last assistant part (if available)
    // Falls back to a sample if no real GM context exists
    const lastAssistantPart = [...storyData.scene.parts]
      .reverse()
      .find((p) => !p.user);
    const actualGMContext = lastAssistantPart?.gmStoryContext;
    const sampleGMContext = gmEnabled
      ? actualGMContext ||
        "[Perception Check: SUCCESS | Roll: 1d100 = 72 vs DC 50 (Average)]\n[Stakes: Notice something unusual]\n[Intended consequence: You spot hidden details]"
      : undefined;

    switch (activeStage) {
      case "story":
        const storyPrompt = buildStoryPrompt({
          storyData,
          userChoice: undefined,
          modelName: effectiveStoryModel,
          embeddingContext: simulatedEmbeddingContext,
          usePrefill: prefillSetting !== "false",
          gmStoryContext: sampleGMContext, // Show actual GM context if available, else sample
        });
        contextMessages = storyPrompt.messages;
        prunedCount = storyPrompt.prunedParts;
        break;
      case "tools":
        const toolPrompt = buildToolPrompt({
          storyData,
          storyContent: "(Story content from previous stage would go here)",
          embeddingContext: simulatedEmbeddingContext,
          usePrefill: prefillSetting !== "false",
        });
        contextMessages = toolPrompt.messages;
        break;
      case "gm":
        const gmPrompt = buildGMStagePrompt({
          storyData,
          userChoice: "(Player's action would go here)",
        });
        contextMessages = gmPrompt.messages;
        break;
      case "actions":
        const actionsPrompt = buildActionAnalysisPrompt({
          storyData,
          userAction: "(Player's freeform action text would go here)",
        });
        contextMessages = actionsPrompt.messages;
        break;
    }

    setMessages(contextMessages);
    setPrunedParts(prunedCount);

    // Build info string for display (with embedding context if applicable)
    const infoStr = buildInfoMessage(storyData, simulatedEmbeddingContext);
    setContextString(infoStr);

    // Estimate tokens (rough approximation: 1 token ≈ 4 characters)
    const totalChars = contextMessages.reduce(
      (sum, msg) => sum + msg.content.length,
      0
    );
    const estimatedTokenCount = Math.ceil(totalChars / 4);
    setEstimatedTokens(estimatedTokenCount);

    console.log("📊 Context Statistics:", {
      stage: activeStage,
      totalMessages: contextMessages.length,
      totalChars,
      estimatedTokens: estimatedTokenCount,
      utilizationPercent:
        ((estimatedTokenCount / maxTokens) * 100).toFixed(1) + "%",
      availableSceneParts: storyData.scene.parts.length,
      includedSceneParts:
        contextMessages.filter(
          (m) => m.role === "user" || m.role === "assistant"
        ).length - 1, // Subtract the info message
      prunedParts: prunedCount,
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
  }, [storyData, activeStage]);

  const formatRole = (role: ChatMessage["role"]) => {
    switch (role) {
      case "system":
        return "SYSTEM";
      case "user":
        return "USER";
      case "assistant":
        return "ASSISTANT";
      case "tool":
        return "TOOL";
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
      case "tool":
        return "text-orange-600 dark:text-orange-400";
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
      case "tool":
        return "bg-orange-50 dark:bg-orange-900/20";
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
    a.download = `context-${activeStage}-${Date.now()}.json`;
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
    a.download = `context-${activeStage}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

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

        {/* Stage Selector Tabs */}
        <div className="flex gap-1 bg-gray-200 dark:bg-gray-800 p-1 rounded-lg">
          <button
            onClick={() => setActiveStage("story")}
            className={`flex-1 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors ${
              activeStage === "story"
                ? "bg-white dark:bg-blue-950 text-purple-600 dark:text-purple-400 shadow"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            <DynamicIcon name="BookOpen" className="w-3 h-3 inline mr-1" />
            Story
          </button>
          <button
            onClick={() => setActiveStage("tools")}
            className={`flex-1 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors ${
              activeStage === "tools"
                ? "bg-white dark:bg-blue-950 text-orange-600 dark:text-orange-400 shadow"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            <DynamicIcon name="Wrench" className="w-3 h-3 inline mr-1" />
            Tools
          </button>
          {/* Show GM State tab when GM stage is enabled, otherwise show Actions */}
          {gmStageEnabled ? (
            <button
              onClick={() => setActiveStage("gm")}
              className={`flex-1 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                activeStage === "gm"
                  ? "bg-white dark:bg-blue-950 text-cyan-600 dark:text-cyan-400 shadow"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <DynamicIcon name="Dices" className="w-3 h-3 inline mr-1" />
              GM State
            </button>
          ) : (
            <button
              onClick={() => setActiveStage("actions")}
              className={`flex-1 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                activeStage === "actions"
                  ? "bg-white dark:bg-blue-950 text-cyan-600 dark:text-cyan-400 shadow"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <DynamicIcon name="Zap" className="w-3 h-3 inline mr-1" />
              Actions
            </button>
          )}
        </div>

        {showInfo && (
          <>
            {/* Stage Description */}
            <div className="text-xs p-2 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
              {activeStage === "story" && (
                <>
                  <strong>Story Stage:</strong> Conversation history sent to
                  generate narrative prose. Uses 75% of context for story
                  history, 25% for info (lore, memory, stats).
                  {prunedParts > 0 ? (
                    <span className="text-amber-600 dark:text-amber-400">
                      {" "}
                      Pruned {prunedParts} oldest parts to fit {activeModelName}
                      's context.
                    </span>
                  ) : (
                    <span className="text-green-600 dark:text-green-400">
                      {" "}
                      All {storyData.scene.parts.length} parts included.
                    </span>
                  )}
                </>
              )}
              {activeStage === "tools" && (
                <>
                  <strong>Tools Stage:</strong> Last 20 scene parts + new story
                  content. AI analyzes what game state changes to make (items,
                  stats, memory, etc.).
                </>
              )}
              {activeStage === "actions" && (
                <>
                  <strong>Actions Stage:</strong> Recent story context sent to
                  analyze player's freeform action. AI determines skill checks,
                  items, resources, and challenge handling.
                </>
              )}
              {activeStage === "gm" && (
                <>
                  <strong>GM Stage:</strong> Runs BEFORE story generation. AI
                  determines what mechanical checks are needed and executes them
                  via tool calls (skill_check, challenge_check, take_rest,
                  etc.). Results are passed to the Story stage.
                </>
              )}
            </div>

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
                  ~Tokens:
                </span>{" "}
                <span className="font-semibold text-gray-900 dark:text-white">
                  {estimatedTokens.toLocaleString()}
                </span>
              </div>
              <div className="px-2 sm:px-3 py-1 bg-white dark:bg-blue-950 rounded border border-gray-200 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">
                  Scene Parts:
                </span>{" "}
                <span className="font-semibold text-gray-900 dark:text-white">
                  {storyData.scene.parts.length}
                </span>
                {activeStage === "story" && prunedParts > 0 && (
                  <span className="text-amber-600 dark:text-amber-400 ml-1">
                    (-{prunedParts})
                  </span>
                )}
              </div>
              <div className="px-2 sm:px-3 py-1 bg-white dark:bg-blue-950 rounded border border-gray-200 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">
                  Context:
                </span>{" "}
                <span className="font-semibold text-gray-900 dark:text-white">
                  {(activeModelConfig.maxTokens / 1000).toFixed(0)}K
                </span>
              </div>
              <div
                className={`px-2 sm:px-3 py-1 rounded border text-xs ${
                  estimatedTokens > activeModelConfig.maxTokens * 0.9
                    ? "bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-700 dark:text-red-400"
                    : estimatedTokens > activeModelConfig.maxTokens * 0.7
                    ? "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700 text-yellow-700 dark:text-yellow-400"
                    : "bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-700 dark:text-green-400"
                }`}
              >
                {estimatedTokens > activeModelConfig.maxTokens * 0.9
                  ? "⚠️ Near Limit"
                  : estimatedTokens > activeModelConfig.maxTokens * 0.7
                  ? "⚡ High Usage"
                  : "✓ Normal"}
              </div>
              <div
                className={`px-2 sm:px-3 py-1 rounded border text-xs ${
                  prefillEnabled
                    ? "bg-cyan-100 dark:bg-cyan-900/30 border-cyan-300 dark:border-cyan-700 text-cyan-700 dark:text-cyan-400"
                    : "bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400"
                }`}
                title="Role Affirmation primes the model to follow output rules"
              >
                {prefillEnabled ? "🎭 Prefill ON" : "Prefill OFF"}
              </div>
            </div>

            {/* Toggles */}
            <div className="flex flex-wrap gap-2 sm:gap-3">
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

            {/* Embeddings Info */}
            {embeddingStats && (
              <div
                className={`text-xs p-2 rounded border ${
                  embeddingsEnabled
                    ? "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700"
                    : "bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <DynamicIcon
                    name="Search"
                    className={`w-3 h-3 ${
                      embeddingsEnabled
                        ? "text-purple-600 dark:text-purple-400"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  />
                  <span
                    className={`font-semibold ${
                      embeddingsEnabled
                        ? "text-purple-700 dark:text-purple-400"
                        : "text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    Semantic Search{" "}
                    {embeddingsEnabled ? "(Enabled)" : "(Disabled)"}
                  </span>
                </div>
                <div
                  className={
                    embeddingsEnabled
                      ? "text-purple-800 dark:text-purple-300"
                      : "text-gray-600 dark:text-gray-400"
                  }
                >
                  {embeddingsEnabled ? (
                    <>
                      <p>During generation, AI retrieves the most relevant:</p>
                      <ul className="list-disc list-inside ml-2 mt-1">
                        <li>
                          <strong>
                            {Math.min(8, embeddingStats.totalLore)} lore
                          </strong>{" "}
                          entries (from {embeddingStats.totalLore} total)
                        </li>
                        <li>
                          <strong>
                            {Math.min(15, embeddingStats.totalMemory)} memories
                          </strong>{" "}
                          (from {embeddingStats.totalMemory} total)
                        </li>
                      </ul>
                      <p className="mt-1">
                        Threshold:{" "}
                        <strong>{embeddingThreshold.toFixed(2)}</strong> (
                        {embeddingThreshold <= 0.2
                          ? "relaxed"
                          : embeddingThreshold >= 0.4
                          ? "strict"
                          : "balanced"}
                        )
                      </p>
                      <p className="mt-1 italic text-purple-600 dark:text-purple-400">
                        Context below shows simulated selection. Live uses
                        semantic search.
                      </p>
                    </>
                  ) : (
                    <>
                      <p>
                        Lore: {embeddingStats.totalLore} entries (
                        {storyData.lore.filter((l) => l.on !== false).length}{" "}
                        active)
                      </p>
                      <p>
                        Memory: {embeddingStats.totalMemory} entries (all
                        included if ≤50)
                      </p>
                      <p className="mt-1">
                        Enable in Settings → AI → Semantic Search
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="text-xs text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
              <DynamicIcon name="Info" className="w-3 h-3 inline mr-1" />
              This shows the exact context sent to the AI for each generation
              stage. Story stage includes all history; Tools/Actions stages are
              truncated.
            </div>

            {/* GM Tool Calls from most recent assistant part */}
            {(() => {
              const lastAssistantPart = [...storyData.scene.parts]
                .reverse()
                .find((p) => !p.user);
              if (
                lastAssistantPart?.gmToolCalls &&
                lastAssistantPart.gmToolCalls.length > 0
              ) {
                return (
                  <div className="text-xs bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-700 p-2 rounded">
                    <div className="font-semibold text-cyan-700 dark:text-cyan-400 mb-1 flex items-center gap-1">
                      <DynamicIcon name="Dices" className="w-3 h-3" />
                      GM Tool Calls (from last turn)
                    </div>
                    <ul className="space-y-1 text-cyan-800 dark:text-cyan-300">
                      {lastAssistantPart.gmToolCalls.map(
                        (tool: any, i: number) => (
                          <li key={i} className="flex items-start gap-1">
                            <span
                              className={`font-medium ${
                                tool.success
                                  ? "text-green-600 dark:text-green-400"
                                  : "text-red-600 dark:text-red-400"
                              }`}
                            >
                              {tool.success ? "✓" : "✗"}
                            </span>
                            <span className="font-mono">{tool.toolName}</span>
                            {tool.contextForStory && (
                              <span className="text-gray-600 dark:text-gray-400">
                                → {tool.contextForStory.substring(0, 100)}
                                {tool.contextForStory.length > 100 ? "..." : ""}
                              </span>
                            )}
                          </li>
                        )
                      )}
                    </ul>
                    {lastAssistantPart.gmStoryContext && (
                      <div className="mt-2 p-2 bg-cyan-100 dark:bg-cyan-900/30 rounded text-cyan-700 dark:text-cyan-300">
                        <strong>GM Context sent to story:</strong>
                        <pre className="whitespace-pre-wrap mt-1 text-[10px]">
                          {lastAssistantPart.gmStoryContext}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              }
              return null;
            })()}

            {/* State Changes from most recent assistant part */}
            {(() => {
              const lastAssistantPart = [...storyData.scene.parts]
                .reverse()
                .find((p) => !p.user);
              if (
                lastAssistantPart?.stateChanges &&
                lastAssistantPart.stateChanges.length > 0
              ) {
                return (
                  <div className="text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-2 rounded">
                    <div className="font-semibold text-amber-700 dark:text-amber-400 mb-1 flex items-center gap-1">
                      <DynamicIcon name="Zap" className="w-3 h-3" />
                      State Changes (from last turn)
                    </div>
                    <ul className="list-disc list-inside text-amber-800 dark:text-amber-300 space-y-0.5">
                      {lastAssistantPart.stateChanges.map((change, i) => (
                        <li key={i}>{change}</li>
                      ))}
                    </ul>
                    <div className="text-amber-600 dark:text-amber-500 mt-1 italic">
                      These appear as [State Update] assistant messages in story
                      history.
                    </div>
                  </div>
                );
              }
              return null;
            })()}
          </>
        )}

        {/* GM Tool Calls - Always visible when present (outside showInfo) - Collapsible on mobile */}
        {!showInfo &&
          (() => {
            const lastAssistantPart = [...storyData.scene.parts]
              .reverse()
              .find((p) => !p.user);
            if (
              lastAssistantPart?.gmToolCalls &&
              lastAssistantPart.gmToolCalls.length > 0
            ) {
              return (
                <div className="text-xs bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-700 rounded overflow-hidden">
                  <button
                    onClick={() => setShowGMToolCalls(!showGMToolCalls)}
                    className="w-full font-semibold text-cyan-700 dark:text-cyan-400 p-2 flex items-center justify-between gap-1 hover:bg-cyan-100 dark:hover:bg-cyan-900/30 transition-colors"
                  >
                    <span className="flex items-center gap-1">
                      <DynamicIcon name="Dices" className="w-3 h-3" />
                      GM Tool Calls ({lastAssistantPart.gmToolCalls.length})
                    </span>
                    <DynamicIcon
                      name={showGMToolCalls ? "ChevronUp" : "ChevronDown"}
                      className="w-3 h-3"
                    />
                  </button>
                  {showGMToolCalls && (
                    <div className="px-2 pb-2">
                      <ul className="space-y-1 text-cyan-800 dark:text-cyan-300">
                        {lastAssistantPart.gmToolCalls.map(
                          (tool: any, i: number) => (
                            <li key={i} className="flex items-start gap-1">
                              <span
                                className={`font-medium ${
                                  tool.success
                                    ? "text-green-600 dark:text-green-400"
                                    : "text-red-600 dark:text-red-400"
                                }`}
                              >
                                {tool.success ? "✓" : "✗"}
                              </span>
                              <span className="font-mono">{tool.toolName}</span>
                              {tool.contextForStory && (
                                <span className="text-gray-600 dark:text-gray-400 text-[10px]">
                                  → {tool.contextForStory.substring(0, 60)}
                                  {tool.contextForStory.length > 60
                                    ? "..."
                                    : ""}
                                </span>
                              )}
                            </li>
                          )
                        )}
                      </ul>
                      {lastAssistantPart.gmStoryContext && (
                        <div className="mt-2 text-[10px] text-cyan-600 dark:text-cyan-500 italic">
                          Full context:{" "}
                          {lastAssistantPart.gmStoryContext.length} chars
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            }
            return null;
          })()}

        {/* State Changes - Always visible when present (outside showInfo) - Collapsible on mobile */}
        {!showInfo &&
          (() => {
            const lastAssistantPart = [...storyData.scene.parts]
              .reverse()
              .find((p) => !p.user);
            if (
              lastAssistantPart?.stateChanges &&
              lastAssistantPart.stateChanges.length > 0
            ) {
              return (
                <div className="text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded overflow-hidden">
                  <button
                    onClick={() => setShowStateChanges(!showStateChanges)}
                    className="w-full font-semibold text-amber-700 dark:text-amber-400 p-2 flex items-center justify-between gap-1 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                  >
                    <span className="flex items-center gap-1">
                      <DynamicIcon name="Zap" className="w-3 h-3" />
                      GM State Changes ({lastAssistantPart.stateChanges.length})
                    </span>
                    <DynamicIcon
                      name={showStateChanges ? "ChevronUp" : "ChevronDown"}
                      className="w-3 h-3"
                    />
                  </button>
                  {showStateChanges && (
                    <div className="px-2 pb-2">
                      <ul className="list-disc list-inside text-amber-800 dark:text-amber-300 space-y-0.5">
                        {lastAssistantPart.stateChanges.map((change, i) => (
                          <li key={i}>{change}</li>
                        ))}
                      </ul>
                      <div className="text-amber-600 dark:text-amber-500 mt-1 italic text-[10px]">
                        Shown as [GM State Update] in story history
                      </div>
                    </div>
                  )}
                </div>
              );
            } else if (
              lastAssistantPart?.toolResponses &&
              lastAssistantPart.toolResponses.length > 0
            ) {
              // Has tool responses but no stateChanges - this is an old part before the feature
              return (
                <div className="text-xs bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 p-2 rounded text-gray-600 dark:text-gray-400">
                  <DynamicIcon name="Info" className="w-3 h-3 inline mr-1" />
                  Last part has {lastAssistantPart.toolResponses.length} tool
                  responses but no stateChanges (generated before feature was
                  added).
                </div>
              );
            }
            return null;
          })()}
      </div>

      {/* Messages List */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-3 sm:space-y-4 relative"
      >
        {/* GM Stage Results Panel - Show at top when in GM stage view */}
        {activeStage === "gm" &&
          (() => {
            const lastAssistantPart = [...storyData.scene.parts]
              .reverse()
              .find((p) => !p.user);
            if (
              lastAssistantPart?.gmToolCalls &&
              lastAssistantPart.gmToolCalls.length > 0
            ) {
              return (
                <div className="mx-2 sm:mx-4 mb-4 p-4 bg-cyan-50 dark:bg-cyan-900/20 border-2 border-cyan-300 dark:border-cyan-700 rounded-lg">
                  <h4 className="font-bold text-cyan-700 dark:text-cyan-400 mb-3 flex items-center gap-2">
                    <DynamicIcon name="Dices" className="w-5 h-5" />
                    GM Stage Results (Last Turn)
                  </h4>
                  <div className="space-y-3">
                    {lastAssistantPart.gmToolCalls.map(
                      (tool: any, i: number) => (
                        <div
                          key={i}
                          className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-cyan-200 dark:border-cyan-800"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span
                              className={`text-lg ${
                                tool.success ? "text-green-500" : "text-red-500"
                              }`}
                            >
                              {tool.success ? "✓" : "✗"}
                            </span>
                            <span className="font-mono font-semibold text-gray-900 dark:text-white">
                              {tool.toolName}
                            </span>
                          </div>
                          {tool.contextForStory && (
                            <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap bg-gray-50 dark:bg-gray-900 p-2 rounded">
                              {tool.contextForStory}
                            </pre>
                          )}
                        </div>
                      )
                    )}
                  </div>
                  {lastAssistantPart.gmStoryContext && (
                    <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                      <h5 className="font-semibold text-green-700 dark:text-green-400 mb-2 flex items-center gap-1">
                        <DynamicIcon name="ArrowRight" className="w-4 h-4" />
                        Context Sent to Story Stage
                      </h5>
                      <pre className="text-xs text-green-800 dark:text-green-300 whitespace-pre-wrap">
                        {lastAssistantPart.gmStoryContext}
                      </pre>
                    </div>
                  )}
                </div>
              );
            }
            return (
              <div className="mx-2 sm:mx-4 mb-4 p-4 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-center">
                <DynamicIcon
                  name="Info"
                  className="w-6 h-6 mx-auto mb-2 text-gray-400"
                />
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  No GM results from the last turn. The prompt below shows what
                  would be sent to the GM stage.
                </p>
              </div>
            );
          })()}

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

      {/* Floating scroll buttons */}
      <div className="absolute bottom-4 right-6 flex flex-col gap-2">
        <button
          onClick={scrollToTop}
          className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-colors"
          title="Scroll to top"
        >
          <DynamicIcon name="ChevronUp" className="w-5 h-5" />
        </button>
        <button
          onClick={scrollToBottom}
          className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-colors"
          title="Scroll to bottom"
        >
          <DynamicIcon name="ChevronDown" className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
