"use client";

import {
  StoryData,
  StoryLore,
  AGMTState,
  CustomTable,
  MemoryEntry,
  getMemoryContent,
  NPC,
  NPCStatus,
  NPCAttitude,
  Adventure,
} from "../../misc/structs";
import { useState, useEffect } from "react";
import { DynamicIcon } from "../../components/DynamicIcon";

export default function StoryMetaEditor({
  memory,
  premise,
  authorNotes,
  onUpdate,
}: {
  memory: (string | MemoryEntry)[];
  premise: string;
  authorNotes?: string;
  onUpdate: (updates: Partial<StoryData>) => void;
}) {
  const [localAuthorNotes, setLocalAuthorNotes] = useState<string>(
    authorNotes || "",
  );
  // Store the full memory array with MemoryEntry objects
  const [localMemory, setLocalMemory] = useState<(string | MemoryEntry)[]>([
    ...memory,
  ]);
  const [newMemoryEntry, setNewMemoryEntry] = useState<string>("");

  return (
    <div className="space-y-6">
      {/* Author Notes */}
      <div>
        <h4 className="text-lg font-bold text-ys-text mb-4 flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-ys-accent/10 ring-1 ring-ys-accent/20">
            <DynamicIcon name="Edit3" className="w-4 h-4 text-ys-accent" />
          </span>
          Author Notes
        </h4>
        <textarea
          value={localAuthorNotes}
          onChange={(e) => {
            setLocalAuthorNotes(e.target.value);
            onUpdate({ author_notes: e.target.value });
          }}
          placeholder="Add notes for the adventure creator or AI storyteller (these notes guide the narrative direction)..."
          className="w-full h-32 px-4 py-3 bg-ys-surface border border-ys-border rounded-xl text-ys-text focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40 resize-none transition-colors"
        />
        <p className="mt-2 text-xs text-ys-muted">
          <DynamicIcon name="Lightbulb" className="w-3 h-3 inline mr-1" /> These
          notes help guide the AI in maintaining story consistency and tone
        </p>
      </div>

      {/* Memory Entries (Editable) */}
      <div>
        <h4 className="text-lg font-bold text-ys-text mb-3 flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-ys-accent/10 ring-1 ring-ys-accent/20">
            <DynamicIcon name="Brain" className="w-4 h-4 text-ys-accent" />
          </span>
          Memory Entries ({localMemory.length})
        </h4>
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Add new memory entry..."
              value={newMemoryEntry}
              onChange={(e) => setNewMemoryEntry(e.target.value)}
              className="flex-1 px-3 py-2 bg-ys-surface border border-ys-border rounded-lg text-ys-text focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40 transition-colors"
            />
            <button
              onClick={() => {
                const trimmed = newMemoryEntry.trim();
                if (!trimmed) return;
                // Create a MemoryEntry with embedded: false to mark for embedding
                const newEntry: MemoryEntry = {
                  content: trimmed,
                  embedded: false,
                };
                const updated = [...localMemory, newEntry];
                setLocalMemory(updated);
                onUpdate({ memory: updated });
                setNewMemoryEntry("");
              }}
              className="px-4 py-2 bg-ys-accent text-ys-on-accent rounded-lg shadow-md shadow-ys-accent/40 transition-all"
            >
              Add
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto space-y-2">
            {localMemory.map((entry, index) => (
              <div
                key={index}
                className="p-3 bg-ys-surface backdrop-blur-md rounded-lg border border-ys-border text-sm text-ys-text flex justify-between items-center"
              >
                <span className="pr-2 flex-1">{getMemoryContent(entry)}</span>
                <button
                  onClick={() => {
                    const updated = localMemory.filter((_, i) => i !== index);
                    setLocalMemory(updated);
                    onUpdate({ memory: updated });
                  }}
                  className="px-2 py-1 bg-ys-danger/10 hover:bg-ys-danger/20 text-ys-danger border border-ys-danger/20 text-xs rounded-lg transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
            {localMemory.length === 0 && (
              <p className="text-xs text-ys-muted italic">
                No memory entries yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

