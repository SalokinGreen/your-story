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
import { IconPicker } from "../../components/IconPicker";
import {
  ABILITY_GRADE_CONFIG,
  ABILITY_GRADE_ORDER,
  initializeAbility,
  formatAbilityCost,
} from "../../misc/abilitySystem";

export default function AbilitiesEditor({
  abilities,
  resources,
  variables,
  onUpdate,
}: {
  abilities: Ability[];
  resources: Resource[];
  variables: Variable[];
  onUpdate: (abilities: Ability[]) => void;
}) {
  const [localAbilities, setLocalAbilities] = useState([...abilities]);
  const [draggedAbilityIndex, setDraggedAbilityIndex] = useState<number | null>(
    null,
  );
  const [editingAbilityIndex, setEditingAbilityIndex] = useState<number | null>(
    null,
  );
  const [editAbility, setEditAbility] = useState<Partial<Ability>>({});
  const [editCosts, setEditCosts] = useState<AbilityCost[]>([]);

  // Drag-and-drop handlers
  const handleDragStart = (index: number) => {
    setDraggedAbilityIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedAbilityIndex === null || draggedAbilityIndex === index) return;

    const items = [...localAbilities];
    const draggedItem = items[draggedAbilityIndex];
    items.splice(draggedAbilityIndex, 1);
    items.splice(index, 0, draggedItem);

    setLocalAbilities(items);
    setDraggedAbilityIndex(index);
    onUpdate(items);
  };

  const handleDragEnd = () => {
    setDraggedAbilityIndex(null);
  };

  // Arrow button handlers
  const moveUp = (index: number) => {
    if (index === 0) return;
    const items = [...localAbilities];
    [items[index - 1], items[index]] = [items[index], items[index - 1]];
    setLocalAbilities(items);
    onUpdate(items);
  };

  const moveDown = (index: number) => {
    if (index === localAbilities.length - 1) return;
    const items = [...localAbilities];
    [items[index], items[index + 1]] = [items[index + 1], items[index]];
    setLocalAbilities(items);
    onUpdate(items);
  };

  // Edit mode handlers
  const startEdit = (index: number) => {
    setEditingAbilityIndex(index);
    setEditAbility({ ...localAbilities[index] });
    setEditCosts([...(localAbilities[index].cost || [])]);
  };

  const cancelEdit = () => {
    setEditingAbilityIndex(null);
    setEditAbility({});
    setEditCosts([]);
  };

  const saveEdit = (index: number) => {
    const items = [...localAbilities];
    items[index] = { ...items[index], ...editAbility, cost: editCosts };
    setLocalAbilities(items);
    onUpdate(items);
    setEditingAbilityIndex(null);
    setEditAbility({});
    setEditCosts([]);
  };

  const addAbility = () => {
    const newAbility = initializeAbility({
      name: "New Ability",
      description: "",
      grade: "novice",
      cost: [],
      cooldown: 0,
      currentCooldown: 0,
    });
    const updated = [...localAbilities, newAbility];
    setLocalAbilities(updated);
    onUpdate(updated);
  };

  const removeAbility = (index: number) => {
    const updated = localAbilities.filter((_, i) => i !== index);
    setLocalAbilities(updated);
    onUpdate(updated);
  };

  // Cost management
  const addCost = () => {
    setEditCosts([...editCosts, { type: "resource", name: "", amount: 1 }]);
  };

  const updateCost = (
    costIndex: number,
    field: keyof AbilityCost,
    value: any,
  ) => {
    const updated = [...editCosts];
    (updated[costIndex] as any)[field] = value;
    setEditCosts(updated);
  };

  const removeCost = (costIndex: number) => {
    setEditCosts(editCosts.filter((_, i) => i !== costIndex));
  };

  // Get available resource/variable names for cost dropdown
  const resourceNames = resources.map((r) => r.name);
  const numberVariableNames = variables
    .filter((v) => v.type === "number")
    .map((v) => v.name);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-bold text-white flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-purple-500/10 ring-1 ring-purple-400/20">
            <DynamicIcon name="Sparkles" className="w-4 h-4 text-purple-300" />
          </span>
          Abilities ({localAbilities.length})
        </h4>
        <button
          onClick={addAbility}
          className="px-3 py-1.5 bg-linear-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white text-sm font-medium rounded-lg shadow-md shadow-emerald-950/40 transition-all"
        >
          + Add Ability
        </button>
      </div>
      <div className="space-y-3">
        {localAbilities.map((ability, index) =>
          editingAbilityIndex === index ? (
            <div
              key={index}
              className="p-4 bg-white/[0.04] backdrop-blur-xl border border-purple-400/30 rounded-2xl shadow-[0_0_20px_rgba(168,85,247,0.1)]"
            >
              <div className="space-y-3">
                <input
                  type="text"
                  value={editAbility.name || ""}
                  onChange={(e) =>
                    setEditAbility({ ...editAbility, name: e.target.value })
                  }
                  placeholder="Ability name"
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                />
                <div className="relative z-30">
                  <IconPicker
                    value={editAbility.symbol || "Sparkles"}
                    onChange={(icon) =>
                      setEditAbility({ ...editAbility, symbol: icon })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-blue-200/60 mb-1">
                      Grade
                    </label>
                    <select
                      value={editAbility.grade || "novice"}
                      onChange={(e) =>
                        setEditAbility({
                          ...editAbility,
                          grade: e.target.value as AbilityGrade,
                        })
                      }
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                      style={{
                        color:
                          ABILITY_GRADE_CONFIG[
                            (editAbility.grade as AbilityGrade) || "novice"
                          ].color,
                      }}
                    >
                      {ABILITY_GRADE_ORDER.map((g) => (
                        <option
                          key={g}
                          value={g}
                          style={{ color: ABILITY_GRADE_CONFIG[g].color }}
                        >
                          {ABILITY_GRADE_CONFIG[g].label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-blue-200/60 mb-1">
                      Cooldown (turns)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={editAbility.cooldown ?? 0}
                      onChange={(e) =>
                        setEditAbility({
                          ...editAbility,
                          cooldown: parseInt(e.target.value) || 0,
                        })
                      }
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-blue-200/60 mb-1">
                    Associated Stat (optional)
                  </label>
                  <input
                    type="text"
                    value={editAbility.stat || ""}
                    onChange={(e) =>
                      setEditAbility({
                        ...editAbility,
                        stat: e.target.value || undefined,
                      })
                    }
                    placeholder="e.g., Strength, Magic, etc."
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                  />
                </div>
                <textarea
                  value={editAbility.description || ""}
                  onChange={(e) =>
                    setEditAbility({
                      ...editAbility,
                      description: e.target.value,
                    })
                  }
                  placeholder="Description"
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                  rows={2}
                />

                {/* Costs Section */}
                <div className="border-t border-white/10 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-blue-200/80">
                      Costs
                    </label>
                    <button
                      onClick={addCost}
                      className="px-2 py-1 text-xs bg-purple-500/10 hover:bg-purple-500/20 text-purple-200 border border-purple-400/20 rounded-lg transition-colors"
                    >
                      + Add Cost
                    </button>
                  </div>
                  {editCosts.length === 0 ? (
                    <p className="text-xs text-blue-200/40 italic">
                      No costs (free ability)
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {editCosts.map((cost, costIndex) => (
                        <div
                          key={costIndex}
                          className="flex items-center gap-2 p-2 bg-white/[0.03] rounded-lg border border-white/10"
                        >
                          <select
                            value={cost.type}
                            onChange={(e) =>
                              updateCost(costIndex, "type", e.target.value)
                            }
                            className="px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                          >
                            <option value="resource">Resource</option>
                            <option value="variable">Variable</option>
                          </select>
                          <select
                            value={cost.name}
                            onChange={(e) =>
                              updateCost(costIndex, "name", e.target.value)
                            }
                            className="flex-1 px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                          >
                            <option value="">Select...</option>
                            {cost.type === "resource"
                              ? resourceNames.map((name) => (
                                  <option key={name} value={name}>
                                    {name}
                                  </option>
                                ))
                              : numberVariableNames.map((name) => (
                                  <option key={name} value={name}>
                                    {name}
                                  </option>
                                ))}
                          </select>
                          <input
                            type="number"
                            min="1"
                            value={cost.amount}
                            onChange={(e) =>
                              updateCost(
                                costIndex,
                                "amount",
                                parseInt(e.target.value) || 1,
                              )
                            }
                            className="w-16 px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                          />
                          <button
                            onClick={() => removeCost(costIndex)}
                            className="p-1 text-red-400 hover:text-red-300 transition-colors"
                          >
                            <DynamicIcon name="X" className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(index)}
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
              key={index}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={`p-4 rounded-lg cursor-move flex items-center gap-3 ${
                draggedAbilityIndex === index ? "opacity-50" : ""
              } ${(ability.currentCooldown ?? 0) > 0 ? "opacity-60" : ""}`}
              style={{
                backgroundColor: `${
                  ABILITY_GRADE_CONFIG[ability.grade || "novice"].color
                }15`,
                borderWidth: 1,
                borderColor: `${
                  ABILITY_GRADE_CONFIG[ability.grade || "novice"].color
                }30`,
              }}
            >
              <span className="text-blue-300/40 select-none">
                <DynamicIcon name="GripVertical" className="w-5 h-5" />
              </span>
              <div className="flex-1">
                <div className="font-medium text-white flex items-center gap-2">
                  <DynamicIcon
                    name={ability.symbol || "Sparkles"}
                    className="w-5 h-5"
                    style={{
                      color:
                        ABILITY_GRADE_CONFIG[ability.grade || "novice"].color,
                    }}
                  />
                  <span>{ability.name}</span>
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: `${
                        ABILITY_GRADE_CONFIG[ability.grade || "novice"].color
                      }30`,
                      color:
                        ABILITY_GRADE_CONFIG[ability.grade || "novice"].color,
                    }}
                  >
                    {ABILITY_GRADE_CONFIG[ability.grade || "novice"].label}
                  </span>
                  {ability.stat && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">
                      {ability.stat}
                    </span>
                  )}
                </div>
                <div className="text-sm text-blue-200/60">
                  {ability.description}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {ability.cost && ability.cost.length > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">
                      Cost: {formatAbilityCost(ability.cost)}
                    </span>
                  )}
                  {ability.cooldown && ability.cooldown > 0 && (
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        (ability.currentCooldown ?? 0) > 0
                          ? "bg-orange-500/20 text-orange-300"
                          : "bg-green-500/20 text-green-300"
                      }`}
                    >
                      {(ability.currentCooldown ?? 0) > 0
                        ? `⏳ ${ability.currentCooldown} turns`
                        : `CD: ${ability.cooldown} turns`}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex gap-0.5">
                  <button
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-colors ${
                      index === 0
                        ? "bg-white/5 text-blue-300/30 cursor-not-allowed"
                        : "bg-white/5 hover:bg-white/10 text-blue-200 border border-white/10"
                    }`}
                    title="Move Up"
                  >
                    <DynamicIcon
                      name="ChevronUp"
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                    />
                  </button>
                  <button
                    onClick={() => moveDown(index)}
                    disabled={index === localAbilities.length - 1}
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-colors ${
                      index === localAbilities.length - 1
                        ? "bg-white/5 text-blue-300/30 cursor-not-allowed"
                        : "bg-white/5 hover:bg-white/10 text-blue-200 border border-white/10"
                    }`}
                    title="Move Down"
                  >
                    <DynamicIcon
                      name="ChevronDown"
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                    />
                  </button>
                </div>
                <button
                  onClick={() => startEdit(index)}
                  className="w-7 h-7 sm:w-8 sm:h-8 bg-purple-500/10 hover:bg-purple-500/20 text-purple-200 border border-purple-400/20 rounded-lg flex items-center justify-center transition-colors"
                  title="Edit"
                >
                  <DynamicIcon
                    name="Edit"
                    className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                  />
                </button>
                <button
                  onClick={() => removeAbility(index)}
                  className="w-7 h-7 sm:w-8 sm:h-8 bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-400/20 rounded-lg flex items-center justify-center transition-colors"
                  title="Remove"
                >
                  <DynamicIcon
                    name="Trash2"
                    className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                  />
                </button>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

// Passives Editor - Edit passive effects directly
