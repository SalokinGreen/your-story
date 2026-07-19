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
import { DynamicIcon } from "../../components/DynamicIcon";
import { IconPicker } from "../../components/IconPicker";
import {
  GRADE_CONFIG,
  getMaxDurability,
  ItemGrade,
  GRADE_ORDER,
  safeGradeConfig,
} from "../../misc/itemSystem";

export default function InventoryEditor({
  inventory,
  onUpdate,
}: {
  inventory: InventoryItem[];
  onUpdate: (inventory: InventoryItem[]) => void;
}) {
  const [localInventory, setLocalInventory] = useState([...inventory]);
  const [draggedInventoryIndex, setDraggedInventoryIndex] = useState<
    number | null
  >(null);
  const [editingInventoryIndex, setEditingInventoryIndex] = useState<
    number | null
  >(null);
  const [editInventoryItem, setEditInventoryItem] = useState<
    Partial<InventoryItem>
  >({});

  // Drag-and-drop handlers for inventory
  const handleInventoryDragStart = (index: number) => {
    setDraggedInventoryIndex(index);
  };

  const handleInventoryDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedInventoryIndex === null || draggedInventoryIndex === index)
      return;

    const items = [...localInventory];
    const draggedItem = items[draggedInventoryIndex];
    items.splice(draggedInventoryIndex, 1);
    items.splice(index, 0, draggedItem);

    setLocalInventory(items);
    setDraggedInventoryIndex(index);
    onUpdate(items);
  };

  const handleInventoryDragEnd = () => {
    setDraggedInventoryIndex(null);
  };

  // Arrow button handlers for inventory
  const moveInventoryUp = (index: number) => {
    if (index === 0) return;
    const items = [...localInventory];
    [items[index - 1], items[index]] = [items[index], items[index - 1]];
    setLocalInventory(items);
    onUpdate(items);
  };

  const moveInventoryDown = (index: number) => {
    if (index === localInventory.length - 1) return;
    const items = [...localInventory];
    [items[index], items[index + 1]] = [items[index + 1], items[index]];
    setLocalInventory(items);
    onUpdate(items);
  };

  // Edit mode handlers for inventory
  const startEditInventoryItem = (index: number) => {
    setEditingInventoryIndex(index);
    setEditInventoryItem({ ...localInventory[index] });
  };

  const cancelEditInventoryItem = () => {
    setEditingInventoryIndex(null);
    setEditInventoryItem({});
  };

  const saveEditInventoryItem = (index: number) => {
    const items = [...localInventory];
    items[index] = { ...items[index], ...editInventoryItem };
    setLocalInventory(items);
    onUpdate(items);
    setEditingInventoryIndex(null);
    setEditInventoryItem({});
  };

  const updateItem = (
    index: number,
    field: keyof InventoryItem,
    value: any,
  ) => {
    const updated = [...localInventory];
    (updated[index] as any)[field] = value;
    setLocalInventory(updated);
    onUpdate(updated);
  };

  const addItem = () => {
    const newItem: InventoryItem = {
      name: "New Item",
      quantity: 1,
      description: "",
      type: "normal",
      symbol: "Package",
      grade: "common",
      durability: 3,
      maxDurability: 3,
    };
    const updated = [...localInventory, newItem];
    setLocalInventory(updated);
    onUpdate(updated);
  };

  const removeItem = (index: number) => {
    const updated = localInventory.filter((_, i) => i !== index);
    setLocalInventory(updated);
    onUpdate(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-bold text-white flex items-center gap-2">
          <DynamicIcon name="Backpack" className="w-6 h-6" /> Inventory (
          {localInventory.length} items)
        </h4>
        <button
          onClick={addItem}
          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg"
        >
          + Add Item
        </button>
      </div>
      <div className="space-y-3">
        {localInventory.map((item, index) =>
          editingInventoryIndex === index ? (
            <div
              key={index}
              className="p-4 bg-blue-100 dark:bg-blue-900/40 border-2 border-blue-400 rounded-lg"
            >
              <div className="space-y-3">
                <input
                  type="text"
                  value={editInventoryItem.name || ""}
                  onChange={(e) =>
                    setEditInventoryItem({
                      ...editInventoryItem,
                      name: e.target.value,
                    })
                  }
                  placeholder="Item name"
                  className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                />
                <div className="relative z-30">
                  <IconPicker
                    value={editInventoryItem.symbol || "Package"}
                    onChange={(icon) =>
                      setEditInventoryItem({
                        ...editInventoryItem,
                        symbol: icon,
                      })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    value={editInventoryItem.quantity ?? 1}
                    onChange={(e) =>
                      setEditInventoryItem({
                        ...editInventoryItem,
                        quantity: parseInt(e.target.value) || 1,
                      })
                    }
                    placeholder="Quantity"
                    className="px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                  />
                  <select
                    value={editInventoryItem.type || "normal"}
                    onChange={(e) =>
                      setEditInventoryItem({
                        ...editInventoryItem,
                        type: e.target.value as
                          | "normal"
                          | "consumable"
                          | "story"
                          | "misc",
                      })
                    }
                    className="px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                  >
                    <option value="normal">Normal</option>
                    <option value="consumable">Consumable</option>
                    <option value="story">Story</option>
                    <option value="misc">Misc</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-blue-200/60 mb-1">
                      Grade
                    </label>
                    <select
                      value={editInventoryItem.grade || "common"}
                      onChange={(e) => {
                        const newGrade = e.target.value as ItemGrade;
                        const maxDur = getMaxDurability(newGrade);
                        setEditInventoryItem({
                          ...editInventoryItem,
                          grade: newGrade,
                          maxDurability: maxDur,
                          durability: Math.min(
                            editInventoryItem.durability || maxDur,
                            maxDur,
                          ),
                        });
                      }}
                      className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                      style={{
                        color:
                          GRADE_CONFIG[
                            (editInventoryItem.grade as ItemGrade) || "common"
                          ].color,
                      }}
                    >
                      {GRADE_ORDER.map((g) => (
                        <option
                          key={g}
                          value={g}
                          style={{ color: GRADE_CONFIG[g].color }}
                        >
                          {GRADE_CONFIG[g].label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-blue-200/60 mb-1">
                      Durability{" "}
                      {editInventoryItem.grade === "mythic"
                        ? "(∞)"
                        : `(max ${getMaxDurability(
                            (editInventoryItem.grade as ItemGrade) || "common",
                          )})`}
                    </label>
                    <input
                      type="number"
                      value={
                        editInventoryItem.grade === "mythic"
                          ? "∞"
                          : (editInventoryItem.durability ??
                            getMaxDurability(
                              (editInventoryItem.grade as ItemGrade) ||
                                "common",
                            ))
                      }
                      onChange={(e) =>
                        setEditInventoryItem({
                          ...editInventoryItem,
                          durability: Math.max(
                            0,
                            Math.min(
                              parseInt(e.target.value) || 0,
                              getMaxDurability(
                                (editInventoryItem.grade as ItemGrade) ||
                                  "common",
                              ),
                            ),
                          ),
                        })
                      }
                      disabled={editInventoryItem.grade === "mythic"}
                      placeholder="Durability"
                      className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white disabled:opacity-50"
                    />
                  </div>
                </div>
                <textarea
                  value={editInventoryItem.description || ""}
                  onChange={(e) =>
                    setEditInventoryItem({
                      ...editInventoryItem,
                      description: e.target.value,
                    })
                  }
                  placeholder="Description"
                  className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                  rows={3}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEditInventoryItem(index)}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEditInventoryItem}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
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
              onDragStart={() => handleInventoryDragStart(index)}
              onDragOver={(e) => handleInventoryDragOver(e, index)}
              onDragEnd={handleInventoryDragEnd}
              className={`p-4 rounded-lg cursor-move flex items-center gap-3 ${
                draggedInventoryIndex === index ? "opacity-50" : ""
              }`}
              style={{
                backgroundColor: `${safeGradeConfig(item.grade).color}15`,
                borderWidth: 1,
                borderColor: `${safeGradeConfig(item.grade).color}30`,
              }}
            >
              <span className="text-gray-400 select-none">
                <DynamicIcon name="GripVertical" className="w-5 h-5" />
              </span>
              <div className="flex-1">
                <div className="font-medium text-white flex items-center gap-2">
                  <DynamicIcon
                    name={item.symbol}
                    className="w-5 h-5"
                    style={{
                      color: safeGradeConfig(item.grade).color,
                    }}
                  />
                  <span>
                    {item.name} x{item.quantity}
                  </span>
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: `${safeGradeConfig(item.grade).color}30`,
                      color: safeGradeConfig(item.grade).color,
                    }}
                  >
                    {safeGradeConfig(item.grade).label}
                  </span>
                  {item.type && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
                      {item.type}
                    </span>
                  )}
                </div>
                <div className="text-sm text-blue-200/60">
                  {item.description}
                </div>
                {item.type !== "consumable" && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-blue-200/40">
                      Durability:
                    </span>
                    {item.grade === "mythic" ? (
                      <span className="text-xs text-yellow-400">∞</span>
                    ) : (
                      <>
                        <div className="w-20 h-1.5 bg-blue-900/50 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${
                                ((item.durability ??
                                  getMaxDurability(
                                    (item.grade as ItemGrade) || "common",
                                  )) /
                                  getMaxDurability(
                                    (item.grade as ItemGrade) || "common",
                                  )) *
                                100
                              }%`,
                              backgroundColor: safeGradeConfig(item.grade)
                                .color,
                            }}
                          />
                        </div>
                        <span className="text-xs text-blue-200/60">
                          {item.durability ??
                            getMaxDurability(
                              (item.grade as ItemGrade) || "common",
                            )}
                          /
                          {getMaxDurability(
                            (item.grade as ItemGrade) || "common",
                          )}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex gap-0.5">
                  <button
                    onClick={() => moveInventoryUp(index)}
                    disabled={index === 0}
                    className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded flex items-center justify-center"
                    title="Move up"
                  >
                    <DynamicIcon
                      name="ChevronUp"
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                    />
                  </button>
                  <button
                    onClick={() => moveInventoryDown(index)}
                    disabled={index === localInventory.length - 1}
                    className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded flex items-center justify-center"
                    title="Move down"
                  >
                    <DynamicIcon
                      name="ChevronDown"
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                    />
                  </button>
                </div>
                <div className="flex gap-0.5">
                  <button
                    onClick={() => startEditInventoryItem(index)}
                    className="w-7 h-7 sm:w-8 sm:h-8 bg-yellow-600 hover:bg-yellow-700 text-white rounded flex items-center justify-center"
                    title="Edit"
                  >
                    <DynamicIcon
                      name="Edit"
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                    />
                  </button>
                  <button
                    onClick={() => removeItem(index)}
                    className="w-7 h-7 sm:w-8 sm:h-8 bg-red-600 hover:bg-red-700 text-white rounded flex items-center justify-center"
                    title="Remove"
                  >
                    <DynamicIcon
                      name="Trash2"
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                    />
                  </button>
                </div>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

// Abilities Editor
