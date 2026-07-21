"use client";

import { useEffect, useRef, useState } from "react";
import { DynamicIcon } from "./DynamicIcon";
import type { OOCChatMessage } from "@/app/misc/multiplayer/session";

interface OOCChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  messages: OOCChatMessage[];
  myLocalPlayerId: string;
  onSend: (text: string) => void;
  unreadCount: number;
}

// Out-of-character chat between online co-op players. Deliberately separate
// from the GM conversation: messages here never touch StoryData and are
// never sent to the AI - this is players talking to each other, not to the
// GM. Only rendered while an online multiplayer session (netSession) is
// active - see app/story/page.tsx.
export default function OOCChatPanel({
  isOpen,
  onClose,
  onOpen,
  messages,
  myLocalPlayerId,
  onSend,
  unreadCount,
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

  if (!isOpen) {
    return (
      <button
        className="fixed top-1/2 -translate-y-1/2 right-0 z-40 bg-blue-600/90 hover:bg-blue-500 text-white p-2 rounded-l-lg shadow-lg transition-all pointer-events-auto"
        onClick={onOpen}
        title="Open OOC Chat"
      >
        <DynamicIcon name="MessageCircle" className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -left-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <>
      <button
        className="fixed top-1/2 -translate-y-1/2 z-40 bg-blue-600/90 hover:bg-blue-500 text-white p-1.5 rounded-l-lg shadow-lg transition-all pointer-events-auto right-80 sm:right-[380px] md:right-[420px]"
        onClick={onClose}
        title="Close OOC Chat"
      >
        <DynamicIcon name="ChevronRight" className="w-4 h-4" />
      </button>
      <div className="fixed top-14 right-0 z-40 h-[calc(100%-7.5rem)] w-[320px] sm:w-[380px] md:w-[420px] max-w-[85vw] flex flex-col overflow-hidden bg-white/95 dark:bg-gray-900/95 shadow-2xl border-l border-gray-200 dark:border-gray-700 animate-in slide-in-from-right duration-300 pointer-events-auto rounded-bl-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-2 min-w-0">
            <DynamicIcon
              name="MessageCircle"
              className="w-4 h-4 text-blue-500 shrink-0"
            />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 truncate">
              OOC Chat
            </span>
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              (players only, GM can&apos;t see this)
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            title="Close"
          >
            <DynamicIcon name="X" className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-linear-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-950">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-4">
              <DynamicIcon
                name="MessageCircle"
                className="w-8 h-8 text-blue-400/50 mb-2"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
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
                        ? "rounded-tr-sm bg-blue-600 text-white"
                        : "rounded-tl-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700"
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
              placeholder="Message the other players..."
              rows={2}
              className="flex-1 resize-none rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="self-end px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              <DynamicIcon name="Send" className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
