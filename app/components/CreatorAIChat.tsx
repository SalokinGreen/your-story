"use client";

import { useState, useRef, useEffect } from "react";
import { ChatMessage } from "@/app/misc/ai";
import { StoryData, StartingChoice } from "@/app/misc/structs";
import { authenticatedFetch } from "@/app/misc/getAuthToken";
import { parseCreatorOutput } from "@/app/misc/creator_ai";
import { DynamicIcon } from "./DynamicIcon";
import { AI_MODELS } from "@/app/misc/ai_prices";
import { useAPIKeys } from "@/app/misc/APIKeysContext";

interface CreatorAIChatProps {
  isOpen: boolean;
  onClose: () => void;
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
}

export default function CreatorAIChat({
  isOpen,
  onClose,
  currentStoryData,
  adventureMetadata,
  adventureId,
  onApplyChanges,
}: CreatorAIChatProps) {
  const chatKey = adventureId ? `creatorAiChat:${adventureId}` : null;
  const { keys: apiKeys } = useAPIKeys();

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window !== "undefined" && chatKey) {
      const saved = localStorage.getItem(chatKey);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error("Failed to parse saved chat:", e);
        }
      }
    }
    return [];
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("creatorAiModel") || "Deepseek Chat";
    }
    return "Deepseek Chat";
  });
  const [novelaiKey, setNovelaiKey] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("novelaiKey") || "";
    }
    return "";
  });
  const [showKeyInput, setShowKeyInput] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check if NovelAI is selected
  const isNovelAISelected =
    (AI_MODELS as Record<string, { provider?: string }>)[model]?.provider ===
    "novelai";

  // Save chat history to localStorage
  useEffect(() => {
    if (typeof window !== "undefined" && chatKey && messages.length > 0) {
      localStorage.setItem(chatKey, JSON.stringify(messages));
    }
  }, [messages, chatKey]);

  // Save model selection to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("creatorAiModel", model);
    }
  }, [model]);

  // Save NovelAI key to localStorage
  useEffect(() => {
    if (typeof window !== "undefined" && novelaiKey) {
      localStorage.setItem("novelaiKey", novelaiKey);
    }
  }, [novelaiKey]);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

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

    const userMsg: ChatMessage = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      // Prepare context (limit history to last 10 messages to save tokens)
      const recentMessages = [...messages, userMsg].slice(-10);

      const response = await authenticatedFetch("/api/creator/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: recentMessages,
          currentStoryData: currentStoryData,
          adventureMetadata: adventureMetadata,
          model: model,
          novelaiKey: isNovelAISelected ? novelaiKey : undefined,
          openRouterKey: apiKeys.openRouterKey,
          deepseekKey: apiKeys.deepseekKey,
        }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        console.error("API Error:", response.status, errorData);
        throw new Error(
          errorData.error || `Failed to get AI response (${response.status})`
        );
      }

      const data = await response.json();
      const assistantMsg: ChatMessage & { meta?: any } = {
        role: "assistant",
        content: data.content,
        meta: data.meta, // Include cost and usage info
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
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
    if (confirm("Are you sure you want to clear the chat history?")) {
      setMessages([]);
      if (typeof window !== "undefined" && chatKey) {
        localStorage.removeItem(chatKey);
      }
    }
  };

  // Handle click outside to close
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Prevent body scroll when modal is open
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
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className={`bg-gray-100 dark:bg-blue-950 border-none text-xs rounded-md px-2 py-1 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-purple-500 outline-none cursor-pointer max-w-[150px] truncate ${
                  isNovelAISelected ? "ring-1 ring-green-500" : ""
                }`}
                title="Select AI model"
              >
                <optgroup label="Recommended">
                  <option value="Deepseek Chat">Deepseek Chat (Best)</option>
                  <option value="Gemini 2.5 Flash">Gemini 2.5 Flash</option>
                  <option value="Mistral Medium 3.1">Mistral Medium 3.1</option>
                </optgroup>
                <optgroup label="Advanced">
                  <option value="Deepseek R1">DeepSeek R1 (Reasoning)</option>
                  <option value="Grok 4 Fast">Grok 4 Fast (Creative)</option>
                  <option value="GLM 4.6">GLM 4.6 (Long Context)</option>
                </optgroup>
                <optgroup label="Budget">
                  <option value="Gemini 2.5 Flash Lite">
                    Gemini Flash Lite
                  </option>
                  <option value="Grok Code Fast 1">Grok Code Fast</option>
                </optgroup>
                <optgroup label="BYOK (Free)">
                  <option value="NovelAI GLM-4-6">NovelAI (Your Key)</option>
                </optgroup>
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
            {/* NovelAI Key Input Popup */}
            {showKeyInput && isNovelAISelected && (
              <div className="absolute top-16 right-4 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-3 z-50 w-72">
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
                  I can design items, write plot beats, balance stats, or create
                  entire scenarios from scratch.
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
                      setInput("Write a plot beat about a dragon attack")
                    }
                    className="px-4 py-2 rounded-lg bg-white dark:bg-blue-950 border border-gray-200 dark:border-gray-700 hover:border-purple-500 dark:hover:border-purple-500 transition-colors text-left shadow-xs"
                  >
                    "Write a plot beat about..."
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
    </div>
  );
}

function MessageItem({
  message,
  onApplyChanges,
}: {
  message: ChatMessage & { meta?: any };
  onApplyChanges: (
    data: Partial<StoryData> & {
      title?: string;
      shortDescription?: string;
      description?: string;
    }
  ) => void;
}) {
  const isUser = message.role === "user";
  const { text, data } = parseCreatorOutput(message.content);
  const meta = message.meta;

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
        <div className="whitespace-pre-wrap leading-relaxed">{text}</div>
        {!isUser && (meta?.cost !== undefined || meta?.isByok) && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700/50 flex items-center justify-between text-xs">
            <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <DynamicIcon name="Info" className="w-3 h-3" />
              Generation cost
            </span>
            {meta?.isByok ? (
              <span className="font-semibold text-green-600 dark:text-green-400">
                Free (BYOK)
              </span>
            ) : (
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                {meta.cost} {meta.cost === 1 ? "coin" : "coins"}
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
  if (data.plot_beats?.length) {
    changes.push({
      type: "Add/Update",
      label: "Plot Beats",
      value: `${data.plot_beats.length} beats`,
      details: data.plot_beats,
      icon: "TrendingUp",
    });
  }
  if (data.lore?.length) {
    changes.push({
      type: "Add/Update",
      label: "Lore",
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
  if (data.upgradeSettings) {
    changes.push({
      type: "Update",
      label: "Upgrade Settings",
      value: "Upgrade shop configuration",
      details: data.upgradeSettings,
      icon: "ShoppingCart",
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
