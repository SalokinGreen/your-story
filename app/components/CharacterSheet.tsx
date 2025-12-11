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
  TemplateContext,
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
  /** Extra context values like playerName and playerSummary */
  context?: TemplateContext;
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

  // Helper to get display name from item (string or object)
  const getItemDisplay = (
    item: string | { name?: string; emoji?: string; [key: string]: unknown }
  ): string => {
    if (typeof item === "string") return item;
    if (item.emoji && item.name) return `${item.emoji} ${item.name}`;
    if (item.name) return item.name;
    return JSON.stringify(item);
  };

  // Helper to parse input - supports plain strings or {name: "x", emoji: "y"} format
  const parseInput = (
    input: string
  ): string | { name: string; emoji?: string; description?: string } => {
    const trimmed = input.trim();
    // Check if it looks like an object: {name: "...", ...}
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        // Try to parse as JSON (convert single quotes to double quotes for flexibility)
        const jsonStr = trimmed.replace(/'/g, '"').replace(/(\w+):/g, '"$1":');
        const parsed = JSON.parse(jsonStr);
        if (parsed && typeof parsed === "object" && parsed.name) {
          return parsed;
        }
      } catch {
        // Not valid JSON, treat as string
      }
    }
    return trimmed;
  };

  const addItem = () => {
    if (!newItem.trim()) return;
    if (field.maxItems && listValue.length >= field.maxItems) return;
    const parsed = parseInput(newItem);
    // Cast to CharacterFieldValue since our type now supports ListItemObject[]
    onChange([...listValue, parsed] as CharacterFieldValue);
    setNewItem("");
  };

  const removeItem = (index: number) => {
    onChange(listValue.filter((_, i) => i !== index) as CharacterFieldValue);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {listValue.map((item, index) => (
          <span
            key={index}
            className="inline-flex items-center gap-1 px-2 py-1 bg-gray-700 rounded text-sm"
          >
            {getItemDisplay(item as string | { name?: string; emoji?: string })}
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
                .filter((opt) => {
                  // Check if opt is already in the list (handle both string and object items)
                  return !listValue.some((item) =>
                    typeof item === "string" ? item === opt : item.name === opt
                  );
                })
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
              placeholder='Add item... or {name: "Item", emoji: "🔫"}'
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
// CUSTOM TEMPLATE RENDERER (Sandboxed iframe with pan/zoom)
// ============================================

interface CustomTemplateRendererProps {
  schema: CharacterSchema;
  data: CharacterData;
  context?: TemplateContext;
}

function CustomTemplateRenderer({
  schema,
  data,
  context,
}: CustomTemplateRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(400);

  // Pan and zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const htmlDoc = useMemo(() => {
    // Get base URL for resolving relative paths like /icons/...
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    return buildTemplateDocument(schema, data.values, context, baseUrl);
  }, [schema, data.values, context]);

  // Auto-resize iframe based on content via postMessage from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (
        event.data?.type === "iframeHeight" &&
        typeof event.data.height === "number"
      ) {
        const newHeight = event.data.height + 32; // Add padding
        setContentHeight((h) => Math.max(h, newHeight)); // Only grow, never shrink unexpectedly
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Handle mouse/touch drag for panning
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only pan if directly clicking the container or iframe wrapper
      if ((e.target as HTMLElement).closest("button")) return;

      setIsDragging(true);
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [pan]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;

      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;

      setPan({
        x: dragStart.current.panX + dx,
        y: dragStart.current.panY + dy,
      });
    },
    [isDragging]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(z + 0.25, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(z - 0.25, 0.25));
  }, []);

  const handleResetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  return (
    <div className="relative w-full">
      {/* Zoom controls */}
      <div className="absolute top-2 right-2 z-10 flex gap-1 bg-gray-800/90 rounded-lg p-1 shadow-lg">
        <button
          onClick={handleZoomOut}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
          title="Zoom out"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M20 12H4"
            />
          </svg>
        </button>
        <button
          onClick={handleResetView}
          className="px-2 h-8 flex items-center justify-center rounded hover:bg-gray-700 text-gray-300 hover:text-white transition-colors text-sm font-medium min-w-12"
          title="Reset view"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={handleZoomIn}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
          title="Zoom in"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
        </button>
      </div>

      {/* Drag hint */}
      {!isDragging && zoom !== 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 text-xs text-gray-400 bg-gray-800/80 px-2 py-1 rounded pointer-events-none">
          Drag to pan
        </div>
      )}

      {/* Container - scrollable at 100% zoom, pannable when zoomed */}
      <div
        ref={containerRef}
        className={`relative w-full rounded-lg bg-gray-900/30 ${
          zoom === 1 ? "overflow-visible" : "overflow-hidden"
        }`}
        style={{
          height: zoom === 1 ? "auto" : `${contentHeight}px`,
          minHeight: "200px",
          cursor: zoom !== 1 ? (isDragging ? "grabbing" : "grab") : "default",
          touchAction: zoom !== 1 ? "none" : "auto",
        }}
        onPointerDown={zoom !== 1 ? handlePointerDown : undefined}
        onPointerMove={zoom !== 1 ? handlePointerMove : undefined}
        onPointerUp={zoom !== 1 ? handlePointerUp : undefined}
        onPointerCancel={zoom !== 1 ? handlePointerUp : undefined}
      >
        <div
          style={{
            transform:
              zoom !== 1
                ? `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
                : "none",
            transformOrigin: "top left",
            width: "100%",
            transition: isDragging ? "none" : "transform 0.1s ease-out",
          }}
        >
          <iframe
            ref={iframeRef}
            srcDoc={htmlDoc}
            sandbox="allow-scripts allow-same-origin"
            className="w-full border-0 bg-transparent pointer-events-none"
            style={{
              height: `${contentHeight}px`,
              minHeight: "200px",
              overflow: "hidden",
            }}
            title="Character Sheet"
            scrolling="no"
          />
        </div>
      </div>
    </div>
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
  context,
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
      <div className={compact ? "text-sm" : ""}>
        <CustomTemplateRenderer schema={schema} data={data} context={context} />
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
