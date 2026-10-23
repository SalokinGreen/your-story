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
import { useNotification } from "../../misc/NotificationContext";
import { DynamicIcon } from "../../components/DynamicIcon";
import { StoredPortrait } from "../../components/StoryImage";
import { IconPicker } from "../../components/IconPicker";

const STATUS_OPTIONS: { value: NPCStatus; label: string; icon: string }[] = [
  { value: "alive", label: "Alive", icon: "Heart" },
  { value: "dead", label: "Dead", icon: "Skull" },
  { value: "missing", label: "Missing", icon: "HelpCircle" },
  { value: "unknown", label: "Unknown", icon: "Eye" },
  { value: "departed", label: "Departed", icon: "LogOut" },
];

const ATTITUDE_OPTIONS: {
  value: NPCAttitude;
  label: string;
  icon: string;
  color: string;
}[] = [
  { value: "hostile", label: "Hostile", icon: "Swords", color: "text-ys-danger" },
  {
    value: "unfriendly",
    label: "Unfriendly",
    icon: "Frown",
    color: "text-ys-warning",
  },
  { value: "neutral", label: "Neutral", icon: "Minus", color: "text-ys-muted" },
  {
    value: "friendly",
    label: "Friendly",
    icon: "Smile",
    color: "text-ys-success",
  },
  { value: "allied", label: "Allied", icon: "Shield", color: "text-ys-accent" },
];

