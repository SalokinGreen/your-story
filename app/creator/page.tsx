"use client";

/**
 * Adventure creator.
 *
 * The old creator was two wizards: a 12-step manual form and a staged batch
 * generator. Both are gone. Building an adventure is now a conversation with a
 * game designer, with a live inspector beside it for hand edits.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { DynamicIcon } from "@/app/components/DynamicIcon";
import APIKeysModal from "@/app/components/APIKeysModal";
import LibraryPickerModal from "@/app/components/LibraryPickerModal";
import { useAPIKeys } from "@/app/misc/APIKeysContext";
import { useNotification } from "@/app/misc/NotificationContext";
import { getAvailableModels } from "@/app/misc/ai_prices";
import { CustomModel, getCustomModels } from "@/app/misc/user_settings";
import { LibraryNote } from "@/app/misc/localNotesLibraryManager";
import { LibraryTable } from "@/app/misc/localTablesLibraryManager";
import { startAdventureLocally } from "@/app/misc/localStoryManager";
import { draftToAdventure } from "@/app/misc/designer_executor";
import AdventureInspector from "./AdventureInspector";
import DesignerChat from "./DesignerChat";
import { useDesignerSession } from "./useDesignerSession";

type MobilePane = "chat" | "adventure";

const DEFAULT_MAX_OUTPUT = 8000;

function CreatorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { keys: apiKeys } = useAPIKeys();
  const { addNotification } = useNotification();

  const editId = searchParams.get("edit") || undefined;

  const [mobilePane, setMobilePane] = useState<MobilePane>("chat");
  const [showSettings, setShowSettings] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showAPIKeys, setShowAPIKeys] = useState(false);

  // Persisted settings are read after mount - reading localStorage while
  // rendering would make the server and client markup disagree.
  const [model, setModel] = useState("");
  const [maxOutputTokens, setMaxOutputTokens] = useState(DEFAULT_MAX_OUTPUT);
  const [customModels, setCustomModels] = useState<CustomModel[]>([]);

  useEffect(() => {
    const stored = {
      customModels: getCustomModels(),
      model: localStorage.getItem("designerModel") || "",
      maxOutput: parseInt(
        localStorage.getItem("designerMaxOutput") || "",
        10,
      ),
    };
    setCustomModels(stored.customModels);
    setModel(stored.model);
    if (Number.isFinite(stored.maxOutput)) {
      setMaxOutputTokens(stored.maxOutput);
    }
  }, []);

  // Everything is BYOK: a model is offered when its provider's key is saved.
  // The Designer works entirely through tool calls, so models that can't call
  // tools would produce a chat that never writes into the adventure.
  const availableModels = useMemo(() => {
    const entries: [string, string][] = getAvailableModels(
      {
        openRouterKey: !!apiKeys.openRouterKey,
        deepseekKey: !!apiKeys.deepseekKey,
        googleKey: !!apiKeys.googleKey,
        mistralKey: !!apiKeys.mistralKey,
        deepinfraKey: !!apiKeys.deepinfraKey,
      },
      { requireToolCalling: true },
    ).map(([key, config]) => [key, config.name]);
    // Custom models are OpenRouter-only.
    if (apiKeys.openRouterKey) {
      customModels.forEach((m) => entries.push([m.id, `⭐ ${m.name}`]));
    }
    return entries;
  }, [apiKeys, customModels]);

  const hasAnyKey = availableModels.length > 0;
  // Fall back to the first usable model when nothing is stored, or when the
  // stored one belongs to a provider whose key has since been removed.
  const activeModel =
    model && availableModels.some(([key]) => key === model)
      ? model
      : (availableModels[0]?.[0] ?? "");

  const persistSetting = (key: string, value: string) => {
    if (typeof window !== "undefined") localStorage.setItem(key, value);
  };

  const handleError = useCallback(
    (message: string) => addNotification(message, "failure"),
    [addNotification],
  );

  const session = useDesignerSession({
    adventureId: editId,
    model: activeModel,
    maxOutputTokens,
    apiKeys,
    onError: handleError,
  });

  const {
    draft,
    updateDraft,
    importFromLibrary,
    messages,
    loading,
    save,
    dirty,
  } = session;

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

  const handleImport = useCallback(
    (notes: LibraryNote[], tables: LibraryTable[]) => {
      importFromLibrary(notes, tables);
      setShowImport(false);
      const count = notes.length + tables.length;
      addNotification(
        `Imported ${count} item${count === 1 ? "" : "s"} from your library`,
        "success",
      );
    },
    [importFromLibrary, addNotification],
  );

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
            onClick={() => setShowImport(true)}
            className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors shrink-0"
            title="Import notes and tables from your library"
          >
            <DynamicIcon name="Import" className="w-4 h-4" />
          </button>
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
              <select
                value={activeModel}
                onChange={(e) => {
                  setModel(e.target.value);
                  persistSetting("designerModel", e.target.value);
                }}
                disabled={!hasAnyKey}
                className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-400/50 disabled:opacity-50"
              >
                {hasAnyKey ? (
                  availableModels.map(([key, name]) => (
                    <option key={key} value={key}>
                      {name}
                    </option>
                  ))
                ) : (
                  <option value="">No models available</option>
                )}
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
            {!hasAnyKey && (
              <p className="text-xs text-amber-300/80">
                No API key saved yet — the Designer runs on your own provider
                key.{" "}
                <button
                  onClick={() => setShowAPIKeys(true)}
                  className="underline hover:text-amber-200"
                >
                  Add one now
                </button>
                .
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
            onImport={() => setShowImport(true)}
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

      <LibraryPickerModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onImport={handleImport}
        title="Import into this adventure"
        description="Bring saved notes, rules, character sheets and random tables into the draft. The Designer builds on top of whatever you import."
        confirmLabel="Import"
        includeTables
      />

      <APIKeysModal
        isOpen={showAPIKeys}
        onClose={() => setShowAPIKeys(false)}
      />
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
