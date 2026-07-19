"use client";

import { StoryThread } from "../../misc/structs";
import { useState } from "react";
import { DynamicIcon } from "../../components/DynamicIcon";

const PRIORITY_LABEL: Record<NonNullable<StoryThread["priority"]>, string> = {
  main: "Main",
  side: "Side",
  background: "Background",
};

export default function ThreadsEditor({
  threads,
  onUpdate,
}: {
  threads: StoryThread[];
  onUpdate: (threads: StoryThread[]) => void;
}) {
  const [localThreads, setLocalThreads] = useState([...threads]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editThread, setEditThread] = useState<StoryThread | null>(null);

  const addThread = () => {
    const newThread: StoryThread = {
      id: `thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: "New Thread",
      description: "What's this plotline about?",
      status: "active",
      priority: "side",
      createdAt: Date.now(),
    };
    const updated = [...localThreads, newThread];
    setLocalThreads(updated);
    onUpdate(updated);
  };

  const removeThread = (index: number) => {
    const updated = localThreads.filter((_, i) => i !== index);
    setLocalThreads(updated);
    onUpdate(updated);
  };

  const startEdit = (index: number) => {
    setEditingIndex(index);
    setEditThread({ ...localThreads[index] });
  };

  const saveEdit = () => {
    if (editingIndex !== null && editThread) {
      const updated = [...localThreads];
      updated[editingIndex] = editThread;
      setLocalThreads(updated);
      onUpdate(updated);
      setEditingIndex(null);
      setEditThread(null);
    }
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditThread(null);
  };

  const statusColor: Record<StoryThread["status"], string> = {
    active: "bg-blue-200 dark:bg-blue-800/50 text-blue-800 dark:text-blue-200",
    resolved:
      "bg-green-200 dark:bg-green-800/50 text-green-800 dark:text-green-200",
    abandoned: "bg-blue-800/30 text-blue-300/60",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-lg font-bold text-white flex items-center gap-2">
          <DynamicIcon name="GitBranch" className="w-6 h-6" /> Story Threads
        </h4>
        <button
          onClick={addThread}
          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg"
        >
          + Add Thread
        </button>
      </div>
      <p className="text-xs text-blue-200/60 mb-4">
        Plotlines the GM tracks and can open, update, or resolve on its own
        via tool calls during play. Add one here to seed a thread the GM
        should be aware of, or to correct one it created.
      </p>
      <div className="space-y-3">
        {localThreads.map((thread, index) =>
          editingIndex === index ? (
            <div
              key={thread.id}
              className="p-4 bg-blue-100 dark:bg-blue-900/40 border-2 border-blue-400 rounded-lg"
            >
              <div className="space-y-3">
                <input
                  type="text"
                  value={editThread?.title || ""}
                  onChange={(e) =>
                    setEditThread({ ...editThread!, title: e.target.value })
                  }
                  placeholder="Thread Title"
                  className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                />
                <textarea
                  value={editThread?.description || ""}
                  onChange={(e) =>
                    setEditThread({
                      ...editThread!,
                      description: e.target.value,
                    })
                  }
                  placeholder="Description"
                  className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                  rows={3}
                />
                <div className="flex gap-3">
                  <select
                    value={editThread?.status || "active"}
                    onChange={(e) =>
                      setEditThread({
                        ...editThread!,
                        status: e.target.value as StoryThread["status"],
                      })
                    }
                    className="flex-1 px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                  >
                    <option value="active">Active</option>
                    <option value="resolved">Resolved</option>
                    <option value="abandoned">Abandoned</option>
                  </select>
                  <select
                    value={editThread?.priority || "side"}
                    onChange={(e) =>
                      setEditThread({
                        ...editThread!,
                        priority: e.target
                          .value as StoryThread["priority"],
                      })
                    }
                    className="flex-1 px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                  >
                    <option value="main">Main</option>
                    <option value="side">Side</option>
                    <option value="background">Background</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={saveEdit}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              key={thread.id}
              className="p-4 bg-blue-900/20 rounded-lg flex items-center gap-3"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 font-medium text-white">
                  <DynamicIcon
                    name="GitBranch"
                    className="w-5 h-5 text-purple-400"
                  />
                  {thread.title}
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-bold ${statusColor[thread.status]}`}
                  >
                    {thread.status[0].toUpperCase() + thread.status.slice(1)}
                  </span>
                  {thread.priority && (
                    <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded-full text-xs font-bold">
                      {PRIORITY_LABEL[thread.priority]}
                    </span>
                  )}
                </div>
                <div className="text-sm text-blue-200/60">
                  {thread.description}
                </div>
              </div>
              <div className="flex gap-0.5">
                <button
                  onClick={() => startEdit(index)}
                  className="w-7 h-7 sm:w-8 sm:h-8 bg-yellow-600 hover:bg-yellow-700 text-white rounded flex items-center justify-center"
                  title="Edit"
                >
                  <DynamicIcon name="Edit" className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
                <button
                  onClick={() => removeThread(index)}
                  className="w-7 h-7 sm:w-8 sm:h-8 bg-red-600 hover:bg-red-700 text-white rounded flex items-center justify-center"
                  title="Remove"
                >
                  <DynamicIcon name="Trash2" className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              </div>
            </div>
          ),
        )}
        {localThreads.length === 0 && (
          <p className="text-sm text-blue-200/60">
            No threads yet - the GM will open some as the story develops.
          </p>
        )}
      </div>
    </div>
  );
}
