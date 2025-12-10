"use client";

import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from "react";
import {
  CharacterSchema,
  CharacterData,
  SchemaField,
  NumberField,
  DerivedField,
  ResourceField,
  TextField,
  ListField,
  BooleanField,
  SelectField,
  CharacterFieldValue,
  recalculateDerivedFields,
  getNumericValue,
  buildTemplateDocument,
} from "@/app/misc/characterSchema";

// ============================================
// TYPES
// ============================================

interface CharacterSheetProps {
  schema: CharacterSchema;
  data: CharacterData;
  onChange?: (data: CharacterData) => void;
  readOnly?: boolean;
  compact?: boolean;
}

interface FieldInputProps<T extends SchemaField> {
  field: T;
  value: CharacterFieldValue;
  onChange: (value: CharacterFieldValue) => void;
  readOnly?: boolean;
}

// ============================================
// FIELD COMPONENTS
// ============================================

function NumberFieldInput({
  field,
  value,
  onChange,
  readOnly,
}: FieldInputProps<NumberField>) {
  const numValue = typeof value === "number" ? value : 0;

  return (
    <input
      type="number"
      value={numValue}
      onChange={(e) => onChange(Number(e.target.value))}
      min={field.min}
      max={field.max}
      step={field.step || 1}
      disabled={readOnly || field.readonly}
      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg 
                 text-white focus:border-blue-500 focus:outline-none
                 disabled:opacity-50 disabled:cursor-not-allowed"
    />
  );
}

function DerivedFieldDisplay({ field, value }: FieldInputProps<DerivedField>) {
  const numValue = typeof value === "number" ? value : 0;
  const displayValue = numValue >= 0 ? `+${numValue}` : String(numValue);

  return (
    <div className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-300">
      {displayValue}
    </div>
  );
}

