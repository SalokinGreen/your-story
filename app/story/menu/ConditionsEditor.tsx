"use client";

import {
  StoryData,
  Stat,
  Resource,
  InventoryItem,
  Achievement,
  StoryLore,
  Quest,
  Relationship,
  Condition,
  ConditionTier,
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
import { useNotification } from "../../misc/NotificationContext";
import { DynamicIcon } from "../../components/DynamicIcon";

export default function ConditionsEditor({
  conditions,
  stats,
  onUpdate,
}: {
  conditions: Condition[];
  stats: Stat[];
  onUpdate: (conditions: Condition[]) => void;
}) {
  const { addNotification } = useNotification();
  const [localConditions, setLocalConditions] = useState<Condition[]>([
    ...conditions,
  ]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editCondition, setEditCondition] = useState<Partial<Condition>>({});

  // Tier descriptions and colors
  const tierConfig: Record<
    ConditionTier,
    { label: string; color: string; bgColor: string }
  > = {
    1: {
      label: "I - Minor",
      color: "text-yellow-300",
      bgColor: "bg-yellow-900/30",
    },
    2: {
      label: "II - Moderate",
      color: "text-orange-300",
      bgColor: "bg-orange-900/30",
    },
    3: {
      label: "III - Serious",
      color: "text-orange-400",
      bgColor: "bg-orange-900/40",
    },
    4: {
      label: "IV - Severe",
      color: "text-red-400",
      bgColor: "bg-red-900/40",
    },
    5: {
      label: "V - Critical",
      color: "text-red-500",
      bgColor: "bg-red-900/50",
    },
    6: {
      label: "VI - Permanent",
      color: "text-purple-400",
      bgColor: "bg-purple-900/50",
    },
  };

  const addCondition = () => {
    const newCondition: Condition = {
      id: crypto.randomUUID(),
      name: "New Condition",
      tier: 1,
      description: "Describe this condition...",
      affects: [],
      affectsAll: false,
      permanent: false,
      createdAt: Date.now(),
    };
    const updated = [...localConditions, newCondition];
    setLocalConditions(updated);
    onUpdate(updated);
  };

  const removeCondition = (index: number) => {
    const updated = localConditions.filter((_, i) => i !== index);
    setLocalConditions(updated);
    onUpdate(updated);
  };

  const startEdit = (index: number) => {
    setEditingIndex(index);
    setEditCondition({ ...localConditions[index] });
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditCondition({});
  };

  const saveEdit = () => {
    if (
      editingIndex !== null &&
      editCondition.name &&
      editCondition.description
    ) {
      const updated = [...localConditions];
      updated[editingIndex] = {
        ...localConditions[editingIndex],
        ...editCondition,
        permanent: editCondition.tier === 6 ? true : editCondition.permanent,
      } as Condition;
      setLocalConditions(updated);
      onUpdate(updated);
      setEditingIndex(null);
      setEditCondition({});
      addNotification("Condition updated!", "success");
    }
  };

  const toggleAffectedStat = (statName: string) => {
    const currentAffects = editCondition.affects || [];
    if (currentAffects.includes(statName)) {
      setEditCondition({
        ...editCondition,
        affects: currentAffects.filter((s) => s !== statName),
      });
    } else {
      setEditCondition({
        ...editCondition,
        affects: [...currentAffects, statName],
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
          <DynamicIcon name="HeartPulse" className="w-6 h-6" /> Conditions (
          {localConditions.length})
        </h4>
        <button
          onClick={addCondition}
          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg"
        >
          + Add Condition
        </button>
      </div>

      {/* Info box */}
      <div className="p-3 bg-blue-900/30 rounded-lg border border-blue-700/40 text-sm text-blue-200/70">
        <p>
          Conditions are afflictions, injuries, or status effects that penalize
          skill checks. Tiers I-VI indicate severity, with Tier VI being
          permanent.
        </p>
      </div>

      <div className="space-y-3">
        {localConditions.map((condition, index) =>
          editingIndex === index ? (
            <div
              key={condition.id}
              className="p-4 bg-red-100 dark:bg-red-900/40 border-2 border-red-400 rounded-lg"
            >
              <div className="space-y-3">
                <input
                  type="text"
                  value={editCondition.name || ""}
                  onChange={(e) =>
                    setEditCondition({
                      ...editCondition,
                      name: e.target.value,
                    })
                  }
                  placeholder="Condition name (e.g., Broken Leg, Poisoned)"
                  className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white font-semibold"
                />

                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-2">
                    Severity Tier
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {([1, 2, 3, 4, 5, 6] as ConditionTier[]).map((tier) => (
                      <button
                        key={tier}
                        onClick={() =>
                          setEditCondition({
                            ...editCondition,
                            tier,
                            permanent:
                              tier === 6 ? true : editCondition.permanent,
                          })
                        }
                        className={`px-2 py-1 text-xs sm:text-sm rounded transition-colors ${
                          editCondition.tier === tier
                            ? `${tierConfig[tier].bgColor} ${tierConfig[tier].color} ring-2 ring-white/50`
                            : "bg-blue-900/30 text-blue-200/60 hover:bg-blue-800/40"
                        }`}
                      >
                        {tierConfig[tier].label}
                      </button>
                    ))}
                  </div>
                </div>

                <textarea
                  value={editCondition.description || ""}
                  onChange={(e) =>
                    setEditCondition({
                      ...editCondition,
                      description: e.target.value,
                    })
                  }
                  placeholder="Describe the condition and its effects..."
                  className="w-full h-20 px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white resize-none"
                />

                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-2">
                    Affected Stats
                  </label>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="flex items-center gap-2 text-sm text-blue-200">
                      <input
                        type="checkbox"
                        checked={editCondition.affectsAll || false}
                        onChange={(e) =>
                          setEditCondition({
                            ...editCondition,
                            affectsAll: e.target.checked,
                            affects: e.target.checked
                              ? []
                              : editCondition.affects,
                          })
                        }
                        className="rounded border-blue-700/40 bg-blue-900/30 text-purple-600 focus:ring-purple-500"
                      />
                      <span className="text-orange-300">
                        Affects ALL rolls (severe debuff)
                      </span>
                    </label>
                  </div>
                  {!editCondition.affectsAll && stats.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {stats.map((stat) => (
                        <button
                          key={stat.name}
                          onClick={() => toggleAffectedStat(stat.name)}
                          className={`px-2 py-1 text-xs rounded transition-colors ${
                            editCondition.affects?.includes(stat.name)
                              ? "bg-red-600 text-white"
                              : "bg-blue-900/30 text-blue-200/60 hover:bg-blue-800/40"
                          }`}
                        >
                          {stat.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {!editCondition.affectsAll && stats.length === 0 && (
                    <p className="text-xs text-blue-300/50">
                      No stats defined. Add stats in the Stats tab first.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-2">
                    Source (optional)
                  </label>
                  <input
                    type="text"
                    value={editCondition.source || ""}
                    onChange={(e) =>
                      setEditCondition({
                        ...editCondition,
                        source: e.target.value,
                      })
                    }
                    placeholder="How was this condition acquired?"
                    className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                  />
                </div>

                {editCondition.tier !== 6 && (
                  <label className="flex items-center gap-2 text-sm text-blue-200">
                    <input
                      type="checkbox"
                      checked={editCondition.permanent || false}
                      onChange={(e) =>
                        setEditCondition({
                          ...editCondition,
                          permanent: e.target.checked,
                        })
                      }
                      className="rounded border-blue-700/40 bg-blue-900/30 text-purple-600 focus:ring-purple-500"
                    />
                    Mark as Permanent (cannot be naturally healed)
                  </label>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={saveEdit}
                    disabled={!editCondition.name || !editCondition.description}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded"
                  >
                    <DynamicIcon
                      name="Save"
                      className="inline-block w-4 h-4 mr-1"
                    />
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              key={condition.id}
              className={`flex items-start gap-3 p-4 rounded-lg border ${
                tierConfig[condition.tier].bgColor
              } border-red-800/40`}
            >
              <div className="shrink-0">
                <DynamicIcon
                  name={condition.affectsAll ? "AlertTriangle" : "HeartCrack"}
                  className={`w-8 h-8 ${tierConfig[condition.tier].color}`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-white flex items-center gap-2 flex-wrap mb-1">
                  <span>{condition.name}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      tierConfig[condition.tier].bgColor
                    } ${tierConfig[condition.tier].color}`}
                  >
                    Tier {condition.tier}
                  </span>
                  {condition.permanent && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-900/50 text-purple-300">
                      Permanent
                    </span>
                  )}
                  {condition.affectsAll && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-orange-900/50 text-orange-300">
                      All Rolls
                    </span>
                  )}
                </div>
                <p className="text-sm text-blue-200/60 mb-1">
                  {condition.description}
                </p>
                {condition.affects &&
                  condition.affects.length > 0 &&
                  !condition.affectsAll && (
                    <p className="text-xs text-red-300/70">
                      Affects: {condition.affects.join(", ")}
                    </p>
                  )}
                {condition.source && (
                  <p className="text-xs text-blue-300/50 mt-1">
                    Source: {condition.source}
                  </p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => startEdit(index)}
                  className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded"
                >
                  <DynamicIcon name="Edit" className="w-4 h-4" />
                </button>
                <button
                  onClick={() => removeCondition(index)}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
                >
                  <DynamicIcon name="Trash2" className="w-4 h-4" />
                </button>
              </div>
            </div>
          ),
        )}
        {localConditions.length === 0 && (
          <div className="p-8 text-center rounded-lg bg-blue-900/30 border-2 border-dashed border-blue-700/40">
            <p className="text-sm text-blue-300/50">
              No conditions. Conditions represent injuries, afflictions, or
              status effects that penalize skill checks.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Variables Editor
