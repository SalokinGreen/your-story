"use client";

/**
 * The conversation half of the creator. Talking to the Designer is the primary
 * way adventures get built; the inspector beside it is for touch-ups.
 */

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { DynamicIcon } from "@/app/components/DynamicIcon";
import { DESIGNER_SUGGESTIONS } from "@/app/misc/designer_ai";
import { DesignerMessage } from "./useDesignerSession";

interface DesignerChatProps {
  messages: DesignerMessage[];
  loading: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  /** Show starter prompts only while the adventure is still blank. */
  showSuggestions: boolean;
}

export default function DesignerChat({
  messages,
  loading,
  onSend,
  onStop,
  showSuggestions,
}: DesignerChatProps) {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const submit = (text: string) => {
    if (!text.trim() || loading) return;
    onSend(text);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(input);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-5">
        {messages.map((message) =>
          message.role === "user" ? (
            <div key={message.id} className="flex justify-end">
              <div className="max-w-[85%] bg-purple-600/25 border border-purple-400/25 rounded-2xl rounded-br-md px-4 py-2.5">
                <p className="text-sm text-white whitespace-pre-wrap">
                  {message.content}
                </p>
              </div>
            </div>
          ) : (
            <div key={message.id} className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-linear-to-br from-purple-500 to-pink-600 flex items-center justify-center shrink-0 mt-0.5">
                <DynamicIcon name="Feather" className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                {message.pending && !message.content ? (
                  <div className="flex items-center gap-2 text-white/40 text-sm">
                    <span className="flex gap-1">
                      {[0, 150, 300].map((delay) => (
                        <span
                          key={delay}
                          className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce"
                          style={{ animationDelay: `${delay}ms` }}
                        />
                      ))}
                    </span>
                    thinking
                  </div>
                ) : (
                  <div
                    className={`prose prose-invert prose-sm max-w-none prose-p:my-2 prose-headings:mt-3 prose-headings:mb-1.5 prose-ul:my-2 prose-li:my-0.5 ${
                      message.error ? "text-red-300" : "text-white/85"
                    }`}
                  >
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                )}

                {message.changes && message.changes.length > 0 && (
                  <div className="mt-2.5 space-y-1">
                    {message.changes.map((change, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-2 text-xs text-emerald-300/75"
                      >
                        <DynamicIcon
                          name="Check"
                          className="w-3 h-3 shrink-0 mt-0.5"
                        />
                        <span>{change}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ),
        )}

        {showSuggestions && messages.length <= 1 && !loading && (
          <div className="flex flex-wrap gap-2 pt-2 pl-10">
            {DESIGNER_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => submit(suggestion)}
                className="px-3 py-1.5 rounded-full border border-white/12 text-xs text-white/60 hover:text-white hover:border-purple-400/50 hover:bg-purple-500/10 transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        <div ref={endRef} />
      </div>

      <div className="shrink-0 border-t border-white/10 p-3">
        <div className="flex items-end gap-2 bg-black/30 border border-white/10 rounded-2xl px-3 py-2 focus-within:border-purple-400/50 transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
            }}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Talk through the adventure…"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 resize-none focus:outline-none py-1.5 max-h-50"
          />
          {loading ? (
            <button
              onClick={onStop}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/15 text-white/70 transition-colors shrink-0"
              title="Stop"
            >
              <DynamicIcon name="Square" className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => submit(input)}
              disabled={!input.trim()}
              className="p-2 rounded-xl bg-linear-to-br from-purple-600 to-pink-600 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:from-purple-500 hover:to-pink-500 transition-all shrink-0"
              title="Send"
            >
              <DynamicIcon name="ArrowUp" className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
