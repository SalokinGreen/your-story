"use client";

import {
  StoryData,
  Stat,
  Resource,
  InventoryItem,
  StoryLore,
  Relationship,
  AGMTState,
  CustomTable,
  Variable,
  NumberVariable,
  BooleanVariable,
  StringVariable,
  ListVariable,
  Ability,
  AbilityCost,
  AbilityGrade,
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
        <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <DynamicIcon name="Edit3" className="w-6 h-6" /> Author Notes
        </h4>
        <textarea
          value={localAuthorNotes}
          onChange={(e) => {
            setLocalAuthorNotes(e.target.value);
            onUpdate({ author_notes: e.target.value });
          }}
          placeholder="Add notes for the adventure creator or AI storyteller (these notes guide the narrative direction)..."
          className="w-full h-32 px-4 py-3 bg-blue-900/20 border border-blue-700/40 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
        />
        <p className="mt-2 text-xs text-blue-300/50">
          <DynamicIcon name="Lightbulb" className="w-3 h-3 inline mr-1" /> These
          notes help guide the AI in maintaining story consistency and tone
        </p>
      </div>

      {/* Memory Entries (Editable) */}
      <div>
        <h4 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
          <DynamicIcon name="Brain" className="w-6 h-6" /> Memory Entries (
          {localMemory.length})
        </h4>
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Add new memory entry..."
              value={newMemoryEntry}
              onChange={(e) => setNewMemoryEntry(e.target.value)}
              className="flex-1 px-3 py-2 bg-blue-900/20 border border-blue-700/40 rounded text-white"
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
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded"
            >
              Add
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto space-y-2">
            {localMemory.map((entry, index) => (
              <div
                key={index}
                className="p-3 bg-blue-900/20 rounded text-sm text-blue-200 flex justify-between items-center"
              >
                <span className="pr-2 flex-1">{getMemoryContent(entry)}</span>
                <button
                  onClick={() => {
                    const updated = localMemory.filter((_, i) => i !== index);
                    setLocalMemory(updated);
                    onUpdate({ memory: updated });
                  }}
                  className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded"
                >
                  Remove
                </button>
              </div>
            ))}
            {localMemory.length === 0 && (
              <p className="text-xs text-blue-300/50 italic">
                No memory entries yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

