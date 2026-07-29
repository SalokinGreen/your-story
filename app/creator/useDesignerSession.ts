"use client";

/**
 * Owns a Game Designer session: the adventure draft, the conversation, and the
 * tool loop that connects them.
 *
 * Kept apart from the UI so the page stays presentational — the chat pane and
 * the inspector are two views onto the same state this hook holds.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ChatMessage } from "@/app/misc/chatMessage";
import {
  AdventureDraft,
  DesignerToolCall,
  DesignerToolResult,
  adventureToDraft,
  createEmptyDraft,
  draftToAdventure,
  executeDesignerTools,
} from "@/app/misc/designer_executor";
import { buildDesignerMessages, getDesignerGreeting } from "@/app/misc/designer_ai";
import { stripLeakedToolCallMarkup } from "@/app/misc/toolCallFallback";
import { getDesignerToolsForAPI } from "@/app/misc/designer_tools";
import {
  getLocalAdventure,
  saveLocalAdventure,
} from "@/app/misc/localAdventureManager";
import {
  LibraryNote,
  libraryNoteToStoryLore,
} from "@/app/misc/localNotesLibraryManager";
import { APIKeys } from "@/app/misc/APIKeysContext";
import { getCustomModelIfUUID } from "@/app/misc/user_settings";
import { getRequiredKeyForModel } from "@/app/misc/ai_prices";

/** A turn can trigger several rounds of tool calls before the model settles. */
const MAX_TOOL_ROUNDS = 5;
/** Provider names for the "you need a key" message. */
const PROVIDER_LABELS: Record<string, string> = {
  openRouterKey: "OpenRouter",
  deepseekKey: "DeepSeek",
  googleKey: "Google",
  mistralKey: "Mistral",
  deepinfraKey: "DeepInfra",
};
/** How much conversation to replay. Draft state is injected separately. */
const HISTORY_LIMIT = 24;

export interface DesignerMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Summaries of what the tools changed, shown under the message. */
  changes?: string[];
  error?: boolean;
  pending?: boolean;
}

interface RawToolCall {
  id?: string;
  function?: { name?: string; arguments?: string };
}

function parseToolCalls(raw: unknown): DesignerToolCall[] {
  if (!Array.isArray(raw)) return [];
  const calls: DesignerToolCall[] = [];
  raw.forEach((entry: RawToolCall, index) => {
    const name = entry?.function?.name;
    if (!name) return;
    let args: Record<string, unknown> = {};
    const rawArgs = entry.function?.arguments;
    if (typeof rawArgs === "string" && rawArgs.trim()) {
      try {
        const parsed = JSON.parse(rawArgs);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          args = parsed as Record<string, unknown>;
        }
      } catch {
        // Leave args empty; the executor reports the failure back to the model
        // rather than throwing, so the turn can recover.
      }
    } else if (rawArgs && typeof rawArgs === "object") {
      args = rawArgs as Record<string, unknown>;
    }
    calls.push({ id: entry.id || `call_${index}`, name, arguments: args });
  });
  return calls;
}

function newMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface UseDesignerSessionOptions {
  adventureId?: string;
  model: string;
  maxOutputTokens: number;
  apiKeys: APIKeys;
  onError?: (message: string) => void;
}

