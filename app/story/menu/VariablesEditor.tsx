"use client";

import {
  Variable,
  NumberVariable,
  BooleanVariable,
  StringVariable,
  ListVariable,
} from "../../misc/structs";
import { useState } from "react";
import { useNotification } from "../../misc/NotificationContext";
import { DynamicIcon } from "../../components/DynamicIcon";

export default function VariablesEditor({
  variables,
  onUpdate,
}: {
  variables: Variable[];
  onUpdate: (variables: Variable[]) => void;
}) {
  const { addNotification } = useNotification();
  const [localVariables, setLocalVariables] = useState<Variable[]>([
    ...variables,
  ]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editVariable, setEditVariable] = useState<Partial<Variable>>({});
  const [newItemInput, setNewItemInput] = useState<string>("");

  const addVariable = (type: "number" | "boolean" | "string" | "list") => {
    const id = crypto.randomUUID();
    let newVar: Variable;

    switch (type) {
      case "number":
        newVar = {
          id,
          name: "New Number",
          description: "",
          type: "number",
          value: 0,
        };
        break;
      case "boolean":
        newVar = {
          id,
          name: "New Flag",
          description: "",
          type: "boolean",
          value: false,
        };
        break;
      case "string":
        newVar = {
          id,
          name: "New Text",
          description: "",
          type: "string",
          value: "",
        };
        break;
      case "list":
        newVar = {
          id,
          name: "New List",
          description: "",
          type: "list",
          items: [],
        };
        break;
    }

    const updated = [...localVariables, newVar];
    setLocalVariables(updated);
    onUpdate(updated);
  };

  const removeVariable = (index: number) => {
    const updated = localVariables.filter((_, i) => i !== index);
    setLocalVariables(updated);
    onUpdate(updated);
  };

  const startEdit = (index: number) => {
    setEditingIndex(index);
    setEditVariable({ ...localVariables[index] });
    setNewItemInput("");
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditVariable({});
    setNewItemInput("");
  };

  const saveEdit = () => {
    if (editingIndex !== null && editVariable.name) {
      const updated = [...localVariables];
      updated[editingIndex] = editVariable as Variable;
      setLocalVariables(updated);
      onUpdate(updated);
      setEditingIndex(null);
      setEditVariable({});
      setNewItemInput("");
      addNotification("Variable updated!", "success");
    }
  };

  const addListItem = () => {
    if (editVariable.type === "list" && newItemInput.trim()) {
      const listVar = editVariable as Partial<ListVariable>;
      const currentItems = listVar.items || [];
      if (listVar.maxSize && currentItems.length >= listVar.maxSize) {
        addNotification(`Maximum ${listVar.maxSize} items allowed`, "warning");
        return;
      }
      setEditVariable({
        ...editVariable,
        items: [...currentItems, newItemInput.trim()],
      });
      setNewItemInput("");
    }
  };

  const removeListItem = (itemIndex: number) => {
    if (editVariable.type === "list") {
      const listVar = editVariable as Partial<ListVariable>;
      setEditVariable({
        ...editVariable,
        items: (listVar.items || []).filter((_, i) => i !== itemIndex),
      });
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "number":
        return "Hash";
      case "boolean":
        return "ToggleLeft";
      case "string":
        return "Type";
      case "list":
        return "List";
      default:
        return "Variable";
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "number":
        return "cyan";
      case "boolean":
        return "emerald";
      case "string":
        return "amber";
      case "list":
        return "violet";
      default:
        return "blue";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="text-lg font-bold text-white flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-purple-500/10 ring-1 ring-purple-400/20">
            <DynamicIcon name="Variable" className="w-4 h-4 text-purple-300" />
          </span>
          Variables ({localVariables.length})
        </h4>
        <div className="flex gap-2">
          <button
            onClick={() => addVariable("number")}
            className="px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-400/20 text-sm font-medium rounded-lg transition-colors flex items-center gap-1"
          >
            <DynamicIcon name="Hash" className="w-4 h-4" />
            Number
          </button>
          <button
            onClick={() => addVariable("boolean")}
            className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-400/20 text-sm font-medium rounded-lg transition-colors flex items-center gap-1"
          >
            <DynamicIcon name="ToggleLeft" className="w-4 h-4" />
            Boolean
          </button>
          <button
            onClick={() => addVariable("string")}
            className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-400/20 text-sm font-medium rounded-lg transition-colors flex items-center gap-1"
          >
            <DynamicIcon name="Type" className="w-4 h-4" />
            String
          </button>
          <button
            onClick={() => addVariable("list")}
            className="px-3 py-1.5 bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 border border-violet-400/20 text-sm font-medium rounded-lg transition-colors flex items-center gap-1"
          >
            <DynamicIcon name="List" className="w-4 h-4" />
            List
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {localVariables.map((variable, index) => {
          const color = getTypeColor(variable.type);
          const isEditing = editingIndex === index;

          if (isEditing) {
            const editBorderClass: Record<string, string> = {
              cyan: "border-cyan-400/30 shadow-[0_0_20px_rgba(34,211,238,0.1)]",
              emerald: "border-emerald-400/30 shadow-[0_0_20px_rgba(52,211,153,0.1)]",
              amber: "border-amber-400/30 shadow-[0_0_20px_rgba(251,191,36,0.1)]",
              violet: "border-violet-400/30 shadow-[0_0_20px_rgba(167,139,250,0.1)]",
            };
            return (
              <div
                key={variable.id}
                className={`p-4 bg-white/[0.04] backdrop-blur-xl border rounded-2xl ${editBorderClass[color] || "border-white/10"}`}
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <DynamicIcon
                      name={getTypeIcon(variable.type)}
                      className="w-5 h-5 text-blue-200"
                    />
                    <span className="text-xs uppercase tracking-wider text-blue-200/70 font-semibold">
                      {variable.type} Variable
                    </span>
                  </div>

                  <input
                    type="text"
                    value={editVariable.name || ""}
                    onChange={(e) =>
                      setEditVariable({
                        ...editVariable,
                        name: e.target.value,
                      })
                    }
                    placeholder="Variable name"
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                  />

                  <textarea
                    value={editVariable.description || ""}
                    onChange={(e) =>
                      setEditVariable({
                        ...editVariable,
                        description: e.target.value,
                      })
                    }
                    placeholder="Description (optional)"
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                    rows={2}
                  />

                  {/* Type-specific fields */}
                  {editVariable.type === "number" && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-semibold text-blue-200 mb-1">
                          Current Value
                        </label>
                        <input
                          type="number"
                          value={
                            (editVariable as Partial<NumberVariable>).value ?? 0
                          }
                          onChange={(e) =>
                            setEditVariable({
                              ...editVariable,
                              value: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-semibold text-blue-200 mb-1">
                            Min Value (optional)
                          </label>
                          <input
                            type="number"
                            value={
                              (editVariable as Partial<NumberVariable>)
                                .minValue ?? ""
                            }
                            onChange={(e) =>
                              setEditVariable({
                                ...editVariable,
                                minValue:
                                  e.target.value === ""
                                    ? undefined
                                    : parseFloat(e.target.value),
                              })
                            }
                            placeholder="No minimum"
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-blue-200 mb-1">
                            Max Value (optional)
                          </label>
                          <input
                            type="number"
                            value={
                              (editVariable as Partial<NumberVariable>)
                                .maxValue ?? ""
                            }
                            onChange={(e) =>
                              setEditVariable({
                                ...editVariable,
                                maxValue:
                                  e.target.value === ""
                                    ? undefined
                                    : parseFloat(e.target.value),
                              })
                            }
                            placeholder="No maximum"
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {editVariable.type === "boolean" && (
                    <div>
                      <label className="block text-sm font-semibold text-blue-200 mb-2">
                        Current Value
                      </label>
                      <button
                        onClick={() =>
                          setEditVariable({
                            ...editVariable,
                            value: !(editVariable as Partial<BooleanVariable>)
                              .value,
                          })
                        }
                        className={`px-4 py-2 rounded-lg font-semibold transition-all shadow-md ${
                          (editVariable as Partial<BooleanVariable>).value
                            ? "bg-linear-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white shadow-emerald-950/40"
                            : "bg-linear-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-red-950/40"
                        }`}
                      >
                        {(editVariable as Partial<BooleanVariable>).value
                          ? "TRUE"
                          : "FALSE"}
                      </button>
                    </div>
                  )}

                  {editVariable.type === "string" && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-semibold text-blue-200 mb-1">
                          Current Value
                        </label>
                        <input
                          type="text"
                          value={
                            (editVariable as Partial<StringVariable>).value ??
                            ""
                          }
                          onChange={(e) =>
                            setEditVariable({
                              ...editVariable,
                              value: e.target.value,
                            })
                          }
                          placeholder="Enter text value..."
                          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-blue-200 mb-1">
                          Predefined Options (optional)
                        </label>
                        <p className="text-xs text-blue-300/50 mb-2">
                          If set, the AI will prefer these values. One per line.
                        </p>
                        <textarea
                          value={
                            (
                              editVariable as Partial<StringVariable>
                            ).options?.join("\n") ?? ""
                          }
                          onChange={(e) =>
                            setEditVariable({
                              ...editVariable,
                              options: e.target.value
                                ? e.target.value
                                    .split("\n")
                                    .filter((o) => o.trim())
                                : undefined,
                            })
                          }
                          placeholder="Monday&#10;Tuesday&#10;Wednesday&#10;..."
                          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                          rows={4}
                        />
                      </div>
                    </div>
                  )}

                  {editVariable.type === "list" && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-semibold text-blue-200 mb-1">
                          Max Size (optional)
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={
                            (editVariable as Partial<ListVariable>).maxSize ??
                            ""
                          }
                          onChange={(e) =>
                            setEditVariable({
                              ...editVariable,
                              maxSize:
                                e.target.value === ""
                                  ? undefined
                                  : parseInt(e.target.value),
                            })
                          }
                          placeholder="No limit"
                          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-blue-200 mb-1">
                          Items (
                          {(editVariable as Partial<ListVariable>).items
                            ?.length || 0}
                          {(editVariable as Partial<ListVariable>).maxSize
                            ? ` / ${
                                (editVariable as Partial<ListVariable>).maxSize
                              }`
                            : ""}
                          )
                        </label>
                        <div className="flex gap-2 mb-2">
                          <input
                            type="text"
                            value={newItemInput}
                            onChange={(e) => setNewItemInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addListItem();
                              }
                            }}
                            placeholder="Add item..."
                            className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                          />
                          <button
                            onClick={addListItem}
                            disabled={!newItemInput.trim()}
                            className="px-3 py-2 bg-violet-500/10 hover:bg-violet-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-violet-200 border border-violet-400/20 rounded-lg transition-colors"
                          >
                            <DynamicIcon name="Plus" className="w-4 h-4" />
                          </button>
                        </div>
                        {((editVariable as Partial<ListVariable>).items || [])
                          .length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {(
                              (editVariable as Partial<ListVariable>).items ||
                              []
                            ).map((item, itemIndex) => (
                              <span
                                key={itemIndex}
                                className="px-2 py-1 bg-violet-500/15 text-violet-200 border border-violet-400/20 rounded-lg flex items-center gap-1"
                              >
                                {item}
                                <button
                                  onClick={() => removeListItem(itemIndex)}
                                  className="hover:text-red-400"
                                >
                                  <DynamicIcon name="X" className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={saveEdit}
                      disabled={!editVariable.name}
                      className="px-4 py-2 bg-linear-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:from-white/10 disabled:to-white/10 disabled:text-blue-300/40 text-white rounded-lg shadow-md shadow-emerald-950/40 disabled:shadow-none transition-all"
                    >
                      <DynamicIcon
                        name="Save"
                        className="inline-block w-4 h-4 mr-1"
                      />
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
            );
          }

          // Display mode
          return (
            <div
              key={variable.id}
              className={`flex items-start gap-3 p-4 rounded-xl border backdrop-blur-md transition-colors ${
                variable.type === "number"
                  ? "bg-cyan-500/[0.05] border-cyan-400/20 hover:bg-cyan-500/[0.08]"
                  : variable.type === "boolean"
                    ? "bg-emerald-500/[0.05] border-emerald-400/20 hover:bg-emerald-500/[0.08]"
                    : variable.type === "string"
                      ? "bg-amber-500/[0.05] border-amber-400/20 hover:bg-amber-500/[0.08]"
                      : "bg-violet-500/[0.05] border-violet-400/20 hover:bg-violet-500/[0.08]"
              }`}
            >
              <div className="shrink-0">
                <DynamicIcon
                  name={getTypeIcon(variable.type)}
                  className={`w-8 h-8 ${
                    variable.type === "number"
                      ? "text-cyan-500"
                      : variable.type === "boolean"
                        ? "text-emerald-500"
                        : variable.type === "string"
                          ? "text-amber-500"
                          : "text-violet-500"
                  }`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-white flex items-center gap-2 flex-wrap mb-1">
                  <span>{variable.name}</span>
                  {variable.type === "number" && (
                    <span className="text-sm px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-400/20">
                      {(variable as NumberVariable).value}
                    </span>
                  )}
                  {variable.type === "boolean" && (
                    <span
                      className={`text-sm px-2 py-0.5 rounded-full border ${
                        (variable as BooleanVariable).value
                          ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/20"
                          : "bg-red-500/15 text-red-300 border-red-400/20"
                      }`}
                    >
                      {(variable as BooleanVariable).value ? "TRUE" : "FALSE"}
                    </span>
                  )}
                  {variable.type === "string" && (
                    <span className="text-sm px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-400/20">
                      &quot;{(variable as StringVariable).value || "(empty)"}
                      &quot;
                    </span>
                  )}
                  {variable.type === "list" && (
                    <span className="text-sm px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-400/20">
                      {(variable as ListVariable).items.length} items
                      {(variable as ListVariable).maxSize &&
                        ` / ${(variable as ListVariable).maxSize} max`}
                    </span>
                  )}
                </div>
                {variable.description && (
                  <p className="text-sm text-blue-200/60 mb-2">
                    {variable.description}
                  </p>
                )}
                {/* Show number range if defined */}
                {variable.type === "number" &&
                  ((variable as NumberVariable).minValue !== undefined ||
                    (variable as NumberVariable).maxValue !== undefined) && (
                    <p className="text-xs text-blue-200/40">
                      Range: {(variable as NumberVariable).minValue ?? "-∞"} to{" "}
                      {(variable as NumberVariable).maxValue ?? "∞"}
                    </p>
                  )}
                {/* Show string options if defined */}
                {variable.type === "string" &&
                  (variable as StringVariable).options &&
                  (variable as StringVariable).options!.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(variable as StringVariable).options!.map((opt, i) => (
                        <span
                          key={i}
                          className={`px-2 py-0.5 text-xs rounded-full border ${
                            opt === (variable as StringVariable).value
                              ? "bg-amber-500/25 text-amber-200 border-amber-400/30 font-semibold"
                              : "bg-amber-500/10 text-amber-300 border-amber-400/20"
                          }`}
                        >
                          {opt}
                        </span>
                      ))}
                    </div>
                  )}
                {/* Show list items preview */}
                {variable.type === "list" &&
                  (variable as ListVariable).items.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(variable as ListVariable).items
                        .slice(0, 5)
                        .map((item, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 text-xs rounded-full bg-violet-500/10 text-violet-300 border border-violet-400/20"
                          >
                            {item}
                          </span>
                        ))}
                      {(variable as ListVariable).items.length > 5 && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-violet-500/5 text-violet-400 border border-violet-400/10">
                          +{(variable as ListVariable).items.length - 5} more
                        </span>
                      )}
                    </div>
                  )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => startEdit(index)}
                  className="px-3 py-1 bg-purple-500/10 hover:bg-purple-500/20 text-purple-200 border border-purple-400/20 rounded-lg transition-colors"
                >
                  <DynamicIcon name="Edit" className="w-4 h-4" />
                </button>
                <button
                  onClick={() => removeVariable(index)}
                  className="px-3 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-400/20 rounded-lg transition-colors"
                >
                  <DynamicIcon name="Trash2" className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}

        {localVariables.length === 0 && (
          <div className="p-8 text-center rounded-2xl bg-white/[0.02] border-2 border-dashed border-white/10">
            <p className="text-sm text-blue-300/50">
              No variables yet. Add variables to track custom values in your
              story - numbers, flags, or lists of items.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Story Meta Editor
