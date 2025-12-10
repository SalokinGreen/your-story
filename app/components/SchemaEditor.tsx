"use client";

import React, { useState, useCallback } from "react";
import {
  CharacterSchema,
  SchemaField,
  SchemaFieldType,
  NumberField,
  DerivedField,
  ResourceField,
  TextField,
  ListField,
  BooleanField,
  SelectField,
  validateSchema,
  PRESET_SCHEMAS,
} from "@/app/misc/characterSchema";

// ============================================
// TYPES
// ============================================

interface SchemaEditorProps {
  schema: CharacterSchema;
  onChange: (schema: CharacterSchema) => void;
}

const FIELD_TYPE_LABELS: Record<SchemaFieldType, string> = {
  number: "Number",
  derived: "Derived (Formula)",
  resource: "Resource (Current/Max)",
  text: "Text",
  list: "List",
  boolean: "Yes/No Toggle",
  select: "Dropdown Select",
};

// ============================================
// FIELD EDITOR
// ============================================

interface FieldEditorProps {
  field: SchemaField;
  categories: { id: string; name: string }[];
  onChange: (field: SchemaField) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

function FieldEditor({
  field,
  categories,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: FieldEditorProps) {
  const [expanded, setExpanded] = useState(false);

  const updateField = (updates: Partial<SchemaField>) => {
    onChange({ ...field, ...updates } as SchemaField);
  };

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-800">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-gray-400 hover:text-white"
        >
          {expanded ? "▼" : "▶"}
        </button>
        <input
          type="text"
          value={field.name}
          onChange={(e) => updateField({ name: e.target.value })}
          placeholder="Field name..."
          className="flex-1 bg-transparent text-white font-medium focus:outline-none"
        />
        <span className="text-xs text-gray-500 px-2 py-1 bg-gray-700 rounded">
          {FIELD_TYPE_LABELS[field.type]}
        </span>
        <div className="flex gap-1">
          {onMoveUp && (
            <button
              onClick={onMoveUp}
              className="p-1 text-gray-400 hover:text-white"
              title="Move up"
            >
              ↑
            </button>
          )}
          {onMoveDown && (
            <button
              onClick={onMoveDown}
              className="p-1 text-gray-400 hover:text-white"
              title="Move down"
            >
              ↓
            </button>
          )}
          <button
            onClick={onDelete}
            className="p-1 text-gray-400 hover:text-red-400"
            title="Delete field"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div className="p-4 space-y-4 bg-gray-900/50">
          {/* Basic settings */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                ID (for formulas)
              </label>
              <input
                type="text"
                value={field.id}
                onChange={(e) =>
                  updateField({
                    id: e.target.value.replace(/[^a-zA-Z0-9_]/g, ""),
                  })
                }
                placeholder="field_id"
                className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Category
              </label>
              <select
                value={field.category || ""}
                onChange={(e) =>
                  updateField({ category: e.target.value || undefined })
                }
                className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm"
              >
                <option value="">None</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Description
            </label>
            <input
              type="text"
              value={field.description || ""}
              onChange={(e) =>
                updateField({ description: e.target.value || undefined })
              }
              placeholder="Optional description..."
              className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm"
            />
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={field.hidden || false}
                onChange={(e) => updateField({ hidden: e.target.checked })}
                className="rounded"
              />
              <span className="text-gray-300">Hidden (GM only)</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={field.readonly || false}
                onChange={(e) => updateField({ readonly: e.target.checked })}
                className="rounded"
              />
              <span className="text-gray-300">Read-only</span>
            </label>
          </div>

          {/* Type-specific settings */}
          <TypeSpecificEditor field={field} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

// ============================================
// TYPE-SPECIFIC EDITORS
// ============================================

interface TypeSpecificEditorProps {
  field: SchemaField;
  onChange: (field: SchemaField) => void;
}

function TypeSpecificEditor({ field, onChange }: TypeSpecificEditorProps) {
  switch (field.type) {
    case "number":
      return <NumberFieldEditor field={field} onChange={onChange} />;
    case "derived":
      return <DerivedFieldEditor field={field} onChange={onChange} />;
    case "resource":
      return <ResourceFieldEditor field={field} onChange={onChange} />;
    case "text":
      return <TextFieldEditor field={field} onChange={onChange} />;
    case "list":
      return <ListFieldEditor field={field} onChange={onChange} />;
    case "boolean":
      return <BooleanFieldEditor field={field} onChange={onChange} />;
    case "select":
      return <SelectFieldEditor field={field} onChange={onChange} />;
    default:
      return null;
  }
}

function NumberFieldEditor({
  field,
  onChange,
}: {
  field: NumberField;
  onChange: (f: SchemaField) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div>
        <label className="block text-xs text-gray-400 mb-1">Default</label>
        <input
          type="number"
          value={field.defaultValue ?? ""}
          onChange={(e) =>
            onChange({
              ...field,
              defaultValue: e.target.value ? Number(e.target.value) : undefined,
            })
          }
          className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Min</label>
        <input
          type="number"
          value={field.min ?? ""}
          onChange={(e) =>
            onChange({
              ...field,
              min: e.target.value ? Number(e.target.value) : undefined,
            })
          }
          className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Max</label>
        <input
          type="number"
          value={field.max ?? ""}
          onChange={(e) =>
            onChange({
              ...field,
              max: e.target.value ? Number(e.target.value) : undefined,
            })
          }
          className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm"
        />
      </div>
    </div>
  );
}

function DerivedFieldEditor({
  field,
  onChange,
}: {
  field: DerivedField;
  onChange: (f: SchemaField) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">
        Formula (use {"{{field_id}}"} for variables)
      </label>
      <input
        type="text"
        value={field.formula}
        onChange={(e) => onChange({ ...field, formula: e.target.value })}
        placeholder="floor(({{Strength}} - 10) / 2)"
        className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm font-mono"
      />
      <p className="mt-1 text-xs text-gray-500">
        Available functions: floor(), ceil(), round(), min(), max(), abs()
      </p>
    </div>
  );
}

function ResourceFieldEditor({
  field,
  onChange,
}: {
  field: ResourceField;
  onChange: (f: SchemaField) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            Default Current
          </label>
          <input
            type="number"
            value={field.defaultValue ?? ""}
            onChange={(e) =>
              onChange({
                ...field,
                defaultValue: e.target.value
                  ? Number(e.target.value)
                  : undefined,
              })
            }
            className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            Default Max
          </label>
          <input
            type="number"
            value={field.defaultMax ?? ""}
            onChange={(e) =>
              onChange({
                ...field,
                defaultMax: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={field.regenerates || false}
          onChange={(e) =>
            onChange({ ...field, regenerates: e.target.checked })
          }
          className="rounded"
        />
        <span className="text-gray-300">Regenerates on rest</span>
      </label>

      {field.regenerates && (
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Quick Rest %
            </label>
            <input
              type="number"
              value={field.regenRates?.quick ?? 10}
              onChange={(e) =>
                onChange({
                  ...field,
                  regenRates: {
                    ...field.regenRates,
                    quick: Number(e.target.value),
                  },
                })
              }
              min={0}
              max={100}
              className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Short Rest %
            </label>
            <input
              type="number"
              value={field.regenRates?.short ?? 50}
              onChange={(e) =>
                onChange({
                  ...field,
                  regenRates: {
                    ...field.regenRates,
                    short: Number(e.target.value),
                  },
                })
              }
              min={0}
              max={100}
              className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Long Rest %
            </label>
            <input
              type="number"
              value={field.regenRates?.long ?? 100}
              onChange={(e) =>
                onChange({
                  ...field,
                  regenRates: {
                    ...field.regenRates,
                    long: Number(e.target.value),
                  },
                })
              }
              min={0}
              max={100}
              className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function TextFieldEditor({
  field,
  onChange,
}: {
  field: TextField;
  onChange: (f: SchemaField) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            Default Value
          </label>
          <input
            type="text"
            value={field.defaultValue ?? ""}
            onChange={(e) =>
              onChange({ ...field, defaultValue: e.target.value || undefined })
            }
            className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Max Length</label>
          <input
            type="number"
            value={field.maxLength ?? ""}
            onChange={(e) =>
              onChange({
                ...field,
                maxLength: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            min={1}
            className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={field.multiline || false}
          onChange={(e) => onChange({ ...field, multiline: e.target.checked })}
          className="rounded"
        />
        <span className="text-gray-300">Multiline (textarea)</span>
      </label>
    </div>
  );
}

function ListFieldEditor({
  field,
  onChange,
}: {
  field: ListField;
  onChange: (f: SchemaField) => void;
}) {
  const [newOption, setNewOption] = useState("");

  const addOption = () => {
    if (!newOption.trim()) return;
    onChange({
      ...field,
      options: [...(field.options || []), newOption.trim()],
    });
    setNewOption("");
  };

  const removeOption = (index: number) => {
    onChange({
      ...field,
      options: field.options?.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-gray-400 mb-1">Max Items</label>
        <input
          type="number"
          value={field.maxItems ?? ""}
          onChange={(e) =>
            onChange({
              ...field,
              maxItems: e.target.value ? Number(e.target.value) : undefined,
            })
          }
          min={1}
          className="w-24 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">
          Predefined Options (leave empty for freeform)
        </label>
        <div className="flex flex-wrap gap-2 mb-2">
          {field.options?.map((opt, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-1 bg-gray-700 rounded text-sm"
            >
              {opt}
              <button
                onClick={() => removeOption(i)}
                className="text-gray-400 hover:text-red-400"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newOption}
            onChange={(e) => setNewOption(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addOption()}
            placeholder="Add option..."
            className="flex-1 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm"
          />
          <button
            onClick={addOption}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function BooleanFieldEditor({
  field,
  onChange,
}: {
  field: BooleanField;
  onChange: (f: SchemaField) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div>
        <label className="block text-xs text-gray-400 mb-1">Default</label>
        <select
          value={field.defaultValue ? "true" : "false"}
          onChange={(e) =>
            onChange({ ...field, defaultValue: e.target.value === "true" })
          }
          className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm"
        >
          <option value="false">No</option>
          <option value="true">Yes</option>
        </select>
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">True Label</label>
        <input
          type="text"
          value={field.trueLabel ?? ""}
          onChange={(e) =>
            onChange({ ...field, trueLabel: e.target.value || undefined })
          }
          placeholder="Yes"
          className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">False Label</label>
        <input
          type="text"
          value={field.falseLabel ?? ""}
          onChange={(e) =>
            onChange({ ...field, falseLabel: e.target.value || undefined })
          }
          placeholder="No"
          className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm"
        />
      </div>
    </div>
  );
}

function SelectFieldEditor({
  field,
  onChange,
}: {
  field: SelectField;
  onChange: (f: SchemaField) => void;
}) {
  const [newValue, setNewValue] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const addOption = () => {
    if (!newValue.trim() || !newLabel.trim()) return;
    onChange({
      ...field,
      options: [
        ...field.options,
        { value: newValue.trim(), label: newLabel.trim() },
      ],
    });
    setNewValue("");
    setNewLabel("");
  };

  const removeOption = (index: number) => {
    onChange({
      ...field,
      options: field.options.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-gray-400 mb-1">
          Default Value
        </label>
        <select
          value={field.defaultValue ?? ""}
          onChange={(e) =>
            onChange({ ...field, defaultValue: e.target.value || undefined })
          }
          className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm"
        >
          <option value="">None</option>
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-2">Options</label>
        <div className="space-y-2">
          {field.options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={opt.value}
                onChange={(e) => {
                  const newOptions = [...field.options];
                  newOptions[i] = { ...opt, value: e.target.value };
                  onChange({ ...field, options: newOptions });
                }}
                placeholder="Value"
                className="w-32 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm"
              />
              <input
                type="text"
                value={opt.label}
                onChange={(e) => {
                  const newOptions = [...field.options];
                  newOptions[i] = { ...opt, label: e.target.value };
                  onChange({ ...field, options: newOptions });
                }}
                placeholder="Label"
                className="flex-1 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm"
              />
              <button
                onClick={() => removeOption(i)}
                className="p-1 text-gray-400 hover:text-red-400"
              >
                ✕
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="Value"
              className="w-32 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm"
            />
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addOption()}
              placeholder="Label"
              className="flex-1 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm"
            />
            <button
              onClick={addOption}
              disabled={!newValue.trim() || !newLabel.trim()}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-sm"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// CATEGORY EDITOR
// ============================================

interface CategoryEditorProps {
  categories: { id: string; name: string; order?: number }[];
  onChange: (
    categories: { id: string; name: string; order?: number }[]
  ) => void;
}

function CategoryEditor({ categories, onChange }: CategoryEditorProps) {
  const [newCat, setNewCat] = useState("");

  const addCategory = () => {
    if (!newCat.trim()) return;
    const id = newCat.toLowerCase().replace(/[^a-z0-9]/g, "_");
    onChange([
      ...categories,
      { id, name: newCat.trim(), order: categories.length },
    ]);
    setNewCat("");
  };

  const removeCategory = (id: string) => {
    onChange(categories.filter((c) => c.id !== id));
  };

  const updateCategory = (id: string, name: string) => {
    onChange(categories.map((c) => (c.id === id ? { ...c, name } : c)));
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-300">
        Categories
      </label>
      <div className="space-y-1">
        {categories.map((cat) => (
          <div key={cat.id} className="flex items-center gap-2">
            <input
              type="text"
              value={cat.name}
              onChange={(e) => updateCategory(cat.id, e.target.value)}
              className="flex-1 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm"
            />
            <span className="text-xs text-gray-500">({cat.id})</span>
            <button
              onClick={() => removeCategory(cat.id)}
              className="p-1 text-gray-400 hover:text-red-400"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={newCat}
          onChange={(e) => setNewCat(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCategory()}
          placeholder="New category..."
          className="flex-1 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm"
        />
        <button
          onClick={addCategory}
          disabled={!newCat.trim()}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-sm"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function SchemaEditor({ schema, onChange }: SchemaEditorProps) {
  // Add a new field
  const addField = useCallback(
    (type: SchemaFieldType) => {
      const baseField = {
        id: `field_${schema.fields.length + 1}`,
        name: "New Field",
        type,
        order: schema.fields.length,
      };

      let newField: SchemaField;
      switch (type) {
        case "number":
          newField = { ...baseField, type: "number", defaultValue: 0 };
          break;
        case "derived":
          newField = {
            ...baseField,
            type: "derived",
            formula: "",
            readonly: true,
          };
          break;
        case "resource":
          newField = { ...baseField, type: "resource", defaultMax: 10 };
          break;
        case "text":
          newField = { ...baseField, type: "text" };
          break;
        case "list":
          newField = { ...baseField, type: "list" };
          break;
        case "boolean":
          newField = { ...baseField, type: "boolean" };
          break;
        case "select":
          newField = { ...baseField, type: "select", options: [] };
          break;
        default:
          return;
      }

      onChange({ ...schema, fields: [...schema.fields, newField] });
    },
    [schema, onChange]
  );

  // Update a field
  const updateField = useCallback(
    (index: number, field: SchemaField) => {
      const newFields = [...schema.fields];
      newFields[index] = field;
      onChange({ ...schema, fields: newFields });
    },
    [schema, onChange]
  );

  // Delete a field
  const deleteField = useCallback(
    (index: number) => {
      onChange({
        ...schema,
        fields: schema.fields.filter((_, i) => i !== index),
      });
    },
    [schema, onChange]
  );

  // Move field up/down
  const moveField = useCallback(
    (index: number, direction: "up" | "down") => {
      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= schema.fields.length) return;

      const newFields = [...schema.fields];
      [newFields[index], newFields[newIndex]] = [
        newFields[newIndex],
        newFields[index],
      ];
      onChange({ ...schema, fields: newFields });
    },
    [schema, onChange]
  );

  // Load preset
  const loadPreset = useCallback(
    (presetKey: string) => {
      const preset = PRESET_SCHEMAS[presetKey];
      if (preset) {
        onChange({ ...preset });
      }
    },
    [onChange]
  );

  // Validate schema
  const validation = validateSchema(schema);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <label className="block text-xs text-gray-400 mb-1">
            Schema Name
          </label>
          <input
            type="text"
            value={schema.name}
            onChange={(e) => onChange({ ...schema, name: e.target.value })}
            placeholder="Character System Name..."
            className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white"
          />
        </div>
        <div className="ml-4">
          <label className="block text-xs text-gray-400 mb-1">
            Load Preset
          </label>
          <select
            onChange={(e) => e.target.value && loadPreset(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white"
          >
            <option value="">Select preset...</option>
            <option value="dnd5e">D&D 5e</option>
            <option value="coc">Call of Cthulhu</option>
            <option value="narrative">Narrative (Simple)</option>
          </select>
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Description</label>
        <input
          type="text"
          value={schema.description || ""}
          onChange={(e) =>
            onChange({ ...schema, description: e.target.value || undefined })
          }
          placeholder="Optional system description..."
          className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white"
        />
      </div>

      {/* Categories */}
      <CategoryEditor
        categories={schema.categories || []}
        onChange={(categories) => onChange({ ...schema, categories })}
      />

      {/* Validation */}
      {(!validation.valid || validation.warnings.length > 0) && (
        <div className="space-y-2">
          {validation.errors.map((err, i) => (
            <div
              key={i}
              className="px-3 py-2 bg-red-900/50 border border-red-600 rounded text-red-300 text-sm"
            >
              ⚠️ {err}
            </div>
          ))}
          {validation.warnings.map((warn, i) => (
            <div
              key={i}
              className="px-3 py-2 bg-yellow-900/50 border border-yellow-600 rounded text-yellow-300 text-sm"
            >
              ⚡ {warn}
            </div>
          ))}
        </div>
      )}

      {/* Fields */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-300">
            Fields
          </label>
          <div className="flex gap-2">
            {(Object.keys(FIELD_TYPE_LABELS) as SchemaFieldType[]).map(
              (type) => (
                <button
                  key={type}
                  onClick={() => addField(type)}
                  className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded"
                  title={`Add ${FIELD_TYPE_LABELS[type]} field`}
                >
                  + {FIELD_TYPE_LABELS[type]}
                </button>
              )
            )}
          </div>
        </div>

        <div className="space-y-2">
          {schema.fields.map((field, index) => (
            <FieldEditor
              key={field.id}
              field={field}
              categories={schema.categories || []}
              onChange={(f) => updateField(index, f)}
              onDelete={() => deleteField(index)}
              onMoveUp={index > 0 ? () => moveField(index, "up") : undefined}
              onMoveDown={
                index < schema.fields.length - 1
                  ? () => moveField(index, "down")
                  : undefined
              }
            />
          ))}
          {schema.fields.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No fields defined. Add fields using the buttons above.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