export default function NPCEditor({
  npcs,
  onUpdate,
}: {
  npcs: NPC[];
  onUpdate: (npcs: NPC[]) => void;
}) {
  const { addNotification } = useNotification();
  const [localNPCs, setLocalNPCs] = useState<NPC[]>([...npcs]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNPC, setEditNPC] = useState<Partial<NPC>>({});
  const [showIconPicker, setShowIconPicker] = useState(false);

  const addNPC = () => {
    const newNPC: NPC = {
      id: crypto.randomUUID(),
      name: "New Character",
      description: "",
      role: "",
      status: "alive",
      relationship: "",
      attitude: "neutral",
      symbol: "User",
      createdAt: Date.now(),
    };
    const updated = [...localNPCs, newNPC];
    setLocalNPCs(updated);
    onUpdate(updated);
    // Immediately start editing the new NPC
    setEditingId(newNPC.id);
    setEditNPC(newNPC);
  };

  const removeNPC = (id: string) => {
    const updated = localNPCs.filter((n) => n.id !== id);
    setLocalNPCs(updated);
    onUpdate(updated);
    addNotification("Character removed", "info");
  };

  const startEdit = (npc: NPC) => {
    setEditingId(npc.id);
    setEditNPC({ ...npc });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditNPC({});
    setShowIconPicker(false);
  };

  const saveEdit = () => {
    if (editingId && editNPC.name) {
      const updated = localNPCs.map((n) =>
        n.id === editingId ? ({ ...n, ...editNPC } as NPC) : n,
      );
      setLocalNPCs(updated);
      onUpdate(updated);
      setEditingId(null);
      setEditNPC({});
      setShowIconPicker(false);
      addNotification("Character updated!", "success");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-bold text-ys-text mb-3 flex items-center gap-2">
          <DynamicIcon name="Users" className="w-6 h-6 text-ys-accent" /> NPCs (
          {localNPCs.length})
        </h4>
        <button
          onClick={addNPC}
          className="px-3 py-1.5 bg-ys-accent text-ys-on-accent text-sm font-medium rounded-lg shadow-md shadow-ys-accent/40 transition-all flex items-center gap-1"
        >
          <DynamicIcon name="Plus" className="w-4 h-4" />
          Add Character
        </button>
      </div>

      <div className="space-y-3">
        {localNPCs.map((npc) =>
          editingId === npc.id ? (
            <div
              key={npc.id}
              className="p-4 bg-ys-surface backdrop-blur-xl border border-ys-accent/30 rounded-2xl shadow-[0_0_20px_color-mix(in_srgb,var(--ys-accent)_10%,transparent)] space-y-4"
            >
              {/* Name and Icon */}
              <div className="flex gap-3">
                <div className="shrink-0">
                  <button
                    onClick={() => setShowIconPicker(!showIconPicker)}
                    className="w-14 h-14 rounded-xl bg-ys-accent/10 border border-ys-accent/20 flex items-center justify-center hover:bg-ys-accent/20 transition-colors"
                    title="Change icon"
                  >
                    <DynamicIcon
                      name={editNPC.symbol || "User"}
                      className="w-8 h-8 text-ys-accent"
                    />
                  </button>
                  {showIconPicker && (
                    <div className="absolute mt-2 z-50">
                      <IconPicker
                        value={editNPC.symbol || "User"}
                        onChange={(icon) => {
                          setEditNPC({ ...editNPC, symbol: icon });
                          setShowIconPicker(false);
                        }}
                      />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <input
                    type="text"
                    value={editNPC.name || ""}
                    onChange={(e) =>
                      setEditNPC({ ...editNPC, name: e.target.value })
                    }
                    placeholder="Character Name"
                    className="w-full px-3 py-2 bg-ys-surface border border-ys-border rounded-lg text-ys-text font-semibold text-lg focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40 transition-colors"
                  />
                  <input
                    type="text"
                    value={editNPC.role || ""}
                    onChange={(e) =>
                      setEditNPC({ ...editNPC, role: e.target.value })
                    }
                    placeholder="Role (e.g., Tavern Owner, Quest Giver, Rival)"
                    className="w-full px-3 py-2 mt-2 bg-ys-surface border border-ys-border rounded-lg text-ys-text text-sm focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40 transition-colors"
                  />
                </div>
              </div>

              {/* Status and Attitude */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-ys-text mb-1">
                    Status
                  </label>
                  <select
                    value={editNPC.status || "alive"}
                    onChange={(e) =>
                      setEditNPC({
                        ...editNPC,
                        status: e.target.value as NPCStatus,
                      })
                    }
                    className="w-full px-3 py-2 bg-ys-surface border border-ys-border rounded-lg text-ys-text focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40 transition-colors"
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-ys-text mb-1">
                    Attitude
                  </label>
                  <select
                    value={editNPC.attitude || "neutral"}
                    onChange={(e) =>
                      setEditNPC({
                        ...editNPC,
                        attitude: e.target.value as NPCAttitude,
                      })
                    }
                    className="w-full px-3 py-2 bg-ys-surface border border-ys-border rounded-lg text-ys-text focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40 transition-colors"
                  >
                    {ATTITUDE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Relationship (custom text) */}
              <div>
                <label className="block text-sm font-semibold text-ys-text mb-1">
                  Relationship{" "}
                  <span className="font-normal text-ys-accent/60">
                    (your connection to them)
                  </span>
                </label>
                <input
                  type="text"
                  value={editNPC.relationship || ""}
                  onChange={(e) =>
                    setEditNPC({ ...editNPC, relationship: e.target.value })
                  }
                  placeholder='e.g., "Trusted mentor", "Bitter rival", "Old friend from academy"'
                  className="w-full px-3 py-2 bg-ys-surface border border-ys-border rounded-lg text-ys-text focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40 transition-colors"
                />
              </div>

              {/* Faction */}
              <div>
                <label className="block text-sm font-semibold text-ys-text mb-1">
                  Faction
                </label>
                <input
                  type="text"
                  value={editNPC.faction || ""}
                  onChange={(e) =>
                    setEditNPC({ ...editNPC, faction: e.target.value })
                  }
                  placeholder="Organization, guild, or group affiliation"
                  className="w-full px-3 py-2 bg-ys-surface border border-ys-border rounded-lg text-ys-text focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40 transition-colors"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-ys-text mb-1">
                  Description
                </label>
                <textarea
                  value={editNPC.description || ""}
                  onChange={(e) =>
                    setEditNPC({ ...editNPC, description: e.target.value })
                  }
                  placeholder="Physical appearance, personality, motivations..."
                  className="w-full h-24 px-3 py-2 bg-ys-surface border border-ys-border rounded-lg text-ys-text resize-none focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40 transition-colors"
                />
              </div>

              {/* Last Seen */}
              <div>
                <label className="block text-sm font-semibold text-ys-text mb-1">
                  Last Seen
                </label>
                <input
                  type="text"
                  value={editNPC.lastSeen || ""}
                  onChange={(e) =>
                    setEditNPC({ ...editNPC, lastSeen: e.target.value })
                  }
                  placeholder="Location or circumstance"
                  className="w-full px-3 py-2 bg-ys-surface border border-ys-border rounded-lg text-ys-text focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40 transition-colors"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-semibold text-ys-text mb-1">
                  Your Notes
                </label>
                <textarea
                  value={editNPC.notes || ""}
                  onChange={(e) =>
                    setEditNPC({ ...editNPC, notes: e.target.value })
                  }
                  placeholder="Personal notes about this character..."
                  className="w-full h-20 px-3 py-2 bg-ys-surface border border-ys-border rounded-lg text-ys-text resize-none focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40 transition-colors"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={saveEdit}
                  disabled={!editNPC.name}
                  className="px-4 py-2 bg-ys-success/15 disabled:text-ys-muted text-ys-success rounded-lg transition-all flex items-center gap-1 border border-ys-success/40"
                >
                  <DynamicIcon name="Save" className="w-4 h-4" />
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
          ) : (
            <div
              key={npc.id}
              className="flex items-start gap-3 p-4 bg-ys-surface backdrop-blur-md rounded-xl border border-ys-border hover:border-ys-accent/20 hover:bg-ys-surface-2 transition-colors"
            >
              <div className="shrink-0">
                <StoredPortrait
                  imageId={npc.portraitImageId}
                  alt={npc.name}
                  className="w-12 h-12 rounded-lg object-cover border border-ys-accent/20"
                >
                  {npc.custom_symbol_url ? (
                    <img
                      src={npc.custom_symbol_url}
                      alt={npc.name}
                      className="w-12 h-12 rounded-lg object-cover border border-ys-accent/20"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-ys-accent/10 border border-ys-accent/20 flex items-center justify-center">
                      <DynamicIcon
                        name={npc.symbol || "User"}
                        className="w-6 h-6 text-ys-accent"
                      />
                    </div>
                  )}
                </StoredPortrait>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-bold text-ys-text">{npc.name}</span>
                  {/* Attitude badge */}
                  {npc.attitude && (
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        ATTITUDE_OPTIONS.find((a) => a.value === npc.attitude)
                          ?.color || "text-ys-muted"
                      } bg-ys-surface`}
                    >
                      {
                        ATTITUDE_OPTIONS.find((a) => a.value === npc.attitude)
                          ?.label
                      }
                    </span>
                  )}
                  {/* Status badge */}
                  {npc.status && npc.status !== "alive" && (
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        npc.status === "dead"
                          ? "text-ys-muted bg-ys-surface-2"
                          : npc.status === "missing"
                            ? "text-ys-warning bg-ys-warning/20"
                            : "text-ys-accent bg-ys-accent/20"
                      }`}
                    >
                      {
                        STATUS_OPTIONS.find((s) => s.value === npc.status)
                          ?.label
                      }
                    </span>
                  )}
                </div>
                {npc.role && (
                  <p className="text-xs text-ys-accent/60 mb-1">{npc.role}</p>
                )}
                {npc.relationship && (
                  <p className="text-sm text-ys-text/80 italic">
                    "{npc.relationship}"
                  </p>
                )}
                {npc.faction && (
                  <p className="text-xs text-ys-accent/60 mt-1">
                    <DynamicIcon name="Flag" className="w-3 h-3 inline mr-1" />
                    {npc.faction}
                  </p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => startEdit(npc)}
                  className="px-3 py-1 bg-ys-accent/10 hover:bg-ys-accent/20 text-ys-text border border-ys-accent/20 rounded-lg transition-colors"
                  title="Edit"
                >
                  <DynamicIcon name="Edit" className="w-4 h-4" />
                </button>
                <button
                  onClick={() => removeNPC(npc.id)}
                  className="px-3 py-1 bg-ys-danger/10 hover:bg-ys-danger/20 text-ys-danger border border-ys-danger/20 rounded-lg transition-colors"
                  title="Remove"
                >
                  <DynamicIcon name="Trash2" className="w-4 h-4" />
                </button>
              </div>
            </div>
          ),
        )}

        {localNPCs.length === 0 && (
          <div className="p-8 text-center rounded-2xl bg-ys-surface border-2 border-dashed border-ys-accent/20">
            <DynamicIcon
              name="Users"
              className="w-12 h-12 text-ys-accent/30 mx-auto mb-3"
            />
            <p className="text-sm text-ys-accent/50">
              No characters tracked yet. Add NPCs you encounter to keep track of
              relationships and story connections.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
