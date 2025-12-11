"use client";

import React, { useState, useRef, useMemo } from "react";
import {
  CharacterSchema,
  SchemaField,
  NumberField,
  DerivedField,
  ResourceField,
  TextField,
  ListField,
  BooleanField,
  SelectField,
  SchemaResource,
  SchemaTemplate,
  SchemaPage,
  PRESET_SCHEMAS,
} from "@/app/misc/characterSchema";
import { DynamicIcon } from "./DynamicIcon";

// Inline type for categories (matches CharacterSchema.categories)
type SchemaCategory = {
  id: string;
  name: string;
  order?: number;
  collapsed?: boolean;
};

// ============================================
// TYPES
// ============================================

interface CharacterSchemaEditorProps {
  schema: CharacterSchema | null;
  onChange: (schema: CharacterSchema) => void;
}

type FieldType = SchemaField["type"];

const FIELD_TYPE_INFO: Record<
  FieldType,
  { label: string; icon: string; description: string }
> = {
  number: {
    label: "Number",
    icon: "Hash",
    description: "Basic numeric value (e.g., Strength: 16)",
  },
  derived: {
    label: "Derived",
    icon: "Calculator",
    description: "Calculated from formula (e.g., STR_mod = floor((STR-10)/2))",
  },
  resource: {
    label: "Resource",
    icon: "Battery",
    description: "Current/Max pool (e.g., HP: 25/30)",
  },
  text: {
    label: "Text",
    icon: "Type",
    description: "Free-form text field",
  },
  list: {
    label: "List",
    icon: "List",
    description: "Array of items (e.g., skills, languages)",
  },
  boolean: {
    label: "Toggle",
    icon: "ToggleLeft",
    description: "Yes/No flag",
  },
  select: {
    label: "Select",
    icon: "ChevronDown",
    description: "Dropdown with predefined options",
  },
};

// ============================================
// FIELD EDITOR COMPONENT
// ============================================

interface FieldEditorProps {
  field: SchemaField;
  categories: SchemaCategory[];
  onUpdate: (field: SchemaField) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

function FieldEditor({
  field,
  categories,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
}: FieldEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const typeInfo = FIELD_TYPE_INFO[field.type];

  const updateField = (updates: Partial<SchemaField>) => {
    onUpdate({ ...field, ...updates } as SchemaField);
  };

  return (
    <div className="border border-gray-700 rounded-lg bg-gray-900/50">
      {/* Header */}
      <div
        className="flex items-center gap-2 p-3 cursor-pointer hover:bg-gray-800/50"
        onClick={() => setExpanded(!expanded)}
      >
        <DynamicIcon name="GripVertical" className="w-4 h-4 text-gray-500" />
        <DynamicIcon name={typeInfo.icon} className="w-4 h-4 text-blue-400" />
        <span className="font-medium text-white flex-1">
          {field.name || "Unnamed Field"}
        </span>
        <span className="text-xs px-2 py-0.5 bg-blue-900/50 text-blue-300 rounded">
          {typeInfo.label}
        </span>
        <DynamicIcon
          name={expanded ? "ChevronUp" : "ChevronDown"}
          className="w-4 h-4 text-gray-400"
        />
      </div>

      {/* Expanded Editor */}
      {expanded && (
        <div className="p-4 border-t border-gray-700 space-y-4">
          {/* Basic Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Field Name
              </label>
              <input
                type="text"
                value={field.name}
                onChange={(e) => updateField({ name: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white"
                placeholder="e.g., Strength"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Field ID
              </label>
              <input
                type="text"
                value={field.id}
                onChange={(e) => updateField({ id: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white font-mono text-sm"
                placeholder="e.g., STR"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Description
            </label>
            <input
              type="text"
              value={field.description || ""}
              onChange={(e) => updateField({ description: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white"
              placeholder="Optional description"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Category
              </label>
              <select
                value={field.category || ""}
                onChange={(e) =>
                  updateField({ category: e.target.value || undefined })
                }
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white"
              >
                <option value="">No Category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Display Order
              </label>
              <input
                type="number"
                value={field.order ?? 0}
                onChange={(e) =>
                  updateField({ order: parseInt(e.target.value) || 0 })
                }
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white"
              />
            </div>
          </div>

          {/* Type-Specific Fields */}
          {field.type === "number" && (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Default
                </label>
                <input
                  type="number"
                  value={(field as NumberField).defaultValue ?? 0}
                  onChange={(e) =>
                    updateField({
                      defaultValue: parseFloat(e.target.value) || 0,
                    } as Partial<NumberField>)
                  }
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Min</label>
                <input
                  type="number"
                  value={(field as NumberField).min ?? ""}
                  onChange={(e) =>
                    updateField({
                      min: e.target.value
                        ? parseFloat(e.target.value)
                        : undefined,
                    } as Partial<NumberField>)
                  }
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white"
                  placeholder="None"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Max</label>
                <input
                  type="number"
                  value={(field as NumberField).max ?? ""}
                  onChange={(e) =>
                    updateField({
                      max: e.target.value
                        ? parseFloat(e.target.value)
                        : undefined,
                    } as Partial<NumberField>)
                  }
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white"
                  placeholder="None"
                />
              </div>
            </div>
          )}

          {field.type === "derived" && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Formula{" "}
                <span className="text-xs text-gray-500">
                  (use field IDs: floor((STR-10)/2))
                </span>
              </label>
              <input
                type="text"
                value={(field as DerivedField).formula}
                onChange={(e) =>
                  updateField({
                    formula: e.target.value,
                  } as Partial<DerivedField>)
                }
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white font-mono"
                placeholder="e.g., floor((STR-10)/2)"
              />
            </div>
          )}

          {field.type === "resource" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Default Value
                </label>
                <input
                  type="number"
                  value={(field as ResourceField).defaultValue ?? 10}
                  onChange={(e) =>
                    updateField({
                      defaultValue: parseInt(e.target.value) || 0,
                    } as Partial<ResourceField>)
                  }
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Default Max
                </label>
                <input
                  type="number"
                  value={(field as ResourceField).defaultMax ?? 10}
                  onChange={(e) =>
                    updateField({
                      defaultMax: parseInt(e.target.value) || 0,
                    } as Partial<ResourceField>)
                  }
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white"
                  placeholder="e.g., 100"
                />
              </div>
            </div>
          )}

          {field.type === "text" && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={(field as TextField).multiline || false}
                  onChange={(e) =>
                    updateField({
                      multiline: e.target.checked,
                    } as Partial<TextField>)
                  }
                  className="rounded"
                />
                Multiline (textarea)
              </label>
              <input
                type="text"
                value={(field as TextField).placeholder || ""}
                onChange={(e) =>
                  updateField({
                    placeholder: e.target.value,
                  } as Partial<TextField>)
                }
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white"
                placeholder="Placeholder text"
              />
            </div>
          )}

          {field.type === "select" && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Options{" "}
                <span className="text-xs text-gray-500">
                  (one per line: value|label)
                </span>
              </label>
              <textarea
                value={
                  (field as SelectField).options
                    ?.map((o) =>
                      o.label !== o.value ? `${o.value}|${o.label}` : o.value
                    )
                    .join("\n") || ""
                }
                onChange={(e) => {
                  const options = e.target.value
                    .split("\n")
                    .filter((line) => line.trim())
                    .map((line) => {
                      const [value, label] = line.split("|");
                      return {
                        value: value.trim(),
                        label: (label || value).trim(),
                      };
                    });
                  updateField({ options } as Partial<SelectField>);
                }}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white font-mono text-sm"
                rows={4}
                placeholder="option1&#10;option2|Display Label"
              />
            </div>
          )}

