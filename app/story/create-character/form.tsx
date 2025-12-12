"use client";

import { useState, useEffect, useMemo } from "react";
import {
  StoryData,
  CharacterSheetTemplate,
  CharacterSheetField,
} from "@/app/misc/structs";
import { DynamicIcon } from "@/app/components/DynamicIcon";

interface CharacterCreationFormProps {
  storyData: StoryData;
  onCharacterCreate: (characterData: Record<string, string>) => void;
  onCancel?: () => void;
  sourceAdventureId?: string | null;
}

// Smart categorization based on common field patterns
function categorizeFields(fields: CharacterSheetField[]): {
  category: string;
  icon: string;
  fields: CharacterSheetField[];
}[] {
  const categories: Record<
    string,
    { icon: string; fields: CharacterSheetField[] }
  > = {};

  const categoryPatterns: {
    pattern: RegExp;
    category: string;
    icon: string;
  }[] = [
    // Identity & Basics
    {
      pattern: /^(name|age|gender|race|species|pronouns)$/i,
      category: "Identity",
      icon: "User",
    },
    // Appearance
    {
      pattern: /appearance|looks|physical|eyes|hair|height|weight|build/i,
      category: "Appearance",
      icon: "Eye",
    },
    // Background & Story
    {
      pattern:
        /background|backstory|history|origin|hometown|family|childhood|past/i,
      category: "Background",
      icon: "BookOpen",
    },
    // Personality
    {
      pattern:
        /personality|traits|quirks|fears|dreams|goals|hopes|ideals|bonds|flaws|motivat|aspir|belief/i,
      category: "Personality",
      icon: "Heart",
    },
    // Stats & Attributes
    {
      pattern:
        /^(strength|dexterity|constitution|intelligence|wisdom|charisma|str|dex|con|int|wis|cha|heart|diligence|charm|perception|vitality|creativity|body|mind|soul|power|speed|endurance|luck|agility|fortitude|will|reflex)$/i,
      category: "Attributes",
      icon: "BarChart2",
    },
    // Skills
    {
      pattern:
        /^(farming|cooking|crafting|fishing|mining|combat|magic|stealth|persuasion|athletics|acrobatics|arcana|medicine|nature|religion|survival|performance|intimidation|deception|insight|investigation|perception|conversation|empathy|observation|music|dancing|gift|lore)$/i,
      category: "Skills",
      icon: "Zap",
    },
    // Resources
    {
      pattern:
        /^(health|hp|stamina|mana|mp|energy|spirit|spirits|gold|money|currency|sanity|stress|fatigue|willpower)$/i,
      category: "Resources",
      icon: "Battery",
    },
    // Relationships & Social
    {
      pattern: /affection|relationship|bond|friend|ally|rival|love|romance/i,
      category: "Relationships",
      icon: "Users",
    },
    // Reputation & Standing
    {
      pattern: /reputation|standing|trust|fame|honor|renown|status|rank/i,
      category: "Standing",
      icon: "Award",
    },
    // Equipment & Items
    {
      pattern:
        /equipment|gear|weapon|armor|tool|item|clothing|outfit|accessory|inventory/i,
      category: "Equipment",
      icon: "Backpack",
    },
    // Preferences
    {
      pattern: /favorite|prefer|like|love|hobby|interest|season/i,
      category: "Preferences",
      icon: "Star",
    },
  ];

  // Categorize each field
  for (const field of fields) {
    let assigned = false;
    const fieldNameLower = field.name.toLowerCase();
    const descLower = (field.description || "").toLowerCase();

    for (const { pattern, category, icon } of categoryPatterns) {
      if (pattern.test(fieldNameLower) || pattern.test(descLower)) {
        if (!categories[category]) {
          categories[category] = { icon, fields: [] };
        }
        categories[category].fields.push(field);
        assigned = true;
        break;
      }
    }

    // Default to "Other" if no pattern matched
    if (!assigned) {
      if (!categories["Other"]) {
        categories["Other"] = { icon: "FileText", fields: [] };
      }
      categories["Other"].fields.push(field);
    }
  }

  // Convert to array and sort with preferred order
  const categoryOrder = [
    "Identity",
    "Appearance",
    "Background",
    "Personality",
    "Attributes",
    "Skills",
    "Resources",
    "Relationships",
    "Standing",
    "Equipment",
    "Preferences",
    "Other",
  ];

  return categoryOrder
    .filter((cat) => categories[cat]?.fields.length)
    .map((cat) => ({
      category: cat,
      icon: categories[cat].icon,
      fields: categories[cat].fields,
    }));
}

