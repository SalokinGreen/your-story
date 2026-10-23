"use client";

import { useEffect, useRef, useState } from "react";
import { DynamicIcon } from "./DynamicIcon";
import type { OOCChatMessage } from "@/app/misc/multiplayer/session";

interface OOCChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  messages: OOCChatMessage[];
  myLocalPlayerId: string;
  onSend: (text: string) => void;
}

// Out-of-character chat between online co-op players. Deliberately separate
// from the GM conversation: messages here never touch StoryData and are
// never sent to the AI - this is players talking to each other, not to the
// GM. Only rendered while an online multiplayer session (netSession) is
// active - see app/story/page.tsx.
export default function OOCChatPanel({
  isOpen,
  onClose,
  messages,
  myLocalPlayerId,
  onSend,
}: OOCChatPanelProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [isOpen, messages.length]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput("");
  };

  // Closed: nothing renders. The panel opens from the story menu's Status row.
  if (!isOpen) return null;

  return (
    <>
      <button
        className="fixed top-1/2 -translate-y-1/2 z-40 bg-ys-text text-ys-bg hover:opacity-90 p-1.5 rounded-l-lg shadow-md shadow-black/30 transition-all pointer-events-auto right-80 sm:right-[380px] md:right-[420px]"
        onClick={onClose}
        title="Close OOC Chat"
      >
        <DynamicIcon name="ChevronRight" className="w-4 h-4" />
      </button>
      <div className="fixed top-14 right-0 z-40 h-[calc(100%-7.5rem)] w-[320px] sm:w-[380px] md:w-[420px] max-w-[85vw] flex flex-col overflow-hidden bg-ys-surface shadow-2xl shadow-black/50 border-l border-ys-border animate-in slide-in-from-right duration-300 pointer-events-auto rounded-bl-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ys-border px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <DynamicIcon
              name="MessageCircle"
              className="w-4 h-4 text-ys-muted shrink-0"
            />
            <span className="text-sm font-semibold text-ys-text truncate">
              OOC Chat
            </span>
            <span className="text-[10px] text-ys-muted">
              (players only, GM can&apos;t see this)
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ys-muted hover:bg-ys-text/10 hover:text-ys-text transition-colors"
            title="Close"
          >
            <DynamicIcon name="X" className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-4">
              <DynamicIcon
                name="MessageCircle"
                className="w-8 h-8 text-ys-muted mb-2"
              />
              <p className="text-xs text-ys-muted">
                Chat with your fellow players - the GM never sees this
              </p>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const isMe = msg.playerId === myLocalPlayerId;
              return (
                <div
                  key={idx}
                  className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl px-3 py-2 ${
                      isMe
                        ? "rounded-tr-sm bg-ys-text text-ys-bg"
                        : "rounded-tl-sm bg-ys-text/5 text-ys-text border border-ys-border"
                    }`}
                  >
                    {!isMe && (
                      <p
                        className="text-[10px] font-semibold mb-0.5"
                        style={{ color: msg.color }}
                      >
                        {msg.displayName}
                      </p>
                    )}
                    <p className="text-xs whitespace-pre-wrap break-words">
                      {msg.text}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-ys-border p-3">
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
              placeholder="Message the other players..."
              rows={2}
              className="flex-1 resize-none rounded-lg border border-ys-border bg-ys-text/5 px-3 py-2 text-xs text-ys-text placeholder:text-ys-muted focus:border-ys-muted focus:ring-1 focus:ring-ys-accent outline-none"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="self-end px-3 py-2 bg-ys-text text-ys-bg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-all"
            >
              <DynamicIcon name="Send" className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
