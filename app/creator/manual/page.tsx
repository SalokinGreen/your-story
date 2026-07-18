"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAPIKeys } from "@/app/misc/APIKeysContext";

import {
  StoryData,
  Stat,
  Resource,
  InventoryItem,
  StoryLore,
  Achievement,
  Quest,
  Relationship,
  Condition,
  ConditionTier,
  Preset,
  UpgradeSettings,
  DEFAULT_UPGRADE_SETTINGS,
  LevelingSettings,
  Adventure,
  AGMTState,
  CustomTable,
  StartingChoice,
  Variable,
  NumberVariable,
  BooleanVariable,
  StringVariable,
  ListVariable,
  Ability,
  AbilityCost,
  AbilityGrade,
  DCTier,
  SkillTree,
  STARTING_UPGRADES_BY_DIFFICULTY,
  AdventureDifficulty,
  CharacterSheetTemplate,
  NPC,
  NPCStatus,
  NPCAttitude,
  LoreType,
} from "@/app/misc/structs";
import { useNotification } from "@/app/misc/NotificationContext";
import { compressImage, fileToDataUrl } from "@/app/misc/imageCompression";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import {
  DEFAULT_PRESET,
  getPresetById,
  createPresetFromCurrentSettings,
  applyPreset,
} from "@/app/misc/presets";
import CreatorAIChat from "@/app/components/CreatorAIChat";
import { DynamicIcon } from "@/app/components/DynamicIcon";
import { IconPicker } from "@/app/components/IconPicker";
import { CustomTablesEditor } from "@/app/components/CustomTablesEditor";
import { DraggableScroll } from "@/app/components/DraggableScroll";
import { ClockCategorySelector } from "@/app/components/ClockCategorySelector";
import LoreImageGenerator from "@/app/components/LoreImageGenerator";
import MassLoreImageGenerator from "@/app/components/MassLoreImageGenerator";
import PDFImporter from "@/app/components/PDFImporter";
import {
  GRADE_CONFIG,
  getMaxDurability,
  ItemGrade,
  GRADE_ORDER,
} from "@/app/misc/itemSystem";
import {
  ABILITY_GRADE_CONFIG,
  ABILITY_GRADE_ORDER,
  initializeAbility,
  formatAbilityCost,
} from "@/app/misc/abilitySystem";
import {
  saveLocalAdventure,
  getLocalAdventure,
} from "@/app/misc/localAdventureManager";
import {
  OPENROUTER_IMAGE_MODELS,
  DEEPINFRA_IMAGE_MODELS,
  estimateImageCost,
  calculateDeepInfraImageCost,
} from "@/app/misc/ai_prices";
import SkillTreeEditor from "@/app/components/SkillTreeEditor";
import CharacterSheetTemplateEditor from "@/app/components/CharacterSheetTemplateEditor";
import {
  createCharacterSheetTemplate,
  DEFAULT_CHARACTER_SHEET_TEMPLATE,
} from "@/app/misc/characterSheetTemplate";
import { createEmptyTree } from "@/app/misc/skillTree";
import { DEFAULT_LEVELING_SETTINGS } from "@/app/misc/leveling";

type ImageModelKey = keyof typeof OPENROUTER_IMAGE_MODELS;
type DeepInfraImageModelKey = keyof typeof DEEPINFRA_IMAGE_MODELS;
type CreatorStep =
  | "basic"
  | "character-sheet"
  | "preset"
  | "premise"
  | "starting-choices"
  | "lore"
  | "achievements"
  | "quests"
  | "npcs"
  | "mythic"
  | "variables"
  | "tables"
  | "preview";

// Safe grade config getters with fallbacks
function getGradeConfig(grade: string | undefined) {
  const key = (grade as ItemGrade) || "common";
  return GRADE_CONFIG[key] || GRADE_CONFIG.common;
}

function getAbilityGradeConfig(grade: string | undefined) {
  const key = (grade as AbilityGrade) || "novice";
  return ABILITY_GRADE_CONFIG[key] || ABILITY_GRADE_CONFIG.novice;
}

// Helper functions for AGMT UI
function getChaosColor(chaos: number): string {
  if (chaos <= 3) return "text-blue-400";
  if (chaos <= 5) return "text-yellow-400";
  if (chaos <= 7) return "text-orange-400";
  return "text-red-400";
}

function getChaosLabel(chaos: number): string {
  if (chaos <= 3) return "Very Ordered";
  if (chaos <= 5) return "Normal";
  if (chaos <= 7) return "Chaotic";
  return "Extreme Chaos";
}

function getChaosDescription(chaos: number): string {
  if (chaos <= 3) return "Things go as expected";
  if (chaos <= 5) return "Standard chaos level";
  if (chaos <= 7) return "Unexpected twists likely";
  return "Anything can happen!";
}

function cloneLevelingSettings(value?: LevelingSettings): LevelingSettings {
  const defaults = DEFAULT_LEVELING_SETTINGS;
  const customCurveSource = value?.customCurve ?? defaults.customCurve ?? [];
  const upgradeOverrideSource =
    value?.upgradeOverrides ?? defaults.upgradeOverrides ?? [];
  const startingDefaults =
    defaults.startingUpgrades || STARTING_UPGRADES_BY_DIFFICULTY;

  return {
    xpBase: value?.xpBase ?? defaults.xpBase ?? 100,
    levelCap: value?.levelCap ?? defaults.levelCap ?? 100,
    useCustomCurve: value?.useCustomCurve ?? defaults.useCustomCurve ?? false,
    customCurve: customCurveSource
      .map((entry) => ({
        level: entry.level,
        cumulativeXP: entry.cumulativeXP,
      }))
      .sort((a, b) => a.level - b.level),
    defaultUpgradesPerLevel:
      value?.defaultUpgradesPerLevel ?? defaults.defaultUpgradesPerLevel ?? 1,
    upgradeOverrides: upgradeOverrideSource
      .map((entry) => ({
        level: entry.level,
        upgrades: entry.upgrades,
      }))
      .sort((a, b) => a.level - b.level),
    startingUpgrades: {
      easy:
        value?.startingUpgrades?.easy ??
        startingDefaults.easy ??
        STARTING_UPGRADES_BY_DIFFICULTY.easy,
      medium:
        value?.startingUpgrades?.medium ??
        startingDefaults.medium ??
        STARTING_UPGRADES_BY_DIFFICULTY.medium,
      hard:
        value?.startingUpgrades?.hard ??
        startingDefaults.hard ??
        STARTING_UPGRADES_BY_DIFFICULTY.hard,
      expert:
        value?.startingUpgrades?.expert ??
        startingDefaults.expert ??
        STARTING_UPGRADES_BY_DIFFICULTY.expert,
    },
  };
}

