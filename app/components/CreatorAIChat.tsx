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
import { StoryData, StartingChoice } from "@/app/misc/structs";
import { authenticatedFetch } from "@/app/misc/getAuthToken";
import { buildCreatorMessagesWithTools } from "@/app/misc/creator_ai";
import {
  executeCreatorTools,
  CreatorToolCall,
  CreatorToolResult,
  CreatorChanges,
} from "@/app/misc/creator_tool_executor";
import { DynamicIcon } from "./DynamicIcon";
import ConfirmDialog from "./ConfirmDialog";
import {
  AI_MODELS,
  getModelConfig,
  calculateTokenCost,
} from "@/app/misc/ai_prices";
import { useAPIKeys } from "@/app/misc/APIKeysContext";
import { CustomModel } from "@/app/misc/user_settings";

// Chat thread type for multi-conversation support
interface ChatThread {
  id: string;
  name: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface CreatorAIChatProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen?: () => void;
  currentStoryData: Partial<StoryData>;
  adventureMetadata?: {
    title?: string;
    shortDescription?: string;
    description?: string;
    startingChoices?: StartingChoice[];
  };
  adventureId?: string; // Optional adventure ID for chat persistence
  onApplyChanges: (
    data: Partial<StoryData> & {
      title?: string;
      shortDescription?: string;
      description?: string;
      startingChoices?: StartingChoice[];
    }
  ) => void;
  // Pinned mode props (desktop only)
  isPinned?: boolean;
  onPinToggle?: () => void;
}

// Helper to generate thread names
function generateThreadName(index: number): string {
  const adjectives = ["New", "Fresh", "Quick", "Focused", "Creative"];
  const nouns = ["Chat", "Thread", "Session", "Convo", "Discussion"];
  return `${adjectives[index % adjectives.length]} ${
    nouns[Math.floor(index / adjectives.length) % nouns.length]
  } ${index + 1}`;
}

