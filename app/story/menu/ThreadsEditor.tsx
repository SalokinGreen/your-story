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
    active: "bg-ys-accent/10 text-ys-accent border border-ys-accent/20",
    resolved: "bg-ys-success/10 text-ys-success border border-ys-success/20",
    abandoned: "bg-ys-surface text-ys-muted border border-ys-border",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-lg font-bold text-ys-text flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-ys-accent/10 ring-1 ring-ys-accent/20">
            <DynamicIcon name="GitBranch" className="w-4 h-4 text-ys-accent" />
          </span>
          Story Threads
        </h4>
        <button
          onClick={addThread}
          className="px-3 py-1.5 bg-ys-success/15 text-ys-success text-sm font-medium rounded-lg transition-all border border-ys-success/40"
        >
          + Add Thread
        </button>
      </div>
      <p className="text-xs text-ys-muted mb-4">
        Plotlines the GM tracks and can open, update, or resolve on its own
        via tool calls during play. Add one here to seed a thread the GM
        should be aware of, or to correct one it created.
      </p>
      <div className="space-y-3">
        {localThreads.map((thread, index) =>
          editingIndex === index ? (
            <div
              key={thread.id}
              className="p-4 bg-ys-surface backdrop-blur-xl border border-ys-accent/30 rounded-2xl shadow-[0_0_20px_color-mix(in_srgb,var(--ys-accent)_10%,transparent)]"
            >
              <div className="space-y-3">
                <input
                  type="text"
                  value={editThread?.title || ""}
                  onChange={(e) =>
                    setEditThread({ ...editThread!, title: e.target.value })
                  }
                  placeholder="Thread Title"
                  className="w-full px-3 py-2 bg-ys-surface border border-ys-border rounded-lg text-ys-text focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40 transition-colors"
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
                  className="w-full px-3 py-2 bg-ys-surface border border-ys-border rounded-lg text-ys-text focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40 transition-colors"
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
                    className="flex-1 px-3 py-2 bg-ys-surface border border-ys-border rounded-lg text-ys-text focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40 transition-colors"
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
                    className="flex-1 px-3 py-2 bg-ys-surface border border-ys-border rounded-lg text-ys-text focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40 transition-colors"
                  >
                    <option value="main">Main</option>
                    <option value="side">Side</option>
                    <option value="background">Background</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={saveEdit}
                    className="px-4 py-2 bg-ys-success/15 text-ys-success rounded-lg transition-all border border-ys-success/40"
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="px-4 py-2 bg-ys-surface hover:bg-ys-surface-2 border border-ys-border text-ys-text rounded-lg transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              key={thread.id}
              className="p-4 bg-ys-surface backdrop-blur-md border border-ys-border rounded-xl flex items-center gap-3 hover:bg-ys-surface-2 transition-colors"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 font-medium text-ys-text flex-wrap">
                  <DynamicIcon
                    name="GitBranch"
                    className="w-5 h-5 text-ys-accent"
                  />
                  {thread.title}
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-bold ${statusColor[thread.status]}`}
                  >
                    {thread.status[0].toUpperCase() + thread.status.slice(1)}
                  </span>
                  {thread.priority && (
                    <span className="px-2 py-0.5 bg-ys-accent/10 text-ys-accent border border-ys-accent/20 rounded-full text-xs font-bold">
                      {PRIORITY_LABEL[thread.priority]}
                    </span>
                  )}
                </div>
                <div className="text-sm text-ys-muted">
                  {thread.description}
                </div>
              </div>
              <div className="flex gap-0.5">
                <button
                  onClick={() => startEdit(index)}
                  className="w-7 h-7 sm:w-8 sm:h-8 bg-ys-accent/10 hover:bg-ys-accent/20 text-ys-text border border-ys-accent/20 rounded-lg flex items-center justify-center transition-colors"
                  title="Edit"
                >
                  <DynamicIcon name="Edit" className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
                <button
                  onClick={() => removeThread(index)}
                  className="w-7 h-7 sm:w-8 sm:h-8 bg-ys-danger/10 hover:bg-ys-danger/20 text-ys-danger border border-ys-danger/20 rounded-lg flex items-center justify-center transition-colors"
                  title="Remove"
                >
                  <DynamicIcon name="Trash2" className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              </div>
            </div>
          ),
        )}
        {localThreads.length === 0 && (
          <p className="text-sm text-ys-muted">
            No threads yet - the GM will open some as the story develops.
          </p>
        )}
      </div>
    </div>
  );
}