          {field.type === "list" && (
            <div className="space-y-2">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Max Items
                </label>
                <input
                  type="number"
                  value={(field as ListField).maxItems ?? ""}
                  onChange={(e) =>
                    updateField({
                      maxItems: e.target.value
                        ? parseInt(e.target.value)
                        : undefined,
                    } as Partial<ListField>)
                  }
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white"
                  placeholder="No limit"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Predefined Options (optional, one per line)
                </label>
                <textarea
                  value={(field as ListField).options?.join("\n") || ""}
                  onChange={(e) =>
                    updateField({
                      options: e.target.value
                        .split("\n")
                        .filter((line) => line.trim())
                        .map((line) => line.trim()),
                    } as Partial<ListField>)
                  }
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white font-mono text-sm"
                  rows={3}
                  placeholder="Option1&#10;Option2"
                />
              </div>
            </div>
          )}

          {field.type === "boolean" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  True Label
                </label>
                <input
                  type="text"
                  value={(field as BooleanField).trueLabel || ""}
                  onChange={(e) =>
                    updateField({
                      trueLabel: e.target.value,
                    } as Partial<BooleanField>)
                  }
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white"
                  placeholder="Yes"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  False Label
                </label>
                <input
                  type="text"
                  value={(field as BooleanField).falseLabel || ""}
                  onChange={(e) =>
                    updateField({
                      falseLabel: e.target.value,
                    } as Partial<BooleanField>)
                  }
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white"
                  placeholder="No"
                />
              </div>
            </div>
          )}

          {/* Common Flags */}
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2 text-gray-300">
              <input
                type="checkbox"
                checked={field.readonly || false}
                onChange={(e) => updateField({ readonly: e.target.checked })}
                className="rounded"
              />
              Read-only
            </label>
            <label className="flex items-center gap-2 text-gray-300">
              <input
                type="checkbox"
                checked={field.hidden || false}
                onChange={(e) => updateField({ hidden: e.target.checked })}
                className="rounded"
              />
              Hidden
            </label>
          </div>

          {/* Actions */}
          <div className="flex justify-between pt-2 border-t border-gray-700">
            <div className="flex gap-2">
              <button
                onClick={onMoveUp}
                disabled={!onMoveUp}
                className="px-2 py-1 text-sm bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded"
              >
                <DynamicIcon name="ChevronUp" className="w-4 h-4" />
              </button>
              <button
                onClick={onMoveDown}
                disabled={!onMoveDown}
                className="px-2 py-1 text-sm bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded"
              >
                <DynamicIcon name="ChevronDown" className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={onDelete}
              className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded"
            >
              Delete Field
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// CATEGORY EDITOR COMPONENT
// ============================================

interface CategoryEditorProps {
  categories: SchemaCategory[];
  onChange: (categories: SchemaCategory[]) => void;
}

