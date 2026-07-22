"use client";

import { useState } from "react";
import { CustomTable, CustomTableEntry } from "@/app/misc/structs";
import { DynamicIcon } from "@/app/components/DynamicIcon";
import { calculatePercentages } from "@/app/misc/tableRoller";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import { useNotification } from "@/app/misc/NotificationContext";

interface CustomTablesEditorProps {
  tables: CustomTable[];
  setTables: (tables: CustomTable[]) => void;
}

export function CustomTablesEditor({
  tables,
  setTables,
}: CustomTablesEditorProps) {
  const { addNotification } = useNotification();

  const [newTable, setNewTable] = useState<Partial<CustomTable>>({
    name: "",
    description: "",
    entries: [],
  });

  const [editingTableIndex, setEditingTableIndex] = useState<number | null>(
    null
  );
  const [editTable, setEditTable] = useState<Partial<CustomTable>>({});

  const [newEntry, setNewEntry] = useState<CustomTableEntry>({
    text: "",
    weight: 1,
  });

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title?: string;
    message?: string;
    icon?: string;
    confirmText?: string;
    confirmButtonClass?: string;
    onConfirm?: () => void;
  }>({
    isOpen: false,
  });

  const handleAddTable = () => {
    if (!newTable.name || !newTable.description) {
      addNotification("Please provide table name and description", "warning");
      return;
    }

    if (!newTable.entries || newTable.entries.length === 0) {
      addNotification("Please add at least one entry to the table", "warning");
      return;
    }

    const table: CustomTable = {
      id: `table-${Date.now()}`,
      name: newTable.name,
      description: newTable.description,
      entries: newTable.entries,
    };

    setTables([...tables, table]);
    setNewTable({
      name: "",
      description: "",
      entries: [],
    });
    addNotification("Table added successfully!", "success");
  };

  const handleAddEntry = (isEditMode: boolean) => {
    if (!newEntry.text) {
      addNotification("Please provide entry text", "warning");
      return;
    }

    if (newEntry.weight <= 0) {
      addNotification("Weight must be greater than 0", "warning");
      return;
    }

    if (isEditMode) {
      setEditTable({
        ...editTable,
        entries: [...(editTable.entries || []), { ...newEntry }],
      });
    } else {
      setNewTable({
        ...newTable,
        entries: [...(newTable.entries || []), { ...newEntry }],
      });
    }

    setNewEntry({ text: "", weight: 1 });
    addNotification("Entry added!", "success");
  };

  const handleRemoveEntry = (
    index: number,
    isEditMode: boolean,
    entryText: string
  ) => {
    setConfirmDialog({
      isOpen: true,
      title: "Remove Entry?",
      message: `Remove "${entryText}"? This cannot be undone.`,
      icon: "Trash2",
      confirmText: "Remove",
      confirmButtonClass: "bg-red-600 hover:bg-red-700",
      onConfirm: () => {
        if (isEditMode) {
          setEditTable({
            ...editTable,
            entries: (editTable.entries || []).filter((_, i) => i !== index),
          });
        } else {
          setNewTable({
            ...newTable,
            entries: (newTable.entries || []).filter((_, i) => i !== index),
          });
        }
        setConfirmDialog({ ...confirmDialog, isOpen: false });
        addNotification("Entry removed", "success");
      },
    });
  };

  const normalizeWeights = (entries: CustomTableEntry[]) => {
    const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
    return entries.map((e) => ({
      ...e,
      weight: parseFloat(((e.weight / totalWeight) * 100).toFixed(2)),
    }));
  };

  const testRoll = (tableId: string) => {
    const table = tables.find((t) => t.id === tableId);
    if (!table) return;

    const totalWeight = table.entries.reduce((sum, e) => sum + e.weight, 0);
    const roll = Math.random() * totalWeight;
    let currentWeight = 0;

    for (const entry of table.entries) {
      currentWeight += entry.weight;
      if (roll <= currentWeight) {
        addNotification(`🎲 Rolled: ${entry.text}`, "success");
        return;
      }
    }
  };

  return (
    <div className="space-y-6">
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title || "Confirm"}
        message={confirmDialog.message || "Are you sure?"}
        icon={confirmDialog.icon}
        confirmText={confirmDialog.confirmText}
        confirmButtonClass={confirmDialog.confirmButtonClass}
        onConfirm={() => {
          if (confirmDialog.onConfirm) {
            confirmDialog.onConfirm();
          }
        }}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
      />

      {/* Info Card */}
      <div className="bg-blue-500/5 backdrop-blur-md border border-blue-400/20 rounded-xl p-4">
        <p className="text-sm text-blue-200/80 flex items-start gap-2">
          <DynamicIcon
            name="Lightbulb"
            className="w-5 h-5 text-blue-400 shrink-0 mt-0.5"
          />
          <span>
            <strong>Tip:</strong> Create weighted random tables that the AI can
            use in choices. For example, a "Random Events" table with various
            outcomes weighted by probability. Use the{" "}
            <code className="px-1 py-0.5 bg-white/10 rounded text-xs">
              custom_table
            </code>{" "}
            parameter in choices to trigger these rolls.
          </span>
        </p>
      </div>

      {/* Add New Table */}
      <div className="bg-white/[0.04] backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.3)] p-6">
        <h3 className="text-lg font-bold mb-4 text-white flex items-center gap-2">
          <DynamicIcon name="Plus" className="w-5 h-5" />
          Create New Table
        </h3>

        <div className="space-y-4">
          {/* Table Name */}
          <div>
            <label className="block text-sm font-semibold text-blue-200 mb-1">
              Table Name *
            </label>
            <input
              type="text"
              value={newTable.name}
              onChange={(e) =>
                setNewTable({ ...newTable, name: e.target.value })
              }
              placeholder="e.g., Random Events"
              className="w-full px-3 py-2 border border-white/10 rounded-lg bg-white/5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-blue-200 mb-1">
              Description *
            </label>
            <textarea
              value={newTable.description}
              onChange={(e) =>
                setNewTable({ ...newTable, description: e.target.value })
              }
              placeholder="Describe what this table is for and when the AI should use it..."
              rows={2}
              className="w-full px-3 py-2 border border-white/10 rounded-lg bg-white/5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
            />
          </div>

          {/* Add Entry Form */}
          <div className="border-t border-white/10 pt-4">
            <h4 className="text-sm font-bold text-blue-200 mb-3">
              Table Entries
            </h4>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-blue-300/70 mb-1">
                  Entry Text *
                </label>
                <input
                  type="text"
                  value={newEntry.text}
                  onChange={(e) =>
                    setNewEntry({ ...newEntry, text: e.target.value })
                  }
                  placeholder="e.g., A mysterious stranger appears"
                  className="w-full px-3 py-2 border border-white/10 rounded-lg bg-white/5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                />
              </div>
              <div className="w-24">
                <label className="block text-xs font-semibold text-blue-300/70 mb-1">
                  Weight *
                </label>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={newEntry.weight}
                  onChange={(e) =>
                    setNewEntry({
                      ...newEntry,
                      weight: parseFloat(e.target.value) || 1,
                    })
                  }
                  className="w-full px-3 py-2 border border-white/10 rounded-lg bg-white/5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                />
              </div>
              <button
                onClick={() => handleAddEntry(false)}
                className="px-4 py-2 bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold rounded-lg shadow-md shadow-purple-950/40 transition-all text-sm"
              >
                <DynamicIcon name="Plus" className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Entries List */}
          {(newTable.entries || []).length > 0 && (
            <div className="space-y-2">
              {calculatePercentages(newTable.entries || []).map(
                (entry, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-white/[0.03] rounded-lg border border-white/10"
                  >
                    <div className="flex-1">
                      <span className="text-sm text-white">
                        {entry.text}
                      </span>
                      <span className="ml-3 text-xs text-blue-300/50">
                        ({entry.percentage}%)
                      </span>
                    </div>
                    <button
                      onClick={() =>
                        handleRemoveEntry(index, false, entry.text)
                      }
                      className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-400/20 rounded-lg transition-colors text-xs"
                    >
                      <DynamicIcon name="X" className="w-3 h-3" />
                    </button>
                  </div>
                )
              )}
              <button
                onClick={() => {
                  const normalized = normalizeWeights(newTable.entries || []);
                  setNewTable({ ...newTable, entries: normalized });
                  addNotification("Weights normalized to 100%", "success");
                }}
                className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-blue-200 font-semibold rounded-lg transition-all text-sm"
              >
                <DynamicIcon
                  name="Calculator"
                  className="inline-block w-4 h-4 mr-1"
                />
                Normalize Weights to 100%
              </button>
            </div>
          )}

          {/* Add Table Button */}
          <button
            onClick={handleAddTable}
            disabled={
              !newTable.name ||
              !newTable.description ||
              !newTable.entries ||
              newTable.entries.length === 0
            }
            className="w-full px-4 py-2 bg-linear-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:from-white/10 disabled:to-white/10 disabled:text-blue-300/40 text-white font-semibold rounded-lg shadow-md shadow-emerald-950/40 disabled:shadow-none transition-all"
          >
            <DynamicIcon name="Plus" className="inline-block w-5 h-5 mr-2" />
            Add Table
          </button>
        </div>
      </div>

      {/* Existing Tables */}
      {tables.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-bold text-white">
            Your Tables ({tables.length})
          </h3>
          {tables.map((table, tableIndex) => (
            <div
              key={table.id}
              className="bg-white/[0.04] backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.3)] p-4"
            >
              {editingTableIndex === tableIndex ? (
                // Edit Mode
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-blue-200 mb-1">
                      Table Name *
                    </label>
                    <input
                      type="text"
                      value={editTable.name}
                      onChange={(e) =>
                        setEditTable({ ...editTable, name: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-white/10 rounded-lg bg-white/5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-blue-200 mb-1">
                      Description *
                    </label>
                    <textarea
                      value={editTable.description}
                      onChange={(e) =>
                        setEditTable({
                          ...editTable,
                          description: e.target.value,
                        })
                      }
                      rows={2}
                      className="w-full px-3 py-2 border border-white/10 rounded-lg bg-white/5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                    />
                  </div>

                  {/* Add Entry Form in Edit Mode */}
                  <div className="border-t border-white/10 pt-4">
                    <h4 className="text-sm font-bold text-blue-200 mb-3">
                      Entries
                    </h4>
                    <div className="flex gap-2 items-end mb-3">
                      <div className="flex-1">
                        <input
                          type="text"
                          value={newEntry.text}
                          onChange={(e) =>
                            setNewEntry({ ...newEntry, text: e.target.value })
                          }
                          placeholder="Entry text"
                          className="w-full px-3 py-2 border border-white/10 rounded-lg bg-white/5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                        />
                      </div>
                      <div className="w-24">
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={newEntry.weight}
                          onChange={(e) =>
                            setNewEntry({
                              ...newEntry,
                              weight: parseFloat(e.target.value) || 1,
                            })
                          }
                          className="w-full px-3 py-2 border border-white/10 rounded-lg bg-white/5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                        />
                      </div>
                      <button
                        onClick={() => handleAddEntry(true)}
                        className="px-4 py-2 bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold rounded-lg shadow-md shadow-purple-950/40 transition-all text-sm"
                      >
                        <DynamicIcon name="Plus" className="w-4 h-4" />
                      </button>
                    </div>

                    {(editTable.entries || []).length > 0 && (
                      <div className="space-y-2">
                        {calculatePercentages(editTable.entries || []).map(
                          (entry, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between p-3 bg-white/[0.03] rounded-lg border border-white/10"
                            >
                              <div className="flex-1">
                                <span className="text-sm text-white">
                                  {entry.text}
                                </span>
                                <span className="ml-3 text-xs text-blue-300/50">
                                  ({entry.percentage}%)
                                </span>
                              </div>
                              <button
                                onClick={() =>
                                  handleRemoveEntry(index, true, entry.text)
                                }
                                className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-400/20 rounded-lg transition-colors text-xs"
                              >
                                <DynamicIcon name="X" className="w-3 h-3" />
                              </button>
                            </div>
                          )
                        )}
                        <button
                          onClick={() => {
                            const normalized = normalizeWeights(
                              editTable.entries || []
                            );
                            setEditTable({ ...editTable, entries: normalized });
                            addNotification(
                              "Weights normalized to 100%",
                              "success"
                            );
                          }}
                          className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-blue-200 font-semibold rounded-lg transition-all text-sm"
                        >
                          <DynamicIcon
                            name="Calculator"
                            className="inline-block w-4 h-4 mr-1"
                          />
                          Normalize Weights
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (
                          !editTable.name ||
                          !editTable.description ||
                          !editTable.entries ||
                          editTable.entries.length === 0
                        ) {
                          addNotification(
                            "Table must have name, description, and at least one entry",
                            "warning"
                          );
                          return;
                        }
                        const updated = [...tables];
                        updated[tableIndex] = editTable as CustomTable;
                        setTables(updated);
                        setEditingTableIndex(null);
                        setEditTable({});
                        setNewEntry({ text: "", weight: 1 });
                        addNotification("Table updated!", "success");
                      }}
                      className="px-4 py-2 bg-linear-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-semibold rounded-lg shadow-md shadow-emerald-950/40 transition-all text-sm"
                    >
                      <DynamicIcon
                        name="Save"
                        className="inline-block w-4 h-4 mr-1"
                      />
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setEditingTableIndex(null);
                        setEditTable({});
                        setNewEntry({ text: "", weight: 1 });
                      }}
                      className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-blue-200 font-semibold rounded-lg transition-all text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                // View Mode
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h4 className="font-bold text-white mb-1">
                        {table.name}
                      </h4>
                      <p className="text-sm text-blue-300/60">
                        {table.description}
                      </p>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => testRoll(table.id)}
                        className="px-3 py-1 bg-purple-500/10 hover:bg-purple-500/20 text-purple-200 border border-purple-400/20 rounded-lg transition-colors text-sm"
                        title="Test Roll"
                      >
                        <DynamicIcon name="Dices" className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setEditingTableIndex(tableIndex);
                          setEditTable({ ...table });
                        }}
                        className="px-3 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-200 border border-blue-400/20 rounded-lg transition-colors text-sm"
                      >
                        <DynamicIcon name="Edit" className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setConfirmDialog({
                            isOpen: true,
                            title: "Remove Table?",
                            message: `Remove table "${table.name}"? This cannot be undone.`,
                            icon: "Trash2",
                            confirmText: "Remove",
                            confirmButtonClass: "bg-red-600 hover:bg-red-700",
                            onConfirm: () => {
                              setTables(
                                tables.filter((_, i) => i !== tableIndex)
                              );
                              setConfirmDialog({
                                ...confirmDialog,
                                isOpen: false,
                              });
                              addNotification("Table removed", "success");
                            },
                          });
                        }}
                        className="px-3 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-400/20 rounded-lg transition-colors text-sm"
                      >
                        <DynamicIcon name="Trash2" className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-blue-300/60 mb-2">
                      Entries ({table.entries.length}):
                    </div>
                    {calculatePercentages(table.entries).map((entry, index) => (
                      <div
                        key={index}
                        className="text-sm text-blue-200/80 pl-3"
                      >
                        • {entry.text}{" "}
                        <span className="text-xs text-blue-300/50">
                          ({entry.percentage}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
