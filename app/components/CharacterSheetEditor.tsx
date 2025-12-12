"use client";

import { useState, useMemo, useEffect } from "react";
import { CharacterSheetTemplate } from "@/app/misc/structs";
import {
  fillTemplate,
  getDefaultValues,
  previewFilledTemplate,
} from "@/app/misc/characterSheetTemplate";
import { DynamicIcon } from "./DynamicIcon";
import ReactMarkdown from "react-markdown";

interface CharacterSheetEditorProps {
  template: CharacterSheetTemplate;
  initialValues?: Record<string, string>;
  onSave: (filledSheet: string, values: Record<string, string>) => void;
  onCancel?: () => void;
}

export default function CharacterSheetEditor({
  template,
  initialValues,
  onSave,
  onCancel,
}: CharacterSheetEditorProps) {
  // Initialize values from props or defaults
  const [values, setValues] = useState<Record<string, string>>(() => {
    const defaults = getDefaultValues(template);
    return initialValues ? { ...defaults, ...initialValues } : defaults;
  });
  const [showPreview, setShowPreview] = useState(false);

  // Update values when template changes
  useEffect(() => {
    const defaults = getDefaultValues(template);
    setValues((prev) => {
      // Keep existing values but add any new fields from template
      const newValues = { ...defaults };
      for (const key of Object.keys(prev)) {
        if (key in newValues) {
          newValues[key] = prev[key];
        }
      }
      return newValues;
    });
  }, [template]);

  // Generate preview
  const preview = useMemo(() => {
    return previewFilledTemplate(template.template, values);
  }, [template.template, values]);

  const handleFieldChange = (fieldName: string, value: string) => {
    setValues((prev) => ({ ...prev, [fieldName]: value }));
  };

  const handleSave = () => {
    const filledSheet = fillTemplate(template.template, values);
    onSave(filledSheet, values);
  };

  const handleReset = () => {
    setValues(getDefaultValues(template));
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <div className="p-2 bg-emerald-500/20 rounded-lg">
            <DynamicIcon name="User" className="w-5 h-5 text-emerald-400" />
          </div>
          Create Your Character
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1.5 ${
              showPreview
                ? "bg-purple-600 text-white"
                : "bg-blue-900/50 text-blue-300 hover:bg-blue-800/50"
            }`}
          >
            <DynamicIcon
              name={showPreview ? "Edit" : "Eye"}
              className="w-4 h-4"
            />
            {showPreview ? "Edit" : "Preview"}
          </button>
          <button
            onClick={handleReset}
            className="px-3 py-1.5 text-sm bg-blue-900/50 text-blue-300 hover:bg-blue-800/50 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <DynamicIcon name="RotateCcw" className="w-4 h-4" />
            Reset
          </button>
        </div>
      </div>

      {showPreview ? (
        /* Preview Mode */
        <div className="bg-linear-to-br from-blue-950/60 to-slate-900/60 rounded-xl border border-blue-800/30 p-6">
          <div className="prose prose-sm prose-invert max-w-none text-blue-50/90 prose-headings:text-white prose-strong:text-white">
            <ReactMarkdown>{preview}</ReactMarkdown>
          </div>
        </div>
      ) : (
        /* Edit Mode - Field Forms */
        <div className="space-y-4">
          {template.fields.map((field, index) => (
            <div
              key={field.name}
              className="bg-linear-to-br from-blue-950/60 to-slate-900/60 rounded-xl border border-blue-800/30 p-4"
            >
              <label className="block mb-2">
                <span className="text-white font-medium">{field.name}</span>
                {field.description && (
                  <span className="text-blue-300/60 text-sm ml-2">
                    — {field.description}
                  </span>
                )}
              </label>
              {/* Use textarea for fields that might be longer */}
              {field.name.toLowerCase().includes("background") ||
              field.name.toLowerCase().includes("appearance") ||
              field.name.toLowerCase().includes("description") ||
              field.name.toLowerCase().includes("history") ||
              field.name.toLowerCase().includes("personality") ||
              field.name.toLowerCase().includes("goals") ||
              field.defaultValue.length > 50 ? (
                <textarea
                  value={values[field.name] || ""}
                  onChange={(e) =>
                    handleFieldChange(field.name, e.target.value)
                  }
                  placeholder={
                    field.defaultValue || `Enter ${field.name.toLowerCase()}...`
                  }
                  className="w-full px-4 py-3 bg-blue-900/40 border border-blue-700/30 rounded-xl text-white text-sm placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none min-h-[100px]"
                  rows={3}
                />
              ) : (
                <input
                  type="text"
                  value={values[field.name] || ""}
                  onChange={(e) =>
                    handleFieldChange(field.name, e.target.value)
                  }
                  placeholder={
                    field.defaultValue || `Enter ${field.name.toLowerCase()}...`
                  }
                  className="w-full px-4 py-2.5 bg-blue-900/40 border border-blue-700/30 rounded-xl text-white text-sm placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-blue-800/30">
        <p className="text-xs text-blue-300/50">
          {template.fields.length} field
          {template.fields.length !== 1 ? "s" : ""} • Fill in your character
          details above
        </p>
        <div className="flex gap-3">
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm text-blue-300 hover:bg-blue-800/50 rounded-lg transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleSave}
            className="px-6 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors flex items-center gap-2 font-medium"
          >
            <DynamicIcon name="Check" className="w-4 h-4" />
            Save Character
          </button>
        </div>
      </div>
    </div>
  );
}
