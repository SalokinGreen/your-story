"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import ReactMarkdown from "react-markdown";
import { ChatMessage } from "@/app/misc/ai";
import { StoryData } from "@/app/misc/structs";
import { authenticatedFetch } from "@/app/misc/getAuthToken";
import {
  buildStoryCreatorMessagesWithTools,
  applyCreatorChangesToStoryData,
  sanitizeSkillTrees,
} from "@/app/misc/story_creator_ai";
import {
  executeCreatorTools,
  CreatorToolCall,
  CreatorToolResult,
  CreatorChanges,
} from "@/app/misc/creator_tool_executor";
import { DynamicIcon } from "./DynamicIcon";
import {
  AI_MODELS,
  getModelConfig,
  calculateTokenCost,
} from "@/app/misc/ai_prices";
import { useAPIKeys } from "@/app/misc/APIKeysContext";
import { CustomModel } from "@/app/misc/user_settings";

interface StoryCreativeAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  storyData: StoryData;
  storyId?: string; // For chat persistence
  onApplyChanges: (updates: Partial<StoryData>) => void;
}

export default function StoryCreativeAssistant({
  isOpen,
  onClose,
  storyData,
  storyId,
  onApplyChanges,
}: StoryCreativeAssistantProps) {
  const chatKey = storyId ? `storyCreatorAiChat:${storyId}` : null;
  const { keys: apiKeys, hasKey } = useAPIKeys();

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window !== "undefined" && chatKey) {
      const saved = localStorage.getItem(chatKey);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return parsed.filter(
            (msg: ChatMessage) => msg.content && msg.content.trim()
          );
        } catch (e) {
          console.error("Failed to parse saved chat:", e);
        }
      }
    }
    return [];
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // BYOK/Coins mode toggle
  const [byokMode, setByokMode] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("storyCreatorAiByokMode");
      return stored === "true";
    }
    return false;
  });

  const [model, setModel] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return (
        localStorage.getItem("storyCreatorAiModel") || "DeepInfra DeepSeek V3.2"
      );
    }
    return "DeepInfra DeepSeek V3.2";
  });

  // Output size slider
  const [maxOutputTokens, setMaxOutputTokens] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("storyCreatorAiMaxOutput");
      return stored ? parseInt(stored, 10) : 8000;
    }
    return 8000;
  });

  const [novelaiKey, setNovelaiKey] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("novelaiKey") || "";
    }
    return "";
  });
  const [showKeyInput, setShowKeyInput] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load custom models from localStorage
  const [customModels, setCustomModels] = useState<CustomModel[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("customModels");
        return stored ? JSON.parse(stored) : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  // Re-check localStorage for custom models periodically (in case user adds them in settings)
  useEffect(() => {
    const checkCustomModels = () => {
      try {
        const stored = localStorage.getItem("customModels");
        const models = stored ? JSON.parse(stored) : [];
        if (JSON.stringify(models) !== JSON.stringify(customModels)) {
          setCustomModels(models);
        }
      } catch {
        // Ignore parse errors
      }
    };
    // Check on focus (user might have updated in another tab/modal)
    window.addEventListener("focus", checkCustomModels);
    return () => window.removeEventListener("focus", checkCustomModels);
  }, [customModels]);

  // Get model config - check custom models first, then fallback to built-in
  const modelConfig = useMemo(() => {
    // Check if model is a custom model UUID
    const customModel = customModels.find((m) => m.id === model);
    if (customModel) {
      return {
        name: customModel.name,
        original_model: customModel.modelId,
        model: customModel.modelId,
        maxTokens: customModel.contextSize,
        maxOutputTokens: customModel.maxOutputTokens,
        provider: "openrouter" as const,
        supportsToolCalling: true,
        cost: 0,
        inputPrice: customModel.inputPrice || 0,
        outputPrice: customModel.outputPrice || 0,
        finetunes: [],
        strengths: [],
        weaknesses: [],
        description: "Custom user-defined model",
        bannerUrl: undefined,
      };
    }
    return getModelConfig(model);
  }, [model, customModels]);

  // Check if NovelAI is selected
  const isNovelAISelected = modelConfig.provider === "novelai";

  // Filter models based on BYOK mode
  const filteredModels = useMemo(() => {
    const builtInModels = Object.entries(AI_MODELS).filter(([, m]) => {
      const provider = (m as { provider?: string }).provider;
      if (byokMode) {
        return (
          provider === "openrouter" ||
          provider === "deepseek" ||
          provider === "novelai" ||
          provider === "google"
        );
      } else {
        return provider === "mistral" || provider === "deepinfra";
      }
    });

    // Add custom models in BYOK mode
    if (byokMode && customModels.length > 0) {
      const customEntries: [string, { name: string; cost: number }][] =
        customModels.map((m) => [
          m.id, // Use UUID as key
          { name: `⭐ ${m.name}`, cost: 0 },
        ]);
      return [...builtInModels, ...customEntries];
    }

    return builtInModels;
  }, [byokMode, customModels]);

  // Check if user has any BYOK keys configured
  const hasAnyBYOKKey =
    hasKey("openRouterKey") ||
    hasKey("deepseekKey") ||
    hasKey("googleKey") ||
    novelaiKey.length > 0;

  // Calculate estimated cost
  const estimatedCost = useCallback(() => {
    const contextStr = JSON.stringify(storyData);
    const estimatedInputTokens = Math.ceil(contextStr.length / 4) + 500;
    const dollarCost =
      (modelConfig.inputPrice * estimatedInputTokens) / 1000000 +
      (modelConfig.outputPrice * maxOutputTokens) / 1000000;
    const coinCost = calculateTokenCost(
      model,
      estimatedInputTokens,
      maxOutputTokens
    );
    return { coins: Math.max(1, coinCost), dollars: dollarCost };
  }, [storyData, modelConfig, maxOutputTokens, model]);

  // Save chat history to localStorage
  useEffect(() => {
    if (typeof window !== "undefined" && chatKey && messages.length > 0) {
      localStorage.setItem(chatKey, JSON.stringify(messages));
    }
  }, [messages, chatKey]);

  // Save preferences to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("storyCreatorAiModel", model);
      localStorage.setItem("storyCreatorAiByokMode", byokMode.toString());
      localStorage.setItem(
        "storyCreatorAiMaxOutput",
        maxOutputTokens.toString()
      );
    }
  }, [model, byokMode, maxOutputTokens]);

  // When switching modes, auto-select a compatible model
  useEffect(() => {
    const currentProvider = modelConfig.provider;
    const isBYOKProvider =
      currentProvider === "openrouter" ||
      currentProvider === "deepseek" ||
      currentProvider === "novelai" ||
      currentProvider === "google";
    const isCoinsProvider =
      currentProvider === "mistral" || currentProvider === "deepinfra";

    if (byokMode && isCoinsProvider) {
      setModel("Deepseek Chat");
    }
    if (!byokMode && isBYOKProvider) {
      setModel("DeepInfra DeepSeek V3.2");
    }
  }, [byokMode, modelConfig.provider]);

  // Clamp max output tokens when model changes
  useEffect(() => {
    const modelMax = modelConfig.maxOutputTokens || 8000;
    if (maxOutputTokens > modelMax) {
      setMaxOutputTokens(modelMax);
    }
  }, [model, modelConfig.maxOutputTokens, maxOutputTokens]);

  // Scroll to bottom when modal opens (for existing chat history)
  // Don't auto-scroll on new messages - user wants to read from top
  useEffect(() => {
    if (isOpen && messages.length > 0) {
      // Small delay to ensure DOM is rendered
      requestAnimationFrame(() => {
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
        }, 100);
      });
    }
  }, [isOpen, messages.length]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    if (isNovelAISelected && !novelaiKey.trim()) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Please enter your NovelAI API key to use NovelAI models. Click the key icon next to the model selector.",
        },
      ]);
      setShowKeyInput(true);
      return;
    }

    if (byokMode && !isNovelAISelected && !hasAnyBYOKKey) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Please add your API key in Settings (gear icon in header) to use BYOK mode.",
        },
      ]);
      return;
    }

    const userMsg: ChatMessage = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      // Build messages with story context and recent history
      const recentMessages = [...messages, userMsg].slice(-10);

      // Check if model supports tool calling
      const supportsTools =
        modelConfig.supportsToolCalling !== false && !isNovelAISelected;

      let response: Response;

      if (isNovelAISelected) {
        // NovelAI doesn't support tool calling - show helpful message
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "NovelAI models don't support tool calling which is required for story editing. Please select a different model (DeepSeek, OpenRouter, or Coins models).",
          },
        ]);
        setLoading(false);
        return;
      } else if (supportsTools) {
        // Use tool-based prompt
        const { messages: aiMessages, tools } =
          buildStoryCreatorMessagesWithTools(storyData, input, recentMessages);

        response = await authenticatedFetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: aiMessages,
            tools: tools,
            model: model,
            maxTokens: maxOutputTokens,
            temperature: 0.7,
            openRouterKey: byokMode ? apiKeys.openRouterKey : undefined,
            deepseekKey: byokMode ? apiKeys.deepseekKey : undefined,
            googleKey: byokMode ? apiKeys.googleKey : undefined,
          }),
        });
      } else {
        // Model doesn't support tool calling
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "This model doesn't support tool calling. Please select a different model.",
          },
        ]);
        setLoading(false);
        return;
      }

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(
          errorData.error || `Failed to get AI response (${response.status})`
        );
      }

      const data = await response.json();
      const content: string = data.content || "";
      const toolCalls: CreatorToolCall[] | undefined = data.toolCalls;
      const meta: Record<string, unknown> = {
        ...data.meta,
        isByok: byokMode,
      };

      // Handle tool calls if present
      let toolResults: CreatorToolResult[] | undefined;
      let toolChanges: CreatorChanges | undefined;

      if (toolCalls && toolCalls.length > 0) {
        const { results, mergedChanges } = executeCreatorTools(toolCalls, {
          storyData: storyData,
        });
        toolResults = results;
        toolChanges = mergedChanges;

        // Log tool execution results
        console.log("Tool execution results:", results);
        console.log("Merged changes:", mergedChanges);
      }

      // Skip empty messages if no tools were called
      if ((!content || !content.trim()) && !toolResults?.length) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "I apologize, but I generated an empty response. Please try again.",
            meta,
          } as ChatMessage & { meta?: Record<string, unknown> },
        ]);
        return;
      }

      const assistantMsg: ChatMessage & {
        meta?: Record<string, unknown>;
        toolResults?: CreatorToolResult[];
        toolChanges?: CreatorChanges;
      } = {
        role: "assistant",
        content:
          content || "I've made the requested changes using the tools above.",
        meta,
        toolResults,
        toolChanges,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Sorry, I encountered an error: ${
            error instanceof Error ? error.message : "Please try again."
          }`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearChat = () => {
    if (confirm("Clear chat history?")) {
      setMessages([]);
      if (typeof window !== "undefined" && chatKey) {
        localStorage.removeItem(chatKey);
      }
    }
  };

  const handleApplyChanges = (
    data: Partial<StoryData> & { _command?: string },
    isToolChanges: boolean = false
  ) => {
    // For tool-based changes, the data already contains final computed values
    // (arrays are complete replacements, scalars like level/points are direct values)
    // Only use applyCreatorChangesToStoryData for JSON output mode (which has _command markers)

    if (isToolChanges) {
      // Direct tool changes - pass through directly
      console.log("Applying direct tool changes:", data);
      onApplyChanges(data);
    } else {
      // JSON mode - use the converter for merge/replace/delete logic
      console.log("Applying via converter:", data);
      const updates = applyCreatorChangesToStoryData(storyData, data);
      onApplyChanges(updates);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-200"
      onClick={handleBackdropClick}
    >
      <div className="flex h-[95vh] sm:h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white/95 dark:bg-gray-900/95 shadow-2xl border border-white/20 dark:border-gray-700 ring-1 ring-black/5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 px-6 py-4 backdrop-blur-sm">
          <div>
            <h2 className="text-xl font-bold bg-linear-to-r from-purple-600 via-pink-600 to-orange-600 bg-clip-text text-transparent flex items-center gap-2">
              <DynamicIcon
                name="Sparkles"
                className="w-5 h-5 text-purple-500"
              />{" "}
              Story Editor AI
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Edit your story with natural language
            </p>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                onClick={handleClearChat}
                className="rounded-full p-2 text-gray-400 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                title="Clear chat history"
              >
                <DynamicIcon name="Trash2" className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-full p-2 text-gray-400 hover:bg-gray-800 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            >
              <DynamicIcon name="X" className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Settings Bar */}
        <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/80 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* BYOK/Coins Toggle */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-blue-950 rounded-lg border border-gray-200 dark:border-gray-700">
              <span
                className={`text-xs font-medium ${
                  !byokMode ? "text-amber-500" : "text-gray-400"
                }`}
              >
                🪙 Coins
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={byokMode}
                  onChange={(e) => setByokMode(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-8 h-4 bg-amber-500 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-green-600" />
              </label>
              <span
                className={`text-xs font-medium ${
                  byokMode ? "text-green-500" : "text-gray-400"
                }`}
              >
                🔑 BYOK
              </span>
            </div>

            {/* Model Selection */}
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className={`flex-1 min-w-0 bg-white dark:bg-blue-950 border border-gray-200 dark:border-gray-700 text-xs rounded-lg px-2 py-1.5 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-purple-500 outline-none cursor-pointer truncate ${
                  isNovelAISelected ? "ring-1 ring-green-500" : ""
                }`}
              >
                {filteredModels.map(([key, m]) => (
                  <option key={key} value={key}>
                    {m.name}{" "}
                    {byokMode
                      ? ""
                      : m.cost > 0
                      ? `(~${m.cost} coins)`
                      : "(Free)"}
                  </option>
                ))}
              </select>
              {isNovelAISelected && (
                <button
                  onClick={() => setShowKeyInput(!showKeyInput)}
                  className={`p-1.5 rounded-md transition-colors ${
                    novelaiKey
                      ? "text-green-500 hover:bg-green-100 dark:hover:bg-green-900/30"
                      : "text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                  }`}
                  title={
                    novelaiKey
                      ? "NovelAI key configured"
                      : "Enter NovelAI API key"
                  }
                >
                  <DynamicIcon name="Key" className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Output Size */}
            <div className="flex items-center gap-2 px-2 py-1 bg-white dark:bg-blue-950 rounded-lg border border-gray-200 dark:border-gray-700">
              <DynamicIcon
                name="FileText"
                className="w-3.5 h-3.5 text-gray-500"
              />
              <input
                type="range"
                min={500}
                max={modelConfig.maxOutputTokens || 8000}
                step={500}
                value={maxOutputTokens}
                onChange={(e) =>
                  setMaxOutputTokens(parseInt(e.target.value, 10))
                }
                className="w-16 h-1 accent-purple-500 cursor-pointer"
              />
              <span className="text-[10px] text-gray-500 dark:text-gray-400 w-8">
                {maxOutputTokens >= 1000
                  ? `${(maxOutputTokens / 1000).toFixed(1)}k`
                  : maxOutputTokens}
              </span>
            </div>

            {/* Estimated Cost */}
            <div className="text-[10px] px-2 py-1 bg-white dark:bg-blue-950 rounded-lg border border-gray-200 dark:border-gray-700">
              <span className="text-gray-500 dark:text-gray-400">Est: </span>
              {byokMode ? (
                <span className="font-medium text-green-600 dark:text-green-400">
                  ~${estimatedCost().dollars.toFixed(4)}
                </span>
              ) : (
                <span className="font-medium text-amber-600 dark:text-amber-400">
                  ~{estimatedCost().coins} coins
                </span>
              )}
            </div>
          </div>

          {byokMode && !hasAnyBYOKKey && (
            <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/30 rounded-lg">
              <p className="text-xs text-red-600 dark:text-red-300">
                ⚠️ No API keys configured. Add keys in Settings (gear icon).
              </p>
            </div>
          )}

          {showKeyInput && isNovelAISelected && (
            <div className="mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-3">
              <div className="flex items-center gap-2 mb-2">
                <DynamicIcon name="Key" className="w-4 h-4 text-purple-500" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  NovelAI API Key
                </span>
              </div>
              <input
                type="password"
                value={novelaiKey}
                onChange={(e) => setNovelaiKey(e.target.value)}
                placeholder="Enter your NovelAI key..."
                className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md focus:ring-2 focus:ring-purple-500 outline-none"
              />
              <button
                onClick={() => setShowKeyInput(false)}
                className="mt-2 w-full px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded-md transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/50 dark:bg-black/20">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 dark:text-gray-400 space-y-4 p-8">
              <div className="w-20 h-20 bg-linear-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 rounded-full flex items-center justify-center text-4xl shadow-inner">
                <DynamicIcon
                  name="Wand2"
                  className="w-10 h-10 text-purple-600 dark:text-purple-400"
                />
              </div>
              <div className="max-w-md w-full">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Edit Your Story
                </h3>
                <p className="text-sm mb-4">
                  I can modify stats, add items, create lore, adjust resources,
                  and more. I have access to your current story state and recent
                  history.
                </p>

                {/* Story Context Display */}
                <StoryContextDisplay storyData={storyData} />

                <div className="grid grid-cols-1 gap-2 text-sm mt-4">
                  <button
                    onClick={() =>
                      setInput("Give me a healing potion for this tough fight")
                    }
                    className="px-4 py-2 rounded-lg bg-white dark:bg-blue-950 border border-gray-200 dark:border-gray-700 hover:border-purple-500 transition-colors text-left shadow-xs"
                  >
                    &ldquo;Give me a healing potion...&rdquo;
                  </button>
                  <button
                    onClick={() =>
                      setInput("Add a lore entry about this mysterious temple")
                    }
                    className="px-4 py-2 rounded-lg bg-white dark:bg-blue-950 border border-gray-200 dark:border-gray-700 hover:border-purple-500 transition-colors text-left shadow-xs"
                  >
                    &ldquo;Add a lore entry about...&rdquo;
                  </button>
                  <button
                    onClick={() =>
                      setInput("Increase my Strength stat by 10 points")
                    }
                    className="px-4 py-2 rounded-lg bg-white dark:bg-blue-950 border border-gray-200 dark:border-gray-700 hover:border-purple-500 transition-colors text-left shadow-xs"
                  >
                    &ldquo;Increase my Strength...&rdquo;
                  </button>
                </div>
              </div>
            </div>
          )}
          {messages.map((msg, idx) => (
            <MessageItem
              key={idx}
              message={
                msg as ChatMessage & {
                  meta?: Record<string, unknown>;
                  toolResults?: CreatorToolResult[];
                  toolChanges?: CreatorChanges;
                }
              }
              onApplyChanges={handleApplyChanges}
            />
          ))}
          {loading && (
            <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="rounded-2xl rounded-tl-none bg-white dark:bg-blue-950 px-5 py-3 shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce"></span>
                </div>
                <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                  Thinking...
                </span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-6">
          <div className="relative flex items-end gap-2 bg-gray-50 dark:bg-blue-950 p-2 rounded-xl border border-gray-200 dark:border-gray-700 focus-within:ring-2 focus-within:ring-purple-500/50 focus-within:border-purple-500 transition-all shadow-inner">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe what you want to change..."
              className="flex-1 resize-none bg-transparent px-3 py-2 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none max-h-32 min-h-11"
              rows={1}
              style={{ height: "auto" }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
              }}
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="mb-0.5 p-2 rounded-lg bg-linear-to-r from-purple-600 to-pink-600 text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg active:scale-95"
            >
              {loading ? (
                <DynamicIcon name="Loader2" className="w-5 h-5 animate-spin" />
              ) : (
                <DynamicIcon name="Send" className="w-5 h-5" />
              )}
            </button>
          </div>
          <div className="text-center mt-2">
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              Changes won&apos;t affect your story until you click
              &ldquo;Apply&rdquo;
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageItem({
  message,
  onApplyChanges,
}: {
  message: ChatMessage & {
    meta?: Record<string, unknown>;
    toolResults?: CreatorToolResult[];
    toolChanges?: CreatorChanges;
  };
  onApplyChanges: (data: Partial<StoryData>, isToolChanges?: boolean) => void;
}) {
  const isUser = message.role === "user";
  const meta = message.meta;
  const toolResults = message.toolResults;
  const toolChanges = message.toolChanges;

  // Check if we have tool-based changes
  const hasToolChanges = toolChanges && Object.keys(toolChanges).length > 0;

  // Calculate dollar cost from usage if available
  const dollarCost = useMemo(() => {
    if (!meta?.usage || !meta?.modelName) return null;

    const modelName = meta.modelName as string;

    // Check if this is a custom model (UUID format)
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        modelName
      );

    let inputPrice = 0;
    let outputPrice = 0;

    if (isUUID) {
      // Try to get pricing from custom models in localStorage
      try {
        const stored = localStorage.getItem("customModels");
        if (stored) {
          const customModels: CustomModel[] = JSON.parse(stored);
          const customModel = customModels.find((m) => m.id === modelName);
          if (customModel) {
            inputPrice = customModel.inputPrice || 0;
            outputPrice = customModel.outputPrice || 0;
          }
        }
      } catch {
        // Ignore localStorage errors
      }
    } else {
      const modelConfig = getModelConfig(modelName);
      inputPrice = modelConfig.inputPrice;
      outputPrice = modelConfig.outputPrice;
    }

    const inputTokens =
      (meta.usage as { promptTokens?: number }).promptTokens || 0;
    const outputTokens =
      (meta.usage as { completionTokens?: number }).completionTokens || 0;
    return (
      (inputPrice * inputTokens) / 1000000 +
      (outputPrice * outputTokens) / 1000000
    );
  }, [meta]);

  return (
    <div
      className={`flex ${
        isUser ? "justify-end" : "justify-start"
      } animate-in fade-in slide-in-from-bottom-2 duration-300`}
    >
      <div
        className={`max-w-[90%] sm:max-w-[85%] rounded-2xl px-5 py-4 shadow-sm ${
          isUser
            ? "rounded-tr-sm bg-linear-to-br from-purple-600 to-pink-600 text-white"
            : "rounded-tl-sm bg-white dark:bg-blue-950 text-gray-800 dark:text-gray-200 border border-gray-100 dark:border-gray-700"
        }`}
      >
        <div
          className={`leading-relaxed max-w-none ${
            isUser ? "text-white" : "text-gray-800 dark:text-gray-200"
          }`}
        >
          <ReactMarkdown
            components={{
              p: ({ children }) => (
                <p
                  className={`mb-2 last:mb-0 ${
                    isUser ? "text-white" : "text-gray-800 dark:text-gray-200"
                  }`}
                >
                  {children}
                </p>
              ),
              h1: ({ children }) => (
                <h1
                  className={`text-xl font-bold mb-2 mt-3 first:mt-0 ${
                    isUser ? "text-white" : "text-gray-900 dark:text-white"
                  }`}
                >
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2
                  className={`text-lg font-bold mb-2 mt-3 first:mt-0 ${
                    isUser ? "text-white" : "text-gray-900 dark:text-white"
                  }`}
                >
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3
                  className={`text-base font-bold mb-1.5 mt-2 first:mt-0 ${
                    isUser ? "text-white" : "text-gray-900 dark:text-white"
                  }`}
                >
                  {children}
                </h3>
              ),
              strong: ({ children }) => (
                <strong
                  className={`font-bold ${
                    isUser ? "text-white" : "text-gray-900 dark:text-white"
                  }`}
                >
                  {children}
                </strong>
              ),
              em: ({ children }) => (
                <em
                  className={`italic ${
                    isUser
                      ? "text-white/90"
                      : "text-gray-700 dark:text-gray-300"
                  }`}
                >
                  {children}
                </em>
              ),
              ul: ({ children }) => (
                <ul
                  className={`list-disc ml-4 mb-2 space-y-0.5 last:mb-0 ${
                    isUser ? "text-white" : "text-gray-800 dark:text-gray-200"
                  }`}
                >
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol
                  className={`list-decimal ml-4 mb-2 space-y-0.5 last:mb-0 ${
                    isUser ? "text-white" : "text-gray-800 dark:text-gray-200"
                  }`}
                >
                  {children}
                </ol>
              ),
              li: ({ children }) => (
                <li className="leading-relaxed">{children}</li>
              ),
              blockquote: ({ children }) => (
                <blockquote
                  className={`border-l-2 pl-3 italic my-2 ${
                    isUser
                      ? "border-white/50 text-white/80"
                      : "border-purple-500 text-gray-600 dark:text-gray-400"
                  }`}
                >
                  {children}
                </blockquote>
              ),
              code: ({ children, className }) => {
                const isBlock = className?.includes("language-");
                if (isBlock) {
                  return (
                    <pre className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 overflow-x-auto my-2">
                      <code className="text-xs font-mono text-gray-800 dark:text-gray-200">
                        {children}
                      </code>
                    </pre>
                  );
                }
                return (
                  <code
                    className={`px-1 py-0.5 rounded text-xs font-mono ${
                      isUser
                        ? "bg-white/20 text-purple-200"
                        : "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300"
                    }`}
                  >
                    {children}
                  </code>
                );
              },
              pre: ({ children }) => <>{children}</>,
              hr: () => (
                <hr
                  className={`my-3 border-t ${
                    isUser
                      ? "border-white/30"
                      : "border-gray-300 dark:border-gray-600"
                  }`}
                />
              ),
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
        {!isUser &&
          (meta?.tokenCost !== undefined || (meta?.isByok as boolean)) && (
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700/50 flex items-center justify-between text-xs">
              <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                <DynamicIcon name="Info" className="w-3 h-3" />
                Generation cost
              </span>
              {meta?.isByok ? (
                <span className="font-semibold text-green-600 dark:text-green-400">
                  {dollarCost !== null ? `~$${dollarCost.toFixed(4)}` : "Free"}{" "}
                  (BYOK)
                </span>
              ) : (
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  {meta?.tokenCost as number}{" "}
                  {(meta?.tokenCost as number) === 1 ? "coin" : "coins"}
                </span>
              )}
            </div>
          )}

        {/* Tool Results Display */}
        {toolResults && toolResults.length > 0 && (
          <ToolResultsDisplay
            toolResults={toolResults}
            toolChanges={toolChanges}
            hasToolChanges={hasToolChanges}
            onApplyChanges={onApplyChanges}
          />
        )}
      </div>
    </div>
  );
}

// Helper to get icon for tool type
function getToolIcon(
  toolName: string
):
  | "BarChart2"
  | "Diamond"
  | "Backpack"
  | "Wand2"
  | "Scroll"
  | "Trophy"
  | "Swords"
  | "Users"
  | "Variable"
  | "Table"
  | "GitBranch"
  | "LayoutTemplate"
  | "Target"
  | "Settings"
  | "TrendingUp"
  | "Wrench"
  | "AlertCircle"
  | "Brain" {
  if (toolName.includes("stat")) return "BarChart2";
  if (toolName.includes("resource")) return "Diamond";
  if (toolName.includes("item") || toolName.includes("inventory"))
    return "Backpack";
  if (toolName.includes("ability")) return "Wand2";
  if (toolName.includes("lore")) return "Scroll";
  if (toolName.includes("achievement")) return "Trophy";
  if (toolName.includes("quest")) return "Swords";
  if (toolName.includes("relationship")) return "Users";
  if (toolName.includes("variable")) return "Variable";
  if (toolName.includes("table")) return "Table";
  if (toolName.includes("skill_tree")) return "GitBranch";
  if (toolName.includes("preset")) return "LayoutTemplate";
  if (toolName.includes("starting_choice")) return "Target";
  if (toolName.includes("basic_info") || toolName.includes("metadata"))
    return "Settings";
  if (toolName.includes("leveling") || toolName.includes("upgrade"))
    return "TrendingUp";
  if (toolName.includes("condition")) return "AlertCircle";
  if (toolName.includes("memory")) return "Brain";
  return "Wrench";
}

// Helper to get action type from tool name
function getActionType(toolName: string): {
  type: "add" | "modify" | "remove";
  color: string;
  bgColor: string;
} {
  if (toolName.startsWith("add_") || toolName.startsWith("create_")) {
    return {
      type: "add",
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-100 dark:bg-green-900/30",
    };
  }
  if (toolName.startsWith("remove_") || toolName.startsWith("delete_")) {
    return {
      type: "remove",
      color: "text-red-600 dark:text-red-400",
      bgColor: "bg-red-100 dark:bg-red-900/30",
    };
  }
  return {
    type: "modify",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
  };
}

// Helper to format tool name nicely
function formatToolName(toolName: string): string {
  return toolName.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

// Tool Results Display component
function ToolResultsDisplay({
  toolResults,
  toolChanges,
  hasToolChanges,
  onApplyChanges,
}: {
  toolResults: CreatorToolResult[];
  toolChanges?: CreatorChanges;
  hasToolChanges?: boolean;
  onApplyChanges: (data: Partial<StoryData>, isToolChanges?: boolean) => void;
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const successCount = toolResults.filter((r) => r.success).length;
  const failCount = toolResults.length - successCount;

  // Helper to safely check if a value exists and is truthy
  const has = (val: unknown): val is string | number | boolean =>
    val !== undefined && val !== null && val !== "";

  return (
    <div className="mt-4 rounded-xl bg-linear-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border border-purple-200 dark:border-purple-700/50 overflow-hidden shadow-lg">
      {/* Header */}
      <div className="bg-linear-to-r from-purple-100/80 to-indigo-100/80 dark:from-purple-900/40 dark:to-indigo-900/40 px-4 py-3 border-b border-purple-200 dark:border-purple-700/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-linear-to-br from-purple-500 to-indigo-500 flex items-center justify-center shadow-md">
              <DynamicIcon name="Wrench" className="w-4 h-4 text-white" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-purple-900 dark:text-purple-100">
                Tool Actions
              </h4>
              <div className="flex items-center gap-2 text-xs">
                {successCount > 0 && (
                  <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                    <DynamicIcon name="CheckCircle" className="w-3 h-3" />
                    {successCount} success
                  </span>
                )}
                {failCount > 0 && (
                  <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                    <DynamicIcon name="XCircle" className="w-3 h-3" />
                    {failCount} failed
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tool Results List */}
      <div className="p-3 space-y-2 max-h-[400px] overflow-y-auto">
        {toolResults.map((result, idx) => {
          const action = getActionType(result.toolName);
          const icon = getToolIcon(result.toolName);
          const isExpanded = expandedIdx === idx;

          return (
            <div
              key={idx}
              className={`rounded-lg border overflow-hidden transition-all ${
                result.success
                  ? "bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700"
                  : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700/30"
              }`}
            >
              {/* Header Row - Clickable */}
              <div
                className="flex items-start gap-3 p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                onClick={() => setExpandedIdx(isExpanded ? null : idx)}
              >
                {/* Icon */}
                <div
                  className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${action.bgColor}`}
                >
                  <DynamicIcon
                    name={icon}
                    className={`w-4 h-4 ${action.color}`}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                      {formatToolName(result.toolName)}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        action.type === "add"
                          ? "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300"
                          : action.type === "remove"
                          ? "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300"
                          : "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300"
                      }`}
                    >
                      {action.type}
                    </span>
                  </div>

                  {/* Show preview when collapsed */}
                  {!isExpanded && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {result.args && Object.keys(result.args).length > 0 ? (
                        <>
                          {Object.entries(result.args)
                            .slice(0, 3)
                            .map(([key, value], i) => {
                              const label = key
                                .replace(/([A-Z])/g, " $1")
                                .replace(/_/g, " ")
                                .trim();
                              const displayValue =
                                typeof value === "boolean"
                                  ? value
                                    ? "✓"
                                    : "✗"
                                  : typeof value === "number"
                                  ? String(value)
                                  : Array.isArray(value)
                                  ? `${value.length} items`
                                  : typeof value === "object" && value !== null
                                  ? "configured"
                                  : String(value).substring(0, 20);
                              return (
                                <span
                                  key={i}
                                  className="text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/50 px-2 py-0.5 rounded"
                                >
                                  <span className="text-gray-500 dark:text-gray-500">
                                    {label}:
                                  </span>{" "}
                                  <span className="font-medium">
                                    {displayValue}
                                  </span>
                                </span>
                              );
                            })}
                          {Object.keys(result.args).length > 3 && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              +{Object.keys(result.args).length - 3} more
                            </span>
                          )}
                        </>
                      ) : result.changes && result.changes.length > 0 ? (
                        <>
                          {result.changes.slice(0, 2).map((change, i) => (
                            <span
                              key={i}
                              className="text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/50 px-2 py-0.5 rounded"
                            >
                              {change.length > 40
                                ? change.substring(0, 40) + "..."
                                : change}
                            </span>
                          ))}
                          {result.changes.length > 2 && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              +{result.changes.length - 2} more
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-gray-500 dark:text-gray-400 italic">
                          Click to see details
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Status & Expand */}
                <div className="shrink-0 flex items-center gap-2">
                  {result.success ? (
                    <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                      <DynamicIcon
                        name="Check"
                        className="w-3.5 h-3.5 text-green-600 dark:text-green-400"
                      />
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center">
                      <DynamicIcon
                        name="X"
                        className="w-3.5 h-3.5 text-red-600 dark:text-red-400"
                      />
                    </div>
                  )}
                  <DynamicIcon
                    name={isExpanded ? "ChevronUp" : "ChevronDown"}
                    className="w-4 h-4 text-gray-400"
                  />
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="px-3 pb-3 border-t border-gray-100 dark:border-gray-700/50 pt-2">
                  {/* Changes List */}
                  {result.changes && result.changes.length > 0 && (
                    <div className="mb-3">
                      <span className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium">
                        Changes Made
                      </span>
                      <ul className="mt-1 space-y-0.5">
                        {result.changes.map((change, i) => (
                          <li
                            key={i}
                            className="text-xs text-gray-700 dark:text-gray-300 flex items-start gap-1.5"
                          >
                            <span className="text-green-500 mt-0.5">•</span>
                            {change}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Detailed Args Display */}
                  {result.args && Object.keys(result.args).length > 0 && (
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium">
                        Parameters
                      </span>
                      <ToolArgsDisplay
                        toolName={result.toolName}
                        args={result.args}
                        has={has}
                      />
                    </div>
                  )}

                  {/* Raw JSON toggle for debugging */}
                  {result.args && Object.keys(result.args).length > 0 && (
                    <details className="mt-3">
                      <summary className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 cursor-pointer hover:text-gray-600 dark:hover:text-gray-400">
                        Raw Data
                      </summary>
                      <pre className="mt-1 text-[10px] bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto text-gray-600 dark:text-gray-400 max-h-40 overflow-y-auto">
                        {JSON.stringify(result.args, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Apply Button */}
      {hasToolChanges && (
        <div className="p-3 bg-linear-to-r from-purple-100/80 to-indigo-100/80 dark:from-purple-900/40 dark:to-indigo-900/40 border-t border-purple-200 dark:border-purple-700/50">
          <button
            onClick={() =>
              onApplyChanges(toolChanges as Partial<StoryData>, true)
            }
            className="w-full rounded-xl bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white py-2.5 text-sm font-bold transition-all shadow-lg hover:shadow-xl active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <DynamicIcon name="Check" className="w-4 h-4" />
            Apply Tool Changes
          </button>
        </div>
      )}
    </div>
  );
}

// Tool Args Display component
function ToolArgsDisplay({
  toolName,
  args,
  has,
}: {
  toolName: string;
  args?: Record<string, unknown>;
  has: (val: unknown) => val is string | number | boolean;
}) {
  if (!args || Object.keys(args).length === 0) return null;

  // Stats/Resources display
  if (toolName.includes("stat") || toolName.includes("resource")) {
    const items = (args.stats ||
      args.resources ||
      args.modifications || [args]) as Record<string, unknown>[];
    const arrayItems = Array.isArray(items) ? items : [items];

    return (
      <div className="mt-2 space-y-2">
        {arrayItems.slice(0, 3).map((item, idx) => (
          <div
            key={idx}
            className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center gap-2 mb-1">
              {has(item.symbol) && (
                <span className="text-base">{String(item.symbol)}</span>
              )}
              <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                {String(item.name || item.new_name || "Unknown")}
              </span>
              {item.value !== undefined && (
                <span className="ml-auto text-sm font-mono bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded">
                  {String(item.value)}
                  {item.maxValue !== undefined ? `/${item.maxValue}` : ""}
                </span>
              )}
            </div>
            {has(item.description) && (
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                {String(item.description)}
              </p>
            )}
          </div>
        ))}
        {arrayItems.length > 3 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            +{arrayItems.length - 3} more...
          </p>
        )}
      </div>
    );
  }

  // Items/Inventory display
  if (toolName.includes("item") || toolName.includes("inventory")) {
    const items = (args.items || args.modifications || [args]) as Record<
      string,
      unknown
    >[];
    const arrayItems = Array.isArray(items) ? items : [items];

    return (
      <div className="mt-2 space-y-2">
        {arrayItems.slice(0, 3).map((item, idx) => (
          <div
            key={idx}
            className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center gap-2 mb-1">
              {has(item.symbol) && (
                <span className="text-base">{String(item.symbol)}</span>
              )}
              <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                {String(item.name || "Unknown")}
              </span>
              {has(item.quantity) && (
                <span className="text-xs text-gray-500">
                  x{String(item.quantity)}
                </span>
              )}
              {has(item.grade) && (
                <span className="ml-auto text-[10px] uppercase px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
                  {String(item.grade)}
                </span>
              )}
              {has(item.type) && (
                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                  {String(item.type)}
                </span>
              )}
            </div>
            {has(item.description) && (
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                {String(item.description)}
              </p>
            )}
          </div>
        ))}
        {arrayItems.length > 3 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            +{arrayItems.length - 3} more...
          </p>
        )}
      </div>
    );
  }

  // Abilities display
  if (toolName.includes("ability")) {
    const items = (args.abilities || args.modifications || [args]) as Record<
      string,
      unknown
    >[];
    const arrayItems = Array.isArray(items) ? items : [items];

    return (
      <div className="mt-2 space-y-2">
        {arrayItems.slice(0, 3).map((item, idx) => (
          <div
            key={idx}
            className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center gap-2 mb-1">
              {has(item.symbol) && (
                <span className="text-base">{String(item.symbol)}</span>
              )}
              <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                {String(item.name || "Unknown")}
              </span>
              {has(item.grade) && (
                <span className="ml-auto text-[10px] uppercase px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
                  {String(item.grade)}
                </span>
              )}
            </div>
            {has(item.description) && (
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                {String(item.description)}
              </p>
            )}
          </div>
        ))}
        {arrayItems.length > 3 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            +{arrayItems.length - 3} more...
          </p>
        )}
      </div>
    );
  }

  // Lore display
  if (toolName.includes("lore")) {
    const items = (args.lore_entries || args.lore || [args]) as Record<
      string,
      unknown
    >[];
    const arrayItems = Array.isArray(items) ? items : [items];

    return (
      <div className="mt-2 space-y-2">
        {arrayItems.slice(0, 2).map((item, idx) => (
          <div
            key={idx}
            className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center gap-2 mb-1">
              <DynamicIcon
                name="Scroll"
                className="w-3.5 h-3.5 text-amber-500"
              />
              <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                {String(item.title || item.name || "Unknown")}
              </span>
              {item.secret === true && (
                <span className="ml-auto text-[10px] uppercase px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300">
                  Secret
                </span>
              )}
            </div>
            {has(item.content) && (
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3">
                {String(item.content)}
              </p>
            )}
          </div>
        ))}
        {arrayItems.length > 2 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            +{arrayItems.length - 2} more...
          </p>
        )}
      </div>
    );
  }

  // Achievements display
  if (toolName.includes("achievement")) {
    // Handle both array format and single achievement at top level
    // AI might send: { achievements: [{title: "X"}] } OR { title: "X", ai_hint: "Y" }
    let items: Record<string, unknown>[];
    if (args.achievements && Array.isArray(args.achievements)) {
      items = args.achievements as Record<string, unknown>[];
    } else if (args.titles && Array.isArray(args.titles)) {
      // For remove_achievements which uses "titles" array
      items = (args.titles as string[]).map((t) => ({ title: t }));
    } else if (args.title) {
      // Single achievement at top level
      items = [args as Record<string, unknown>];
    } else {
      items = [];
    }

    const arrayItems = Array.isArray(items) ? items : [items];

    // Handle case where achievements array is empty or undefined
    if (
      arrayItems.length === 0 ||
      (arrayItems.length === 1 && Object.keys(arrayItems[0] || {}).length === 0)
    ) {
      return null;
    }

    return (
      <div className="mt-2 space-y-2">
        {arrayItems.slice(0, 5).map((item, idx) => {
          // Get the title - could be 'title' or for renames check both
          // Debug: explicitly check each field
          const titleVal = item.title;
          const newTitleVal = item.new_title;
          const displayTitle = titleVal
            ? String(titleVal)
            : newTitleVal
            ? String(newTitleVal)
            : "(No Title)";

          return (
            <div
              key={idx}
              className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-2 mb-1">
                {has(item.symbol) && (
                  <span className="text-base">{String(item.symbol)}</span>
                )}
                <DynamicIcon
                  name="Trophy"
                  className="w-3.5 h-3.5 text-amber-500"
                />
                <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                  {displayTitle}
                </span>
                {has(item.points) && (
                  <span className="ml-auto text-xs font-mono bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded">
                    {String(item.points)} pts
                  </span>
                )}
                {item.hidden === true && (
                  <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-900/50 text-gray-600 dark:text-gray-400">
                    Hidden
                  </span>
                )}
              </div>
              {has(item.description) && (
                <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                  {String(item.description)}
                </p>
              )}
              {has(item.ai_hint) && (
                <p className="text-xs text-purple-600 dark:text-purple-400 line-clamp-2 mt-1 italic">
                  AI Hint: {String(item.ai_hint)}
                </p>
              )}
              {/* Show what fields are being modified if it's a modify operation */}
              {toolName === "modify_achievements" &&
                !has(item.description) &&
                !has(item.ai_hint) && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                    {Object.keys(item)
                      .filter((k) => k !== "title")
                      .map((k) =>
                        k
                          .replace(/_/g, " ")
                          .replace(/\b\w/g, (l) => l.toUpperCase())
                      )
                      .join(", ") || "No changes specified"}
                  </p>
                )}
            </div>
          );
        })}
        {arrayItems.length > 5 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            +{arrayItems.length - 5} more...
          </p>
        )}
      </div>
    );
  }

  // Quests display
  if (toolName.includes("quest")) {
    const items = (args.quests || args.modifications || [args]) as Record<
      string,
      unknown
    >[];
    const arrayItems = Array.isArray(items) ? items : [items];

    return (
      <div className="mt-2 space-y-2">
        {arrayItems.slice(0, 3).map((item, idx) => (
          <div
            key={idx}
            className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center gap-2 mb-1">
              <DynamicIcon
                name="Swords"
                className="w-3.5 h-3.5 text-blue-500"
              />
              <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                {String(item.title || item.name || item.new_title || "Unknown")}
              </span>
              {has(item.points) && (
                <span className="ml-auto text-xs font-mono bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
                  {String(item.points)} pts
                </span>
              )}
              {item.active === true && (
                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400">
                  Active
                </span>
              )}
            </div>
            {has(item.shortDescription) && (
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                {String(item.shortDescription)}
              </p>
            )}
            {has(item.description) && !has(item.shortDescription) && (
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                {String(item.description)}
              </p>
            )}
          </div>
        ))}
        {arrayItems.length > 3 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            +{arrayItems.length - 3} more...
          </p>
        )}
      </div>
    );
  }

  // Relationships display
  if (toolName.includes("relationship")) {
    const items = (args.relationships ||
      args.modifications || [args]) as Record<string, unknown>[];
    const arrayItems = Array.isArray(items) ? items : [items];

    return (
      <div className="mt-2 space-y-2">
        {arrayItems.slice(0, 3).map((item, idx) => {
          const value = item.value as number | undefined;
          const sentiment =
            value !== undefined
              ? value >= 50
                ? "text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/50"
                : value >= 0
                ? "text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/50"
                : value >= -50
                ? "text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/50"
                : "text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/50"
              : "text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-900/50";

          return (
            <div
              key={idx}
              className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-2 mb-1">
                {has(item.symbol) && (
                  <span className="text-base">{String(item.symbol)}</span>
                )}
                <DynamicIcon
                  name="Users"
                  className="w-3.5 h-3.5 text-purple-500"
                />
                <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                  {String(item.name || item.new_name || "Unknown")}
                </span>
                {value !== undefined && (
                  <span
                    className={`ml-auto text-xs font-mono px-2 py-0.5 rounded ${sentiment}`}
                  >
                    {value > 0 ? "+" : ""}
                    {value}
                  </span>
                )}
              </div>
              {has(item.description) && (
                <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                  {String(item.description)}
                </p>
              )}
            </div>
          );
        })}
        {arrayItems.length > 3 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            +{arrayItems.length - 3} more...
          </p>
        )}
      </div>
    );
  }

  // Variables display
  if (toolName.includes("variable")) {
    const items = (args.variables || args.modifications || [args]) as Record<
      string,
      unknown
    >[];
    const arrayItems = Array.isArray(items) ? items : [items];

    return (
      <div className="mt-2 space-y-2">
        {arrayItems.slice(0, 3).map((item, idx) => (
          <div
            key={idx}
            className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center gap-2 mb-1">
              <DynamicIcon
                name="Variable"
                className="w-3.5 h-3.5 text-indigo-500"
              />
              <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                {String(item.name || item.id || item.new_name || "Unknown")}
              </span>
              {has(item.type) && (
                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400">
                  {String(item.type)}
                </span>
              )}
              {has(item.value) && (
                <span className="ml-auto text-xs font-mono bg-gray-100 dark:bg-gray-900/50 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded">
                  {String(item.value)}
                </span>
              )}
            </div>
            {has(item.description) && (
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                {String(item.description)}
              </p>
            )}
          </div>
        ))}
        {arrayItems.length > 3 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            +{arrayItems.length - 3} more...
          </p>
        )}
      </div>
    );
  }

  // Progression (level, XP, upgrades)
  if (toolName === "set_progression") {
    const progressionIcons: Record<string, string> = {
      level: "⭐",
      points: "✨",
      add_points: "➕",
      upgradesSpent: "🔧",
    };
    const progressionLabels: Record<string, string> = {
      level: "Level",
      points: "XP (Total)",
      add_points: "Add XP",
      upgradesSpent: "Upgrades Spent",
    };

    const entries = Object.entries(args).filter(
      ([, v]) => v !== undefined && v !== null
    );
    if (entries.length === 0) return null;

    return (
      <div className="mt-2 space-y-2">
        {entries.map(([key, value]) => {
          const icon = progressionIcons[key] || "📊";
          const label = progressionLabels[key] || key;

          return (
            <div
              key={key}
              className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-2 border border-yellow-200 dark:border-yellow-700/50 flex items-center gap-2"
            >
              <span className="text-base">{icon}</span>
              <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                {label}
              </span>
              <span className="ml-auto text-sm font-mono bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300 px-2 py-0.5 rounded">
                {typeof value === "number" && key === "add_points"
                  ? (value >= 0 ? "+" : "") + String(value)
                  : String(value)}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  // Leveling/Upgrade settings
  if (toolName.includes("leveling") || toolName.includes("upgrade_settings")) {
    const settingIcons: Record<string, string> = {
      xpBase: "⚡",
      levelCap: "🎯",
      defaultUpgradesPerLevel: "⬆️",
      useCustomCurve: "📈",
      startingUpgrades: "🌟",
      pointsToLevelUp: "💎",
      maxLevel: "🏆",
      upgradePointsPerLevel: "📦",
    };
    const settingLabels: Record<string, string> = {
      xpBase: "XP Base Multiplier",
      levelCap: "Maximum Level",
      defaultUpgradesPerLevel: "Upgrades Per Level",
      useCustomCurve: "Custom XP Curve",
      startingUpgrades: "Starting Upgrades",
      pointsToLevelUp: "Points to Level Up",
      maxLevel: "Max Level",
      upgradePointsPerLevel: "Upgrade Points/Level",
    };

    const entries = Object.entries(args).filter(
      ([, v]) => v !== undefined && v !== null
    );
    if (entries.length === 0) return null;

    return (
      <div className="mt-2 space-y-2">
        {entries.map(([key, value]) => {
          const icon = settingIcons[key] || "⚙️";
          const label =
            settingLabels[key] ||
            key
              .replace(/([A-Z])/g, " $1")
              .replace(/_/g, " ")
              .trim();

          return (
            <div
              key={key}
              className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2 border border-gray-200 dark:border-gray-700 flex items-center gap-2"
            >
              <span className="text-base">{icon}</span>
              <span className="font-medium text-sm text-gray-900 dark:text-gray-100 capitalize">
                {label}
              </span>
              <span className="ml-auto text-sm font-mono bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded">
                {typeof value === "boolean"
                  ? value
                    ? "✓ Enabled"
                    : "✗ Disabled"
                  : String(value)}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  // Default: generic key-value display
  return (
    <div className="mt-2 space-y-1">
      {Object.entries(args)
        .slice(0, 8)
        .map(([key, value]) => {
          const label = key
            .replace(/([A-Z])/g, " $1")
            .replace(/_/g, " ")
            .trim();
          const displayValue =
            typeof value === "boolean"
              ? value
                ? "Yes"
                : "No"
              : typeof value === "object"
              ? JSON.stringify(value)
              : String(value);

          return (
            <div key={key} className="flex items-start gap-2 py-1">
              <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 w-24 shrink-0 pt-0.5">
                {label}
              </span>
              <span className="text-xs text-gray-800 dark:text-gray-200 line-clamp-2">
                {displayValue.length > 60
                  ? displayValue.substring(0, 60) + "..."
                  : displayValue}
              </span>
            </div>
          );
        })}
      {Object.keys(args).length > 8 && (
        <p className="text-xs text-gray-500 text-center">
          +{Object.keys(args).length - 8} more...
        </p>
      )}
    </div>
  );
}

// Keep ChangeSummary for backward compatibility but it's no longer used
function ChangeSummary({
  data,
}: {
  data: Partial<StoryData> & {
    title?: string;
    shortDescription?: string;
    description?: string;
  };
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const changes: {
    type: string;
    label: string;
    value: string;
    details?: unknown;
    icon: string;
  }[] = [];

  // Story data changes
  if (data.story_name)
    changes.push({
      type: "Update",
      label: "Story Name",
      value: data.story_name,
      icon: "Edit3",
    });
  if (data.premise)
    changes.push({
      type: "Update",
      label: "Premise",
      value: "Updated premise text",
      details: data.premise,
      icon: "BookOpen",
    });
  if (data.player_name)
    changes.push({
      type: "Update",
      label: "Player Name",
      value: data.player_name,
      icon: "User",
    });
  if (data.player_summary)
    changes.push({
      type: "Update",
      label: "Player Summary",
      value: "Updated summary",
      details: data.player_summary,
      icon: "FileText",
    });
  if (data.intro)
    changes.push({
      type: "Update",
      label: "Intro",
      value: "Updated intro",
      details: data.intro,
      icon: "Clapperboard",
    });
  if (data.author_notes)
    changes.push({
      type: "Update",
      label: "Author Notes",
      value: "Updated notes",
      details: data.author_notes,
      icon: "StickyNote",
    });

  if (data.stats?.length) {
    changes.push({
      type: "Add/Update",
      label: "Stats",
      value: `${data.stats.length} stat${data.stats.length > 1 ? "s" : ""}`,
      details: data.stats,
      icon: "BarChart2",
    });
  }
  if (data.resources?.length) {
    changes.push({
      type: "Add/Update",
      label: "Resources",
      value: `${data.resources.length} resource${
        data.resources.length > 1 ? "s" : ""
      }`,
      details: data.resources,
      icon: "Diamond",
    });
  }
  if (data.inventory?.length) {
    changes.push({
      type: "Add/Update",
      label: "Inventory",
      value: `${data.inventory.length} item${
        data.inventory.length > 1 ? "s" : ""
      }`,
      details: data.inventory,
      icon: "Backpack",
    });
  }
  if (data.abilities?.length) {
    changes.push({
      type: "Add/Update",
      label: "Abilities",
      value: `${data.abilities.length} abilit${
        data.abilities.length > 1 ? "ies" : "y"
      }`,
      details: data.abilities,
      icon: "Wand2",
    });
  }
  if (data.lore?.length) {
    changes.push({
      type: "Add/Update",
      label: "Lore",
      value: `${data.lore.length} entr${data.lore.length > 1 ? "ies" : "y"}`,
      details: data.lore,
      icon: "Scroll",
    });
  }
  if (data.achievements?.length) {
    changes.push({
      type: "Add/Update",
      label: "Achievements",
      value: `${data.achievements.length} achievement${
        data.achievements.length > 1 ? "s" : ""
      }`,
      details: data.achievements,
      icon: "Trophy",
    });
  }
  if (data.quests?.length) {
    changes.push({
      type: "Add/Update",
      label: "Quests",
      value: `${data.quests.length} quest${data.quests.length > 1 ? "s" : ""}`,
      details: data.quests,
      icon: "Swords",
    });
  }
  if (data.presets?.length) {
    changes.push({
      type: "Add/Update",
      label: "Presets",
      value: `${data.presets.length} template${
        data.presets.length > 1 ? "s" : ""
      }`,
      details: data.presets,
      icon: "LayoutTemplate",
    });
  }
  if (data.relationships?.length) {
    changes.push({
      type: "Add/Update",
      label: "Relationships",
      value: `${data.relationships.length} relationship${
        data.relationships.length > 1 ? "s" : ""
      }`,
      details: data.relationships,
      icon: "Users",
    });
  }
  if (data.customTables?.length) {
    changes.push({
      type: "Add/Update",
      label: "Custom Tables",
      value: `${data.customTables.length} table${
        data.customTables.length > 1 ? "s" : ""
      }`,
      details: data.customTables,
      icon: "Table",
    });
  }
  if (data.variables?.length) {
    changes.push({
      type: "Add/Update",
      label: "Variables",
      value: `${data.variables.length} variable${
        data.variables.length > 1 ? "s" : ""
      }`,
      details: data.variables,
      icon: "Variable",
    });
  }
  if (data.skillTrees?.length) {
    changes.push({
      type: "Add/Update",
      label: "Skill Trees",
      value: `${data.skillTrees.length} tree${
        data.skillTrees.length > 1 ? "s" : ""
      }`,
      details: data.skillTrees,
      icon: "GitBranch",
    });
  }
  if (data.upgradeSettings) {
    changes.push({
      type: "Update",
      label: "Upgrade Settings",
      value: "Upgrade shop configuration",
      details: data.upgradeSettings,
      icon: "ShoppingCart",
    });
  }
  if (data.levelingSettings) {
    const ls = data.levelingSettings;
    const details = [];
    if (ls.xpBase !== undefined) details.push(`XP Base: ${ls.xpBase}`);
    if (ls.defaultUpgradesPerLevel !== undefined)
      details.push(`Upgrades/Level: ${ls.defaultUpgradesPerLevel}`);
    if (ls.levelCap !== undefined) details.push(`Level Cap: ${ls.levelCap}`);
    if (ls.startingUpgrades) details.push(`Starting Upgrades: configured`);
    changes.push({
      type: "Update",
      label: "Leveling Settings",
      value:
        details.length > 0
          ? details.join(", ")
          : "Updated leveling configuration",
      details: data.levelingSettings,
      icon: "TrendingUp",
    });
  }
  if (data.agmtState) {
    const threads = data.agmtState.threads?.length || 0;
    changes.push({
      type: "Update",
      label: "AGMT State",
      value: `${threads} thread${threads !== 1 ? "s" : ""}`,
      details: data.agmtState,
      icon: "Brain",
    });
  }
  if (data.conditions?.length) {
    changes.push({
      type: "Add/Update",
      label: "Conditions",
      value: `${data.conditions.length} condition${
        data.conditions.length > 1 ? "s" : ""
      }`,
      details: data.conditions,
      icon: "AlertCircle",
    });
  }
  if (data.points !== undefined) {
    changes.push({
      type: "Update",
      label: "Points",
      value: `${data.points} points`,
      icon: "Coins",
    });
  }
  if (data.momentum !== undefined) {
    changes.push({
      type: "Update",
      label: "Momentum",
      value: `${data.momentum}`,
      icon: "Zap",
    });
  }
  if (data.maxMomentum !== undefined) {
    changes.push({
      type: "Update",
      label: "Max Momentum",
      value: `${data.maxMomentum}`,
      icon: "Battery",
    });
  }
  if (data.rpgSystem) {
    changes.push({
      type: "Update",
      label: "RPG System",
      value: data.rpgSystem,
      icon: "Dices",
    });
  }

  if (changes.length === 0) {
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400 italic">
        No structured changes detected
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {changes.map((change, i) => (
        <div
          key={i}
          className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-blue-950 overflow-hidden transition-all hover:border-purple-300 dark:hover:border-purple-700"
        >
          <div
            className={`flex items-center gap-3 p-3 ${
              change.details
                ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                : ""
            }`}
            onClick={() =>
              change.details && setExpandedIndex(expandedIndex === i ? null : i)
            }
          >
            <DynamicIcon
              name={change.icon as any}
              className="w-5 h-5 text-gray-600 dark:text-gray-300"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                  {change.label}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-900 text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">
                  {change.type}
                </span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                {change.value}
              </p>
            </div>
            {change.details !== undefined && (
              <span className="text-gray-400 transition-transform duration-200">
                {expandedIndex === i ? (
                  <DynamicIcon name="ChevronUp" className="w-4 h-4" />
                ) : (
                  <DynamicIcon name="ChevronDown" className="w-4 h-4" />
                )}
              </span>
            )}
          </div>

          {expandedIndex === i && change.details !== undefined && (
            <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-black/20 overflow-x-auto max-h-80 overflow-y-auto">
              <DetailsDisplay label={change.label} details={change.details} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Rich details display component - shows formatted data instead of raw JSON
function DetailsDisplay({
  label,
  details,
}: {
  label: string;
  details: unknown;
}) {
  // Helper to safely check if a value exists and is truthy
  const has = (val: unknown): val is string | number | boolean =>
    val !== undefined && val !== null && val !== "";

  // Handle arrays of items (stats, resources, inventory, abilities, etc.)
  if (Array.isArray(details)) {
    const items = details as Record<string, unknown>[];

    // Stats display
    if (label === "Stats") {
      return (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="bg-white dark:bg-gray-800/50 rounded-lg p-2 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-2">
                {has(item.symbol) && (
                  <span className="text-lg">{String(item.symbol)}</span>
                )}
                <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                  {String(item.name || "Unknown")}
                </span>
                {item.value !== undefined && (
                  <span className="ml-auto text-sm font-mono bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
                    {String(item.value)}
                  </span>
                )}
              </div>
              {has(item.description) && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                  {String(item.description)}
                </p>
              )}
            </div>
          ))}
        </div>
      );
    }

    // Resources display
    if (label === "Resources") {
      return (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="bg-white dark:bg-gray-800/50 rounded-lg p-2 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-2">
                {has(item.symbol) && (
                  <span className="text-lg">{String(item.symbol)}</span>
                )}
                <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                  {String(item.name || "Unknown")}
                </span>
                <span className="ml-auto text-sm font-mono bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 px-2 py-0.5 rounded">
                  {String(item.value ?? 0)}/{String(item.maxValue ?? 0)}
                </span>
              </div>
              {has(item.description) && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                  {String(item.description)}
                </p>
              )}
            </div>
          ))}
        </div>
      );
    }

    // Inventory display
    if (label === "Inventory") {
      return (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="bg-white dark:bg-gray-800/50 rounded-lg p-2 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-2 flex-wrap">
                {has(item.symbol) && (
                  <span className="text-lg">{String(item.symbol)}</span>
                )}
                <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                  {String(item.name || "Unknown")}
                </span>
                {item.quantity !== undefined && Number(item.quantity) > 1 && (
                  <span className="text-xs text-gray-500">
                    x{String(item.quantity)}
                  </span>
                )}
                {has(item.grade) && (
                  <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
                    {String(item.grade)}
                  </span>
                )}
                {has(item.type) && (
                  <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                    {String(item.type)}
                  </span>
                )}
              </div>
              {has(item.description) && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                  {String(item.description)}
                </p>
              )}
            </div>
          ))}
        </div>
      );
    }

    // Abilities display
    if (label === "Abilities") {
      return (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="bg-white dark:bg-gray-800/50 rounded-lg p-2 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-2 flex-wrap">
                {has(item.symbol) && (
                  <span className="text-lg">{String(item.symbol)}</span>
                )}
                <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                  {String(item.name || "Unknown")}
                </span>
                {has(item.grade) && (
                  <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
                    {String(item.grade)}
                  </span>
                )}
                {has(item.stat) && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                    {String(item.stat)}
                  </span>
                )}
              </div>
              {has(item.description) && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                  {String(item.description)}
                </p>
              )}
              {(item.cooldown !== undefined || has(item.cost)) && (
                <div className="flex gap-3 mt-1.5 text-[10px]">
                  {item.cooldown !== undefined && (
                    <span className="text-amber-600 dark:text-amber-400">
                      Cooldown: {String(item.cooldown)} turns
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      );
    }

    // Lore display
    if (label === "Lore") {
      return (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="bg-white dark:bg-gray-800/50 rounded-lg p-2 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-2">
                <DynamicIcon name="Scroll" className="w-4 h-4 text-amber-500" />
                <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                  {String(item.title || item.name || "Unknown")}
                </span>
                {item.secret === true && (
                  <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300">
                    Secret
                  </span>
                )}
              </div>
              {has(item.content) && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-3">
                  {String(item.content)}
                </p>
              )}
            </div>
          ))}
        </div>
      );
    }

    // Achievements display
    if (label === "Achievements") {
      return (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="bg-white dark:bg-gray-800/50 rounded-lg p-2 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {has(item.symbol) ? String(item.symbol) : "🏆"}
                </span>
                <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                  {String(item.name || "Unknown")}
                </span>
                {item.xp !== undefined && (
                  <span className="ml-auto text-xs font-medium text-green-600 dark:text-green-400">
                    +{String(item.xp)} XP
                  </span>
                )}
              </div>
              {has(item.description) && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                  {String(item.description)}
                </p>
              )}
            </div>
          ))}
        </div>
      );
    }

    // Quests display
    if (label === "Quests") {
      return (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="bg-white dark:bg-gray-800/50 rounded-lg p-2 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-2">
                <DynamicIcon
                  name="Swords"
                  className="w-4 h-4 text-orange-500"
                />
                <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                  {String(item.name || item.title || "Unknown")}
                </span>
                {has(item.status) && (
                  <span
                    className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${
                      item.status === "completed"
                        ? "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300"
                        : item.status === "failed"
                        ? "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300"
                        : "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300"
                    }`}
                  >
                    {String(item.status)}
                  </span>
                )}
              </div>
              {has(item.description) && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                  {String(item.description)}
                </p>
              )}
            </div>
          ))}
        </div>
      );
    }

    // Relationships display
    if (label === "Relationships") {
      return (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="bg-white dark:bg-gray-800/50 rounded-lg p-2 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-2">
                <DynamicIcon name="Users" className="w-4 h-4 text-pink-500" />
                <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                  {String(item.name || "Unknown")}
                </span>
                {item.affinity !== undefined && (
                  <span
                    className={`ml-auto text-sm font-mono px-2 py-0.5 rounded ${
                      Number(item.affinity) > 0
                        ? "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300"
                        : Number(item.affinity) < 0
                        ? "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    {Number(item.affinity) > 0 ? "+" : ""}
                    {String(item.affinity)}
                  </span>
                )}
              </div>
              {has(item.description) && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                  {String(item.description)}
                </p>
              )}
            </div>
          ))}
        </div>
      );
    }

    // Skill Trees display
    if (label === "Skill Trees") {
      return (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="bg-white dark:bg-gray-800/50 rounded-lg p-2 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-2">
                <DynamicIcon
                  name="GitBranch"
                  className="w-4 h-4 text-emerald-500"
                />
                <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                  {String(item.name || "Unknown")}
                </span>
                {Array.isArray(item.nodes) && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {item.nodes.length} nodes
                  </span>
                )}
              </div>
              {has(item.description) && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                  {String(item.description)}
                </p>
              )}
            </div>
          ))}
        </div>
      );
    }

    // Generic array fallback
    return (
      <div className="space-y-2">
        {items.slice(0, 10).map((item, idx) => (
          <div
            key={idx}
            className="bg-white dark:bg-gray-800/50 rounded-lg p-2 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center gap-2">
              {has(item.symbol) && (
                <span className="text-lg">{String(item.symbol)}</span>
              )}
              <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                {String(item.name || item.title || `Item ${idx + 1}`)}
              </span>
            </div>
            {(has(item.description) || has(item.content)) && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                {String(item.description || item.content)}
              </p>
            )}
          </div>
        ))}
        {items.length > 10 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-1">
            +{items.length - 10} more items...
          </p>
        )}
      </div>
    );
  }

  // Handle objects (leveling settings, upgrade settings, etc.)
  if (typeof details === "object" && details !== null) {
    const obj = details as Record<string, unknown>;
    const entries = Object.entries(obj).filter(
      ([, v]) => v !== undefined && v !== null
    );

    // Leveling/Upgrade settings with icons
    if (label.includes("Leveling") || label.includes("Upgrade")) {
      const settingIcons: Record<string, string> = {
        xpBase: "⚡",
        levelCap: "🎯",
        defaultUpgradesPerLevel: "⬆️",
        useCustomCurve: "📈",
        customCurve: "📊",
        upgradeOverrides: "🔧",
        startingUpgrades: "🌟",
        pointsToLevelUp: "💎",
        maxLevel: "🏆",
      };

      return (
        <div className="space-y-2">
          {entries.map(([key, value]) => {
            const icon = settingIcons[key] || "⚙️";
            const displayLabel = key
              .replace(/([A-Z])/g, " $1")
              .replace(/_/g, " ")
              .trim();

            if (Array.isArray(value)) {
              return (
                <div
                  key={key}
                  className="bg-white dark:bg-gray-800/50 rounded-lg p-2 border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span>{icon}</span>
                    <span className="font-medium text-sm text-gray-900 dark:text-gray-100 capitalize">
                      {displayLabel}
                    </span>
                    <span className="ml-auto text-xs text-gray-500">
                      {value.length} entries
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(value as Record<string, unknown>[])
                      .slice(0, 5)
                      .map((item, i) => (
                        <span
                          key={i}
                          className="text-[10px] bg-gray-100 dark:bg-gray-700 rounded px-1.5 py-0.5"
                        >
                          {key === "customCurve"
                            ? `Lvl ${item.level}: ${item.cumulativeXP} XP`
                            : key === "upgradeOverrides"
                            ? `Lvl ${item.level}: ${item.upgrades} pts`
                            : JSON.stringify(item)}
                        </span>
                      ))}
                  </div>
                </div>
              );
            }

            if (typeof value === "object" && value !== null) {
              return (
                <div
                  key={key}
                  className="bg-white dark:bg-gray-800/50 rounded-lg p-2 border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span>{icon}</span>
                    <span className="font-medium text-sm text-gray-900 dark:text-gray-100 capitalize">
                      {displayLabel}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(value as Record<string, unknown>).map(
                      ([k, v]) => (
                        <span
                          key={k}
                          className="text-[10px] bg-gray-100 dark:bg-gray-700 rounded px-2 py-1"
                        >
                          <span className="text-gray-500 capitalize">{k}:</span>{" "}
                          <span className="font-medium">{String(v)}</span>
                        </span>
                      )
                    )}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={key}
                className="bg-white dark:bg-gray-800/50 rounded-lg p-2 border border-gray-200 dark:border-gray-700 flex items-center gap-2"
              >
                <span>{icon}</span>
                <span className="font-medium text-sm text-gray-900 dark:text-gray-100 capitalize">
                  {displayLabel}
                </span>
                <span className="ml-auto text-sm font-mono bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded">
                  {typeof value === "boolean"
                    ? value
                      ? "✓ Enabled"
                      : "✗ Disabled"
                    : String(value)}
                </span>
              </div>
            );
          })}
        </div>
      );
    }

    // Generic object display
    return (
      <div className="space-y-1">
        {entries.slice(0, 10).map(([key, value]) => {
          const displayLabel = key
            .replace(/([A-Z])/g, " $1")
            .replace(/_/g, " ")
            .trim();
          const displayValue =
            typeof value === "boolean"
              ? value
                ? "Yes"
                : "No"
              : typeof value === "object"
              ? JSON.stringify(value)
              : String(value);

          return (
            <div key={key} className="flex items-start gap-2 py-1">
              <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 w-28 shrink-0">
                {displayLabel}
              </span>
              <span className="text-xs text-gray-800 dark:text-gray-200 line-clamp-2">
                {displayValue.length > 100
                  ? displayValue.substring(0, 100) + "..."
                  : displayValue}
              </span>
            </div>
          );
        })}
        {entries.length > 10 && (
          <p className="text-xs text-gray-500 text-center pt-1">
            +{entries.length - 10} more...
          </p>
        )}
      </div>
    );
  }

  // String/primitive fallback
  if (typeof details === "string") {
    return (
      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
        {details}
      </p>
    );
  }

  // Final fallback - raw JSON
  return (
    <pre className="text-xs font-mono text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
      {JSON.stringify(details, null, 2)}
    </pre>
  );
}

