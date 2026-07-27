"use client";

/**
 * Adventure creator.
 *
 * The old creator was two wizards: a 12-step manual form and a staged batch
 * generator. Both are gone. Building an adventure is now a conversation with a
 * game designer, with a live inspector beside it for hand edits.
 */

import { Suspense, useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { DynamicIcon } from "@/app/components/DynamicIcon";
import { useAPIKeys } from "@/app/misc/APIKeysContext";
import { useNotification } from "@/app/misc/NotificationContext";
import { AI_MODELS } from "@/app/misc/ai_prices";
import { CustomModel } from "@/app/misc/user_settings";
import { startAdventureLocally } from "@/app/misc/localStoryManager";
import { draftToAdventure } from "@/app/misc/designer_executor";
import AdventureInspector from "./AdventureInspector";
import DesignerChat from "./DesignerChat";
import { useDesignerSession } from "./useDesignerSession";

type MobilePane = "chat" | "adventure";

function CreatorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { keys: apiKeys, hasKey } = useAPIKeys();
  const { addNotification } = useNotification();

  const editId = searchParams.get("edit") || undefined;

  const [mobilePane, setMobilePane] = useState<MobilePane>("chat");
  const [showSettings, setShowSettings] = useState(false);

  const [byokMode, setByokMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("designerByokMode") === "true";
  });
  const [model, setModel] = useState(() => {
    if (typeof window === "undefined") return "DeepInfra DeepSeek V3.2";
    return localStorage.getItem("designerModel") || "DeepInfra DeepSeek V3.2";
  });
  const [maxOutputTokens, setMaxOutputTokens] = useState(() => {
    if (typeof window === "undefined") return 8000;
    const stored = localStorage.getItem("designerMaxOutput");
    return stored ? parseInt(stored, 10) : 8000;
  });

  const customModels: CustomModel[] = useMemo(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem("customModels");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }, []);

  // BYOK reaches OpenRouter/DeepSeek/Google; Coins covers the server-side keys.
  const availableModels = useMemo(() => {
    const builtIn = Object.entries(AI_MODELS).filter(([, m]) => {
      const provider = (m as { provider?: string }).provider;
      return byokMode
        ? provider === "openrouter" ||
            provider === "deepseek" ||
            provider === "google"
        : provider === "mistral" || provider === "deepinfra";
    });
    const entries: [string, { name: string }][] = builtIn.map(([key, m]) => [
      key,
      { name: (m as { name: string }).name },
    ]);
    if (byokMode) {
      customModels.forEach((m) => entries.push([m.id, { name: `⭐ ${m.name}` }]));
    }
    return entries;
  }, [byokMode, customModels]);

  const persistSetting = (key: string, value: string) => {
    if (typeof window !== "undefined") localStorage.setItem(key, value);
  };

  const handleError = useCallback(
    (message: string) => addNotification(message, "failure"),
    [addNotification],
  );

  const session = useDesignerSession({
    adventureId: editId,
    model,
    maxOutputTokens,
    byokMode,
    apiKeys,
    onError: handleError,
  });

  const { draft, updateDraft, messages, loading, save, dirty } = session;

  const handleSave = async () => {
    const id = await save();
    if (id) {
      addNotification("Adventure saved", "success");
      if (!editId) {
        window.history.replaceState(null, "", `/creator?edit=${id}`);
      }
    }
  };

  const handleSaveAndPlay = async () => {
    const id = await save();
    if (!id) return;
    // Playing an adventure means spinning up a fresh local story from it —
    // the story player takes a storyId, not an adventure id.
    try {
      const storyId = await startAdventureLocally(draftToAdventure(draft));
      router.push(`/story?storyId=${storyId}`);
    } catch {
      addNotification("Couldn't start a story from this adventure.", "failure");
    }
  };

  const isBlank = !draft.title && !draft.premise && draft.lore.length === 0;
  const hasBYOKKey =
    hasKey("openRouterKey") || hasKey("deepseekKey") || hasKey("googleKey");

  if (session.loadingAdventure) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-white/50">
          <DynamicIcon name="Loader2" className="w-5 h-5 animate-spin" />
          Loading adventure…
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 text-white overflow-hidden">
      {/* Header */}
      <header className="shrink-0 border-b border-white/10 bg-black/20 backdrop-blur-md">
        <div className="flex items-center gap-3 px-3 sm:px-4 h-14">
          <Link
            href="/library"
            className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors shrink-0"
            title="Back to library"
          >
            <DynamicIcon name="ArrowLeft" className="w-4 h-4" />
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold truncate">
                {draft.title || "New adventure"}
              </h1>
              {dirty && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"
                  title="Unsaved changes"
                />
              )}
            </div>
            <p className="text-[11px] text-white/35">Game designer</p>
          </div>

          <button
            onClick={() => setShowSettings((v) => !v)}
            className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors shrink-0"
            title="Model settings"
          >
            <DynamicIcon name="Settings2" className="w-4 h-4" />
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-sm transition-colors shrink-0"
          >
            Save
          </button>
          <button
            onClick={handleSaveAndPlay}
            className="flex px-3 py-1.5 rounded-lg bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-sm font-medium transition-all items-center gap-1.5 shrink-0"
            title="Save and play"
          >
            <DynamicIcon name="Play" className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Play</span>
          </button>
        </div>

        {showSettings && (
          <div className="px-4 py-3 border-t border-white/10 bg-black/30 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-lg overflow-hidden border border-white/10">
                <button
                  onClick={() => {
                    setByokMode(false);
                    persistSetting("designerByokMode", "false");
                  }}
                  className={`px-3 py-1.5 text-xs transition-colors ${
                    !byokMode ? "bg-purple-600 text-white" : "text-white/50"
                  }`}
                >
                  Coins
                </button>
                <button
                  onClick={() => {
                    setByokMode(true);
                    persistSetting("designerByokMode", "true");
                  }}
                  className={`px-3 py-1.5 text-xs transition-colors ${
                    byokMode ? "bg-purple-600 text-white" : "text-white/50"
                  }`}
                >
                  My API key
                </button>
              </div>

              <select
                value={model}
                onChange={(e) => {
                  setModel(e.target.value);
                  persistSetting("designerModel", e.target.value);
                }}
                className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-400/50"
              >
                {availableModels.map(([key, m]) => (
                  <option key={key} value={key}>
                    {m.name}
                  </option>
                ))}
              </select>

              <label className="flex items-center gap-2 text-xs text-white/50">
                Response length
                <input
                  type="range"
                  min={2000}
                  max={16000}
                  step={1000}
                  value={maxOutputTokens}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    setMaxOutputTokens(value);
                    persistSetting("designerMaxOutput", String(value));
                  }}
                  className="accent-purple-500"
                />
                <span className="tabular-nums text-white/40">
                  {(maxOutputTokens / 1000).toFixed(0)}k
                </span>
              </label>
            </div>
            {byokMode && !hasBYOKKey && (
              <p className="text-xs text-amber-300/80">
                No API key saved yet — add one in Settings to use your own key.
              </p>
            )}
          </div>
        )}
      </header>

      {/* Mobile pane switcher */}
      <div className="md:hidden shrink-0 flex border-b border-white/10 bg-black/20">
        {(["chat", "adventure"] as MobilePane[]).map((pane) => (
          <button
            key={pane}
            onClick={() => setMobilePane(pane)}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
              mobilePane === pane
                ? "text-purple-300 border-b-2 border-purple-400"
                : "text-white/40"
            }`}
          >
            {pane === "chat" ? "Conversation" : "Adventure"}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex">
        <div
          className={`flex-1 min-w-0 ${
            mobilePane === "chat" ? "flex" : "hidden"
          } md:flex flex-col`}
        >
          <DesignerChat
            messages={messages}
            loading={loading}
            onSend={session.send}
            onStop={session.stop}
            showSuggestions={isBlank}
          />
        </div>

        <div
          className={`w-full md:w-[380px] lg:w-[440px] shrink-0 md:border-l border-white/10 ${
            mobilePane === "adventure" ? "block" : "hidden"
          } md:block`}
        >
          <AdventureInspector draft={draft} onChange={updateDraft} />
        </div>
      </div>
    </div>
  );
}

export default function CreatorPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 flex items-center justify-center">
          <DynamicIcon
            name="Loader2"
            className="w-5 h-5 animate-spin text-white/50"
          />
        </div>
      }
    >
      <CreatorPage />
    </Suspense>
  );
}