// Determine if a field should be a textarea or input
function getFieldType(
  field: CharacterSheetField
): "textarea" | "input" | "number" {
  const nameLower = field.name.toLowerCase();
  const descLower = (field.description || "").toLowerCase();

  // Numeric fields
  if (
    /^\d+$/.test(field.defaultValue) ||
    /\(\d+[-–]\d+\)/.test(field.description || "") ||
    /^(strength|dexterity|constitution|intelligence|wisdom|charisma|str|dex|con|int|wis|cha|heart|diligence|charm|perception|vitality|creativity|health|hp|stamina|mana|mp|energy|spirit|spirits|gold|money|sanity|stress|level|age|affection|reputation|trust)$/i.test(
      nameLower
    )
  ) {
    return "number";
  }

  // Long text fields
  if (
    /background|backstory|history|description|appearance|story|biography|personality|goals|dreams|fears|notes/i.test(
      nameLower
    ) ||
    /background|backstory|history|description|appearance|story|biography|personality/i.test(
      descLower
    )
  ) {
    return "textarea";
  }

  return "input";
}

export default function CharacterCreationForm({
  storyData,
  onCharacterCreate,
  onCancel,
  sourceAdventureId,
}: CharacterCreationFormProps) {
  const [characterData, setCharacterData] = useState<Record<string, string>>(
    {}
  );
  const [currentPage, setCurrentPage] = useState(0);
  const template = storyData.characterSheetTemplate;

  // Categorize fields
  const categorizedFields = useMemo(() => {
    if (!template?.fields) return [];
    return categorizeFields(template.fields);
  }, [template?.fields]);

  // Calculate progress
  const totalFields = template?.fields?.length || 0;
  const filledFields = Object.values(characterData).filter(
    (v) => v && v.trim()
  ).length;
  const progress = totalFields > 0 ? (filledFields / totalFields) * 100 : 0;

  useEffect(() => {
    // Initialize character data with default values from the template fields
    const initialData: Record<string, string> = {};
    if (template?.fields) {
      template.fields.forEach((field: CharacterSheetField) => {
        initialData[field.name] = field.defaultValue || "";
      });
    }
    setCharacterData(initialData);
  }, [template]);

  const handleInputChange = (fieldName: string, value: string) => {
    setCharacterData((prev) => ({ ...prev, [fieldName]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCharacterCreate(characterData);
  };

  const handleNext = () => {
    if (currentPage < categorizedFields.length - 1) {
      setCurrentPage((p) => p + 1);
    }
  };

  const handlePrev = () => {
    if (currentPage > 0) {
      setCurrentPage((p) => p - 1);
    }
  };

  if (!template?.fields || template.fields.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8">
        <DynamicIcon
          name="AlertCircle"
          className="w-12 h-12 text-yellow-400 mb-4"
        />
        <h2 className="text-xl font-bold text-white mb-2">
          No Character Template
        </h2>
        <p className="text-gray-400 mb-6">
          This adventure doesn&apos;t have a custom character sheet template.
        </p>
        <button
          onClick={() => onCharacterCreate({})}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors"
        >
          <DynamicIcon name="Play" className="inline-block w-5 h-5 mr-2" />
          Start Adventure Anyway
        </button>
      </div>
    );
  }

  const currentCategory = categorizedFields[currentPage];
  const isLastPage = currentPage === categorizedFields.length - 1;
  const isFirstPage = currentPage === 0;

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">
            Create Your Character
          </h1>
          <p className="text-blue-200/60">
            {storyData.story_name || "Your Adventure Awaits"}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-gray-400">
              {filledFields} of {totalFields} fields completed
            </span>
            <span className="text-sm text-gray-400">
              {Math.round(progress)}%
            </span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-linear-to-r from-blue-500 to-purple-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Category Navigation Pills */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-700">
          {categorizedFields.map((cat, idx) => {
            const catFilledCount = cat.fields.filter((f) =>
              characterData[f.name]?.trim()
            ).length;
            const isComplete = catFilledCount === cat.fields.length;
            const isCurrent = idx === currentPage;

            return (
              <button
                key={cat.category}
                onClick={() => setCurrentPage(idx)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                  isCurrent
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-500/25"
                    : isComplete
                    ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-gray-800/50 text-gray-400 hover:bg-gray-700/50 border border-gray-700"
                }`}
              >
                <DynamicIcon name={cat.icon} className="w-4 h-4" />
                {cat.category}
                {isComplete && !isCurrent && (
                  <DynamicIcon name="Check" className="w-3.5 h-3.5" />
                )}
              </button>
            );
          })}
        </div>

        {/* Main Form Card */}
        <form onSubmit={handleSubmit}>
          <div className="bg-gray-900/60 backdrop-blur-xl rounded-2xl border border-gray-700/50 shadow-2xl overflow-hidden">
            {/* Category Header */}
            <div className="px-6 py-4 bg-linear-to-r from-blue-600/10 to-purple-600/10 border-b border-gray-700/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <DynamicIcon
                    name={currentCategory.icon}
                    className="w-6 h-6 text-blue-400"
                  />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">
                    {currentCategory.category}
                  </h2>
                  <p className="text-sm text-gray-400">
                    {currentCategory.fields.length} field
                    {currentCategory.fields.length !== 1 ? "s" : ""} •{" "}
                    {
                      currentCategory.fields.filter((f) =>
                        characterData[f.name]?.trim()
                      ).length
                    }{" "}
                    filled
                  </p>
                </div>
              </div>
            </div>

            {/* Fields */}
            <div className="p-6 space-y-5 max-h-[50vh] overflow-y-auto">
              {currentCategory.fields.map(
                (field: CharacterSheetField, index: number) => {
                  const fieldType = getFieldType(field);
                  const value = characterData[field.name] || "";
                  const hasValue = value.trim().length > 0;

                  return (
                    <div key={field.name + index} className="group relative">
                      <div className="flex items-center justify-between mb-1.5">
                        <label
                          htmlFor={field.name}
                          className="text-sm font-semibold text-gray-200 flex items-center gap-2"
                        >
                          {field.name}
                          {hasValue && (
                            <DynamicIcon
                              name="Check"
                              className="w-3.5 h-3.5 text-emerald-400"
                            />
                          )}
                        </label>
                        {field.defaultValue && !hasValue && (
                          <button
                            type="button"
                            onClick={() =>
                              handleInputChange(field.name, field.defaultValue)
                            }
                            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            Use default
                          </button>
                        )}
                      </div>
                      {field.description && (
                        <p className="text-xs text-gray-500 mb-2">
                          {field.description}
                        </p>
                      )}
                      {fieldType === "textarea" ? (
                        <textarea
                          id={field.name}
                          value={value}
                          onChange={(e) =>
                            handleInputChange(field.name, e.target.value)
                          }
                          placeholder={
                            field.defaultValue || `Enter ${field.name}...`
                          }
                          rows={3}
                          className="w-full px-4 py-3 bg-gray-800/60 border border-gray-600/50 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all resize-none"
                        />
                      ) : fieldType === "number" ? (
                        <input
                          type="text"
                          inputMode="numeric"
                          id={field.name}
                          value={value}
                          onChange={(e) =>
                            handleInputChange(field.name, e.target.value)
                          }
                          placeholder={field.defaultValue || "0"}
                          className="w-full px-4 py-3 bg-gray-800/60 border border-gray-600/50 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all font-mono"
                        />
                      ) : (
                        <input
                          type="text"
                          id={field.name}
                          value={value}
                          onChange={(e) =>
                            handleInputChange(field.name, e.target.value)
                          }
                          placeholder={
                            field.defaultValue || `Enter ${field.name}...`
                          }
                          className="w-full px-4 py-3 bg-gray-800/60 border border-gray-600/50 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                        />
                      )}
                    </div>
                  );
                }
              )}
            </div>

            {/* Navigation Footer */}
            <div className="px-6 py-4 bg-gray-800/30 border-t border-gray-700/50">
              <div className="flex items-center justify-between">
                {/* Left side - Back button or Cancel */}
                <div>
                  {isFirstPage ? (
                    onCancel && (
                      <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={handlePrev}
                      className="flex items-center gap-2 px-4 py-2 text-gray-300 hover:text-white transition-colors"
                    >
                      <DynamicIcon name="ChevronLeft" className="w-4 h-4" />
                      Back
                    </button>
                  )}
                </div>

                {/* Page indicator */}
                <div className="flex items-center gap-1.5">
                  {categorizedFields.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setCurrentPage(idx)}
                      className={`w-2 h-2 rounded-full transition-all ${
                        idx === currentPage
                          ? "w-6 bg-blue-500"
                          : "bg-gray-600 hover:bg-gray-500"
                      }`}
                    />
                  ))}
                </div>

                {/* Right side - Next or Submit */}
                <div>
                  {isLastPage ? (
                    <button
                      type="submit"
                      className="flex items-center gap-2 px-6 py-2.5 bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/25"
                    >
                      <DynamicIcon name="Play" className="w-4 h-4" />
                      Begin Adventure
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleNext}
                      className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all"
                    >
                      Next
                      <DynamicIcon name="ChevronRight" className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </form>

        {/* Quick Actions */}
        <div className="mt-6 flex justify-center gap-4">
          <button
            type="button"
            onClick={() => {
              // Fill all with defaults
              const defaultData: Record<string, string> = {};
              template.fields.forEach((field: CharacterSheetField) => {
                defaultData[field.name] = field.defaultValue || "";
              });
              setCharacterData(defaultData);
            }}
            className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1.5"
          >
            <DynamicIcon name="RotateCcw" className="w-4 h-4" />
            Reset to Defaults
          </button>
          <span className="text-gray-600">•</span>
          <button
            type="button"
            onClick={() => onCharacterCreate(characterData)}
            className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1.5"
          >
            <DynamicIcon name="FastForward" className="w-4 h-4" />
            Skip Character Creation
          </button>
        </div>
      </div>
    </div>
  );
}
