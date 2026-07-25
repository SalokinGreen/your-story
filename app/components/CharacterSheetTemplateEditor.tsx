"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { CharacterSheetTemplate } from "@/app/misc/structs";
import {
  parseTemplateFields,
  validateTemplate,
  fillTemplate,
  DEFAULT_CHARACTER_SHEET_TEMPLATE,
  CHARACTER_SHEET_PRESET_TEMPLATES,
} from "@/app/misc/characterSheetTemplate";
import { DynamicIcon } from "./DynamicIcon";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { preprocessMarkdown } from "@/app/misc/markdownUtils";

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
            className={`p-2 rounded-lg transition-all ${
              showHelp
                ? "bg-linear-to-r from-amber-600 to-orange-600 text-white shadow-md shadow-amber-950/40"
                : "bg-white/5 text-blue-300 hover:bg-white/10 border border-white/10"
            }`}
            title="Syntax Help"
          >
            <DynamicIcon name="HelpCircle" className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowPreview(!showPreview)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-all flex items-center gap-1.5 ${
              showPreview
                ? "bg-linear-to-r from-purple-600 to-blue-600 text-white shadow-md shadow-purple-950/40"
                : "bg-white/5 text-blue-300 hover:bg-white/10 border border-white/10"
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
        <div className="bg-amber-500/[0.06] backdrop-blur-md border border-amber-400/20 rounded-xl p-4 text-sm">
          <h4 className="font-medium text-amber-300 mb-2 flex items-center gap-2">
            <DynamicIcon name="Info" className="w-4 h-4" />
            Template Syntax
          </h4>
          <p className="text-amber-100/80 mb-3">
            Use{" "}
            <code className="bg-amber-500/10 px-1.5 py-0.5 rounded text-amber-200">
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
          <div className="mt-3 p-2 bg-amber-500/10 rounded-lg">
            <p className="text-xs text-amber-200/60 mb-1">Example:</p>
            <code className="text-xs text-amber-100">
              {"# {{Name | Your character's name | Hero}}"}
            </code>
          </div>
          <div className="mt-3 p-2 bg-purple-500/10 rounded-lg border border-purple-400/20">
            <p className="text-xs text-purple-200/60 mb-1">Category Syntax:</p>
            <p className="text-xs text-purple-100/80 mb-2">
              Add{" "}
              <code className="bg-purple-500/10 px-1 rounded">(Category)</code>{" "}
              to group fields:
            </p>
            <code className="text-xs text-purple-100">
              {"{{Strength (Attribute) | Physical power | 10}}"}
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
            className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-blue-200 transition-colors"
            title={preset.description}
          >
            {preset.name}
          </button>
        ))}
        <button
          onClick={insertField}
          className="px-3 py-1.5 text-xs bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-400/20 rounded-lg text-emerald-200 transition-colors flex items-center gap-1"
        >
          <DynamicIcon name="Plus" className="w-3 h-3" />
          Add Field
        </button>
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="bg-red-500/[0.06] backdrop-blur-md border border-red-400/20 rounded-xl p-3">
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
        <div className="bg-white/[0.03] backdrop-blur-md rounded-2xl border border-white/10 p-6">
          <p className="text-xs text-blue-300/50 mb-3">
            Preview with default values:
          </p>
          <div className="prose prose-sm prose-invert max-w-none text-blue-50/90 prose-headings:text-white prose-strong:text-white">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {preprocessMarkdown(preview)}
            </ReactMarkdown>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <textarea
            value={templateText}
            onChange={(e) => handleTemplateChange(e.target.value)}
            placeholder="Enter your character sheet template..."
            className="w-full h-64 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono resize-none"
          />
          <p className="text-xs text-blue-300/50">
            Supports Markdown formatting. Use{" "}
            {"{{Field | Description | Default}}"} for fillable fields.
          </p>
        </div>
      )}

      {/* Extracted Fields Summary - Grouped by Category */}
      {fields.length > 0 && (
        <div className="bg-white/[0.03] backdrop-blur-md rounded-xl border border-white/10 p-4">
          <h4 className="text-sm font-medium text-blue-200 mb-3 flex items-center gap-2">
            <DynamicIcon name="List" className="w-4 h-4" />
            Detected Fields ({fields.length})
          </h4>
          {(() => {
            // Group fields by category
            const grouped = fields.reduce((acc, field) => {
              const cat = field.category || "Other";
              if (!acc[cat]) acc[cat] = [];
              acc[cat].push(field);
              return acc;
            }, {} as Record<string, typeof fields>);

            // Sort categories: named categories first (alphabetically), "Other" last
            const sortedCategories = Object.keys(grouped).sort((a, b) => {
              if (a === "Other") return 1;
              if (b === "Other") return -1;
              return a.localeCompare(b);
            });

            return (
              <div className="space-y-4">
                {sortedCategories.map((category) => (
                  <div key={category}>
                    <h5 className="text-xs font-medium text-purple-300/80 uppercase tracking-wider mb-2 flex items-center gap-2">
                      <DynamicIcon name="Folder" className="w-3 h-3" />
                      {category}
                      <span className="text-blue-400/50 normal-case">
                        ({grouped[category].length})
                      </span>
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {grouped[category].map((field) => (
                        <div
                          key={field.name}
                          className="flex items-start gap-2 p-2 bg-white/5 rounded-lg"
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
                ))}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