export function useDesignerSession({
  adventureId,
  model,
  maxOutputTokens,
  apiKeys,
  onError,
}: UseDesignerSessionOptions) {
  const [draft, setDraft] = useState<AdventureDraft>(createEmptyDraft);
  const [messages, setMessages] = useState<DesignerMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingAdventure, setLoadingAdventure] = useState(!!adventureId);
  const [savedId, setSavedId] = useState<string | undefined>(adventureId);
  const [dirty, setDirty] = useState(false);

  /** Provider-format transcript, including tool calls/results. */
  const historyRef = useRef<ChatMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  /** Mirrors `draft` so the tool loop reads current state without re-rendering. */
  const draftRef = useRef<AdventureDraft>(draft);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // Load an existing adventure for editing.
  useEffect(() => {
    let cancelled = false;
    if (!adventureId) {
      setMessages([
        {
          id: newMessageId(),
          role: "assistant",
          content: getDesignerGreeting(createEmptyDraft()),
        },
      ]);
      return;
    }
    (async () => {
      try {
        const stored = await getLocalAdventure(adventureId);
        if (cancelled) return;
        const loaded = stored?.adventureData
          ? adventureToDraft(stored.adventureData)
          : createEmptyDraft();
        setDraft(loaded);
        draftRef.current = loaded;
        setMessages([
          {
            id: newMessageId(),
            role: "assistant",
            content: getDesignerGreeting(loaded),
          },
        ]);
      } catch {
        if (!cancelled) onError?.("Couldn't load that adventure.");
      } finally {
        if (!cancelled) setLoadingAdventure(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only re-run when switching adventures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adventureId]);

  /** Hand edits from the inspector. */
  const updateDraft = useCallback(
    (patch: Partial<AdventureDraft>) => {
      setDraft((prev) => ({ ...prev, ...patch }));
      setDirty(true);
    },
    [],
  );

  /**
   * Pull saved notes and tables out of the global library into the draft.
   *
   * Notes keep their `libraryNoteId`, which is also what dedupes them: bringing
   * the same note in twice updates the copy that's already here instead of
   * stacking duplicates the Designer would then see as two conflicting notes.
   * Mechanics and character-sheet notes arrive pinned on (libraryNoteToStoryLore
   * handles that), matching what the Designer's own tools do.
   */
  const importFromLibrary = useCallback(
    (notes: LibraryNote[]) => {
      if (notes.length === 0) return;

      const incomingLore = notes.map(libraryNoteToStoryLore);

      const current = draftRef.current;
      const lore = [...current.lore];
      for (const note of incomingLore) {
        const index = lore.findIndex(
          (l) =>
            (note.libraryNoteId && l.libraryNoteId === note.libraryNoteId) ||
            l.title.trim().toLowerCase() === note.title.trim().toLowerCase(),
        );
        if (index >= 0) lore[index] = { ...lore[index], ...note };
        else lore.push(note);
      }

      // The tool loop reads draftRef synchronously, so keep it in step with
      // the state update rather than waiting for the mirroring effect.
      const next = { ...current, lore };
      draftRef.current = next;
      setDraft(next);
      setDirty(true);

      // Record the import in the transcript. The Designer reads the draft
      // summary rather than this message, but the author should see what
      // landed and what it means for the adventure.
      const parts = [`${notes.length} note${notes.length === 1 ? "" : "s"}`];
      const titles = incomingLore.map((l) => l.title);
      setMessages((prev) => [
        ...prev,
        {
          id: newMessageId(),
          role: "assistant",
          content: `Brought in ${parts.join(" and ")} from your library. Tell me what you want built around this material — or ask me what it still needs.`,
          changes: titles,
        },
      ]);
    },
    [],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      // Every provider is BYOK, so a turn is only possible with the key for
      // the selected model's provider. Custom models are always OpenRouter.
      // No model at all means no provider key is saved yet.
      if (!model) {
        onError?.(
          "The Designer runs on your own API key — add one in Settings to start.",
        );
        return;
      }
      const customModel = getCustomModelIfUUID(model);
      const requiredKey = customModel
        ? ("openRouterKey" as const)
        : getRequiredKeyForModel(model);
      if (requiredKey && !apiKeys[requiredKey]) {
        onError?.(
          `That model needs your ${PROVIDER_LABELS[requiredKey]} API key — add one in Settings.`,
        );
        return;
      }

      const userMessage: DesignerMessage = {
        id: newMessageId(),
        role: "user",
        content: trimmed,
      };
      const placeholderId = newMessageId();
      setMessages((prev) => [
        ...prev,
        userMessage,
        { id: placeholderId, role: "assistant", content: "", pending: true },
      ]);
      setLoading(true);

      historyRef.current = [
        ...historyRef.current,
        { role: "user", content: trimmed },
      ];

      const controller = new AbortController();
      abortRef.current = controller;

      const collectedChanges: string[] = [];
      let finalContent = "";
      let failed = false;

      try {
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const aiMessages = buildDesignerMessages({
            history: historyRef.current.slice(-HISTORY_LIMIT),
            draft: draftRef.current,
          });

          const response = await fetch("/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: aiMessages,
              tools: getDesignerToolsForAPI(),
              model,
              maxTokens: maxOutputTokens,
              temperature: 0.8,
              openRouterKey: apiKeys.openRouterKey,
              deepseekKey: apiKeys.deepseekKey,
              googleKey: apiKeys.googleKey,
              mistralKey: apiKeys.mistralKey,
              deepinfraKey: apiKeys.deepinfraKey,
              customModel,
            }),
            signal: controller.signal,
          });

          if (!response.ok) {
            const data = await response
              .json()
              .catch(() => ({ error: "Unknown error" }));
            throw new Error(
              data.error || `The model call failed (${response.status}).`,
            );
          }

          const data = await response.json();
          // Tool-call markup a backend leaked into `content` (see
          // toolCallFallback.ts) is never something to show the author - the
          // call itself is recovered into `toolCalls` before it gets here.
          const content: string = stripLeakedToolCallMarkup(data.content || "");
          const toolCalls = parseToolCalls(data.toolCalls);

          if (content.trim()) finalContent = content;

          historyRef.current.push({
            role: "assistant",
            content,
            // Carried back into the next round because a reasoning model in
            // thinking mode requires its own chain of thought alongside the
            // tool calls it made - DeepSeek rejects the follow-up request
            // outright without it (see providerCall.ts's reasoning_content
            // handling).
            ...(data.reasoning ? { reasoning: data.reasoning } : {}),
            ...(data.reasoning_details?.length
              ? { reasoning_details: data.reasoning_details }
              : {}),
            ...(toolCalls.length > 0 ? { tool_calls: data.toolCalls } : {}),
          });

          if (toolCalls.length === 0) break;

          const { draft: updated, results } = executeDesignerTools(
            toolCalls,
            draftRef.current,
          );
          draftRef.current = updated;
          setDraft(updated);
          setDirty(true);

          results.forEach((result: DesignerToolResult) => {
            collectedChanges.push(result.summary);
            historyRef.current.push({
              role: "tool",
              tool_call_id: result.toolCallId,
              content: result.content,
            });
          });

          // Live-update the placeholder so the author sees work landing
          // instead of a spinner during a multi-round turn.
          setMessages((prev) =>
            prev.map((m) =>
              m.id === placeholderId
                ? { ...m, content: finalContent, changes: [...collectedChanges] }
                : m,
            ),
          );
        }
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          setMessages((prev) => prev.filter((m) => m.id !== placeholderId));
          return;
        }
        failed = true;
        const message =
          error instanceof Error ? error.message : "Something went wrong.";
        finalContent = message;
        onError?.(message);
      } finally {
        abortRef.current = null;
        setLoading(false);
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholderId
            ? {
                ...m,
                pending: false,
                error: failed,
                content:
                  finalContent ||
                  (collectedChanges.length > 0
                    ? "Done — see the changes below."
                    : "I didn't get a response that time. Try again?"),
                changes: collectedChanges.length ? collectedChanges : undefined,
              }
            : m,
        ),
      );
    },
    [loading, model, maxOutputTokens, apiKeys, onError],
  );

  const save = useCallback(async (): Promise<string | undefined> => {
    const current = draftRef.current;
    if (!current.title.trim()) {
      onError?.("Give the adventure a title before saving.");
      return undefined;
    }
    const id =
      savedId ||
      `local:${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    try {
      await saveLocalAdventure(id, draftToAdventure(current));
      setSavedId(id);
      setDirty(false);
      return id;
    } catch {
      onError?.("Couldn't save the adventure.");
      return undefined;
    }
  }, [savedId, onError]);

  return {
    draft,
    updateDraft,
    importFromLibrary,
    messages,
    loading,
    loadingAdventure,
    send,
    stop,
    save,
    savedId,
    dirty,
  };
}