export default function CreatorAIChat({
  isOpen,
  onClose,
  onOpen,
  currentStoryData,
  adventureMetadata,
  adventureId,
  onApplyChanges,
  isPinned = false,
  onPinToggle,
}: CreatorAIChatProps) {
  const threadsKey = adventureId ? `creatorAiThreads:${adventureId}` : null;
  const activeThreadKey = adventureId
    ? `creatorAiActiveThread:${adventureId}`
    : null;
  const { keys: apiKeys, hasKey } = useAPIKeys();

  // Initialize threads from localStorage
  const [threads, setThreads] = useState<ChatThread[]>(() => {
    if (typeof window !== "undefined" && threadsKey) {
      const saved = localStorage.getItem(threadsKey);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error("Failed to parse saved threads:", e);
        }
      }
      // Migrate old single-chat format to threads
      const oldChatKey = `creatorAiChat:${adventureId}`;
      const oldChat = localStorage.getItem(oldChatKey);
      if (oldChat) {
        try {
          const oldMessages = JSON.parse(oldChat);
          if (Array.isArray(oldMessages) && oldMessages.length > 0) {
            const migratedThread: ChatThread = {
              id: crypto.randomUUID(),
              name: "Migrated Chat",
              messages: oldMessages.filter(
                (msg: ChatMessage) => msg.content && msg.content.trim()
              ),
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            localStorage.removeItem(oldChatKey); // Clean up old format
            return [migratedThread];
          }
        } catch (e) {
          console.error("Failed to migrate old chat:", e);
        }
      }
    }
    return [];
  });

  // Active thread ID
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() => {
    if (typeof window !== "undefined" && activeThreadKey) {
      const saved = localStorage.getItem(activeThreadKey);
      return saved || null;
    }
    return null;
  });

  // Thread selector dropdown state
  const [showThreadSelector, setShowThreadSelector] = useState(false);

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    icon?: string;
    confirmText?: string;
    confirmButtonClass?: string;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  // Get current thread's messages
  const activeThread = threads.find((t) => t.id === activeThreadId);
  const messages = activeThread?.messages || [];

  // Update messages for the active thread
  const setMessages = useCallback(
    (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
      setThreads((prevThreads) => {
        if (!activeThreadId) return prevThreads;
        return prevThreads.map((thread) => {
          if (thread.id !== activeThreadId) return thread;
          const newMessages =
            typeof updater === "function" ? updater(thread.messages) : updater;
          return { ...thread, messages: newMessages, updatedAt: Date.now() };
        });
      });
    },
    [activeThreadId]
  );

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // BYOK/Coins mode toggle
  const [byokMode, setByokMode] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("creatorAiByokMode");
      return stored === "true";
    }
    return false;
  });

  const [model, setModel] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return (
        localStorage.getItem("creatorAiModel") || "DeepInfra DeepSeek V3.2"
      );
    }
    return "DeepInfra DeepSeek V3.2";
  });

  // Output size slider
  const [maxOutputTokens, setMaxOutputTokens] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("creatorAiMaxOutput");
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
        // BYOK mode: show openrouter, deepseek, novelai, google
        return (
          provider === "openrouter" ||
          provider === "deepseek" ||
          provider === "novelai" ||
          provider === "google"
        );
      } else {
        // Coins mode: show mistral, deepinfra
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
    // Estimate input tokens from context (rough: 4 chars per token)
    const contextStr =
      JSON.stringify(currentStoryData) + JSON.stringify(adventureMetadata);
    const estimatedInputTokens = Math.ceil(contextStr.length / 4) + 500; // Add buffer for system prompt

    // Calculate dollar cost from token prices (per million tokens)
    const dollarCost =
      (modelConfig.inputPrice * estimatedInputTokens) / 1000000 +
      (modelConfig.outputPrice * maxOutputTokens) / 1000000;

    // Calculate coin cost
    const coinCost = calculateTokenCost(
      model,
      estimatedInputTokens,
      maxOutputTokens
    );

    return { coins: Math.max(1, coinCost), dollars: dollarCost };
  }, [
    currentStoryData,
    adventureMetadata,
    modelConfig,
    maxOutputTokens,
    model,
  ]);

  // Save threads to localStorage
  useEffect(() => {
    if (typeof window !== "undefined" && threadsKey && threads.length > 0) {
      localStorage.setItem(threadsKey, JSON.stringify(threads));
    }
  }, [threads, threadsKey]);

  // Save active thread ID to localStorage
  useEffect(() => {
    if (typeof window !== "undefined" && activeThreadKey) {
      if (activeThreadId) {
        localStorage.setItem(activeThreadKey, activeThreadId);
      } else {
        localStorage.removeItem(activeThreadKey);
      }
    }
  }, [activeThreadId, activeThreadKey]);

  // Save preferences to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("creatorAiModel", model);
      localStorage.setItem("creatorAiByokMode", byokMode.toString());
      localStorage.setItem("creatorAiMaxOutput", maxOutputTokens.toString());
    }
  }, [model, byokMode, maxOutputTokens]);

  // Save NovelAI key to localStorage
  useEffect(() => {
    if (typeof window !== "undefined" && novelaiKey) {
      localStorage.setItem("novelaiKey", novelaiKey);
    }
  }, [novelaiKey]);

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

    // If in BYOK mode but current model is coins-only, switch to default BYOK model
    if (byokMode && isCoinsProvider) {
      setModel("Deepseek Chat");
    }
    // If in Coins mode but current model is BYOK-only, switch to default coins model
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
  // Only runs when isOpen changes to true, not on every message update
  useEffect(() => {
    if (isOpen && messages.length > 0) {
      // Small delay to ensure DOM is rendered
      requestAnimationFrame(() => {
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
        }, 100);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]); // Only trigger on open, not on messages.length change

  // Close thread selector when clicking outside
  useEffect(() => {
    if (!showThreadSelector) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-thread-selector]")) {
        setShowThreadSelector(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showThreadSelector]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    // Auto-create a thread if none exists
    if (!activeThreadId && adventureId) {
      const newThread: ChatThread = {
        id: crypto.randomUUID(),
        name: generateThreadName(threads.length),
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setThreads((prev) => [...prev, newThread]);
      setActiveThreadId(newThread.id);
    }

    // Validate NovelAI key if using NovelAI
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

    // Validate BYOK keys for other providers
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
      // Build messages using the creator AI prompt builder
      const recentMessages = [...messages, userMsg].slice(-10);

      // Check if model supports tool calling and tool mode is enabled
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
              "NovelAI models don't support tool calling which is required for adventure editing. Please select a different model (DeepSeek, OpenRouter, or Coins models).",
          },
        ]);
        setLoading(false);
        return;
      } else if (supportsTools) {
        // Use tool-based prompt
        const { messages: aiMessages, tools } = buildCreatorMessagesWithTools({
          messages: recentMessages,
          currentStoryData,
          adventureMetadata,
        });

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
        console.error("API Error:", response.status, errorData);
        throw new Error(
          errorData.error || `Failed to get AI response (${response.status})`
        );
      }

      let content: string;
      let meta: any;
      let toolCalls: CreatorToolCall[] | undefined;

      if (isNovelAISelected) {
        // NovelAI returns SSE stream, read as text
        const text = await response.text();
        // Parse SSE events to extract content
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
        content = data.content || "";
        toolCalls = data.toolCalls;
        meta = {
          ...data.meta,
          isByok: byokMode,
        };
      }

      // Handle tool calls if present
      let toolResults: CreatorToolResult[] | undefined;
      let toolChanges: CreatorChanges | undefined;

      if (toolCalls && toolCalls.length > 0) {
        console.log("=== CALLING executeCreatorTools ===");
        console.log(
          "Tool calls:",
          toolCalls.map((t) => t.function.name)
        );

        const { results, mergedChanges } = executeCreatorTools(toolCalls, {
          storyData: currentStoryData,
          adventureMetadata,
        });
        toolResults = results;
        toolChanges = mergedChanges;

        // Log tool execution results
        console.log("Tool execution results:", results);
        console.log("Merged changes:", mergedChanges);
      }

      // Skip empty messages if no tools were called - they break the chat
      if ((!content || !content.trim()) && !toolResults?.length) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "I apologize, but I generated an empty response. Please try again or rephrase your request.",
            meta,
          },
        ]);
        return;
      }

      const assistantMsg: ChatMessage & {
        meta?: any;
        toolResults?: CreatorToolResult[];
        toolChanges?: CreatorChanges;
      } = {
        role: "assistant",
        content:
          content ||
          "Done! I've applied the changes you asked for. Let me know if you'd like to tweak anything!",
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

  // Thread management functions
  const handleNewThread = useCallback(() => {
    const newThread: ChatThread = {
      id: crypto.randomUUID(),
      name: generateThreadName(threads.length),
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setThreads((prev) => [...prev, newThread]);
    setActiveThreadId(newThread.id);
    setShowThreadSelector(false);
  }, [threads.length]);

  const handleSwitchThread = useCallback((threadId: string) => {
    setActiveThreadId(threadId);
    setShowThreadSelector(false);
  }, []);

  const handleDeleteThread = useCallback(
    (threadId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const threadToDelete = threads.find((t) => t.id === threadId);
      setConfirmDialog({
        isOpen: true,
        title: "Delete Chat Thread",
        message: `Delete "${
          threadToDelete?.name || "this thread"
        }"? This cannot be undone.`,
        icon: "Trash2",
        confirmText: "Delete",
        confirmButtonClass: "bg-red-600 hover:bg-red-700",
        onConfirm: () => {
          setThreads((prev) => {
            const remaining = prev.filter((t) => t.id !== threadId);
            // If we're deleting the active thread, switch to another or clear
            if (activeThreadId === threadId) {
              setActiveThreadId(
                remaining.length > 0 ? remaining[remaining.length - 1].id : null
              );
            }
            return remaining;
          });
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        },
      });
    },
    [activeThreadId, threads]
  );

  const handleClearChat = () => {
    if (!activeThreadId) return;
    setConfirmDialog({
      isOpen: true,
      title: "Clear Chat History",
      message: "Clear all messages in this thread? This cannot be undone.",
      icon: "Trash2",
      confirmText: "Clear",
      confirmButtonClass: "bg-red-600 hover:bg-red-700",
      onConfirm: () => {
        setMessages([]);
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  // Handle click outside to close
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isPinned) {
      onClose();
    }
  };

  // Prevent body scroll when modal is open (not in pinned mode)
  useEffect(() => {
    if (isOpen && !isPinned) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen, isPinned]);

  // Touch/swipe state for drawer mode
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchDelta, setTouchDelta] = useState(0);
  const drawerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
    setTouchDelta(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const delta = e.touches[0].clientX - touchStart;
    // Only track rightward swipes (positive delta)
    if (delta > 0) {
      setTouchDelta(delta);
    }
  };

  const handleTouchEnd = () => {
    // If swiped more than 100px to the right, close the drawer
    if (touchDelta > 100) {
      onClose();
    }
    setTouchStart(null);
    setTouchDelta(0);
  };

  // When pinned but closed, show a pull tab on the right edge to reopen
  if (!isOpen && isPinned && onOpen) {
    return (
      <button
        className="fixed top-1/2 -translate-y-1/2 right-0 z-40 bg-purple-500/90 hover:bg-purple-600 text-white p-2 rounded-l-lg shadow-lg transition-all pointer-events-auto"
        onClick={onOpen}
        title="Open AI Assistant"
      >
        <DynamicIcon name="ChevronLeft" className="w-4 h-4" />
      </button>
    );
  }

  if (!isOpen) return null;

  // Pinned slide-in drawer mode
  if (isPinned) {
    return (
      <>
        {/* Pull tab on left edge - closes the drawer */}
        <button
          className="fixed top-1/2 -translate-y-1/2 z-40 bg-purple-500/90 hover:bg-purple-600 text-white p-1.5 rounded-l-lg shadow-lg transition-all pointer-events-auto right-80  sm:right-[380px] md:right-[420px]"
          style={
            touchDelta > 0
              ? {
                  transform: `translateY(-50%) translateX(${touchDelta}px)`,
                  transition: "none",
                }
              : undefined
          }
          onClick={onClose}
          title="Close panel"
        >
          <DynamicIcon name="ChevronRight" className="w-4 h-4" />
        </button>
        <div
          ref={drawerRef}
          className="fixed top-14 right-0 z-40 h-[calc(100%-7.5rem)] w-[320px] sm:w-[380px] md:w-[420px] max-w-[85vw] flex flex-col overflow-hidden bg-white/95 dark:bg-gray-900/95 shadow-2xl border-l border-gray-200 dark:border-gray-700 animate-in slide-in-from-right duration-300 pointer-events-auto rounded-bl-xl"
          style={{
            transform:
              touchDelta > 0 ? `translateX(${touchDelta}px)` : undefined,
            transition: touchDelta > 0 ? "none" : undefined,
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Header - Compact for pinned mode */}
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 px-4 py-3 backdrop-blur-sm">
            <div className="flex items-center gap-2 min-w-0">
              <DynamicIcon
                name="Sparkles"
                className="w-4 h-4 text-purple-500 shrink-0"
              />
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 truncate">
                AI Assistant
              </span>
              {/* Thread Selector - Compact */}
              {adventureId && (
                <div className="relative" data-thread-selector>
                  <button
                    onClick={() => setShowThreadSelector(!showThreadSelector)}
                    className="flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-400 transition-colors"
                    title="Switch chat threads"
                  >
                    <span className="max-w-20 truncate">
                      {activeThread?.name || "New"}
                    </span>
                    <DynamicIcon
                      name="ChevronDown"
                      className={`w-3 h-3 transition-transform ${
                        showThreadSelector ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {showThreadSelector && (
                    <div className="absolute top-full left-0 mt-1 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                      <button
                        onClick={handleNewThread}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 border-b border-gray-200 dark:border-gray-700 font-medium"
                      >
                        <DynamicIcon name="Plus" className="w-3.5 h-3.5" />
                        New Thread
                      </button>
                      <div className="max-h-48 overflow-y-auto">
                        {threads
                          .slice()
                          .reverse()
                          .map((thread) => (
                            <div
                              key={thread.id}
                              onClick={() => handleSwitchThread(thread.id)}
                              className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 text-xs ${
                                thread.id === activeThreadId
                                  ? "bg-purple-50 dark:bg-purple-900/20"
                                  : ""
                              }`}
                            >
                              <span
                                className={`truncate ${
                                  thread.id === activeThreadId
                                    ? "font-medium text-purple-700 dark:text-purple-300"
                                    : "text-gray-600 dark:text-gray-400"
                                }`}
                              >
                                {thread.name}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {onPinToggle && (
                <button
                  onClick={onPinToggle}
                  className="rounded p-1.5 text-purple-500 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                  title="Unpin to modal"
                >
                  <DynamicIcon name="PanelRightClose" className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={onClose}
                className="rounded p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                title="Close"
              >
                <DynamicIcon name="X" className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Compact Settings Bar */}
          <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/80 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              {/* BYOK/Coins Toggle - Compact */}
              <div className="flex items-center gap-1.5 px-2 py-1 bg-white dark:bg-blue-950 rounded border border-gray-200 dark:border-gray-700">
                <span
                  className={`text-[10px] font-medium ${
                    !byokMode ? "text-amber-500" : "text-gray-400"
                  }`}
                >
                  🪙
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={byokMode}
                    onChange={(e) => setByokMode(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-6 h-3 bg-amber-500 peer-focus:ring-1 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-white after:rounded-full after:h-2 after:w-2 after:transition-all peer-checked:bg-green-600" />
                </label>
                <span
                  className={`text-[10px] font-medium ${
                    byokMode ? "text-green-500" : "text-gray-400"
                  }`}
                >
                  🔑
                </span>
              </div>

              {/* Model Selection - Compact */}
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="flex-1 min-w-0 bg-white dark:bg-blue-950 border border-gray-200 dark:border-gray-700 text-[10px] rounded px-1.5 py-1 text-gray-700 dark:text-gray-300 focus:ring-1 focus:ring-purple-500 outline-none cursor-pointer truncate"
              >
                {filteredModels.map(([key, m]) => (
                  <option key={key} value={key}>
                    {m.name}
                  </option>
                ))}
              </select>

              {/* Output Size - Compact */}
              <div className="flex items-center gap-1">
                <input
                  type="range"
                  min={256}
                  max={modelConfig.maxOutputTokens}
                  step={256}
                  value={maxOutputTokens}
                  onChange={(e) => setMaxOutputTokens(Number(e.target.value))}
                  className="w-12 h-1 accent-purple-500"
                />
                <span className="text-[10px] text-gray-500 w-8">
                  {maxOutputTokens}
                </span>
              </div>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-linear-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-950">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-4">
                <DynamicIcon
                  name="Sparkles"
                  className="w-8 h-8 text-purple-400/50 mb-2"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Ask to add, modify, or remove content
                </p>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <MessageItem
                  key={idx}
                  message={msg as ChatMessage & { meta?: any }}
                  onApplyChanges={onApplyChanges}
                />
              ))
            )}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <div
                      className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <div
                      className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area - Compact */}
          <div className="border-t border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 p-3">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask to edit..."
                rows={2}
                className="flex-1 resize-none rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="self-end px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                <DynamicIcon name="Send" className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Confirm Dialog */}
          <ConfirmDialog
            isOpen={confirmDialog.isOpen}
            title={confirmDialog.title}
            message={confirmDialog.message}
            icon={confirmDialog.icon}
            confirmText={confirmDialog.confirmText}
            confirmButtonClass={confirmDialog.confirmButtonClass}
            onConfirm={confirmDialog.onConfirm}
            onCancel={() =>
              setConfirmDialog((prev) => ({ ...prev, isOpen: false }))
            }
          />
        </div>
      </>
    );
  }

  // Modal mode (default)
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-200"
      onClick={handleBackdropClick}
    >
      <div className="flex h-[95vh] sm:h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white/95 dark:bg-gray-900/95 shadow-2xl border border-white/20 dark:border-gray-700 ring-1 ring-black/5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 px-6 py-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-xl font-bold bg-linear-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent flex items-center gap-2">
                <DynamicIcon
                  name="Sparkles"
                  className="w-5 h-5 text-purple-500"
                />{" "}
                AI Creative Assistant
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                For your Adventures
              </p>
            </div>
            {/* Thread Selector */}
            {adventureId && (
              <div className="relative ml-2" data-thread-selector>
                <button
                  onClick={() => setShowThreadSelector(!showThreadSelector)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 transition-colors border border-gray-200 dark:border-gray-600"
                  title="Switch chat threads"
                >
                  <DynamicIcon name="MessageSquare" className="w-4 h-4" />
                  <span className="max-w-[120px] truncate">
                    {activeThread?.name || "New Chat"}
                  </span>
                  <DynamicIcon
                    name="ChevronDown"
                    className={`w-3.5 h-3.5 transition-transform ${
                      showThreadSelector ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {showThreadSelector && (
                  <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                    {/* New Thread Button */}
                    <button
                      onClick={handleNewThread}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 border-b border-gray-200 dark:border-gray-700 font-medium"
                    >
                      <DynamicIcon name="Plus" className="w-4 h-4" />
                      New Chat Thread
                    </button>
                    {/* Thread List */}
                    <div className="max-h-60 overflow-y-auto">
                      {threads.length === 0 ? (
                        <p className="px-3 py-4 text-xs text-gray-500 dark:text-gray-400 text-center">
                          No threads yet. Start a new chat!
                        </p>
                      ) : (
                        threads
                          .slice()
                          .reverse()
                          .map((thread) => (
                            <div
                              key={thread.id}
                              onClick={() => handleSwitchThread(thread.id)}
                              className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 group ${
                                thread.id === activeThreadId
                                  ? "bg-purple-50 dark:bg-purple-900/20"
                                  : ""
                              }`}
                            >
                              <DynamicIcon
                                name={
                                  thread.id === activeThreadId
                                    ? "MessageSquareText"
                                    : "MessageSquare"
                                }
                                className={`w-4 h-4 ${
                                  thread.id === activeThreadId
                                    ? "text-purple-500"
                                    : "text-gray-400"
                                }`}
                              />
                              <div className="flex-1 min-w-0">
                                <p
                                  className={`text-sm truncate ${
                                    thread.id === activeThreadId
                                      ? "font-medium text-purple-700 dark:text-purple-300"
                                      : "text-gray-700 dark:text-gray-300"
                                  }`}
                                >
                                  {thread.name}
                                </p>
                                <p className="text-[10px] text-gray-400 dark:text-gray-500">
                                  {thread.messages.length} messages •{" "}
                                  {new Date(
                                    thread.updatedAt
                                  ).toLocaleDateString()}
                                </p>
                              </div>
                              <button
                                onClick={(e) =>
                                  handleDeleteThread(thread.id, e)
                                }
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-gray-400 hover:text-red-500 transition-all"
                                title="Delete thread"
                              >
                                <DynamicIcon name="X" className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeThread && messages.length > 0 && (
              <button
                onClick={handleClearChat}
                className="rounded-full p-2 text-gray-400 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                title="Clear chat history"
              >
                <DynamicIcon name="Trash2" className="w-5 h-5" />
              </button>
            )}
            {/* Pin button */}
            {onPinToggle && (
              <button
                onClick={onPinToggle}
                className="rounded-full p-2 text-gray-400 hover:bg-purple-100 dark:hover:bg-purple-900/30 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                title="Pin as drawer"
              >
                <DynamicIcon name="PanelRightOpen" className="w-5 h-5" />
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
                title="Select AI model"
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
                title={`Max output: ${maxOutputTokens} tokens`}
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

          {/* BYOK mode warning if no keys configured */}
          {byokMode && !hasAnyBYOKKey && (
            <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/30 rounded-lg">
              <p className="text-xs text-red-600 dark:text-red-300">
                ⚠️ No API keys configured. Add keys in Settings (gear icon in
                header).
              </p>
            </div>
          )}

          {/* NovelAI Key Input Popup */}
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
                className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
              />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Free to use with your own subscription. Key is stored locally.
              </p>
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
              <div className="w-20 h-20 bg-linear-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 rounded-full flex items-center justify-center text-4xl shadow-inner">
                <DynamicIcon
                  name="Bot"
                  className="w-10 h-10 text-purple-600 dark:text-purple-400"
                />
              </div>
              <div className="max-w-sm">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  How can I help you create?
                </h3>
                <p className="text-sm mb-4">
                  I can design items, write lore entries, balance stats, or
                  create entire scenarios from scratch.
                </p>

                {/* AI Commands Info Box */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4 text-left">
                  <h4 className="text-sm font-bold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                    <DynamicIcon name="Info" className="w-4 h-4" />
                    AI Commands
                  </h4>
                  <p className="text-xs text-blue-800 dark:text-blue-200 leading-relaxed">
                    The AI can <strong>merge</strong> (update properties),{" "}
                    <strong>replace</strong> (completely overwrite),
                    <strong>delete</strong> (remove), or <strong>add</strong>{" "}
                    (create new) items in your adventure.
                  </p>
                  <p className="text-xs text-blue-800 dark:text-blue-200 mt-2 leading-relaxed">
                    Examples: "Delete the Rusty Sword", "Replace Strength stat
                    completely", "Add a new healing potion"
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2 text-sm">
                  <button
                    onClick={() =>
                      setInput("Create a legendary sword with fire abilities")
                    }
                    className="px-4 py-2 rounded-lg bg-white dark:bg-blue-950 border border-gray-200 dark:border-gray-700 hover:border-purple-500 dark:hover:border-purple-500 transition-colors text-left shadow-xs"
                  >
                    "Create a legendary sword..."
                  </button>
                  <button
                    onClick={() =>
                      setInput("Write a lore entry about the ancient kingdom")
                    }
                    className="px-4 py-2 rounded-lg bg-white dark:bg-blue-950 border border-gray-200 dark:border-gray-700 hover:border-purple-500 dark:hover:border-purple-500 transition-colors text-left shadow-xs"
                  >
                    "Write a lore entry about..."
                  </button>
                  <button
                    onClick={() =>
                      setInput("Delete the Old Weapon and add a Magic Staff")
                    }
                    className="px-4 py-2 rounded-lg bg-white dark:bg-blue-950 border border-gray-200 dark:border-gray-700 hover:border-purple-500 dark:hover:border-purple-500 transition-colors text-left shadow-xs"
                  >
                    "Delete... and add..."
                  </button>
                </div>
              </div>
            </div>
          )}
          {messages.map((msg, idx) => (
            <MessageItem
              key={idx}
              message={msg as ChatMessage & { meta?: any }}
              onApplyChanges={onApplyChanges}
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
              placeholder="Describe what you want to create..."
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
              className="mb-0.5 p-2 rounded-lg bg-linear-to-r from-blue-600 to-purple-600 text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg active:scale-95"
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
              AI can make mistakes. Review generated content before applying.
            </span>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        icon={confirmDialog.icon}
        confirmText={confirmDialog.confirmText}
        confirmButtonClass={confirmDialog.confirmButtonClass}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() =>
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }))
        }
      />
    </div>
  );
}

function MessageItem({
  message,
  onApplyChanges,
}: {
  message: ChatMessage & {
    meta?: any;
    toolResults?: CreatorToolResult[];
    toolChanges?: CreatorChanges;
  };
  onApplyChanges: (
    data: Partial<StoryData> & {
      title?: string;
      shortDescription?: string;
      description?: string;
    }
  ) => void;
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

    const modelName = meta.modelName;

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

    const inputTokens = meta.usage.promptTokens || 0;
    const outputTokens = meta.usage.completionTokens || 0;
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
            ? "rounded-tr-sm bg-linear-to-br from-blue-600 to-purple-600 text-white"
            : "rounded-tl-sm bg-white dark:bg-blue-950 text-gray-800 dark:text-gray-200 border border-gray-100 dark:border-gray-700"
        }`}
      >
        <div className="leading-relaxed max-w-none">
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
                        ? "bg-white/20 text-blue-200"
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
        {!isUser && (meta?.tokenCost !== undefined || meta?.isByok) && (
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
                {meta.tokenCost} {meta.tokenCost === 1 ? "coin" : "coins"}
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

// Keep ChangeSummary for potential backward compatibility but it's no longer used in MessageItem
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
    details?: any;
    icon: string;
  }[] = [];

  // Adventure metadata changes
  if (data.title)
    changes.push({
      type: "Update",
      label: "Adventure Title",
      value: data.title,
      icon: "Target",
    });
  if (data.shortDescription)
    changes.push({
      type: "Update",
      label: "Short Description",
      value: data.shortDescription,
      details: data.shortDescription,
      icon: "FileText",
    });
  if (data.description)
    changes.push({
      type: "Update",
      label: "Full Description",
      value:
        data.description.length > 50
          ? data.description.substring(0, 50) + "..."
          : data.description,
      details: data.description,
      icon: "Clipboard",
    });

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
      value: `${data.stats.length} stats`,
      details: data.stats,
      icon: "BarChart2",
    });
  }
  if (data.resources?.length) {
    changes.push({
      type: "Add/Update",
      label: "Resources",
      value: `${data.resources.length} resources`,
      details: data.resources,
      icon: "Diamond",
    });
  }
  if (data.inventory?.length) {
    changes.push({
      type: "Add/Update",
      label: "Inventory",
      value: `${data.inventory.length} items`,
      details: data.inventory,
      icon: "Backpack",
    });
  }
  if (data.abilities?.length) {
    changes.push({
      type: "Add/Update",
      label: "Abilities",
      value: `${data.abilities.length} abilities`,
      details: data.abilities,
      icon: "Wand2",
    });
  }
  if (data.lore?.length) {
    changes.push({
      type: "Add/Update",
      label: "Notes",
      value: `${data.lore.length} entries`,
      details: data.lore,
      icon: "Scroll",
    });
  }
  if (data.achievements?.length) {
    changes.push({
      type: "Add/Update",
      label: "Achievements",
      value: `${data.achievements.length} achievements`,
      details: data.achievements,
      icon: "Trophy",
    });
  }
  if (data.quests?.length) {
    changes.push({
      type: "Add/Update",
      label: "Quests",
      value: `${data.quests.length} quests`,
      details: data.quests,
      icon: "Swords",
    });
  }
  if (data.presets?.length) {
    changes.push({
      type: "Add/Update",
      label: "Presets",
      value: `${data.presets.length} templates`,
      details: data.presets,
      icon: "LayoutTemplate",
    });
  }
  if (data.relationships?.length) {
    changes.push({
      type: "Add/Update",
      label: "Relationships",
      value: `${data.relationships.length} relationships`,
      details: data.relationships,
      icon: "Users",
    });
  }
  if (data.customTables?.length) {
    changes.push({
      type: "Add/Update",
      label: "Custom Tables",
      value: `${data.customTables.length} tables`,
      details: data.customTables,
      icon: "Table",
    });
  }
  if (data.variables?.length) {
    changes.push({
      type: "Add/Update",
      label: "Variables",
      value: `${data.variables.length} variables`,
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
  if (data.points !== undefined) {
    changes.push({
      type: "Update",
      label: "Starting Points",
      value: `${data.points} points`,
      icon: "Coins",
    });
  }
  if (data.momentum !== undefined) {
    changes.push({
      type: "Update",
      label: "Starting Momentum",
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
            {change.details && (
              <span className="text-gray-400 transition-transform duration-200">
                {expandedIndex === i ? (
                  <DynamicIcon name="ChevronUp" className="w-4 h-4" />
                ) : (
                  <DynamicIcon name="ChevronDown" className="w-4 h-4" />
                )}
              </span>
            )}
          </div>

          {expandedIndex === i && change.details && (
            <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-black/20 text-xs font-mono text-gray-600 dark:text-gray-300 overflow-x-auto">
              <pre>{JSON.stringify(change.details, null, 2)}</pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Helper to get icon for tool category
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
  | "Wrench" {
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

// Format a value for display
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toString();
  if (typeof value === "string") {
    if (value.length > 100) return value.substring(0, 100) + "...";
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[${value.length} items]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value);
    return `{${keys.slice(0, 3).join(", ")}${keys.length > 3 ? "..." : ""}}`;
  }
  return String(value);
}

// Render a detailed property display
function PropertyDisplay({
  label,
  value,
  icon,
}: {
  label: string;
  value: unknown;
  icon?: string;
}) {
  const isLongText = typeof value === "string" && value.length > 50;
  const displayValue = formatValue(value);

  return (
    <div className="flex items-start gap-2 py-1">
      <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 w-20 shrink-0 pt-0.5">
        {label}
      </span>
      <span
        className={`text-xs text-gray-800 dark:text-gray-200 ${
          isLongText ? "line-clamp-2" : ""
        }`}
      >
        {displayValue}
      </span>
    </div>
  );
}

// Extract and render the key details from tool args
function ToolArgsDisplay({
  toolName,
  args,
}: {
  toolName: string;
  args?: Record<string, unknown>;
}) {
  if (!args || Object.keys(args).length === 0) return null;

  // Helper to safely check if a value exists and is truthy
  const has = (val: unknown): val is string | number | boolean =>
    val !== undefined && val !== null && val !== "";

  // Different display based on tool type
  if (toolName.includes("stat") || toolName.includes("resource")) {
    // Handle arrays of stats/resources
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
            {(has(item.cost) || has(item.cooldown) || has(item.stat)) && (
              <div className="flex gap-2 mt-1 text-[10px]">
                {has(item.stat) && (
                  <span className="text-blue-600 dark:text-blue-400">
                    Stat: {String(item.stat)}
                  </span>
                )}
                {has(item.cooldown) && (
                  <span className="text-amber-600 dark:text-amber-400">
                    CD: {String(item.cooldown)}
                  </span>
                )}
              </div>
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

  // Passives display
  if (toolName.includes("passive")) {
    // Handle remove_passives which uses 'names' array of strings
    if (args.names && Array.isArray(args.names)) {
      const names = args.names as string[];
      return (
        <div className="mt-2 space-y-2">
          {names.slice(0, 5).map((name, idx) => (
            <div
              key={idx}
              className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-2">
                <DynamicIcon
                  name="Sparkles"
                  className="w-3.5 h-3.5 text-violet-500"
                />
                <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                  {name}
                </span>
              </div>
            </div>
          ))}
          {names.length > 5 && (
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
              +{names.length - 5} more...
            </p>
          )}
        </div>
      );
    }

    // Handle add_passives/modify_passives which use 'passives' array of objects
    const items = (args.passives || args.modifications || [args]) as Record<
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
                name="Sparkles"
                className="w-3.5 h-3.5 text-violet-500"
              />
              <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                {String(item.name || "Unknown")}
              </span>
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

  if (toolName.includes("achievement")) {
    const items = (args.achievements || [args]) as Record<string, unknown>[];
    const arrayItems = Array.isArray(items) ? items : [items];

    return (
      <div className="mt-2 space-y-2">
        {arrayItems.slice(0, 3).map((item, idx) => (
          <div
            key={idx}
            className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">
                {has(item.symbol) ? String(item.symbol) : "🏆"}
              </span>
              <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                {String(item.name || "Unknown")}
              </span>
              {has(item.xp) && (
                <span className="ml-auto text-xs font-medium text-green-600 dark:text-green-400">
                  +{String(item.xp)} XP
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

  if (toolName.includes("leveling") || toolName.includes("upgrade_settings")) {
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
      upgradePointsPerLevel: "📦",
    };
    const settingLabels: Record<string, string> = {
      xpBase: "XP Base Multiplier",
      levelCap: "Maximum Level",
      defaultUpgradesPerLevel: "Upgrades Per Level",
      useCustomCurve: "Custom XP Curve",
      customCurve: "XP Requirements",
      upgradeOverrides: "Level Overrides",
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

          // Special handling for arrays (customCurve, upgradeOverrides)
          if (Array.isArray(value)) {
            const arr = value as Record<string, unknown>[];
            return (
              <div
                key={key}
                className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2 border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">{icon}</span>
                  <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                    {label}
                  </span>
                  <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
                    {arr.length} entries
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 mt-1">
                  {arr.slice(0, 6).map((item, i) => (
                    <div
                      key={i}
                      className="text-[10px] bg-gray-100 dark:bg-gray-700/50 rounded px-1.5 py-0.5 text-center"
                    >
                      {key === "customCurve" ? (
                        <span>
                          Lvl {String(item.level)}:{" "}
                          <strong>{String(item.cumulativeXP)}</strong> XP
                        </span>
                      ) : key === "upgradeOverrides" ? (
                        <span>
                          Lvl {String(item.level)}:{" "}
                          <strong>{String(item.upgrades)}</strong> pts
                        </span>
                      ) : (
                        <span>{JSON.stringify(item)}</span>
                      )}
                    </div>
                  ))}
                  {arr.length > 6 && (
                    <div className="text-[10px] text-gray-500 text-center">
                      +{arr.length - 6} more
                    </div>
                  )}
                </div>
              </div>
            );
          }

          // Special handling for objects (startingUpgrades)
          if (typeof value === "object" && value !== null) {
            const obj = value as Record<string, unknown>;
            return (
              <div
                key={key}
                className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2 border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">{icon}</span>
                  <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                    {label}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mt-1">
                  {Object.entries(obj).map(([k, v]) => (
                    <div
                      key={k}
                      className="text-[10px] bg-gray-100 dark:bg-gray-700/50 rounded px-2 py-1"
                    >
                      <span className="text-gray-500 dark:text-gray-400 capitalize">
                        {k}:
                      </span>
                      <span className="ml-1 font-medium text-gray-800 dark:text-gray-200">
                        {String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          // Simple values
          return (
            <div
              key={key}
              className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2 border border-gray-200 dark:border-gray-700 flex items-center gap-2"
            >
              <span className="text-base">{icon}</span>
              <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
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

  // Generic fallback for other tools
  const entries = Object.entries(args).filter(
    ([, v]) => v !== undefined && v !== null
  );
  if (entries.length === 0) return null;

  return (
    <div className="mt-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2 border border-gray-200 dark:border-gray-700">
      <div className="space-y-1">
        {entries.slice(0, 5).map(([key, value]) => {
          const label = key
            .replace(/([A-Z])/g, " $1")
            .replace(/_/g, " ")
            .trim();
          return <PropertyDisplay key={key} label={label} value={value} />;
        })}
        {entries.length > 5 && (
          <p className="text-[10px] text-gray-500 dark:text-gray-400 pt-1">
            +{entries.length - 5} more properties...
          </p>
        )}
      </div>
    </div>
  );
}

function ToolResultsDisplay({
  toolResults,
  toolChanges,
  hasToolChanges,
  onApplyChanges,
}: {
  toolResults: CreatorToolResult[];
  toolChanges?: CreatorChanges;
  hasToolChanges?: boolean;
  onApplyChanges: (
    data: Partial<StoryData> & {
      title?: string;
      shortDescription?: string;
      description?: string;
    }
  ) => void;
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const successCount = toolResults.filter((r) => r.success).length;
  const failCount = toolResults.length - successCount;

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

      {/* Tool Results - Always Expanded with Details */}
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

                  {/* Show preview of changes/args when collapsed */}
                  {!isExpanded && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {/* Show args preview first if available */}
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
                  {/* Error Message for Failures */}
                  {!result.success && result.message && (
                    <div className="mb-3 p-2 rounded-lg bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-700/50">
                      <span className="text-[10px] uppercase tracking-wider text-red-600 dark:text-red-400 font-medium">
                        Error
                      </span>
                      <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                        {result.message}
                      </p>
                    </div>
                  )}
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
                      />
                    </div>
                  )}

                  {/* Raw JSON fallback when no formatted display */}
                  {(!result.changes || result.changes.length === 0) &&
                    (!result.args || Object.keys(result.args).length === 0) && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 italic">
                        Tool executed with default parameters
                      </div>
                    )}

                  {/* Always show raw data toggle for debugging */}
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
            onClick={() => {
              console.log(
                "[ToolResultsDisplay] Applying toolChanges:",
                JSON.stringify(toolChanges, null, 2)
              );
              onApplyChanges(
                toolChanges as Partial<StoryData> & {
                  title?: string;
                  shortDescription?: string;
                  description?: string;
                }
              );
            }}
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
