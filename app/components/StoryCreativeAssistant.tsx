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
import { parseCreatorOutput } from "@/app/misc/creator_ai";
import {
  buildStoryCreatorMessages,
  applyCreatorChangesToStoryData,
  sanitizeSkillTrees,
} from "@/app/misc/story_creator_ai";
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
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
      }, 50);
    }
  }, [isOpen]);

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
      const recentHistory = storyData.scene?.parts?.slice(-20) || [];

      const aiMessages = buildStoryCreatorMessages({
        messages: recentMessages,
        storyData,
        recentHistory,
        maxHistoryParts: 15,
      });

      let response: Response;

      if (isNovelAISelected) {
        response = await authenticatedFetch("/api/novelai/generate-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: aiMessages,
            novelaiKey: novelaiKey,
            maxTokens: Math.min(maxOutputTokens, 1000),
            temperature: 0.7,
          }),
        });
      } else {
        response = await authenticatedFetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: aiMessages,
            model: model,
            maxTokens: maxOutputTokens,
            temperature: 0.7,
            openRouterKey: byokMode ? apiKeys.openRouterKey : undefined,
            deepseekKey: byokMode ? apiKeys.deepseekKey : undefined,
            googleKey: byokMode ? apiKeys.googleKey : undefined,
          }),
        });
      }

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(
          errorData.error || `Failed to get AI response (${response.status})`
        );
      }

      let content: string;
      let meta: Record<string, unknown>;

      if (isNovelAISelected) {
        const text = await response.text();
        const lines = text.split("\n");
        let fullContent = "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "content" && data.content) {
                fullContent += data.content;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
        content = fullContent;
        meta = { isByok: true, modelName: model };
      } else {
        const data = await response.json();
        content = data.content;
        meta = {
          ...data.meta,
          isByok: byokMode,
        };
      }

      if (!content || !content.trim()) {
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

      const assistantMsg: ChatMessage & { meta?: Record<string, unknown> } = {
        role: "assistant",
        content,
        meta,
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
    data: Partial<StoryData> & { _command?: string }
  ) => {
    // Use the converter to properly apply changes
    const updates = applyCreatorChangesToStoryData(storyData, data);
    onApplyChanges(updates);
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
              <div className="max-w-sm">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Edit Your Story
                </h3>
                <p className="text-sm mb-4">
                  I can modify stats, add items, create lore, adjust resources,
                  and more. I have access to your current story state and recent
                  history.
                </p>

                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3 mb-4 text-left">
                  <h4 className="text-sm font-bold text-purple-900 dark:text-purple-100 mb-2 flex items-center gap-2">
                    <DynamicIcon name="Info" className="w-4 h-4" />
                    Story Context Available
                  </h4>
                  <p className="text-xs text-purple-800 dark:text-purple-200 leading-relaxed">
                    I can see your current stats, inventory, lore, quests, and
                    recent story events. Ask me to make changes based on
                    what&apos;s happening in your adventure!
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2 text-sm">
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
              message={msg as ChatMessage & { meta?: Record<string, unknown> }}
              onApplyChanges={handleApplyChanges}
              storyData={storyData}
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
  storyData,
}: {
  message: ChatMessage & { meta?: Record<string, unknown> };
  onApplyChanges: (data: Partial<StoryData>) => void;
  storyData: StoryData;
}) {
  const isUser = message.role === "user";
  const { text, data: rawData } = parseCreatorOutput(message.content);
  const meta = message.meta;

  // Sanitize skill trees if present
  const data = rawData
    ? {
        ...rawData,
        skillTrees: rawData.skillTrees
          ? sanitizeSkillTrees(rawData.skillTrees)
          : undefined,
      }
    : null;

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
            {text}
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
        {data && (
          <div className="mt-4 rounded-xl bg-gray-50 dark:bg-black/30 border border-gray-200 dark:border-gray-700/50 overflow-hidden shadow-inner">
            <div className="bg-gray-100/50 dark:bg-white/5 px-4 py-2 border-b border-gray-200 dark:border-gray-700/50 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                Proposed Changes
              </span>
            </div>

            {/* Change Summary with expandable details */}
            <div className="p-3 space-y-2">
              <ChangeSummary data={data} />
            </div>

            <div className="p-3 bg-gray-100/50 dark:bg-white/5 border-t border-gray-200 dark:border-gray-700/50">
              <button
                onClick={() => onApplyChanges(data)}
                className="w-full rounded-lg bg-green-600 hover:bg-green-500 text-white py-2 text-sm font-bold transition-all shadow-md hover:shadow-lg active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <DynamicIcon name="Check" className="w-4 h-4" />
                Apply Changes
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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
  if (data.agmtState) {
    const threads = data.agmtState.threads?.length || 0;
    const chars = data.agmtState.characters?.length || 0;
    changes.push({
      type: "Update",
      label: "AGMT State",
      value: `${threads} thread${threads !== 1 ? "s" : ""}, ${chars} character${
        chars !== 1 ? "s" : ""
      }`,
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
            <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-black/20 text-xs font-mono text-gray-600 dark:text-gray-300 overflow-x-auto max-h-64 overflow-y-auto">
              <pre className="whitespace-pre-wrap">
                {JSON.stringify(change.details, null, 2)}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