function CategoryEditor({ categories, onChange }: CategoryEditorProps) {
  const [newCategoryName, setNewCategoryName] = useState("");

  const addCategory = () => {
    if (!newCategoryName.trim()) return;
    const id = newCategoryName.toLowerCase().replace(/\s+/g, "_");
    onChange([...categories, { id, name: newCategoryName.trim() }]);
    setNewCategoryName("");
  };

  const removeCategory = (id: string) => {
    onChange(categories.filter((c) => c.id !== id));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <span
            key={cat.id}
            className="inline-flex items-center gap-1 px-3 py-1 bg-gray-700 rounded text-sm"
          >
            {cat.name}
            <button
              onClick={() => removeCategory(cat.id)}
              className="text-gray-400 hover:text-red-400 ml-1"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCategory()}
          placeholder="New category name..."
          className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white"
        />
        <button
          onClick={addCategory}
          disabled={!newCategoryName.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded font-medium"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ============================================
// FIELDS SECTION WITH CATEGORY PAGINATION
// ============================================

interface FieldsSectionProps {
  fields: SchemaField[];
  categories: SchemaCategory[];
  onAddField: (type: FieldType) => void;
  onUpdateField: (index: number, field: SchemaField) => void;
  onDeleteField: (index: number) => void;
  onMoveField: (index: number, direction: -1 | 1) => void;
}

function FieldsSection({
  fields,
  categories,
  onAddField,
  onUpdateField,
  onDeleteField,
  onMoveField,
}: FieldsSectionProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("__all__");

  // Build category options including "All Fields" and "Uncategorized"
  const categoryOptions = useMemo(() => {
    const options = [
      { id: "__all__", name: `All Fields (${fields.length})` },
      ...categories.map((cat) => ({
        id: cat.id,
        name: `${cat.name} (${
          fields.filter((f) => f.category === cat.id).length
        })`,
      })),
    ];

    // Add uncategorized if there are any
    const uncategorizedCount = fields.filter((f) => !f.category).length;
    if (uncategorizedCount > 0 || categories.length === 0) {
      options.push({
        id: "__uncategorized__",
        name: `Uncategorized (${uncategorizedCount})`,
      });
    }

    return options;
  }, [fields, categories]);

  // Filter fields by selected category
  const filteredFields = useMemo(() => {
    if (selectedCategory === "__all__") {
      return fields.map((field, index) => ({ field, originalIndex: index }));
    } else if (selectedCategory === "__uncategorized__") {
      return fields
        .map((field, index) => ({ field, originalIndex: index }))
        .filter(({ field }) => !field.category);
    } else {
      return fields
        .map((field, index) => ({ field, originalIndex: index }))
        .filter(({ field }) => field.category === selectedCategory);
    }
  }, [fields, selectedCategory]);

  return (
    <div>
      {/* Header with Category Dropdown */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <h4 className="text-lg font-bold text-white flex items-center gap-2">
          <DynamicIcon name="LayoutList" className="w-5 h-5 text-blue-400" />
          Fields ({fields.length})
        </h4>

        {/* Category Filter Dropdown */}
        {categories.length > 0 && (
          <div className="flex-1 sm:max-w-xs">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white text-sm"
            >
              {categoryOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Add Field Buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(Object.keys(FIELD_TYPE_INFO) as FieldType[]).map((type) => (
          <button
            key={type}
            onClick={() => onAddField(type)}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm flex items-center gap-1.5"
          >
            <DynamicIcon
              name={FIELD_TYPE_INFO[type].icon}
              className="w-4 h-4"
            />
            {FIELD_TYPE_INFO[type].label}
          </button>
        ))}
      </div>

      {/* Field List */}
      <div className="space-y-2">
        {filteredFields.map(({ field, originalIndex }) => (
          <FieldEditor
            key={field.id}
            field={field}
            categories={categories}
            onUpdate={(f) => onUpdateField(originalIndex, f)}
            onDelete={() => onDeleteField(originalIndex)}
            onMoveUp={
              originalIndex > 0
                ? () => onMoveField(originalIndex, -1)
                : undefined
            }
            onMoveDown={
              originalIndex < fields.length - 1
                ? () => onMoveField(originalIndex, 1)
                : undefined
            }
          />
        ))}

        {filteredFields.length === 0 && fields.length > 0 && (
          <div className="text-center py-8 text-gray-500">
            <DynamicIcon
              name="Filter"
              className="w-8 h-8 mx-auto mb-2 opacity-50"
            />
            <p>No fields in this category.</p>
            <p className="text-sm mt-1">
              Add a new field or select a different category.
            </p>
          </div>
        )}

        {fields.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <DynamicIcon
              name="PlusCircle"
              className="w-8 h-8 mx-auto mb-2 opacity-50"
            />
            <p>No fields yet. Click a button above to add your first field.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// TEMPLATE EDITOR COMPONENT
// ============================================

interface TemplateEditorProps {
  template: SchemaTemplate | undefined;
  resources: SchemaResource[] | undefined;
  fields: SchemaField[];
  onChange: (template: SchemaTemplate | undefined) => void;
}

function TemplateEditor({
  template,
  resources,
  fields,
  onChange,
}: TemplateEditorProps) {
  const [activeTab, setActiveTab] = useState<"html" | "css" | "js">("html");

  const currentTemplate: SchemaTemplate = template || {
    html: "",
    css: "",
    js: "",
  };

  const updateTemplate = (updates: Partial<SchemaTemplate>) => {
    const newTemplate = { ...currentTemplate, ...updates };
    // If all fields are empty, set to undefined
    if (!newTemplate.html && !newTemplate.css && !newTemplate.js) {
      onChange(undefined);
    } else {
      onChange(newTemplate);
    }
  };

  const insertFieldPlaceholder = (fieldId: string) => {
    const placeholder = `{{${fieldId}}}`;
    const textarea = document.querySelector(
      `#template-${activeTab}`
    ) as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value =
        activeTab === "html"
          ? currentTemplate.html
          : activeTab === "css"
          ? currentTemplate.css
          : currentTemplate.js || "";
      const newValue = value.slice(0, start) + placeholder + value.slice(end);
      updateTemplate({ [activeTab]: newValue });
    }
  };

  return (
    <div className="space-y-4">
      {/* Warning Banner */}
      {currentTemplate.js && (
        <div className="p-3 bg-yellow-900/30 border border-yellow-600 rounded-lg">
          <div className="flex items-start gap-2">
            <DynamicIcon
              name="AlertTriangle"
              className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5"
            />
            <div className="text-sm">
              <p className="text-yellow-400 font-medium">
                Custom JavaScript Enabled
              </p>
              <p className="text-yellow-500/80">
                This schema contains custom JavaScript code. Players will see a
                security warning before starting adventures using this template.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-700">
        <button
          onClick={() => setActiveTab("html")}
          className={`px-4 py-2 text-sm font-medium rounded-t ${
            activeTab === "html"
              ? "bg-gray-800 text-white border-b-2 border-blue-500"
              : "text-gray-400 hover:text-white"
          }`}
        >
          <DynamicIcon name="Code" className="w-4 h-4 inline mr-1" />
          HTML
        </button>
        <button
          onClick={() => setActiveTab("css")}
          className={`px-4 py-2 text-sm font-medium rounded-t ${
            activeTab === "css"
              ? "bg-gray-800 text-white border-b-2 border-blue-500"
              : "text-gray-400 hover:text-white"
          }`}
        >
          <DynamicIcon name="Palette" className="w-4 h-4 inline mr-1" />
          CSS
        </button>
        <button
          onClick={() => setActiveTab("js")}
          className={`px-4 py-2 text-sm font-medium rounded-t ${
            activeTab === "js"
              ? "bg-gray-800 text-white border-b-2 border-yellow-500"
              : "text-gray-400 hover:text-white"
          }`}
        >
          <DynamicIcon name="Zap" className="w-4 h-4 inline mr-1" />
          JavaScript
          {currentTemplate.js && (
            <span className="ml-1 text-xs text-yellow-400">⚠</span>
          )}
        </button>
      </div>

      {/* Field Placeholders */}
      <div className="flex flex-wrap gap-1.5">
        <span className="text-xs text-gray-500 mr-1 py-1">Insert field:</span>
        {fields.slice(0, 10).map((field) => (
          <button
            key={field.id}
            onClick={() => insertFieldPlaceholder(field.id)}
            className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 rounded"
          >
            {`{{${field.id}}}`}
          </button>
        ))}
        {fields.length > 10 && (
          <span className="text-xs text-gray-500 py-0.5">
            +{fields.length - 10} more
          </span>
        )}
      </div>

      {/* Resource Placeholders */}
      {resources && resources.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-gray-500 mr-1 py-1">
            Insert resource:
          </span>
          {resources.map((res) => (
            <button
              key={res.id}
              onClick={() => insertFieldPlaceholder(`resource:${res.id}`)}
              className="px-2 py-0.5 text-xs bg-purple-700/50 hover:bg-purple-600/50 rounded"
            >
              {`{{resource:${res.id}}}`}
            </button>
          ))}
        </div>
      )}

      {/* Editor */}
      <textarea
        id={`template-${activeTab}`}
        value={
          activeTab === "html"
            ? currentTemplate.html
            : activeTab === "css"
            ? currentTemplate.css
            : currentTemplate.js || ""
        }
        onChange={(e) => updateTemplate({ [activeTab]: e.target.value })}
        placeholder={
          activeTab === "html"
            ? `<div class="character-sheet">\n  <h1>{{characterName}}</h1>\n  <div class="stat">Strength: {{Strength}}</div>\n  {{#if HP}}\n  <div class="hp-bar" style="width: {{percent HP}}%"></div>\n  {{/if}}\n</div>`
            : activeTab === "css"
            ? `.character-sheet {\n  padding: 20px;\n  background: #1a1a2e;\n  border-radius: 12px;\n}\n.stat {\n  font-size: 18px;\n  margin: 8px 0;\n}`
            : `// Access field values via window.characterData\n// Example: const hp = window.getField('HP');\n\nconsole.log('Character loaded:', window.characterData);`
        }
        className="w-full h-64 px-3 py-2 bg-gray-900 border border-gray-700 rounded font-mono text-sm text-gray-300 resize-y"
        spellCheck={false}
      />

      {/* Syntax Help */}
      <details className="text-sm text-gray-400">
        <summary className="cursor-pointer hover:text-white">
          Template Syntax Help
        </summary>
        <div className="mt-2 p-3 bg-gray-800 rounded space-y-2 text-xs">
          <p>
            <code className="text-blue-400">{`{{fieldId}}`}</code> - Insert
            field value
          </p>
          <p>
            <code className="text-blue-400">{`{{fieldId.current}}`}</code> /{" "}
            <code className="text-blue-400">{`{{fieldId.max}}`}</code> -
            Resource sub-values
          </p>
          <p>
            <code className="text-blue-400">{`{{percent fieldId}}`}</code> -
            Resource as percentage (0-100)
          </p>
          <p>
            <code className="text-blue-400">{`{{modifier fieldId}}`}</code> -
            D&D-style modifier ((value-10)/2)
          </p>
          <p>
            <code className="text-blue-400">{`{{resource:resourceId}}`}</code> -
            Uploaded resource URL
          </p>
          <p>
            <code className="text-green-400">{`{{#if fieldId}}...{{/if}}`}</code>{" "}
            - Show content if field is truthy
          </p>
          <p>
            <code className="text-green-400">{`{{#unless fieldId}}...{{/unless}}`}</code>{" "}
            - Show content if field is falsy
          </p>
          <p>
            <code className="text-green-400">{`{{#each fieldId}}{{this}}{{/each}}`}</code>{" "}
            - Loop over list field
          </p>
          <p>
            <code className="text-green-400">{`{{#compare field ">" 10}}...{{/compare}}`}</code>{" "}
            - Comparison (==, !=, &gt;, &lt;, &gt;=, &lt;=)
          </p>
        </div>
      </details>
    </div>
  );
}

// ============================================
// RESOURCE UPLOADER COMPONENT
// ============================================

interface ResourceUploaderProps {
  resources: SchemaResource[];
  onChange: (resources: SchemaResource[]) => void;
  onUpload?: (file: File) => Promise<string>; // Returns URL
}

function ResourceUploader({
  resources,
  onChange,
  onUpload,
}: ResourceUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpload) return;

    setUploading(true);
    try {
      const url = await onUpload(file);
      const id = file.name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
      const type = file.type.startsWith("image/")
        ? "image"
        : file.type.includes("font")
        ? "font"
        : "other";

      onChange([...resources, { id, name: file.name, url, type }]);
    } catch (error) {
      console.error("Upload failed:", error);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeResource = (id: string) => {
    onChange(resources.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.woff,.woff2,.ttf,.otf"
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || !onUpload}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded font-medium flex items-center gap-2"
        >
          <DynamicIcon name="Upload" className="w-4 h-4" />
          {uploading ? "Uploading..." : "Upload Resource"}
        </button>
        {!onUpload && (
          <span className="text-sm text-gray-500">
            Save adventure first to enable uploads
          </span>
        )}
      </div>

      {resources.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {resources.map((res) => (
            <div
              key={res.id}
              className="p-3 bg-gray-800 border border-gray-700 rounded-lg"
            >
              {res.type === "image" ? (
                <img
                  src={res.url}
                  alt={res.name}
                  className="w-full h-20 object-contain bg-gray-900 rounded mb-2"
                />
              ) : (
                <div className="w-full h-20 flex items-center justify-center bg-gray-900 rounded mb-2">
                  <DynamicIcon
                    name={res.type === "font" ? "Type" : "File"}
                    className="w-8 h-8 text-gray-600"
                  />
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="truncate text-sm text-gray-300">{res.name}</div>
                <button
                  onClick={() => removeResource(res.id)}
                  className="text-gray-500 hover:text-red-400 ml-2"
                >
                  <DynamicIcon name="Trash2" className="w-4 h-4" />
                </button>
              </div>
              <div className="text-xs text-gray-500 font-mono truncate">
                {`{{resource:${res.id}}}`}
              </div>
            </div>
          ))}
        </div>
      )}

      {resources.length === 0 && (
        <p className="text-sm text-gray-500">
          Upload images or fonts to use in your custom template.
        </p>
      )}
    </div>
  );
}

// ============================================
// PAGES EDITOR COMPONENT
// ============================================

// Available icons for pages
const PAGE_ICONS = [
  "User",
  "Swords",
  "BookOpen",
  "Backpack",
  "Sparkles",
  "Heart",
  "Shield",
  "Zap",
  "Star",
  "Target",
  "Compass",
  "Map",
  "Scroll",
  "Crown",
  "Gem",
  "Flame",
  "Skull",
  "Brain",
  "Eye",
  "Hand",
  "Footprints",
  "Clock",
];

interface PageEditorProps {
  page: SchemaPage;
  resources: SchemaResource[] | undefined;
  fields: SchemaField[];
  onUpdate: (page: SchemaPage) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

function PageEditor({
  page,
  resources,
  fields,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
}: PageEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"html" | "css" | "js">("html");

  const updateTemplate = (updates: Partial<SchemaTemplate>) => {
    const baseTemplate = page.template || { html: "", css: "", js: "" };
    onUpdate({
      ...page,
      template: { ...baseTemplate, ...updates },
    });
  };

  const insertFieldPlaceholder = (fieldId: string) => {
    const placeholder = `{{${fieldId}}}`;
    const textarea = document.querySelector(
      `#page-${page.id}-${activeTab}`
    ) as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value =
        activeTab === "html"
          ? page.template?.html || ""
          : activeTab === "css"
          ? page.template?.css || ""
          : page.template?.js || "";
      const newValue = value.slice(0, start) + placeholder + value.slice(end);
      updateTemplate({ [activeTab]: newValue });
    }
  };

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      {/* Header - Always visible */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-gray-800 cursor-pointer hover:bg-gray-750"
        onClick={() => setExpanded(!expanded)}
      >
        <DynamicIcon
          name={expanded ? "ChevronDown" : "ChevronRight"}
          className="w-4 h-4 text-gray-400"
        />
        <DynamicIcon
          name={page.icon || "FileText"}
          className="w-4 h-4 text-blue-400"
        />
        <span className="font-medium text-white flex-1">{page.name}</span>
        <span className="text-xs text-gray-500">#{page.order ?? 0}</span>
        <div
          className="flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {onMoveUp && (
            <button
              onClick={onMoveUp}
              className="p-1 text-gray-500 hover:text-white"
              title="Move up"
            >
              <DynamicIcon name="ChevronUp" className="w-4 h-4" />
            </button>
          )}
          {onMoveDown && (
            <button
              onClick={onMoveDown}
              className="p-1 text-gray-500 hover:text-white"
              title="Move down"
            >
              <DynamicIcon name="ChevronDown" className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onDelete}
            className="p-1 text-gray-500 hover:text-red-400"
            title="Delete page"
          >
            <DynamicIcon name="Trash2" className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="p-4 space-y-4 bg-gray-900/50">
          {/* Page Info */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">ID</label>
              <input
                type="text"
                value={page.id}
                onChange={(e) =>
                  onUpdate({
                    ...page,
                    id: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9_-]/g, ""),
                  })
                }
                className="w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-white text-sm"
                placeholder="page-id"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Name</label>
              <input
                type="text"
                value={page.name}
                onChange={(e) => onUpdate({ ...page, name: e.target.value })}
                className="w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-white text-sm"
                placeholder="Page Name"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Order</label>
              <input
                type="number"
                value={page.order ?? 0}
                onChange={(e) =>
                  onUpdate({ ...page, order: parseInt(e.target.value) || 0 })
                }
                className="w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-white text-sm"
              />
            </div>
          </div>

          {/* Icon Selection */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Icon</label>
            <div className="flex flex-wrap gap-1">
              {PAGE_ICONS.map((icon) => (
                <button
                  key={icon}
                  onClick={() => onUpdate({ ...page, icon })}
                  className={`p-1.5 rounded ${
                    page.icon === icon
                      ? "bg-blue-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                  title={icon}
                >
                  <DynamicIcon name={icon} className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>

          {/* Template Editor */}
          <div>
            <label className="block text-xs text-gray-400 mb-2">Template</label>

            {/* HTML/CSS/JS Tabs */}
            <div className="flex gap-1 border-b border-gray-700 mb-2">
              <button
                onClick={() => setActiveTab("html")}
                className={`px-3 py-1.5 text-xs font-medium rounded-t ${
                  activeTab === "html"
                    ? "bg-gray-800 text-white border-b-2 border-blue-500"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                HTML
              </button>
              <button
                onClick={() => setActiveTab("css")}
                className={`px-3 py-1.5 text-xs font-medium rounded-t ${
                  activeTab === "css"
                    ? "bg-gray-800 text-white border-b-2 border-blue-500"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                CSS
              </button>
              <button
                onClick={() => setActiveTab("js")}
                className={`px-3 py-1.5 text-xs font-medium rounded-t ${
                  activeTab === "js"
                    ? "bg-gray-800 text-white border-b-2 border-yellow-500"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                JS
              </button>
            </div>

            {/* Field Placeholders */}
            <div className="flex flex-wrap gap-1 mb-2">
              <span className="text-xs text-gray-500 mr-1 py-0.5">Insert:</span>
              {fields.slice(0, 8).map((field) => (
                <button
                  key={field.id}
                  onClick={() => insertFieldPlaceholder(field.id)}
                  className="px-1.5 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 rounded"
                >
                  {`{{${field.id}}}`}
                </button>
              ))}
              {fields.length > 8 && (
                <span className="text-xs text-gray-500 py-0.5">
                  +{fields.length - 8} more
                </span>
              )}
            </div>

            {/* Editor */}
            <textarea
              id={`page-${page.id}-${activeTab}`}
              value={
                activeTab === "html"
                  ? page.template?.html || ""
                  : activeTab === "css"
                  ? page.template?.css || ""
                  : page.template?.js || ""
              }
              onChange={(e) => updateTemplate({ [activeTab]: e.target.value })}
              placeholder={
                activeTab === "html"
                  ? `<div class="page">\n  <!-- ${page.name} content -->\n</div>`
                  : activeTab === "css"
                  ? `.page {\n  padding: 16px;\n}`
                  : "// Optional JavaScript"
              }
              className="w-full h-40 px-2 py-1.5 bg-gray-900 border border-gray-700 rounded font-mono text-xs text-gray-300 resize-y"
              spellCheck={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface PagesEditorProps {
  pages: SchemaPage[];
  resources: SchemaResource[] | undefined;
  fields: SchemaField[];
  onChange: (pages: SchemaPage[]) => void;
}

function PagesEditor({ pages, resources, fields, onChange }: PagesEditorProps) {
  const addPage = () => {
    const newId = `page_${Date.now()}`;
    const newOrder =
      pages.length > 0 ? Math.max(...pages.map((p) => p.order ?? 0)) + 1 : 0;
    onChange([
      ...pages,
      {
        id: newId,
        name: "New Page",
        icon: "FileText",
        order: newOrder,
        template: { html: "", css: "", js: "" },
      },
    ]);
  };

  const addPresetPages = () => {
    const presets: SchemaPage[] = [
      {
        id: "overview",
        name: "Overview",
        icon: "User",
        order: 0,
        template: {
          html: `<div class="overview-page">
  <h1>{{characterName}}</h1>
  <div class="stats-grid">
    <!-- Add your core stats here -->
  </div>
</div>`,
          css: `.overview-page { padding: 16px; }
.stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }`,
          js: "",
        },
      },
      {
        id: "combat",
        name: "Combat",
        icon: "Swords",
        order: 1,
        template: {
          html: `<div class="combat-page">
  <h2>Combat Stats</h2>
  <!-- HP, Attack, Defense, etc. -->
</div>`,
          css: `.combat-page { padding: 16px; }`,
          js: "",
        },
      },
      {
        id: "skills",
        name: "Skills",
        icon: "BookOpen",
        order: 2,
        template: {
          html: `<div class="skills-page">
  <h2>Skills</h2>
  <!-- Skill list -->
</div>`,
          css: `.skills-page { padding: 16px; }`,
          js: "",
        },
      },
      {
        id: "inventory",
        name: "Inventory",
        icon: "Backpack",
        order: 3,
        template: {
          html: `<div class="inventory-page">
  <h2>Inventory</h2>
  {{#each inventory}}
  <div class="item">{{this}}</div>
  {{/each}}
</div>`,
          css: `.inventory-page { padding: 16px; }
.item { padding: 4px 8px; background: rgba(255,255,255,0.1); margin: 4px 0; border-radius: 4px; }`,
          js: "",
        },
      },
    ];
    onChange([...pages, ...presets]);
  };

  const updatePage = (index: number, page: SchemaPage) => {
    const newPages = [...pages];
    newPages[index] = page;
    onChange(newPages);
  };

  const deletePage = (index: number) => {
    onChange(pages.filter((_, i) => i !== index));
  };

  const movePage = (index: number, direction: number) => {
    if (index + direction < 0 || index + direction >= pages.length) return;
    const newPages = [...pages];
    const temp = newPages[index];
    newPages[index] = newPages[index + direction];
    newPages[index + direction] = temp;
    // Update order values
    newPages.forEach((p, i) => (p.order = i));
    onChange(newPages);
  };

  // Sort pages by order
  const sortedPages = [...pages].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={addPage}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium flex items-center gap-1.5"
        >
          <DynamicIcon name="Plus" className="w-4 h-4" />
          Add Page
        </button>
        {pages.length === 0 && (
          <button
            onClick={addPresetPages}
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 rounded text-sm font-medium flex items-center gap-1.5"
          >
            <DynamicIcon name="Layout" className="w-4 h-4" />
            Add Preset Pages
          </button>
        )}
      </div>

      {sortedPages.length > 0 ? (
        <div className="space-y-2">
          {sortedPages.map((page, index) => {
            const realIndex = pages.findIndex((p) => p.id === page.id);
            return (
              <PageEditor
                key={page.id}
                page={page}
                resources={resources}
                fields={fields}
                onUpdate={(p) => updatePage(realIndex, p)}
                onDelete={() => deletePage(realIndex)}
                onMoveUp={index > 0 ? () => movePage(realIndex, -1) : undefined}
                onMoveDown={
                  index < pages.length - 1
                    ? () => movePage(realIndex, 1)
                    : undefined
                }
              />
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <DynamicIcon
            name="Layers"
            className="w-8 h-8 mx-auto mb-2 opacity-50"
          />
          <p>No pages yet. Add pages to create a multi-tab character sheet.</p>
          <p className="text-xs mt-1">
            Pages replace the single Custom Template with multiple focused tabs.
          </p>
        </div>
      )}

      {/* Info */}
      <div className="text-xs text-gray-500 p-3 bg-gray-800/50 rounded">
        <p>
          <strong>Tip:</strong> Each page appears as a separate tab in the
          character sheet. Use this to organize different aspects like Overview,
          Combat, Skills, Inventory, etc.
        </p>
      </div>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function CharacterSchemaEditor({
  schema,
  onChange,
  onUploadResource,
}: CharacterSchemaEditorProps & {
  onUploadResource?: (file: File) => Promise<string>;
}) {
  const [showPresets, setShowPresets] = useState(!schema);
  const [activeTab, setActiveTab] = useState<"fields" | "pages" | "resources">(
    "fields"
  );

  // Create empty schema if none exists
  const currentSchema: CharacterSchema = schema || {
    name: "Custom Character Sheet",
    description: "",
    version: 1,
    fields: [],
    categories: [],
  };

  const updateSchema = (updates: Partial<CharacterSchema>) => {
    // If template has JS, mark hasCustomJS
    const newSchema = { ...currentSchema, ...updates };
    if (updates.template?.js) {
      newSchema.hasCustomJS = true;
    } else if (updates.template && !updates.template.js) {
      newSchema.hasCustomJS = false;
    }
    onChange(newSchema);
  };

  const addField = (type: FieldType) => {
    const baseField = {
      id: `field_${Date.now()}`,
      name: `New ${FIELD_TYPE_INFO[type].label}`,
      type,
    };

    let newField: SchemaField;
    switch (type) {
      case "number":
        newField = {
          ...baseField,
          type: "number",
          defaultValue: 10,
        } as NumberField;
        break;
      case "derived":
        newField = {
          ...baseField,
          type: "derived",
          formula: "0",
        } as DerivedField;
        break;
      case "resource":
        newField = {
          ...baseField,
          type: "resource",
          defaultValue: 10,
          defaultMax: 10,
        } as ResourceField;
        break;
      case "text":
        newField = { ...baseField, type: "text" } as TextField;
        break;
      case "list":
        newField = { ...baseField, type: "list" } as ListField;
        break;
      case "boolean":
        newField = {
          ...baseField,
          type: "boolean",
          defaultValue: false,
        } as BooleanField;
        break;
      case "select":
        newField = { ...baseField, type: "select", options: [] } as SelectField;
        break;
      default:
        return;
    }

    updateSchema({ fields: [...currentSchema.fields, newField] });
  };

  const updateField = (index: number, field: SchemaField) => {
    const fields = [...currentSchema.fields];
    fields[index] = field;
    updateSchema({ fields });
  };

  const deleteField = (index: number) => {
    updateSchema({
      fields: currentSchema.fields.filter((_, i) => i !== index),
    });
  };

  const moveField = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= currentSchema.fields.length) return;
    const fields = [...currentSchema.fields];
    [fields[index], fields[newIndex]] = [fields[newIndex], fields[index]];
    updateSchema({ fields });
  };

  const loadPreset = (presetId: string) => {
    const preset = PRESET_SCHEMAS[presetId as keyof typeof PRESET_SCHEMAS];
    if (preset) {
      onChange({
        ...preset,
      });
      setShowPresets(false);
    }
  };

  // Preset Selection UI
  if (showPresets && !schema) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h3 className="text-xl font-bold text-white mb-2">
            Choose a Starting Template
          </h3>
          <p className="text-gray-400">Select a preset or start from scratch</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Object.entries(PRESET_SCHEMAS).map(([id, preset]) => (
            <button
              key={id}
              onClick={() => loadPreset(id)}
              className="p-4 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-left transition-colors"
            >
              <h4 className="font-bold text-white mb-1">{preset.name}</h4>
              <p className="text-sm text-gray-400 mb-2">{preset.description}</p>
              <p className="text-xs text-blue-400">
                {preset.fields.length} fields, {preset.categories?.length || 0}{" "}
                categories
              </p>
            </button>
          ))}

          <button
            onClick={() => {
              onChange(currentSchema);
              setShowPresets(false);
            }}
            className="p-4 bg-gray-900 hover:bg-gray-800 border border-dashed border-gray-600 rounded-lg text-left transition-colors"
          >
            <h4 className="font-bold text-white mb-1">Start from Scratch</h4>
            <p className="text-sm text-gray-400">
              Build your own character sheet from the ground up
            </p>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Schema Info */}
      <div className="space-y-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Schema Name
            </label>
            <input
              type="text"
              value={currentSchema.name}
              onChange={(e) => updateSchema({ name: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white"
              placeholder="e.g., D&D 5e Character"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Version</label>
            <input
              type="number"
              value={currentSchema.version}
              onChange={(e) =>
                updateSchema({ version: parseInt(e.target.value) || 1 })
              }
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white"
              placeholder="1"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">
            Description
          </label>
          <input
            type="text"
            value={currentSchema.description || ""}
            onChange={(e) => updateSchema({ description: e.target.value })}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white"
            placeholder="Describe this character sheet type"
          />
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-gray-700 overflow-x-auto">
        <button
          onClick={() => setActiveTab("fields")}
          className={`px-4 py-2 font-medium rounded-t flex items-center gap-2 whitespace-nowrap ${
            activeTab === "fields"
              ? "bg-gray-800 text-white border-b-2 border-blue-500"
              : "text-gray-400 hover:text-white"
          }`}
        >
          <DynamicIcon name="LayoutList" className="w-4 h-4" />
          Fields
          <span className="text-xs bg-gray-700 px-1.5 rounded">
            {currentSchema.fields.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("pages")}
          className={`px-4 py-2 font-medium rounded-t flex items-center gap-2 whitespace-nowrap ${
            activeTab === "pages"
              ? "bg-gray-800 text-white border-b-2 border-cyan-500"
              : "text-gray-400 hover:text-white"
          }`}
        >
          <DynamicIcon name="Layers" className="w-4 h-4" />
          Pages
          {currentSchema.pages && currentSchema.pages.length > 0 && (
            <span className="text-xs bg-gray-700 px-1.5 rounded">
              {currentSchema.pages.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("resources")}
          className={`px-4 py-2 font-medium rounded-t flex items-center gap-2 whitespace-nowrap ${
            activeTab === "resources"
              ? "bg-gray-800 text-white border-b-2 border-green-500"
              : "text-gray-400 hover:text-white"
          }`}
        >
          <DynamicIcon name="Image" className="w-4 h-4" />
          Resources
          {currentSchema.resources && currentSchema.resources.length > 0 && (
            <span className="text-xs bg-gray-700 px-1.5 rounded">
              {currentSchema.resources.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "fields" && (
        <>
          {/* Categories */}
          <div>
            <h4 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
              <DynamicIcon name="Folder" className="w-5 h-5 text-blue-400" />
              Categories
            </h4>
            <CategoryEditor
              categories={currentSchema.categories || []}
              onChange={(categories) => updateSchema({ categories })}
            />
          </div>

          {/* Fields */}
          <FieldsSection
            fields={currentSchema.fields}
            categories={currentSchema.categories || []}
            onAddField={addField}
            onUpdateField={updateField}
            onDeleteField={deleteField}
            onMoveField={moveField}
          />
        </>
      )}

      {activeTab === "pages" && (
        <div>
          <div className="mb-4">
            <h4 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <DynamicIcon name="Layers" className="w-5 h-5 text-cyan-400" />
              Character Sheet Pages
            </h4>
            <p className="text-sm text-gray-400">
              Create multiple pages for your character sheet. Each page appears
              as a separate tab in the stats panel, allowing you to organize
              information (Overview, Combat, Skills, Inventory, etc.).
            </p>
          </div>
          <PagesEditor
            pages={currentSchema.pages || []}
            resources={currentSchema.resources}
            fields={currentSchema.fields}
            onChange={(pages) => updateSchema({ pages })}
          />
        </div>
      )}

      {activeTab === "resources" && (
        <div>
          <div className="mb-4">
            <h4 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <DynamicIcon name="Image" className="w-5 h-5 text-green-400" />
              Template Resources
            </h4>
            <p className="text-sm text-gray-400">
              Upload images, icons, or fonts to use in your custom template.
              Reference them with{" "}
              <code className="text-blue-400">{`{{resource:id}}`}</code>.
            </p>
          </div>
          <ResourceUploader
            resources={currentSchema.resources || []}
            onChange={(resources) => updateSchema({ resources })}
            onUpload={onUploadResource}
          />
        </div>
      )}

      {/* Load Preset Button */}
      <div className="text-center pt-4 border-t border-gray-700">
        <button
          onClick={() => setShowPresets(true)}
          className="text-sm text-blue-400 hover:text-blue-300"
        >
          Load a preset template...
        </button>
      </div>
    </div>
  );
}
