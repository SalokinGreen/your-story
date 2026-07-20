"use client";

import { useState, useEffect, useRef } from "react";
import { StoryData, MemoryEntry, ConsistencyWarning } from "../misc/structs";
import {
  buildGMStagePrompt,
  buildChoicesPrompt,
  ChatMessage,
} from "../misc/ai_staged";
import { DynamicIcon } from "../components/DynamicIcon";
import { getModelConfig } from "../misc/ai_prices";
import {
  hardRuleFloor,
  classifyTier,
  isClassificationAmbiguous,
  decayTierTowardBaseline,
  getTierState,
  resolveTier,
  describeTier,
  isSceneGatedForRoll,
  hasSatisfiedRollGate,
  getEffectiveNarrationModelKey,
  getEffectiveTiers,
  MAX_TIER3_CALLS_PER_SCENE,
} from "../misc/reasoningTiers";

interface ContextViewerProps {
  storyData: StoryData;
}

// Layer 2 (Oracle) - chaos factor descriptor, mirrors ai_staged.ts's private
// getChaosDescription (not exported) so this viewer doesn't need to import it.
function describeChaos(chaos: number): string {
  if (chaos <= 3) return "Very Ordered - things go as expected";
  if (chaos <= 5) return "Normal - standard chaos level";
  if (chaos <= 7) return "Chaotic - unexpected twists likely";
  return "Extreme Chaos - anything can happen";
}

// Layer 3 (Director) - tension descriptor for AGMTState.tension (0-10).
function describeTension(tension: number): string {
  if (tension <= 2) return "Calm - little pressure on the scene";
  if (tension <= 4) return "Settling - things are winding down";
  if (tension <= 6) return "Building - pressure is rising";
  if (tension <= 8) return "Tense - stakes are high";
  return "Critical - near-breaking point";
}