// Story Context Display - shows a nice summary of the story data
function StoryContextDisplay({ storyData }: { storyData: StoryData }) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Build context items
  const contextItems: {
    icon: string;
    label: string;
    value: string;
    color: string;
  }[] = [];

  // Stats
  if (storyData.stats?.length) {
    const statNames = storyData.stats.map((s) => s.name).slice(0, 4);
    const more =
      storyData.stats.length > 4 ? ` +${storyData.stats.length - 4} more` : "";
    contextItems.push({
      icon: "BarChart2",
      label: "Stats",
      value: statNames.join(", ") + more,
      color: "text-blue-500",
    });
  }

  // Resources
  if (storyData.resources?.length) {
    const resourceInfo = storyData.resources
      .slice(0, 3)
      .map((r) => `${r.name}: ${r.value}/${r.maxValue}`)
      .join(", ");
    const more =
      storyData.resources.length > 3
        ? ` +${storyData.resources.length - 3}`
        : "";
    contextItems.push({
      icon: "Heart",
      label: "Resources",
      value: resourceInfo + more,
      color: "text-red-500",
    });
  }

  // Inventory
  if (storyData.inventory?.length) {
    const itemNames = storyData.inventory.slice(0, 3).map((i) => i.name);
    const more =
      storyData.inventory.length > 3
        ? ` +${storyData.inventory.length - 3} more`
        : "";
    contextItems.push({
      icon: "Backpack",
      label: "Inventory",
      value: `${storyData.inventory.length} items: ${itemNames.join(
        ", "
      )}${more}`,
      color: "text-yellow-500",
    });
  }

  // Abilities
  if (storyData.abilities?.length) {
    const abilityNames = storyData.abilities.slice(0, 3).map((a) => a.name);
    const more =
      storyData.abilities.length > 3
        ? ` +${storyData.abilities.length - 3}`
        : "";
    contextItems.push({
      icon: "Sparkles",
      label: "Abilities",
      value: abilityNames.join(", ") + more,
      color: "text-purple-500",
    });
  }

  // Skill Trees - IMPORTANT for upgrade point context
  if (storyData.skillTrees?.length) {
    const totalNodes = storyData.skillTrees.reduce(
      (sum, t) => sum + (t.nodes?.length || 0),
      0
    );
    const treeNames = storyData.skillTrees.map((t) => t.name).join(", ");
    contextItems.push({
      icon: "GitBranch",
      label: "Skill Trees",
      value: `${storyData.skillTrees.length} trees (${totalNodes} nodes): ${treeNames}`,
      color: "text-emerald-500",
    });
  }

  // Leveling Settings
  if (storyData.levelingSettings) {
    const ls = storyData.levelingSettings;
    const parts = [];
    if (ls.defaultUpgradesPerLevel)
      parts.push(`${ls.defaultUpgradesPerLevel} pts/lvl`);
    if (ls.xpBase) parts.push(`XP×${ls.xpBase}`);
    if (ls.levelCap) parts.push(`Cap: ${ls.levelCap}`);
    if (parts.length > 0) {
      contextItems.push({
        icon: "TrendingUp",
        label: "Leveling",
        value: parts.join(", "),
        color: "text-cyan-500",
      });
    }
  }

  // Current Progress
  if (storyData.level !== undefined || storyData.points !== undefined) {
    const parts = [];
    if (storyData.level !== undefined) parts.push(`Level ${storyData.level}`);
    if (storyData.points !== undefined) parts.push(`${storyData.points} XP`);
    if (storyData.upgradesSpent !== undefined) {
      const available =
        (storyData.points || 0) - (storyData.upgradesSpent || 0);
      if (available > 0) parts.push(`${available} upgrade pts available`);
    }
    contextItems.push({
      icon: "Award",
      label: "Progress",
      value: parts.join(", "),
      color: "text-amber-500",
    });
  }

  // Lore
  if (storyData.lore?.length) {
    const activeLore = storyData.lore.filter((l) => l.on !== false);
    contextItems.push({
      icon: "Scroll",
      label: "Lore",
      value: `${storyData.lore.length} entries (${activeLore.length} active)`,
      color: "text-orange-500",
    });
  }

  // Achievements
  if (storyData.achievements?.length) {
    const unlocked = storyData.achievements.filter(
      (a) => a.dateAchieved !== null
    );
    contextItems.push({
      icon: "Trophy",
      label: "Achievements",
      value: `${unlocked.length}/${storyData.achievements.length} unlocked`,
      color: "text-yellow-400",
    });
  }

  // Quests
  if (storyData.quests?.length) {
    const active = storyData.quests.filter((q) => q.active && !q.fulfilled);
    contextItems.push({
      icon: "Swords",
      label: "Quests",
      value: `${active.length} active, ${storyData.quests.length} total`,
      color: "text-red-400",
    });
  }

  // Relationships
  if (storyData.relationships?.length) {
    const topRelations = storyData.relationships
      .slice(0, 2)
      .map((r) => `${r.name} (${r.value > 0 ? "+" : ""}${r.value})`);
    const more =
      storyData.relationships.length > 2
        ? ` +${storyData.relationships.length - 2}`
        : "";
    contextItems.push({
      icon: "Users",
      label: "Relationships",
      value: topRelations.join(", ") + more,
      color: "text-pink-500",
    });
  }

  // Variables
  if (storyData.variables?.length) {
    contextItems.push({
      icon: "Variable",
      label: "Variables",
      value: `${storyData.variables.length} tracked`,
      color: "text-indigo-500",
    });
  }

  // Conditions
  if (storyData.conditions?.length) {
    const condNames = storyData.conditions
      .map((c) => `${c.name} (Tier ${c.tier})`)
      .slice(0, 2);
    const more =
      storyData.conditions.length > 2
        ? ` +${storyData.conditions.length - 2}`
        : "";
    contextItems.push({
      icon: "AlertTriangle",
      label: "Conditions",
      value: condNames.join(", ") + more,
      color: "text-rose-500",
    });
  }

  // Story history
  const historyParts = storyData.scene?.parts?.length || 0;
  if (historyParts > 0) {
    contextItems.push({
      icon: "BookOpen",
      label: "Story Progress",
      value: `${historyParts} turns played`,
      color: "text-slate-500",
    });
  }

  const visibleItems = isExpanded ? contextItems : contextItems.slice(0, 4);
  const hasMore = contextItems.length > 4;

  return (
    <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3 mb-4 text-left">
      <h4 className="text-sm font-bold text-purple-900 dark:text-purple-100 mb-2 flex items-center gap-2">
        <DynamicIcon name="Database" className="w-4 h-4" />
        Story Context Available
      </h4>

      {contextItems.length === 0 ? (
        <p className="text-xs text-purple-800 dark:text-purple-200">
          No story data yet. Start playing to build your character!
        </p>
      ) : (
        <>
          <div className="space-y-1.5">
            {visibleItems.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-xs text-purple-800 dark:text-purple-200"
              >
                <DynamicIcon
                  name={item.icon as any}
                  className={`w-3.5 h-3.5 ${item.color} shrink-0`}
                />
                <span className="font-medium shrink-0">{item.label}:</span>
                <span className="truncate opacity-80">{item.value}</span>
              </div>
            ))}
          </div>

          {hasMore && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-2 text-xs text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
            >
              {isExpanded ? (
                <>
                  <DynamicIcon name="ChevronUp" className="w-3 h-3" />
                  Show less
                </>
              ) : (
                <>
                  <DynamicIcon name="ChevronDown" className="w-3 h-3" />
                  Show {contextItems.length - 4} more...
                </>
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}
