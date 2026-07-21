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
    active: "bg-blue-500/10 text-blue-300 border border-blue-400/20",
    resolved: "bg-green-500/10 text-green-300 border border-green-400/20",
    abandoned: "bg-white/5 text-blue-300/50 border border-white/10",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-lg font-bold text-white flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-purple-500/10 ring-1 ring-purple-400/20">
            <DynamicIcon name="GitBranch" className="w-4 h-4 text-purple-300" />
          </span>
          Story Threads
        </h4>
        <button
          onClick={addThread}
          className="px-3 py-1.5 bg-linear-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white text-sm font-medium rounded-lg shadow-md shadow-emerald-950/40 transition-all"
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
              className="p-4 bg-white/[0.04] backdrop-blur-xl border border-purple-400/30 rounded-2xl shadow-[0_0_20px_rgba(168,85,247,0.1)]"
            >
              <div className="space-y-3">
                <input
                  type="text"
                  value={editThread?.title || ""}
                  onChange={(e) =>
                    setEditThread({ ...editThread!, title: e.target.value })
                  }
                  placeholder="Thread Title"
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
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
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
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
                    className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
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
                    className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                  >
                    <option value="main">Main</option>
                    <option value="side">Side</option>
                    <option value="background">Background</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={saveEdit}
                    className="px-4 py-2 bg-linear-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white rounded-lg shadow-md shadow-emerald-950/40 transition-all"
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-blue-200 rounded-lg transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              key={thread.id}
              className="p-4 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl flex items-center gap-3 hover:bg-white/[0.05] transition-colors"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 font-medium text-white flex-wrap">
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
                    <span className="px-2 py-0.5 bg-purple-500/10 text-purple-300 border border-purple-400/20 rounded-full text-xs font-bold">
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
                  className="w-7 h-7 sm:w-8 sm:h-8 bg-purple-500/10 hover:bg-purple-500/20 text-purple-200 border border-purple-400/20 rounded-lg flex items-center justify-center transition-colors"
                  title="Edit"
                >
                  <DynamicIcon name="Edit" className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
                <button
                  onClick={() => removeThread(index)}
                  className="w-7 h-7 sm:w-8 sm:h-8 bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-400/20 rounded-lg flex items-center justify-center transition-colors"
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