// Variable Editor Card Component
function VariableEditorCard({
  variable,
  onChange,
  onDelete,
  index,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOver,
  onDragEnd,
  isDragging,
}: {
  variable: Variable;
  onChange: (variable: Variable) => void;
  onDelete: () => void;
  index?: number;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Variable>({ ...variable });
  const [newListItem, setNewListItem] = useState("");

  const getIcon = () => {
    switch (variable.type) {
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

  const getColorClasses = () => {
    switch (variable.type) {
      case "number":
        return {
          bg: "bg-cyan-900/20",
          border: "border-cyan-800",
          text: "text-cyan-400",
          badge: "bg-cyan-500/20 text-cyan-300",
        };
      case "boolean":
        return {
          bg: "bg-emerald-900/20",
          border: "border-emerald-800",
          text: "text-emerald-400",
          badge: "bg-emerald-500/20 text-emerald-300",
        };
      case "string":
        return {
          bg: "bg-amber-900/20",
          border: "border-amber-800",
          text: "text-amber-400",
          badge: "bg-amber-500/20 text-amber-300",
        };
      case "list":
        return {
          bg: "bg-violet-900/20",
          border: "border-violet-800",
          text: "text-violet-400",
          badge: "bg-violet-500/20 text-violet-300",
        };
      default:
        return {
          bg: "bg-blue-900/20",
          border: "border-blue-800",
          text: "text-blue-400",
          badge: "bg-blue-500/20 text-blue-300",
        };
    }
  };

  const colors = getColorClasses();

  const handleSave = () => {
    onChange(editData);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditData({ ...variable });
    setIsEditing(false);
    setNewListItem("");
  };

  const addListItem = () => {
    if (editData.type === "list" && newListItem.trim()) {
      const listVar = editData as ListVariable;
      if (listVar.maxSize && listVar.items.length >= listVar.maxSize) {
        return;
      }
      setEditData({
        ...editData,
        items: [...listVar.items, newListItem.trim()],
      } as ListVariable);
      setNewListItem("");
    }
  };

  const removeListItem = (itemIndex: number) => {
    if (editData.type === "list") {
      const listVar = editData as ListVariable;
      setEditData({
        ...editData,
        items: listVar.items.filter((_, i) => i !== itemIndex),
      } as ListVariable);
    }
  };

  if (isEditing) {
    return (
      <div className={`p-4 rounded-lg ${colors.bg} border-2 ${colors.border}`}>
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <DynamicIcon
              name={getIcon()}
              className={`w-5 h-5 ${colors.text}`}
            />
            <span className="text-xs uppercase tracking-wider text-gray-400 font-semibold">
              {variable.type} Variable
            </span>
          </div>

          <input
            type="text"
            value={editData.name}
            onChange={(e) => setEditData({ ...editData, name: e.target.value })}
            placeholder="Variable name"
            className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white font-semibold"
          />

          <textarea
            value={editData.description}
            onChange={(e) =>
              setEditData({ ...editData, description: e.target.value })
            }
            placeholder="Description (optional)"
            className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white resize-none"
            rows={2}
          />

          {/* Type-specific fields */}
          {editData.type === "number" && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-semibold text-blue-200 mb-1">
                  Default Value
                </label>
                <input
                  type="number"
                  value={(editData as NumberVariable).value}
                  onChange={(e) =>
                    setEditData({
                      ...editData,
                      value: parseFloat(e.target.value) || 0,
                    } as NumberVariable)
                  }
                  className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Min Value (optional)
                  </label>
                  <input
                    type="number"
                    value={(editData as NumberVariable).minValue ?? ""}
                    onChange={(e) =>
                      setEditData({
                        ...editData,
                        minValue:
                          e.target.value === ""
                            ? undefined
                            : parseFloat(e.target.value),
                      } as NumberVariable)
                    }
                    placeholder="No minimum"
                    className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Max Value (optional)
                  </label>
                  <input
                    type="number"
                    value={(editData as NumberVariable).maxValue ?? ""}
                    onChange={(e) =>
                      setEditData({
                        ...editData,
                        maxValue:
                          e.target.value === ""
                            ? undefined
                            : parseFloat(e.target.value),
                      } as NumberVariable)
                    }
                    placeholder="No maximum"
                    className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {editData.type === "boolean" && (
            <div>
              <label className="block text-sm font-semibold text-blue-200 mb-2">
                Default Value
              </label>
              <button
                onClick={() =>
                  setEditData({
                    ...editData,
                    value: !(editData as BooleanVariable).value,
                  } as BooleanVariable)
                }
                className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                  (editData as BooleanVariable).value
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "bg-red-600 hover:bg-red-700 text-white"
                }`}
              >
                {(editData as BooleanVariable).value ? "TRUE" : "FALSE"}
              </button>
            </div>
          )}

          {editData.type === "string" && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-semibold text-blue-200 mb-1">
                  Default Value
                </label>
                <input
                  type="text"
                  value={(editData as StringVariable).value}
                  onChange={(e) =>
                    setEditData({
                      ...editData,
                      value: e.target.value,
                    } as StringVariable)
                  }
                  placeholder="Enter default text..."
                  className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
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
                  value={(editData as StringVariable).options?.join("\n") ?? ""}
                  onChange={(e) =>
                    setEditData({
                      ...editData,
                      options: e.target.value
                        ? e.target.value.split("\n").filter((o) => o.trim())
                        : undefined,
                    } as StringVariable)
                  }
                  placeholder="Monday&#10;Tuesday&#10;Wednesday&#10;..."
                  className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white resize-none"
                  rows={4}
                />
              </div>
            </div>
          )}

          {editData.type === "list" && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-semibold text-blue-200 mb-1">
                  Max Size (optional)
                </label>
                <input
                  type="number"
                  min="1"
                  value={(editData as ListVariable).maxSize ?? ""}
                  onChange={(e) =>
                    setEditData({
                      ...editData,
                      maxSize:
                        e.target.value === ""
                          ? undefined
                          : parseInt(e.target.value),
                    } as ListVariable)
                  }
                  placeholder="No limit"
                  className="w-full px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-blue-200 mb-1">
                  Default Items ({(editData as ListVariable).items.length}
                  {(editData as ListVariable).maxSize &&
                    ` / ${(editData as ListVariable).maxSize}`}
                  )
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newListItem}
                    onChange={(e) => setNewListItem(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addListItem();
                      }
                    }}
                    placeholder="Add item..."
                    className="flex-1 px-3 py-2 bg-blue-950/50 border border-blue-700/40 rounded text-white"
                  />
                  <button
                    onClick={addListItem}
                    disabled={!newListItem.trim()}
                    className="px-3 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-600 text-white rounded"
                  >
                    <DynamicIcon name="Plus" className="w-4 h-4" />
                  </button>
                </div>
                {(editData as ListVariable).items.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {(editData as ListVariable).items.map((item, itemIndex) => (
                      <span
                        key={itemIndex}
                        className="px-2 py-1 bg-violet-500/30 text-violet-200 rounded flex items-center gap-1"
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
              onClick={handleSave}
              disabled={!editData.name}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded"
            >
              <DynamicIcon name="Save" className="inline-block w-4 h-4 mr-1" />
              Save
            </button>
            <button
              onClick={handleCancel}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded"
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
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className={`flex items-start gap-3 p-4 rounded-lg ${colors.bg} border ${
        colors.border
      } ${isDragging ? "opacity-50" : ""} ${
        onDragStart ? "cursor-grab active:cursor-grabbing" : ""
      }`}
    >
      {/* Drag Handle and Reorder Arrows */}
      {(onMoveUp || onMoveDown || onDragStart) && (
        <div className="flex flex-col items-center gap-1 shrink-0">
          <button
            onClick={onMoveUp}
            disabled={!onMoveUp}
            className="p-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move up"
          >
            <DynamicIcon name="ChevronUp" className="w-4 h-4" />
          </button>
          <div className="p-1 text-gray-500" title="Drag to reorder">
            <DynamicIcon name="GripVertical" className="w-4 h-4" />
          </div>
          <button
            onClick={onMoveDown}
            disabled={!onMoveDown}
            className="p-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move down"
          >
            <DynamicIcon name="ChevronDown" className="w-4 h-4" />
          </button>
        </div>
      )}
      <div className="shrink-0">
        <DynamicIcon name={getIcon()} className={`w-8 h-8 ${colors.text}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-white flex items-center gap-2 flex-wrap mb-1">
          <span>{variable.name}</span>
          {variable.type === "number" && (
            <span
              className={`text-sm px-2 py-0.5 rounded-full ${colors.badge}`}
            >
              {(variable as NumberVariable).value}
            </span>
          )}
          {variable.type === "boolean" && (
            <span
              className={`text-sm px-2 py-0.5 rounded-full ${
                (variable as BooleanVariable).value
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-red-500/20 text-red-300"
              }`}
            >
              {(variable as BooleanVariable).value ? "TRUE" : "FALSE"}
            </span>
          )}
          {variable.type === "string" && (
            <span
              className={`text-sm px-2 py-0.5 rounded-full ${colors.badge}`}
            >
              &quot;{(variable as StringVariable).value || "(empty)"}&quot;
            </span>
          )}
          {variable.type === "list" && (
            <span
              className={`text-sm px-2 py-0.5 rounded-full ${colors.badge}`}
            >
              {(variable as ListVariable).items.length} items
              {(variable as ListVariable).maxSize &&
                ` / ${(variable as ListVariable).maxSize} max`}
            </span>
          )}
        </div>
        {variable.description && (
          <p className="text-sm text-gray-400 mb-2">{variable.description}</p>
        )}
        {/* Show number range if defined */}
        {variable.type === "number" &&
          ((variable as NumberVariable).minValue !== undefined ||
            (variable as NumberVariable).maxValue !== undefined) && (
            <p className="text-xs text-gray-500">
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
                  className={`px-2 py-0.5 text-xs rounded ${
                    opt === (variable as StringVariable).value
                      ? "bg-amber-500/40 text-amber-200 font-semibold"
                      : "bg-amber-500/20 text-amber-300"
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
              {(variable as ListVariable).items.slice(0, 5).map((item, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 text-xs rounded bg-violet-500/20 text-violet-300"
                >
                  {item}
                </span>
              ))}
              {(variable as ListVariable).items.length > 5 && (
                <span className="px-2 py-0.5 text-xs rounded bg-violet-500/10 text-violet-400">
                  +{(variable as ListVariable).items.length - 5} more
                </span>
              )}
            </div>
          )}
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={() => setIsEditing(true)}
          className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded"
        >
          <DynamicIcon name="Edit" className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
        >
          <DynamicIcon name="Trash2" className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function AdventureCreatorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { keys: apiKeys } = useAPIKeys();
  const { addNotification } = useNotification();

  const editAdventureId = searchParams?.get("edit");
  const isCopyMode = searchParams?.get("copy") === "true";

  const [currentStep, setCurrentStep] = useState<CreatorStep>("basic");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const hasLoadedAdventureRef = useRef<string | null>(null); // Track loaded adventure ID to prevent re-fetching on tab focus
  const hasLoadedCopyRef = useRef(false); // Track if copy has been processed to prevent double-loading

  // Conflict resolution state
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflictData, setConflictData] = useState<{
    localDraft: any;
    onlineAdventure: Adventure;
    localUpdatedAt: number;
    onlineUpdatedAt: number;
  } | null>(null);

  const [selectedPreset, setSelectedPreset] = useState<string>("custom");
  const [presets, setPresets] = useState<Preset[]>([DEFAULT_PRESET]);
  const [showPresetForm, setShowPresetForm] = useState(false);
  const [showPresetSwitcher, setShowPresetSwitcher] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [newPresetDescription, setNewPresetDescription] = useState("");
  const [newPresetIcon, setNewPresetIcon] = useState("Star");
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);

  // Store custom values before switching to a preset so we can restore them
  const [savedCustomValues, setSavedCustomValues] = useState<{
    characterSheet: string;
    intro: string;
    stats: Stat[];
    resources: Resource[];
    inventory: InventoryItem[];
    relationships: Relationship[];
    conditions: Condition[];
    authorNotes: string;
  } | null>(null);

  // Upgrade Settings
  const [levelingSettings, setLevelingSettings] = useState<LevelingSettings>(
    () => cloneLevelingSettings(),
  );
  const [upgradeSettings, setUpgradeSettings] = useState<UpgradeSettings>(
    DEFAULT_UPGRADE_SETTINGS,
  );

  // Skill Trees
  const [skillTrees, setSkillTrees] = useState<SkillTree[]>([]);

  const handleAddCustomCurveEntry = () => {
    setLevelingSettings((prev) => {
      const existing = [...(prev.customCurve || [])];
      const nextLevel =
        existing.length > 0 ? existing[existing.length - 1].level + 1 : 2;
      const xpIncrement =
        prev.xpBase ?? DEFAULT_LEVELING_SETTINGS.xpBase ?? 100;
      const nextXP =
        existing.length > 0
          ? existing[existing.length - 1].cumulativeXP + xpIncrement
          : xpIncrement;
      const updated = [...existing, { level: nextLevel, cumulativeXP: nextXP }];
      updated.sort((a, b) => a.level - b.level);
      return { ...prev, customCurve: updated };
    });
  };

  const handleCustomCurveChange = (
    index: number,
    field: "level" | "cumulativeXP",
    value: number,
  ) => {
    setLevelingSettings((prev) => {
      const existing = [...(prev.customCurve || [])];
      if (!existing[index]) return prev;
      const clamped =
        field === "level" ? Math.max(2, value) : Math.max(0, value);
      existing[index] = { ...existing[index], [field]: clamped };
      existing.sort((a, b) => a.level - b.level);
      return { ...prev, customCurve: existing };
    });
  };

  const handleRemoveCustomCurveEntry = (index: number) => {
    setLevelingSettings((prev) => {
      const existing = [...(prev.customCurve || [])];
      existing.splice(index, 1);
      return { ...prev, customCurve: existing };
    });
  };

  const handleAddUpgradeOverride = () => {
    setLevelingSettings((prev) => {
      const existing = [...(prev.upgradeOverrides || [])];
      const nextLevel =
        existing.length > 0 ? existing[existing.length - 1].level + 1 : 2;
      const defaultUpgrade =
        prev.defaultUpgradesPerLevel ??
        DEFAULT_LEVELING_SETTINGS.defaultUpgradesPerLevel ??
        1;
      const updated = [
        ...existing,
        { level: nextLevel, upgrades: defaultUpgrade },
      ];
      updated.sort((a, b) => a.level - b.level);
      return { ...prev, upgradeOverrides: updated };
    });
  };

  const handleUpgradeOverrideChange = (
    index: number,
    field: "level" | "upgrades",
    value: number,
  ) => {
    setLevelingSettings((prev) => {
      const existing = [...(prev.upgradeOverrides || [])];
      if (!existing[index]) return prev;
      const clamped =
        field === "level" ? Math.max(1, value) : Math.max(0, value);
      existing[index] = { ...existing[index], [field]: clamped };
      existing.sort((a, b) => a.level - b.level);
      return { ...prev, upgradeOverrides: existing };
    });
  };

  const handleRemoveUpgradeOverride = (index: number) => {
    setLevelingSettings((prev) => {
      const existing = [...(prev.upgradeOverrides || [])];
      existing.splice(index, 1);
      return { ...prev, upgradeOverrides: existing };
    });
  };

  const handleStartingUpgradeChange = (
    difficulty: AdventureDifficulty,
    value: number,
  ) => {
    setLevelingSettings((prev) => ({
      ...prev,
      startingUpgrades: {
        ...(prev.startingUpgrades || {}),
        [difficulty]: Math.max(0, value),
      },
    }));
  };

  // Basic Info
  const [title, setTitle] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");
  const [difficulty, setDifficulty] = useState<
    "easy" | "medium" | "hard" | "expert"
  >("medium");
  const [visibility, setVisibility] = useState<"public" | "hidden" | "private">(
    "private",
  );
  const [nsfw, setNsfw] = useState(false);
  const [showAdvancedBasic, setShowAdvancedBasic] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  // AI Image Generation state
  const [generatingThumbnail, setGeneratingThumbnail] = useState(false);
  const [generatingBanner, setGeneratingBanner] = useState(false);
  const [imageProvider, setImageProvider] = useState<
    "deepinfra" | "openrouter"
  >("deepinfra");
  const [imageModel, setImageModel] = useState<
    ImageModelKey | DeepInfraImageModelKey
  >("Bria 3.2");
  const [thumbnailPrompt, setThumbnailPrompt] = useState("");
  const [bannerPrompt, setBannerPrompt] = useState("");
  const [showAIImageModal, setShowAIImageModal] = useState<
    "thumbnail" | "banner" | null
  >(null);

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    icon?: string;
    confirmText?: string;
    cancelText?: string;
    confirmButtonClass?: string;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const [isAIMenuOpen, setIsAIMenuOpen] = useState(false);

  // Pinned AI panel state (desktop only)
  const [isAIPinned, setIsAIPinned] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("creatorAIPinned") === "true";
    }
    return false;
  });

  // Save pinned state to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("creatorAIPinned", isAIPinned ? "true" : "false");
    }
  }, [isAIPinned]);

  // Handle pin toggle - when pinning, also open the panel
  const handlePinToggle = () => {
    if (!isAIPinned) {
      // Pinning - also ensure it's open
      setIsAIPinned(true);
      setIsAIMenuOpen(true);
    } else {
      // Unpinning - keep it open as modal
      setIsAIPinned(false);
    }
  };

  // Helper function to apply item changes with command support
  function applyItemChanges<
    T extends { name?: string; title?: string; id?: string; text?: string },
  >(
    existingItems: T[],
    newItems: Array<
      Partial<T> & { _command?: "add" | "replace" | "delete" | "merge" }
    >,
    itemType: string,
    identifierKey: "name" | "title" | "id" | "text" = "name",
  ): T[] {
    let updated = [...existingItems];

    newItems.forEach((newItem) => {
      const command = newItem._command || "merge"; // Default to merge for backward compatibility
      const itemIdentifier = newItem[identifierKey] as string | undefined;

      // Skip if no identifier provided
      if (!itemIdentifier) {
        console.warn(
          `[AI] Skipping ${itemType} - no ${identifierKey} provided`,
        );
        return;
      }

      const index = updated.findIndex(
        (item) => item[identifierKey] === itemIdentifier,
      );

      switch (command) {
        case "delete":
          if (index !== -1) {
            updated.splice(index, 1);
            console.log(`[AI] Deleted ${itemType}: ${itemIdentifier}`);
          } else {
            console.warn(
              `[AI] Cannot delete ${itemType} "${itemIdentifier}" - not found`,
            );
          }
          break;

        case "replace":
          if (index !== -1) {
            // Remove _command before storing
            const { _command, ...cleanItem } = newItem;
            updated[index] = cleanItem as T;
            console.log(`[AI] Replaced ${itemType}: ${itemIdentifier}`);
          } else {
            // If item doesn't exist, treat replace as add
            const { _command, ...cleanItem } = newItem;
            updated.push(cleanItem as T);
            console.log(
              `[AI] Added ${itemType} (replace on non-existent): ${itemIdentifier}`,
            );
          }
          break;

        case "add":
          // Always add as new item, even if name exists
          const { _command: _, ...cleanItem } = newItem;
          updated.push(cleanItem as T);
          console.log(`[AI] Added ${itemType}: ${itemIdentifier}`);
          break;

        case "merge":
        default:
          // Default behavior: merge properties if exists, add if not
          if (index !== -1) {
            const { _command, ...itemWithoutCommand } = newItem;
            updated[index] = { ...updated[index], ...itemWithoutCommand };
            console.log(`[AI] Merged ${itemType}: ${itemIdentifier}`);
          } else {
            const { _command, ...cleanItem } = newItem;
            updated.push(cleanItem as T);
            console.log(`[AI] Added ${itemType}: ${itemIdentifier}`);
          }
          break;
      }
    });

    return updated;
  }

  const handleApplyAIChanges = (
    data: Partial<StoryData> & {
      title?: string;
      shortDescription?: string;
      description?: string;
    },
  ) => {
    console.log("[AI] Received data:", JSON.stringify(data, null, 2));

    // Collect deletion warnings
    const deletions: string[] = [];

    if (data.stats) {
      data.stats.forEach((stat: any) => {
        if (stat._command === "delete") {
          deletions.push(`Stat: ${stat.name}`);
        }
      });
    }

    if (data.resources) {
      data.resources.forEach((resource: any) => {
        if (resource._command === "delete") {
          deletions.push(`Resource: ${resource.name}`);
        }
      });
    }

    if (data.inventory) {
      data.inventory.forEach((item: any) => {
        if (item._command === "delete") {
          deletions.push(`Item: ${item.name}`);
        }
      });
    }

    if (data.lore) {
      data.lore.forEach((l: any) => {
        if (l._command === "delete") {
          deletions.push(`Lore: ${l.title}`);
        }
      });
    }

    if (data.achievements) {
      data.achievements.forEach((a: any) => {
        if (a._command === "delete") {
          deletions.push(`Achievement: ${a.title}`);
        }
      });
    }

    if (data.quests) {
      data.quests.forEach((q: any) => {
        if (q._command === "delete") {
          deletions.push(`Quest: ${q.title}`);
        }
      });
    }

    if (data.relationships) {
      data.relationships.forEach((r: any) => {
        if (r._command === "delete") {
          deletions.push(`Relationship: ${r.name}`);
        }
      });
    }

    if (data.npcs) {
      data.npcs.forEach((n: any) => {
        if (n._command === "delete") {
          deletions.push(`NPC: ${n.name}`);
        }
      });
    }

    if (data.abilities) {
      data.abilities.forEach((a: any) => {
        if (a._command === "delete") {
          deletions.push(`Ability: ${a.name}`);
        }
      });
    }

    if (data.nodeEffects?.passives) {
      data.nodeEffects.passives.forEach((p: any) => {
        if (p._command === "delete") {
          deletions.push(`Passive: ${p.name}`);
        }
      });
    }

    if (data.presets) {
      data.presets.forEach((p: any) => {
        if (p._command === "delete") {
          deletions.push(`Preset: ${p.name}`);
        }
      });
    }

    // Check upgrade shop deletions
    if (data.upgradeSettings) {
      const us = data.upgradeSettings;
      if (us.statShop) {
        us.statShop.forEach((s: any) => {
          if (s._command === "delete") {
            deletions.push(`Stat Shop Item: ${s.name}`);
          }
        });
      }
      if (us.resourceShop) {
        us.resourceShop.forEach((r: any) => {
          if (r._command === "delete") {
            deletions.push(`Resource Shop Item: ${r.name}`);
          }
        });
      }
      if (us.itemShop) {
        us.itemShop.forEach((i: any) => {
          if (i._command === "delete") {
            deletions.push(`Item Shop Item: ${i.name}`);
          }
        });
      }
      if (us.abilityShop) {
        us.abilityShop.forEach((a: any) => {
          if (a._command === "delete") {
            deletions.push(`Ability Shop Item: ${a.name}`);
          }
        });
      }
    }

    // Check AGMT deletions
    if (data.agmtState) {
      const ms = data.agmtState;
      if (ms.threads) {
        ms.threads.forEach((t: any) => {
          if (t._command === "delete") {
            deletions.push(`AGMT Thread: ${t.description}`);
          }
        });
      }
    }

    // Check custom table deletions
    if (data.customTables) {
      data.customTables.forEach((table: any) => {
        if (table._command === "delete") {
          deletions.push(`Custom Table: ${table.name}`);
        }
      });
    }

    // Check variable deletions
    if (data.variables) {
      data.variables.forEach((v: any) => {
        if (v._command === "delete") {
          deletions.push(`Variable: ${v.name}`);
        }
      });
    }

    // Check starting choice deletions
    if ((data as any).startingChoices) {
      (data as any).startingChoices.forEach((choice: any) => {
        if (choice._command === "delete") {
          deletions.push(`Starting Choice: ${choice.text}`);
        }
      });
    }

    // Show confirmation if deletions exist
    if (deletions.length > 0) {
      const confirmed = window.confirm(
        `The AI will delete the following items:\n\n${deletions.join(
          "\n",
        )}\n\nContinue?`,
      );
      if (!confirmed) {
        addNotification("Changes cancelled", "info");
        return;
      }
    }

    // Apply adventure metadata
    if (data.title !== undefined) setTitle(data.title);
    if (data.shortDescription !== undefined)
      setShortDescription(data.shortDescription);
    if (data.description !== undefined) setDescription(data.description);

    // Apply story data
    if (data.story_name) setTitle(data.story_name);
    if (data.premise) setPremise(data.premise);
    if (data.nsfw !== undefined) setNsfw(data.nsfw);
    if (data.intro) setIntro(data.intro);
    if (data.author_notes) setAuthorNotes(data.author_notes);

    // Apply with commands
    if (data.stats) {
      setStats(applyItemChanges(stats, data.stats as any, "stat", "name"));
    }

    if (data.resources) {
      setResources(
        applyItemChanges(resources, data.resources as any, "resource", "name"),
      );
    }

    if (data.inventory) {
      setInventory(
        applyItemChanges(inventory, data.inventory as any, "item", "name"),
      );
    }

    if (data.lore) {
      setLore(applyItemChanges(lore, data.lore as any, "lore entry", "title"));
    }

    if (data.achievements) {
      setAchievements(
        applyItemChanges(
          achievements,
          data.achievements as any,
          "achievement",
          "title",
        ),
      );
    }

    if (data.quests) {
      setQuests(applyItemChanges(quests, data.quests as any, "quest", "title"));
    }

    if (data.relationships) {
      setRelationships(
        applyItemChanges(
          relationships,
          data.relationships as any,
          "relationship",
          "name",
        ),
      );
    }

    if (data.npcs) {
      setNPCs(applyItemChanges(npcs, data.npcs as any, "npc", "name"));
    }

    if (data.presets) {
      setPresets(
        applyItemChanges(presets, data.presets as any, "preset", "id"),
      );
    }

    if (data.abilities) {
      setAbilities(
        applyItemChanges(abilities, data.abilities as any, "ability", "name"),
      );
    }

    // Apply passives from nodeEffects
    // Tool executor returns the final state (not command-based), so we set it directly
    if (data.nodeEffects?.passives !== undefined) {
      // Check if this is a command-based array or a direct replacement
      const hasCommands = data.nodeEffects.passives.some(
        (p: any) => p._command,
      );
      if (hasCommands) {
        setPassives(
          applyItemChanges(
            passives,
            data.nodeEffects.passives as any,
            "passive",
            "name",
          ),
        );
      } else {
        // Direct replacement (from tool executor)
        setPassives(data.nodeEffects.passives);
        console.log(
          `[AI] Set passives directly: ${data.nodeEffects.passives.length} items`,
        );
      }
    }

    // Apply upgrade shop settings
    if (data.upgradeSettings) {
      const us = data.upgradeSettings;
      setUpgradeSettings((prev) => {
        const updated = { ...prev };

        // Update boolean flags
        if (us.enabled !== undefined) updated.enabled = us.enabled;
        if (us.statShopEnabled !== undefined)
          updated.statShopEnabled = us.statShopEnabled;
        if (us.resourceShopEnabled !== undefined)
          updated.resourceShopEnabled = us.resourceShopEnabled;
        if (us.itemShopEnabled !== undefined)
          updated.itemShopEnabled = us.itemShopEnabled;
        if (us.abilityShopEnabled !== undefined)
          updated.abilityShopEnabled = us.abilityShopEnabled;

        // Update shop arrays
        if (us.statShop) {
          updated.statShop = applyItemChanges(
            prev.statShop,
            us.statShop as any,
            "stat shop item",
            "name",
          );
        }

        if (us.resourceShop) {
          updated.resourceShop = applyItemChanges(
            prev.resourceShop,
            us.resourceShop as any,
            "resource shop item",
            "name",
          );
        }

        if (us.itemShop) {
          updated.itemShop = applyItemChanges(
            prev.itemShop,
            us.itemShop as any,
            "item shop item",
            "name",
          );
        }

        if (us.abilityShop) {
          updated.abilityShop = applyItemChanges(
            prev.abilityShop,
            us.abilityShop as any,
            "ability shop item",
            "name",
          );
        }

        return updated;
      });
    }

    // Apply leveling settings
    if (data.levelingSettings) {
      const ls = data.levelingSettings;
      setLevelingSettings((prev) => {
        const updated = { ...prev };

        if (ls.xpBase !== undefined) updated.xpBase = ls.xpBase;
        if (ls.levelCap !== undefined) updated.levelCap = ls.levelCap;
        if (ls.defaultUpgradesPerLevel !== undefined)
          updated.defaultUpgradesPerLevel = ls.defaultUpgradesPerLevel;
        if (ls.useCustomCurve !== undefined)
          updated.useCustomCurve = ls.useCustomCurve;
        if (ls.customCurve !== undefined) {
          // Normalize customCurve: handle both 'xp' and 'cumulativeXP' field names
          updated.customCurve = ls.customCurve.map(
            (point: { level: number; cumulativeXP?: number; xp?: number }) => ({
              level: point.level,
              cumulativeXP: point.cumulativeXP ?? point.xp ?? 0,
            }),
          );
        }
        if (ls.upgradeOverrides !== undefined)
          updated.upgradeOverrides = ls.upgradeOverrides;
        if (ls.startingUpgrades !== undefined) {
          updated.startingUpgrades = {
            ...prev.startingUpgrades,
            ...ls.startingUpgrades,
          };
        }

        return updated;
      });
    }

    // Apply Advanced RPG Tools settings
    // agmtEnabled is derived from agmtState presence, not a separate field
    if (data.agmtState) {
      const ms = data.agmtState;

      // If agmtState is provided, enable AGMT
      if (!agmtEnabled) {
        setAGMTEnabled(true);
      }

      const newState = { ...agmtState };

      // Chaos factor validation (1-9)
      if (ms.chaosFactor !== undefined) {
        const chaos = Math.max(1, Math.min(9, ms.chaosFactor));
        newState.chaosFactor = chaos;
      }

      // Scene count validation (>= 0)
      if (ms.sceneCount !== undefined) {
        newState.sceneCount = Math.max(0, ms.sceneCount);
      }

      setAGMTState(newState);
    }

    // Apply custom tables
    if (data.customTables) {
      setCustomTables(
        applyItemChanges(
          customTables,
          data.customTables as any,
          "custom table",
          "id",
        ).map((table: any) => {
          // Auto-generate ID for new tables without one
          if (!table.id) {
            table.id = `table-${Date.now()}-${Math.random()
              .toString(36)
              .substring(2, 9)}`;
          }
          return table;
        }),
      );
    }

    // Apply variables
    if (data.variables) {
      setVariables(
        applyItemChanges(
          variables,
          data.variables as any,
          "variable",
          "name",
        ).map((v: any) => {
          // Auto-generate ID for new variables without one
          if (!v.id) {
            v.id = `var_${
              v.name?.toLowerCase().replace(/\s+/g, "_") || Date.now()
            }`;
          }
          return v;
        }),
      );
    }

    // Apply skill trees
    if (data.skillTrees) {
      setSkillTrees(
        applyItemChanges(
          skillTrees,
          data.skillTrees as any,
          "skill tree",
          "id",
        ).map((tree: any) => {
          // Auto-generate ID for new trees without one
          if (!tree.id) {
            tree.id = `tree-${Date.now()}-${Math.random()
              .toString(36)
              .substring(2, 9)}`;
          }
          // Sanitize emoji symbols to valid icon names
          if (tree.symbol && !/^[a-zA-Z][a-zA-Z0-9-]*$/.test(tree.symbol)) {
            tree.symbol = "GitBranch";
          }
          // Sanitize node symbols
          if (tree.nodes) {
            tree.nodes = tree.nodes.map((node: any) => {
              if (!node.id) {
                node.id = `node-${Date.now()}-${Math.random()
                  .toString(36)
                  .substring(2, 9)}`;
              }
              if (node.symbol && !/^[a-zA-Z][a-zA-Z0-9-]*$/.test(node.symbol)) {
                // Use type-based default icons
                const typeIcons: Record<string, string> = {
                  stat: "BarChart2",
                  ability: "Sparkles",
                  item: "Package",
                  passive: "Shield",
                  resource: "Zap",
                };
                node.symbol = typeIcons[node.type] || "Circle";
              }
              return node;
            });
          }
          return tree;
        }),
      );
    }

    // Apply starting choices (adventure-level, not StoryData)
    if ((data as any).startingChoices) {
      setStartingChoices(
        applyItemChanges(
          startingChoices,
          (data as any).startingChoices as any,
          "starting choice",
          "text",
        ) as StartingChoice[],
      );
    }

    // Apply character sheet template
    if (data.characterSheetTemplate) {
      setCharacterSheetTemplate(data.characterSheetTemplate);
    }

    addNotification("AI changes applied successfully!", "success");
    setIsAIMenuOpen(false);
  };

  // Load adventure data if editing
  useEffect(() => {
    if (!editAdventureId) return;

    // Skip re-fetching if we've already loaded this adventure (prevents reload on tab focus)
    if (hasLoadedAdventureRef.current === editAdventureId) {
      console.log(
        "Adventure already loaded, skipping re-fetch (tab focus protection)",
      );
      return;
    }

    const loadAdventure = async () => {
      setLoading(true);
      try {
        const localAdv = await getLocalAdventure(editAdventureId);
        if (!localAdv) {
          throw new Error("Adventure not found");
        }
        const adventure = localAdv.adventureData as Adventure;

        // Load basic info
        setTitle(adventure.title || "");
        setShortDescription(adventure.shortDescription || "");
        setDescription(adventure.description || "");
        setDifficulty(adventure.difficulty || "medium");
        setVisibility(adventure.visibility || "private");
        setNsfw(adventure.nsfw || false);
        setTags(adventure.tags || []);
        setThumbnailUrl(adventure.thumbnailUrl || "");
        setBannerUrl(adventure.bannerUrl || "");

        // Load starting choices from adventure
        setStartingChoices(adventure.startingChoices || []);

        // Load story template data
        const template = adventure.storyTemplate;
        setPremise(template.premise || "");
        setIntro(template.intro || "");
        setMaxChapters(template.max_chapters || 8);
        setAuthorNotes(template.author_notes || "");
        setSelectedPreset(
          template.selected_preset || adventure.selectedPreset || "custom",
        );
        setPresets(template.presets || adventure.presets || [DEFAULT_PRESET]);

        // Load character sheet template
        if (adventure.characterSheetTemplate) {
          setCharacterSheetTemplate(adventure.characterSheetTemplate);
        }

        // Load stats, resources, inventory, etc.
        setStats(template.stats || []);
        setResources(template.resources || []);
        setInventory(template.inventory || []);
        setAbilities(template.abilities || []);
        setPassives(template.nodeEffects?.passives || []);
        setLore(template.lore || []);
        setRelationships(template.relationships || []);
        setConditions(template.conditions || []);
        setAchievements(template.achievements || []);
        setQuests(template.quests || []);
        setNPCs(template.npcs || []);
        setCustomTables(template.customTables || []);
        setVariables(template.variables || []);
        setUpgradeSettings({
          ...DEFAULT_UPGRADE_SETTINGS,
          ...(template.upgradeSettings || {}),
        });
        setLevelingSettings(cloneLevelingSettings(template.levelingSettings));
        setSkillTrees(template.skillTrees || []);

        // Load Advanced RPG Tools state
        if (template.agmtState) {
          setAGMTEnabled(true);
          setAGMTState(template.agmtState);
        } else {
          setAGMTEnabled(false);
          setAGMTState({
            chaosFactor: 5,
            threads: [],
            sceneCount: 0,
            skillCheckHistory: [],
            currentStreak: 0,
            lastChaosAdjustment: -999,
          });
        }

        // Local drafts always take the adventure as loaded (no online conflict resolution needed)
        addNotification("Local adventure loaded for editing", "success");

        // Mark this adventure as loaded to prevent re-fetching on tab focus
        hasLoadedAdventureRef.current = editAdventureId;
      } catch (error) {
        console.error("Error loading adventure:", error);
        addNotification("Failed to load adventure", "failure");
        router.push("/library");
      } finally {
        setLoading(false);
        setInitialLoadComplete(true);
      }
    };

    loadAdventure();
  }, [editAdventureId, router, addNotification]);

  // Helper function to apply local draft to state
  const applyLocalDraft = (saved: any) => {
    if (saved.title) setTitle(saved.title);
    if (saved.shortDescription) setShortDescription(saved.shortDescription);
    if (saved.description) setDescription(saved.description);
    if (saved.difficulty) setDifficulty(saved.difficulty);
    if (saved.visibility) setVisibility(saved.visibility);
    if (saved.nsfw !== undefined) setNsfw(saved.nsfw);
    if (Array.isArray(saved.tags)) setTags(saved.tags);
    if (saved.thumbnailUrl) setThumbnailUrl(saved.thumbnailUrl);
    if (saved.bannerUrl) setBannerUrl(saved.bannerUrl);

    if (saved.selectedPreset !== undefined)
      setSelectedPreset(saved.selectedPreset);
    if (Array.isArray(saved.presets)) setPresets(saved.presets);
    if (saved.characterSheetTemplate)
      setCharacterSheetTemplate(saved.characterSheetTemplate);
    if (saved.characterSheet !== undefined)
      setCharacterSheet(saved.characterSheet);
    if (saved.premise !== undefined) setPremise(saved.premise);
    if (saved.intro !== undefined) setIntro(saved.intro);
    if (typeof saved.maxChapters === "number")
      setMaxChapters(saved.maxChapters);
    if (saved.authorNotes !== undefined) setAuthorNotes(saved.authorNotes);

    if (Array.isArray(saved.stats)) setStats(saved.stats);
    if (Array.isArray(saved.resources)) setResources(saved.resources);
    if (Array.isArray(saved.inventory)) setInventory(saved.inventory);
    if (Array.isArray(saved.abilities)) setAbilities(saved.abilities);
    if (Array.isArray(saved.passives)) setPassives(saved.passives);
    if (Array.isArray(saved.lore)) setLore(saved.lore);
    if (Array.isArray(saved.relationships))
      setRelationships(saved.relationships);
    if (Array.isArray(saved.conditions)) setConditions(saved.conditions);
    if (Array.isArray(saved.achievements)) setAchievements(saved.achievements);
    if (Array.isArray(saved.quests)) setQuests(saved.quests);
    if (Array.isArray(saved.npcs)) setNPCs(saved.npcs);
    if (Array.isArray(saved.customTables)) setCustomTables(saved.customTables);
    if (Array.isArray(saved.variables)) setVariables(saved.variables);
    if (saved.upgradeSettings)
      setUpgradeSettings({
        ...DEFAULT_UPGRADE_SETTINGS,
        ...saved.upgradeSettings,
      });
    if (Array.isArray(saved.skillTrees)) setSkillTrees(saved.skillTrees);
    if (saved.agmtEnabled !== undefined) setAGMTEnabled(saved.agmtEnabled);
    if (saved.agmtState) setAGMTState(saved.agmtState);
    if (Array.isArray(saved.startingChoices))
      setStartingChoices(saved.startingChoices);

    if (
      typeof saved.currentStep === "string" &&
      steps.some((s) => s.id === saved.currentStep)
    ) {
      setCurrentStep(saved.currentStep as CreatorStep);
    }
  };

  // Conflict resolution handlers
  const handleUseLocalVersion = () => {
    if (!conflictData || !editAdventureId) return;

    applyLocalDraft(conflictData.localDraft);
    setShowConflictModal(false);
    setConflictData(null);
    addNotification("Using local version (from this device)", "success");
  };

  const handleUseOnlineVersion = () => {
    if (!conflictData || !editAdventureId) return;

    // Clear the local draft since user chose online version
    const draftKey = `your-story:creator-draft:${editAdventureId}`;
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(draftKey);
    }

    // Online version is already loaded, just close the modal
    setShowConflictModal(false);
    setConflictData(null);
    addNotification("Using online version (from cloud)", "success");
  };

  // Load copied adventure from sessionStorage
  useEffect(() => {
    if (!isCopyMode) return;
    if (editAdventureId) return; // Don't load copy if we're editing
    if (hasLoadedCopyRef.current) return; // Already processed this copy

    const loadCopiedAdventure = async () => {
      // Mark as processed immediately to prevent double-loading
      hasLoadedCopyRef.current = true;

      setLoading(true);
      try {
        const copiedData = sessionStorage.getItem(
          "your-story:copied-adventure",
        );
        if (!copiedData) {
          addNotification("No adventure data found to copy", "failure");
          router.push("/library");
          return;
        }

        const adventure = JSON.parse(copiedData) as Adventure;

        // Clear the sessionStorage after reading
        sessionStorage.removeItem("your-story:copied-adventure");

        // Load basic info
        setTitle(adventure.title || "");
        setShortDescription(adventure.shortDescription || "");
        setDescription(adventure.description || "");
        setDifficulty(adventure.difficulty || "medium");
        setVisibility("private"); // Always private for copies
        setNsfw(adventure.nsfw || false);
        setTags(adventure.tags || []);
        setThumbnailUrl(adventure.thumbnailUrl || "");
        setBannerUrl(adventure.bannerUrl || "");

        // Load starting choices from adventure
        setStartingChoices(adventure.startingChoices || []);

        // Load character sheet template
        if (adventure.characterSheetTemplate) {
          setCharacterSheetTemplate(adventure.characterSheetTemplate);
        }

        // Load story template data
        const template = adventure.storyTemplate;
        if (template) {
          setPremise(template.premise || "");
          setIntro(template.intro || "");
          setMaxChapters(template.max_chapters || 8);
          setAuthorNotes(template.author_notes || "");
          setSelectedPreset(
            template.selected_preset || adventure.selectedPreset || "custom",
          );
          setPresets(template.presets || adventure.presets || [DEFAULT_PRESET]);

          // Load stats, resources, inventory, etc.
          setStats(template.stats || []);
          setResources(template.resources || []);
          setInventory(template.inventory || []);
          setAbilities(template.abilities || []);
          setPassives(template.nodeEffects?.passives || []);
          setLore(template.lore || []);
          setRelationships(template.relationships || []);
          setConditions(template.conditions || []);
          setAchievements(template.achievements || []);
          setQuests(template.quests || []);
          setNPCs(template.npcs || []);
          setCustomTables(template.customTables || []);
          setVariables(template.variables || []);
          setUpgradeSettings({
            ...DEFAULT_UPGRADE_SETTINGS,
            ...(template.upgradeSettings || {}),
          });
          setSkillTrees(template.skillTrees || []);

          // Load Advanced RPG Tools state
          if (template.agmtState) {
            setAGMTEnabled(true);
            setAGMTState(template.agmtState);
          }
        }

        addNotification(
          "Adventure copied! Make your changes and save.",
          "success",
        );

        // Remove the copy param from URL without triggering navigation
        window.history.replaceState({}, "", "/creator/manual");
      } catch (error) {
        console.error("Error loading copied adventure:", error);
        addNotification("Failed to load copied adventure", "failure");
        router.push("/library");
      } finally {
        setLoading(false);
        setInitialLoadComplete(true);
      }
    };

    loadCopiedAdventure();
  }, [isCopyMode, editAdventureId, router, addNotification]);

  // Character Sheet Template (for custom characters)
  const [characterSheetTemplate, setCharacterSheetTemplate] =
    useState<CharacterSheetTemplate>(() =>
      createCharacterSheetTemplate(DEFAULT_CHARACTER_SHEET_TEMPLATE),
    );

  // Character Sheet (for presets - pre-written)
  const [characterSheet, setCharacterSheet] = useState("");

  // Story Data
  const [premise, setPremise] = useState("");
  const [intro, setIntro] = useState("");
  const [maxChapters, setMaxChapters] = useState(8);
  const [authorNotes, setAuthorNotes] = useState("");

  // Stats
  const [stats, setStats] = useState<Stat[]>([]);
  const [newStat, setNewStat] = useState<Partial<Stat>>({
    name: "",
    value: 50,
    description: "",
    symbol: "Star",
  });
  const [draggedStatIndex, setDraggedStatIndex] = useState<number | null>(null);
  const [editingStatIndex, setEditingStatIndex] = useState<number | null>(null);
  const [editStat, setEditStat] = useState<Partial<Stat>>({});

  // Resources
  const [resources, setResources] = useState<Resource[]>([]);
  const [newResource, setNewResource] = useState<Partial<Resource>>({
    name: "",
    value: 50,
    maxValue: 100,
    description: "",
    symbol: "Gem",
  });
  const [draggedResourceIndex, setDraggedResourceIndex] = useState<
    number | null
  >(null);
  const [editingResourceIndex, setEditingResourceIndex] = useState<
    number | null
  >(null);
  const [editResource, setEditResource] = useState<Partial<Resource>>({});

  // Starting Inventory
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [newItem, setNewItem] = useState<Partial<InventoryItem>>({
    name: "",
    quantity: 1,
    description: "",
    type: "misc",
    symbol: "Package",
    grade: "common",
    durability: 3,
    maxDurability: 3,
  });
  const [draggedInventoryIndex, setDraggedInventoryIndex] = useState<
    number | null
  >(null);
  const [editingInventoryIndex, setEditingInventoryIndex] = useState<
    number | null
  >(null);
  const [editInventoryItem, setEditInventoryItem] = useState<
    Partial<InventoryItem>
  >({});

  // Starting Abilities
  const [abilities, setAbilities] = useState<Ability[]>([]);
  const [newAbility, setNewAbility] = useState<Partial<Ability>>({
    name: "",
    description: "",
    grade: "novice",
    cost: [],
    cooldown: 0,
    currentCooldown: 0,
    symbol: "Sparkles",
  });
  const [newAbilityCosts, setNewAbilityCosts] = useState<AbilityCost[]>([]);
  const [draggedAbilityIndex, setDraggedAbilityIndex] = useState<number | null>(
    null,
  );
  const [editingAbilityIndex, setEditingAbilityIndex] = useState<number | null>(
    null,
  );
  const [editAbility, setEditAbility] = useState<Partial<Ability>>({});
  const [editAbilityCosts, setEditAbilityCosts] = useState<AbilityCost[]>([]);

  // Starting Passives
  const [passives, setPassives] = useState<
    { name: string; description: string; nodeId: string }[]
  >([]);
  const [newPassive, setNewPassive] = useState({ name: "", description: "" });

  const [editingPassiveIndex, setEditingPassiveIndex] = useState<number | null>(
    null,
  );
  const [editPassive, setEditPassive] = useState({ name: "", description: "" });

  // Lore
  const [lore, setLore] = useState<StoryLore[]>([]);
  const [newLore, setNewLore] = useState<Partial<StoryLore>>({
    title: "",
    content: "",
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
    thumbnailUrl: "",
    on: true,
    alwaysOn: false,
    trigger_lores: [],
    untrigger_lores: [],
    tags: [],
    folder: "",
    type: undefined, // "lore" (default) or "mechanics" (rules)
  });
  const [newLoreOnTrigger, setNewLoreOnTrigger] = useState("");
  const [newLoreOffTrigger, setNewLoreOffTrigger] = useState("");
  const [newLoreKey, setNewLoreKey] = useState("");
  const [newLoreAdvancedExpanded, setNewLoreAdvancedExpanded] = useState(false);
  const [draggedLoreIndex, setDraggedLoreIndex] = useState<number | null>(null);
  const [editingLoreIndex, setEditingLoreIndex] = useState<number | null>(null);
  const [editLore, setEditLore] = useState<Partial<StoryLore>>({});
  const [editLoreOnTrigger, setEditLoreOnTrigger] = useState("");
  const [editLoreOffTrigger, setEditLoreOffTrigger] = useState("");
  const [editLoreKey, setEditLoreKey] = useState("");
  const [editLoreAdvancedExpanded, setEditLoreAdvancedExpanded] =
    useState(false);
  const [loreSearchQuery, setLoreSearchQuery] = useState("");
  const [lorePage, setLorePage] = useState(1);
  const loreItemsPerPage = 10;
  // Pending tag deletion confirmation (key format: "type:context:value")
  const [pendingTagDelete, setPendingTagDelete] = useState<string | null>(null);
  // Lore filtering by tags and folders
  const [loreFilterFolder, setLoreFilterFolder] = useState<string>("");
  const [loreFilterTags, setLoreFilterTags] = useState<string[]>([]);
  const [newLoreTag, setNewLoreTag] = useState("");
  const [editLoreTag, setEditLoreTag] = useState("");

  // Relationships
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [newRelationship, setNewRelationship] = useState<Partial<Relationship>>(
    {
      name: "",
      value: 0,
      description: "",
      symbol: "Meh",
    },
  );
  const [draggedRelationshipIndex, setDraggedRelationshipIndex] = useState<
    number | null
  >(null);
  const [editingRelationshipIndex, setEditingRelationshipIndex] = useState<
    number | null
  >(null);
  const [editRelationship, setEditRelationship] = useState<
    Partial<Relationship>
  >({});
  const [relationshipSearchQuery, setRelationshipSearchQuery] = useState("");
  const [relationshipPage, setRelationshipPage] = useState(1);
  const relationshipItemsPerPage = 10;

  // Conditions/Afflictions
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [newCondition, setNewCondition] = useState<Partial<Condition>>({
    name: "",
    tier: 1,
    description: "",
    affects: [],
    affectsAll: false,
    permanent: false,
  });
  const [editingConditionIndex, setEditingConditionIndex] = useState<
    number | null
  >(null);
  const [editCondition, setEditCondition] = useState<Partial<Condition>>({});

  // Advanced RPG Tools
  const [agmtEnabled, setAGMTEnabled] = useState(false);
  const [agmtState, setAGMTState] = useState<AGMTState>({
    chaosFactor: 5,
    sceneCount: 0,
    skillCheckHistory: [],
    currentStreak: 0,
    lastChaosAdjustment: -999,
  });

  // Achievements
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [newAchievement, setNewAchievement] = useState<Partial<Achievement>>({
    title: "",
    description: "",
    points: 10,
    symbol: "Trophy",
  });
  const [draggedAchievementIndex, setDraggedAchievementIndex] = useState<
    number | null
  >(null);
  const [editingAchievementIndex, setEditingAchievementIndex] = useState<
    number | null
  >(null);
  const [editAchievement, setEditAchievement] = useState<Partial<Achievement>>(
    {},
  );

  // Quests
  const [quests, setQuests] = useState<Quest[]>([]);
  const [newQuest, setNewQuest] = useState<Partial<Quest>>({
    title: "",
    shortDescription: "",
    description: "",
    points: 10,
    active: true,
    fulfilled: false,
  });
  const [draggedQuestIndex, setDraggedQuestIndex] = useState<number | null>(
    null,
  );
  const [editingQuestIndex, setEditingQuestIndex] = useState<number | null>(
    null,
  );
  const [editQuest, setEditQuest] = useState<Partial<Quest>>({});

  // NPCs
  const [npcs, setNPCs] = useState<NPC[]>([]);
  const [newNPC, setNewNPC] = useState<Partial<NPC>>({
    name: "",
    description: "",
    role: "",
    status: "alive",
    relationship: "",
    attitude: "neutral",
    symbol: "User",
    faction: "",
    lastSeen: "",
    notes: "",
  });
  const [editingNPCIndex, setEditingNPCIndex] = useState<number | null>(null);
  const [editNPC, setEditNPC] = useState<Partial<NPC>>({});
  const [showNPCIconPicker, setShowNPCIconPicker] = useState(false);
  const [showEditNPCIconPicker, setShowEditNPCIconPicker] = useState(false);

  // Starting Choices
  const [startingChoices, setStartingChoices] = useState<StartingChoice[]>([]);
  const [newStartingChoice, setNewStartingChoice] = useState<
    Partial<StartingChoice>
  >({
    text: "",
    intro_override: "",
    skill_used: "",
    skill_dc: undefined,
    resource_used: "",
    item_used: "",
    item_loss: false,
    agmt_check: "",
    agmt_context_only: false,
    agmt_table: "",
    custom_table: "",
  });
  const [editingStartingChoiceIndex, setEditingStartingChoiceIndex] = useState<
    number | null
  >(null);
  const [editStartingChoice, setEditStartingChoice] = useState<
    Partial<StartingChoice>
  >({});

  // Custom Tables
  const [customTables, setCustomTables] = useState<CustomTable[]>([]);
  const [newTable, setNewTable] = useState<Partial<CustomTable>>({
    name: "",
    description: "",
    entries: [],
  });
  const [editingTableIndex, setEditingTableIndex] = useState<number | null>(
    null,
  );
  const [editTable, setEditTable] = useState<Partial<CustomTable>>({});

  // Variables
  const [variables, setVariables] = useState<Variable[]>([]);
  const [draggedVariableIndex, setDraggedVariableIndex] = useState<
    number | null
  >(null);

  // Local draft persistence (separate keys for new vs edit mode)
  const draftKey = editAdventureId
    ? `your-story:creator-draft:${editAdventureId}`
    : "your-story:creator-draft";

  const commonTags = [
    "Fantasy",
    "Sci-Fi",
    "Mystery",
    "Horror",
    "Romance",
    "Comedy",
    "Drama",
    "Action",
    "Adventure",
    "Thriller",
    "Post-Apocalyptic",
    "Cyberpunk",
    "Steampunk",
    "Historical",
    "Contemporary",
    "Magic",
    "Combat",
    "Exploration",
    "Puzzle",
    "Survival",
    "Detective",
    "Noir",
  ];

  const steps: { id: CreatorStep; label: string; icon: string }[] = [
    { id: "basic", label: "Basic Info", icon: "FileText" },
    { id: "character-sheet", label: "Character Sheet", icon: "User" },
    { id: "preset", label: "Character Preset", icon: "Users" },
    { id: "premise", label: "Story Setup", icon: "BookOpen" },
    { id: "starting-choices", label: "Starting Choices", icon: "Play" },
    { id: "lore", label: "Notes", icon: "Scroll" },
    { id: "achievements", label: "Achievements", icon: "Trophy" },
    { id: "quests", label: "Quests", icon: "ClipboardList" },
    { id: "npcs", label: "NPCs", icon: "UserCircle" },
    { id: "variables", label: "Variables", icon: "Variable" },
    { id: "tables", label: "Custom Tables", icon: "Dices" },
    { id: "mythic", label: "Advanced RPG Tools", icon: "Sparkles" },
    { id: "preview", label: "Preview", icon: "Eye" },
  ];

  // Load draft on mount (only for new adventures, not edit mode or copy mode)
  useEffect(() => {
    // Skip if editing - the edit effect handles draft overlay after API load
    if (editAdventureId) return;
    // Skip if copying - the copy effect handles loading from sessionStorage
    if (isCopyMode) return;
    if (!draftKey) return;

    try {
      const raw =
        typeof window !== "undefined"
          ? window.localStorage.getItem(draftKey)
          : null;
      if (!raw) return;
      const saved = JSON.parse(raw) as any;

      if (saved.title) setTitle(saved.title);
      if (saved.shortDescription) setShortDescription(saved.shortDescription);
      if (saved.description) setDescription(saved.description);
      if (saved.difficulty) setDifficulty(saved.difficulty);
      if (saved.visibility) setVisibility(saved.visibility);
      if (saved.nsfw !== undefined) setNsfw(saved.nsfw);
      if (Array.isArray(saved.tags)) setTags(saved.tags);
      if (saved.thumbnailUrl) setThumbnailUrl(saved.thumbnailUrl);
      if (saved.bannerUrl) setBannerUrl(saved.bannerUrl);

      if (saved.selectedPreset !== undefined)
        setSelectedPreset(saved.selectedPreset);
      if (Array.isArray(saved.presets)) setPresets(saved.presets);
      if (saved.characterSheet !== undefined)
        setCharacterSheet(saved.characterSheet);
      if (saved.characterSheetTemplate !== undefined)
        setCharacterSheetTemplate(saved.characterSheetTemplate);
      if (saved.premise !== undefined) setPremise(saved.premise);
      if (saved.intro !== undefined) setIntro(saved.intro);
      if (typeof saved.maxChapters === "number")
        setMaxChapters(saved.maxChapters);
      if (saved.authorNotes !== undefined) setAuthorNotes(saved.authorNotes);

      if (Array.isArray(saved.stats)) setStats(saved.stats);
      if (Array.isArray(saved.resources)) setResources(saved.resources);
      if (Array.isArray(saved.inventory)) setInventory(saved.inventory);
      if (Array.isArray(saved.abilities)) setAbilities(saved.abilities);
      if (Array.isArray(saved.passives)) setPassives(saved.passives);
      if (Array.isArray(saved.lore)) setLore(saved.lore);
      if (Array.isArray(saved.achievements))
        setAchievements(saved.achievements);
      if (Array.isArray(saved.quests)) setQuests(saved.quests);
      if (Array.isArray(saved.npcs)) setNPCs(saved.npcs);
      if (Array.isArray(saved.customTables))
        setCustomTables(saved.customTables);
      if (Array.isArray(saved.variables)) setVariables(saved.variables);
      if (saved.upgradeSettings)
        setUpgradeSettings({
          ...DEFAULT_UPGRADE_SETTINGS,
          ...saved.upgradeSettings,
        });
      if (saved.levelingSettings)
        setLevelingSettings(cloneLevelingSettings(saved.levelingSettings));
      if (Array.isArray(saved.skillTrees)) setSkillTrees(saved.skillTrees);
      if (saved.agmtEnabled !== undefined) setAGMTEnabled(saved.agmtEnabled);
      if (saved.agmtState) setAGMTState(saved.agmtState);
      if (Array.isArray(saved.startingChoices))
        setStartingChoices(saved.startingChoices);

      if (
        typeof saved.currentStep === "string" &&
        steps.some((s) => s.id === saved.currentStep)
      ) {
        setCurrentStep(saved.currentStep as CreatorStep);
      }

      addNotification(
        "Restored unsaved adventure draft from this device",
        "success",
      );
    } catch (err) {
      console.error("Failed to restore creator draft", err);
    }
    setInitialLoadComplete(true);
    // we intentionally omit dependencies so this runs once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save draft when fields change
  useEffect(() => {
    // Don't save until initial load is complete to avoid overwriting draft with API data
    if (!initialLoadComplete) return;
    if (!draftKey) return;

    // Safety check: Don't auto-save an empty/invalid draft over an existing adventure
    // This prevents accidental data loss when editing
    if (editAdventureId) {
      // When editing, only save draft if we have minimum valid data
      if (!title.trim() && !premise.trim() && !intro.trim()) {
        // All critical fields are empty - don't save draft to avoid overwriting
        return;
      }
    }

    const payload = {
      title,
      shortDescription,
      description,
      difficulty,
      visibility,
      nsfw,
      tags,
      thumbnailUrl,
      bannerUrl,
      selectedPreset,
      presets,
      characterSheet,
      characterSheetTemplate,
      premise,
      intro,
      maxChapters,
      authorNotes,
      stats,
      resources,
      inventory,
      abilities,
      passives,
      lore,
      relationships,
      conditions,
      achievements,
      quests,
      npcs,
      customTables,
      variables,
      levelingSettings,
      upgradeSettings,
      skillTrees,
      agmtEnabled,
      agmtState,
      startingChoices,
      currentStep,
      updatedAt: Date.now(),
    };

    try {
      if (typeof window !== "undefined") {
        const jsonPayload = JSON.stringify(payload);

        // Try to save the draft
        try {
          window.localStorage.setItem(draftKey, jsonPayload);
        } catch (quotaError) {
          // If quota exceeded, try to free up space by removing old creator drafts
          if (
            quotaError instanceof DOMException &&
            (quotaError.name === "QuotaExceededError" || quotaError.code === 22)
          ) {
            console.warn(
              "localStorage quota exceeded, cleaning up old drafts...",
            );

            // Find and remove old creator drafts (keep current one)
            const keysToRemove: string[] = [];
            for (let i = 0; i < window.localStorage.length; i++) {
              const key = window.localStorage.key(i);
              if (
                key &&
                key.startsWith("your-story:creator-draft:") &&
                key !== draftKey
              ) {
                keysToRemove.push(key);
              }
            }

            // Remove old drafts (oldest first based on updatedAt)
            const draftsWithTime: { key: string; time: number }[] = [];
            for (const key of keysToRemove) {
              try {
                const data = JSON.parse(
                  window.localStorage.getItem(key) || "{}",
                );
                draftsWithTime.push({ key, time: data.updatedAt || 0 });
              } catch {
                // If we can't parse it, mark it for removal
                draftsWithTime.push({ key, time: 0 });
              }
            }

            // Sort by time (oldest first) and remove
            draftsWithTime.sort((a, b) => a.time - b.time);
            for (const { key } of draftsWithTime) {
              window.localStorage.removeItem(key);
              console.log(`Removed old draft: ${key}`);

              // Try to save again after each removal
              try {
                window.localStorage.setItem(draftKey, jsonPayload);
                console.log("Successfully saved draft after cleanup");
                return; // Success!
              } catch {
                // Still not enough space, continue cleaning
              }
            }

            // If still failing, the payload itself might be too large
            // Try saving a minimal version without large fields
            console.warn(
              "Draft too large even after cleanup, saving minimal version",
            );
            const minimalPayload = {
              ...payload,
              lore: payload.lore?.slice(0, 10), // Keep only first 10 lore entries
              presets: payload.presets?.map((p) => ({
                ...p,
                characterSheet: undefined,
              })), // Remove preset sheets
              characterSheet: undefined, // Remove filled sheet (template is more important)
            };
            try {
              window.localStorage.setItem(
                draftKey,
                JSON.stringify(minimalPayload),
              );
              console.log("Saved minimal draft version");
            } catch {
              console.error(
                "Failed to save even minimal draft - localStorage may be completely full",
              );
            }
          } else {
            throw quotaError;
          }
        }
      }
    } catch (err) {
      console.error("Failed to save creator draft", err);
    }
  }, [
    initialLoadComplete,
    draftKey,
    title,
    shortDescription,
    description,
    difficulty,
    visibility,
    nsfw,
    tags,
    thumbnailUrl,
    bannerUrl,
    selectedPreset,
    presets,
    characterSheet,
    characterSheetTemplate,
    premise,
    intro,
    maxChapters,
    authorNotes,
    stats,
    resources,
    inventory,
    abilities,
    passives,
    lore,
    relationships,
    conditions,
    achievements,
    quests,
    npcs,
    customTables,
    variables,
    levelingSettings,
    agmtEnabled,
    agmtState,
    upgradeSettings,
    skillTrees,
    startingChoices,
    currentStep,
  ]);

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag("");
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleThumbnailUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      addNotification("Please select an image file", "warning");
      return;
    }

    setUploadingThumbnail(true);

    try {
      const compressed = await compressImage(file, 400, 300, 0.8);
      const dataUrl = await fileToDataUrl(compressed);
      setThumbnailUrl(dataUrl);
      addNotification("Thumbnail uploaded!", "success");
    } catch (error: any) {
      console.error("Error uploading thumbnail:", error);
      addNotification(`Upload failed: ${error.message}`, "failure");
    } finally {
      setUploadingThumbnail(false);
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      addNotification("Please select an image file", "warning");
      return;
    }

    setUploadingBanner(true);

    try {
      const compressed = await compressImage(file, 1200, 400, 0.85);
      const dataUrl = await fileToDataUrl(compressed);
      setBannerUrl(dataUrl);
      addNotification("Banner uploaded!", "success");
    } catch (error: any) {
      console.error("Error uploading banner:", error);
      addNotification(`Upload failed: ${error.message}`, "failure");
    } finally {
      setUploadingBanner(false);
    }
  };

  // Get default AI image prompt based on adventure data
  const getDefaultImagePrompt = (type: "thumbnail" | "banner") => {
    const base = `Please create a ${
      type === "thumbnail" ? "cover" : "wide banner"
    } for my text adventure:

${title || "Untitled Adventure"}
${shortDescription || ""}
${description || ""}`;
    return base;
  };

  // Generate and upload AI image
  const generateAIImage = async (type: "thumbnail" | "banner") => {
    // Validate API key for the selected provider
    if (imageProvider === "openrouter" && !apiKeys.openRouterKey) {
      addNotification(
        "OpenRouter API key required. Please add your API key in Settings.",
        "warning",
      );
      return;
    }
    if (imageProvider === "deepinfra" && !apiKeys.deepinfraKey) {
      addNotification(
        "DeepInfra API key required. Please add your API key in Settings.",
        "warning",
      );
      return;
    }

    const prompt = type === "thumbnail" ? thumbnailPrompt : bannerPrompt;
    if (!prompt.trim()) {
      addNotification("Please enter a prompt", "warning");
      return;
    }

    const setGenerating =
      type === "thumbnail" ? setGeneratingThumbnail : setGeneratingBanner;
    const setUrl = type === "thumbnail" ? setThumbnailUrl : setBannerUrl;

    setGenerating(true);
    setShowAIImageModal(null);

    try {
      // Call image generation API
      const response = await fetch("/api/creator/generate-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          model: imageModel,
          imageType: type,
          provider: imageProvider,
          openRouterKey:
            imageProvider === "openrouter" ? apiKeys.openRouterKey : undefined,
          deepInfraKey:
            imageProvider === "deepinfra" ? apiKeys.deepinfraKey : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Image generation failed");
      }

      const { imageUrl } = await response.json();

      setUrl(imageUrl);

      addNotification(
        `${type === "thumbnail" ? "Thumbnail" : "Banner"} generated!`,
        "success",
      );
    } catch (error: any) {
      console.error("Error generating image:", error);
      addNotification(error.message || "Image generation failed", "failure");
    } finally {
      setGenerating(false);
    }
  };

  const addStat = () => {
    if (newStat.name && newStat.description) {
      setStats([...stats, newStat as Stat]);
      setNewStat({ name: "", value: 50, description: "", symbol: "Star" });
    }
  };

  const removeStat = (index: number) => {
    setStats(stats.filter((_, i) => i !== index));
  };

  const addResource = () => {
    if (newResource.name && newResource.description) {
      setResources([...resources, newResource as Resource]);
      setNewResource({
        name: "",
        value: 50,
        maxValue: 100,
        description: "",
        symbol: "Gem",
      });
    }
  };

  const removeResource = (index: number) => {
    setResources(resources.filter((_, i) => i !== index));
  };

  const addInventoryItem = () => {
    if (newItem.name) {
      setInventory([...inventory, newItem as InventoryItem]);
      setNewItem({
        name: "",
        quantity: 1,
        description: "",
        type: "misc",
        symbol: "Package",
        grade: "common",
        durability: 3,
        maxDurability: 3,
      });
    }
  };

  const removeInventoryItem = (index: number) => {
    setInventory(inventory.filter((_, i) => i !== index));
  };

  // Stat drag-and-drop and edit functions
  const handleStatDragStart = (index: number) => {
    setDraggedStatIndex(index);
  };

  const handleStatDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedStatIndex === null || draggedStatIndex === index) return;

    const newStats = [...stats];
    const draggedItem = newStats[draggedStatIndex];
    newStats.splice(draggedStatIndex, 1);
    newStats.splice(index, 0, draggedItem);

    setStats(newStats);
    setDraggedStatIndex(index);
  };

  const handleStatDragEnd = () => {
    setDraggedStatIndex(null);
  };

  const moveStatUp = (index: number) => {
    if (index === 0) return;
    const newStats = [...stats];
    [newStats[index - 1], newStats[index]] = [
      newStats[index],
      newStats[index - 1],
    ];
    setStats(newStats);
  };

  const moveStatDown = (index: number) => {
    if (index === stats.length - 1) return;
    const newStats = [...stats];
    [newStats[index], newStats[index + 1]] = [
      newStats[index + 1],
      newStats[index],
    ];
    setStats(newStats);
  };

  const startEditStat = (index: number) => {
    setEditingStatIndex(index);
    setEditStat({ ...stats[index] });
  };

  const cancelEditStat = () => {
    setEditingStatIndex(null);
    setEditStat({});
  };

  const saveEditStat = () => {
    if (editingStatIndex !== null && editStat.name && editStat.description) {
      const updated = [...stats];
      updated[editingStatIndex] = editStat as Stat;
      setStats(updated);
      setEditingStatIndex(null);
      setEditStat({});
    }
  };

  // Resource drag-and-drop and edit functions
  const handleResourceDragStart = (index: number) => {
    setDraggedResourceIndex(index);
  };

  const handleResourceDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedResourceIndex === null || draggedResourceIndex === index) return;

    const newResources = [...resources];
    const draggedItem = newResources[draggedResourceIndex];
    newResources.splice(draggedResourceIndex, 1);
    newResources.splice(index, 0, draggedItem);

    setResources(newResources);
    setDraggedResourceIndex(index);
  };

  const handleResourceDragEnd = () => {
    setDraggedResourceIndex(null);
  };

  const moveResourceUp = (index: number) => {
    if (index === 0) return;
    const newResources = [...resources];
    [newResources[index - 1], newResources[index]] = [
      newResources[index],
      newResources[index - 1],
    ];
    setResources(newResources);
  };

  const moveResourceDown = (index: number) => {
    if (index === resources.length - 1) return;
    const newResources = [...resources];
    [newResources[index], newResources[index + 1]] = [
      newResources[index + 1],
      newResources[index],
    ];
    setResources(newResources);
  };

  const startEditResource = (index: number) => {
    setEditingResourceIndex(index);
    setEditResource({ ...resources[index] });
  };

  const cancelEditResource = () => {
    setEditingResourceIndex(null);
    setEditResource({});
  };

  const saveEditResource = () => {
    if (
      editingResourceIndex !== null &&
      editResource.name &&
      editResource.description
    ) {
      const updated = [...resources];
      updated[editingResourceIndex] = editResource as Resource;
      setResources(updated);
      setEditingResourceIndex(null);
      setEditResource({});
    }
  };

  // Inventory drag-and-drop and edit functions
  const handleInventoryDragStart = (index: number) => {
    setDraggedInventoryIndex(index);
  };

  const handleInventoryDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedInventoryIndex === null || draggedInventoryIndex === index)
      return;

    const newInventory = [...inventory];
    const draggedItem = newInventory[draggedInventoryIndex];
    newInventory.splice(draggedInventoryIndex, 1);
    newInventory.splice(index, 0, draggedItem);

    setInventory(newInventory);
    setDraggedInventoryIndex(index);
  };

  const handleInventoryDragEnd = () => {
    setDraggedInventoryIndex(null);
  };

  const moveInventoryUp = (index: number) => {
    if (index === 0) return;
    const newInventory = [...inventory];
    [newInventory[index - 1], newInventory[index]] = [
      newInventory[index],
      newInventory[index - 1],
    ];
    setInventory(newInventory);
  };

  const moveInventoryDown = (index: number) => {
    if (index === inventory.length - 1) return;
    const newInventory = [...inventory];
    [newInventory[index], newInventory[index + 1]] = [
      newInventory[index + 1],
      newInventory[index],
    ];
    setInventory(newInventory);
  };

  const startEditInventoryItem = (index: number) => {
    setEditingInventoryIndex(index);
    setEditInventoryItem({ ...inventory[index] });
  };

  const cancelEditInventoryItem = () => {
    setEditingInventoryIndex(null);
    setEditInventoryItem({});
  };

  const saveEditInventoryItem = () => {
    if (editingInventoryIndex !== null && editInventoryItem.name) {
      const updated = [...inventory];
      updated[editingInventoryIndex] = editInventoryItem as InventoryItem;
      setInventory(updated);
      setEditingInventoryIndex(null);
      setEditInventoryItem({});
    }
  };

  // Ability functions
  const addAbility = () => {
    if (newAbility.name) {
      const ability = initializeAbility({
        ...newAbility,
        cost: newAbilityCosts,
      } as Ability);
      setAbilities([...abilities, ability]);
      setNewAbility({
        name: "",
        description: "",
        grade: "novice",
        cost: [],
        cooldown: 0,
        currentCooldown: 0,
        symbol: "Sparkles",
      });
      setNewAbilityCosts([]);
    }
  };

  const removeAbility = (index: number) => {
    setAbilities(abilities.filter((_, i) => i !== index));
  };

  const handleAbilityDragStart = (index: number) => {
    setDraggedAbilityIndex(index);
  };

  const handleAbilityDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedAbilityIndex === null || draggedAbilityIndex === index) return;

    const newAbilities = [...abilities];
    const draggedItem = newAbilities[draggedAbilityIndex];
    newAbilities.splice(draggedAbilityIndex, 1);
    newAbilities.splice(index, 0, draggedItem);

    setAbilities(newAbilities);
    setDraggedAbilityIndex(index);
  };

  const handleAbilityDragEnd = () => {
    setDraggedAbilityIndex(null);
  };

  const moveAbilityUp = (index: number) => {
    if (index === 0) return;
    const newAbilities = [...abilities];
    [newAbilities[index - 1], newAbilities[index]] = [
      newAbilities[index],
      newAbilities[index - 1],
    ];
    setAbilities(newAbilities);
  };

  const moveAbilityDown = (index: number) => {
    if (index === abilities.length - 1) return;
    const newAbilities = [...abilities];
    [newAbilities[index], newAbilities[index + 1]] = [
      newAbilities[index + 1],
      newAbilities[index],
    ];
    setAbilities(newAbilities);
  };

  const startEditAbility = (index: number) => {
    setEditingAbilityIndex(index);
    setEditAbility({ ...abilities[index] });
    setEditAbilityCosts([...(abilities[index].cost || [])]);
  };

  const cancelEditAbility = () => {
    setEditingAbilityIndex(null);
    setEditAbility({});
    setEditAbilityCosts([]);
  };

  const saveEditAbility = () => {
    if (editingAbilityIndex !== null && editAbility.name) {
      const updated = [...abilities];
      updated[editingAbilityIndex] = {
        ...editAbility,
        cost: editAbilityCosts,
      } as Ability;
      setAbilities(updated);
      setEditingAbilityIndex(null);
      setEditAbility({});
      setEditAbilityCosts([]);
    }
  };

  const addNewAbilityCost = () => {
    setNewAbilityCosts([
      ...newAbilityCosts,
      { type: "resource", name: "", amount: 1 },
    ]);
  };

  const removeNewAbilityCost = (index: number) => {
    setNewAbilityCosts(newAbilityCosts.filter((_, i) => i !== index));
  };

  const updateNewAbilityCost = (
    index: number,
    updates: Partial<AbilityCost>,
  ) => {
    const updated = [...newAbilityCosts];
    updated[index] = { ...updated[index], ...updates };
    setNewAbilityCosts(updated);
  };

  const addEditAbilityCost = () => {
    setEditAbilityCosts([
      ...editAbilityCosts,
      { type: "resource", name: "", amount: 1 },
    ]);
  };

  const removeEditAbilityCost = (index: number) => {
    setEditAbilityCosts(editAbilityCosts.filter((_, i) => i !== index));
  };

  const updateEditAbilityCost = (
    index: number,
    updates: Partial<AbilityCost>,
  ) => {
    const updated = [...editAbilityCosts];
    updated[index] = { ...updated[index], ...updates };
    setEditAbilityCosts(updated);
  };

  // Lore drag-and-drop functions (edit already exists)
  const handleLoreDragStart = (index: number) => {
    setDraggedLoreIndex(index);
  };

  const handleLoreDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedLoreIndex === null || draggedLoreIndex === index) return;

    const newLore = [...lore];
    const draggedItem = newLore[draggedLoreIndex];
    newLore.splice(draggedLoreIndex, 1);
    newLore.splice(index, 0, draggedItem);

    setLore(newLore);
    setDraggedLoreIndex(index);
  };

  const handleLoreDragEnd = () => {
    setDraggedLoreIndex(null);
  };

  const moveLoreUp = (index: number) => {
    if (index === 0) return;
    const newLore = [...lore];
    [newLore[index - 1], newLore[index]] = [newLore[index], newLore[index - 1]];
    setLore(newLore);
  };

  const moveLoreDown = (index: number) => {
    if (index === lore.length - 1) return;
    const newLore = [...lore];
    [newLore[index], newLore[index + 1]] = [newLore[index + 1], newLore[index]];
    setLore(newLore);
  };

  // Achievement drag-and-drop and edit functions
  const handleAchievementDragStart = (index: number) => {
    setDraggedAchievementIndex(index);
  };

  const handleAchievementDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedAchievementIndex === null || draggedAchievementIndex === index)
      return;

    const newAchievements = [...achievements];
    const draggedItem = newAchievements[draggedAchievementIndex];
    newAchievements.splice(draggedAchievementIndex, 1);
    newAchievements.splice(index, 0, draggedItem);

    setAchievements(newAchievements);
    setDraggedAchievementIndex(index);
  };

  const handleAchievementDragEnd = () => {
    setDraggedAchievementIndex(null);
  };

  const moveAchievementUp = (index: number) => {
    if (index === 0) return;
    const newAchievements = [...achievements];
    [newAchievements[index - 1], newAchievements[index]] = [
      newAchievements[index],
      newAchievements[index - 1],
    ];
    setAchievements(newAchievements);
  };

  const moveAchievementDown = (index: number) => {
    if (index === achievements.length - 1) return;
    const newAchievements = [...achievements];
    [newAchievements[index], newAchievements[index + 1]] = [
      newAchievements[index + 1],
      newAchievements[index],
    ];
    setAchievements(newAchievements);
  };

  // Variable drag-and-drop and reorder functions
  const handleVariableDragStart = (index: number) => {
    setDraggedVariableIndex(index);
  };

  const handleVariableDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedVariableIndex === null || draggedVariableIndex === index) return;

    const newVariables = [...variables];
    const draggedItem = newVariables[draggedVariableIndex];
    newVariables.splice(draggedVariableIndex, 1);
    newVariables.splice(index, 0, draggedItem);

    setVariables(newVariables);
    setDraggedVariableIndex(index);
  };

  const handleVariableDragEnd = () => {
    setDraggedVariableIndex(null);
  };

  const moveVariableUp = (index: number) => {
    if (index === 0) return;
    const newVariables = [...variables];
    [newVariables[index - 1], newVariables[index]] = [
      newVariables[index],
      newVariables[index - 1],
    ];
    setVariables(newVariables);
  };

  const moveVariableDown = (index: number) => {
    if (index === variables.length - 1) return;
    const newVariables = [...variables];
    [newVariables[index], newVariables[index + 1]] = [
      newVariables[index + 1],
      newVariables[index],
    ];
    setVariables(newVariables);
  };

  const startEditAchievement = (index: number) => {
    setEditingAchievementIndex(index);
    setEditAchievement({ ...achievements[index] });
  };

  const cancelEditAchievement = () => {
    setEditingAchievementIndex(null);
    setEditAchievement({});
  };

  const saveEditAchievement = () => {
    if (
      editingAchievementIndex !== null &&
      editAchievement.title &&
      editAchievement.description
    ) {
      const updated = [...achievements];
      updated[editingAchievementIndex] = editAchievement as Achievement;
      setAchievements(updated);
      setEditingAchievementIndex(null);
      setEditAchievement({});
    }
  };

  const addLoreOnTrigger = () => {
    if (
      newLoreOnTrigger.trim() &&
      !newLore.on_triggers?.includes(newLoreOnTrigger.trim())
    ) {
      setNewLore({
        ...newLore,
        on_triggers: [...(newLore.on_triggers || []), newLoreOnTrigger.trim()],
      });
      setNewLoreOnTrigger("");
    }
  };

  const addLoreOffTrigger = () => {
    if (
      newLoreOffTrigger.trim() &&
      !newLore.off_triggers?.includes(newLoreOffTrigger.trim())
    ) {
      setNewLore({
        ...newLore,
        off_triggers: [
          ...(newLore.off_triggers || []),
          newLoreOffTrigger.trim(),
        ],
      });
      setNewLoreOffTrigger("");
    }
  };

  const addLoreKey = () => {
    if (newLoreKey.trim() && !newLore.keys?.includes(newLoreKey.trim())) {
      setNewLore({
        ...newLore,
        keys: [...(newLore.keys || []), newLoreKey.trim()],
      });
      setNewLoreKey("");
    }
  };

  const addLore = () => {
    if (newLore.title && newLore.content) {
      setLore([...lore, newLore as StoryLore]);
      setNewLore({
        title: "",
        content: "",
        relatedCharacters: [],
        relatedLocations: [],
        secrtet: false,
        keys: [],
        thumbnailUrl: "",
        on: true,
      });
    }
  };

  const removeLore = (index: number) => {
    setLore(lore.filter((_, i) => i !== index));
  };

  const startEditLore = (index: number) => {
    setEditingLoreIndex(index);
    setEditLore({ ...lore[index] });
    setEditLoreOnTrigger("");
    setEditLoreOffTrigger("");
    setEditLoreKey("");
  };

  const cancelEditLore = () => {
    setEditingLoreIndex(null);
    setEditLore({});
  };

  const saveEditLore = () => {
    if (editingLoreIndex !== null && editLore.title && editLore.content) {
      const updated = [...lore];
      updated[editingLoreIndex] = editLore as StoryLore;
      setLore(updated);
      setEditingLoreIndex(null);
      setEditLore({});
    }
  };

  const addEditLoreOnTrigger = () => {
    if (
      editLoreOnTrigger.trim() &&
      !editLore.on_triggers?.includes(editLoreOnTrigger.trim())
    ) {
      setEditLore({
        ...editLore,
        on_triggers: [
          ...(editLore.on_triggers || []),
          editLoreOnTrigger.trim(),
        ],
      });
      setEditLoreOnTrigger("");
    }
  };

  const addEditLoreOffTrigger = () => {
    if (
      editLoreOffTrigger.trim() &&
      !editLore.off_triggers?.includes(editLoreOffTrigger.trim())
    ) {
      setEditLore({
        ...editLore,
        off_triggers: [
          ...(editLore.off_triggers || []),
          editLoreOffTrigger.trim(),
        ],
      });
      setEditLoreOffTrigger("");
    }
  };

  const addEditLoreKey = () => {
    if (editLoreKey.trim() && !editLore.keys?.includes(editLoreKey.trim())) {
      setEditLore({
        ...editLore,
        keys: [...(editLore.keys || []), editLoreKey.trim()],
      });
      setEditLoreKey("");
    }
  };

  // Helper function to get relationship icon name based on value
  const getRelationshipIcon = (value: number): string => {
    if (value >= 75) return "Heart"; // Strong ally
    if (value >= 50) return "Star"; // Ally
    if (value >= 25) return "Smile"; // Friendly
    if (value >= 0) return "Meh"; // Neutral/Acquaintance
    if (value >= -25) return "Frown"; // Distant
    if (value >= -50) return "Angry"; // Unfriendly
    if (value >= -75) return "Skull"; // Hostile
    return "X"; // Enemy
  };

  // Helper function to clamp numeric values within a valid range
  const clampNumber = (value: number, min: number, max: number): number => {
    if (isNaN(value)) return min;
    return Math.max(min, Math.min(max, value));
  };

  const addRelationship = () => {
    if (newRelationship.name && newRelationship.description) {
      const value = Math.max(-100, Math.min(100, newRelationship.value ?? 0));
      setRelationships([
        ...relationships,
        {
          ...newRelationship,
          value,
          symbol: getRelationshipIcon(value),
        } as Relationship,
      ]);
      setNewRelationship({
        name: "",
        value: 0,
        description: "",
        symbol: "Meh",
      });
    }
  };

  const removeRelationship = (index: number) => {
    setRelationships(relationships.filter((_, i) => i !== index));
  };

  const startEditRelationship = (index: number) => {
    setEditingRelationshipIndex(index);
    setEditRelationship({ ...relationships[index] });
  };

  const cancelEditRelationship = () => {
    setEditingRelationshipIndex(null);
    setEditRelationship({});
  };

  const saveEditRelationship = () => {
    if (
      editingRelationshipIndex !== null &&
      editRelationship.name &&
      editRelationship.description
    ) {
      const value = Math.max(-100, Math.min(100, editRelationship.value ?? 0));
      const updated = [...relationships];
      updated[editingRelationshipIndex] = {
        ...editRelationship,
        value,
        symbol: getRelationshipIcon(value),
      } as Relationship;
      setRelationships(updated);
      setEditingRelationshipIndex(null);
      setEditRelationship({});
    }
  };

  const addAchievement = () => {
    if (newAchievement.title && newAchievement.description) {
      setAchievements([
        ...achievements,
        { ...newAchievement, dateAchieved: null } as Achievement,
      ]);
      setNewAchievement({
        title: "",
        description: "",
        points: 10,
        symbol: "Trophy",
      });
    }
  };

  const removeAchievement = (index: number) => {
    setAchievements(achievements.filter((_, i) => i !== index));
  };

  const handleDiscardChanges = () => {
    if (!editAdventureId) {
      // For new adventures, clear the draft and reset to empty
      if (draftKey && typeof window !== "undefined") {
        window.localStorage.removeItem(draftKey);
      }
      // Reset all fields to defaults
      setTitle("");
      setShortDescription("");
      setDescription("");
      setDifficulty("medium");
      setVisibility("private");
      setNsfw(false);
      setTags([]);
      setThumbnailUrl("");
      setBannerUrl("");
      setCharacterSheet("");
      setCharacterSheetTemplate({ template: "", fields: [] });
      setPremise("");
      setIntro("");
      setMaxChapters(8);
      setAuthorNotes("");
      setStats([]);
      setResources([]);
      setInventory([]);
      setLore([]);
      setRelationships([]);
      setAchievements([]);
      setQuests([]);
      setNPCs([]);
      setCustomTables([]);
      setSelectedPreset("custom");
      setPresets([DEFAULT_PRESET]);
      setUpgradeSettings(DEFAULT_UPGRADE_SETTINGS);
      setAGMTEnabled(false);
      setAGMTState({
        chaosFactor: 5,
        threads: [],
        sceneCount: 0,
        skillCheckHistory: [],
        currentStreak: 0,
        lastChaosAdjustment: -999,
      });
      setCurrentStep("basic");
      addNotification("Draft cleared", "success");
    } else {
      // For editing, clear the draft and reload from server/IndexedDB
      if (draftKey && typeof window !== "undefined") {
        window.localStorage.removeItem(draftKey);
      }
      addNotification("Discarding changes and reloading...", "success");
      // Force a hard reload to fetch fresh data
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    }
  };

  const handleSave = async () => {
    // Validation
    if (!title.trim()) {
      addNotification("Please enter a title", "warning");
      setCurrentStep("basic");
      return;
    }
    if (!premise.trim() || !intro.trim()) {
      addNotification("Please fill in the story setup", "warning");
      setCurrentStep("premise");
      return;
    }

    setSaving(true);

    // Build the story data
    const storyData: Partial<StoryData> = {
      story_name: title,
      premise,
      intro: intro,
      memory: [],
      max_chapters: maxChapters,
      currentChapter: 0,
      chapters: [],
      scene: { parts: [] },
      stats,
      resources,
      inventory,
      abilities,
      achievements,
      lore,
      relationships,
      conditions: conditions.length > 0 ? conditions : undefined,
      quests,
      npcs: npcs.length > 0 ? npcs : undefined,
      customTables,
      variables,
      earnedPointsFromQuests: [],
      earnedPointsFromChapters: [],
      author_notes: authorNotes,
      selected_preset: selectedPreset,
      presets: presets,
      upgradeSettings: upgradeSettings,
      levelingSettings,
      agmtState: agmtEnabled ? agmtState : undefined,
      skillTrees: skillTrees.length > 0 ? skillTrees : undefined,
      nodeEffects:
        passives.length > 0
          ? {
              statBonuses: [],
              resourceBonuses: [],
              passives: passives,
            }
          : undefined,
    };

    // Save to IndexedDB (local-only storage)
    try {
      const adventureData: Partial<Adventure> = {
        title,
        shortDescription,
        description,
        thumbnailUrl: thumbnailUrl || undefined,
        bannerUrl: bannerUrl || undefined,
        tags,
        difficulty: difficulty.toLowerCase() as any,
        visibility: visibility.toLowerCase() as any,
        nsfw,
        estimatedDuration: "1-2 hours",
        isPublished: false,
        isFeatured: false,
        storyTemplate: storyData,
        selectedPreset: selectedPreset,
        presets: presets,
        characterSheetTemplate:
          characterSheetTemplate.template.trim() ||
          characterSheetTemplate.fields.length > 0
            ? characterSheetTemplate
            : undefined,
        startingChoices:
          startingChoices.length > 0 ? startingChoices : undefined,
      };

      const localId =
        editAdventureId ||
        `local:${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      await saveLocalAdventure(localId, adventureData);

      // Clear draft from localStorage since we just saved
      if (draftKey && typeof window !== "undefined") {
        window.localStorage.removeItem(draftKey);
      }

      addNotification("Adventure saved locally", "success");

      if (!editAdventureId) {
        window.history.replaceState(
          null,
          "",
          `/creator/manual?edit=${localId}`,
        );
      }

      setSaving(false);
    } catch (error) {
      console.error("Error saving locally:", error);
      addNotification(
        error instanceof Error ? error.message : "Failed to save locally",
        "failure",
      );
      setSaving(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case "basic":
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-blue-200 mb-2">
                Adventure Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., The Dragon's Quest"
                className="w-full px-4 py-3 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
                maxLength={100}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-blue-200 mb-2">
                Short Description *
              </label>
              <input
                type="text"
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
                placeholder="A brief one-line summary"
                className="w-full px-4 py-3 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
                maxLength={300}
              />
              <p className="text-xs text-blue-300/60 mt-1">
                {shortDescription.length}/300 characters
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-blue-200 mb-2">
                Full Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Write a compelling description of your adventure..."
                rows={5}
                className="w-full px-4 py-3 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors resize-none"
                maxLength={5000}
              />
              <p className="text-xs text-blue-300/60 mt-1">
                {description.length}/5000 characters
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-blue-200 mb-2">
                Difficulty
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(["easy", "medium", "hard", "expert"] as const).map((diff) => (
                  <button
                    key={diff}
                    onClick={() => setDifficulty(diff)}
                    className={`px-4 py-3 rounded-lg font-semibold border-2 transition-all capitalize ${
                      difficulty === diff
                        ? "bg-purple-600 text-white border-purple-600 ring-2 ring-purple-400"
                        : "bg-blue-900/30 text-blue-200 border-blue-700/40 hover:bg-blue-800/40"
                    }`}
                  >
                    {diff}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-blue-200 mb-2">
                Visibility
              </label>
              <p className="text-xs text-blue-300/60 mb-3">
                <strong>Public:</strong> Everyone can see and play.{" "}
                <strong>Hidden:</strong> Only accessible via direct link.{" "}
                <strong>Private:</strong> Only you can see.
              </p>
              <div className="grid grid-cols-3 gap-3">
                {(["public", "hidden", "private"] as const).map((vis) => (
                  <button
                    key={vis}
                    onClick={() => setVisibility(vis)}
                    className={`px-4 py-3 rounded-lg font-semibold border-2 transition-all capitalize ${
                      visibility === vis
                        ? "bg-purple-600 text-white border-purple-600 ring-2 ring-purple-400"
                        : "bg-blue-900/30 text-blue-200 border-blue-700/40 hover:bg-blue-800/40"
                    }`}
                  >
                    {vis === "public" ? (
                      <>
                        <DynamicIcon
                          name="Globe"
                          className="w-4 h-4 inline mr-2"
                        />
                        Public
                      </>
                    ) : vis === "hidden" ? (
                      <>
                        <DynamicIcon
                          name="Link"
                          className="w-4 h-4 inline mr-2"
                        />
                        Hidden
                      </>
                    ) : (
                      <>
                        <DynamicIcon
                          name="Lock"
                          className="w-4 h-4 inline mr-2"
                        />
                        Private
                      </>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Advanced Options Toggle */}
            <button
              onClick={() => setShowAdvancedBasic(!showAdvancedBasic)}
              className="w-full py-3 text-sm text-blue-300 hover:text-purple-300 border border-blue-700/40 rounded-lg hover:border-purple-500/50 transition-all flex items-center justify-center gap-2"
            >
              <DynamicIcon
                name={showAdvancedBasic ? "ChevronUp" : "Settings"}
                className="w-4 h-4"
              />
              {showAdvancedBasic
                ? "Hide advanced options"
                : "Advanced options (NSFW, tags, images)"}
              {(nsfw || tags.length > 0 || thumbnailUrl || bannerUrl) && (
                <span className="ml-2 px-2 py-0.5 bg-purple-600 text-white text-xs rounded-full">
                  {[
                    nsfw && "18+",
                    tags.length > 0 && `${tags.length} tags`,
                    (thumbnailUrl || bannerUrl) && "images",
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              )}
            </button>

            {/* Advanced Options (Collapsible) */}
            {showAdvancedBasic && (
              <div className="space-y-6 animate-in slide-in-from-top-2 duration-200 border-t border-blue-700/40 pt-6">
                <div>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={nsfw}
                        onChange={(e) => setNsfw(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-blue-900/40 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-blue-700/40 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                    </div>
                    <div>
                      <span className="block text-sm font-semibold text-blue-200">
                        NSFW Content
                      </span>
                      <span className="block text-xs text-blue-300/60">
                        Mark this adventure as containing Not Safe For Work
                        content (18+)
                      </span>
                    </div>
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-2">
                    Tags
                  </label>
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && (e.preventDefault(), addTag())
                      }
                      placeholder="Add a tag..."
                      className="flex-1 px-4 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white focus:border-purple-500 transition-colors"
                    />
                    <button
                      onClick={addTag}
                      className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
                    >
                      Add
                    </button>
                  </div>

                  <div className="mb-3">
                    <p className="text-xs text-blue-300/60 mb-2">Quick add:</p>
                    <div className="flex flex-wrap gap-2">
                      {commonTags
                        .filter((t) => !tags.includes(t))
                        .slice(0, 10)
                        .map((tag) => (
                          <button
                            key={tag}
                            onClick={() => setTags([...tags, tag])}
                            className="px-3 py-1 bg-blue-900/30 text-blue-200 rounded-full text-sm hover:bg-purple-900/30 transition-colors"
                          >
                            + {tag}
                          </button>
                        ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1 bg-purple-900/30 text-purple-300 rounded-full text-sm font-semibold flex items-center gap-2"
                      >
                        {tag}
                        <button
                          onClick={() => removeTag(tag)}
                          className="hover:text-purple-100"
                        >
                          <DynamicIcon name="X" className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Thumbnail Upload */}
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-2">
                    Thumbnail Image
                  </label>
                  <p className="text-xs text-blue-300/60 mb-3">
                    Recommended: 400×300px (or 320×180px), max 5MB
                  </p>
                  <div className="flex items-start gap-4">
                    {thumbnailUrl && (
                      <div className="relative">
                        <img
                          src={thumbnailUrl}
                          alt="Thumbnail preview"
                          className="w-32 h-24 object-cover rounded-lg border border-blue-700/40"
                        />
                        <button
                          onClick={() => setThumbnailUrl("")}
                          className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center text-xs font-bold"
                        >
                          <DynamicIcon name="X" className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <div className="flex-1 space-y-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleThumbnailUpload}
                        disabled={uploadingThumbnail || generatingThumbnail}
                        className="hidden"
                        id="thumbnail-upload"
                      />
                      <label
                        htmlFor="thumbnail-upload"
                        className={`block px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors text-center cursor-pointer ${
                          uploadingThumbnail || generatingThumbnail
                            ? "opacity-50 cursor-not-allowed"
                            : ""
                        }`}
                      >
                        {uploadingThumbnail ? (
                          "Uploading..."
                        ) : thumbnailUrl ? (
                          "Change Thumbnail"
                        ) : (
                          <>
                            <DynamicIcon
                              name="Camera"
                              className="w-4 h-4 inline mr-2"
                            />
                            Upload Thumbnail
                          </>
                        )}
                      </label>
                      <button
                        onClick={() => {
                          if (!thumbnailPrompt) {
                            setThumbnailPrompt(
                              getDefaultImagePrompt("thumbnail"),
                            );
                          }
                          setShowAIImageModal("thumbnail");
                        }}
                        disabled={generatingThumbnail || uploadingThumbnail}
                        className={`w-full px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors text-center flex items-center justify-center gap-2 ${
                          generatingThumbnail || uploadingThumbnail
                            ? "opacity-50 cursor-not-allowed"
                            : ""
                        }`}
                      >
                        {generatingThumbnail ? (
                          <>
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>🎨 AI Generate</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Banner Upload */}
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-2">
                    Banner Image
                  </label>
                  <p className="text-xs text-blue-300/60 mb-3">
                    Recommended: 1200×400px, max 5MB
                  </p>
                  <div className="flex items-start gap-4">
                    {bannerUrl && (
                      <div className="relative">
                        <img
                          src={bannerUrl}
                          alt="Banner preview"
                          className="w-48 h-16 object-cover rounded-lg border border-blue-700/40"
                        />
                        <button
                          onClick={() => setBannerUrl("")}
                          className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center text-xs font-bold"
                        >
                          <DynamicIcon name="X" className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <div className="flex-1 space-y-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleBannerUpload}
                        disabled={uploadingBanner || generatingBanner}
                        className="hidden"
                        id="banner-upload"
                      />
                      <label
                        htmlFor="banner-upload"
                        className={`block px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors text-center cursor-pointer ${
                          uploadingBanner || generatingBanner
                            ? "opacity-50 cursor-not-allowed"
                            : ""
                        }`}
                      >
                        {uploadingBanner ? (
                          "Uploading..."
                        ) : bannerUrl ? (
                          "Change Banner"
                        ) : (
                          <>
                            <DynamicIcon
                              name="Image"
                              className="w-4 h-4 inline mr-2"
                            />
                            Upload Banner
                          </>
                        )}
                      </label>
                      <button
                        onClick={() => {
                          if (!bannerPrompt) {
                            setBannerPrompt(getDefaultImagePrompt("banner"));
                          }
                          setShowAIImageModal("banner");
                        }}
                        disabled={generatingBanner || uploadingBanner}
                        className={`w-full px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors text-center flex items-center justify-center gap-2 ${
                          generatingBanner || uploadingBanner
                            ? "opacity-50 cursor-not-allowed"
                            : ""
                        }`}
                      >
                        {generatingBanner ? (
                          <>
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>🎨 AI Generate</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case "character-sheet":
        return (
          <div className="space-y-6">
            <div className="bg-blue-900/20 border border-blue-700/40 rounded-lg p-4 mb-6">
              <h3 className="text-lg font-bold text-blue-200 mb-2 flex items-center gap-2">
                <DynamicIcon name="FileText" className="w-5 h-5" />
                Character Sheet Template
              </h3>
              <p className="text-sm text-blue-300">
                Create a template for custom characters. Use the{" "}
                <code className="bg-blue-800/50 px-1 rounded">
                  {"{{FieldName | Description | Default}}"}
                </code>{" "}
                syntax to create fillable fields. When players pick
                &quot;Custom&quot; preset, they&apos;ll fill out this template
                to create their character sheet.
              </p>
            </div>

            <CharacterSheetTemplateEditor
              template={characterSheetTemplate}
              onChange={setCharacterSheetTemplate}
            />

            <div className="bg-purple-900/20 border border-purple-800/50 rounded-lg p-4">
              <p className="text-sm text-purple-300 flex items-start gap-2">
                <DynamicIcon
                  name="Lightbulb"
                  className="w-4 h-4 mt-0.5 shrink-0 text-purple-400"
                />
                <span>
                  <strong>Tip:</strong> For preset characters, you&apos;ll write
                  the completed character sheet directly in each preset. This
                  template is only used when players choose to create a custom
                  character.
                </span>
              </p>
            </div>
          </div>
        );

      case "preset":
        return (
          <div className="space-y-6">
            <div className="bg-blue-900/20 border border-blue-700/40 rounded-lg p-4 mb-6">
              <h3 className="text-lg font-bold text-blue-200 mb-2 flex items-center gap-2">
                <DynamicIcon name="Users" className="w-5 h-5" />
                Character Presets
              </h3>
              <p className="text-sm text-blue-300">
                Create custom character presets for your adventure. Players can
                choose these when starting your adventure to customize their
                character&apos;s stats, items, and resources.
              </p>
            </div>

            {/* Create New Preset Button */}
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-lg font-bold text-white">Your Presets</h4>
              <button
                onClick={() => {
                  const isOpening = !showPresetForm;
                  setShowPresetForm(isOpening);
                  setEditingPresetId(null);
                  setNewPresetName("");
                  setNewPresetDescription("");
                  setNewPresetIcon("Star");
                  // When opening form for new preset, load the template
                  if (isOpening) {
                    setCharacterSheet(characterSheetTemplate.template);
                  }
                }}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
              >
                {showPresetForm ? "Cancel" : "+ Create Preset"}
              </button>
            </div>

            {/* Preset Form */}
            {showPresetForm && (
              <div className="bg-blue-900/20 border border-blue-700/40 rounded-lg p-6 mb-6">
                <h5 className="text-lg font-bold text-white mb-4">
                  {editingPresetId ? "Edit Preset" : "Create New Preset"}
                </h5>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-blue-200 mb-2">
                      Preset Name *
                    </label>
                    <input
                      type="text"
                      value={newPresetName}
                      onChange={(e) => setNewPresetName(e.target.value)}
                      placeholder="e.g., Battle Mage"
                      className="w-full px-4 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white focus:border-purple-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-blue-200 mb-2">
                      Description *
                    </label>
                    <textarea
                      value={newPresetDescription}
                      onChange={(e) => setNewPresetDescription(e.target.value)}
                      placeholder="Describe this character archetype..."
                      rows={2}
                      className="w-full px-4 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white focus:border-purple-500 transition-colors resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-blue-200 mb-2">
                      Icon *
                    </label>
                    <IconPicker
                      value={newPresetIcon}
                      onChange={setNewPresetIcon}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-semibold text-blue-200">
                        Character Sheet
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setCharacterSheet(characterSheetTemplate.template)
                        }
                        className="text-xs px-2 py-1 bg-blue-700/40 hover:bg-blue-700/60 text-blue-200 rounded transition-colors"
                      >
                        Load Template
                      </button>
                    </div>
                    <p className="text-xs text-blue-300/60 mb-2">
                      Fill out the template fields to create a complete
                      character sheet for this preset. This will be added to the
                      player&apos;s Notes when they pick this preset.
                    </p>
                    <textarea
                      value={characterSheet}
                      onChange={(e) => setCharacterSheet(e.target.value)}
                      placeholder={`**Name:** Sir Aldric the Bold
**Class:** Knight
**Background:** A noble warrior sworn to protect the realm

**Appearance:** Tall and muscular with silver-streaked hair...

**Personality:** Honorable, protective, sometimes overly proud...`}
                      rows={12}
                      className="w-full px-4 py-3 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white focus:border-purple-500 transition-colors resize-y font-mono text-sm"
                    />
                  </div>

                  <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-lg p-3">
                    <p className="text-xs text-yellow-300">
                      <DynamicIcon
                        name="Lightbulb"
                        className="w-4 h-4 inline mr-2 text-yellow-400"
                      />{" "}
                      <strong>Tip:</strong> The preset will copy your current
                      Character Sheet, Intro, Stats, Resources, Inventory, and
                      Author Notes. Make sure they&apos;re configured as you
                      want before saving!
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        if (
                          !newPresetName.trim() ||
                          !newPresetDescription.trim()
                        ) {
                          addNotification(
                            "Please fill in all fields",
                            "warning",
                          );
                          return;
                        }

                        if (editingPresetId) {
                          // Update existing preset
                          setPresets(
                            presets.map((p) =>
                              p.id === editingPresetId
                                ? {
                                    ...p,
                                    name: newPresetName,
                                    description: newPresetDescription,
                                    icon: newPresetIcon,
                                    characterSheet,
                                    intro,
                                    stats: JSON.parse(JSON.stringify(stats)),
                                    resources: JSON.parse(
                                      JSON.stringify(resources),
                                    ),
                                    inventory: JSON.parse(
                                      JSON.stringify(inventory),
                                    ),
                                    relationships: JSON.parse(
                                      JSON.stringify(relationships),
                                    ),
                                    conditions: JSON.parse(
                                      JSON.stringify(conditions),
                                    ),
                                    authorNotes,
                                  }
                                : p,
                            ),
                          );
                          addNotification("Preset updated!", "success");
                        } else {
                          // Create new preset
                          const newPreset = createPresetFromCurrentSettings(
                            newPresetName,
                            newPresetDescription,
                            newPresetIcon,
                            characterSheet,
                            intro,
                            stats,
                            resources,
                            inventory,
                            relationships,
                            conditions,
                            authorNotes,
                          );
                          setPresets([...presets, newPreset]);
                          addNotification("Preset created!", "success");
                        }

                        setShowPresetForm(false);
                        setEditingPresetId(null);
                        setNewPresetName("");
                        setNewPresetDescription("");
                        setNewPresetIcon("Star");
                      }}
                      className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors"
                    >
                      {editingPresetId ? "Update Preset" : "Save Preset"}
                    </button>
                    <button
                      onClick={() => {
                        setShowPresetForm(false);
                        setEditingPresetId(null);
                        setNewPresetName("");
                        setNewPresetDescription("");
                        setNewPresetIcon("Star");
                      }}
                      className="px-4 py-2 bg-gray-400 hover:bg-gray-500 text-white font-semibold rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Preset Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {presets.map((preset) => {
                const isSelected = selectedPreset === preset.id;
                return (
                  <div
                    key={preset.id}
                    className={`relative p-5 rounded-xl border-2 transition-all ${
                      isSelected
                        ? "bg-purple-900/30 border-purple-500 ring-2 ring-purple-500/50"
                        : "bg-blue-900/20 border-blue-700/40"
                    }`}
                  >
                    <button
                      onClick={() => {
                        // Skip if already selected - don't re-apply preset
                        if (isSelected) return;

                        // Save current custom values before switching to a preset
                        if (
                          selectedPreset === "custom" &&
                          preset.id !== "custom"
                        ) {
                          setSavedCustomValues({
                            characterSheet,
                            intro,
                            stats: [...stats],
                            resources: [...resources],
                            inventory: [...inventory],
                            relationships: [...relationships],
                            conditions: [...conditions],
                            authorNotes,
                          });
                        }

                        setSelectedPreset(preset.id);

                        // Apply preset immediately (only when switching to a new preset)
                        if (preset.id !== "custom") {
                          applyPreset(
                            preset,
                            setCharacterSheet,
                            setIntro,
                            setStats,
                            setResources,
                            setInventory,
                            setRelationships,
                            setConditions,
                            setAuthorNotes,
                          );
                          addNotification(
                            `${preset.name} preset applied!`,
                            "success",
                          );
                        } else {
                          // Restore saved custom values when switching back to custom
                          if (savedCustomValues) {
                            setCharacterSheet(savedCustomValues.characterSheet);
                            setIntro(savedCustomValues.intro);
                            setStats(savedCustomValues.stats);
                            setResources(savedCustomValues.resources);
                            setInventory(savedCustomValues.inventory);
                            setRelationships(savedCustomValues.relationships);
                            setConditions(savedCustomValues.conditions);
                            setAuthorNotes(savedCustomValues.authorNotes);
                            addNotification(
                              "Custom settings restored!",
                              "success",
                            );
                          } else {
                            addNotification(
                              "Custom preset selected - build from scratch!",
                              "success",
                            );
                          }
                        }
                      }}
                      className="text-left w-full"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="text-4xl">
                          <DynamicIcon
                            name={preset.icon}
                            className="w-10 h-10"
                          />
                        </div>
                        {isSelected && (
                          <div className="text-purple-400 text-xl">
                            <DynamicIcon name="Check" className="w-6 h-6" />
                          </div>
                        )}
                      </div>

                      <h4 className="text-lg font-bold text-white mb-2">
                        {preset.name}
                      </h4>

                      <p className="text-sm text-blue-300 mb-3">
                        {preset.description}
                      </p>

                      {preset.id !== "custom" && (
                        <div className="text-xs text-blue-300/60 space-y-1">
                          <div className="flex items-center gap-1">
                            <DynamicIcon name="BarChart2" className="w-3 h-3" />{" "}
                            {preset.stats?.length || 0} stats
                          </div>
                          <div className="flex items-center gap-1">
                            <DynamicIcon name="Gem" className="w-3 h-3" />{" "}
                            {preset.resources?.length || 0} resources
                          </div>
                          <div className="flex items-center gap-1">
                            <DynamicIcon name="Package" className="w-3 h-3" />{" "}
                            {preset.inventory?.length || 0} starting items
                          </div>
                          {preset.characterSheet && (
                            <div className="flex items-center gap-1 text-green-300/60">
                              <DynamicIcon
                                name="FileText"
                                className="w-3 h-3"
                              />{" "}
                              Has character sheet
                            </div>
                          )}
                          {(preset.conditions?.length || 0) > 0 && (
                            <div className="flex items-center gap-1 text-rose-300/60">
                              <DynamicIcon
                                name="HeartPulse"
                                className="w-3 h-3"
                              />{" "}
                              {preset.conditions?.length} conditions
                            </div>
                          )}
                        </div>
                      )}
                    </button>

                    {/* Edit/Delete buttons for custom presets */}
                    {preset.id !== "custom" && (
                      <div className="flex gap-2 mt-3 pt-3 border-t border-blue-700/40">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingPresetId(preset.id);
                            setNewPresetName(preset.name);
                            setNewPresetDescription(preset.description);
                            setNewPresetIcon(preset.icon);
                            setShowPresetForm(true);
                          }}
                          className="flex-1 px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded transition-colors flex items-center justify-center gap-1"
                        >
                          <DynamicIcon name="Edit2" className="w-3 h-3" /> Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDialog({
                              isOpen: true,
                              title: "Delete Preset?",
                              message: `Delete "${preset.name}" preset? This cannot be undone.`,
                              icon: "Trash2",
                              confirmText: "Delete",
                              confirmButtonClass: "bg-red-600 hover:bg-red-700",
                              onConfirm: () => {
                                setConfirmDialog({
                                  ...confirmDialog,
                                  isOpen: false,
                                });
                                setPresets(
                                  presets.filter((p) => p.id !== preset.id),
                                );
                                if (selectedPreset === preset.id) {
                                  setSelectedPreset("custom");
                                }
                                addNotification("Preset deleted", "success");
                              },
                            });
                          }}
                          className="flex-1 px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white font-semibold rounded transition-colors flex items-center justify-center gap-1"
                        >
                          <DynamicIcon name="Trash2" className="w-3 h-3" />{" "}
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {selectedPreset && selectedPreset !== "custom" && (
              <div className="bg-green-900/20 border border-green-800/50 rounded-lg p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-bold text-green-300 mb-2 flex items-center gap-2">
                      <DynamicIcon
                        name="Sparkles"
                        className="w-4 h-4 text-green-400"
                      />{" "}
                      Preset Selected:{" "}
                      {presets.find((p) => p.id === selectedPreset)?.name}
                    </h4>
                    <p className="text-xs text-green-400/80">
                      You can customize stats, items, and resources in the
                      following steps. Click &quot;Reset to Preset&quot; to
                      restore original values.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      const preset = presets.find(
                        (p) => p.id === selectedPreset,
                      );
                      if (preset) {
                        setConfirmDialog({
                          isOpen: true,
                          title: "Reset to Preset?",
                          message: `This will overwrite your current stats, resources, inventory, and other character data with the original "${preset.name}" preset values.`,
                          icon: "RefreshCw",
                          confirmText: "Reset",
                          confirmButtonClass:
                            "bg-orange-600 hover:bg-orange-700",
                          onConfirm: () => {
                            setConfirmDialog({
                              ...confirmDialog,
                              isOpen: false,
                            });
                            applyPreset(
                              preset,
                              setCharacterSheet,
                              setIntro,
                              setStats,
                              setResources,
                              setInventory,
                              setRelationships,
                              setConditions,
                              setAuthorNotes,
                            );
                            addNotification(
                              `Reset to ${preset.name} preset!`,
                              "success",
                            );
                          },
                        });
                      }
                    }}
                    className="px-3 py-1.5 text-xs bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded transition-colors flex items-center gap-1 shrink-0"
                  >
                    <DynamicIcon name="RefreshCw" className="w-3 h-3" /> Reset
                    to Preset
                  </button>
                </div>
              </div>
            )}
          </div>
        );

      case "premise":
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-blue-200 mb-2">
                Story Premise *
              </label>
              <textarea
                value={premise}
                onChange={(e) => setPremise(e.target.value)}
                placeholder="A one-paragraph summary of the story's main conflict or goal..."
                rows={4}
                className="w-full px-4 py-3 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-blue-200 mb-2">
                Intro *
              </label>
              <textarea
                value={intro}
                onChange={(e) => setIntro(e.target.value)}
                placeholder="The opening text that players will see when they start the adventure..."
                rows={6}
                className="w-full px-4 py-3 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-blue-200 mb-2">
                Author Notes (Optional)
              </label>
              <textarea
                value={authorNotes}
                onChange={(e) => setAuthorNotes(e.target.value)}
                placeholder="Notes for yourself about the story direction, themes, etc..."
                rows={4}
                className="w-full px-4 py-3 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors resize-none"
              />
            </div>

            {/* Point Allocation Settings */}
            <div className="bg-purple-900/20 border border-purple-800/50 rounded-lg p-4 mt-6">
              <h3 className="text-lg font-bold mb-4 text-white flex items-center gap-2">
                <DynamicIcon name="Zap" className="w-5 h-5 text-purple-400" />
                Point Allocation Settings
              </h3>
              <p className="text-sm text-blue-300/60 mb-4">
                Configure how players spend starting points during character
                creation. These settings control the conversion rate between
                points and stat/resource increases.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-2">
                    Points per Stat Increase
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={upgradeSettings.statUpgradeCost}
                    onChange={(e) =>
                      setUpgradeSettings((prev) => ({
                        ...prev,
                        statUpgradeCost: Math.max(
                          1,
                          parseInt(e.target.value) || 1,
                        ),
                      }))
                    }
                    className="w-full px-4 py-3 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
                  />
                  <p className="text-xs text-blue-300/60 mt-1">
                    Cost to increase a stat (default: 1)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-2">
                    Stat Increase Amount
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={upgradeSettings.statUpgradeAmount}
                    onChange={(e) =>
                      setUpgradeSettings((prev) => ({
                        ...prev,
                        statUpgradeAmount: Math.max(
                          1,
                          parseInt(e.target.value) || 1,
                        ),
                      }))
                    }
                    className="w-full px-4 py-3 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
                  />
                  <p className="text-xs text-blue-300/60 mt-1">
                    How much a stat increases per purchase (default: 1)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-2">
                    Points per Resource Increase
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={upgradeSettings.resourceUpgradeCost}
                    onChange={(e) =>
                      setUpgradeSettings((prev) => ({
                        ...prev,
                        resourceUpgradeCost: Math.max(
                          1,
                          parseInt(e.target.value) || 1,
                        ),
                      }))
                    }
                    className="w-full px-4 py-3 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
                  />
                  <p className="text-xs text-blue-300/60 mt-1">
                    Cost to increase a resource (default: 5)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-2">
                    Resource Increase Amount
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={upgradeSettings.resourceUpgradeAmount}
                    onChange={(e) =>
                      setUpgradeSettings((prev) => ({
                        ...prev,
                        resourceUpgradeAmount: Math.max(
                          1,
                          parseInt(e.target.value) || 1,
                        ),
                      }))
                    }
                    className="w-full px-4 py-3 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
                  />
                  <p className="text-xs text-blue-300/60 mt-1">
                    How much a resource increases per purchase (default: 10)
                  </p>
                </div>
              </div>

              <div className="mt-4 p-3 bg-blue-900/30 rounded-lg border border-blue-700/30">
                <p className="text-xs text-blue-300 flex items-center gap-2">
                  <DynamicIcon name="Info" className="w-4 h-4 shrink-0" />
                  <span>
                    <strong>Preview:</strong> {upgradeSettings.statUpgradeCost}{" "}
                    point{upgradeSettings.statUpgradeCost !== 1 ? "s" : ""} → +
                    {upgradeSettings.statUpgradeAmount} stat |{" "}
                    {upgradeSettings.resourceUpgradeCost} point
                    {upgradeSettings.resourceUpgradeCost !== 1 ? "s" : ""} → +
                    {upgradeSettings.resourceUpgradeAmount} resource
                  </span>
                </p>
              </div>
            </div>
          </div>
        );

      case "starting-choices":
        return (
          <div className="space-y-6">
            <div className="bg-green-900/20 border border-green-800/50 rounded-lg p-4">
              <p className="text-sm text-blue-300 flex items-start gap-2">
                <DynamicIcon
                  name="Lightbulb"
                  className="w-5 h-5 text-green-600 shrink-0 mt-0.5"
                />
                <span>
                  <strong>Tip:</strong> Starting choices let players choose how
                  their adventure begins. Leave empty for the default
                  &quot;Start Story&quot; button. Each choice can have skill
                  checks, item requirements, or alternate intro text.
                </span>
              </p>
            </div>

            {/* Add New Starting Choice */}
            <div className="bg-blue-900/20 rounded-lg border border-blue-700/40 p-6">
              <h3 className="text-lg font-bold mb-4 text-white">
                Add Starting Choice
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Choice Text *
                  </label>
                  <input
                    type="text"
                    value={newStartingChoice.text || ""}
                    onChange={(e) =>
                      setNewStartingChoice({
                        ...newStartingChoice,
                        text: e.target.value,
                      })
                    }
                    placeholder="e.g., Sneak in through the back"
                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Intro Override (optional)
                  </label>
                  <textarea
                    value={newStartingChoice.intro_override || ""}
                    onChange={(e) =>
                      setNewStartingChoice({
                        ...newStartingChoice,
                        intro_override: e.target.value,
                      })
                    }
                    placeholder="Different intro text for this path (leave empty to use default intro)"
                    rows={3}
                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white resize-none"
                  />
                  <p className="text-xs text-blue-300/50 mt-1">
                    If set, this intro will be shown instead of the main intro
                    when this choice is selected.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-blue-200 mb-1">
                      Skill Check (optional)
                    </label>
                    <select
                      value={newStartingChoice.skill_used || ""}
                      onChange={(e) =>
                        setNewStartingChoice({
                          ...newStartingChoice,
                          skill_used: e.target.value || undefined,
                          skill_dc: e.target.value
                            ? newStartingChoice.skill_dc || "average"
                            : undefined,
                        })
                      }
                      className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                    >
                      <option value="">No skill check</option>
                      {stats.map((stat) => (
                        <option key={stat.name} value={stat.name}>
                          {stat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {newStartingChoice.skill_used && (
                    <div>
                      <label className="block text-sm font-semibold text-blue-200 mb-1">
                        Difficulty Tier
                      </label>
                      <select
                        value={
                          (newStartingChoice.skill_dc as string) || "average"
                        }
                        onChange={(e) =>
                          setNewStartingChoice({
                            ...newStartingChoice,
                            skill_dc: e.target.value as DCTier,
                          })
                        }
                        className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                      >
                        <option value="trivial">
                          Trivial - Almost automatic
                        </option>
                        <option value="easy">Easy - Most succeed</option>
                        <option value="average">Average - 50/50 chance</option>
                        <option value="hard">Hard - Skill required</option>
                        <option value="very_hard">
                          Very Hard - Only experts succeed
                        </option>
                        <option value="impossible">
                          Impossible - Legendary difficulty
                        </option>
                      </select>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-blue-200 mb-1">
                      Requires Item (optional)
                    </label>
                    <select
                      value={newStartingChoice.item_used || ""}
                      onChange={(e) =>
                        setNewStartingChoice({
                          ...newStartingChoice,
                          item_used: e.target.value || undefined,
                        })
                      }
                      className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                    >
                      <option value="">No item required</option>
                      {inventory.map((item) => (
                        <option key={item.name} value={item.name}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    {newStartingChoice.item_used && (
                      <label className="flex items-center gap-2 mt-2 text-sm text-blue-300">
                        <input
                          type="checkbox"
                          checked={newStartingChoice.item_loss || false}
                          onChange={(e) =>
                            setNewStartingChoice({
                              ...newStartingChoice,
                              item_loss: e.target.checked,
                            })
                          }
                          className="w-4 h-4 rounded"
                        />
                        Consume item on use
                      </label>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-blue-200 mb-1">
                      Resource Cost (optional)
                    </label>
                    <select
                      value={newStartingChoice.resource_used || ""}
                      onChange={(e) =>
                        setNewStartingChoice({
                          ...newStartingChoice,
                          resource_used: e.target.value || undefined,
                        })
                      }
                      className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                    >
                      <option value="">No resource cost</option>
                      {resources.map((res) => (
                        <option key={res.name} value={res.name}>
                          {res.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {/* Advanced RPG Tools Section */}
                {agmtEnabled && (
                  <div className="border-t border-blue-800/30 pt-4 mt-4">
                    <h4 className="text-sm font-bold text-purple-400 mb-3 flex items-center gap-2">
                      <DynamicIcon name="Sparkles" className="w-4 h-4" />
                      Advanced RPG Tools Options
                    </h4>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-blue-200 mb-1">
                          Fate Check Question (optional)
                        </label>
                        <input
                          type="text"
                          value={newStartingChoice.agmt_check || ""}
                          onChange={(e) =>
                            setNewStartingChoice({
                              ...newStartingChoice,
                              agmt_check: e.target.value || undefined,
                            })
                          }
                          placeholder="e.g., Is the door locked? (Likely)"
                          className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                        />
                        <p className="text-xs text-blue-300/50 mt-1">
                          Format: &quot;Question (Likelihood)&quot; -
                          Likelihoods: Certain, Nearly Certain, Very Likely,
                          Likely, 50/50, Unlikely, Very Unlikely, Nearly
                          Impossible, Impossible
                        </p>
                      </div>
                      {newStartingChoice.agmt_check &&
                        newStartingChoice.skill_used && (
                          <label className="flex items-center gap-2 text-sm text-blue-300">
                            <input
                              type="checkbox"
                              checked={
                                newStartingChoice.agmt_context_only || false
                              }
                              onChange={(e) =>
                                setNewStartingChoice({
                                  ...newStartingChoice,
                                  agmt_context_only: e.target.checked,
                                })
                              }
                              className="w-4 h-4 rounded"
                            />
                            AGMT provides context only (doesn&apos;t override
                            skill check)
                          </label>
                        )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-blue-200 mb-1">
                            AGMT Table Roll (optional)
                          </label>
                          <select
                            value={newStartingChoice.agmt_table || ""}
                            onChange={(e) =>
                              setNewStartingChoice({
                                ...newStartingChoice,
                                agmt_table: e.target.value || undefined,
                              })
                            }
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                          >
                            <option value="">No AGMT table</option>
                            <option value="action">Action</option>
                            <option value="subject">Subject</option>
                            <option value="action_subject">
                              Action + Subject
                            </option>
                            <option value="character_descriptors">
                              Character Descriptors
                            </option>
                            <option value="character_identity">
                              Character Identity
                            </option>
                            <option value="character_personality">
                              Character Personality
                            </option>
                            <option value="character_motivations">
                              Character Motivations
                            </option>
                            <option value="character_skills">
                              Character Skills
                            </option>
                            <option value="character_flaws">
                              Character Flaws
                            </option>
                            <option value="locations">Locations</option>
                            <option value="objects">Objects</option>
                            <option value="plot_twists">Plot Twists</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-blue-200 mb-1">
                            Custom Table Roll (optional)
                          </label>
                          <select
                            value={newStartingChoice.custom_table || ""}
                            onChange={(e) =>
                              setNewStartingChoice({
                                ...newStartingChoice,
                                custom_table: e.target.value || undefined,
                              })
                            }
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                          >
                            <option value="">No custom table</option>
                            {customTables.map((table) => (
                              <option key={table.id} value={table.name}>
                                {table.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  if (!newStartingChoice.text?.trim()) {
                    addNotification("Please enter choice text", "warning");
                    return;
                  }
                  const choice: StartingChoice = {
                    text: newStartingChoice.text.trim(),
                    intro_override:
                      newStartingChoice.intro_override?.trim() || undefined,
                    skill_used: newStartingChoice.skill_used || undefined,
                    skill_dc: newStartingChoice.skill_used
                      ? newStartingChoice.skill_dc
                      : undefined,
                    resource_used: newStartingChoice.resource_used || undefined,
                    item_used: newStartingChoice.item_used || undefined,
                    item_loss: newStartingChoice.item_used
                      ? newStartingChoice.item_loss
                      : undefined,
                    agmt_check: newStartingChoice.agmt_check || undefined,
                    agmt_context_only:
                      newStartingChoice.agmt_check &&
                      newStartingChoice.skill_used
                        ? newStartingChoice.agmt_context_only
                        : undefined,
                    agmt_table: newStartingChoice.agmt_table || undefined,
                    custom_table: newStartingChoice.custom_table || undefined,
                  };
                  setStartingChoices([...startingChoices, choice]);
                  setNewStartingChoice({
                    text: "",
                    intro_override: "",
                    skill_used: "",
                    skill_dc: undefined,
                    resource_used: "",
                    item_used: "",
                    item_loss: false,
                    agmt_check: "",
                    agmt_context_only: false,
                    agmt_table: "",
                    custom_table: "",
                  });
                  addNotification("Starting choice added!", "success");
                }}
                disabled={!newStartingChoice.text?.trim()}
                className="w-full mt-4 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
              >
                Add Starting Choice
              </button>
            </div>

            {/* Existing Starting Choices */}
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">
                Starting Choices ({startingChoices.length})
              </h3>
              {startingChoices.length === 0 ? (
                <div className="bg-blue-900/20 rounded-lg p-6 text-center">
                  <DynamicIcon
                    name="Play"
                    className="w-12 h-12 mx-auto mb-3 text-gray-400"
                  />
                  <p className="text-blue-300/60">
                    No custom starting choices. Players will see the default
                    &quot;Start Story&quot; button.
                  </p>
                </div>
              ) : (
                startingChoices.map((choice, index) =>
                  editingStartingChoiceIndex === index ? (
                    // Edit mode
                    <div
                      key={index}
                      className="p-4 bg-green-900/40 rounded-lg border-2 border-green-600"
                    >
                      <div className="space-y-4">
                        <h4 className="text-md font-bold text-green-300 flex items-center gap-2">
                          <DynamicIcon name="Edit2" className="w-4 h-4" />{" "}
                          Editing Starting Choice
                        </h4>
                        <div>
                          <label className="block text-sm font-semibold text-blue-200 mb-1">
                            Choice Text *
                          </label>
                          <input
                            type="text"
                            value={editStartingChoice.text || ""}
                            onChange={(e) =>
                              setEditStartingChoice({
                                ...editStartingChoice,
                                text: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-blue-200 mb-1">
                            Intro Override
                          </label>
                          <textarea
                            value={editStartingChoice.intro_override || ""}
                            onChange={(e) =>
                              setEditStartingChoice({
                                ...editStartingChoice,
                                intro_override: e.target.value,
                              })
                            }
                            rows={3}
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white resize-none"
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-semibold text-blue-200 mb-1">
                              Skill Check
                            </label>
                            <select
                              value={editStartingChoice.skill_used || ""}
                              onChange={(e) =>
                                setEditStartingChoice({
                                  ...editStartingChoice,
                                  skill_used: e.target.value || undefined,
                                  skill_dc: e.target.value
                                    ? editStartingChoice.skill_dc || "average"
                                    : undefined,
                                })
                              }
                              className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                            >
                              <option value="">No skill check</option>
                              {stats.map((stat) => (
                                <option key={stat.name} value={stat.name}>
                                  {stat.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          {editStartingChoice.skill_used && (
                            <div>
                              <label className="block text-sm font-semibold text-blue-200 mb-1">
                                Difficulty Tier
                              </label>
                              <select
                                value={
                                  (editStartingChoice.skill_dc as string) ||
                                  "average"
                                }
                                onChange={(e) =>
                                  setEditStartingChoice({
                                    ...editStartingChoice,
                                    skill_dc: e.target.value as DCTier,
                                  })
                                }
                                className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                              >
                                <option value="trivial">
                                  Trivial - Almost automatic
                                </option>
                                <option value="easy">
                                  Easy - Most succeed
                                </option>
                                <option value="average">
                                  Average - 50/50 chance
                                </option>
                                <option value="hard">
                                  Hard - Skill required
                                </option>
                                <option value="very_hard">
                                  Very Hard - Only experts succeed
                                </option>
                                <option value="impossible">
                                  Impossible - Legendary difficulty
                                </option>
                              </select>
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-semibold text-blue-200 mb-1">
                              Requires Item
                            </label>
                            <select
                              value={editStartingChoice.item_used || ""}
                              onChange={(e) =>
                                setEditStartingChoice({
                                  ...editStartingChoice,
                                  item_used: e.target.value || undefined,
                                })
                              }
                              className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                            >
                              <option value="">No item required</option>
                              {inventory.map((item) => (
                                <option key={item.name} value={item.name}>
                                  {item.name}
                                </option>
                              ))}
                            </select>
                            {editStartingChoice.item_used && (
                              <label className="flex items-center gap-2 mt-2 text-sm text-blue-300">
                                <input
                                  type="checkbox"
                                  checked={
                                    editStartingChoice.item_loss || false
                                  }
                                  onChange={(e) =>
                                    setEditStartingChoice({
                                      ...editStartingChoice,
                                      item_loss: e.target.checked,
                                    })
                                  }
                                  className="w-4 h-4 rounded"
                                />
                                Consume item on use
                              </label>
                            )}
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-blue-200 mb-1">
                              Resource Cost
                            </label>
                            <select
                              value={editStartingChoice.resource_used || ""}
                              onChange={(e) =>
                                setEditStartingChoice({
                                  ...editStartingChoice,
                                  resource_used: e.target.value || undefined,
                                })
                              }
                              className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                            >
                              <option value="">No resource cost</option>
                              {resources.map((res) => (
                                <option key={res.name} value={res.name}>
                                  {res.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        {/* Advanced RPG Tools Section in Edit */}
                        {agmtEnabled && (
                          <div className="border-t border-blue-800/30 pt-4 mt-4">
                            <h4 className="text-sm font-bold text-purple-400 mb-3 flex items-center gap-2">
                              <DynamicIcon
                                name="Sparkles"
                                className="w-4 h-4"
                              />
                              Advanced RPG Tools Options
                            </h4>
                            <div className="space-y-4">
                              <div>
                                <label className="block text-sm font-semibold text-blue-200 mb-1">
                                  Fate Check Question
                                </label>
                                <input
                                  type="text"
                                  value={editStartingChoice.agmt_check || ""}
                                  onChange={(e) =>
                                    setEditStartingChoice({
                                      ...editStartingChoice,
                                      agmt_check: e.target.value || undefined,
                                    })
                                  }
                                  placeholder="e.g., Is the door locked? (Likely)"
                                  className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                                />
                              </div>
                              {editStartingChoice.agmt_check &&
                                editStartingChoice.skill_used && (
                                  <label className="flex items-center gap-2 text-sm text-blue-300">
                                    <input
                                      type="checkbox"
                                      checked={
                                        editStartingChoice.agmt_context_only ||
                                        false
                                      }
                                      onChange={(e) =>
                                        setEditStartingChoice({
                                          ...editStartingChoice,
                                          agmt_context_only: e.target.checked,
                                        })
                                      }
                                      className="w-4 h-4 rounded"
                                    />
                                    AGMT provides context only
                                  </label>
                                )}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                                    AGMT Table Roll
                                  </label>
                                  <select
                                    value={editStartingChoice.agmt_table || ""}
                                    onChange={(e) =>
                                      setEditStartingChoice({
                                        ...editStartingChoice,
                                        agmt_table: e.target.value || undefined,
                                      })
                                    }
                                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                                  >
                                    <option value="">No AGMT table</option>
                                    <option value="action">Action</option>
                                    <option value="subject">Subject</option>
                                    <option value="action_subject">
                                      Action + Subject
                                    </option>
                                    <option value="character_descriptors">
                                      Character Descriptors
                                    </option>
                                    <option value="character_identity">
                                      Character Identity
                                    </option>
                                    <option value="character_personality">
                                      Character Personality
                                    </option>
                                    <option value="character_motivations">
                                      Character Motivations
                                    </option>
                                    <option value="character_skills">
                                      Character Skills
                                    </option>
                                    <option value="character_flaws">
                                      Character Flaws
                                    </option>
                                    <option value="locations">Locations</option>
                                    <option value="objects">Objects</option>
                                    <option value="plot_twists">
                                      Plot Twists
                                    </option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                                    Custom Table Roll
                                  </label>
                                  <select
                                    value={
                                      editStartingChoice.custom_table || ""
                                    }
                                    onChange={(e) =>
                                      setEditStartingChoice({
                                        ...editStartingChoice,
                                        custom_table:
                                          e.target.value || undefined,
                                      })
                                    }
                                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                                  >
                                    <option value="">No custom table</option>
                                    {customTables.map((table) => (
                                      <option key={table.id} value={table.name}>
                                        {table.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              if (!editStartingChoice.text?.trim()) {
                                addNotification(
                                  "Choice text is required",
                                  "warning",
                                );
                                return;
                              }
                              const updated = [...startingChoices];
                              updated[index] = {
                                text: editStartingChoice.text!.trim(),
                                intro_override:
                                  editStartingChoice.intro_override?.trim() ||
                                  undefined,
                                skill_used:
                                  editStartingChoice.skill_used || undefined,
                                skill_dc: editStartingChoice.skill_used
                                  ? editStartingChoice.skill_dc
                                  : undefined,
                                resource_used:
                                  editStartingChoice.resource_used || undefined,
                                item_used:
                                  editStartingChoice.item_used || undefined,
                                item_loss: editStartingChoice.item_used
                                  ? editStartingChoice.item_loss
                                  : undefined,
                                agmt_check:
                                  editStartingChoice.agmt_check || undefined,
                                agmt_context_only:
                                  editStartingChoice.agmt_check &&
                                  editStartingChoice.skill_used
                                    ? editStartingChoice.agmt_context_only
                                    : undefined,
                                agmt_table:
                                  editStartingChoice.agmt_table || undefined,
                                custom_table:
                                  editStartingChoice.custom_table || undefined,
                              };
                              setStartingChoices(updated);
                              setEditingStartingChoiceIndex(null);
                              setEditStartingChoice({});
                              addNotification(
                                "Starting choice updated!",
                                "success",
                              );
                            }}
                            disabled={!editStartingChoice.text?.trim()}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
                          >
                            <DynamicIcon
                              name="Save"
                              className="inline-block w-4 h-4 mr-1"
                            />
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setEditingStartingChoiceIndex(null);
                              setEditStartingChoice({});
                            }}
                            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    // View mode
                    <div
                      key={index}
                      className="p-4 bg-green-900/20 rounded-lg border border-green-800/50"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-white flex items-center gap-2 flex-wrap">
                            <span className="text-green-400">{index + 1}.</span>
                            <span>{choice.text}</span>
                          </div>
                          {choice.intro_override && (
                            <p className="text-sm text-blue-400 mt-1 flex items-center gap-1">
                              <DynamicIcon
                                name="FileText"
                                className="w-3 h-3"
                              />
                              Custom intro text
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2 mt-2">
                            {choice.skill_used && (
                              <span className="px-2 py-0.5 bg-purple-900/30 text-purple-200 rounded text-xs">
                                <DynamicIcon
                                  name="Dices"
                                  className="w-3 h-3 inline mr-1"
                                />
                                {choice.skill_used} (
                                {typeof choice.skill_dc === "number"
                                  ? `DC ${choice.skill_dc}`
                                  : choice.skill_dc || "average"}
                                )
                              </span>
                            )}
                            {choice.item_used && (
                              <span className="px-2 py-0.5 bg-amber-900/30 text-amber-200 rounded text-xs">
                                <DynamicIcon
                                  name="Package"
                                  className="w-3 h-3 inline mr-1"
                                />
                                {choice.item_loss ? "Consumes" : "Requires"}:{" "}
                                {choice.item_used}
                              </span>
                            )}
                            {choice.resource_used && (
                              <span className="px-2 py-0.5 bg-cyan-900/30 text-cyan-200 rounded text-xs">
                                <DynamicIcon
                                  name="Gem"
                                  className="w-3 h-3 inline mr-1"
                                />
                                Uses: {choice.resource_used}
                              </span>
                            )}
                            {choice.agmt_check && (
                              <span className="px-2 py-0.5 bg-purple-900/30 text-purple-200 rounded text-xs">
                                <DynamicIcon
                                  name="Sparkles"
                                  className="w-3 h-3 inline mr-1"
                                />
                                Fate: {choice.agmt_check}
                              </span>
                            )}
                            {choice.agmt_table && (
                              <span className="px-2 py-0.5 bg-violet-900/30 text-violet-200 rounded text-xs">
                                <DynamicIcon
                                  name="TableProperties"
                                  className="w-3 h-3 inline mr-1"
                                />
                                AGMT: {choice.agmt_table}
                              </span>
                            )}
                            {choice.custom_table && (
                              <span className="px-2 py-0.5 bg-indigo-900/30 text-indigo-200 rounded text-xs">
                                <DynamicIcon
                                  name="List"
                                  className="w-3 h-3 inline mr-1"
                                />
                                Table: {choice.custom_table}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => {
                              setEditingStartingChoiceIndex(index);
                              setEditStartingChoice({ ...choice });
                            }}
                            className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors text-sm"
                            title="Edit"
                          >
                            <DynamicIcon name="Edit2" className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setStartingChoices(
                                startingChoices.filter((_, i) => i !== index),
                              );
                              addNotification(
                                "Starting choice removed",
                                "success",
                              );
                            }}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
                            title="Delete"
                          >
                            <DynamicIcon name="Trash2" className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ),
                )
              )}
            </div>
          </div>
        );

      case "lore":
        return (
          <div className="space-y-6">
            <div className="bg-indigo-900/20 border border-indigo-800/50 rounded-lg p-4">
              <p className="text-sm text-blue-300 flex items-start gap-2">
                <DynamicIcon
                  name="Lightbulb"
                  className="w-4 h-4 mt-0.5 shrink-0"
                />
                <span>
                  <strong>What are Notes?</strong> Notes are world-building
                  facts the AI uses for context. <strong>Mechanics</strong> type
                  notes are rules that are always prioritized.
                  <strong> Triggers</strong> control visibility:{" "}
                  <span className="text-green-400">ON triggers</span> (keywords
                  that reveal this note when mentioned) and
                  <span className="text-red-400"> OFF triggers</span> (keywords
                  that hide it).
                </span>
              </p>
            </div>

            {/* PDF Import */}
            <PDFImporter
              onImportComplete={(data) => {
                // Merge imported lore with existing
                const newLoreEntries = [...data.lore, ...data.mechanicNotes];
                if (newLoreEntries.length > 0) {
                  setLore((prev) => [...prev, ...newLoreEntries]);
                  addNotification(
                    `Added ${newLoreEntries.length} notes from PDF`,
                    "success",
                  );
                }
                // Merge custom tables
                if (data.customTables.length > 0) {
                  setCustomTables((prev) => [...prev, ...data.customTables]);
                  addNotification(
                    `Added ${data.customTables.length} custom tables from PDF`,
                    "success",
                  );
                }
              }}
              buttonText="Import Notes from PDF"
            />

            <div className="bg-blue-900/20 rounded-lg border border-blue-700/40 p-6">
              <h3 className="text-lg font-bold mb-4 text-white">Add Note</h3>
              <div className="space-y-4 mb-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-semibold text-blue-200 mb-1">
                      Title *
                    </label>
                    <input
                      type="text"
                      value={newLore.title}
                      onChange={(e) =>
                        setNewLore({ ...newLore, title: e.target.value })
                      }
                      placeholder="e.g., The Ancient Prophecy"
                      className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                    />
                  </div>
                  <div className="w-40">
                    <label className="block text-sm font-semibold text-blue-200 mb-1">
                      Type
                    </label>
                    <select
                      value={newLore.type || ""}
                      onChange={(e) =>
                        setNewLore({
                          ...newLore,
                          type: (e.target.value || undefined) as
                            | LoreType
                            | undefined,
                        })
                      }
                      className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                    >
                      <option value="">📁 World Lore (default)</option>
                      <option value="secret">🔒 Secret</option>
                      <option value="dm_instructions">
                        📋 GM Instructions
                      </option>
                      <option value="story_instructions">
                        📝 Story Instructions
                      </option>
                      <option value="mechanics">⚙️ Mechanics</option>
                      <option value="character_sheet">
                        👤 Character Sheet
                      </option>
                      <option value="npc">🧑 NPC</option>
                      <option value="item">🗡️ Item</option>
                      <option value="location">📍 Location</option>
                      <option value="faction">⚔️ Faction</option>
                      <option value="event">📅 Event</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Content *
                  </label>
                  <textarea
                    value={newLore.content}
                    onChange={(e) =>
                      setNewLore({ ...newLore, content: e.target.value })
                    }
                    placeholder="Write the note content..."
                    rows={5}
                    maxLength={5000}
                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white resize-none"
                  />
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="loreSecret"
                      checked={newLore.secrtet || false}
                      onChange={(e) =>
                        setNewLore({ ...newLore, secrtet: e.target.checked })
                      }
                      className="w-4 h-4 text-purple-600 rounded"
                    />
                    <label
                      htmlFor="loreSecret"
                      className="text-sm text-blue-300 flex items-center gap-1"
                    >
                      <DynamicIcon name="Lock" className="w-3 h-3" /> Hidden
                      (only revealed when triggered)
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="loreOn"
                      checked={newLore.on !== false}
                      onChange={(e) =>
                        setNewLore({ ...newLore, on: e.target.checked })
                      }
                      className="w-4 h-4 text-green-600 rounded"
                    />
                    <label
                      htmlFor="loreOn"
                      className="text-sm text-blue-300 flex items-center gap-1"
                    >
                      <DynamicIcon name="Check" className="w-3 h-3" /> Enabled
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="loreAlwaysOn"
                      checked={newLore.alwaysOn || false}
                      onChange={(e) =>
                        setNewLore({ ...newLore, alwaysOn: e.target.checked })
                      }
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <label
                      htmlFor="loreAlwaysOn"
                      className="text-sm text-blue-300 flex items-center gap-1"
                    >
                      <DynamicIcon name="Globe" className="w-3 h-3" /> Always On
                      (ignores all triggers)
                    </label>
                  </div>
                </div>
                {/* Folder and Tags for organization */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-semibold text-blue-200 mb-1 flex items-center gap-1">
                      <DynamicIcon
                        name="Folder"
                        className="w-4 h-4 text-yellow-500"
                      />
                      Folder (for organization)
                    </label>
                    <input
                      type="text"
                      value={newLore.folder || ""}
                      onChange={(e) =>
                        setNewLore({ ...newLore, folder: e.target.value })
                      }
                      placeholder="e.g., Characters, Locations, History..."
                      list="lore-folders-list"
                      className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                    />
                    <datalist id="lore-folders-list">
                      {[
                        ...new Set(lore.map((l) => l.folder).filter(Boolean)),
                      ].map((folder) => (
                        <option key={folder} value={folder} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-blue-200 mb-1 flex items-center gap-1">
                      <DynamicIcon
                        name="Tag"
                        className="w-4 h-4 text-purple-400"
                      />
                      Tags (for filtering)
                    </label>
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={newLoreTag}
                        onChange={(e) => setNewLoreTag(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const tag = newLoreTag.trim();
                            if (tag && !(newLore.tags || []).includes(tag)) {
                              setNewLore({
                                ...newLore,
                                tags: [...(newLore.tags || []), tag],
                              });
                              setNewLoreTag("");
                            }
                          }
                        }}
                        placeholder="Add tag..."
                        list="lore-tags-list"
                        className="flex-1 px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                      />
                      <datalist id="lore-tags-list">
                        {[...new Set(lore.flatMap((l) => l.tags || []))].map(
                          (tag) => (
                            <option key={tag} value={tag} />
                          ),
                        )}
                      </datalist>
                      <button
                        onClick={() => {
                          const tag = newLoreTag.trim();
                          if (tag && !(newLore.tags || []).includes(tag)) {
                            setNewLore({
                              ...newLore,
                              tags: [...(newLore.tags || []), tag],
                            });
                            setNewLoreTag("");
                          }
                        }}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                      >
                        Add
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(newLore.tags || []).map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-1 rounded-full text-sm flex items-center gap-1 bg-purple-900/30 text-purple-300"
                        >
                          <DynamicIcon name="Tag" className="w-3 h-3" /> {tag}
                          <button
                            onClick={() =>
                              setNewLore({
                                ...newLore,
                                tags: (newLore.tags || []).filter(
                                  (t) => t !== tag,
                                ),
                              })
                            }
                            className="ml-1 text-purple-400 hover:text-purple-200"
                          >
                            <DynamicIcon name="X" className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <LoreImageGenerator
                  loreTitle={newLore.title}
                  loreContent={newLore.content}
                  currentThumbnailUrl={newLore.thumbnailUrl}
                  onImageGenerated={(url) =>
                    setNewLore({
                      ...newLore,
                      thumbnailUrl: url,
                    })
                  }
                />
                <div>
                  <label className="text-sm font-semibold text-blue-200 mb-1 flex items-center gap-1">
                    <DynamicIcon
                      name="CheckCircle"
                      className="w-4 h-4 text-green-600"
                    />{" "}
                    ON Triggers (Words that turn this lore ON)
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={newLoreOnTrigger}
                      onChange={(e) => setNewLoreOnTrigger(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        (e.preventDefault(), addLoreOnTrigger())
                      }
                      placeholder="e.g., Ancient Map"
                      className="flex-1 px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                    />
                    <button
                      onClick={addLoreOnTrigger}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(newLore.on_triggers || []).map((trigger) => {
                      const deleteKey = `newLore:on:${trigger}`;
                      const isPending = pendingTagDelete === deleteKey;
                      return (
                        <span
                          key={trigger}
                          className={`px-2 py-1 rounded-full text-sm flex items-center gap-1 transition-colors ${
                            isPending
                              ? "bg-red-900/50 text-red-300"
                              : "bg-green-900/30 text-green-300"
                          }`}
                        >
                          <DynamicIcon name="Check" className="w-3 h-3" />{" "}
                          {trigger}
                          <button
                            onClick={() => {
                              if (isPending) {
                                setNewLore({
                                  ...newLore,
                                  on_triggers: (
                                    newLore.on_triggers || []
                                  ).filter((t) => t !== trigger),
                                });
                                setPendingTagDelete(null);
                              } else {
                                setPendingTagDelete(deleteKey);
                              }
                            }}
                            onBlur={() =>
                              setTimeout(() => setPendingTagDelete(null), 200)
                            }
                            className={`ml-1 transition-colors ${
                              isPending
                                ? "text-red-400 hover:text-red-200"
                                : "text-green-400 hover:text-green-200"
                            }`}
                            title={
                              isPending
                                ? "Click again to remove"
                                : "Click to remove"
                            }
                          >
                            <DynamicIcon name="X" className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-semibold text-blue-200 mb-1 flex items-center gap-1">
                    <DynamicIcon
                      name="XCircle"
                      className="w-4 h-4 text-red-600"
                    />{" "}
                    OFF Triggers (Words that turn this lore OFF)
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={newLoreOffTrigger}
                      onChange={(e) => setNewLoreOffTrigger(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        (e.preventDefault(), addLoreOffTrigger())
                      }
                      placeholder="e.g., Destroyed the Map"
                      className="flex-1 px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                    />
                    <button
                      onClick={addLoreOffTrigger}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(newLore.off_triggers || []).map((trigger) => {
                      const deleteKey = `newLore:off:${trigger}`;
                      const isPending = pendingTagDelete === deleteKey;
                      return (
                        <span
                          key={trigger}
                          className={`px-2 py-1 rounded-full text-sm flex items-center gap-1 transition-colors ${
                            isPending
                              ? "bg-red-700/50 text-red-200 ring-2 ring-red-500"
                              : "bg-red-900/30 text-red-300"
                          }`}
                        >
                          <DynamicIcon name="X" className="w-3 h-3" /> {trigger}
                          <button
                            onClick={() => {
                              if (isPending) {
                                setNewLore({
                                  ...newLore,
                                  off_triggers: (
                                    newLore.off_triggers || []
                                  ).filter((t) => t !== trigger),
                                });
                                setPendingTagDelete(null);
                              } else {
                                setPendingTagDelete(deleteKey);
                              }
                            }}
                            onBlur={() =>
                              setTimeout(() => setPendingTagDelete(null), 200)
                            }
                            className={`ml-1 transition-colors ${
                              isPending
                                ? "text-red-200 hover:text-white"
                                : "text-red-400 hover:text-red-200"
                            }`}
                            title={
                              isPending
                                ? "Click again to remove"
                                : "Click to remove"
                            }
                          >
                            <DynamicIcon name="X" className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Advanced Triggers Section (Expandable) */}
                <div className="border border-blue-700/40 rounded-lg">
                  <button
                    onClick={() =>
                      setNewLoreAdvancedExpanded(!newLoreAdvancedExpanded)
                    }
                    className="w-full px-4 py-3 flex items-center justify-between bg-blue-900/20 hover:bg-blue-800/30 rounded-lg transition-colors"
                  >
                    <span className="text-sm font-semibold text-blue-200 flex items-center gap-2">
                      <DynamicIcon name="Settings" className="w-4 h-4" />{" "}
                      Advanced Section
                    </span>
                    <span className="text-blue-300/50">
                      <DynamicIcon
                        name={
                          newLoreAdvancedExpanded ? "ChevronUp" : "ChevronDown"
                        }
                        className="w-4 h-4"
                      />
                    </span>
                  </button>

                  {newLoreAdvancedExpanded && (
                    <div className="p-4 space-y-4">
                      {/* Lore-based Triggers */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-semibold text-blue-200 mb-2 flex items-center gap-1">
                            <DynamicIcon
                              name="CheckCircle"
                              className="w-4 h-4 text-green-600"
                            />{" "}
                            Lores that turn this ON
                          </label>
                          <div className="max-h-40 overflow-y-auto border border-blue-700/40 rounded-lg p-2 bg-blue-900/20">
                            {lore.length === 0 ? (
                              <p className="text-xs text-blue-300/50 italic">
                                No other lore entries yet.
                              </p>
                            ) : (
                              lore.map((loreEntry, loreIndex) => (
                                <label
                                  key={loreIndex}
                                  className="flex items-center gap-2 px-2 py-1 hover:bg-blue-800/40 rounded cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={(
                                      newLore.trigger_lores || []
                                    ).includes(loreEntry.title)}
                                    onChange={(e) => {
                                      const current =
                                        newLore.trigger_lores || [];
                                      setNewLore({
                                        ...newLore,
                                        trigger_lores: e.target.checked
                                          ? [...current, loreEntry.title]
                                          : current.filter(
                                              (t) => t !== loreEntry.title,
                                            ),
                                      });
                                    }}
                                    className="w-4 h-4 text-green-600 rounded"
                                  />
                                  <span className="text-xs text-white">
                                    {loreEntry.title}
                                  </span>
                                </label>
                              ))
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="text-sm font-semibold text-blue-200 mb-2 flex items-center gap-1">
                            <DynamicIcon
                              name="XCircle"
                              className="w-4 h-4 text-red-600"
                            />{" "}
                            Lores that turn this OFF
                          </label>
                          <div className="max-h-40 overflow-y-auto border border-blue-700/40 rounded-lg p-2 bg-blue-900/20">
                            {lore.length === 0 ? (
                              <p className="text-xs text-blue-300/50 italic">
                                No other lore entries yet.
                              </p>
                            ) : (
                              lore.map((loreEntry, loreIndex) => (
                                <label
                                  key={loreIndex}
                                  className="flex items-center gap-2 px-2 py-1 hover:bg-blue-800/40 rounded cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={(
                                      newLore.untrigger_lores || []
                                    ).includes(loreEntry.title)}
                                    onChange={(e) => {
                                      const current =
                                        newLore.untrigger_lores || [];
                                      setNewLore({
                                        ...newLore,
                                        untrigger_lores: e.target.checked
                                          ? [...current, loreEntry.title]
                                          : current.filter(
                                              (t) => t !== loreEntry.title,
                                            ),
                                      });
                                    }}
                                    className="w-4 h-4 text-red-600 rounded"
                                  />
                                  <span className="text-xs text-white">
                                    {loreEntry.title}
                                  </span>
                                </label>
                              ))
                            )}
                          </div>
                        </div>
                      </div>

                      {newLore.secrtet && (
                        <div>
                          <label className="text-sm font-semibold text-blue-200 mb-1 flex items-center gap-1">
                            <DynamicIcon name="Key" className="w-4 h-4" />{" "}
                            Trigger Keys (Words that reveal this lore)
                          </label>
                          <div className="flex gap-2 mb-2">
                            <input
                              type="text"
                              value={newLoreKey}
                              onChange={(e) => setNewLoreKey(e.target.value)}
                              onKeyDown={(e) =>
                                e.key === "Enter" &&
                                (e.preventDefault(), addLoreKey())
                              }
                              placeholder="e.g., Dragon Defeated or Ancient Ruins"
                              className="flex-1 px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                            />
                            <button
                              onClick={addLoreKey}
                              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                            >
                              Add
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {(newLore.keys || []).map((key) => {
                              const deleteKey = `newLore:key:${key}`;
                              const isPending = pendingTagDelete === deleteKey;
                              return (
                                <span
                                  key={key}
                                  className={`px-2 py-1 rounded-full text-sm flex items-center gap-1 transition-colors ${
                                    isPending
                                      ? "bg-red-900/50 text-red-300"
                                      : "bg-yellow-900/30 text-yellow-300"
                                  }`}
                                >
                                  <DynamicIcon name="Key" className="w-3 h-3" />{" "}
                                  {key}
                                  <button
                                    onClick={() => {
                                      if (isPending) {
                                        setNewLore({
                                          ...newLore,
                                          keys: (newLore.keys || []).filter(
                                            (k) => k !== key,
                                          ),
                                        });
                                        setPendingTagDelete(null);
                                      } else {
                                        setPendingTagDelete(deleteKey);
                                      }
                                    }}
                                    onBlur={() =>
                                      setTimeout(
                                        () => setPendingTagDelete(null),
                                        200,
                                      )
                                    }
                                    className={`ml-1 transition-colors ${
                                      isPending
                                        ? "text-red-400 hover:text-red-200"
                                        : "text-yellow-400 hover:text-yellow-200"
                                    }`}
                                    title={
                                      isPending
                                        ? "Click again to remove"
                                        : "Click to remove"
                                    }
                                  >
                                    <DynamicIcon name="X" className="w-3 h-3" />
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Variable Triggers (Boolean) */}
                      {variables.filter((v) => v.type === "boolean").length >
                        0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-semibold text-blue-200 mb-2 flex items-center gap-1">
                              <DynamicIcon
                                name="ToggleRight"
                                className="w-4 h-4 text-cyan-500"
                              />{" "}
                              Variables that turn this ON (when true)
                            </label>
                            <div className="max-h-40 overflow-y-auto border border-blue-700/40 rounded-lg p-2 bg-blue-900/20">
                              {variables
                                .filter((v) => v.type === "boolean")
                                .map((variable) => (
                                  <label
                                    key={variable.id}
                                    className="flex items-center gap-2 px-2 py-1 hover:bg-blue-800/40 rounded cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={(
                                        newLore.var_on_triggers || []
                                      ).includes(variable.name)}
                                      onChange={(e) => {
                                        const current =
                                          newLore.var_on_triggers || [];
                                        setNewLore({
                                          ...newLore,
                                          var_on_triggers: e.target.checked
                                            ? [...current, variable.name]
                                            : current.filter(
                                                (n) => n !== variable.name,
                                              ),
                                        });
                                      }}
                                      className="w-4 h-4 text-cyan-600 rounded"
                                    />
                                    <span className="text-xs text-white">
                                      {variable.name}
                                    </span>
                                  </label>
                                ))}
                            </div>
                          </div>
                          <div>
                            <label className="text-sm font-semibold text-blue-200 mb-2 flex items-center gap-1">
                              <DynamicIcon
                                name="ToggleLeft"
                                className="w-4 h-4 text-orange-500"
                              />{" "}
                              Variables that turn this OFF (when true)
                            </label>
                            <div className="max-h-40 overflow-y-auto border border-blue-700/40 rounded-lg p-2 bg-blue-900/20">
                              {variables
                                .filter((v) => v.type === "boolean")
                                .map((variable) => (
                                  <label
                                    key={variable.id}
                                    className="flex items-center gap-2 px-2 py-1 hover:bg-blue-800/40 rounded cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={(
                                        newLore.var_off_triggers || []
                                      ).includes(variable.name)}
                                      onChange={(e) => {
                                        const current =
                                          newLore.var_off_triggers || [];
                                        setNewLore({
                                          ...newLore,
                                          var_off_triggers: e.target.checked
                                            ? [...current, variable.name]
                                            : current.filter(
                                                (n) => n !== variable.name,
                                              ),
                                        });
                                      }}
                                      className="w-4 h-4 text-orange-600 rounded"
                                    />
                                    <span className="text-xs text-white">
                                      {variable.name}
                                    </span>
                                  </label>
                                ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={addLore}
                disabled={!newLore.title || !newLore.content}
                className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
              >
                Add Lore Entry
              </button>
            </div>

            {/* Mass Image Generation */}
            {lore.length > 0 && (
              <MassLoreImageGenerator lore={lore} onLoreUpdate={setLore} />
            )}

            <div className="space-y-3">
              <div className="flex flex-col gap-3 mb-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white">
                    Lore Entries ({lore.length})
                  </h3>
                  <div className="relative">
                    <input
                      type="text"
                      value={loreSearchQuery}
                      onChange={(e) => {
                        setLoreSearchQuery(e.target.value);
                        setLorePage(1);
                      }}
                      placeholder="Search lore..."
                      className="pl-8 pr-3 py-1 text-sm border border-blue-700/40 rounded-lg bg-blue-900/20 text-white focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="absolute left-2.5 top-1.5 text-gray-400 text-xs">
                      <DynamicIcon name="Search" className="w-4 h-4" />
                    </span>
                  </div>
                </div>
                {/* Folder and Tag Filters */}
                {lore.length > 0 && (
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Folder filter */}
                    {[...new Set(lore.map((l) => l.folder).filter(Boolean))]
                      .length > 0 && (
                      <div className="flex items-center gap-2">
                        <DynamicIcon
                          name="Folder"
                          className="w-4 h-4 text-yellow-500"
                        />
                        <select
                          value={loreFilterFolder}
                          onChange={(e) => {
                            setLoreFilterFolder(e.target.value);
                            setLorePage(1);
                          }}
                          className="px-2 py-1 text-sm border border-blue-700/40 rounded-lg bg-blue-900/20 text-white"
                        >
                          <option value="">All Folders</option>
                          {[
                            ...new Set(
                              lore.map((l) => l.folder).filter(Boolean),
                            ),
                          ]
                            .sort()
                            .map((folder) => (
                              <option key={folder} value={folder}>
                                {folder} (
                                {lore.filter((l) => l.folder === folder).length}
                                )
                              </option>
                            ))}
                          <option value="__none__">
                            No Folder ({lore.filter((l) => !l.folder).length})
                          </option>
                        </select>
                      </div>
                    )}
                    {/* Tag filter chips */}
                    {[...new Set(lore.flatMap((l) => l.tags || []))].length >
                      0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <DynamicIcon
                          name="Tag"
                          className="w-4 h-4 text-purple-400"
                        />
                        {[...new Set(lore.flatMap((l) => l.tags || []))]
                          .sort()
                          .map((tag) => {
                            const isActive = loreFilterTags.includes(tag);
                            return (
                              <button
                                key={tag}
                                onClick={() => {
                                  if (isActive) {
                                    setLoreFilterTags(
                                      loreFilterTags.filter((t) => t !== tag),
                                    );
                                  } else {
                                    setLoreFilterTags([...loreFilterTags, tag]);
                                  }
                                  setLorePage(1);
                                }}
                                className={`px-2 py-0.5 rounded-full text-xs transition-colors ${
                                  isActive
                                    ? "bg-purple-600 text-white"
                                    : "bg-purple-900/30 text-purple-300 hover:bg-purple-800/40"
                                }`}
                              >
                                {tag}
                              </button>
                            );
                          })}
                        {loreFilterTags.length > 0 && (
                          <button
                            onClick={() => {
                              setLoreFilterTags([]);
                              setLorePage(1);
                            }}
                            className="px-2 py-0.5 rounded-full text-xs bg-gray-600 hover:bg-gray-500 text-white"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {lore.length === 0 ? (
                <p className="text-blue-300/60 text-sm">
                  No lore entries added yet
                </p>
              ) : (
                (() => {
                  const filteredLore = lore
                    .map((entry, index) => ({ entry, originalIndex: index }))
                    .filter(
                      (item) =>
                        (item.entry.title
                          .toLowerCase()
                          .includes(loreSearchQuery.toLowerCase()) ||
                          item.entry.content
                            .toLowerCase()
                            .includes(loreSearchQuery.toLowerCase())) &&
                        // Folder filter
                        (loreFilterFolder === "" ||
                          (loreFilterFolder === "__none__" &&
                            !item.entry.folder) ||
                          item.entry.folder === loreFilterFolder) &&
                        // Tag filter (must have all selected tags)
                        (loreFilterTags.length === 0 ||
                          loreFilterTags.every((tag) =>
                            (item.entry.tags || []).includes(tag),
                          )),
                    )
                    .sort((a, b) => a.entry.title.localeCompare(b.entry.title));

                  const totalPages = Math.ceil(
                    filteredLore.length / loreItemsPerPage,
                  );
                  const displayedLore = filteredLore.slice(
                    (lorePage - 1) * loreItemsPerPage,
                    lorePage * loreItemsPerPage,
                  );

                  if (filteredLore.length === 0 && lore.length > 0) {
                    return (
                      <p className="text-blue-300/50 text-sm italic">
                        No lore entries match your filters.
                      </p>
                    );
                  }

                  return (
                    <>
                      {displayedLore.map(({ entry, originalIndex: index }) => (
                        <div
                          key={index}
                          draggable={false}
                          className="p-4 bg-indigo-900/20 rounded-lg border border-indigo-800/50"
                        >
                          {editingLoreIndex === index ? (
                            // Edit mode
                            <div className="space-y-4">
                              <h4 className="text-md font-bold text-indigo-100 flex items-center gap-2">
                                <DynamicIcon name="Edit2" className="w-4 h-4" />{" "}
                                Editing Note
                              </h4>
                              <div className="flex gap-4">
                                <div className="flex-1">
                                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                                    Title *
                                  </label>
                                  <input
                                    type="text"
                                    value={editLore.title || ""}
                                    onChange={(e) =>
                                      setEditLore({
                                        ...editLore,
                                        title: e.target.value,
                                      })
                                    }
                                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                                  />
                                </div>
                                <div className="w-40">
                                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                                    Type
                                  </label>
                                  <select
                                    value={editLore.type || ""}
                                    onChange={(e) =>
                                      setEditLore({
                                        ...editLore,
                                        type: (e.target.value || undefined) as
                                          | LoreType
                                          | undefined,
                                      })
                                    }
                                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                                  >
                                    <option value="">
                                      📁 World Lore (default)
                                    </option>
                                    <option value="secret">🔒 Secret</option>
                                    <option value="dm_instructions">
                                      📋 GM Instructions
                                    </option>
                                    <option value="story_instructions">
                                      📝 Story Instructions
                                    </option>
                                    <option value="mechanics">
                                      ⚙️ Mechanics
                                    </option>
                                    <option value="character_sheet">
                                      👤 Character Sheet
                                    </option>
                                    <option value="npc">🧑 NPC</option>
                                    <option value="item">🗡️ Item</option>
                                    <option value="location">
                                      📍 Location
                                    </option>
                                    <option value="faction">⚔️ Faction</option>
                                    <option value="event">📅 Event</option>
                                  </select>
                                </div>
                              </div>
                              <div>
                                <label className="block text-sm font-semibold text-blue-200 mb-1">
                                  Content *
                                </label>
                                <textarea
                                  value={editLore.content || ""}
                                  onChange={(e) =>
                                    setEditLore({
                                      ...editLore,
                                      content: e.target.value,
                                    })
                                  }
                                  rows={5}
                                  maxLength={5000}
                                  className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white resize-none"
                                />
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    id={`edit-lore-secret-${index}`}
                                    checked={editLore.secrtet || false}
                                    onChange={(e) =>
                                      setEditLore({
                                        ...editLore,
                                        secrtet: e.target.checked,
                                      })
                                    }
                                    className="w-4 h-4 text-purple-600 rounded"
                                  />
                                  <label
                                    htmlFor={`edit-lore-secret-${index}`}
                                    className="text-sm text-blue-300"
                                  >
                                    Secret
                                  </label>
                                </div>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    id={`edit-lore-on-${index}`}
                                    checked={editLore.on !== false}
                                    onChange={(e) =>
                                      setEditLore({
                                        ...editLore,
                                        on: e.target.checked,
                                      })
                                    }
                                    className="w-4 h-4 text-green-600 rounded"
                                  />
                                  <label
                                    htmlFor={`edit-lore-on-${index}`}
                                    className="text-sm text-blue-300"
                                  >
                                    Enabled
                                  </label>
                                </div>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    id={`edit-lore-alwaysOn-${index}`}
                                    checked={editLore.alwaysOn || false}
                                    onChange={(e) =>
                                      setEditLore({
                                        ...editLore,
                                        alwaysOn: e.target.checked,
                                      })
                                    }
                                    className="w-4 h-4 text-blue-600 rounded"
                                  />
                                  <label
                                    htmlFor={`edit-lore-alwaysOn-${index}`}
                                    className="text-sm text-blue-300"
                                  >
                                    <DynamicIcon
                                      name="Circle"
                                      className="inline-block w-4 h-4 mr-1 text-blue-500"
                                    />
                                    Always On
                                  </label>
                                </div>
                              </div>
                              {/* Folder and Tags for organization (edit mode) */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="text-sm font-semibold text-blue-200 mb-1 flex items-center gap-1">
                                    <DynamicIcon
                                      name="Folder"
                                      className="w-4 h-4 text-yellow-500"
                                    />
                                    Folder
                                  </label>
                                  <input
                                    type="text"
                                    value={editLore.folder || ""}
                                    onChange={(e) =>
                                      setEditLore({
                                        ...editLore,
                                        folder: e.target.value,
                                      })
                                    }
                                    placeholder="e.g., Characters, Locations..."
                                    list={`edit-lore-folders-list-${index}`}
                                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                                  />
                                  <datalist
                                    id={`edit-lore-folders-list-${index}`}
                                  >
                                    {[
                                      ...new Set(
                                        lore
                                          .map((l) => l.folder)
                                          .filter(Boolean),
                                      ),
                                    ].map((folder) => (
                                      <option key={folder} value={folder} />
                                    ))}
                                  </datalist>
                                </div>
                                <div>
                                  <label className="text-sm font-semibold text-blue-200 mb-1 flex items-center gap-1">
                                    <DynamicIcon
                                      name="Tag"
                                      className="w-4 h-4 text-purple-400"
                                    />
                                    Tags
                                  </label>
                                  <div className="flex gap-2 mb-2">
                                    <input
                                      type="text"
                                      value={editLoreTag}
                                      onChange={(e) =>
                                        setEditLoreTag(e.target.value)
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          const tag = editLoreTag.trim();
                                          if (
                                            tag &&
                                            !(editLore.tags || []).includes(tag)
                                          ) {
                                            setEditLore({
                                              ...editLore,
                                              tags: [
                                                ...(editLore.tags || []),
                                                tag,
                                              ],
                                            });
                                            setEditLoreTag("");
                                          }
                                        }
                                      }}
                                      placeholder="Add tag..."
                                      list={`edit-lore-tags-list-${index}`}
                                      className="flex-1 px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                                    />
                                    <datalist
                                      id={`edit-lore-tags-list-${index}`}
                                    >
                                      {[
                                        ...new Set(
                                          lore.flatMap((l) => l.tags || []),
                                        ),
                                      ].map((tag) => (
                                        <option key={tag} value={tag} />
                                      ))}
                                    </datalist>
                                    <button
                                      onClick={() => {
                                        const tag = editLoreTag.trim();
                                        if (
                                          tag &&
                                          !(editLore.tags || []).includes(tag)
                                        ) {
                                          setEditLore({
                                            ...editLore,
                                            tags: [
                                              ...(editLore.tags || []),
                                              tag,
                                            ],
                                          });
                                          setEditLoreTag("");
                                        }
                                      }}
                                      className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                                    >
                                      Add
                                    </button>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {(editLore.tags || []).map((tag) => (
                                      <span
                                        key={tag}
                                        className="px-2 py-1 rounded-full text-sm flex items-center gap-1 bg-purple-900/30 text-purple-300"
                                      >
                                        <DynamicIcon
                                          name="Tag"
                                          className="w-3 h-3"
                                        />{" "}
                                        {tag}
                                        <button
                                          onClick={() =>
                                            setEditLore({
                                              ...editLore,
                                              tags: (
                                                editLore.tags || []
                                              ).filter((t) => t !== tag),
                                            })
                                          }
                                          className="ml-1 text-purple-400 hover:text-purple-200"
                                        >
                                          <DynamicIcon
                                            name="X"
                                            className="w-3 h-3"
                                          />
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <LoreImageGenerator
                                loreTitle={editLore.title}
                                loreContent={editLore.content}
                                currentThumbnailUrl={editLore.thumbnailUrl}
                                onImageGenerated={(url) =>
                                  setEditLore({
                                    ...editLore,
                                    thumbnailUrl: url,
                                  })
                                }
                              />

                              <div>
                                <label className="text-sm font-semibold text-blue-200 mb-1 flex items-center gap-1">
                                  <DynamicIcon
                                    name="CheckCircle"
                                    className="w-4 h-4 text-green-600"
                                  />{" "}
                                  ON Triggers
                                </label>
                                <div className="flex gap-2 mb-2">
                                  <input
                                    type="text"
                                    value={editLoreOnTrigger}
                                    onChange={(e) =>
                                      setEditLoreOnTrigger(e.target.value)
                                    }
                                    onKeyDown={(e) =>
                                      e.key === "Enter" &&
                                      (e.preventDefault(),
                                      addEditLoreOnTrigger())
                                    }
                                    placeholder="e.g., Ancient Map"
                                    className="flex-1 px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                                  />
                                  <button
                                    onClick={addEditLoreOnTrigger}
                                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm"
                                  >
                                    Add
                                  </button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {(editLore.on_triggers || []).map(
                                    (trigger) => {
                                      const deleteKey = `editLore:on:${trigger}`;
                                      const isPending =
                                        pendingTagDelete === deleteKey;
                                      return (
                                        <span
                                          key={trigger}
                                          className={`px-2 py-1 rounded-full text-sm flex items-center gap-1 transition-colors ${
                                            isPending
                                              ? "bg-red-900/50 text-red-300"
                                              : "bg-green-900/30 text-green-300"
                                          }`}
                                        >
                                          <DynamicIcon
                                            name="Check"
                                            className="w-3 h-3"
                                          />{" "}
                                          {trigger}
                                          <button
                                            onClick={() => {
                                              if (isPending) {
                                                setEditLore({
                                                  ...editLore,
                                                  on_triggers: (
                                                    editLore.on_triggers || []
                                                  ).filter(
                                                    (t) => t !== trigger,
                                                  ),
                                                });
                                                setPendingTagDelete(null);
                                              } else {
                                                setPendingTagDelete(deleteKey);
                                              }
                                            }}
                                            onBlur={() =>
                                              setTimeout(
                                                () => setPendingTagDelete(null),
                                                200,
                                              )
                                            }
                                            className={`ml-1 transition-colors ${
                                              isPending
                                                ? "text-red-400 hover:text-red-200"
                                                : "text-green-400 hover:text-green-200"
                                            }`}
                                            title={
                                              isPending
                                                ? "Click again to remove"
                                                : "Click to remove"
                                            }
                                          >
                                            <DynamicIcon
                                              name="X"
                                              className="w-3 h-3"
                                            />
                                          </button>
                                        </span>
                                      );
                                    },
                                  )}
                                </div>
                              </div>
                              <div>
                                <label className="text-sm font-semibold text-blue-200 mb-1 flex items-center gap-1">
                                  <DynamicIcon
                                    name="XCircle"
                                    className="w-4 h-4 text-red-600"
                                  />{" "}
                                  OFF Triggers
                                </label>
                                <div className="flex gap-2 mb-2">
                                  <input
                                    type="text"
                                    value={editLoreOffTrigger}
                                    onChange={(e) =>
                                      setEditLoreOffTrigger(e.target.value)
                                    }
                                    onKeyDown={(e) =>
                                      e.key === "Enter" &&
                                      (e.preventDefault(),
                                      addEditLoreOffTrigger())
                                    }
                                    placeholder="e.g., Destroyed the Map"
                                    className="flex-1 px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                                  />
                                  <button
                                    onClick={addEditLoreOffTrigger}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm"
                                  >
                                    Add
                                  </button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {(editLore.off_triggers || []).map(
                                    (trigger) => {
                                      const deleteKey = `editLore:off:${trigger}`;
                                      const isPending =
                                        pendingTagDelete === deleteKey;
                                      return (
                                        <span
                                          key={trigger}
                                          className={`px-2 py-1 rounded-full text-sm flex items-center gap-1 transition-colors ${
                                            isPending
                                              ? "bg-red-700/50 text-red-200 ring-2 ring-red-500"
                                              : "bg-red-900/30 text-red-300"
                                          }`}
                                        >
                                          <DynamicIcon
                                            name="X"
                                            className="w-3 h-3"
                                          />{" "}
                                          {trigger}
                                          <button
                                            onClick={() => {
                                              if (isPending) {
                                                setEditLore({
                                                  ...editLore,
                                                  off_triggers: (
                                                    editLore.off_triggers || []
                                                  ).filter(
                                                    (t) => t !== trigger,
                                                  ),
                                                });
                                                setPendingTagDelete(null);
                                              } else {
                                                setPendingTagDelete(deleteKey);
                                              }
                                            }}
                                            onBlur={() =>
                                              setTimeout(
                                                () => setPendingTagDelete(null),
                                                200,
                                              )
                                            }
                                            className={`ml-1 transition-colors ${
                                              isPending
                                                ? "text-red-200 hover:text-white"
                                                : "text-red-400 hover:text-red-200"
                                            }`}
                                            title={
                                              isPending
                                                ? "Click again to remove"
                                                : "Click to remove"
                                            }
                                          >
                                            <DynamicIcon
                                              name="X"
                                              className="w-3 h-3"
                                            />
                                          </button>
                                        </span>
                                      );
                                    },
                                  )}
                                </div>
                              </div>

                              {/* Advanced Triggers Section (Expandable) */}
                              <div className="border border-blue-700/40 rounded-lg">
                                <button
                                  onClick={() =>
                                    setEditLoreAdvancedExpanded(
                                      !editLoreAdvancedExpanded,
                                    )
                                  }
                                  className="w-full px-4 py-3 flex items-center justify-between bg-blue-900/20 hover:bg-blue-800/30 rounded-lg transition-colors"
                                >
                                  <span className="text-sm font-semibold text-blue-200 flex items-center gap-2">
                                    <DynamicIcon
                                      name="Settings"
                                      className="w-4 h-4"
                                    />{" "}
                                    Advanced Section
                                  </span>
                                  <span className="text-blue-300/50">
                                    <DynamicIcon
                                      name={
                                        editLoreAdvancedExpanded
                                          ? "ChevronUp"
                                          : "ChevronDown"
                                      }
                                      className="w-4 h-4"
                                    />
                                  </span>
                                </button>

                                {editLoreAdvancedExpanded && (
                                  <div className="p-4 space-y-4">
                                    {/* Lore-based Triggers */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      <div>
                                        <label className="text-sm font-semibold text-blue-200 mb-2 flex items-center gap-1">
                                          <DynamicIcon
                                            name="CheckCircle"
                                            className="w-4 h-4 text-green-600"
                                          />{" "}
                                          Lores that turn this ON
                                        </label>
                                        <div className="max-h-40 overflow-y-auto border border-blue-700/40 rounded-lg p-2 bg-blue-900/20">
                                          {lore.filter((_, i) => i !== index)
                                            .length === 0 ? (
                                            <p className="text-xs text-blue-300/50 italic">
                                              No other lore entries yet.
                                            </p>
                                          ) : (
                                            lore
                                              .filter((_, i) => i !== index)
                                              .map((loreEntry, loreIndex) => (
                                                <label
                                                  key={loreIndex}
                                                  className="flex items-center gap-2 px-2 py-1 hover:bg-blue-800/40 rounded cursor-pointer"
                                                >
                                                  <input
                                                    type="checkbox"
                                                    checked={(
                                                      editLore.trigger_lores ||
                                                      []
                                                    ).includes(loreEntry.title)}
                                                    onChange={(e) => {
                                                      const current =
                                                        editLore.trigger_lores ||
                                                        [];
                                                      setEditLore({
                                                        ...editLore,
                                                        trigger_lores: e.target
                                                          .checked
                                                          ? [
                                                              ...current,
                                                              loreEntry.title,
                                                            ]
                                                          : current.filter(
                                                              (t) =>
                                                                t !==
                                                                loreEntry.title,
                                                            ),
                                                      });
                                                    }}
                                                    className="w-4 h-4 text-green-600 rounded"
                                                  />
                                                  <span className="text-xs text-white">
                                                    {loreEntry.title}
                                                  </span>
                                                </label>
                                              ))
                                          )}
                                        </div>
                                      </div>
                                      <div>
                                        <label className="text-sm font-semibold text-blue-200 mb-2 flex items-center gap-1">
                                          <DynamicIcon
                                            name="XCircle"
                                            className="w-4 h-4 text-red-600"
                                          />{" "}
                                          Lores that turn this OFF
                                        </label>
                                        <div className="max-h-40 overflow-y-auto border border-blue-700/40 rounded-lg p-2 bg-blue-900/20">
                                          {lore.filter((_, i) => i !== index)
                                            .length === 0 ? (
                                            <p className="text-xs text-blue-300/50 italic">
                                              No other lore entries yet.
                                            </p>
                                          ) : (
                                            lore
                                              .filter((_, i) => i !== index)
                                              .map((loreEntry, loreIndex) => (
                                                <label
                                                  key={loreIndex}
                                                  className="flex items-center gap-2 px-2 py-1 hover:bg-blue-800/40 rounded cursor-pointer"
                                                >
                                                  <input
                                                    type="checkbox"
                                                    checked={(
                                                      editLore.untrigger_lores ||
                                                      []
                                                    ).includes(loreEntry.title)}
                                                    onChange={(e) => {
                                                      const current =
                                                        editLore.untrigger_lores ||
                                                        [];
                                                      setEditLore({
                                                        ...editLore,
                                                        untrigger_lores: e
                                                          .target.checked
                                                          ? [
                                                              ...current,
                                                              loreEntry.title,
                                                            ]
                                                          : current.filter(
                                                              (t) =>
                                                                t !==
                                                                loreEntry.title,
                                                            ),
                                                      });
                                                    }}
                                                    className="w-4 h-4 text-red-600 rounded"
                                                  />
                                                  <span className="text-xs text-white">
                                                    {loreEntry.title}
                                                  </span>
                                                </label>
                                              ))
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    {editLore.secrtet && (
                                      <div>
                                        <label className="text-sm font-semibold text-blue-200 mb-1 flex items-center gap-1">
                                          <DynamicIcon
                                            name="Key"
                                            className="w-4 h-4"
                                          />{" "}
                                          Trigger Keys
                                        </label>
                                        <div className="flex gap-2 mb-2">
                                          <input
                                            type="text"
                                            value={editLoreKey}
                                            onChange={(e) =>
                                              setEditLoreKey(e.target.value)
                                            }
                                            onKeyDown={(e) =>
                                              e.key === "Enter" &&
                                              (e.preventDefault(),
                                              addEditLoreKey())
                                            }
                                            placeholder="e.g., Dragon Defeated"
                                            className="flex-1 px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                                          />
                                          <button
                                            onClick={addEditLoreKey}
                                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm"
                                          >
                                            Add
                                          </button>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                          {(editLore.keys || []).map((key) => {
                                            const deleteKey = `editLore:key:${key}`;
                                            const isPending =
                                              pendingTagDelete === deleteKey;
                                            return (
                                              <span
                                                key={key}
                                                className={`px-2 py-1 rounded-full text-sm flex items-center gap-1 transition-colors ${
                                                  isPending
                                                    ? "bg-red-900/50 text-red-300"
                                                    : "bg-yellow-900/30 text-yellow-300"
                                                }`}
                                              >
                                                <DynamicIcon
                                                  name="Key"
                                                  className="w-3 h-3"
                                                />{" "}
                                                {key}
                                                <button
                                                  onClick={() => {
                                                    if (isPending) {
                                                      setEditLore({
                                                        ...editLore,
                                                        keys: (
                                                          editLore.keys || []
                                                        ).filter(
                                                          (k) => k !== key,
                                                        ),
                                                      });
                                                      setPendingTagDelete(null);
                                                    } else {
                                                      setPendingTagDelete(
                                                        deleteKey,
                                                      );
                                                    }
                                                  }}
                                                  onBlur={() =>
                                                    setTimeout(
                                                      () =>
                                                        setPendingTagDelete(
                                                          null,
                                                        ),
                                                      200,
                                                    )
                                                  }
                                                  className={`ml-1 transition-colors ${
                                                    isPending
                                                      ? "text-red-400 hover:text-red-200"
                                                      : "text-yellow-400 hover:text-yellow-200"
                                                  }`}
                                                  title={
                                                    isPending
                                                      ? "Click again to remove"
                                                      : "Click to remove"
                                                  }
                                                >
                                                  <DynamicIcon
                                                    name="X"
                                                    className="w-3 h-3"
                                                  />
                                                </button>
                                              </span>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}

                                    {/* Variable Triggers (Boolean) */}
                                    {variables.filter(
                                      (v) => v.type === "boolean",
                                    ).length > 0 && (
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                          <label className="text-sm font-semibold text-blue-200 mb-2 flex items-center gap-1">
                                            <DynamicIcon
                                              name="ToggleRight"
                                              className="w-4 h-4 text-cyan-500"
                                            />{" "}
                                            Variables that turn this ON (when
                                            true)
                                          </label>
                                          <div className="max-h-40 overflow-y-auto border border-blue-700/40 rounded-lg p-2 bg-blue-900/20">
                                            {variables
                                              .filter(
                                                (v) => v.type === "boolean",
                                              )
                                              .map((variable) => (
                                                <label
                                                  key={variable.id}
                                                  className="flex items-center gap-2 px-2 py-1 hover:bg-blue-800/40 rounded cursor-pointer"
                                                >
                                                  <input
                                                    type="checkbox"
                                                    checked={(
                                                      editLore.var_on_triggers ||
                                                      []
                                                    ).includes(variable.name)}
                                                    onChange={(e) => {
                                                      const current =
                                                        editLore.var_on_triggers ||
                                                        [];
                                                      setEditLore({
                                                        ...editLore,
                                                        var_on_triggers: e
                                                          .target.checked
                                                          ? [
                                                              ...current,
                                                              variable.name,
                                                            ]
                                                          : current.filter(
                                                              (n) =>
                                                                n !==
                                                                variable.name,
                                                            ),
                                                      });
                                                    }}
                                                    className="w-4 h-4 text-cyan-600 rounded"
                                                  />
                                                  <span className="text-xs text-white">
                                                    {variable.name}
                                                  </span>
                                                </label>
                                              ))}
                                          </div>
                                        </div>
                                        <div>
                                          <label className="text-sm font-semibold text-blue-200 mb-2 flex items-center gap-1">
                                            <DynamicIcon
                                              name="ToggleLeft"
                                              className="w-4 h-4 text-orange-500"
                                            />{" "}
                                            Variables that turn this OFF (when
                                            true)
                                          </label>
                                          <div className="max-h-40 overflow-y-auto border border-blue-700/40 rounded-lg p-2 bg-blue-900/20">
                                            {variables
                                              .filter(
                                                (v) => v.type === "boolean",
                                              )
                                              .map((variable) => (
                                                <label
                                                  key={variable.id}
                                                  className="flex items-center gap-2 px-2 py-1 hover:bg-blue-800/40 rounded cursor-pointer"
                                                >
                                                  <input
                                                    type="checkbox"
                                                    checked={(
                                                      editLore.var_off_triggers ||
                                                      []
                                                    ).includes(variable.name)}
                                                    onChange={(e) => {
                                                      const current =
                                                        editLore.var_off_triggers ||
                                                        [];
                                                      setEditLore({
                                                        ...editLore,
                                                        var_off_triggers: e
                                                          .target.checked
                                                          ? [
                                                              ...current,
                                                              variable.name,
                                                            ]
                                                          : current.filter(
                                                              (n) =>
                                                                n !==
                                                                variable.name,
                                                            ),
                                                      });
                                                    }}
                                                    className="w-4 h-4 text-orange-600 rounded"
                                                  />
                                                  <span className="text-xs text-white">
                                                    {variable.name}
                                                  </span>
                                                </label>
                                              ))}
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-2 pt-2">
                                <button
                                  onClick={saveEditLore}
                                  disabled={
                                    !editLore.title || !editLore.content
                                  }
                                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg"
                                >
                                  <DynamicIcon
                                    name="Check"
                                    className="inline-block w-4 h-4 mr-1"
                                  />
                                  Save Changes
                                </button>
                                <button
                                  onClick={cancelEditLore}
                                  className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            // View mode with drag-and-drop
                            <div className="flex items-start justify-between">
                              <div className="text-blue-400/50 cursor-grab active:cursor-grabbing mr-3 mt-1">
                                <DynamicIcon
                                  name="GripVertical"
                                  className="w-5 h-5"
                                />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <div className="font-bold text-white">
                                    {entry.title}
                                  </div>
                                  {entry.secrtet && (
                                    <span className="text-xs px-2 py-0.5 bg-yellow-900/30 text-yellow-300 rounded-full">
                                      <DynamicIcon
                                        name="Lock"
                                        className="inline-block w-3 h-3 mr-1"
                                      />
                                      Hidden
                                    </span>
                                  )}
                                  {/* On/Off Toggle */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const updated = [...lore];
                                      updated[index] = {
                                        ...entry,
                                        on: !entry.on,
                                      };
                                      setLore(updated);
                                    }}
                                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                                      entry.on
                                        ? "bg-green-600 text-white hover:bg-green-700"
                                        : "bg-gray-400 text-white hover:bg-gray-500"
                                    }`}
                                    title={
                                      entry.on
                                        ? "Note is enabled"
                                        : "Note is disabled"
                                    }
                                  >
                                    {entry.on ? "ON" : "OFF"}
                                  </button>
                                </div>
                                {entry.thumbnailUrl && (
                                  <img
                                    src={entry.thumbnailUrl}
                                    alt="Note thumb"
                                    className="w-24 h-24 object-cover rounded border mb-2"
                                  />
                                )}
                                <div className="text-sm text-blue-300/60 mb-2">
                                  {entry.content}
                                </div>
                                {entry.on_triggers &&
                                  entry.on_triggers.length > 0 && (
                                    <div className="text-xs text-green-400 mb-1">
                                      <strong>
                                        <DynamicIcon
                                          name="CheckCircle"
                                          className="inline-block w-3 h-3 mr-1"
                                        />
                                        ON Triggers:
                                      </strong>{" "}
                                      {entry.on_triggers.join(", ")}
                                    </div>
                                  )}
                                {entry.off_triggers &&
                                  entry.off_triggers.length > 0 && (
                                    <div className="text-xs text-red-400 mb-1">
                                      <strong>
                                        <DynamicIcon
                                          name="XCircle"
                                          className="inline-block w-3 h-3 mr-1"
                                        />
                                        OFF Triggers:
                                      </strong>{" "}
                                      {entry.off_triggers.join(", ")}
                                    </div>
                                  )}
                                {entry.secrtet &&
                                  entry.keys &&
                                  entry.keys.length > 0 && (
                                    <div className="text-xs text-yellow-400">
                                      <strong>Triggers:</strong>{" "}
                                      {entry.keys.join(", ")}
                                    </div>
                                  )}
                                {entry.var_on_triggers &&
                                  entry.var_on_triggers.length > 0 && (
                                    <div className="text-xs text-cyan-400 mb-1">
                                      <strong>
                                        <DynamicIcon
                                          name="ToggleRight"
                                          className="inline-block w-3 h-3 mr-1"
                                        />
                                        Vars turning ON:
                                      </strong>{" "}
                                      {entry.var_on_triggers.join(", ")}
                                    </div>
                                  )}
                                {entry.var_off_triggers &&
                                  entry.var_off_triggers.length > 0 && (
                                    <div className="text-xs text-orange-400 mb-1">
                                      <strong>
                                        <DynamicIcon
                                          name="ToggleLeft"
                                          className="inline-block w-3 h-3 mr-1"
                                        />
                                        Vars turning OFF:
                                      </strong>{" "}
                                      {entry.var_off_triggers.join(", ")}
                                    </div>
                                  )}
                                {/* Folder and Tags display */}
                                {(entry.folder ||
                                  (entry.tags && entry.tags.length > 0)) && (
                                  <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-blue-700/30">
                                    {entry.folder && (
                                      <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-900/30 text-yellow-300 flex items-center gap-1">
                                        <DynamicIcon
                                          name="Folder"
                                          className="w-3 h-3"
                                        />
                                        {entry.folder}
                                      </span>
                                    )}
                                    {(entry.tags || []).map((tag) => (
                                      <span
                                        key={tag}
                                        className="px-2 py-0.5 rounded-full text-xs bg-purple-900/30 text-purple-300 flex items-center gap-1"
                                      >
                                        <DynamicIcon
                                          name="Tag"
                                          className="w-3 h-3"
                                        />
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-col items-center  gap-2 ml-3">
                                {/* Reordering disabled in sorted view */}
                                <div className="flex flex-row items-center gap-1 ml-3">
                                  <button
                                    onClick={() => startEditLore(index)}
                                    className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors text-sm"
                                  >
                                    <DynamicIcon
                                      name="Edit"
                                      className="w-4 h-4"
                                    />
                                  </button>
                                  <button
                                    onClick={() => removeLore(index)}
                                    className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
                                  >
                                    <DynamicIcon
                                      name="Trash2"
                                      className="w-4 h-4"
                                    />
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-4 mt-4">
                          <button
                            onClick={() =>
                              setLorePage((p) => Math.max(1, p - 1))
                            }
                            disabled={lorePage === 1}
                            className="px-3 py-1 bg-blue-900/30 hover:bg-blue-800/40 rounded disabled:opacity-50 text-sm"
                          >
                            Previous
                          </button>
                          <span className="text-sm text-blue-300">
                            Page {lorePage} of {totalPages}
                          </span>
                          <button
                            onClick={() =>
                              setLorePage((p) => Math.min(totalPages, p + 1))
                            }
                            disabled={lorePage === totalPages}
                            className="px-3 py-1 bg-blue-900/30 hover:bg-blue-800/40 rounded disabled:opacity-50 text-sm"
                          >
                            Next
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()
              )}
            </div>
          </div>
        );

      case "achievements":
        return (
          <div className="space-y-6">
            <div className="bg-amber-900/20 border border-amber-800/50 rounded-lg p-4">
              <p className="text-sm text-blue-300">
                <DynamicIcon
                  name="Lightbulb"
                  className="inline-block w-4 h-4 mr-1 text-amber-600"
                />
                <strong>Tip:</strong> Achievements reward players for completing
                specific goals or milestones (optional).
              </p>
            </div>

            <div className="bg-blue-900/20 rounded-lg border border-blue-700/40 p-6">
              <h3 className="text-lg font-bold mb-4 text-white">
                Add Achievement
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={newAchievement.title}
                    onChange={(e) =>
                      setNewAchievement({
                        ...newAchievement,
                        title: e.target.value,
                      })
                    }
                    placeholder="e.g., Dragon Slayer"
                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Icon
                  </label>
                  <IconPicker
                    value={newAchievement.symbol || "Trophy"}
                    onChange={(icon) =>
                      setNewAchievement({ ...newAchievement, symbol: icon })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Points
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={newAchievement.points}
                    onChange={(e) =>
                      setNewAchievement({
                        ...newAchievement,
                        points: clampNumber(parseInt(e.target.value), 1, 1000),
                      })
                    }
                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Description *{" "}
                    <span className="text-xs text-gray-500">
                      (shown to players)
                    </span>
                  </label>
                  <input
                    type="text"
                    value={newAchievement.description}
                    onChange={(e) =>
                      setNewAchievement({
                        ...newAchievement,
                        description: e.target.value,
                      })
                    }
                    placeholder="e.g., Defeat your first dragon"
                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    AI Hint{" "}
                    <span className="text-xs text-gray-500">
                      (optional, for precise triggering)
                    </span>
                  </label>
                  <input
                    type="text"
                    value={newAchievement.ai_hint || ""}
                    onChange={(e) =>
                      setNewAchievement({
                        ...newAchievement,
                        ai_hint: e.target.value,
                      })
                    }
                    placeholder="e.g., Trigger when player defeats the red dragon in the mountain lair"
                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                  />
                  <p className="text-xs text-blue-300/50 mt-1">
                    <DynamicIcon
                      name="Lightbulb"
                      className="inline-block w-3 h-3 mr-1 text-amber-600"
                    />
                    Keep player description vague to encourage discovery; use AI
                    hint for exact trigger conditions.
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newAchievement.hidden || false}
                      onChange={(e) =>
                        setNewAchievement({
                          ...newAchievement,
                          hidden: e.target.checked,
                        })
                      }
                      className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500"
                    />
                    <span className="text-sm font-semibold text-blue-200">
                      <DynamicIcon
                        name="Lock"
                        className="inline-block w-3 h-3 mr-1"
                      />
                      Hidden Achievement
                    </span>
                  </label>
                  <p className="text-xs text-blue-300/50 mt-1 ml-6">
                    Hidden from player but visible to AI for triggering. Players
                    discover these through gameplay.
                  </p>
                </div>
              </div>
              <button
                onClick={addAchievement}
                disabled={!newAchievement.title || !newAchievement.description}
                className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
              >
                Add Achievement
              </button>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">
                Achievements ({achievements.length})
              </h3>
              {achievements.length === 0 ? (
                <p className="text-blue-300/60 text-sm">
                  No achievements added yet
                </p>
              ) : (
                achievements.map((achievement, index) =>
                  editingAchievementIndex === index ? (
                    // Edit mode
                    <div
                      key={index}
                      className="p-4 bg-amber-900/40 rounded-lg border-2 border-amber-600"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="block text-xs font-semibold text-blue-300 mb-1">
                            Title *
                          </label>
                          <input
                            type="text"
                            value={editAchievement.title || ""}
                            onChange={(e) =>
                              setEditAchievement({
                                ...editAchievement,
                                title: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/20 text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-blue-300 mb-1">
                            Icon
                          </label>
                          <IconPicker
                            value={editAchievement.symbol || "Trophy"}
                            onChange={(icon) =>
                              setEditAchievement({
                                ...editAchievement,
                                symbol: icon,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-blue-300 mb-1">
                            Points
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="1000"
                            value={editAchievement.points || 10}
                            onChange={(e) =>
                              setEditAchievement({
                                ...editAchievement,
                                points: clampNumber(
                                  parseInt(e.target.value),
                                  1,
                                  1000,
                                ),
                              })
                            }
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/20 text-white text-sm"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-blue-300 mb-1">
                            Description *{" "}
                            <span className="text-xs text-gray-500">
                              (shown to players)
                            </span>
                          </label>
                          <input
                            type="text"
                            value={editAchievement.description || ""}
                            onChange={(e) =>
                              setEditAchievement({
                                ...editAchievement,
                                description: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/20 text-white text-sm"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-blue-300 mb-1">
                            AI Hint{" "}
                            <span className="text-xs text-gray-500">
                              (optional)
                            </span>
                          </label>
                          <input
                            type="text"
                            value={editAchievement.ai_hint || ""}
                            onChange={(e) =>
                              setEditAchievement({
                                ...editAchievement,
                                ai_hint: e.target.value,
                              })
                            }
                            placeholder="Precise trigger conditions for AI"
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/20 text-white text-sm"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editAchievement.hidden || false}
                              onChange={(e) =>
                                setEditAchievement({
                                  ...editAchievement,
                                  hidden: e.target.checked,
                                })
                              }
                              className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500"
                            />
                            <span className="text-xs font-semibold text-blue-300">
                              <DynamicIcon
                                name="Lock"
                                className="inline-block w-3 h-3 mr-1"
                              />
                              Hidden Achievement
                            </span>
                          </label>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={saveEditAchievement}
                          disabled={
                            !editAchievement.title ||
                            !editAchievement.description
                          }
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors text-sm"
                        >
                          <DynamicIcon
                            name="Save"
                            className="inline-block w-4 h-4 mr-1"
                          />
                          Save
                        </button>
                        <button
                          onClick={cancelEditAchievement}
                          className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    // View mode with drag-and-drop
                    <div
                      key={index}
                      draggable
                      onDragStart={() => handleAchievementDragStart(index)}
                      onDragOver={(e) => handleAchievementDragOver(e, index)}
                      onDragEnd={handleAchievementDragEnd}
                      className="flex items-center gap-3 p-4 bg-amber-900/20 rounded-lg border border-amber-800/50 cursor-move hover:bg-amber-800/30 transition-colors"
                      style={{
                        opacity: draggedAchievementIndex === index ? 0.5 : 1,
                      }}
                    >
                      <div className="text-blue-400/50 cursor-grab active:cursor-grabbing">
                        <DynamicIcon name="GripVertical" className="w-5 h-5" />
                      </div>
                      <div className="p-2 bg-blue-900/20 rounded-lg border border-blue-800/30">
                        <DynamicIcon
                          name={achievement.symbol || "Trophy"}
                          className="w-8 h-8 text-amber-400"
                        />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div className="font-bold text-white">
                            {achievement.title}
                          </div>
                          {achievement.hidden && (
                            <span className="px-2 py-0.5 bg-purple-800/50 text-purple-200 rounded-full text-xs font-bold flex items-center gap-1">
                              <DynamicIcon name="Lock" className="w-3 h-3" />{" "}
                              Hidden
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-blue-300/60">
                          {achievement.description}
                        </div>
                        <div className="text-sm text-amber-400 font-semibold">
                          {achievement.points} points
                        </div>
                      </div>
                      <div className="flex flex-col items-center gap-2">
                        <div className="flex flex-row items-center gap-1">
                          <button
                            onClick={() => moveAchievementUp(index)}
                            disabled={index === 0}
                            className="w-8 h-8 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded transition-colors text-sm"
                            title="Move up"
                          >
                            <DynamicIcon name="ChevronUp" className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => moveAchievementDown(index)}
                            disabled={index === achievements.length - 1}
                            className="w-8 h-8 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded transition-colors text-sm"
                            title="Move down"
                          >
                            <DynamicIcon
                              name="ChevronDown"
                              className="w-4 h-4"
                            />
                          </button>
                        </div>
                        <div className="flex flex-row items-center gap-1">
                          <button
                            onClick={() => startEditAchievement(index)}
                            className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors text-sm"
                          >
                            <DynamicIcon name="Edit2" className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => removeAchievement(index)}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
                          >
                            <DynamicIcon name="Trash2" className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ),
                )
              )}
            </div>
          </div>
        );

      case "quests":
        return (
          <div className="space-y-6">
            <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-4">
              <p className="text-sm text-blue-300 flex items-start gap-2">
                <DynamicIcon
                  name="Lightbulb"
                  className="w-5 h-5 text-blue-600 shrink-0 mt-0.5"
                />
                <span>
                  <strong>Tip:</strong> Quests provide structured objectives for
                  players. They can be created upfront or generated dynamically
                  by the AI during gameplay.
                </span>
              </p>
            </div>

            <div className="bg-blue-900/20 rounded-lg border border-blue-700/40 p-6">
              <h3 className="text-lg font-bold mb-4 text-white">Add Quest</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={newQuest.title}
                    onChange={(e) =>
                      setNewQuest({
                        ...newQuest,
                        title: e.target.value,
                      })
                    }
                    placeholder="e.g., Find the Lost Artifact"
                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Short Description *
                  </label>
                  <input
                    type="text"
                    value={newQuest.shortDescription}
                    onChange={(e) =>
                      setNewQuest({
                        ...newQuest,
                        shortDescription: e.target.value,
                      })
                    }
                    placeholder="e.g., Recover the ancient relic from the temple"
                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Full Description *
                  </label>
                  <textarea
                    value={newQuest.description}
                    onChange={(e) =>
                      setNewQuest({
                        ...newQuest,
                        description: e.target.value,
                      })
                    }
                    placeholder="Detailed quest description with context and objectives..."
                    rows={3}
                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Points Reward
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={newQuest.points}
                    onChange={(e) =>
                      setNewQuest({
                        ...newQuest,
                        points: clampNumber(parseInt(e.target.value), 1, 1000),
                      })
                    }
                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                  />
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newQuest.active}
                      onChange={(e) =>
                        setNewQuest({
                          ...newQuest,
                          active: e.target.checked,
                        })
                      }
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm font-semibold text-blue-200">
                      Active
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newQuest.fulfilled}
                      onChange={(e) =>
                        setNewQuest({
                          ...newQuest,
                          fulfilled: e.target.checked,
                        })
                      }
                      className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500"
                    />
                    <span className="text-sm font-semibold text-blue-200">
                      Fulfilled
                    </span>
                  </label>
                </div>
              </div>
              <button
                onClick={() => {
                  if (
                    !newQuest.title ||
                    !newQuest.shortDescription ||
                    !newQuest.description
                  ) {
                    addNotification(
                      "Please fill in all required fields",
                      "warning",
                    );
                    return;
                  }
                  const quest: Quest = {
                    id: Date.now().toString(),
                    title: newQuest.title,
                    shortDescription: newQuest.shortDescription,
                    description: newQuest.description,
                    active: newQuest.active ?? true,
                    fulfilled: newQuest.fulfilled ?? false,
                    points: newQuest.points ?? 10,
                    createdAt: new Date(),
                  };
                  setQuests([...quests, quest]);
                  setNewQuest({
                    title: "",
                    shortDescription: "",
                    description: "",
                    active: true,
                    fulfilled: false,
                    points: 10,
                  });
                  addNotification("Quest added!", "success");
                }}
                disabled={
                  !newQuest.title ||
                  !newQuest.shortDescription ||
                  !newQuest.description
                }
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
              >
                Add Quest
              </button>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">
                Quests ({quests.length})
              </h3>
              {quests.length === 0 ? (
                <p className="text-blue-300/60 text-sm">No quests added yet</p>
              ) : (
                quests.map((quest, index) =>
                  editingQuestIndex === index ? (
                    // Edit mode
                    <div
                      key={quest.id}
                      className="p-4 bg-blue-900/40 rounded-lg border-2 border-blue-600"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-blue-300 mb-1">
                            Title *
                          </label>
                          <input
                            type="text"
                            value={editQuest.title || ""}
                            onChange={(e) =>
                              setEditQuest({
                                ...editQuest,
                                title: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/20 text-white text-sm"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-blue-300 mb-1">
                            Short Description *
                          </label>
                          <input
                            type="text"
                            value={editQuest.shortDescription || ""}
                            onChange={(e) =>
                              setEditQuest({
                                ...editQuest,
                                shortDescription: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/20 text-white text-sm"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-blue-300 mb-1">
                            Full Description *
                          </label>
                          <textarea
                            value={editQuest.description || ""}
                            onChange={(e) =>
                              setEditQuest({
                                ...editQuest,
                                description: e.target.value,
                              })
                            }
                            rows={3}
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/20 text-white text-sm resize-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-blue-300 mb-1">
                            Points
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="1000"
                            value={editQuest.points || 10}
                            onChange={(e) =>
                              setEditQuest({
                                ...editQuest,
                                points: clampNumber(
                                  parseInt(e.target.value),
                                  1,
                                  1000,
                                ),
                              })
                            }
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/20 text-white text-sm"
                          />
                        </div>
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editQuest.active || false}
                              onChange={(e) =>
                                setEditQuest({
                                  ...editQuest,
                                  active: e.target.checked,
                                })
                              }
                              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-xs font-semibold text-blue-300">
                              Active
                            </span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editQuest.fulfilled || false}
                              onChange={(e) =>
                                setEditQuest({
                                  ...editQuest,
                                  fulfilled: e.target.checked,
                                })
                              }
                              className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500"
                            />
                            <span className="text-xs font-semibold text-blue-300">
                              Fulfilled
                            </span>
                          </label>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            if (
                              !editQuest.title ||
                              !editQuest.shortDescription ||
                              !editQuest.description
                            ) {
                              addNotification(
                                "Please fill in all required fields",
                                "warning",
                              );
                              return;
                            }
                            const updated = [...quests];
                            updated[editingQuestIndex] = editQuest as Quest;
                            setQuests(updated);
                            setEditingQuestIndex(null);
                            setEditQuest({});
                            addNotification("Quest updated!", "success");
                          }}
                          disabled={
                            !editQuest.title ||
                            !editQuest.shortDescription ||
                            !editQuest.description
                          }
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors text-sm"
                        >
                          <DynamicIcon
                            name="Save"
                            className="inline-block w-4 h-4 mr-1"
                          />
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingQuestIndex(null);
                            setEditQuest({});
                          }}
                          className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    // View mode with drag-and-drop
                    <div
                      key={quest.id || `quest-${index}`}
                      draggable
                      onDragStart={() => setDraggedQuestIndex(index)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (
                          draggedQuestIndex !== null &&
                          draggedQuestIndex !== index
                        ) {
                          const updated = [...quests];
                          const [dragged] = updated.splice(
                            draggedQuestIndex,
                            1,
                          );
                          updated.splice(index, 0, dragged);
                          setQuests(updated);
                          setDraggedQuestIndex(index);
                        }
                      }}
                      onDragEnd={() => setDraggedQuestIndex(null)}
                      className="flex items-start gap-3 p-4 bg-blue-900/20 rounded-lg border border-blue-800/50 cursor-move hover:bg-blue-800/30 transition-colors"
                      style={{
                        opacity: draggedQuestIndex === index ? 0.5 : 1,
                      }}
                    >
                      <div className="text-blue-400/50 cursor-grab active:cursor-grabbing">
                        <DynamicIcon name="GripVertical" className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="font-bold text-white">
                            {quest.title}
                          </div>
                          {quest.active && (
                            <span className="px-2 py-0.5 bg-blue-800/50 text-blue-200 rounded-full text-xs font-bold">
                              Active
                            </span>
                          )}
                          {quest.fulfilled && (
                            <span className="px-2 py-0.5 bg-green-800/50 text-green-200 rounded-full text-xs font-bold">
                              Fulfilled
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-blue-300/60 mb-1">
                          {quest.shortDescription}
                        </div>
                        <div className="text-xs text-blue-300/50 mb-2">
                          {quest.description}
                        </div>
                        <div className="text-sm text-blue-400 font-semibold">
                          {quest.points} points
                        </div>
                      </div>
                      <div className="flex flex-col items-center  gap-2 ml-3">
                        <div className="flex flex-row items-center gap-1 ml-3">
                          <button
                            onClick={() => {
                              if (index === 0) return;
                              const updated = [...quests];
                              [updated[index - 1], updated[index]] = [
                                updated[index],
                                updated[index - 1],
                              ];
                              setQuests(updated);
                            }}
                            disabled={index === 0}
                            className="w-8 h-8 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded transition-colors text-sm"
                            title="Move up"
                          >
                            <DynamicIcon name="ChevronUp" className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => {
                              if (index === quests.length - 1) return;
                              const updated = [...quests];
                              [updated[index + 1], updated[index]] = [
                                updated[index],
                                updated[index + 1],
                              ];
                              setQuests(updated);
                            }}
                            disabled={index === quests.length - 1}
                            className="w-8 h-8 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded transition-colors text-sm"
                            title="Move down"
                          >
                            <DynamicIcon
                              name="ChevronDown"
                              className="w-5 h-5"
                            />
                          </button>
                        </div>
                        <div className="flex flex-row items-center gap-1 ml-3">
                          <button
                            onClick={() => {
                              setEditingQuestIndex(index);
                              setEditQuest({ ...quest });
                            }}
                            className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors text-sm"
                          >
                            <DynamicIcon name="Edit" className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setConfirmDialog({
                                isOpen: true,
                                title: "Remove Quest?",
                                message: `Remove quest "${quest.title}"? This cannot be undone.`,
                                icon: "Trash2",
                                confirmText: "Remove",
                                confirmButtonClass:
                                  "bg-red-600 hover:bg-red-700",
                                onConfirm: () => {
                                  setConfirmDialog({
                                    ...confirmDialog,
                                    isOpen: false,
                                  });
                                  setQuests(
                                    quests.filter((_, i) => i !== index),
                                  );
                                  addNotification("Quest removed", "success");
                                },
                              });
                            }}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
                          >
                            <DynamicIcon name="Trash2" className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ),
                )
              )}
            </div>
          </div>
        );

      case "npcs":
        return (
          <div className="space-y-6">
            <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-4">
              <p className="text-sm text-blue-300 flex items-start gap-2">
                <DynamicIcon
                  name="Lightbulb"
                  className="w-5 h-5 text-blue-600 shrink-0 mt-0.5"
                />
                <span>
                  <strong>Tip:</strong> NPCs (Non-Player Characters) are the
                  characters players will interact with. Define key NPCs
                  upfront, and the AI can introduce more during gameplay.
                </span>
              </p>
            </div>

            <div className="bg-blue-900/20 rounded-lg border border-blue-700/40 p-6">
              <h3 className="text-lg font-bold mb-4 text-white">Add NPC</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                {/* Name and Icon */}
                <div className="sm:col-span-2 flex gap-3">
                  <div className="shrink-0 relative">
                    <button
                      onClick={() => setShowNPCIconPicker(!showNPCIconPicker)}
                      className="w-14 h-14 rounded-lg bg-blue-800/50 border border-blue-600/50 flex items-center justify-center hover:bg-blue-700/50 transition-colors"
                      title="Change icon"
                    >
                      <DynamicIcon
                        name={newNPC.symbol || "User"}
                        className="w-8 h-8 text-blue-300"
                      />
                    </button>
                    {showNPCIconPicker && (
                      <div className="absolute mt-2 z-50">
                        <IconPicker
                          value={newNPC.symbol || "User"}
                          onChange={(icon) => {
                            setNewNPC({ ...newNPC, symbol: icon });
                            setShowNPCIconPicker(false);
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-semibold text-blue-200 mb-1">
                      Name *
                    </label>
                    <input
                      type="text"
                      value={newNPC.name}
                      onChange={(e) =>
                        setNewNPC({ ...newNPC, name: e.target.value })
                      }
                      placeholder="e.g., Captain Thorne"
                      className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                    />
                  </div>
                </div>

                {/* Role */}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Role
                  </label>
                  <input
                    type="text"
                    value={newNPC.role}
                    onChange={(e) =>
                      setNewNPC({ ...newNPC, role: e.target.value })
                    }
                    placeholder="e.g., Quest Giver, Antagonist, Mentor"
                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                  />
                </div>

                {/* Status and Attitude */}
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Status
                  </label>
                  <select
                    value={newNPC.status || "alive"}
                    onChange={(e) =>
                      setNewNPC({
                        ...newNPC,
                        status: e.target.value as NPCStatus,
                      })
                    }
                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                  >
                    <option value="alive">Alive</option>
                    <option value="dead">Dead</option>
                    <option value="missing">Missing</option>
                    <option value="unknown">Unknown</option>
                    <option value="departed">Departed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Attitude
                  </label>
                  <select
                    value={newNPC.attitude || "neutral"}
                    onChange={(e) =>
                      setNewNPC({
                        ...newNPC,
                        attitude: e.target.value as NPCAttitude,
                      })
                    }
                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                  >
                    <option value="hostile">Hostile</option>
                    <option value="unfriendly">Unfriendly</option>
                    <option value="neutral">Neutral</option>
                    <option value="friendly">Friendly</option>
                    <option value="allied">Allied</option>
                  </select>
                </div>

                {/* Relationship */}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Relationship{" "}
                    <span className="font-normal text-blue-300/60">
                      (player&apos;s connection to them)
                    </span>
                  </label>
                  <input
                    type="text"
                    value={newNPC.relationship}
                    onChange={(e) =>
                      setNewNPC({ ...newNPC, relationship: e.target.value })
                    }
                    placeholder='e.g., "Trusted mentor", "Bitter rival", "Old friend"'
                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                  />
                </div>

                {/* Faction */}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Faction
                  </label>
                  <input
                    type="text"
                    value={newNPC.faction}
                    onChange={(e) =>
                      setNewNPC({ ...newNPC, faction: e.target.value })
                    }
                    placeholder="Organization, guild, or group affiliation"
                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                  />
                </div>

                {/* Description */}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Description
                  </label>
                  <textarea
                    value={newNPC.description}
                    onChange={(e) =>
                      setNewNPC({ ...newNPC, description: e.target.value })
                    }
                    placeholder="Physical appearance, personality, motivations..."
                    className="w-full h-24 px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white resize-none"
                  />
                </div>

                {/* Notes */}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Notes
                  </label>
                  <textarea
                    value={newNPC.notes}
                    onChange={(e) =>
                      setNewNPC({ ...newNPC, notes: e.target.value })
                    }
                    placeholder="DM notes, secrets, plot hooks..."
                    className="w-full h-20 px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white resize-none"
                  />
                </div>
              </div>

              <button
                onClick={() => {
                  if (!newNPC.name?.trim()) {
                    addNotification("NPC name is required", "warning");
                    return;
                  }
                  const npc: NPC = {
                    id: crypto.randomUUID(),
                    name: newNPC.name.trim(),
                    description: newNPC.description || "",
                    role: newNPC.role || "",
                    status: newNPC.status || "alive",
                    relationship: newNPC.relationship || "",
                    attitude: newNPC.attitude || "neutral",
                    faction: newNPC.faction,
                    symbol: newNPC.symbol || "User",
                    notes: newNPC.notes,
                    createdAt: Date.now(),
                  };
                  setNPCs([...npcs, npc]);
                  setNewNPC({
                    name: "",
                    description: "",
                    role: "",
                    status: "alive",
                    relationship: "",
                    attitude: "neutral",
                    symbol: "User",
                    faction: "",
                    lastSeen: "",
                    notes: "",
                  });
                  addNotification(`Added NPC: ${npc.name}`, "success");
                }}
                disabled={!newNPC.name?.trim()}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
              >
                Add NPC
              </button>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">
                NPCs ({npcs.length})
              </h3>
              {npcs.length === 0 ? (
                <p className="text-blue-300/60 text-sm">No NPCs added yet</p>
              ) : (
                npcs.map((npc, index) =>
                  editingNPCIndex === index ? (
                    // Edit mode
                    <div
                      key={npc.id}
                      className="p-4 bg-blue-900/40 rounded-lg border-2 border-blue-600"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        {/* Name and Icon */}
                        <div className="sm:col-span-2 flex gap-3">
                          <div className="shrink-0 relative">
                            <button
                              onClick={() =>
                                setShowEditNPCIconPicker(!showEditNPCIconPicker)
                              }
                              className="w-14 h-14 rounded-lg bg-blue-800/50 border border-blue-600/50 flex items-center justify-center hover:bg-blue-700/50 transition-colors"
                              title="Change icon"
                            >
                              <DynamicIcon
                                name={editNPC.symbol || "User"}
                                className="w-8 h-8 text-blue-300"
                              />
                            </button>
                            {showEditNPCIconPicker && (
                              <div className="absolute mt-2 z-50">
                                <IconPicker
                                  value={editNPC.symbol || "User"}
                                  onChange={(icon) => {
                                    setEditNPC({ ...editNPC, symbol: icon });
                                    setShowEditNPCIconPicker(false);
                                  }}
                                />
                              </div>
                            )}
                          </div>
                          <div className="flex-1">
                            <label className="block text-xs font-semibold text-blue-300 mb-1">
                              Name *
                            </label>
                            <input
                              type="text"
                              value={editNPC.name || ""}
                              onChange={(e) =>
                                setEditNPC({ ...editNPC, name: e.target.value })
                              }
                              className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/20 text-white"
                            />
                          </div>
                        </div>

                        {/* Role */}
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-blue-300 mb-1">
                            Role
                          </label>
                          <input
                            type="text"
                            value={editNPC.role || ""}
                            onChange={(e) =>
                              setEditNPC({ ...editNPC, role: e.target.value })
                            }
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/20 text-white"
                          />
                        </div>

                        {/* Status and Attitude */}
                        <div>
                          <label className="block text-xs font-semibold text-blue-300 mb-1">
                            Status
                          </label>
                          <select
                            value={editNPC.status || "alive"}
                            onChange={(e) =>
                              setEditNPC({
                                ...editNPC,
                                status: e.target.value as NPCStatus,
                              })
                            }
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/20 text-white"
                          >
                            <option value="alive">Alive</option>
                            <option value="dead">Dead</option>
                            <option value="missing">Missing</option>
                            <option value="unknown">Unknown</option>
                            <option value="departed">Departed</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-blue-300 mb-1">
                            Attitude
                          </label>
                          <select
                            value={editNPC.attitude || "neutral"}
                            onChange={(e) =>
                              setEditNPC({
                                ...editNPC,
                                attitude: e.target.value as NPCAttitude,
                              })
                            }
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/20 text-white"
                          >
                            <option value="hostile">Hostile</option>
                            <option value="unfriendly">Unfriendly</option>
                            <option value="neutral">Neutral</option>
                            <option value="friendly">Friendly</option>
                            <option value="allied">Allied</option>
                          </select>
                        </div>

                        {/* Relationship */}
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-blue-300 mb-1">
                            Relationship
                          </label>
                          <input
                            type="text"
                            value={editNPC.relationship || ""}
                            onChange={(e) =>
                              setEditNPC({
                                ...editNPC,
                                relationship: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/20 text-white"
                          />
                        </div>

                        {/* Faction */}
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-blue-300 mb-1">
                            Faction
                          </label>
                          <input
                            type="text"
                            value={editNPC.faction || ""}
                            onChange={(e) =>
                              setEditNPC({
                                ...editNPC,
                                faction: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/20 text-white"
                          />
                        </div>

                        {/* Description */}
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-blue-300 mb-1">
                            Description
                          </label>
                          <textarea
                            value={editNPC.description || ""}
                            onChange={(e) =>
                              setEditNPC({
                                ...editNPC,
                                description: e.target.value,
                              })
                            }
                            className="w-full h-24 px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/20 text-white resize-none"
                          />
                        </div>

                        {/* Notes */}
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-blue-300 mb-1">
                            Notes
                          </label>
                          <textarea
                            value={editNPC.notes || ""}
                            onChange={(e) =>
                              setEditNPC({
                                ...editNPC,
                                notes: e.target.value,
                              })
                            }
                            className="w-full h-20 px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/20 text-white resize-none"
                          />
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            if (!editNPC.name?.trim()) {
                              addNotification(
                                "NPC name is required",
                                "warning",
                              );
                              return;
                            }
                            const updated = npcs.map((n, i) =>
                              i === index
                                ? {
                                    ...n,
                                    name: editNPC.name?.trim() || n.name,
                                    description:
                                      editNPC.description ?? n.description,
                                    role: editNPC.role ?? n.role,
                                    status: editNPC.status ?? n.status,
                                    relationship:
                                      editNPC.relationship ?? n.relationship,
                                    attitude: editNPC.attitude ?? n.attitude,
                                    faction: editNPC.faction,
                                    symbol: editNPC.symbol ?? n.symbol,
                                    notes: editNPC.notes,
                                  }
                                : n,
                            );
                            setNPCs(updated);
                            setEditingNPCIndex(null);
                            setEditNPC({});
                            setShowEditNPCIconPicker(false);
                            addNotification("NPC updated", "success");
                          }}
                          disabled={!editNPC.name?.trim()}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
                        >
                          Save Changes
                        </button>
                        <button
                          onClick={() => {
                            setEditingNPCIndex(null);
                            setEditNPC({});
                            setShowEditNPCIconPicker(false);
                          }}
                          className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    // View mode
                    <div
                      key={npc.id}
                      className="flex items-start gap-3 p-4 bg-blue-900/20 rounded-lg border border-blue-700/40"
                    >
                      <div className="shrink-0">
                        <div className="w-12 h-12 rounded-lg bg-blue-800/30 border border-blue-700/30 flex items-center justify-center">
                          <DynamicIcon
                            name={npc.symbol || "User"}
                            className="w-6 h-6 text-blue-400"
                          />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-bold text-white">
                            {npc.name}
                          </span>
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded ${
                              npc.attitude === "hostile"
                                ? "text-red-400 bg-red-500/20"
                                : npc.attitude === "unfriendly"
                                  ? "text-orange-400 bg-orange-500/20"
                                  : npc.attitude === "neutral"
                                    ? "text-gray-400 bg-gray-500/20"
                                    : npc.attitude === "friendly"
                                      ? "text-green-400 bg-green-500/20"
                                      : "text-blue-400 bg-blue-500/20"
                            }`}
                          >
                            {npc.attitude}
                          </span>
                          {npc.status !== "alive" && (
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded ${
                                npc.status === "dead"
                                  ? "text-gray-400 bg-gray-500/20"
                                  : npc.status === "missing"
                                    ? "text-yellow-400 bg-yellow-500/20"
                                    : "text-purple-400 bg-purple-500/20"
                              }`}
                            >
                              {npc.status}
                            </span>
                          )}
                        </div>
                        {npc.role && (
                          <p className="text-xs text-blue-300/60 mb-1">
                            {npc.role}
                          </p>
                        )}
                        {npc.relationship && (
                          <p className="text-sm text-blue-200/80 italic">
                            &quot;{npc.relationship}&quot;
                          </p>
                        )}
                        {npc.faction && (
                          <p className="text-xs text-indigo-300/60 mt-1">
                            <DynamicIcon
                              name="Flag"
                              className="w-3 h-3 inline mr-1"
                            />
                            {npc.faction}
                          </p>
                        )}
                        {npc.description && (
                          <p className="text-sm text-blue-200/60 mt-2 line-clamp-2">
                            {npc.description}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => {
                            setEditingNPCIndex(index);
                            setEditNPC({ ...npc });
                          }}
                          className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors text-sm"
                          title="Edit"
                        >
                          <DynamicIcon name="Edit" className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            const updated = npcs.filter((_, i) => i !== index);
                            setNPCs(updated);
                            addNotification("NPC removed", "success");
                          }}
                          className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
                          title="Remove"
                        >
                          <DynamicIcon name="Trash2" className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ),
                )
              )}
            </div>
          </div>
        );

      case "variables":
        return (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-linear-to-r from-cyan-500/10 to-transparent border-l-4 border-cyan-500">
              <div>
                <h3 className="text-xl font-bold text-cyan-400 flex items-center gap-2">
                  <DynamicIcon name="Variable" className="w-6 h-6" />
                  Variables
                </h3>
                <p className="text-sm text-gray-400 mt-1">
                  Track custom values: numbers, flags, text, and lists
                </p>
              </div>
            </div>

            {/* Add Variable Buttons */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  const newVar: NumberVariable = {
                    id: crypto.randomUUID(),
                    name: "New Number",
                    description: "",
                    type: "number",
                    value: 0,
                  };
                  setVariables([...variables, newVar]);
                }}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg flex items-center gap-2"
              >
                <DynamicIcon name="Hash" className="w-4 h-4" />
                Add Number
              </button>
              <button
                onClick={() => {
                  const newVar: BooleanVariable = {
                    id: crypto.randomUUID(),
                    name: "New Flag",
                    description: "",
                    type: "boolean",
                    value: false,
                  };
                  setVariables([...variables, newVar]);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-2"
              >
                <DynamicIcon name="ToggleLeft" className="w-4 h-4" />
                Add Boolean
              </button>
              <button
                onClick={() => {
                  const newVar: StringVariable = {
                    id: crypto.randomUUID(),
                    name: "New Text",
                    description: "",
                    type: "string",
                    value: "",
                  };
                  setVariables([...variables, newVar]);
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg flex items-center gap-2"
              >
                <DynamicIcon name="Type" className="w-4 h-4" />
                Add String
              </button>
              <button
                onClick={() => {
                  const newVar: ListVariable = {
                    id: crypto.randomUUID(),
                    name: "New List",
                    description: "",
                    type: "list",
                    items: [],
                  };
                  setVariables([...variables, newVar]);
                }}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg flex items-center gap-2"
              >
                <DynamicIcon name="List" className="w-4 h-4" />
                Add List
              </button>
            </div>

            {/* Variables List */}
            <div className="space-y-4">
              {variables.map((variable, index) => (
                <VariableEditorCard
                  key={variable.id}
                  variable={variable}
                  index={index}
                  onChange={(updated) => {
                    const newVars = [...variables];
                    newVars[index] = updated;
                    setVariables(newVars);
                  }}
                  onDelete={() => {
                    setVariables(variables.filter((_, i) => i !== index));
                  }}
                  onMoveUp={index > 0 ? () => moveVariableUp(index) : undefined}
                  onMoveDown={
                    index < variables.length - 1
                      ? () => moveVariableDown(index)
                      : undefined
                  }
                  onDragStart={() => handleVariableDragStart(index)}
                  onDragOver={(e) => handleVariableDragOver(e, index)}
                  onDragEnd={handleVariableDragEnd}
                  isDragging={draggedVariableIndex === index}
                />
              ))}

              {variables.length === 0 && (
                <div className="p-8 text-center rounded-lg bg-blue-900/30 border-2 border-dashed border-blue-700/40">
                  <DynamicIcon
                    name="Variable"
                    className="w-12 h-12 mx-auto mb-3 text-blue-400/50"
                  />
                  <p className="text-lg font-semibold text-blue-300/70 mb-2">
                    No variables yet
                  </p>
                  <p className="text-sm text-blue-400/50">
                    Variables let you track custom values like counters, flags,
                    text (e.g., day of week, current location), or lists of
                    items that the AI can reference and modify.
                  </p>
                </div>
              )}
            </div>
          </div>
        );

      case "tables":
        return (
          <CustomTablesEditor
            tables={customTables}
            setTables={setCustomTables}
          />
        );

      case "mythic":
        return (
          <div className="space-y-6">
            {/* Header Card */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-linear-to-r from-purple-500/10 to-transparent border-l-4 border-purple-500">
              <div>
                <h3 className="text-xl font-bold text-purple-400 flex items-center gap-2">
                  <span className="text-2xl">✨</span>
                  Advanced RPG Tools Settings
                </h3>
                <p className="text-sm text-gray-400 mt-1">
                  Optional oracle-driven storytelling with dynamic chaos
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={agmtEnabled}
                  onChange={(e) => setAGMTEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-14 h-7 bg-gray-700 peer-focus:ring-4 peer-focus:ring-purple-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-1 after:bg-white after:border-blue-700/40 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>

            {agmtEnabled && (
              <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
                {/* Chaos Factor - Enhanced Visual Slider */}
                <div className="p-6 rounded-lg bg-linear-to-br from-gray-800/50 to-gray-900/50 border border-gray-700">
                  <label className="block text-sm font-semibold text-gray-300 mb-3">
                    Starting Chaos Factor
                  </label>
                  <div className="space-y-3">
                    <input
                      type="range"
                      min="1"
                      max="9"
                      value={agmtState.chaosFactor}
                      onChange={(e) =>
                        setAGMTState({
                          ...agmtState,
                          chaosFactor: parseInt(e.target.value),
                        })
                      }
                      className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-linear-to-br [&::-webkit-slider-thumb]:from-purple-500 [&::-webkit-slider-thumb]:to-blue-500 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:hover:scale-110 [&::-webkit-slider-thumb]:transition-transform"
                    />
                    <div className="flex justify-between items-center">
                      <div className="text-center">
                        <span
                          className={`text-3xl font-bold ${getChaosColor(
                            agmtState.chaosFactor,
                          )}`}
                        >
                          {agmtState.chaosFactor}
                        </span>
                        <span className="text-xs text-gray-400 block mt-1">
                          / 9
                        </span>
                      </div>
                      <div className="text-right flex-1 ml-4">
                        <p
                          className={`text-sm font-semibold ${getChaosColor(
                            agmtState.chaosFactor,
                          )}`}
                        >
                          {getChaosLabel(agmtState.chaosFactor)}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {getChaosDescription(agmtState.chaosFactor)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case "preview":
        return (
          <div className="space-y-6">
            <div className="bg-linear-to-r from-purple-600 via-pink-600 to-blue-600 rounded-2xl p-8 text-white">
              <h2 className="text-3xl font-bold mb-2">
                {title || "Untitled Adventure"}
              </h2>
              <p className="text-white/90 mb-4">
                {shortDescription || "No description"}
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 bg-white/20 rounded-full text-sm font-semibold">
                  {difficulty}
                </span>
                {tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 bg-white/20 rounded-full text-sm"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-blue-900/20 rounded-xl shadow-lg p-6 border border-blue-800/30">
              <h3 className="text-xl font-bold mb-4 text-white">Summary</h3>
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-blue-300/60">Stats:</span>
                    <span className="ml-2 font-semibold text-white">
                      {stats.length}
                    </span>
                  </div>
                  <div>
                    <span className="text-blue-300/60">Resources:</span>
                    <span className="ml-2 font-semibold text-white">
                      {resources.length}
                    </span>
                  </div>
                  <div>
                    <span className="text-blue-300/60">Starting Items:</span>
                    <span className="ml-2 font-semibold text-white">
                      {inventory.length}
                    </span>
                  </div>
                  <div>
                    <span className="text-blue-300/60">Notes:</span>
                    <span className="ml-2 font-semibold text-white">
                      {lore.length}
                    </span>
                  </div>
                  <div>
                    <span className="text-blue-300/60">Relationships:</span>
                    <span className="ml-2 font-semibold text-white">
                      {relationships.length}
                    </span>
                  </div>
                  <div>
                    <span className="text-blue-300/60">Achievements:</span>
                    <span className="ml-2 font-semibold text-white">
                      {achievements.length}
                    </span>
                  </div>
                  <div>
                    <span className="text-blue-300/60">Quests:</span>
                    <span className="ml-2 font-semibold text-white">
                      {quests.length}
                    </span>
                  </div>
                  <div>
                    <span className="text-blue-300/60">NPCs:</span>
                    <span className="ml-2 font-semibold text-white">
                      {npcs.length}
                    </span>
                  </div>
                  <div>
                    <span className="text-blue-300/60">Tags:</span>
                    <span className="ml-2 font-semibold text-white">
                      {tags.length}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {intro && (
              <div className="bg-blue-900/20 rounded-xl shadow-lg p-6 border border-blue-800/30">
                <h3 className="text-xl font-bold mb-4 text-white">
                  Opening Scene
                </h3>
                <div className="bg-blue-900/20 rounded-lg p-6 border-l-4 border-purple-500">
                  <p className="text-blue-200 italic">"{intro}"</p>
                </div>
              </div>
            )}

            <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-lg p-4">
              <p className="text-sm text-yellow-300 flex items-start gap-2">
                <DynamicIcon
                  name="AlertTriangle"
                  className="w-4 h-4 mt-1 shrink-0 text-yellow-400"
                />
                <span>
                  <strong>Note:</strong>{" "}
                  {visibility === "private" ? (
                    <>
                      This adventure is set to <strong>private</strong>. Only
                      you will be able to see and play it. The adventure
                      metadata (title, description) will be stored on the
                      server, but stories created from it remain encrypted.
                    </>
                  ) : visibility === "hidden" ? (
                    <>
                      This adventure is set to <strong>hidden</strong>. It
                      won&apos;t appear in the explorer, but anyone with the
                      direct link can access it.
                    </>
                  ) : (
                    <>
                      Once you publish this adventure, it will be{" "}
                      <strong>public</strong> and players will be able to find
                      and start it from the explorer.
                    </>
                  )}
                </span>
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  // Show loading screen when loading adventure data
  if (loading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-white font-semibold">Loading adventure...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 pt-16 transition-all duration-300 ${
        isAIPinned && isAIMenuOpen ? "lg:pr-[420px]" : ""
      }`}
    >
      <div className="max-w-6xl mx-auto p-3 sm:p-6">
        {/* Compact Header */}
        <div className="bg-blue-950/50 rounded-xl p-4 border border-blue-800/30 mb-4">
          {/* Top row: Title and action buttons */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push("/library")}
                className="p-2 text-blue-300/60 hover:text-white hover:bg-blue-800/30 rounded-lg transition-colors"
              >
                <DynamicIcon name="ArrowLeft" className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-lg font-bold text-white flex items-center gap-2">
                  <DynamicIcon
                    name="Wand2"
                    className="w-5 h-5 text-purple-400"
                  />
                  {editAdventureId ? "Edit Adventure" : "Create Adventure"}
                </h1>
                <p className="text-xs text-blue-300/50">
                  {title || "Untitled"} Step {currentStepIndex + 1}/
                  {steps.length}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!editAdventureId && (
                <button
                  onClick={() => router.push("/creator/generate")}
                  className="flex items-center gap-2 px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-lg transition-colors"
                  title="Generate a full adventure from a single prompt"
                >
                  <DynamicIcon name="Sparkles" className="w-4 h-4" />
                  <span className="hidden sm:inline">Big Creator</span>
                </button>
              )}
              <button
                onClick={() => setIsAIMenuOpen(true)}
                className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <DynamicIcon name="Bot" className="w-4 h-4" />
                <span className="hidden sm:inline">AI</span>
              </button>
              <button
                onClick={handleDiscardChanges}
                className="flex items-center gap-2 px-3 py-2 bg-red-900/30 hover:bg-red-800/40 text-red-300 text-sm font-medium rounded-lg transition-colors border border-red-800/30"
              >
                <DynamicIcon name="Trash2" className="w-4 h-4" />
                <span className="hidden sm:inline">Discard</span>
              </button>
            </div>
          </div>

          {/* Bottom row: Category selector (left) and Save/Publish buttons (right) */}
          <div className="flex items-center justify-between gap-4">
            <ClockCategorySelector
              categories={steps}
              currentIndex={currentStepIndex}
              onSelect={(index) => setCurrentStep(steps[index].id)}
              completedIndices={Array.from(
                { length: currentStepIndex },
                (_, i) => i,
              )}
            />

            <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 sm:gap-3">
              {/* Save Button */}
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center justify-center gap-2 px-4 py-2 w-full sm:w-auto bg-green-600 hover:bg-green-500 active:bg-green-700 disabled:bg-blue-800/30 disabled:text-blue-300/40 text-white text-sm font-medium rounded-lg transition-all whitespace-nowrap"
                title="Save to your device"
              >
                {saving ? (
                  <>
                    <DynamicIcon
                      name="Loader2"
                      className="w-4 h-4 animate-spin"
                    />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <DynamicIcon name="Save" className="w-4 h-4" />
                    <span>Save</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="bg-blue-950/50 rounded-xl p-4 sm:p-6 border border-blue-800/30 mb-4">
          <h2 className="text-lg font-bold mb-4 text-white flex items-center gap-2">
            <DynamicIcon
              name={steps.find((s) => s.id === currentStep)?.icon || "FileText"}
              className="w-5 h-5 text-purple-400"
            />
            {steps.find((s) => s.id === currentStep)?.label}
          </h2>
          {renderStepContent()}
        </div>

        {/* Navigation */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-blue-950/50 rounded-xl p-3 border border-blue-800/30 mb-5">
          <button
            onClick={() => {
              const prevIndex = Math.max(0, currentStepIndex - 1);
              setCurrentStep(steps[prevIndex].id);
            }}
            disabled={currentStepIndex === 0}
            className="px-4 py-2.5 bg-blue-800/40 hover:bg-blue-700/50 disabled:opacity-50 disabled:cursor-not-allowed text-blue-200 text-sm font-medium rounded-lg transition-colors border border-blue-700/30"
          >
            ← Previous
          </button>

          <div className="text-xs sm:text-sm text-blue-300/60 text-center">
            Step {currentStepIndex + 1} of {steps.length}
          </div>

          {currentStep === "preview" ? (
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 sm:flex-none px-3 py-3 sm:py-2.5 bg-green-600 hover:bg-green-500 active:bg-green-700 disabled:bg-blue-800/30 disabled:text-blue-300/40 text-white text-sm font-medium rounded-lg transition-all whitespace-nowrap touch-manipulation flex items-center justify-center gap-2"
                title="Save to your device"
              >
                {saving ? (
                  <>
                    <DynamicIcon
                      name="Loader2"
                      className="w-4 h-4 animate-spin"
                    />
                    Saving...
                  </>
                ) : (
                  <>
                    <DynamicIcon name="Save" className="w-4 h-4" />
                    <span>Save</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                const nextIndex = Math.min(
                  steps.length - 1,
                  currentStepIndex + 1,
                );
                setCurrentStep(steps[nextIndex].id);
              }}
              className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Next →
            </button>
          )}
        </div>
      </div>

      {/* Floating Preset Switcher - shown on relevant tabs when presets exist */}
      {currentStep !== "preset" &&
        currentStep !== "basic" &&
        currentStep !== "preview" &&
        presets.length > 1 && (
          <div className="fixed bottom-20 right-4 z-30">
            <div className="relative">
              <button
                onClick={() => setShowPresetSwitcher(!showPresetSwitcher)}
                className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-full shadow-lg transition-all border border-purple-400/30"
              >
                <DynamicIcon
                  name={
                    presets.find((p) => p.id === selectedPreset)?.icon || "User"
                  }
                  className="w-4 h-4"
                />
                <span className="max-w-[120px] truncate">
                  {presets.find((p) => p.id === selectedPreset)?.name ||
                    "Custom"}
                </span>
                <DynamicIcon
                  name={showPresetSwitcher ? "ChevronDown" : "ChevronUp"}
                  className="w-3 h-3"
                />
              </button>

              {/* Dropdown */}
              {showPresetSwitcher && (
                <div className="absolute bottom-full right-0 mb-2 w-64 bg-blue-950 border border-blue-700/50 rounded-xl shadow-2xl overflow-hidden">
                  <div className="p-2 border-b border-blue-700/30">
                    <p className="text-xs text-blue-300/60 font-medium">
                      Switch Preset
                    </p>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {presets.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => {
                          if (preset.id !== selectedPreset) {
                            // Save current custom values before switching to a preset
                            if (
                              selectedPreset === "custom" &&
                              preset.id !== "custom"
                            ) {
                              setSavedCustomValues({
                                characterSheet,
                                intro,
                                stats: [...stats],
                                resources: [...resources],
                                inventory: [...inventory],
                                relationships: [...relationships],
                                conditions: [...conditions],
                                authorNotes,
                              });
                            }

                            setSelectedPreset(preset.id);
                            if (preset.id !== "custom") {
                              applyPreset(
                                preset,
                                setCharacterSheet,
                                setIntro,
                                setStats,
                                setResources,
                                setInventory,
                                setRelationships,
                                setConditions,
                                setAuthorNotes,
                              );
                              addNotification(
                                `Switched to ${preset.name}`,
                                "success",
                              );
                            } else {
                              // Restore saved custom values when switching back to custom
                              if (savedCustomValues) {
                                setCharacterSheet(
                                  savedCustomValues.characterSheet,
                                );
                                setIntro(savedCustomValues.intro);
                                setStats(savedCustomValues.stats);
                                setResources(savedCustomValues.resources);
                                setInventory(savedCustomValues.inventory);
                                setRelationships(
                                  savedCustomValues.relationships,
                                );
                                setConditions(savedCustomValues.conditions);
                                setAuthorNotes(savedCustomValues.authorNotes);
                                addNotification(
                                  "Custom settings restored!",
                                  "success",
                                );
                              }
                            }
                          }
                          setShowPresetSwitcher(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                          selectedPreset === preset.id
                            ? "bg-purple-600/30 text-white"
                            : "text-blue-200 hover:bg-blue-800/40"
                        }`}
                      >
                        <DynamicIcon
                          name={preset.icon}
                          className="w-5 h-5 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{preset.name}</p>
                          <p className="text-xs text-blue-300/50 truncate">
                            {preset.description}
                          </p>
                        </div>
                        {selectedPreset === preset.id && (
                          <DynamicIcon
                            name="Check"
                            className="w-4 h-4 text-purple-400 shrink-0"
                          />
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="p-2 border-t border-blue-700/30">
                    <button
                      onClick={() => {
                        setCurrentStep("preset");
                        setShowPresetSwitcher(false);
                      }}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs text-purple-300 hover:bg-purple-600/20 rounded-lg transition-colors"
                    >
                      <DynamicIcon name="Settings" className="w-3 h-3" />
                      Manage Presets
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        icon={confirmDialog.icon}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        confirmButtonClass={confirmDialog.confirmButtonClass}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
      />

      {/* Conflict Resolution Modal */}
      {showConflictModal && conflictData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-blue-950 border border-amber-500/50 rounded-xl p-6 max-w-2xl w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center">
                <DynamicIcon
                  name="AlertTriangle"
                  className="w-5 h-5 text-amber-400"
                />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  Version Conflict Detected
                </h3>
                <p className="text-sm text-blue-300/70">
                  Choose which version to keep
                </p>
              </div>
            </div>

            <p className="text-blue-200/80 mb-6">
              This adventure has been edited on another device. You have unsaved
              changes from this device that conflict with the online version.
            </p>

            <div className="grid md:grid-cols-2 gap-4 mb-6">
              {/* Local Version */}
              <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <DynamicIcon
                    name="Laptop"
                    className="w-4 h-4 text-blue-400"
                  />
                  <span className="font-semibold text-blue-300">
                    This Device
                  </span>
                </div>
                <p className="text-xs text-blue-400/70 mb-3">
                  Last saved:{" "}
                  {new Date(conflictData.localUpdatedAt).toLocaleString()}
                </p>
                <div className="text-sm text-blue-200/70 space-y-1">
                  <p>
                    <strong>Title:</strong>{" "}
                    {conflictData.localDraft.title || "(empty)"}
                  </p>
                  <p>
                    <strong>Stats:</strong>{" "}
                    {conflictData.localDraft.stats?.length || 0} items
                  </p>
                  <p>
                    <strong>Inventory:</strong>{" "}
                    {conflictData.localDraft.inventory?.length || 0} items
                  </p>
                  <p>
                    <strong>Notes:</strong>{" "}
                    {conflictData.localDraft.lore?.length || 0} entries
                  </p>
                </div>
                <button
                  onClick={handleUseLocalVersion}
                  className="w-full mt-4 py-2 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <DynamicIcon name="Laptop" className="w-4 h-4" />
                  Use Local Version
                </button>
              </div>

              {/* Online Version */}
              <div className="bg-green-900/30 border border-green-500/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <DynamicIcon
                    name="Cloud"
                    className="w-4 h-4 text-green-400"
                  />
                  <span className="font-semibold text-green-300">
                    Cloud (Online)
                  </span>
                </div>
                <p className="text-xs text-green-400/70 mb-3">
                  Last saved:{" "}
                  {new Date(conflictData.onlineUpdatedAt).toLocaleString()}
                </p>
                <div className="text-sm text-green-200/70 space-y-1">
                  <p>
                    <strong>Title:</strong>{" "}
                    {conflictData.onlineAdventure.title || "(empty)"}
                  </p>
                  <p>
                    <strong>Stats:</strong>{" "}
                    {conflictData.onlineAdventure.storyTemplate?.stats
                      ?.length || 0}{" "}
                    items
                  </p>
                  <p>
                    <strong>Inventory:</strong>{" "}
                    {conflictData.onlineAdventure.storyTemplate?.inventory
                      ?.length || 0}{" "}
                    items
                  </p>
                  <p>
                    <strong>Notes:</strong>{" "}
                    {conflictData.onlineAdventure.storyTemplate?.lore?.length ||
                      0}{" "}
                    entries
                  </p>
                </div>
                <button
                  onClick={handleUseOnlineVersion}
                  className="w-full mt-4 py-2 px-4 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <DynamicIcon name="Cloud" className="w-4 h-4" />
                  Use Online Version
                </button>
              </div>
            </div>

            <div className="text-xs text-amber-400/70 text-center">
              ⚠️ The version you don&apos;t choose will be discarded
            </div>
          </div>
        </div>
      )}

      {/* AI Image Generation Modal */}
      {showAIImageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-blue-950 border border-blue-700/50 rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">
                🎨 AI{" "}
                {showAIImageModal === "thumbnail" ? "Thumbnail" : "Banner"}{" "}
                Generation
              </h3>
              <button
                onClick={() => setShowAIImageModal(null)}
                className="text-blue-400 hover:text-blue-300"
              >
                <DynamicIcon name="X" className="w-5 h-5" />
              </button>
            </div>

            {/* Provider Toggle */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-blue-300/80 mb-2">
                Image Provider
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setImageProvider("deepinfra");
                    setImageModel("Bria 3.2");
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    imageProvider === "deepinfra"
                      ? "bg-purple-600 text-white"
                      : "bg-blue-900/50 text-blue-300 hover:bg-blue-800/50"
                  }`}
                >
                  🪙 DeepInfra (Coins)
                </button>
                <button
                  onClick={() => {
                    setImageProvider("openrouter");
                    setImageModel("Nano Banana");
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    imageProvider === "openrouter"
                      ? "bg-purple-600 text-white"
                      : "bg-blue-900/50 text-blue-300 hover:bg-blue-800/50"
                  }`}
                >
                  🔑 OpenRouter (BYOK)
                </button>
              </div>
              <p className="text-xs text-blue-400/60 mt-1">
                {imageProvider === "deepinfra"
                  ? "Uses coins. Bria 3.2 is FREE!"
                  : "Requires OpenRouter API key"}
              </p>
            </div>

            {/* Model Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-blue-300/80 mb-2">
                Image Model
              </label>
              <select
                value={imageModel}
                onChange={(e) =>
                  setImageModel(
                    e.target.value as ImageModelKey | DeepInfraImageModelKey,
                  )
                }
                className="w-full px-4 py-2 bg-blue-900/50 border border-blue-700/50 rounded-lg text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 focus:outline-none"
              >
                {imageProvider === "deepinfra"
                  ? Object.entries(DEEPINFRA_IMAGE_MODELS).map(
                      ([key, model]) => (
                        <option key={key} value={key}>
                          {key}{" "}
                          {model.cost > 0 ? `(~${model.cost} coins)` : "(FREE)"}
                        </option>
                      ),
                    )
                  : Object.entries(OPENROUTER_IMAGE_MODELS).map(([key]) => (
                      <option key={key} value={key}>
                        {key} (~{estimateImageCost(key)} coins)
                      </option>
                    ))}
              </select>
              {imageProvider === "deepinfra" && (
                <p className="text-xs text-blue-400/60 mt-1">
                  {DEEPINFRA_IMAGE_MODELS[imageModel as DeepInfraImageModelKey]
                    ?.description || ""}
                </p>
              )}
            </div>

            {/* Prompt */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-blue-300/80 mb-2">
                Prompt
              </label>
              <textarea
                value={
                  showAIImageModal === "thumbnail"
                    ? thumbnailPrompt
                    : bannerPrompt
                }
                onChange={(e) =>
                  showAIImageModal === "thumbnail"
                    ? setThumbnailPrompt(e.target.value)
                    : setBannerPrompt(e.target.value)
                }
                rows={6}
                className="w-full px-4 py-3 bg-blue-900/50 border border-blue-700/50 rounded-lg text-white resize-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 focus:outline-none"
                placeholder="Describe your image..."
              />
              <button
                onClick={() => {
                  const defaultPrompt = getDefaultImagePrompt(showAIImageModal);
                  if (showAIImageModal === "thumbnail") {
                    setThumbnailPrompt(defaultPrompt);
                  } else {
                    setBannerPrompt(defaultPrompt);
                  }
                }}
                className="mt-2 text-xs text-blue-400 hover:text-blue-300"
              >
                ↻ Reset to default prompt
              </button>
            </div>

            {/* Cost Display */}
            <div className="mb-4 p-3 bg-blue-900/30 rounded-lg border border-blue-800/50">
              <div className="flex items-center justify-between text-sm">
                <span className="text-blue-300/80">Estimated Cost:</span>
                <span className="font-medium text-purple-300">
                  {imageProvider === "deepinfra"
                    ? DEEPINFRA_IMAGE_MODELS[
                        imageModel as DeepInfraImageModelKey
                      ]?.cost > 0
                      ? `~${
                          DEEPINFRA_IMAGE_MODELS[
                            imageModel as DeepInfraImageModelKey
                          ]?.cost
                        } coins`
                      : "FREE"
                    : imageProvider === "openrouter"
                      ? "BYOK (no coins)"
                      : `~${estimateImageCost(imageModel)} coins`}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowAIImageModal(null)}
                className="px-4 py-2 bg-blue-900/40 hover:bg-blue-800/50 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => generateAIImage(showAIImageModal)}
                disabled={
                  (showAIImageModal === "thumbnail"
                    ? !thumbnailPrompt.trim()
                    : !bannerPrompt.trim()) ||
                  generatingThumbnail ||
                  generatingBanner ||
                  (imageProvider === "openrouter" && !apiKeys.openRouterKey)
                }
                className="px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-blue-900/40 disabled:text-blue-300/50 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                🎨 Generate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Chat - Single instance handles both pinned drawer and modal modes */}
      <CreatorAIChat
        isOpen={isAIMenuOpen}
        onClose={() => setIsAIMenuOpen(false)}
        onOpen={() => setIsAIMenuOpen(true)}
        adventureId={editAdventureId || undefined}
        currentStoryData={{
          story_name: title,
          premise,
          intro: intro,
          author_notes: authorNotes,
          stats,
          resources,
          inventory,
          abilities,
          nodeEffects: {
            statBonuses: [],
            resourceBonuses: [],
            passives: passives,
          },
          lore,
          achievements,
          quests,
          npcs,
          relationships,
          variables,
          presets,
          upgradeSettings,
          levelingSettings,
          skillTrees,
          agmtState: agmtEnabled ? agmtState : undefined,
          customTables,
        }}
        adventureMetadata={{
          title: title,
          shortDescription: shortDescription,
          description: description,
          startingChoices: startingChoices,
        }}
        onApplyChanges={handleApplyAIChanges}
        isPinned={isAIPinned}
        onPinToggle={handlePinToggle}
      />
    </div>
  );
}

export default function AdventureCreatorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-400"></div>
        </div>
      }
    >
      <AdventureCreatorContent />
    </Suspense>
  );
}