function timeAgo(timestamp?: number): string {
  if (!timestamp) return "";
  const diffMs = Date.now() - timestamp;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function ContextViewer({ storyData }: ContextViewerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [choicesMessages, setChoicesMessages] = useState<ChatMessage[]>([]);
  const [estimatedTokens, setEstimatedTokens] = useState(0);
  const [gmModelConfig, setGmModelConfig] = useState(
    getModelConfig("Mistral Small 3.2"),
  );
  const [narrationModelKey, setNarrationModelKey] = useState(
    "Mistral Small 3.2",
  );
  const [tierPreview, setTierPreview] = useState<{
    tier: number;
    label: string;
    ambiguous: boolean;
  } | null>(null);
  const [showRawJSON, setShowRawJSON] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showLayers, setShowLayers] = useState(true);
  const [showChoicesStage, setShowChoicesStage] = useState(false);
  const [showStateChanges, setShowStateChanges] = useState(false);
  const [showGMToolCalls, setShowGMToolCalls] = useState(false);
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
    // Match the real generation pipeline's setting source (see page.tsx's
    // handleCustomInput): the "Memory Size" slider persists here, not via a
    // model preset - the old aiPreset/aiModelTools scheme this viewer used
    // to read was removed when the reasoning-tier router replaced it.
    const customMaxContext =
      typeof window !== "undefined"
        ? parseInt(localStorage.getItem("customMaxContext") || "36000", 10)
        : 36000;

    // Use the actual last player input instead of a static placeholder, same
    // fallback generateStoryTurn itself uses when no explicit choice is passed.
    const lastUserPart = [...storyData.scene.parts]
      .reverse()
      .find((p) => p.user && p.content);
    const userChoice = lastUserPart
      ? lastUserPart.content.replace(/^>\s*/, "")
      : "(no player input yet - previewing the prompt shape for the next turn)";

    // Reasoning-Tier Router preview: mirrors generation.ts's synchronous
    // resolution path (hard-rule floor, deterministic classifier, decay).
    // The optional tier-0 LLM classifier call for ambiguous freeform input
    // isn't replayed here - `ambiguous` flags when it would fire instead.
    const priorTierState = getTierState(storyData);
    const decayedTier = decayTierTowardBaseline(priorTierState.currentTier);
    const deterministicTier = Math.max(
      hardRuleFloor(storyData),
      classifyTier(storyData, userChoice),
      decayedTier,
    );
    const ambiguous = isClassificationAmbiguous(storyData, userChoice);
    const resolved = resolveTier(deterministicTier);

    const gmModel = String(resolved.modelKey);
    const gmConfig = getModelConfig(gmModel);
    setGmModelConfig(gmConfig);
    setNarrationModelKey(String(getEffectiveNarrationModelKey()));
    setTierPreview({
      tier: resolved.tier,
      label: describeTier(resolved),
      ambiguous,
    });

    console.log("🔍 Context Viewer Debug:", {
      modelName: gmConfig.name,
      maxTokens: gmConfig.maxTokens,
      sceneParts: storyData.scene.parts.length,
      memoryEntries: storyData.memory.length,
      loreEntries: storyData.lore.filter((l) => l.on !== false).length,
    });

    // Build GM stage messages using the SAME function as generation.ts
    const gmPrompt = buildGMStagePrompt({
      storyData,
      userChoice,
      customMaxContext,
      modelName: gmModel,
    });
    const contextMessages = gmPrompt.messages;
    setMessages(contextMessages);

    // Estimate tokens (rough approximation: 1 token ≈ 4 characters)
    const totalChars = contextMessages.reduce(
      (sum, msg) => sum + msg.content.length,
      0,
    );
    const estimatedTokenCount = Math.ceil(totalChars / 4);
    setEstimatedTokens(estimatedTokenCount);

    // Choices stage preview (runs alongside the GM stage in the real
    // pipeline to draft the player's next options). Uses the most recent
    // narration as a stand-in for "the story text just generated" -
    // previously this viewer computed an unrelated, unused info string here
    // and never rendered it.
    const lastAssistantPart = [...storyData.scene.parts]
      .reverse()
      .find((p) => !p.user);
    try {
      const choicesPrompt = buildChoicesPrompt({
        storyData,
        storyContent:
          lastAssistantPart?.content ||
          "(preview - no narration generated yet)",
      });
      setChoicesMessages(choicesPrompt.messages);
    } catch {
      setChoicesMessages([]);
    }

    console.log("📊 Context Statistics:", {
      totalMessages: contextMessages.length,
      totalChars,
      estimatedTokens: estimatedTokenCount,
      utilizationPercent:
        ((estimatedTokenCount / gmConfig.maxTokens) * 100).toFixed(1) + "%",
      availableSceneParts: storyData.scene.parts.length,
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
  }, [storyData]);

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
    a.download = `context-gm-${Date.now()}.json`;
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
    a.download = `context-gm-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ============================================
  // Five-layer architecture snapshot (pure derivation from storyData props)
  // ============================================
  const npcs = storyData.npcs || [];
  const aliveNpcs = npcs.filter((n) => n.status === "alive").length;
  const npcStatusCounts = npcs.reduce<Record<string, number>>((acc, n) => {
    acc[n.status] = (acc[n.status] || 0) + 1;
    return acc;
  }, {});
  const quests = storyData.quests || [];
  const activeQuests = quests.filter((q) => q.active && !q.fulfilled).length;
  const threads = storyData.threads || [];
  const activeThreads = threads.filter((t) => t.status === "active");
  const conditions = storyData.conditions || [];
  const combat = storyData.combatState;

  const agmt = storyData.agmtState;
  const chaos = agmt?.chaosFactor ?? 5;
  const tension = agmt?.tension ?? 5;
  const pendingEvents = storyData.pendingRandomEvents || [];
  const recentSkillChecks = (agmt?.skillCheckHistory || []).slice(-3).reverse();

  const pendingMoves = storyData.pendingDirectorMoves || [];
  const timers = storyData.timers || [];
  const couchPlayers = storyData.multiplayer?.couchPlayers || [];
  const couchFocus = storyData.multiplayer?.couchPlayerFocus || {};

  const memory = storyData.memory || [];
  const memoryEntryOf = (m: string | MemoryEntry): MemoryEntry | null =>
    typeof m === "string" ? null : m;
  const embeddedCount = memory.filter(
    (m) => memoryEntryOf(m)?.embedded,
  ).length;
  const reflectionCount = memory.filter(
    (m) => memoryEntryOf(m)?.isReflection,
  ).length;
  const reflectedThrough = storyData.memoryReflectedThroughIndex ?? 0;
  const pendingReflection = Math.max(0, memory.length - reflectedThrough);
  const recentMemories = [...memory].slice(-5).reverse();

  const storedTierState = storyData.reasoningTierState;
  const gated = isSceneGatedForRoll(storyData);
  const lastAssistantPart = [...storyData.scene.parts]
    .reverse()
    .find((p) => !p.user);
  const lastToolNames: string[] = (lastAssistantPart?.gmToolCalls || [])
    .map((t: any) => t.toolName)
    .filter(Boolean);
  const lastTurnSatisfiedGate = lastToolNames.length
    ? hasSatisfiedRollGate(lastToolNames)
    : null;
  const lastConsistencyWarnings: ConsistencyWarning[] =
    lastAssistantPart?.consistencyWarnings || [];
  const tierLadder = getEffectiveTiers();

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] bg-white dark:bg-blue-950 rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <div className="p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 space-y-2">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-base sm:text-lg text-gray-900 dark:text-white flex items-center gap-2">
            <DynamicIcon name="Eye" className="w-5 h-5" />
            AI Context & Architecture Viewer
          </h3>
          <div className="flex gap-1 sm:gap-2">
            <button
              onClick={() => setShowLayers(!showLayers)}
              className="px-2 sm:px-3 py-1 text-xs sm:text-sm bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50 flex items-center gap-1"
              title="Toggle five-layer architecture panel"
            >
              <DynamicIcon name="Layers" className="w-4 h-4" />
              <span className="hidden sm:inline">Layers</span>
            </button>
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
            {/* Stage Description */}
            <div className="text-xs p-2 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
              <strong>GM Stage:</strong> The main generation stage. AI acts as
              a tabletop GM - uses tools (formula_roll, read_notes,
              search_memory, etc.) to handle mechanics, then writes the story
              prose directly when done. Model/effort shown below come from the
              reasoning-tier router (hard rules → deterministic classifier →
              decay), not a fixed preset.
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
              </div>
              <div className="px-2 sm:px-3 py-1 bg-white dark:bg-blue-950 rounded border border-gray-200 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">
                  GM Model:
                </span>{" "}
                <span className="font-semibold text-gray-900 dark:text-white">
                  {gmModelConfig.name} ({(gmModelConfig.maxTokens / 1000).toFixed(0)}K)
                </span>
              </div>
              <div
                className={`px-2 sm:px-3 py-1 rounded border text-xs ${
                  estimatedTokens > gmModelConfig.maxTokens * 0.9
                    ? "bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-700 dark:text-red-400"
                    : estimatedTokens > gmModelConfig.maxTokens * 0.7
                      ? "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700 text-yellow-700 dark:text-yellow-400"
                      : "bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-700 dark:text-green-400"
                }`}
              >
                {estimatedTokens > gmModelConfig.maxTokens * 0.9
                  ? "⚠️ Near Limit"
                  : estimatedTokens > gmModelConfig.maxTokens * 0.7
                    ? "⚡ High Usage"
                    : "✓ Normal"}
              </div>
            </div>

            <div className="text-xs text-gray-600 dark:text-gray-400 bg-white dark:bg-blue-950 border border-gray-200 dark:border-gray-700 p-2 rounded">
              Narration voice model:{" "}
              <span className="font-semibold text-gray-900 dark:text-white">
                {narrationModelKey}
              </span>{" "}
              (fixed regardless of adjudication tier)
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
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showChoicesStage}
                  onChange={(e) => setShowChoicesStage(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                  Show Choices Stage preview
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
                    1,
                  );
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-2"
                    >
                      <span
                        className={`${getRoleColor(
                          msg.role,
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
              This shows the context sent to the AI. GM stage is the main
              generation stage - it handles mechanics via tools and writes the
              story. Choices stage runs alongside it to draft the player&apos;s
              next options.
            </div>

            {/* GM Tool Calls from most recent assistant part */}
            {lastAssistantPart?.gmToolCalls &&
              lastAssistantPart.gmToolCalls.length > 0 && (
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
                      ),
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
              )}

            {/* State Changes from most recent assistant part */}
            {lastAssistantPart?.stateChanges &&
              lastAssistantPart.stateChanges.length > 0 && (
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
              )}
          </>
        )}

        {/* GM Tool Calls - Always visible when present (outside showInfo) - Collapsible on mobile */}
        {!showInfo &&
          lastAssistantPart?.gmToolCalls &&
          lastAssistantPart.gmToolCalls.length > 0 && (
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
                              {tool.contextForStory.length > 60 ? "..." : ""}
                            </span>
                          )}
                        </li>
                      ),
                    )}
                  </ul>
                  {lastAssistantPart.gmStoryContext && (
                    <div className="mt-2 text-[10px] text-cyan-600 dark:text-cyan-500 italic">
                      Full context: {lastAssistantPart.gmStoryContext.length}{" "}
                      chars
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        {/* State Changes - Always visible when present (outside showInfo) - Collapsible on mobile */}
        {!showInfo &&
          (lastAssistantPart?.stateChanges &&
          lastAssistantPart.stateChanges.length > 0 ? (
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
          ) : (
            lastAssistantPart?.toolResponses &&
            lastAssistantPart.toolResponses.length > 0 && (
              <div className="text-xs bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 p-2 rounded text-gray-600 dark:text-gray-400">
                <DynamicIcon name="Info" className="w-3 h-3 inline mr-1" />
                Last part has {lastAssistantPart.toolResponses.length} tool
                responses but no stateChanges (generated before feature was
                added).
              </div>
            )
          ))}
      </div>

      {/* Body */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-3 sm:space-y-4 relative"
      >
        {/* ============================================ */}
        {/* FIVE-LAYER ARCHITECTURE PANEL */}
        {/* ============================================ */}
        {showLayers && (
          <div className="mx-2 sm:mx-4 mb-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Layer 1 - Deterministic State */}
            <div className="p-3 rounded-lg border bg-slate-50 dark:bg-slate-900/30 border-slate-300 dark:border-slate-700">
              <h4 className="font-bold text-sm text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                <DynamicIcon name="Database" className="w-4 h-4" />
                Layer 1 · Deterministic State
              </h4>
              <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                <p>
                  Stats: <strong>{storyData.stats.length}</strong> · Resources:{" "}
                  <strong>{storyData.resources.length}</strong> · Conditions:{" "}
                  <strong>{conditions.length}</strong>
                </p>
                <p>
                  Quests: <strong>{activeQuests}</strong> active /{" "}
                  {quests.length} total
                </p>
                <p>
                  NPCs: <strong>{aliveNpcs}</strong> alive / {npcs.length}{" "}
                  tracked
                  {Object.keys(npcStatusCounts).length > 0 && (
                    <span className="text-slate-500 dark:text-slate-500">
                      {" "}
                      (
                      {Object.entries(npcStatusCounts)
                        .map(([s, c]) => `${c} ${s}`)
                        .join(", ")}
                      )
                    </span>
                  )}
                </p>
                <p>
                  Threads: <strong>{activeThreads.length}</strong> active /{" "}
                  {threads.length} total
                </p>
                <p>
                  Combat:{" "}
                  {combat?.active ? (
                    <strong className="text-red-600 dark:text-red-400">
                      Active - {combat.name || "unnamed"}, round {combat.round}
                      , {combat.combatants.filter((c) => c.isActive).length}{" "}
                      active combatants
                    </strong>
                  ) : (
                    "inactive"
                  )}
                </p>
                <p className="italic text-slate-500 dark:text-slate-500">
                  Inventory is deprecated - tracked as freeform character-sheet
                  notes instead of structured items.
                </p>
              </div>
            </div>

            {/* Layer 2 - Oracle / Entropy */}
            <div className="p-3 rounded-lg border bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700">
              <h4 className="font-bold text-sm text-purple-700 dark:text-purple-300 mb-2 flex items-center gap-2">
                <DynamicIcon name="Dices" className="w-4 h-4" />
                Layer 2 · Oracle & Entropy
              </h4>
              <div className="text-xs text-purple-700 dark:text-purple-300 space-y-1">
                <p>
                  Chaos Factor: <strong>{chaos}/9</strong> -{" "}
                  {describeChaos(chaos)}
                </p>
                <p>
                  Pending random events:{" "}
                  <strong>{pendingEvents.length}</strong>
                </p>
                {pendingEvents.length > 0 && (
                  <ul className="list-disc list-inside space-y-0.5">
                    {pendingEvents.slice(0, 3).map((e) => (
                      <li key={e.id}>
                        [{e.focus || "Event"}] {e.action} {e.subject}
                      </li>
                    ))}
                    {pendingEvents.length > 3 && (
                      <li className="italic">
                        +{pendingEvents.length - 3} more
                      </li>
                    )}
                  </ul>
                )}
                {recentSkillChecks.length > 0 && (
                  <p>
                    Recent rolls:{" "}
                    {recentSkillChecks
                      .map(
                        (r) =>
                          `${r.skill} ${r.success ? "✓" : "✗"} (margin ${r.margin})`,
                      )
                      .join(", ")}
                  </p>
                )}
              </div>
            </div>

            {/* Layer 3 - Director / Pacing */}
            <div className="p-3 rounded-lg border bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700">
              <h4 className="font-bold text-sm text-amber-700 dark:text-amber-300 mb-2 flex items-center gap-2">
                <DynamicIcon name="Compass" className="w-4 h-4" />
                Layer 3 · Director & Pacing
              </h4>
              <div className="text-xs text-amber-700 dark:text-amber-300 space-y-1">
                <p>
                  Tension: <strong>{tension}/10</strong> -{" "}
                  {describeTension(tension)}
                </p>
                <div className="w-full h-1.5 bg-amber-200 dark:bg-amber-900/40 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 dark:bg-amber-400"
                    style={{ width: `${Math.min(100, (tension / 10) * 100)}%` }}
                  />
                </div>
                <p>
                  Pending director moves: <strong>{pendingMoves.length}</strong>
                </p>
                {pendingMoves.length > 0 && (
                  <ul className="list-disc list-inside space-y-0.5">
                    {pendingMoves.map((m) => (
                      <li key={m.id}>
                        {m.move.replace(/_/g, " ")}
                        {m.context ? ` (${m.context})` : ""}
                      </li>
                    ))}
                  </ul>
                )}
                <p>
                  Timers: <strong>{timers.length}</strong>
                  {timers.length > 0 && (
                    <span>
                      {" "}
                      (
                      {timers
                        .slice(0, 3)
                        .map(
                          (t) =>
                            `${t.name}: ${t.currentTicks}/${t.totalTicks}${
                              t.status !== "active" ? ` [${t.status}]` : ""
                            }`,
                        )
                        .join(", ")}
                      {timers.length > 3 ? ", ..." : ""})
                    </span>
                  )}
                </p>
                {couchPlayers.length > 1 && (
                  <p>
                    Spotlight focus:{" "}
                    {couchPlayers
                      .map((p) => `${p.name}: ${couchFocus[p.id] ?? 0}`)
                      .join(", ")}
                  </p>
                )}
              </div>
            </div>

            {/* Layer 4 - Memory */}
            <div className="p-3 rounded-lg border bg-teal-50 dark:bg-teal-900/20 border-teal-300 dark:border-teal-700">
              <h4 className="font-bold text-sm text-teal-700 dark:text-teal-300 mb-2 flex items-center gap-2">
                <DynamicIcon name="Brain" className="w-4 h-4" />
                Layer 4 · Memory
              </h4>
              <div className="text-xs text-teal-700 dark:text-teal-300 space-y-1">
                <p>
                  Entries: <strong>{memory.length}</strong> · Embedded:{" "}
                  <strong>{embeddedCount}</strong> · Reflections:{" "}
                  <strong>{reflectionCount}</strong>
                </p>
                <p>
                  Unreflected entries:{" "}
                  <strong>{pendingReflection}</strong> since last reflection
                  pass
                </p>
                {recentMemories.length > 0 && (
                  <ul className="space-y-0.5">
                    {recentMemories.map((m, i) => {
                      const entry = memoryEntryOf(m);
                      const content = typeof m === "string" ? m : m.content;
                      return (
                        <li key={i} className="truncate">
                          {entry?.isReflection ? "🧩 " : ""}
                          {content.substring(0, 70)}
                          {content.length > 70 ? "..." : ""}
                          {entry?.importance != null && (
                            <span className="text-teal-500 dark:text-teal-500">
                              {" "}
                              (importance {entry.importance})
                            </span>
                          )}
                          {entry?.timestamp && (
                            <span className="text-teal-500 dark:text-teal-500">
                              {" "}
                              · {timeAgo(entry.timestamp)}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* Layer 5 - Adjudication */}
            <div className="p-3 rounded-lg border bg-rose-50 dark:bg-rose-900/20 border-rose-300 dark:border-rose-700 lg:col-span-2">
              <h4 className="font-bold text-sm text-rose-700 dark:text-rose-300 mb-2 flex items-center gap-2">
                <DynamicIcon name="ShieldCheck" className="w-4 h-4" />
                Layer 5 · Adjudication
              </h4>
              <div className="text-xs text-rose-700 dark:text-rose-300 space-y-1">
                <p>
                  Stored tier (as of last turn):{" "}
                  <strong>{storedTierState?.currentTier ?? 1}</strong> · Top-tier
                  calls used this scene:{" "}
                  <strong>{storedTierState?.tier3CallsInScene ?? 0}</strong>/
                  {MAX_TIER3_CALLS_PER_SCENE}
                </p>
                {tierPreview && (
                  <p>
                    Preview for next turn:{" "}
                    <strong>{tierPreview.label}</strong>
                    {tierPreview.ambiguous && (
                      <span className="italic">
                        {" "}
                        (ambiguous input - a classifier call would refine this)
                      </span>
                    )}
                  </p>
                )}
                <p className="flex flex-wrap gap-1">
                  Tier ladder:{" "}
                  {tierLadder.map((t, i) => (
                    <span
                      key={i}
                      className={`px-1.5 py-0.5 rounded ${
                        tierPreview?.tier === i
                          ? "bg-rose-600 text-white"
                          : "bg-rose-100 dark:bg-rose-900/40"
                      }`}
                    >
                      {i}:{" "}
                      {typeof t.modelKey === "string" ? t.modelKey : t.modelKey}
                    </span>
                  ))}
                </p>
                <p>
                  M2 roll-invariant gate:{" "}
                  {gated ? (
                    <strong>
                      active - this scene must include a roll/oracle tool call
                      before ending on prose alone
                    </strong>
                  ) : (
                    "not gated"
                  )}
                  {lastTurnSatisfiedGate !== null && (
                    <span>
                      {" "}
                      (last turn {lastTurnSatisfiedGate ? "satisfied" : "did NOT satisfy"}{" "}
                      it)
                    </span>
                  )}
                </p>
                <p>
                  Narration consistency warnings (last turn):{" "}
                  <strong>{lastConsistencyWarnings.length}</strong>
                </p>
                {lastConsistencyWarnings.length > 0 && (
                  <ul className="list-disc list-inside space-y-0.5">
                    {lastConsistencyWarnings.map((w, i) => (
                      <li key={i}>
                        [{w.type}] {w.entity}: {w.detail}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {/* GM Stage Results Panel - Show at top of prompt view */}
        {(() => {
          if (
            lastAssistantPart?.gmConversation &&
            lastAssistantPart.gmConversation.length > 0
          ) {
            return (
              <div className="mx-2 sm:mx-4 mb-4 p-4 bg-cyan-50 dark:bg-cyan-900/20 border-2 border-cyan-300 dark:border-cyan-700 rounded-lg">
                <h4 className="font-bold text-cyan-700 dark:text-cyan-400 mb-3 flex items-center gap-2">
                  <DynamicIcon name="Dices" className="w-5 h-5" />
                  GM Stage Results (Last Turn)
                </h4>
                <div className="space-y-2">
                  {lastAssistantPart.gmConversation.map(
                    (msg: any, i: number) => (
                      <div
                        key={i}
                        className={`p-2 rounded-lg border ${
                          msg.role === "assistant"
                            ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                            : "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`text-xs font-semibold ${
                              msg.role === "assistant"
                                ? "text-green-700 dark:text-green-400"
                                : "text-orange-700 dark:text-orange-400"
                            }`}
                          >
                            {msg.role === "assistant"
                              ? "🤖 ASSISTANT"
                              : "🔧 TOOL"}
                          </span>
                          {msg.tool_call_id && (
                            <span className="text-[10px] text-gray-500 font-mono">
                              id: {msg.tool_call_id}
                            </span>
                          )}
                        </div>
                        {/* Show tool_calls if present */}
                        {msg.tool_calls && msg.tool_calls.length > 0 && (
                          <div className="mb-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-700">
                            <div className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1">
                              Tool Calls:
                            </div>
                            {msg.tool_calls.map((tc: any, tcIdx: number) => (
                              <div key={tcIdx} className="text-xs font-mono">
                                <span className="text-blue-600 dark:text-blue-300">
                                  {tc.function?.name || tc.name}
                                </span>
                                <span className="text-gray-500">
                                  (
                                  {typeof tc.function?.arguments === "string"
                                    ? tc.function.arguments.substring(0, 100)
                                    : JSON.stringify(
                                        tc.function?.arguments,
                                      )?.substring(0, 100)}
                                  {(tc.function?.arguments?.length || 0) > 100
                                    ? "..."
                                    : ""}
                                  )
                                </span>
                                <span className="text-gray-400 ml-1">
                                  id: {tc.id}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Show content */}
                        <pre className="text-xs whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                          {msg.content}
                        </pre>
                      </div>
                    ),
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

        {/* Choices stage preview */}
        {showChoicesStage && choicesMessages.length > 0 && (
          <div className="mx-2 sm:mx-4 mb-4 space-y-2">
            <h4 className="font-bold text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <DynamicIcon name="ListChecks" className="w-4 h-4" />
              Choices Stage Preview (runs alongside GM stage)
            </h4>
            {choicesMessages.map((msg, i) => (
              <div
                key={i}
                className={`${getRoleBgColor(
                  msg.role,
                )} rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700`}
              >
                <div className="flex justify-between items-center p-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-blue-950">
                  <span
                    className={`font-bold text-xs ${getRoleColor(msg.role)}`}
                  >
                    {formatRole(msg.role)}
                  </span>
                  <button
                    onClick={() => copyToClipboard(msg.content)}
                    className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-900 hover:bg-gray-300 dark:hover:bg-gray-600 rounded flex items-center gap-1"
                  >
                    <DynamicIcon name="Copy" className="w-3 h-3" />
                  </button>
                </div>
                <pre className="whitespace-pre-wrap wrap-break-word text-xs p-3 text-gray-800 dark:text-gray-200 font-sans">
                  {msg.content}
                </pre>
              </div>
            ))}
          </div>
        )}

        {showRawJSON ? (
          <pre className="bg-gray-50 dark:bg-gray-900 p-3 sm:p-4 rounded text-xs overflow-x-auto text-gray-800 dark:text-gray-200 font-mono mx-2 sm:mx-4">
            {JSON.stringify(messages, null, 2)}
          </pre>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`${getRoleBgColor(
                msg.role,
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
                      msg.role,
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
