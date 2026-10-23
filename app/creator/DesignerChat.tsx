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
  /** Opens the notes-library picker. */
  onImport: () => void;
}

export default function DesignerChat({
  messages,
  loading,
  onSend,
  onStop,
  showSuggestions,
  onImport,
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
              <div className="max-w-[85%] bg-ys-accent/25 border border-ys-accent rounded-2xl rounded-br-md px-4 py-2.5">
                <p className="text-sm text-ys-text whitespace-pre-wrap">
                  {message.content}
                </p>
              </div>
            </div>
          ) : (
            <div key={message.id} className="flex gap-3">
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-ys-accent text-ys-on-accent">
                <DynamicIcon name="Feather" className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                {message.pending && !message.content ? (
                  <div className="flex items-center gap-2 text-ys-muted text-sm">
                    <span className="flex gap-1">
                      {[0, 150, 300].map((delay) => (
                        <span
                          key={delay}
                          className="w-1.5 h-1.5 rounded-full bg-ys-muted animate-bounce"
                          style={{ animationDelay: `${delay}ms` }}
                        />
                      ))}
                    </span>
                    thinking
                  </div>
                ) : (
                  <div
                    className={`prose prose-sm max-w-none prose-p:my-2 prose-headings:mt-3 prose-headings:mb-1.5 prose-ul:my-2 prose-li:my-0.5 ${
                      message.error ? "text-ys-danger" : "text-ys-text"
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
                        className="flex items-start gap-2 text-xs text-ys-success"
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
          <div className="pt-2 pl-10 space-y-3">
            <div className="flex flex-wrap gap-2">
              {DESIGNER_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => submit(suggestion)}
                  className="px-3 py-1.5 rounded-full border border-ys-border text-xs text-ys-muted hover:text-ys-text hover:border-ys-accent hover:bg-ys-accent/15 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            {/* Authors who imported a rulebook or wrote notes elsewhere start
                from that material rather than from a blank premise. */}
            <button
              onClick={onImport}
              className="w-full text-left px-3 py-2.5 rounded-xl border border-ys-border hover:border-ys-accent hover:bg-ys-accent/15 transition-colors flex items-center gap-2.5"
            >
              <DynamicIcon
                name="Library"
                className="w-4 h-4 text-ys-accent shrink-0"
              />
              <span className="min-w-0">
                <span className="block text-xs text-ys-muted">
                  Already have notes? Import them
                </span>
                <span className="block text-[11px] text-ys-muted">
                  Pull rules, lore, character sheets or tables out of your notes
                  library and build from those.
                </span>
              </span>
            </button>
          </div>
        )}

        <div ref={endRef} />
      </div>

      <div className="shrink-0 border-t border-ys-border p-3">
        <div className="flex items-end gap-2 bg-ys-surface border border-ys-border rounded-2xl px-3 py-2 focus-within:border-ys-accent transition-colors">
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
            className="flex-1 bg-transparent text-sm text-ys-text placeholder:text-ys-muted resize-none focus:outline-none py-1.5 max-h-50"
          />
          {loading ? (
            <button
              onClick={onStop}
              className="p-2 rounded-xl bg-ys-surface-2 hover:bg-ys-border text-ys-muted transition-colors shrink-0"
              title="Stop"
            >
              <DynamicIcon name="Square" className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => submit(input)}
              disabled={!input.trim()}
              className="p-2 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0 bg-ys-accent text-ys-on-accent hover:opacity-90"
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
