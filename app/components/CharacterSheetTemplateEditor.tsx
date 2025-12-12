"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  CharacterSheetTemplate,
  CharacterSheetField,
} from "@/app/misc/structs";
import {
  parseTemplateFields,
  validateTemplate,
  fillTemplate,
  getDefaultValues,
  DEFAULT_CHARACTER_SHEET_TEMPLATE,
  CHARACTER_SHEET_PRESET_TEMPLATES,
} from "@/app/misc/characterSheetTemplate";
import { DynamicIcon } from "./DynamicIcon";
import ReactMarkdown from "react-markdown";

interface CharacterSheetTemplateEditorProps {
  template?: CharacterSheetTemplate;
  onChange: (template: CharacterSheetTemplate) => void;
}

export default function CharacterSheetTemplateEditor({
  template,
  onChange,
}: CharacterSheetTemplateEditorProps) {
  const [templateText, setTemplateText] = useState(
    template?.template || DEFAULT_CHARACTER_SHEET_TEMPLATE
  );
  const [showPreview, setShowPreview] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Sync internal state when prop changes (e.g., from AI tool)
  useEffect(() => {
    if (template?.template && template.template !== templateText) {
      setTemplateText(template.template);
    }
  }, [template?.template]);

  // Parse fields and validate
  const { fields, errors } = useMemo(() => {
    const parsedFields = parseTemplateFields(templateText);
    const validationErrors = validateTemplate(templateText);
    return { fields: parsedFields, errors: validationErrors };
  }, [templateText]);

  // Generate preview with default values
  const preview = useMemo(() => {
    const values: Record<string, string> = {};
    for (const field of fields) {
      values[field.name] = field.defaultValue;
    }
    return fillTemplate(templateText, values);
  }, [templateText, fields]);

  const handleTemplateChange = useCallback(
    (newTemplate: string) => {
      setTemplateText(newTemplate);
      const newFields = parseTemplateFields(newTemplate);
      onChange({ template: newTemplate, fields: newFields });
    },
    [onChange]
  );

  const handlePresetSelect = (presetId: string) => {
    const preset = CHARACTER_SHEET_PRESET_TEMPLATES.find(
      (p) => p.id === presetId
    );
    if (preset) {
      handleTemplateChange(preset.template);
    }
  };

  const insertField = () => {
    const fieldName = prompt("Field name (e.g., 'Class', 'Background'):");
    if (!fieldName) return;
    const description = prompt("Description (help text for the player):") || "";
    const defaultValue = prompt("Default value:") || "";

    const placeholder = `{{${fieldName} | ${description} | ${defaultValue}}}`;
    setTemplateText((prev) => prev + "\n" + placeholder);
    handleTemplateChange(templateText + "\n" + placeholder);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <DynamicIcon name="FileText" className="w-5 h-5 text-emerald-400" />
            Character Sheet Template
          </h3>
          <p className="text-xs text-blue-300/60 mt-1">
            Define what players fill out when creating a custom character
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHelp(!showHelp)}
            className={`p-2 rounded-lg transition-colors ${
              showHelp
                ? "bg-amber-600 text-white"
                : "bg-blue-900/50 text-blue-300 hover:bg-blue-800/50"
            }`}
            title="Syntax Help"
          >
            <DynamicIcon name="HelpCircle" className="w-4 h-4" />
          </button>
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
        </div>
      </div>

      {/* Help Panel */}
      {showHelp && (
        <div className="bg-amber-950/30 border border-amber-700/30 rounded-xl p-4 text-sm">
          <h4 className="font-medium text-amber-300 mb-2 flex items-center gap-2">
            <DynamicIcon name="Info" className="w-4 h-4" />
            Template Syntax
          </h4>
          <p className="text-amber-100/80 mb-3">
            Use{" "}
            <code className="bg-amber-900/50 px-1.5 py-0.5 rounded text-amber-200">
              {"{{FieldName | Description | DefaultValue}}"}
            </code>{" "}
            to create fillable fields.
          </p>
          <div className="space-y-2 text-amber-100/70">
            <p>
              • <strong>FieldName:</strong> Label shown to the player
            </p>
            <p>
              • <strong>Description:</strong> Help text explaining the field
            </p>
            <p>
              • <strong>DefaultValue:</strong> Pre-filled if player doesn't
              change it
            </p>
          </div>
          <div className="mt-3 p-2 bg-amber-900/30 rounded-lg">
            <p className="text-xs text-amber-200/60 mb-1">Example:</p>
            <code className="text-xs text-amber-100">
              {"# {{Name | Your character's name | Hero}}"}
            </code>
          </div>
        </div>
      )}

      {/* Preset Templates */}
      <div className="flex flex-wrap gap-2">
        {CHARACTER_SHEET_PRESET_TEMPLATES.map((preset) => (
          <button
            key={preset.id}
            onClick={() => handlePresetSelect(preset.id)}
            className="px-3 py-1.5 text-xs bg-blue-900/40 hover:bg-blue-800/50 border border-blue-700/30 rounded-lg text-blue-200 transition-colors"
            title={preset.description}
          >
            {preset.name}
          </button>
        ))}
        <button
          onClick={insertField}
          className="px-3 py-1.5 text-xs bg-emerald-900/40 hover:bg-emerald-800/50 border border-emerald-700/30 rounded-lg text-emerald-200 transition-colors flex items-center gap-1"
        >
          <DynamicIcon name="Plus" className="w-3 h-3" />
          Add Field
        </button>
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="bg-red-950/30 border border-red-700/30 rounded-xl p-3">
          <p className="text-red-300 text-sm font-medium mb-1">
            Template Errors:
          </p>
          <ul className="text-red-200/80 text-xs space-y-1">
            {errors.map((error, i) => (
              <li key={i}>• {error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Editor / Preview */}
      {showPreview ? (
        <div className="bg-linear-to-br from-blue-950/60 to-slate-900/60 rounded-xl border border-blue-800/30 p-6">
          <p className="text-xs text-blue-300/50 mb-3">
            Preview with default values:
          </p>
          <div className="prose prose-sm prose-invert max-w-none text-blue-50/90 prose-headings:text-white prose-strong:text-white">
            <ReactMarkdown>{preview}</ReactMarkdown>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <textarea
            value={templateText}
            onChange={(e) => handleTemplateChange(e.target.value)}
            placeholder="Enter your character sheet template..."
            className="w-full h-64 px-4 py-3 bg-blue-900/40 border border-blue-700/30 rounded-xl text-white text-sm placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono resize-none"
          />
          <p className="text-xs text-blue-300/50">
            Supports Markdown formatting. Use{" "}
            {"{{Field | Description | Default}}"} for fillable fields.
          </p>
        </div>
      )}

      {/* Extracted Fields Summary */}
      {fields.length > 0 && (
        <div className="bg-blue-950/40 rounded-xl border border-blue-800/30 p-4">
          <h4 className="text-sm font-medium text-blue-200 mb-3 flex items-center gap-2">
            <DynamicIcon name="List" className="w-4 h-4" />
            Detected Fields ({fields.length})
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {fields.map((field, index) => (
              <div
                key={field.name}
                className="flex items-start gap-2 p-2 bg-blue-900/30 rounded-lg"
              >
                <span className="text-emerald-400 font-medium text-sm">
                  {field.name}
                </span>
                {field.description && (
                  <span className="text-blue-300/50 text-xs truncate">
                    {field.description}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
