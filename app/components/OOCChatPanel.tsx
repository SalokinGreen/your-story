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
        className="fixed top-1/2 -translate-y-1/2 right-0 z-40 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white p-2 rounded-l-lg shadow-md shadow-purple-950/40 transition-all pointer-events-auto"
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
        className="fixed top-1/2 -translate-y-1/2 z-40 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white p-1.5 rounded-l-lg shadow-md shadow-purple-950/40 transition-all pointer-events-auto right-80 sm:right-[380px] md:right-[420px]"
        onClick={onClose}
        title="Close OOC Chat"
      >
        <DynamicIcon name="ChevronRight" className="w-4 h-4" />
      </button>
      <div className="fixed top-14 right-0 z-40 h-[calc(100%-7.5rem)] w-[320px] sm:w-[380px] md:w-[420px] max-w-[85vw] flex flex-col overflow-hidden bg-[#0d1829]/95 backdrop-blur-2xl shadow-2xl shadow-black/50 border-l border-white/10 animate-in slide-in-from-right duration-300 pointer-events-auto rounded-bl-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.02] px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-2 min-w-0">
            <DynamicIcon
              name="MessageCircle"
              className="w-4 h-4 text-blue-400 shrink-0"
            />
            <span className="text-sm font-semibold text-blue-100 truncate">
              OOC Chat
            </span>
            <span className="text-[10px] text-blue-300/50">
              (players only, GM can&apos;t see this)
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-blue-300/60 hover:bg-white/10 hover:text-white transition-colors"
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
                className="w-8 h-8 text-blue-400/50 mb-2"
              />
              <p className="text-xs text-blue-300/60">
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
                        ? "rounded-tr-sm bg-linear-to-r from-purple-600 to-blue-600 text-white shadow-md shadow-purple-950/40"
                        : "rounded-tl-sm bg-white/5 text-blue-100 border border-white/10"
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
        <div className="border-t border-white/10 bg-white/[0.02] p-3">
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
              className="flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder-blue-300/40 focus:border-purple-400/50 focus:ring-1 focus:ring-purple-500 outline-none"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="self-end px-3 py-2 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:bg-white/5 disabled:bg-none disabled:cursor-not-allowed text-white rounded-lg shadow-md shadow-purple-950/40 transition-all"
            >
              <DynamicIcon name="Send" className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