function ResourceFieldInput({
  field,
  value,
  onChange,
  readOnly,
}: FieldInputProps<ResourceField>) {
  const resourceValue =
    typeof value === "object" && "current" in value
      ? value
      : { current: 0, max: 0 };

  const updateCurrent = (current: number) => {
    onChange({
      ...resourceValue,
      current: Math.max(0, Math.min(current, resourceValue.max)),
    });
  };

  const updateMax = (max: number) => {
    const newMax = Math.max(0, max);
    onChange({ current: Math.min(resourceValue.current, newMax), max: newMax });
  };

  const percentage =
    resourceValue.max > 0
      ? (resourceValue.current / resourceValue.max) * 100
      : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={resourceValue.current}
          onChange={(e) => updateCurrent(Number(e.target.value))}
          min={0}
          max={resourceValue.max}
          disabled={readOnly || field.readonly}
          className="w-20 px-2 py-1 bg-gray-800 border border-gray-600 rounded 
                     text-white text-center focus:border-blue-500 focus:outline-none
                     disabled:opacity-50"
        />
        <span className="text-gray-400">/</span>
        <input
          type="number"
          value={resourceValue.max}
          onChange={(e) => updateMax(Number(e.target.value))}
          min={0}
          disabled={readOnly || field.readonly}
          className="w-20 px-2 py-1 bg-gray-800 border border-gray-600 rounded 
                     text-white text-center focus:border-blue-500 focus:outline-none
                     disabled:opacity-50"
        />
      </div>
      {/* Progress bar */}
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-linear-to-r from-red-500 via-yellow-500 to-green-500 transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function TextFieldInput({
  field,
  value,
  onChange,
  readOnly,
}: FieldInputProps<TextField>) {
  const strValue = typeof value === "string" ? value : "";

  if (field.multiline) {
    return (
      <textarea
        value={strValue}
        onChange={(e) => onChange(e.target.value)}
        maxLength={field.maxLength}
        placeholder={field.placeholder}
        disabled={readOnly || field.readonly}
        className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg 
                   text-white focus:border-blue-500 focus:outline-none resize-y min-h-20
                   disabled:opacity-50 disabled:cursor-not-allowed"
      />
    );
  }

  return (
    <input
      type="text"
      value={strValue}
      onChange={(e) => onChange(e.target.value)}
      maxLength={field.maxLength}
      placeholder={field.placeholder}
      disabled={readOnly || field.readonly}
      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg 
                 text-white focus:border-blue-500 focus:outline-none
                 disabled:opacity-50 disabled:cursor-not-allowed"
    />
  );
}

function ListFieldInput({
  field,
  value,
  onChange,
  readOnly,
}: FieldInputProps<ListField>) {
  const listValue = Array.isArray(value) ? value : [];
  const [newItem, setNewItem] = useState("");

  const addItem = () => {
    if (!newItem.trim()) return;
    if (field.maxItems && listValue.length >= field.maxItems) return;
    onChange([...listValue, newItem.trim()]);
    setNewItem("");
  };

  const removeItem = (index: number) => {
    onChange(listValue.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {listValue.map((item, index) => (
          <span
            key={index}
            className="inline-flex items-center gap-1 px-2 py-1 bg-gray-700 rounded text-sm"
          >
            {item}
            {!readOnly && !field.readonly && (
              <button
                onClick={() => removeItem(index)}
                className="text-gray-400 hover:text-red-400"
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {!readOnly && !field.readonly && (
        <div className="flex gap-2">
          {field.options ? (
            <select
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              className="flex-1 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white"
            >
              <option value="">Select...</option>
              {field.options
                .filter((opt) => !listValue.includes(opt))
                .map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
            </select>
          ) : (
            <input
              type="text"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
              placeholder="Add item..."
              className="flex-1 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white"
            />
          )}
          <button
            onClick={addItem}
            disabled={
              !newItem.trim() ||
              (field.maxItems !== undefined &&
                listValue.length >= field.maxItems)
            }
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

function BooleanFieldInput({
  field,
  value,
  onChange,
  readOnly,
}: FieldInputProps<BooleanField>) {
  const boolValue = typeof value === "boolean" ? value : false;

  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={boolValue}
        onChange={(e) => onChange(e.target.checked)}
        disabled={readOnly || field.readonly}
        className="w-5 h-5 rounded border-gray-600 bg-gray-800 text-blue-500 
                   focus:ring-blue-500 focus:ring-2"
      />
      <span className="text-gray-300">
        {boolValue ? field.trueLabel || "Yes" : field.falseLabel || "No"}
      </span>
    </label>
  );
}

function SelectFieldInput({
  field,
  value,
  onChange,
  readOnly,
}: FieldInputProps<SelectField>) {
  const strValue = typeof value === "string" ? value : "";

  return (
    <select
      value={strValue}
      onChange={(e) => onChange(e.target.value)}
      disabled={readOnly || field.readonly}
      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg 
                 text-white focus:border-blue-500 focus:outline-none
                 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <option value="">Select...</option>
      {field.options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// ============================================
// FIELD WRAPPER
// ============================================

interface FieldWrapperProps {
  field: SchemaField;
  children: React.ReactNode;
}

function FieldWrapper({ field, children }: FieldWrapperProps) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-300">
        {field.name}
        {field.readonly && (
          <span className="ml-1 text-xs text-gray-500">(auto)</span>
        )}
      </label>
      {children}
      {field.description && (
        <p className="text-xs text-gray-500">{field.description}</p>
      )}
    </div>
  );
}

// ============================================
// CUSTOM TEMPLATE RENDERER (Sandboxed iframe)
// ============================================

interface CustomTemplateRendererProps {
  schema: CharacterSchema;
  data: CharacterData;
}

function CustomTemplateRenderer({ schema, data }: CustomTemplateRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(600);

  const htmlDoc = useMemo(() => {
    return buildTemplateDocument(schema, data.values);
  }, [schema, data.values]);

  // Auto-resize iframe based on content
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const updateHeight = () => {
      try {
        const doc = iframe.contentDocument;
        if (doc) {
          // Try multiple methods to get accurate content height
          const body = doc.body;
          const html = doc.documentElement;

          if (body && html) {
            const contentHeight = Math.max(
              body.scrollHeight,
              body.offsetHeight,
              html.clientHeight,
              html.scrollHeight,
              html.offsetHeight
            );
            // Set height with some padding, no upper limit
            if (contentHeight > 0) {
              setHeight(contentHeight + 40);
            }
          }
        }
      } catch {
        // Cross-origin issues - use default height
      }
    };

    const handleLoad = () => {
      // Multiple measurements to catch font loading and async content
      updateHeight();
      setTimeout(updateHeight, 100);
      setTimeout(updateHeight, 300);
      setTimeout(updateHeight, 600);
      setTimeout(updateHeight, 1000);
    };

    iframe.addEventListener("load", handleLoad);
    return () => iframe.removeEventListener("load", handleLoad);
  }, [htmlDoc]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={htmlDoc}
      sandbox="allow-scripts"
      className="w-full border-0 rounded-lg bg-transparent"
      style={{ height: `${height}px`, minHeight: "400px", overflow: "hidden" }}
      title="Character Sheet"
      scrolling="no"
    />
  );
}

// ============================================
// CATEGORY GROUP
// ============================================

interface CategoryGroupProps {
  category: { id: string; name: string; collapsed?: boolean };
  fields: SchemaField[];
  values: Record<string, CharacterFieldValue>;
  onFieldChange: (fieldId: string, value: CharacterFieldValue) => void;
  readOnly?: boolean;
}

function CategoryGroup({
  category,
  fields,
  values,
  onFieldChange,
  readOnly,
}: CategoryGroupProps) {
  const [collapsed, setCollapsed] = useState(category.collapsed ?? false);

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full px-4 py-2 bg-gray-800 flex items-center justify-between 
                   text-left font-medium text-white hover:bg-gray-750"
      >
        {category.name}
        <span className="text-gray-400">{collapsed ? "▶" : "▼"}</span>
      </button>
      {!collapsed && (
        <div className="p-4 space-y-4 bg-gray-900/50">
          {fields.map((field) => (
            <FieldWrapper key={field.id} field={field}>
              <FieldRenderer
                field={field}
                value={values[field.id]}
                onChange={(v) => onFieldChange(field.id, v)}
                readOnly={readOnly}
              />
            </FieldWrapper>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// FIELD RENDERER
// ============================================

interface FieldRendererProps {
  field: SchemaField;
  value: CharacterFieldValue;
  onChange: (value: CharacterFieldValue) => void;
  readOnly?: boolean;
}

function FieldRenderer({
  field,
  value,
  onChange,
  readOnly,
}: FieldRendererProps) {
  switch (field.type) {
    case "number":
      return (
        <NumberFieldInput
          field={field}
          value={value}
          onChange={onChange}
          readOnly={readOnly}
        />
      );
    case "derived":
      return (
        <DerivedFieldDisplay
          field={field}
          value={value}
          onChange={onChange}
          readOnly={readOnly}
        />
      );
    case "resource":
      return (
        <ResourceFieldInput
          field={field}
          value={value}
          onChange={onChange}
          readOnly={readOnly}
        />
      );
    case "text":
      return (
        <TextFieldInput
          field={field}
          value={value}
          onChange={onChange}
          readOnly={readOnly}
        />
      );
    case "list":
      return (
        <ListFieldInput
          field={field}
          value={value}
          onChange={onChange}
          readOnly={readOnly}
        />
      );
    case "boolean":
      return (
        <BooleanFieldInput
          field={field}
          value={value}
          onChange={onChange}
          readOnly={readOnly}
        />
      );
    case "select":
      return (
        <SelectFieldInput
          field={field}
          value={value}
          onChange={onChange}
          readOnly={readOnly}
        />
      );
    default:
      return <div className="text-red-500">Unknown field type</div>;
  }
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function CharacterSheet({
  schema,
  data,
  onChange,
  readOnly = false,
  compact = false,
}: CharacterSheetProps) {
  // Check if schema has a custom template
  const hasCustomTemplate = Boolean(schema.template?.html);

  // Handle field value changes
  const handleFieldChange = useCallback(
    (fieldId: string, value: CharacterFieldValue) => {
      if (!onChange) return;

      const newValues = { ...data.values, [fieldId]: value };

      // Recalculate derived fields
      recalculateDerivedFields(schema, newValues);

      onChange({ values: newValues });
    },
    [schema, data.values, onChange]
  );

  // Group fields by category
  const { categorizedFields, uncategorizedFields } = useMemo(() => {
    const categorized: Record<string, SchemaField[]> = {};
    const uncategorized: SchemaField[] = [];

    for (const field of schema.fields) {
      if (field.hidden) continue;

      if (field.category) {
        if (!categorized[field.category]) {
          categorized[field.category] = [];
        }
        categorized[field.category].push(field);
      } else {
        uncategorized.push(field);
      }
    }

    // Sort fields by order within each category
    for (const category of Object.keys(categorized)) {
      categorized[category].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }

    return {
      categorizedFields: categorized,
      uncategorizedFields: uncategorized,
    };
  }, [schema.fields]);

  // Sort categories by order
  const sortedCategories = useMemo(() => {
    if (!schema.categories) return [];
    return [...schema.categories].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0)
    );
  }, [schema.categories]);

  // If there's a custom template, render it (read-only mode only for custom templates)
  if (hasCustomTemplate && readOnly) {
    return (
      <div className={`space-y-4 ${compact ? "text-sm" : ""}`}>
        {/* Schema header */}
        {!compact && (
          <div className="border-b border-gray-700 pb-2">
            <h2 className="text-xl font-bold text-white">{schema.name}</h2>
            {schema.description && (
              <p className="text-sm text-gray-400">{schema.description}</p>
            )}
          </div>
        )}
        <CustomTemplateRenderer schema={schema} data={data} />
      </div>
    );
  }

  // Default rendering (editable or no custom template)
  return (
    <div className={`space-y-4 ${compact ? "text-sm" : ""}`}>
      {/* Schema header */}
      {!compact && (
        <div className="border-b border-gray-700 pb-2">
          <h2 className="text-xl font-bold text-white">{schema.name}</h2>
          {schema.description && (
            <p className="text-sm text-gray-400">{schema.description}</p>
          )}
        </div>
      )}

      {/* Categorized fields */}
      {sortedCategories.map((category) => {
        const fields = categorizedFields[category.id] || [];
        if (fields.length === 0) return null;

        return (
          <CategoryGroup
            key={category.id}
            category={category}
            fields={fields}
            values={data.values}
            onFieldChange={handleFieldChange}
            readOnly={readOnly}
          />
        );
      })}

      {/* Uncategorized fields */}
      {uncategorizedFields.length > 0 && (
        <div className="space-y-4 p-4 border border-gray-700 rounded-lg">
          {uncategorizedFields.map((field) => (
            <FieldWrapper key={field.id} field={field}>
              <FieldRenderer
                field={field}
                value={data.values[field.id]}
                onChange={(v) => handleFieldChange(field.id, v)}
                readOnly={readOnly}
              />
            </FieldWrapper>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// EXPORTS
// ============================================

export { FieldRenderer, FieldWrapper, CategoryGroup };
