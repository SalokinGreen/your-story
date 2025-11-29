"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/misc/AuthContext";
import { getSystemUpgradeDefaults } from "@/app/misc/rpgSystems";
import {
  StoryData,
  Stat,
  Resource,
  InventoryItem,
  PlotBeat,
  StoryLore,
  Achievement,
  Quest,
  Relationship,
  Preset,
  UpgradeSettings,
  DEFAULT_UPGRADE_SETTINGS,
  Adventure,
  MythicState,
  MythicThread,
  MythicCharacter,
  CustomTable,
  StartingChoice,
  Variable,
  NumberVariable,
  BooleanVariable,
  ListVariable,
} from "@/app/misc/structs";
import { useNotification } from "@/app/misc/NotificationContext";
import { supabase } from "@/app/misc/supabase";
import { compressImage } from "@/app/misc/imageCompression";
import { authenticatedFetch } from "@/app/misc/getAuthToken";
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
import { GRADE_CONFIG, getMaxDurability, ItemGrade, GRADE_ORDER } from "@/app/misc/itemSystem";
import {
  saveLocalAdventure,
  getLocalAdventure,
  deleteLocalAdventure,
} from "@/app/misc/localAdventureManager";
type CreatorStep =
  | "basic"
  | "preset"
  | "premise"
  | "starting-choices"
  | "stats"
  | "resources"
  | "inventory"
  | "lore"
  | "relationships"
  | "achievements"
  | "quests"
  | "plot"
  | "mythic"
  | "variables"
  | "tables"
  | "upgrades"
  | "preview";

// Helper functions for Mythic UI
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

// Variable Editor Card Component
function VariableEditorCard({
  variable,
  onChange,
  onDelete,
}: {
  variable: Variable;
  onChange: (variable: Variable) => void;
  onDelete: () => void;
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
      className={`flex items-start gap-3 p-4 rounded-lg ${colors.bg} border ${colors.border}`}
    >
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
  const { user, loading: authLoading } = useAuth();
  const { addNotification } = useNotification();

  const editAdventureId = searchParams?.get("edit");

  // Redirect if not authenticated (effect only, keep hook order stable)
  useEffect(() => {
    // Wait for auth to finish loading before redirecting
    if (authLoading) return;
    if (!user) {
      router.push("/");
    }
  }, [user, authLoading, router]);

  const [currentStep, setCurrentStep] = useState<CreatorStep>("basic");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [isLocal, setIsLocal] = useState(false); // Track if adventure is stored locally
  const [selectedPreset, setSelectedPreset] = useState<string>("custom");
  const [presets, setPresets] = useState<Preset[]>([DEFAULT_PRESET]);
  const [showPresetForm, setShowPresetForm] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [newPresetDescription, setNewPresetDescription] = useState("");
  const [newPresetIcon, setNewPresetIcon] = useState("Star");
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);

  // Upgrade Settings
  const [upgradeSettings, setUpgradeSettings] = useState<UpgradeSettings>(
    DEFAULT_UPGRADE_SETTINGS
  );

  // Basic Info
  const [title, setTitle] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");
  const [difficulty, setDifficulty] = useState<
    "Easy" | "Medium" | "Hard" | "Expert"
  >("Medium");
  const [rpgSystem, setRpgSystem] = useState<
    | "3d6"
    | "1d20"
    | "1d100"
    | "percentile"
    | "pbta"
    | "fate"
    | "yze"
    | "explosive"
    | "narrative"
  >("3d6");
  const [visibility, setVisibility] = useState<"public" | "hidden" | "private">(
    "private"
  );

  // Update upgrade values when RPG system changes
  useEffect(() => {
    const systemDefaults = getSystemUpgradeDefaults(rpgSystem);
    setUpgradeSettings((prev) => ({
      ...prev,
      statUpgradeAmount: systemDefaults.statUpgradeAmount,
      resourceUpgradeAmount: systemDefaults.resourceUpgradeAmount,
    }));
  }, [rpgSystem]);
  const [nsfw, setNsfw] = useState(false);
  const [showAllSystems, setShowAllSystems] = useState(false);
  const [showAdvancedBasic, setShowAdvancedBasic] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
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

  // Helper function to apply item changes with command support
  function applyItemChanges<
    T extends { name?: string; title?: string; id?: string; text?: string }
  >(
    existingItems: T[],
    newItems: Array<
      Partial<T> & { _command?: "add" | "replace" | "delete" | "merge" }
    >,
    itemType: string,
    identifierKey: "name" | "title" | "id" | "text" = "name"
  ): T[] {
    let updated = [...existingItems];

    newItems.forEach((newItem) => {
      const command = newItem._command || "merge"; // Default to merge for backward compatibility
      const itemIdentifier = newItem[identifierKey] as string | undefined;

      // Skip if no identifier provided
      if (!itemIdentifier) {
        console.warn(
          `[AI] Skipping ${itemType} - no ${identifierKey} provided`
        );
        return;
      }

      const index = updated.findIndex(
        (item) => item[identifierKey] === itemIdentifier
      );

      switch (command) {
        case "delete":
          if (index !== -1) {
            updated.splice(index, 1);
            console.log(`[AI] Deleted ${itemType}: ${itemIdentifier}`);
          } else {
            console.warn(
              `[AI] Cannot delete ${itemType} "${itemIdentifier}" - not found`
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
              `[AI] Added ${itemType} (replace on non-existent): ${itemIdentifier}`
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
    }
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

    if (data.plot_beats) {
      data.plot_beats.forEach((beat: any) => {
        if (beat._command === "delete") {
          deletions.push(`Plot Beat: ${beat.title}`);
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
    }

    // Check Mythic deletions
    if (data.mythicState) {
      const ms = data.mythicState;
      if (ms.threads) {
        ms.threads.forEach((t: any) => {
          if (t._command === "delete") {
            deletions.push(`Mythic Thread: ${t.description}`);
          }
        });
      }
      if (ms.characters) {
        ms.characters.forEach((c: any) => {
          if (c._command === "delete") {
            deletions.push(`Mythic Character: ${c.name}`);
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
          "\n"
        )}\n\nContinue?`
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
    if (data.player_name) setPlayerName(data.player_name);
    if (data.player_summary) setPlayerSummary(data.player_summary);
    if (data.intro) setIntro(data.intro);
    if (data.author_notes) setAuthorNotes(data.author_notes);

    // Apply with commands
    if (data.stats) {
      setStats(applyItemChanges(stats, data.stats as any, "stat", "name"));
    }

    if (data.resources) {
      setResources(
        applyItemChanges(resources, data.resources as any, "resource", "name")
      );
    }

    if (data.inventory) {
      setInventory(
        applyItemChanges(inventory, data.inventory as any, "item", "name")
      );
    }

    if (data.plot_beats) {
      setPlotBeats(
        applyItemChanges(
          plotBeats,
          data.plot_beats as any,
          "plot beat",
          "title"
        )
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
          "title"
        )
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
          "name"
        )
      );
    }

    if (data.presets) {
      setPresets(
        applyItemChanges(presets, data.presets as any, "preset", "id")
      );
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

        // Update shop arrays
        if (us.statShop) {
          updated.statShop = applyItemChanges(
            prev.statShop,
            us.statShop as any,
            "stat shop item",
            "name"
          );
        }

        if (us.resourceShop) {
          updated.resourceShop = applyItemChanges(
            prev.resourceShop,
            us.resourceShop as any,
            "resource shop item",
            "name"
          );
        }

        if (us.itemShop) {
          updated.itemShop = applyItemChanges(
            prev.itemShop,
            us.itemShop as any,
            "item shop item",
            "name"
          );
        }

        return updated;
      });
    }

    // Apply Mythic GME settings
    // mythicEnabled is derived from mythicState presence, not a separate field
    if (data.mythicState) {
      const ms = data.mythicState;

      // If mythicState is provided, enable Mythic
      if (!mythicEnabled) {
        setMythicEnabled(true);
      }

      const newState = { ...mythicState };

      // Chaos factor validation (1-9)
      if (ms.chaosFactor !== undefined) {
        const chaos = Math.max(1, Math.min(9, ms.chaosFactor));
        newState.chaosFactor = chaos;
      }

      // Scene count validation (>= 0)
      if (ms.sceneCount !== undefined) {
        newState.sceneCount = Math.max(0, ms.sceneCount);
      }

      // Threads
      if (ms.threads) {
        const threadChanges = ms.threads as any[];
        newState.threads = applyItemChanges(
          mythicState.threads,
          threadChanges,
          "mythic thread",
          "id"
        ).map((thread: any) => {
          // Auto-generate ID for new threads without one
          if (!thread.id) {
            thread.id = `thread-${Date.now()}-${Math.random()
              .toString(36)
              .substring(2, 9)}`;
          }
          return thread;
        });
      }

      // Characters
      if (ms.characters) {
        const charChanges = ms.characters as any[];
        newState.characters = applyItemChanges(
          mythicState.characters,
          charChanges,
          "mythic character",
          "id"
        ).map((char: any) => {
          // Auto-generate ID for new characters without one
          if (!char.id) {
            char.id = `char-${Date.now()}-${Math.random()
              .toString(36)
              .substring(2, 9)}`;
          }
          return char;
        });
      }

      setMythicState(newState);
    }

    // Apply custom tables
    if (data.customTables) {
      setCustomTables(
        applyItemChanges(
          customTables,
          data.customTables as any,
          "custom table",
          "id"
        ).map((table: any) => {
          // Auto-generate ID for new tables without one
          if (!table.id) {
            table.id = `table-${Date.now()}-${Math.random()
              .toString(36)
              .substring(2, 9)}`;
          }
          return table;
        })
      );
    }

    // Apply variables
    if (data.variables) {
      setVariables(
        applyItemChanges(
          variables,
          data.variables as any,
          "variable",
          "name"
        ).map((v: any) => {
          // Auto-generate ID for new variables without one
          if (!v.id) {
            v.id = `var_${
              v.name?.toLowerCase().replace(/\s+/g, "_") || Date.now()
            }`;
          }
          return v;
        })
      );
    }

    // Apply starting choices (adventure-level, not StoryData)
    if ((data as any).startingChoices) {
      setStartingChoices(
        applyItemChanges(
          startingChoices,
          (data as any).startingChoices as any,
          "starting choice",
          "text"
        ) as StartingChoice[]
      );
    }

    addNotification("AI changes applied successfully!", "success");
    setIsAIMenuOpen(false);
  };

  // Load adventure data if editing
  useEffect(() => {
    if (!editAdventureId) return;
    if (!user) return; // Wait for auth to be ready

    const loadAdventure = async () => {
      setLoading(true);
      try {
        // First, try loading from database
        const response = await authenticatedFetch(
          `/api/adventures/${editAdventureId}`
        );

        let adventure: Adventure | null = null;
        let isFromLocal = false;

        if (response.ok) {
          const data = await response.json();
          adventure = data.adventure;

          // Verify user is the author
          if (adventure!.authorId !== user?.id) {
            addNotification("You can only edit your own adventures", "failure");
            router.push("/explorer");
            return;
          }
        } else if (response.status === 404) {
          // Not in database, try loading from IndexedDB
          try {
            const localAdv = await getLocalAdventure(editAdventureId);
            if (localAdv) {
              adventure = localAdv.adventureData as Adventure;
              isFromLocal = true;
              setIsLocal(true);
            } else {
              throw new Error(
                "Adventure not found in database or local storage"
              );
            }
          } catch (localErr) {
            throw new Error("Adventure not found");
          }
        } else {
          throw new Error("Failed to load adventure");
        }

        if (!adventure) {
          throw new Error("Adventure data is empty");
        }

        // Load basic info
        setTitle(adventure.title || "");
        setShortDescription(adventure.shortDescription || "");
        setDescription(adventure.description || "");
        setDifficulty(adventure.difficulty || "Medium");
        setRpgSystem(adventure.storyTemplate?.rpgSystem || "3d6");
        setVisibility(adventure.visibility || "public");
        setNsfw(adventure.nsfw || false);
        setTags(adventure.tags || []);
        setThumbnailUrl(adventure.thumbnailUrl || "");
        setBannerUrl(adventure.bannerUrl || "");

        // Load starting choices from adventure
        setStartingChoices(adventure.startingChoices || []);

        // Load story template data
        const template = adventure.storyTemplate;
        setPlayerName(template.player_name || "");
        setPlayerSummary(template.player_summary || "");
        setPremise(template.premise || "");
        setIntro(template.intro || "");
        setMaxChapters(template.max_chapters || 8);
        setAuthorNotes(template.author_notes || "");
        setSelectedPreset(
          template.selected_preset || adventure.selectedPreset || "custom"
        );
        setPresets(template.presets || adventure.presets || [DEFAULT_PRESET]);

        // Load stats, resources, inventory, etc.
        setStats(template.stats || []);
        setResources(template.resources || []);
        setInventory(template.inventory || []);
        setPlotBeats(template.plot_beats || []);
        setLore(template.lore || []);
        setRelationships(template.relationships || []);
        setAchievements(template.achievements || []);
        setQuests(template.quests || []);
        setCustomTables(template.customTables || []);
        setVariables(template.variables || []);
        setUpgradeSettings(
          template.upgradeSettings || DEFAULT_UPGRADE_SETTINGS
        );

        // Load points and momentum
        setPoints(template.points || 0);
        setMomentum(template.momentum || 0);
        setMaxMomentum(template.maxMomentum || 5);

        // Load Mythic GME state
        if (template.mythicState) {
          setMythicEnabled(true);
          setMythicState(template.mythicState);
        } else {
          setMythicEnabled(false);
          setMythicState({
            chaosFactor: 5,
            threads: [],
            characters: [],
            sceneCount: 0,
            skillCheckHistory: [],
            currentStreak: 0,
            lastChaosAdjustment: -999,
          });
        }

        // After loading from API, overlay any unsaved draft changes
        try {
          const draftKey = `your-story:creator-draft:${editAdventureId}`;
          const raw =
            typeof window !== "undefined"
              ? window.localStorage.getItem(draftKey)
              : null;
          if (raw) {
            const saved = JSON.parse(raw) as any;

            if (saved.title) setTitle(saved.title);
            if (saved.shortDescription)
              setShortDescription(saved.shortDescription);
            if (saved.description) setDescription(saved.description);
            if (saved.difficulty) setDifficulty(saved.difficulty);
            if (saved.rpgSystem) setRpgSystem(saved.rpgSystem);
            if (saved.visibility) setVisibility(saved.visibility);
            if (saved.nsfw !== undefined) setNsfw(saved.nsfw);
            if (Array.isArray(saved.tags)) setTags(saved.tags);
            if (saved.thumbnailUrl) setThumbnailUrl(saved.thumbnailUrl);
            if (saved.bannerUrl) setBannerUrl(saved.bannerUrl);

            if (saved.selectedPreset !== undefined)
              setSelectedPreset(saved.selectedPreset);
            if (Array.isArray(saved.presets)) setPresets(saved.presets);
            if (saved.playerName !== undefined) setPlayerName(saved.playerName);
            if (saved.playerSummary !== undefined)
              setPlayerSummary(saved.playerSummary);
            if (saved.premise !== undefined) setPremise(saved.premise);
            if (saved.intro !== undefined) setIntro(saved.intro);
            if (typeof saved.maxChapters === "number")
              setMaxChapters(saved.maxChapters);
            if (saved.authorNotes !== undefined)
              setAuthorNotes(saved.authorNotes);

            if (typeof saved.points === "number") setPoints(saved.points);
            if (typeof saved.momentum === "number") setMomentum(saved.momentum);
            if (typeof saved.maxMomentum === "number")
              setMaxMomentum(saved.maxMomentum);

            if (Array.isArray(saved.stats)) setStats(saved.stats);
            if (Array.isArray(saved.resources)) setResources(saved.resources);
            if (Array.isArray(saved.inventory)) setInventory(saved.inventory);
            if (Array.isArray(saved.plotBeats)) setPlotBeats(saved.plotBeats);
            if (Array.isArray(saved.lore)) setLore(saved.lore);
            if (Array.isArray(saved.relationships))
              setRelationships(saved.relationships);
            if (Array.isArray(saved.achievements))
              setAchievements(saved.achievements);
            if (Array.isArray(saved.quests)) setQuests(saved.quests);
            if (Array.isArray(saved.customTables))
              setCustomTables(saved.customTables);
            if (Array.isArray(saved.variables)) setVariables(saved.variables);
            if (saved.upgradeSettings)
              setUpgradeSettings(saved.upgradeSettings);
            if (saved.mythicEnabled !== undefined)
              setMythicEnabled(saved.mythicEnabled);
            if (saved.mythicState) setMythicState(saved.mythicState);
            if (Array.isArray(saved.startingChoices))
              setStartingChoices(saved.startingChoices);

            if (
              typeof saved.currentStep === "string" &&
              steps.some((s) => s.id === saved.currentStep)
            ) {
              setCurrentStep(saved.currentStep as CreatorStep);
            }

            addNotification(
              "Adventure loaded with unsaved changes from this device",
              "success"
            );
          } else {
            addNotification(
              isFromLocal
                ? "Local adventure loaded for editing"
                : "Adventure loaded for editing",
              "success"
            );
          }
        } catch (err) {
          console.error("Failed to restore draft overlay", err);
          addNotification(
            isFromLocal
              ? "Local adventure loaded for editing"
              : "Adventure loaded for editing",
            "success"
          );
        }
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
  }, [editAdventureId, user, router, addNotification]);

  // Story Data
  const [playerName, setPlayerName] = useState("");
  const [playerSummary, setPlayerSummary] = useState("");
  const [premise, setPremise] = useState("");
  const [intro, setIntro] = useState("");
  const [maxChapters, setMaxChapters] = useState(8);
  const [authorNotes, setAuthorNotes] = useState("");

  // Points and Momentum
  const [points, setPoints] = useState(0);
  const [momentum, setMomentum] = useState(0);
  const [maxMomentum, setMaxMomentum] = useState(100);

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

  // Plot Beats
  const [plotBeats, setPlotBeats] = useState<PlotBeat[]>([]);
  const [newPlotBeat, setNewPlotBeat] = useState<Partial<PlotBeat>>({
    title: "",
    content: "",
    fulfilled: false,
  });
  const [draggedPlotBeatIndex, setDraggedPlotBeatIndex] = useState<
    number | null
  >(null);
  const [editingPlotBeatIndex, setEditingPlotBeatIndex] = useState<
    number | null
  >(null);
  const [editPlotBeat, setEditPlotBeat] = useState<Partial<PlotBeat>>({});

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
    beats_trigger: [],
    beats_untrigger: [],
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

  // Relationships
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [newRelationship, setNewRelationship] = useState<Partial<Relationship>>(
    {
      name: "",
      value: 0,
      description: "",
      symbol: "Meh",
    }
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

  // Mythic GME
  const [mythicEnabled, setMythicEnabled] = useState(false);
  const [mythicState, setMythicState] = useState<MythicState>({
    chaosFactor: 5,
    threads: [],
    characters: [],
    sceneCount: 0,
    skillCheckHistory: [],
    currentStreak: 0,
    lastChaosAdjustment: -999,
  });
  const [newThread, setNewThread] = useState("");
  const [newCharacterName, setNewCharacterName] = useState("");
  const [newCharacterRole, setNewCharacterRole] = useState("");
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editThreadDescription, setEditThreadDescription] = useState("");
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(
    null
  );
  const [editCharacterName, setEditCharacterName] = useState("");
  const [editCharacterRole, setEditCharacterRole] = useState("");

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
    {}
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
    null
  );
  const [editingQuestIndex, setEditingQuestIndex] = useState<number | null>(
    null
  );
  const [editQuest, setEditQuest] = useState<Partial<Quest>>({});

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
    mythic_check: "",
    mythic_context_only: false,
    mythic_table: "",
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
    null
  );
  const [editTable, setEditTable] = useState<Partial<CustomTable>>({});

  // Variables
  const [variables, setVariables] = useState<Variable[]>([]);

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
    { id: "preset", label: "Character Preset", icon: "User" },
    { id: "premise", label: "Story Setup", icon: "BookOpen" },
    { id: "starting-choices", label: "Starting Choices", icon: "Play" },
    { id: "stats", label: "Stats", icon: "BarChart2" },
    { id: "resources", label: "Resources", icon: "Gem" },
    { id: "inventory", label: "Starting Items", icon: "Backpack" },
    { id: "lore", label: "Lore", icon: "Scroll" },
    { id: "relationships", label: "Relationships", icon: "Users" },
    { id: "achievements", label: "Achievements", icon: "Trophy" },
    { id: "quests", label: "Quests", icon: "ClipboardList" },
    { id: "variables", label: "Variables", icon: "Variable" },
    { id: "tables", label: "Custom Tables", icon: "Dices" },
    { id: "plot", label: "Plot Beats", icon: "Clapperboard" },
    { id: "mythic", label: "Mythic GME", icon: "Sparkles" },
    { id: "upgrades", label: "Upgrade Settings", icon: "ArrowUpCircle" },
    { id: "preview", label: "Preview", icon: "Eye" },
  ];

  // Load draft on mount (only for new adventures, not edit mode)
  useEffect(() => {
    // Skip if editing - the edit effect handles draft overlay after API load
    if (editAdventureId) return;
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
      if (saved.playerName !== undefined) setPlayerName(saved.playerName);
      if (saved.playerSummary !== undefined)
        setPlayerSummary(saved.playerSummary);
      if (saved.premise !== undefined) setPremise(saved.premise);
      if (saved.intro !== undefined) setIntro(saved.intro);
      if (typeof saved.maxChapters === "number")
        setMaxChapters(saved.maxChapters);
      if (saved.authorNotes !== undefined) setAuthorNotes(saved.authorNotes);

      if (typeof saved.points === "number") setPoints(saved.points);
      if (typeof saved.momentum === "number") setMomentum(saved.momentum);
      if (typeof saved.maxMomentum === "number")
        setMaxMomentum(saved.maxMomentum);

      if (Array.isArray(saved.stats)) setStats(saved.stats);
      if (Array.isArray(saved.resources)) setResources(saved.resources);
      if (Array.isArray(saved.inventory)) setInventory(saved.inventory);
      if (Array.isArray(saved.plotBeats)) setPlotBeats(saved.plotBeats);
      if (Array.isArray(saved.lore)) setLore(saved.lore);
      if (Array.isArray(saved.achievements))
        setAchievements(saved.achievements);
      if (Array.isArray(saved.quests)) setQuests(saved.quests);
      if (Array.isArray(saved.customTables))
        setCustomTables(saved.customTables);
      if (Array.isArray(saved.variables)) setVariables(saved.variables);
      if (saved.upgradeSettings) setUpgradeSettings(saved.upgradeSettings);
      if (saved.mythicEnabled !== undefined)
        setMythicEnabled(saved.mythicEnabled);
      if (saved.mythicState) setMythicState(saved.mythicState);
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
        "success"
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
      rpgSystem,
      visibility,
      nsfw,
      tags,
      thumbnailUrl,
      bannerUrl,
      selectedPreset,
      presets,
      playerName,
      playerSummary,
      premise,
      intro,
      maxChapters,
      authorNotes,
      points,
      momentum,
      maxMomentum,
      stats,
      resources,
      inventory,
      plotBeats,
      lore,
      relationships,
      achievements,
      quests,
      customTables,
      variables,
      upgradeSettings,
      mythicEnabled,
      mythicState,
      startingChoices,
      currentStep,
      updatedAt: Date.now(),
    };

    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(draftKey, JSON.stringify(payload));
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
    playerName,
    playerSummary,
    premise,
    intro,
    maxChapters,
    authorNotes,
    points,
    momentum,
    maxMomentum,
    stats,
    resources,
    inventory,
    plotBeats,
    lore,
    relationships,
    achievements,
    quests,
    customTables,
    variables,
    mythicEnabled,
    mythicState,
    upgradeSettings,
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
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      addNotification("Please select an image file", "warning");
      return;
    }

    setUploadingThumbnail(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const compressed = await compressImage(file, 400, 300, 0.8);

      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}-thumbnail.${fileExt}`;
      const filePath = `${session.user.id}/adventure-thumbnails/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("adventure-images")
        .upload(filePath, compressed, { cacheControl: "3600", upsert: false });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("adventure-images")
        .getPublicUrl(filePath);

      setThumbnailUrl(data.publicUrl);
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
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const compressed = await compressImage(file, 1200, 400, 0.85);

      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}-banner.${fileExt}`;
      const filePath = `${session.user.id}/adventure-banners/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("adventure-images")
        .upload(filePath, compressed, { cacheControl: "3600", upsert: false });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("adventure-images")
        .getPublicUrl(filePath);

      setBannerUrl(data.publicUrl);
      addNotification("Banner uploaded!", "success");
    } catch (error: any) {
      console.error("Error uploading banner:", error);
      addNotification(`Upload failed: ${error.message}`, "failure");
    } finally {
      setUploadingBanner(false);
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

  const addPlotBeat = () => {
    if (newPlotBeat.title && newPlotBeat.content) {
      setPlotBeats([...plotBeats, newPlotBeat as PlotBeat]);
      setNewPlotBeat({ title: "", content: "", fulfilled: false });
    }
  };

  const removePlotBeat = (index: number) => {
    setPlotBeats(plotBeats.filter((_, i) => i !== index));
  };

  const handlePlotBeatDragStart = (index: number) => {
    setDraggedPlotBeatIndex(index);
  };

  const handlePlotBeatDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedPlotBeatIndex === null || draggedPlotBeatIndex === index) return;

    const newPlotBeats = [...plotBeats];
    const draggedItem = newPlotBeats[draggedPlotBeatIndex];
    newPlotBeats.splice(draggedPlotBeatIndex, 1);
    newPlotBeats.splice(index, 0, draggedItem);

    setPlotBeats(newPlotBeats);
    setDraggedPlotBeatIndex(index);
  };

  const handlePlotBeatDragEnd = () => {
    setDraggedPlotBeatIndex(null);
  };

  const movePlotBeatUp = (index: number) => {
    if (index === 0) return;
    const newPlotBeats = [...plotBeats];
    [newPlotBeats[index - 1], newPlotBeats[index]] = [
      newPlotBeats[index],
      newPlotBeats[index - 1],
    ];
    setPlotBeats(newPlotBeats);
  };

  const movePlotBeatDown = (index: number) => {
    if (index === plotBeats.length - 1) return;
    const newPlotBeats = [...plotBeats];
    [newPlotBeats[index], newPlotBeats[index + 1]] = [
      newPlotBeats[index + 1],
      newPlotBeats[index],
    ];
    setPlotBeats(newPlotBeats);
  };

  const startEditPlotBeat = (index: number) => {
    setEditingPlotBeatIndex(index);
    setEditPlotBeat({ ...plotBeats[index] });
  };

  const cancelEditPlotBeat = () => {
    setEditingPlotBeatIndex(null);
    setEditPlotBeat({});
  };

  const saveEditPlotBeat = () => {
    if (
      editingPlotBeatIndex !== null &&
      editPlotBeat.title &&
      editPlotBeat.content
    ) {
      const updated = [...plotBeats];
      updated[editingPlotBeatIndex] = editPlotBeat as PlotBeat;
      setPlotBeats(updated);
      setEditingPlotBeatIndex(null);
      setEditPlotBeat({});
    }
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
        beats_trigger: [],
        beats_untrigger: [],
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

  const handleSaveLocally = async () => {
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

    // Build the story data
    const storyData: Partial<StoryData> = {
      story_name: title,
      premise,
      player_name: playerName || "Hero",
      player_summary: playerSummary || "An adventurer",
      intro: intro,
      plot_beats: plotBeats,
      memory: [],
      max_chapters: maxChapters,
      currentChapter: 0,
      chapters: [],
      scene: { parts: [] },
      stats,
      resources,
      inventory,
      achievements,
      lore,
      relationships,
      quests,
      customTables,
      variables,
      earnedPointsFromQuests: [],
      momentum,
      maxMomentum,
      points,
      earnedPointsFromBeats: [],
      earnedPointsFromChapters: [],
      author_notes: authorNotes,
      selected_preset: selectedPreset,
      presets: presets,
      upgradeSettings: upgradeSettings,
      rpgSystem: rpgSystem,
      mythicState: mythicEnabled ? mythicState : undefined,
    };

    // Save complete adventure using localAdventureManager
    try {
      const adventureTemplate: Partial<Adventure> = {
        title,
        shortDescription,
        description,
        thumbnailUrl: thumbnailUrl || "",
        bannerUrl: bannerUrl || "",
        tags,
        difficulty: difficulty as "Easy" | "Medium" | "Hard" | "Expert",
        nsfw,
        estimatedDuration: "1-2 hours",
        storyTemplate: storyData,
        presets: presets,
        startingChoices:
          startingChoices.length > 0 ? startingChoices : undefined,
      };

      // Use existing ID if editing a local adventure, otherwise generate new ID
      const localId =
        isLocal && editAdventureId
          ? editAdventureId
          : `local:${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Save to IndexedDB using localAdventureManager
      await saveLocalAdventure(localId, adventureTemplate);

      addNotification(
        "Adventure saved locally! You can find it in your library.",
        "success"
      );

      // If this is a new adventure, update the URL to edit mode and set isLocal
      if (!editAdventureId) {
        setIsLocal(true);
        // Update URL without navigation to switch to edit mode
        window.history.replaceState(null, "", `/creator?edit=${localId}`);
        // Clear the new adventure draft since we now have a saved local adventure
        if (draftKey && typeof window !== "undefined") {
          window.localStorage.removeItem(draftKey);
        }
      }

      // Navigate to library to see the saved adventure
      router.push("/library");
    } catch (error: any) {
      console.error("Error saving locally:", error);
      addNotification(`Failed to save locally: ${error.message}`, "failure");
    }
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
      setDifficulty("Medium");
      setRpgSystem("3d6");
      setVisibility("private");
      setNsfw(false);
      setTags([]);
      setThumbnailUrl("");
      setBannerUrl("");
      setPlayerName("");
      setPlayerSummary("");
      setPremise("");
      setIntro("");
      setMaxChapters(8);
      setAuthorNotes("");
      setPoints(0);
      setMomentum(0);
      setMaxMomentum(100);
      setStats([]);
      setResources([]);
      setInventory([]);
      setPlotBeats([]);
      setLore([]);
      setRelationships([]);
      setAchievements([]);
      setQuests([]);
      setCustomTables([]);
      setSelectedPreset("custom");
      setPresets([DEFAULT_PRESET]);
      setUpgradeSettings(DEFAULT_UPGRADE_SETTINGS);
      setMythicEnabled(false);
      setMythicState({
        chaosFactor: 5,
        threads: [],
        characters: [],
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

  const handleSaveToDatabase = async () => {
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

    try {
      // Build the story data
      const storyData: Partial<StoryData> = {
        story_name: title,
        premise,
        player_name: playerName || "Hero",
        player_summary: playerSummary || "An adventurer",
        intro: intro,
        plot_beats: plotBeats,
        memory: [],
        max_chapters: maxChapters,
        currentChapter: 0,
        chapters: [],
        scene: { parts: [] },
        stats,
        resources,
        inventory,
        achievements,
        lore,
        relationships,
        quests,
        customTables,
        variables,
        earnedPointsFromQuests: [],
        momentum,
        maxMomentum,
        points,
        earnedPointsFromBeats: [],
        earnedPointsFromChapters: [],
        author_notes: authorNotes,
        selected_preset: selectedPreset,
        presets: presets,
        upgradeSettings: upgradeSettings,
        rpgSystem: rpgSystem,
        mythicState: mythicEnabled ? mythicState : undefined,
      };

      // Get auth token
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated");
      }

      const payload = {
        title,
        shortDescription,
        description,
        thumbnailUrl: thumbnailUrl || undefined,
        bannerUrl: bannerUrl || undefined,
        authorId: user!.id,
        tags,
        difficulty: difficulty.toLowerCase(),
        visibility: visibility.toLowerCase(),
        nsfw,
        estimatedDuration: "1-2 hours",
        isPublished: true,
        isFeatured: false,
        storyTemplate: storyData,
        selectedPreset: selectedPreset,
        presets: presets,
        startingChoices:
          startingChoices.length > 0 ? startingChoices : undefined,
      };

      // Check payload size
      const payloadSize = JSON.stringify(payload).length;
      console.log(
        `Adventure payload size: ${(payloadSize / 1024).toFixed(2)} KB`
      );

      if (payloadSize > 4 * 1024 * 1024) {
        addNotification(
          "Adventure data is very large (>4MB). Consider reducing lore entries or plot beats.",
          "warning"
        );
      }

      const response = await fetch("/api/adventures", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error || "Failed to upload adventure to database"
        );
      }

      const { adventure } = await response.json();

      // Success! Remove from IndexedDB and clear local state
      if (editAdventureId) {
        await deleteLocalAdventure(editAdventureId);
      }
      setIsLocal(false);

      // Clear draft from localStorage
      if (draftKey && typeof window !== "undefined") {
        window.localStorage.removeItem(draftKey);
      }

      addNotification("Adventure saved to database successfully!", "success");

      // Navigate to the database version
      router.push(`/creator?edit=${adventure.id}`);
    } catch (error) {
      console.error("Error uploading adventure:", error);
      addNotification(
        error instanceof Error ? error.message : "Failed to upload adventure",
        "failure"
      );
    } finally {
      setSaving(false);
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
      player_name: playerName || "Hero",
      player_summary: playerSummary || "An adventurer",
      intro: intro,
      plot_beats: plotBeats,
      memory: [],
      max_chapters: maxChapters,
      currentChapter: 0,
      chapters: [],
      scene: { parts: [] },
      stats,
      resources,
      inventory,
      achievements,
      lore,
      relationships,
      quests,
      customTables,
      variables,
      earnedPointsFromQuests: [],
      momentum,
      maxMomentum,
      points,
      earnedPointsFromBeats: [],
      earnedPointsFromChapters: [],
      author_notes: authorNotes,
      selected_preset: selectedPreset,
      presets: presets,
      upgradeSettings: upgradeSettings,
      rpgSystem: rpgSystem,
      mythicState: mythicEnabled ? mythicState : undefined,
    };

    // If editing a local adventure, save to IndexedDB instead of database
    if (isLocal) {
      try {
        const adventureData: Partial<Adventure> = {
          title,
          shortDescription,
          description,
          thumbnailUrl: thumbnailUrl || undefined,
          bannerUrl: bannerUrl || undefined,
          authorId: user!.id,
          tags,
          difficulty: difficulty.toLowerCase() as any,
          visibility: visibility.toLowerCase() as any,
          nsfw,
          estimatedDuration: "1-2 hours",
          isPublished: false, // Local adventures are unpublished drafts
          isFeatured: false,
          storyTemplate: storyData,
          selectedPreset: selectedPreset,
          presets: presets,
          startingChoices:
            startingChoices.length > 0 ? startingChoices : undefined,
        };

        await saveLocalAdventure(editAdventureId!, adventureData);

        // Clear draft from localStorage since we just saved
        if (draftKey && typeof window !== "undefined") {
          window.localStorage.removeItem(draftKey);
        }

        addNotification("Adventure saved locally", "success");
        setSaving(false);
        return;
      } catch (error) {
        console.error("Error saving locally:", error);
        addNotification(
          error instanceof Error ? error.message : "Failed to save locally",
          "failure"
        );
        setSaving(false);
        return;
      }
    }

    //Save to database
    try {
      // Get auth token
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated");
      }

      const isEditing = !!editAdventureId;
      const url = isEditing
        ? `/api/adventures/${editAdventureId}`
        : "/api/adventures";
      const method = isEditing ? "PATCH" : "POST";

      const payload = {
        title,
        shortDescription,
        description,
        thumbnailUrl: thumbnailUrl || undefined,
        bannerUrl: bannerUrl || undefined,
        authorId: user!.id,
        tags,
        difficulty: difficulty.toLowerCase(),
        visibility: visibility.toLowerCase(),
        nsfw,
        estimatedDuration: "1-2 hours",
        isPublished: true,
        isFeatured: false,
        storyTemplate: storyData,
        selectedPreset: selectedPreset,
        presets: presets,
        startingChoices:
          startingChoices.length > 0 ? startingChoices : undefined,
      };

      // Check payload size
      const payloadSize = JSON.stringify(payload).length;
      console.log(
        `Adventure payload size: ${(payloadSize / 1024).toFixed(2)} KB`
      );

      if (payloadSize > 4 * 1024 * 1024) {
        addNotification(
          "Adventure data is very large (>4MB). Consider reducing lore entries or plot beats.",
          "warning"
        );
      }

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error ||
            `Failed to ${isEditing ? "update" : "create"} adventure`
        );
      }

      const { adventure } = await response.json();
      addNotification(
        `Adventure ${isEditing ? "updated" : "created"} successfully!`,
        "success"
      );

      // Clear local draft after successful save
      try {
        if (draftKey && typeof window !== "undefined") {
          window.localStorage.removeItem(draftKey);
        }
      } catch (err) {
        console.error("Failed to clear creator draft", err);
      }

      setSaving(false);
      router.push(`/explorer/${adventure.id}`);
    } catch (error: any) {
      console.error("Error saving adventure:", error);
      addNotification(`Failed to save: ${error.message}`, "failure");
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
                maxLength={150}
              />
              <p className="text-xs text-blue-300/60 mt-1">
                {shortDescription.length}/150 characters
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
                maxLength={1000}
              />
              <p className="text-xs text-blue-300/60 mt-1">
                {description.length}/1000 characters
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-blue-200 mb-2">
                Difficulty
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(["Easy", "Medium", "Hard", "Expert"] as const).map((diff) => (
                  <button
                    key={diff}
                    onClick={() => setDifficulty(diff)}
                    className={`px-4 py-3 rounded-lg font-semibold border-2 transition-all ${
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
                RPG Dice System
              </label>
              <p className="text-xs text-blue-300/60 mb-3">
                Choose how dice rolls determine success in your adventure.
              </p>

              {/* Popular Systems */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <button
                  onClick={() => setRpgSystem("3d6")}
                  className={`px-4 py-3 rounded-lg font-semibold border-2 transition-all ${
                    rpgSystem === "3d6"
                      ? "bg-purple-600 text-white border-purple-600 ring-2 ring-purple-400"
                      : "bg-blue-900/30 text-blue-200 border-blue-700/40 hover:bg-blue-800/40"
                  }`}
                >
                  <DynamicIcon name="Dices" className="w-5 h-5 inline mr-2" />
                  3d6 (Recommended)
                  <div className="text-xs opacity-75 mt-1">
                    Roll 3-18, predictable bell curve
                  </div>
                </button>
                <button
                  onClick={() => setRpgSystem("1d20")}
                  className={`px-4 py-3 rounded-lg font-semibold border-2 transition-all ${
                    rpgSystem === "1d20"
                      ? "bg-purple-600 text-white border-purple-600 ring-2 ring-purple-400"
                      : "bg-blue-900/30 text-blue-200 border-blue-700/40 hover:bg-blue-800/40"
                  }`}
                >
                  <DynamicIcon name="Dices" className="w-5 h-5 inline mr-2" />
                  1d20 (D&D Style)
                  <div className="text-xs opacity-75 mt-1">
                    Roll 1-20, swingy results
                  </div>
                </button>
                <button
                  onClick={() => setRpgSystem("narrative")}
                  className={`px-4 py-3 rounded-lg font-semibold border-2 transition-all col-span-2 ${
                    rpgSystem === "narrative"
                      ? "bg-purple-600 text-white border-purple-600 ring-2 ring-purple-400"
                      : "bg-blue-900/30 text-blue-200 border-blue-700/40 hover:bg-blue-800/40"
                  }`}
                >
                  <DynamicIcon
                    name="BookHeart"
                    className="w-5 h-5 inline mr-2"
                  />
                  Narrative (No Dice)
                  <div className="text-xs opacity-75 mt-1">
                    Pure storytelling, outcomes from dramatic logic
                  </div>
                </button>
              </div>

              {/* Show More Systems Toggle */}
              <button
                onClick={() => setShowAllSystems(!showAllSystems)}
                className="w-full py-2 text-sm text-blue-300 hover:text-purple-300 transition-colors flex items-center justify-center gap-2"
              >
                <DynamicIcon
                  name={showAllSystems ? "ChevronUp" : "ChevronDown"}
                  className="w-4 h-4"
                />
                {showAllSystems
                  ? "Hide advanced systems"
                  : "Show more systems (6 more)"}
              </button>

              {/* Advanced Systems (Collapsible) */}
              {showAllSystems && (
                <div className="grid grid-cols-2 gap-3 mt-3 animate-in slide-in-from-top-2 duration-200">
                  <button
                    onClick={() => setRpgSystem("1d100")}
                    className={`px-4 py-3 rounded-lg font-semibold border-2 transition-all ${
                      rpgSystem === "1d100"
                        ? "bg-purple-600 text-white border-purple-600 ring-2 ring-purple-400"
                        : "bg-blue-900/30 text-blue-200 border-blue-700/40 hover:bg-blue-800/40"
                    }`}
                  >
                    <DynamicIcon name="Dices" className="w-5 h-5 inline mr-2" />
                    1d100
                    <div className="text-xs opacity-75 mt-1">
                      Roll 1-100, very granular
                    </div>
                  </button>
                  <button
                    onClick={() => setRpgSystem("percentile")}
                    className={`px-4 py-3 rounded-lg font-semibold border-2 transition-all ${
                      rpgSystem === "percentile"
                        ? "bg-purple-600 text-white border-purple-600 ring-2 ring-purple-400"
                        : "bg-blue-900/30 text-blue-200 border-blue-700/40 hover:bg-blue-800/40"
                    }`}
                  >
                    <DynamicIcon
                      name="TrendingDown"
                      className="w-5 h-5 inline mr-2"
                    />
                    Classic Percentile
                    <div className="text-xs opacity-75 mt-1">
                      Roll under stat to win
                    </div>
                  </button>
                  <button
                    onClick={() => setRpgSystem("pbta")}
                    className={`px-4 py-3 rounded-lg font-semibold border-2 transition-all col-span-2 ${
                      rpgSystem === "pbta"
                        ? "bg-purple-600 text-white border-purple-600 ring-2 ring-purple-400"
                        : "bg-blue-900/30 text-blue-200 border-blue-700/40 hover:bg-blue-800/40"
                    }`}
                  >
                    <DynamicIcon name="Zap" className="w-5 h-5 inline mr-2" />
                    Powered by the Apocalypse (PbtA)
                    <div className="text-xs opacity-75 mt-1">
                      2d6+mod: 10+ success, 7-9 partial, 6- failure
                    </div>
                  </button>
                  <button
                    onClick={() => setRpgSystem("fate")}
                    className={`px-4 py-3 rounded-lg font-semibold border-2 transition-all col-span-2 ${
                      rpgSystem === "fate"
                        ? "bg-purple-600 text-white border-purple-600 ring-2 ring-purple-400"
                        : "bg-blue-900/30 text-blue-200 border-blue-700/40 hover:bg-blue-800/40"
                    }`}
                  >
                    <DynamicIcon name="Scale" className="w-5 h-5 inline mr-2" />
                    Fate Core (4dF)
                    <div className="text-xs opacity-75 mt-1">
                      Fudge dice + ladder: fail/tie/succeed/style
                    </div>
                  </button>
                  <button
                    onClick={() => setRpgSystem("yze")}
                    className={`px-4 py-3 rounded-lg font-semibold border-2 transition-all col-span-2 ${
                      rpgSystem === "yze"
                        ? "bg-purple-600 text-white border-purple-600 ring-2 ring-purple-400"
                        : "bg-blue-900/30 text-blue-200 border-blue-700/40 hover:bg-blue-800/40"
                    }`}
                  >
                    <DynamicIcon name="Skull" className="w-5 h-5 inline mr-2" />
                    Year Zero Engine (YZE)
                    <div className="text-xs opacity-75 mt-1">
                      d6 pool, count 6s, stress + panic
                    </div>
                  </button>
                  <button
                    onClick={() => setRpgSystem("explosive")}
                    className={`px-4 py-3 rounded-lg font-semibold border-2 transition-all col-span-2 ${
                      rpgSystem === "explosive"
                        ? "bg-purple-600 text-white border-purple-600 ring-2 ring-purple-400"
                        : "bg-blue-900/30 text-blue-200 border-blue-700/40 hover:bg-blue-800/40"
                    }`}
                  >
                    <DynamicIcon name="Flame" className="w-5 h-5 inline mr-2" />
                    Exploding Dice
                    <div className="text-xs opacity-75 mt-1">
                      Stat = die size, max rolls explode!
                    </div>
                  </button>
                </div>
              )}
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
                    Recommended: 400?300px (or 320?180px), max 5MB
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
                    <div className="flex-1">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleThumbnailUpload}
                        disabled={uploadingThumbnail}
                        className="hidden"
                        id="thumbnail-upload"
                      />
                      <label
                        htmlFor="thumbnail-upload"
                        className={`block px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors text-center cursor-pointer ${
                          uploadingThumbnail
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
                    </div>
                  </div>
                </div>

                {/* Banner Upload */}
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-2">
                    Banner Image
                  </label>
                  <p className="text-xs text-blue-300/60 mb-3">
                    Recommended: 1200?400px, max 5MB
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
                    <div className="flex-1">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleBannerUpload}
                        disabled={uploadingBanner}
                        className="hidden"
                        id="banner-upload"
                      />
                      <label
                        htmlFor="banner-upload"
                        className={`block px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors text-center cursor-pointer ${
                          uploadingBanner ? "opacity-50 cursor-not-allowed" : ""
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
                    </div>
                  </div>
                </div>
              </div>
            )}
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
                  setShowPresetForm(!showPresetForm);
                  setEditingPresetId(null);
                  setNewPresetName("");
                  setNewPresetDescription("");
                  setNewPresetIcon("Star");
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

                  <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-lg p-3">
                    <p className="text-xs text-yellow-300">
                      <DynamicIcon
                        name="Lightbulb"
                        className="w-4 h-4 inline mr-2 text-yellow-400"
                      />{" "}
                      <strong>Tip:</strong> The preset will copy your current
                      Player Name, Player Summary, Intro, Stats, Resources,
                      Inventory, and Author Notes. Make sure they&apos;re
                      configured as you want before saving!
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
                            "warning"
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
                                    playerName,
                                    playerSummary,
                                    intro,
                                    stats: JSON.parse(JSON.stringify(stats)),
                                    resources: JSON.parse(
                                      JSON.stringify(resources)
                                    ),
                                    inventory: JSON.parse(
                                      JSON.stringify(inventory)
                                    ),
                                    relationships: JSON.parse(
                                      JSON.stringify(relationships)
                                    ),
                                    authorNotes,
                                  }
                                : p
                            )
                          );
                          addNotification("Preset updated!", "success");
                        } else {
                          // Create new preset
                          const newPreset = createPresetFromCurrentSettings(
                            newPresetName,
                            newPresetDescription,
                            newPresetIcon,
                            playerName,
                            playerSummary,
                            intro,
                            stats,
                            resources,
                            inventory,
                            relationships,
                            authorNotes
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
                        setSelectedPreset(preset.id);

                        // Apply preset immediately
                        if (preset.id !== "custom") {
                          applyPreset(
                            preset,
                            setPlayerName,
                            setPlayerSummary,
                            setIntro,
                            setStats,
                            setResources,
                            setInventory,
                            setRelationships,
                            setAuthorNotes
                          );
                          addNotification(
                            `${preset.name} preset applied!`,
                            "success"
                          );
                        } else {
                          addNotification(
                            "Custom preset selected - build from scratch!",
                            "success"
                          );
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
                                  presets.filter((p) => p.id !== preset.id)
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
                <h4 className="text-sm font-bold text-green-300 mb-2 flex items-center gap-2">
                  <DynamicIcon
                    name="Sparkles"
                    className="w-4 h-4 text-green-400"
                  />{" "}
                  Preset Applied
                </h4>
                <p className="text-xs text-green-400/80">
                  Your character&apos;s stats, items, and resources have been
                  pre-configured. You can review and customize them in the
                  following steps.
                </p>
              </div>
            )}
          </div>
        );

      case "premise":
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-blue-200 mb-2">
                Player Character Name
              </label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="e.g., Aria"
                className="w-full px-4 py-3 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-blue-200 mb-2">
                Player Character Summary
              </label>
              <textarea
                value={playerSummary}
                onChange={(e) => setPlayerSummary(e.target.value)}
                placeholder="A brief description of who the player character is..."
                rows={3}
                className="w-full px-4 py-3 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors resize-none"
              />
            </div>

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

            <div className="bg-purple-900/20 border border-purple-800/50 rounded-lg p-4">
              <p className="text-sm text-purple-300 flex items-start gap-2">
                <DynamicIcon
                  name="Lightbulb"
                  className="w-4 h-4 mt-0.5 shrink-0 text-purple-400"
                />
                <span>
                  <strong>What are these?</strong> <strong>Points</strong> are
                  currency players earn and spend on upgrades (like stat boosts
                  or new abilities).
                  <strong> Momentum</strong> is a bonus resource that builds up
                  from dramatic actions - when it hits max, players can spend it
                  for powerful bonuses on dice rolls.
                </span>
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-semibold text-blue-200 mb-2 flex items-center gap-1">
                  Starting Points
                  <span
                    className="text-xs text-blue-400"
                    title="Used to buy upgrades like stat increases"
                  >
                    💰
                  </span>
                </label>
                <input
                  type="number"
                  min="0"
                  max="99999"
                  value={points}
                  onChange={(e) =>
                    setPoints(clampNumber(parseInt(e.target.value), 0, 99999))
                  }
                  className="w-full px-4 py-3 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
                />
                <p className="text-xs text-blue-300/60 mt-1">
                  Points players start with
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-blue-200 mb-2">
                  Starting Momentum
                </label>
                <input
                  type="number"
                  min="0"
                  max={maxMomentum}
                  value={momentum}
                  onChange={(e) =>
                    setMomentum(
                      clampNumber(parseInt(e.target.value), 0, maxMomentum)
                    )
                  }
                  className="w-full px-4 py-3 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
                />
                <p className="text-xs text-blue-300/60 mt-1">
                  Current momentum value
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-blue-200 mb-2">
                  Max Momentum
                </label>
                <input
                  type="number"
                  min="1"
                  max="999"
                  value={maxMomentum}
                  onChange={(e) =>
                    setMaxMomentum(
                      clampNumber(parseInt(e.target.value), 1, 999)
                    )
                  }
                  className="w-full px-4 py-3 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
                />
                <p className="text-xs text-blue-300/60 mt-1">
                  Maximum momentum capacity
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
                            ? newStartingChoice.skill_dc || 50
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
                        DC (Difficulty)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={newStartingChoice.skill_dc || 50}
                        onChange={(e) =>
                          setNewStartingChoice({
                            ...newStartingChoice,
                            skill_dc: parseInt(e.target.value) || 50,
                          })
                        }
                        className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                      />
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
                {/* Mythic GME Section */}
                {mythicEnabled && (
                  <div className="border-t border-blue-800/30 pt-4 mt-4">
                    <h4 className="text-sm font-bold text-purple-400 mb-3 flex items-center gap-2">
                      <DynamicIcon name="Sparkles" className="w-4 h-4" />
                      Mythic GME Options
                    </h4>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-blue-200 mb-1">
                          Fate Check Question (optional)
                        </label>
                        <input
                          type="text"
                          value={newStartingChoice.mythic_check || ""}
                          onChange={(e) =>
                            setNewStartingChoice({
                              ...newStartingChoice,
                              mythic_check: e.target.value || undefined,
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
                      {newStartingChoice.mythic_check &&
                        newStartingChoice.skill_used && (
                          <label className="flex items-center gap-2 text-sm text-blue-300">
                            <input
                              type="checkbox"
                              checked={
                                newStartingChoice.mythic_context_only || false
                              }
                              onChange={(e) =>
                                setNewStartingChoice({
                                  ...newStartingChoice,
                                  mythic_context_only: e.target.checked,
                                })
                              }
                              className="w-4 h-4 rounded"
                            />
                            Mythic provides context only (doesn&apos;t override
                            skill check)
                          </label>
                        )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-blue-200 mb-1">
                            Mythic Table Roll (optional)
                          </label>
                          <select
                            value={newStartingChoice.mythic_table || ""}
                            onChange={(e) =>
                              setNewStartingChoice({
                                ...newStartingChoice,
                                mythic_table: e.target.value || undefined,
                              })
                            }
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                          >
                            <option value="">No Mythic table</option>
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
                    mythic_check: newStartingChoice.mythic_check || undefined,
                    mythic_context_only:
                      newStartingChoice.mythic_check &&
                      newStartingChoice.skill_used
                        ? newStartingChoice.mythic_context_only
                        : undefined,
                    mythic_table: newStartingChoice.mythic_table || undefined,
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
                    mythic_check: "",
                    mythic_context_only: false,
                    mythic_table: "",
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
                                    ? editStartingChoice.skill_dc || 50
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
                                DC
                              </label>
                              <input
                                type="number"
                                min="1"
                                max="100"
                                value={editStartingChoice.skill_dc || 50}
                                onChange={(e) =>
                                  setEditStartingChoice({
                                    ...editStartingChoice,
                                    skill_dc: parseInt(e.target.value) || 50,
                                  })
                                }
                                className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                              />
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
                        {/* Mythic GME Section in Edit */}
                        {mythicEnabled && (
                          <div className="border-t border-blue-800/30 pt-4 mt-4">
                            <h4 className="text-sm font-bold text-purple-400 mb-3 flex items-center gap-2">
                              <DynamicIcon
                                name="Sparkles"
                                className="w-4 h-4"
                              />
                              Mythic GME Options
                            </h4>
                            <div className="space-y-4">
                              <div>
                                <label className="block text-sm font-semibold text-blue-200 mb-1">
                                  Fate Check Question
                                </label>
                                <input
                                  type="text"
                                  value={editStartingChoice.mythic_check || ""}
                                  onChange={(e) =>
                                    setEditStartingChoice({
                                      ...editStartingChoice,
                                      mythic_check: e.target.value || undefined,
                                    })
                                  }
                                  placeholder="e.g., Is the door locked? (Likely)"
                                  className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                                />
                              </div>
                              {editStartingChoice.mythic_check &&
                                editStartingChoice.skill_used && (
                                  <label className="flex items-center gap-2 text-sm text-blue-300">
                                    <input
                                      type="checkbox"
                                      checked={
                                        editStartingChoice.mythic_context_only ||
                                        false
                                      }
                                      onChange={(e) =>
                                        setEditStartingChoice({
                                          ...editStartingChoice,
                                          mythic_context_only: e.target.checked,
                                        })
                                      }
                                      className="w-4 h-4 rounded"
                                    />
                                    Mythic provides context only
                                  </label>
                                )}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                                    Mythic Table Roll
                                  </label>
                                  <select
                                    value={
                                      editStartingChoice.mythic_table || ""
                                    }
                                    onChange={(e) =>
                                      setEditStartingChoice({
                                        ...editStartingChoice,
                                        mythic_table:
                                          e.target.value || undefined,
                                      })
                                    }
                                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                                  >
                                    <option value="">No Mythic table</option>
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
                                  "warning"
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
                                mythic_check:
                                  editStartingChoice.mythic_check || undefined,
                                mythic_context_only:
                                  editStartingChoice.mythic_check &&
                                  editStartingChoice.skill_used
                                    ? editStartingChoice.mythic_context_only
                                    : undefined,
                                mythic_table:
                                  editStartingChoice.mythic_table || undefined,
                                custom_table:
                                  editStartingChoice.custom_table || undefined,
                              };
                              setStartingChoices(updated);
                              setEditingStartingChoiceIndex(null);
                              setEditStartingChoice({});
                              addNotification(
                                "Starting choice updated!",
                                "success"
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
                                {choice.skill_used} DC {choice.skill_dc}
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
                            {choice.mythic_check && (
                              <span className="px-2 py-0.5 bg-pink-900/30 text-pink-200 rounded text-xs">
                                <DynamicIcon
                                  name="Sparkles"
                                  className="w-3 h-3 inline mr-1"
                                />
                                Fate: {choice.mythic_check}
                              </span>
                            )}
                            {choice.mythic_table && (
                              <span className="px-2 py-0.5 bg-violet-900/30 text-violet-200 rounded text-xs">
                                <DynamicIcon
                                  name="TableProperties"
                                  className="w-3 h-3 inline mr-1"
                                />
                                Mythic: {choice.mythic_table}
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
                                startingChoices.filter((_, i) => i !== index)
                              );
                              addNotification(
                                "Starting choice removed",
                                "success"
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
                  )
                )
              )}
            </div>
          </div>
        );

      case "stats":
        return (
          <div className="space-y-6">
            <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-4">
              <p className="text-sm text-blue-300 flex items-start gap-2">
                <DynamicIcon
                  name="Lightbulb"
                  className="w-4 h-4 mt-0.5 shrink-0"
                />
                <span>
                  <strong>Tip:</strong> Stats represent character attributes
                  that can be tested during skill checks (like Strength,
                  Intelligence, etc.). They range from 0-100.
                </span>
              </p>
            </div>

            <div className="bg-blue-900/20 rounded-lg border border-blue-700/40 p-6">
              <h3 className="text-lg font-bold mb-4 text-white">
                Add New Stat
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={newStat.name}
                    onChange={(e) =>
                      setNewStat({ ...newStat, name: e.target.value })
                    }
                    placeholder="e.g., Strength"
                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Icon
                  </label>
                  <IconPicker
                    value={newStat.symbol || "Star"}
                    onChange={(icon) =>
                      setNewStat({ ...newStat, symbol: icon })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Starting Value (0-100)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={newStat.value}
                    onChange={(e) =>
                      setNewStat({
                        ...newStat,
                        value: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Description *
                  </label>
                  <input
                    type="text"
                    value={newStat.description}
                    onChange={(e) =>
                      setNewStat({ ...newStat, description: e.target.value })
                    }
                    placeholder="e.g., Physical power and combat prowess"
                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                  />
                </div>
              </div>
              <button
                onClick={addStat}
                disabled={!newStat.name || !newStat.description}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
              >
                Add Stat
              </button>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">
                Stats ({stats.length})
              </h3>
              {stats.length === 0 ? (
                <p className="text-blue-300/60 text-sm">No stats added yet</p>
              ) : (
                stats.map((stat, index) =>
                  editingStatIndex === index ? (
                    // Edit mode
                    <div
                      key={index}
                      className="p-4 bg-blue-900/40 rounded-lg border-2 border-blue-600"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="block text-xs font-semibold text-blue-300 mb-1">
                            Name *
                          </label>
                          <input
                            type="text"
                            value={editStat.name || ""}
                            onChange={(e) =>
                              setEditStat({ ...editStat, name: e.target.value })
                            }
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/20 text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-blue-300 mb-1">
                            Icon
                          </label>
                          <IconPicker
                            value={editStat.symbol || "Star"}
                            onChange={(icon) =>
                              setEditStat({
                                ...editStat,
                                symbol: icon,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-blue-300 mb-1">
                            Value (0-100)
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={editStat.value || 0}
                            onChange={(e) =>
                              setEditStat({
                                ...editStat,
                                value: parseInt(e.target.value) || 0,
                              })
                            }
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/20 text-white text-sm"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-blue-300 mb-1">
                            Description *
                          </label>
                          <input
                            type="text"
                            value={editStat.description || ""}
                            onChange={(e) =>
                              setEditStat({
                                ...editStat,
                                description: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/20 text-white text-sm"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={saveEditStat}
                          disabled={!editStat.name || !editStat.description}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors text-sm"
                        >
                          <DynamicIcon
                            name="Save"
                            className="inline-block w-4 h-4 mr-1"
                          />
                          Save
                        </button>
                        <button
                          onClick={cancelEditStat}
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
                      onDragStart={() => handleStatDragStart(index)}
                      onDragOver={(e) => handleStatDragOver(e, index)}
                      onDragEnd={handleStatDragEnd}
                      className="flex items-center gap-3 p-4 bg-blue-900/20 rounded-lg border border-blue-800/50 cursor-move hover:bg-blue-800/30 transition-colors"
                      style={{ opacity: draggedStatIndex === index ? 0.5 : 1 }}
                    >
                      <div className="text-blue-400/50 cursor-grab active:cursor-grabbing">
                        <DynamicIcon name="GripVertical" className="w-5 h-5" />
                      </div>
                      <div className="text-2xl">
                        <DynamicIcon name={stat.symbol} className="w-8 h-8" />
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-white">{stat.name}</div>
                        <div className="text-sm text-blue-300/60">
                          {stat.description}
                        </div>
                        <div className="text-sm text-blue-400 font-semibold">
                          Value: {stat.value}
                        </div>
                      </div>
                      {/* Button Area */}
                      <div className="flex flex-col items-center gap-2">
                        <div className="flex flex-row items-center gap-1 ml-3">
                          <button
                            onClick={() => moveStatUp(index)}
                            disabled={index === 0}
                            className="w-8 h-8 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded transition-colors text-sm"
                            title="Move up"
                          >
                            <DynamicIcon name="ChevronUp" className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => moveStatDown(index)}
                            disabled={index === stats.length - 1}
                            className="w-8 h-8 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded transition-colors text-sm"
                            title="Move down"
                          >
                            <DynamicIcon
                              name="ChevronDown"
                              className="w-4 h-4"
                            />
                          </button>
                        </div>
                        <div className="flex flex-row items-center gap-1 ml-3">
                          <button
                            onClick={() => startEditStat(index)}
                            className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors text-sm"
                          >
                            <DynamicIcon name="Edit2" className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => removeStat(index)}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
                          >
                            <DynamicIcon name="Trash2" className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                )
              )}
            </div>
          </div>
        );

      case "resources":
        return (
          <div className="space-y-6">
            <div className="bg-green-900/20 border border-green-800/50 rounded-lg p-4">
              <p className="text-sm text-blue-300 flex items-start gap-2">
                <DynamicIcon
                  name="Lightbulb"
                  className="w-4 h-4 mt-0.5 shrink-0"
                />
                <span>
                  <strong>Tip:</strong> Resources are consumable values like
                  Health, Mana, or Stamina that can be spent or restored during
                  the adventure.
                </span>
              </p>
            </div>

            <div className="bg-blue-900/20 rounded-lg border border-blue-700/40 p-6">
              <h3 className="text-lg font-bold mb-4 text-white">
                Add New Resource
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={newResource.name}
                    onChange={(e) =>
                      setNewResource({ ...newResource, name: e.target.value })
                    }
                    placeholder="e.g., Health"
                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Icon
                  </label>
                  <IconPicker
                    value={newResource.symbol || "Gem"}
                    onChange={(icon) =>
                      setNewResource({ ...newResource, symbol: icon })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Starting Value
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newResource.value}
                    onChange={(e) =>
                      setNewResource({
                        ...newResource,
                        value: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Max Value
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newResource.maxValue}
                    onChange={(e) =>
                      setNewResource({
                        ...newResource,
                        maxValue: parseInt(e.target.value) || 100,
                      })
                    }
                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Description *
                  </label>
                  <input
                    type="text"
                    value={newResource.description}
                    onChange={(e) =>
                      setNewResource({
                        ...newResource,
                        description: e.target.value,
                      })
                    }
                    placeholder="e.g., Your life force"
                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                  />
                </div>
              </div>
              <button
                onClick={addResource}
                disabled={!newResource.name || !newResource.description}
                className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
              >
                Add Resource
              </button>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">
                Resources ({resources.length})
              </h3>
              {resources.length === 0 ? (
                <p className="text-blue-300/60 text-sm">
                  No resources added yet
                </p>
              ) : (
                resources.map((resource, index) =>
                  editingResourceIndex === index ? (
                    // Edit mode
                    <div
                      key={index}
                      className="p-4 bg-green-900/40 rounded-lg border-2 border-green-600"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="block text-xs font-semibold text-blue-300 mb-1">
                            Name *
                          </label>
                          <input
                            type="text"
                            value={editResource.name || ""}
                            onChange={(e) =>
                              setEditResource({
                                ...editResource,
                                name: e.target.value,
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
                            value={editResource.symbol || "Gem"}
                            onChange={(icon) =>
                              setEditResource({
                                ...editResource,
                                symbol: icon,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-blue-300 mb-1">
                            Starting Value
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={editResource.value || 0}
                            onChange={(e) =>
                              setEditResource({
                                ...editResource,
                                value: parseInt(e.target.value) || 0,
                              })
                            }
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/20 text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-blue-300 mb-1">
                            Max Value
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={editResource.maxValue || 1}
                            onChange={(e) =>
                              setEditResource({
                                ...editResource,
                                maxValue: parseInt(e.target.value) || 1,
                              })
                            }
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/20 text-white text-sm"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-blue-300 mb-1">
                            Description *
                          </label>
                          <input
                            type="text"
                            value={editResource.description || ""}
                            onChange={(e) =>
                              setEditResource({
                                ...editResource,
                                description: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/20 text-white text-sm"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={saveEditResource}
                          disabled={
                            !editResource.name || !editResource.description
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
                          onClick={cancelEditResource}
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
                      onDragStart={() => handleResourceDragStart(index)}
                      onDragOver={(e) => handleResourceDragOver(e, index)}
                      onDragEnd={handleResourceDragEnd}
                      className="flex items-center gap-3 p-4 bg-green-900/20 rounded-lg border border-green-800/50 cursor-move hover:bg-green-800/30 transition-colors"
                      style={{
                        opacity: draggedResourceIndex === index ? 0.5 : 1,
                      }}
                    >
                      <div className="text-blue-400/50 cursor-grab active:cursor-grabbing">
                        <DynamicIcon name="GripVertical" className="w-5 h-5" />
                      </div>
                      <div className="text-2xl">
                        <DynamicIcon
                          name={resource.symbol}
                          className="w-8 h-8"
                        />
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-white">
                          {resource.name}
                        </div>
                        <div className="text-sm text-blue-300/60">
                          {resource.description}
                        </div>
                        <div className="text-sm text-green-400 font-semibold">
                          {resource.value}/{resource.maxValue}
                        </div>
                      </div>
                      <div className="flex flex-col items-center gap-2">
                        <div className="flex flex-row items-center gap-1 ml-3">
                          <button
                            onClick={() => moveResourceUp(index)}
                            disabled={index === 0}
                            className="w-8 h-8 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded transition-colors text-sm"
                            title="Move up"
                          >
                            <DynamicIcon name="ChevronUp" className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => moveResourceDown(index)}
                            disabled={index === resources.length - 1}
                            className="w-8 h-8 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded transition-colors text-sm"
                            title="Move down"
                          >
                            <DynamicIcon
                              name="ChevronDown"
                              className="w-4 h-4"
                            />
                          </button>
                        </div>
                        <div className="flex flex-row items-center gap-1 ml-3">
                          <button
                            onClick={() => startEditResource(index)}
                            className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors text-sm"
                          >
                            <DynamicIcon name="Edit2" className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => removeResource(index)}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
                          >
                            <DynamicIcon name="Trash2" className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                )
              )}
            </div>
          </div>
        );

      case "inventory":
        return (
          <div className="space-y-6">
            <div className="bg-purple-900/20 border border-purple-800/50 rounded-lg p-4">
              <p className="text-sm text-blue-300 flex items-start gap-2">
                <DynamicIcon
                  name="Lightbulb"
                  className="w-4 h-4 mt-0.5 shrink-0"
                />
                <span>
                  <strong>Tip:</strong> Starting inventory items that players
                  begin the adventure with.
                </span>
              </p>
            </div>

            <div className="bg-blue-900/20 rounded-lg border border-blue-700/40 p-6">
              <h3 className="text-lg font-bold mb-4 text-white">
                Add Starting Item
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={newItem.name}
                    onChange={(e) =>
                      setNewItem({ ...newItem, name: e.target.value })
                    }
                    placeholder="e.g., Rusty Sword"
                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Icon
                  </label>
                  <IconPicker
                    value={newItem.symbol || "Package"}
                    onChange={(icon) =>
                      setNewItem({ ...newItem, symbol: icon })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="999"
                    value={newItem.quantity}
                    onChange={(e) =>
                      setNewItem({
                        ...newItem,
                        quantity: clampNumber(parseInt(e.target.value), 1, 999),
                      })
                    }
                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Type
                  </label>
                  <select
                    value={newItem.type}
                    onChange={(e) =>
                      setNewItem({
                        ...newItem,
                        type: e.target.value as
                          | "normal"
                          | "consumable"
                          | "story"
                          | "misc",
                      })
                    }
                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                  >
                    <option value="normal">Normal Item</option>
                    <option value="consumable">Consumable</option>
                    <option value="story">Story Item</option>
                    <option value="misc">Miscellaneous</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={newItem.description}
                    onChange={(e) =>
                      setNewItem({ ...newItem, description: e.target.value })
                    }
                    placeholder="e.g., A worn but reliable blade"
                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                  />
                </div>
              </div>
              <button
                onClick={addInventoryItem}
                disabled={!newItem.name}
                className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
              >
                Add Item
              </button>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">
                Starting Inventory ({inventory.length})
              </h3>
              {inventory.length === 0 ? (
                <p className="text-blue-300/60 text-sm">No items added yet</p>
              ) : (
                inventory.map((item, index) =>
                  editingInventoryIndex === index ? (
                    // Edit mode
                    <div
                      key={index}
                      className="p-4 bg-purple-900/40 rounded-lg border-2 border-purple-600"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="block text-xs font-semibold text-blue-300 mb-1">
                            Name *
                          </label>
                          <input
                            type="text"
                            value={editInventoryItem.name || ""}
                            onChange={(e) =>
                              setEditInventoryItem({
                                ...editInventoryItem,
                                name: e.target.value,
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
                            value={editInventoryItem.symbol || "Package"}
                            onChange={(icon) =>
                              setEditInventoryItem({
                                ...editInventoryItem,
                                symbol: icon,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-blue-300 mb-1">
                            Quantity
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="999"
                            value={editInventoryItem.quantity || 1}
                            onChange={(e) =>
                              setEditInventoryItem({
                                ...editInventoryItem,
                                quantity: clampNumber(
                                  parseInt(e.target.value),
                                  1,
                                  999
                                ),
                              })
                            }
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/20 text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-blue-300 mb-1">
                            Type
                          </label>
                          <select
                            value={editInventoryItem.type || "misc"}
                            onChange={(e) =>
                              setEditInventoryItem({
                                ...editInventoryItem,
                                type: e.target.value as any,
                              })
                            }
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/20 text-white text-sm"
                          >
                            <option value="normal">Normal</option>
                            <option value="consumable">Consumable</option>
                            <option value="story">Story</option>
                            <option value="misc">Misc</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-blue-300 mb-1">
                            Grade
                          </label>
                          <select
                            value={editInventoryItem.grade || "common"}
                            onChange={(e) => {
                              const newGrade = e.target.value as ItemGrade;
                              const maxDur = getMaxDurability(newGrade);
                              setEditInventoryItem({
                                ...editInventoryItem,
                                grade: newGrade,
                                maxDurability: maxDur,
                                durability: Math.min(editInventoryItem.durability || maxDur, maxDur),
                              });
                            }}
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/20 text-white text-sm"
                            style={{ color: GRADE_CONFIG[editInventoryItem.grade as ItemGrade || "common"].color }}
                          >
                            {GRADE_ORDER.map((g) => (
                              <option key={g} value={g} style={{ color: GRADE_CONFIG[g].color }}>
                                {GRADE_CONFIG[g].label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-blue-300 mb-1">
                            Durability {editInventoryItem.grade === "mythic" ? "(∞)" : `(max ${getMaxDurability(editInventoryItem.grade as ItemGrade || "common")})`}
                          </label>
                          <input
                            type="number"
                            min="0"
                            max={getMaxDurability(editInventoryItem.grade as ItemGrade || "common")}
                            value={editInventoryItem.grade === "mythic" ? "" : (editInventoryItem.durability ?? getMaxDurability(editInventoryItem.grade as ItemGrade || "common"))}
                            onChange={(e) =>
                              setEditInventoryItem({
                                ...editInventoryItem,
                                durability: Math.max(0, Math.min(parseInt(e.target.value) || 0, getMaxDurability(editInventoryItem.grade as ItemGrade || "common"))),
                              })
                            }
                            disabled={editInventoryItem.grade === "mythic"}
                            placeholder={editInventoryItem.grade === "mythic" ? "∞" : "Durability"}
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/20 text-white text-sm disabled:opacity-50"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-blue-300 mb-1">
                            Description
                          </label>
                          <input
                            type="text"
                            value={editInventoryItem.description || ""}
                            onChange={(e) =>
                              setEditInventoryItem({
                                ...editInventoryItem,
                                description: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/20 text-white text-sm"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={saveEditInventoryItem}
                          disabled={!editInventoryItem.name}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors text-sm"
                        >
                          <DynamicIcon
                            name="Save"
                            className="inline-block w-4 h-4 mr-1"
                          />
                          Save
                        </button>
                        <button
                          onClick={cancelEditInventoryItem}
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
                      onDragStart={() => handleInventoryDragStart(index)}
                      onDragOver={(e) => handleInventoryDragOver(e, index)}
                      onDragEnd={handleInventoryDragEnd}
                      className="flex items-center gap-3 p-4 rounded-lg border cursor-move hover:opacity-80 transition-colors"
                      style={{
                        opacity: draggedInventoryIndex === index ? 0.5 : 1,
                        backgroundColor: `${GRADE_CONFIG[item.grade as ItemGrade || "common"].color}15`,
                        borderColor: `${GRADE_CONFIG[item.grade as ItemGrade || "common"].color}40`,
                      }}
                    >
                      <div className="text-blue-400/50 cursor-grab active:cursor-grabbing">
                        <DynamicIcon name="GripVertical" className="w-5 h-5" />
                      </div>
                      <div className="text-2xl">
                        <DynamicIcon 
                          name={item.symbol} 
                          className="w-8 h-8"
                          style={{ color: GRADE_CONFIG[item.grade as ItemGrade || "common"].color }}
                        />
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-white flex items-center gap-2 flex-wrap">
                          <span>{item.name} ×{item.quantity}</span>
                          <span
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: `${GRADE_CONFIG[item.grade as ItemGrade || "common"].color}30`,
                              color: GRADE_CONFIG[item.grade as ItemGrade || "common"].color,
                            }}
                          >
                            {GRADE_CONFIG[item.grade as ItemGrade || "common"].label}
                          </span>
                          {item.type && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
                              {item.type}
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <div className="text-sm text-blue-300/60">
                            {item.description}
                          </div>
                        )}
                        {item.type !== "consumable" && (
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-blue-200/40">Durability:</span>
                            {item.grade === "mythic" ? (
                              <span className="text-xs text-yellow-400">∞</span>
                            ) : (
                              <>
                                <div className="w-16 h-1.5 bg-blue-900/50 rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full"
                                    style={{
                                      width: `${((item.durability ?? getMaxDurability(item.grade as ItemGrade || "common")) / getMaxDurability(item.grade as ItemGrade || "common")) * 100}%`,
                                      backgroundColor: GRADE_CONFIG[item.grade as ItemGrade || "common"].color,
                                    }}
                                  />
                                </div>
                                <span className="text-xs text-blue-200/60">
                                  {item.durability ?? getMaxDurability(item.grade as ItemGrade || "common")}/{getMaxDurability(item.grade as ItemGrade || "common")}
                                </span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-center gap-2">
                        <div className="flex flex-row items-center gap-1 ml-3">
                          <button
                            onClick={() => moveInventoryUp(index)}
                            disabled={index === 0}
                            className="w-8 h-8 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded transition-colors text-sm"
                            title="Move up"
                          >
                            <DynamicIcon name="ChevronUp" className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => moveInventoryDown(index)}
                            disabled={index === inventory.length - 1}
                            className="w-8 h-8 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded transition-colors text-sm"
                            title="Move down"
                          >
                            <DynamicIcon
                              name="ChevronDown"
                              className="w-4 h-4"
                            />
                          </button>
                        </div>
                        <div className="flex flex-row items-center gap-1 ml-3">
                          <button
                            onClick={() => startEditInventoryItem(index)}
                            className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors text-sm"
                          >
                            <DynamicIcon name="Edit2" className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => removeInventoryItem(index)}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
                          >
                            <DynamicIcon name="Trash2" className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
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
                  <strong>What is Lore?</strong> Lore entries are world-building
                  facts the AI uses for context.
                  <strong> Triggers</strong> control visibility:{" "}
                  <span className="text-green-400">ON triggers</span> (keywords
                  that reveal this lore when mentioned),
                  <span className="text-red-400"> OFF triggers</span> (keywords
                  that hide it), and
                  <span className="text-purple-400"> Beat triggers</span> (plot
                  beat numbers that toggle visibility).
                </span>
              </p>
            </div>

            <div className="bg-blue-900/20 rounded-lg border border-blue-700/40 p-6">
              <h3 className="text-lg font-bold mb-4 text-white">
                Add Lore Entry
              </h3>
              <div className="space-y-4 mb-4">
                <div>
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
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Content *
                  </label>
                  <textarea
                    value={newLore.content}
                    onChange={(e) =>
                      setNewLore({ ...newLore, content: e.target.value })
                    }
                    placeholder="Write the lore entry content..."
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
                      (only revealed when triggered by keys)
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
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Thumbnail (optional)
                  </label>
                  <div className="flex items-start gap-3">
                    {newLore.thumbnailUrl ? (
                      <div className="relative">
                        <img
                          src={newLore.thumbnailUrl}
                          alt="Lore thumbnail"
                          className="w-24 h-24 object-cover rounded border"
                        />
                        <button
                          onClick={() =>
                            setNewLore({ ...newLore, thumbnailUrl: "" })
                          }
                          className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 hover:bg-red-700 text-white rounded-full text-xs"
                        >
                          ?
                        </button>
                      </div>
                    ) : (
                      <div className="w-24 h-24 rounded border-2 border-dashed border-blue-700/40 flex items-center justify-center text-xs text-blue-300/50">
                        No Preview
                      </div>
                    )}
                    <div>
                      <input
                        id="new-lore-thumb"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (!file.type.startsWith("image/")) {
                            addNotification(
                              "Please select an image file",
                              "warning"
                            );
                            return;
                          }
                          if (file.size > 5 * 1024 * 1024) {
                            addNotification(
                              "Image must be smaller than 5MB",
                              "warning"
                            );
                            return;
                          }
                          try {
                            const {
                              data: { session },
                            } = await supabase.auth.getSession();
                            if (!session) throw new Error("Not authenticated");
                            const ext = file.name.split(".").pop();
                            const fileName = `${
                              user!.id
                            }-${Date.now()}-lore-thumb.${ext}`;
                            const filePath = `lore-thumbnails/${fileName}`;
                            const { error: uploadError } =
                              await supabase.storage
                                .from("adventure-images")
                                .upload(filePath, file, {
                                  cacheControl: "3600",
                                  upsert: false,
                                });
                            if (uploadError) throw uploadError;
                            const { data } = supabase.storage
                              .from("adventure-images")
                              .getPublicUrl(filePath);
                            setNewLore({
                              ...newLore,
                              thumbnailUrl: data.publicUrl,
                            });
                            addNotification("Thumbnail uploaded!", "success");
                          } catch (err: any) {
                            console.error("Upload failed:", err);
                            addNotification(
                              err.message || "Upload failed",
                              "failure"
                            );
                          }
                        }}
                      />
                      <label
                        htmlFor="new-lore-thumb"
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded cursor-pointer inline-flex items-center gap-2"
                      >
                        <DynamicIcon name="Camera" className="w-4 h-4" /> Upload
                        Thumbnail
                      </label>
                    </div>
                  </div>
                </div>
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
                    {(newLore.on_triggers || []).map((trigger) => (
                      <span
                        key={trigger}
                        className="px-2 py-1 bg-green-900/30 text-green-300 rounded-full text-sm flex items-center gap-1"
                      >
                        <DynamicIcon name="Check" className="w-3 h-3" />{" "}
                        {trigger}
                        <button
                          onClick={() =>
                            setNewLore({
                              ...newLore,
                              on_triggers: (newLore.on_triggers || []).filter(
                                (t) => t !== trigger
                              ),
                            })
                          }
                          className="hover:text-green-100"
                        >
                          ?
                        </button>
                      </span>
                    ))}
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
                    {(newLore.off_triggers || []).map((trigger) => (
                      <span
                        key={trigger}
                        className="px-2 py-1 bg-red-900/30 text-red-300 rounded-full text-sm flex items-center gap-1"
                      >
                        <DynamicIcon name="X" className="w-3 h-3" /> {trigger}
                        <button
                          onClick={() =>
                            setNewLore({
                              ...newLore,
                              off_triggers: (newLore.off_triggers || []).filter(
                                (t) => t !== trigger
                              ),
                            })
                          }
                          className="hover:text-red-100"
                        >
                          ?
                        </button>
                      </span>
                    ))}
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
                                              (t) => t !== loreEntry.title
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
                                              (t) => t !== loreEntry.title
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
                            {(newLore.keys || []).map((key) => (
                              <span
                                key={key}
                                className="px-2 py-1 bg-yellow-900/30 text-yellow-300 rounded-full text-sm flex items-center gap-1"
                              >
                                <DynamicIcon name="Key" className="w-3 h-3" />{" "}
                                {key}
                                <button
                                  onClick={() =>
                                    setNewLore({
                                      ...newLore,
                                      keys: (newLore.keys || []).filter(
                                        (k) => k !== key
                                      ),
                                    })
                                  }
                                  className="hover:text-yellow-100"
                                >
                                  ?
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Plot Beat Triggers */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-semibold text-blue-200 mb-2 flex items-center gap-1">
                            <DynamicIcon
                              name="CheckCircle"
                              className="w-4 h-4 text-green-600"
                            />{" "}
                            Beats that turn this lore ON
                          </label>
                          <div className="max-h-40 overflow-y-auto border border-blue-700/40 rounded-lg p-2 bg-blue-900/20">
                            {plotBeats.length === 0 ? (
                              <p className="text-xs text-blue-300/50 italic">
                                No plot beats yet. Add them in the Plot Beats
                                step.
                              </p>
                            ) : (
                              plotBeats.map((beat, beatIndex) => (
                                <label
                                  key={beatIndex}
                                  className="flex items-center gap-2 px-2 py-1 hover:bg-blue-800/40 rounded cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={(
                                      newLore.beats_trigger || []
                                    ).includes(beatIndex)}
                                    onChange={(e) => {
                                      const current =
                                        newLore.beats_trigger || [];
                                      setNewLore({
                                        ...newLore,
                                        beats_trigger: e.target.checked
                                          ? [...current, beatIndex]
                                          : current.filter(
                                              (i) => i !== beatIndex
                                            ),
                                      });
                                    }}
                                    className="w-4 h-4 text-green-600 rounded"
                                  />
                                  <span className="text-xs text-white">
                                    {beat.title || `Beat ${beatIndex + 1}`}
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
                            Beats that turn this lore OFF
                          </label>
                          <div className="max-h-40 overflow-y-auto border border-blue-700/40 rounded-lg p-2 bg-blue-900/20">
                            {plotBeats.length === 0 ? (
                              <p className="text-xs text-blue-300/50 italic">
                                No plot beats yet. Add them in the Plot Beats
                                step.
                              </p>
                            ) : (
                              plotBeats.map((beat, beatIndex) => (
                                <label
                                  key={beatIndex}
                                  className="flex items-center gap-2 px-2 py-1 hover:bg-blue-800/40 rounded cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={(
                                      newLore.beats_untrigger || []
                                    ).includes(beatIndex)}
                                    onChange={(e) => {
                                      const current =
                                        newLore.beats_untrigger || [];
                                      setNewLore({
                                        ...newLore,
                                        beats_untrigger: e.target.checked
                                          ? [...current, beatIndex]
                                          : current.filter(
                                              (i) => i !== beatIndex
                                            ),
                                      });
                                    }}
                                    className="w-4 h-4 text-red-600 rounded"
                                  />
                                  <span className="text-xs text-white">
                                    {beat.title || `Beat ${beatIndex + 1}`}
                                  </span>
                                </label>
                              ))
                            )}
                          </div>
                        </div>
                      </div>

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
                                                (n) => n !== variable.name
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
                                                (n) => n !== variable.name
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

            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
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
                        item.entry.title
                          .toLowerCase()
                          .includes(loreSearchQuery.toLowerCase()) ||
                        item.entry.content
                          .toLowerCase()
                          .includes(loreSearchQuery.toLowerCase())
                    )
                    .sort((a, b) => a.entry.title.localeCompare(b.entry.title));

                  const totalPages = Math.ceil(
                    filteredLore.length / loreItemsPerPage
                  );
                  const displayedLore = filteredLore.slice(
                    (lorePage - 1) * loreItemsPerPage,
                    lorePage * loreItemsPerPage
                  );

                  if (filteredLore.length === 0 && lore.length > 0) {
                    return (
                      <p className="text-blue-300/50 text-sm italic">
                        No lore entries match your search.
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
                                Editing Lore Entry
                              </h4>
                              <div>
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
                              <div>
                                <label className="block text-sm font-semibold text-blue-200 mb-1">
                                  Thumbnail
                                </label>
                                <div className="flex items-start gap-3">
                                  {editLore.thumbnailUrl ? (
                                    <div className="relative">
                                      <img
                                        src={editLore.thumbnailUrl}
                                        alt="Lore thumb"
                                        className="w-24 h-24 object-cover rounded border"
                                      />
                                      <button
                                        onClick={() =>
                                          setEditLore({
                                            ...editLore,
                                            thumbnailUrl: "",
                                          })
                                        }
                                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 hover:bg-red-700 text-white rounded-full text-xs"
                                      >
                                        ?
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="w-24 h-24 rounded border-2 border-dashed border-blue-700/40 flex items-center justify-center text-xs text-blue-300/50">
                                      No Preview
                                    </div>
                                  )}
                                  <div>
                                    <input
                                      id={`edit-mode-lore-thumb-${index}`}
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        if (!file.type.startsWith("image/")) {
                                          addNotification(
                                            "Please select an image file",
                                            "warning"
                                          );
                                          return;
                                        }
                                        if (file.size > 5 * 1024 * 1024) {
                                          addNotification(
                                            "Image must be smaller than 5MB",
                                            "warning"
                                          );
                                          return;
                                        }
                                        try {
                                          const {
                                            data: { session },
                                          } = await supabase.auth.getSession();
                                          if (!session)
                                            throw new Error(
                                              "Not authenticated"
                                            );
                                          const ext = file.name
                                            .split(".")
                                            .pop();
                                          const fileName = `${
                                            user!.id
                                          }-${Date.now()}-lore-thumb.${ext}`;
                                          const filePath = `lore-thumbnails/${fileName}`;
                                          const { error: uploadError } =
                                            await supabase.storage
                                              .from("adventure-images")
                                              .upload(filePath, file, {
                                                cacheControl: "3600",
                                                upsert: false,
                                              });
                                          if (uploadError) throw uploadError;
                                          const { data } = supabase.storage
                                            .from("adventure-images")
                                            .getPublicUrl(filePath);
                                          setEditLore({
                                            ...editLore,
                                            thumbnailUrl: data.publicUrl,
                                          });
                                          addNotification(
                                            "Thumbnail uploaded!",
                                            "success"
                                          );
                                        } catch (err: any) {
                                          console.error("Upload failed:", err);
                                          addNotification(
                                            err.message || "Upload failed",
                                            "failure"
                                          );
                                        }
                                      }}
                                    />
                                    <label
                                      htmlFor={`edit-mode-lore-thumb-${index}`}
                                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded cursor-pointer inline-block text-sm"
                                    >
                                      <DynamicIcon
                                        name="Upload"
                                        className="inline-block w-4 h-4 mr-1"
                                      />
                                      Upload Thumbnail
                                    </label>
                                  </div>
                                </div>
                              </div>

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
                                    (trigger) => (
                                      <span
                                        key={trigger}
                                        className="px-2 py-1 bg-green-900/30 text-green-300 rounded-full text-sm flex items-center gap-1"
                                      >
                                        <DynamicIcon
                                          name="Check"
                                          className="w-3 h-3"
                                        />{" "}
                                        {trigger}
                                        <button
                                          onClick={() =>
                                            setEditLore({
                                              ...editLore,
                                              on_triggers: (
                                                editLore.on_triggers || []
                                              ).filter((t) => t !== trigger),
                                            })
                                          }
                                          className="hover:text-green-100"
                                        >
                                          ?
                                        </button>
                                      </span>
                                    )
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
                                    (trigger) => (
                                      <span
                                        key={trigger}
                                        className="px-2 py-1 bg-red-900/30 text-red-300 rounded-full text-sm flex items-center gap-1"
                                      >
                                        <DynamicIcon
                                          name="X"
                                          className="w-3 h-3"
                                        />{" "}
                                        {trigger}
                                        <button
                                          onClick={() =>
                                            setEditLore({
                                              ...editLore,
                                              off_triggers: (
                                                editLore.off_triggers || []
                                              ).filter((t) => t !== trigger),
                                            })
                                          }
                                          className="hover:text-red-100"
                                        >
                                          ?
                                        </button>
                                      </span>
                                    )
                                  )}
                                </div>
                              </div>

                              {/* Advanced Triggers Section (Expandable) */}
                              <div className="border border-blue-700/40 rounded-lg">
                                <button
                                  onClick={() =>
                                    setEditLoreAdvancedExpanded(
                                      !editLoreAdvancedExpanded
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
                                                                loreEntry.title
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
                                                                loreEntry.title
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
                                          {(editLore.keys || []).map((key) => (
                                            <span
                                              key={key}
                                              className="px-2 py-1 bg-yellow-900/30 text-yellow-300 rounded-full text-sm flex items-center gap-1"
                                            >
                                              <DynamicIcon
                                                name="Key"
                                                className="w-3 h-3"
                                              />{" "}
                                              {key}
                                              <button
                                                onClick={() =>
                                                  setEditLore({
                                                    ...editLore,
                                                    keys: (
                                                      editLore.keys || []
                                                    ).filter((k) => k !== key),
                                                  })
                                                }
                                                className="hover:text-yellow-100"
                                              >
                                                ?
                                              </button>
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {/* Plot Beat Triggers */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      <div>
                                        <label className="text-sm font-semibold text-blue-200 mb-2 flex items-center gap-1">
                                          <DynamicIcon
                                            name="CheckCircle"
                                            className="w-4 h-4 text-green-600"
                                          />{" "}
                                          Beats that turn this lore ON
                                        </label>
                                        <div className="max-h-40 overflow-y-auto border border-blue-700/40 rounded-lg p-2 bg-blue-900/20">
                                          {plotBeats.length === 0 ? (
                                            <p className="text-xs text-blue-300/50 italic">
                                              No plot beats yet. Add them in the
                                              Plot Beats step.
                                            </p>
                                          ) : (
                                            plotBeats.map((beat, beatIndex) => (
                                              <label
                                                key={beatIndex}
                                                className="flex items-center gap-2 px-2 py-1 hover:bg-blue-800/40 rounded cursor-pointer"
                                              >
                                                <input
                                                  type="checkbox"
                                                  checked={(
                                                    editLore.beats_trigger || []
                                                  ).includes(beatIndex)}
                                                  onChange={(e) => {
                                                    const current =
                                                      editLore.beats_trigger ||
                                                      [];
                                                    setEditLore({
                                                      ...editLore,
                                                      beats_trigger: e.target
                                                        .checked
                                                        ? [
                                                            ...current,
                                                            beatIndex,
                                                          ]
                                                        : current.filter(
                                                            (i) =>
                                                              i !== beatIndex
                                                          ),
                                                    });
                                                  }}
                                                  className="w-4 h-4 text-green-600 rounded"
                                                />
                                                <span className="text-xs text-white">
                                                  {beat.title ||
                                                    `Beat ${beatIndex + 1}`}
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
                                          Beats that turn this lore OFF
                                        </label>
                                        <div className="max-h-40 overflow-y-auto border border-blue-700/40 rounded-lg p-2 bg-blue-900/20">
                                          {plotBeats.length === 0 ? (
                                            <p className="text-xs text-blue-300/50 italic">
                                              No plot beats yet. Add them in the
                                              Plot Beats step.
                                            </p>
                                          ) : (
                                            plotBeats.map((beat, beatIndex) => (
                                              <label
                                                key={beatIndex}
                                                className="flex items-center gap-2 px-2 py-1 hover:bg-blue-800/40 rounded cursor-pointer"
                                              >
                                                <input
                                                  type="checkbox"
                                                  checked={(
                                                    editLore.beats_untrigger ||
                                                    []
                                                  ).includes(beatIndex)}
                                                  onChange={(e) => {
                                                    const current =
                                                      editLore.beats_untrigger ||
                                                      [];
                                                    setEditLore({
                                                      ...editLore,
                                                      beats_untrigger: e.target
                                                        .checked
                                                        ? [
                                                            ...current,
                                                            beatIndex,
                                                          ]
                                                        : current.filter(
                                                            (i) =>
                                                              i !== beatIndex
                                                          ),
                                                    });
                                                  }}
                                                  className="w-4 h-4 text-red-600 rounded"
                                                />
                                                <span className="text-xs text-white">
                                                  {beat.title ||
                                                    `Beat ${beatIndex + 1}`}
                                                </span>
                                              </label>
                                            ))
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Variable Triggers (Boolean) */}
                                    {variables.filter(
                                      (v) => v.type === "boolean"
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
                                                (v) => v.type === "boolean"
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
                                                                variable.name
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
                                                (v) => v.type === "boolean"
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
                                                                variable.name
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
                                        ? "Lore is enabled"
                                        : "Lore is disabled"
                                    }
                                  >
                                    {entry.on ? "ON" : "OFF"}
                                  </button>
                                </div>
                                {entry.thumbnailUrl && (
                                  <img
                                    src={entry.thumbnailUrl}
                                    alt="Lore thumb"
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
                                {entry.secrtet && entry.keys.length > 0 && (
                                  <div className="text-xs text-yellow-400">
                                    <strong>Triggers:</strong>{" "}
                                    {entry.keys.join(", ")}
                                  </div>
                                )}
                                {entry.beats_trigger &&
                                  entry.beats_trigger.length > 0 && (
                                    <div className="text-xs text-green-400 mb-1">
                                      <strong>
                                        <DynamicIcon
                                          name="CheckCircle"
                                          className="inline-block w-3 h-3 mr-1"
                                        />
                                        Beats turning ON:
                                      </strong>{" "}
                                      {entry.beats_trigger
                                        .map(
                                          (i) =>
                                            plotBeats[i]?.title ||
                                            `Beat ${i + 1}`
                                        )
                                        .join(", ")}
                                    </div>
                                  )}
                                {entry.beats_untrigger &&
                                  entry.beats_untrigger.length > 0 && (
                                    <div className="text-xs text-red-400 mb-1">
                                      <strong>
                                        <DynamicIcon
                                          name="XCircle"
                                          className="inline-block w-3 h-3 mr-1"
                                        />
                                        Beats turning OFF:
                                      </strong>{" "}
                                      {entry.beats_untrigger
                                        .map(
                                          (i) =>
                                            plotBeats[i]?.title ||
                                            `Beat ${i + 1}`
                                        )
                                        .join(", ")}
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

      case "relationships":
        return (
          <div className="space-y-6">
            <div className="bg-pink-900/20 border border-pink-800/50 rounded-lg p-4">
              <p className="text-sm text-blue-300 flex items-start gap-2">
                <DynamicIcon
                  name="Lightbulb"
                  className="w-4 h-4 mt-0.5 shrink-0"
                />
                <span>
                  <strong>Tip:</strong> Track relationships with characters,
                  factions, or organizations. Value ranges from -100 (hostile
                  enemy) to +100 (strong ally). The AI will use these to inform
                  dialogue and plot decisions.
                </span>
              </p>
            </div>

            <div className="bg-blue-900/20 rounded-lg border border-blue-700/40 p-6">
              <h3 className="text-lg font-bold mb-4 text-white">
                Add Relationship
              </h3>
              <div className="space-y-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Name * (Character/Faction/Organization)
                  </label>
                  <input
                    type="text"
                    value={newRelationship.name}
                    onChange={(e) =>
                      setNewRelationship({
                        ...newRelationship,
                        name: e.target.value,
                      })
                    }
                    placeholder="e.g., King's Guard, The Shadow Syndicate"
                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-blue-200 mb-1 flex items-center justify-between">
                    <span>
                      Relationship Value * ({newRelationship.value ?? 0})
                    </span>
                    <DynamicIcon
                      name={getRelationshipIcon(newRelationship.value ?? 0)}
                      className="w-6 h-6"
                    />
                  </label>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    value={newRelationship.value ?? 0}
                    onChange={(e) =>
                      setNewRelationship({
                        ...newRelationship,
                        value: parseInt(e.target.value),
                      })
                    }
                    className="w-full h-2 bg-blue-900/30 rounded-lg appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, 
                        #ef4444 0%, 
                        #f59e0b 25%, 
                        #84cc16 50%, 
                        #10b981 75%, 
                        #06b6d4 100%)`,
                    }}
                  />
                  <div className="flex justify-between text-xs text-blue-300/60 mt-1">
                    <span>-100 (Enemy)</span>
                    <span>0 (Neutral)</span>
                    <span>+100 (Ally)</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Description *
                  </label>
                  <textarea
                    value={newRelationship.description}
                    onChange={(e) =>
                      setNewRelationship({
                        ...newRelationship,
                        description: e.target.value,
                      })
                    }
                    placeholder="Describe the current state of this relationship..."
                    rows={3}
                    maxLength={1000}
                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white resize-none"
                  />
                </div>
              </div>
              <button
                onClick={addRelationship}
                disabled={!newRelationship.name || !newRelationship.description}
                className="w-full px-4 py-2 bg-pink-600 hover:bg-pink-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
              >
                Add Relationship
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold text-white">
                  Relationships ({relationships.length})
                </h3>
                <div className="relative">
                  <input
                    type="text"
                    value={relationshipSearchQuery}
                    onChange={(e) => {
                      setRelationshipSearchQuery(e.target.value);
                      setRelationshipPage(1);
                    }}
                    placeholder="Search relationships..."
                    className="pl-8 pr-3 py-1 text-sm border border-blue-700/40 rounded-lg bg-blue-900/20 text-white focus:ring-2 focus:ring-pink-500"
                  />
                  <span className="absolute left-2.5 top-1.5 text-gray-400 text-xs">
                    <DynamicIcon name="Search" className="w-4 h-4" />
                  </span>
                </div>
              </div>

              {relationships.length === 0 ? (
                <p className="text-blue-300/60 text-sm">
                  No relationships added yet
                </p>
              ) : (
                (() => {
                  const filteredRelationships = relationships
                    .map((rel, index) => ({ rel, originalIndex: index }))
                    .filter(
                      (item) =>
                        item.rel.name
                          .toLowerCase()
                          .includes(relationshipSearchQuery.toLowerCase()) ||
                        item.rel.description
                          .toLowerCase()
                          .includes(relationshipSearchQuery.toLowerCase())
                    )
                    .sort((a, b) => a.rel.name.localeCompare(b.rel.name));

                  const totalPages = Math.ceil(
                    filteredRelationships.length / relationshipItemsPerPage
                  );
                  const displayedRelationships = filteredRelationships.slice(
                    (relationshipPage - 1) * relationshipItemsPerPage,
                    relationshipPage * relationshipItemsPerPage
                  );

                  if (
                    filteredRelationships.length === 0 &&
                    relationships.length > 0
                  ) {
                    return (
                      <p className="text-blue-300/50 text-sm italic">
                        No relationships match your search.
                      </p>
                    );
                  }

                  return (
                    <>
                      {displayedRelationships.map(
                        ({ rel, originalIndex: index }) => (
                          <div
                            key={index}
                            draggable={false}
                            className="p-4 bg-pink-900/20 rounded-lg border border-pink-800/50"
                          >
                            {editingRelationshipIndex === index ? (
                              // Edit mode
                              <div className="space-y-4">
                                <h4 className="text-md font-bold text-pink-100 flex items-center gap-2">
                                  <DynamicIcon
                                    name="Edit2"
                                    className="w-4 h-4"
                                  />{" "}
                                  Editing Relationship
                                </h4>
                                <div>
                                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                                    Name *
                                  </label>
                                  <input
                                    type="text"
                                    value={editRelationship.name || ""}
                                    onChange={(e) =>
                                      setEditRelationship({
                                        ...editRelationship,
                                        name: e.target.value,
                                      })
                                    }
                                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                                  />
                                </div>
                                <div>
                                  <label className="text-sm font-semibold text-blue-200 mb-1 flex items-center justify-between">
                                    <span>
                                      Relationship Value (
                                      {editRelationship.value ?? 0})
                                    </span>
                                    <DynamicIcon
                                      name={getRelationshipIcon(
                                        editRelationship.value ?? 0
                                      )}
                                      className="w-6 h-6"
                                    />
                                  </label>
                                  <input
                                    type="range"
                                    min="-100"
                                    max="100"
                                    value={editRelationship.value ?? 0}
                                    onChange={(e) =>
                                      setEditRelationship({
                                        ...editRelationship,
                                        value: parseInt(e.target.value),
                                      })
                                    }
                                    className="w-full h-2 bg-blue-900/30 rounded-lg appearance-none cursor-pointer"
                                    style={{
                                      background: `linear-gradient(to right, 
                                      #ef4444 0%, 
                                      #f59e0b 25%, 
                                      #84cc16 50%, 
                                      #10b981 75%, 
                                      #06b6d4 100%)`,
                                    }}
                                  />
                                  <div className="flex justify-between text-xs text-blue-300/60 mt-1">
                                    <span>-100 (Enemy)</span>
                                    <span>0 (Neutral)</span>
                                    <span>+100 (Ally)</span>
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                                    Description *
                                  </label>
                                  <textarea
                                    value={editRelationship.description || ""}
                                    onChange={(e) =>
                                      setEditRelationship({
                                        ...editRelationship,
                                        description: e.target.value,
                                      })
                                    }
                                    rows={3}
                                    maxLength={1000}
                                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white resize-none"
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={saveEditRelationship}
                                    disabled={
                                      !editRelationship.name ||
                                      !editRelationship.description
                                    }
                                    className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
                                  >
                                    <DynamicIcon
                                      name="Save"
                                      className="inline-block w-4 h-4 mr-1"
                                    />
                                    Save
                                  </button>
                                  <button
                                    onClick={cancelEditRelationship}
                                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              // View mode
                              <div className="flex items-start gap-3">
                                <div className="text-3xl shrink-0">
                                  {rel.symbol}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-bold text-white flex items-center gap-2 flex-wrap">
                                    <span>{rel.name}</span>
                                    <span
                                      className={`text-sm px-2 py-0.5 rounded-full ${
                                        rel.value >= 50
                                          ? "bg-green-900/30 text-green-200"
                                          : rel.value >= 0
                                          ? "bg-blue-900/30 text-blue-200"
                                          : rel.value >= -50
                                          ? "bg-orange-900/30 text-orange-200"
                                          : "bg-red-900/30 text-red-200"
                                      }`}
                                    >
                                      {rel.value > 0 ? "+" : ""}
                                      {rel.value}
                                    </span>
                                  </div>
                                  <p className="text-sm text-blue-300/60 mt-1">
                                    {rel.description}
                                  </p>
                                </div>
                                <div className="flex gap-2 shrink-0">
                                  <button
                                    onClick={() => startEditRelationship(index)}
                                    className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors text-sm"
                                    title="Edit"
                                  >
                                    <DynamicIcon
                                      name="Edit2"
                                      className="w-4 h-4"
                                    />
                                  </button>
                                  <button
                                    onClick={() => removeRelationship(index)}
                                    className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
                                    title="Delete"
                                  >
                                    <DynamicIcon
                                      name="Trash2"
                                      className="w-4 h-4"
                                    />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      )}

                      {totalPages > 1 && (
                        <div className="flex items-center justify-between gap-2 pt-4">
                          <button
                            onClick={() =>
                              setRelationshipPage(
                                Math.max(1, relationshipPage - 1)
                              )
                            }
                            disabled={relationshipPage === 1}
                            className="px-4 py-2 bg-pink-600 hover:bg-pink-700 disabled:bg-gray-400 text-white rounded-lg transition-colors text-sm"
                          >
                            <DynamicIcon
                              name="ChevronLeft"
                              className="w-4 h-4"
                            />
                          </button>
                          <span className="text-sm text-blue-300">
                            Page {relationshipPage} of {totalPages}
                          </span>
                          <button
                            onClick={() =>
                              setRelationshipPage(
                                Math.min(totalPages, relationshipPage + 1)
                              )
                            }
                            disabled={relationshipPage === totalPages}
                            className="px-4 py-2 bg-pink-600 hover:bg-pink-700 disabled:bg-gray-400 text-white rounded-lg transition-colors text-sm"
                          >
                            <DynamicIcon
                              name="ChevronRight"
                              className="w-4 h-4"
                            />
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
                                  1000
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
                  )
                )
              )}
            </div>
          </div>
        );

      case "plot":
        return (
          <div className="space-y-6">
            <div className="bg-orange-900/20 border border-orange-800/50 rounded-lg p-4">
              <p className="text-sm text-blue-300 flex items-start gap-2">
                <DynamicIcon
                  name="Lightbulb"
                  className="w-5 h-5 text-orange-600 shrink-0 mt-0.5"
                />
                <span>
                  <strong>What are Plot Beats?</strong> These are story
                  milestones the AI tries to weave into the narrative. When the
                  AI determines a beat has been achieved, it marks it complete
                  and awards points. Beats can also trigger lore entries to
                  become visible/hidden. <em>Order matters</em> - the AI prefers
                  earlier uncompleted beats.
                </span>
              </p>
            </div>

            <div className="bg-blue-900/20 rounded-lg border border-blue-700/40 p-6">
              <h3 className="text-lg font-bold mb-4 text-white">
                Add Plot Beat
              </h3>
              <div className="space-y-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={newPlotBeat.title}
                    onChange={(e) =>
                      setNewPlotBeat({ ...newPlotBeat, title: e.target.value })
                    }
                    placeholder="e.g., The Ancient Prophecy"
                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Content *
                  </label>
                  <textarea
                    value={newPlotBeat.content}
                    onChange={(e) =>
                      setNewPlotBeat({
                        ...newPlotBeat,
                        content: e.target.value,
                      })
                    }
                    placeholder="e.g., The player discovers the truth about the ancient prophecy"
                    rows={3}
                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-1">
                    Points Reward (optional)
                  </label>
                  <input
                    type="number"
                    value={newPlotBeat.points ?? ""}
                    onChange={(e) =>
                      setNewPlotBeat({
                        ...newPlotBeat,
                        points: e.target.value
                          ? parseInt(e.target.value)
                          : undefined,
                      })
                    }
                    placeholder="Default: 25"
                    min="0"
                    className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                  />
                  <p className="text-xs text-blue-300/50 mt-1">
                    Leave empty to use default (25 points)
                  </p>
                </div>
              </div>
              <button
                onClick={addPlotBeat}
                disabled={!newPlotBeat.title || !newPlotBeat.content}
                className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
              >
                Add Plot Beat
              </button>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">
                Plot Beats ({plotBeats.length})
              </h3>
              <p className="text-xs text-blue-300/60 flex items-center gap-1">
                <DynamicIcon name="Lightbulb" className="w-3 h-3" /> Drag and
                drop to reorder (or use arrow buttons on mobile)
              </p>
              {plotBeats.length === 0 ? (
                <p className="text-blue-300/60 text-sm">
                  No plot beats added yet
                </p>
              ) : (
                plotBeats.map((beat, index) => (
                  <div
                    key={index}
                    draggable={editingPlotBeatIndex !== index}
                    onDragStart={() => handlePlotBeatDragStart(index)}
                    onDragOver={(e) => handlePlotBeatDragOver(e, index)}
                    onDragEnd={handlePlotBeatDragEnd}
                    className={`p-4 bg-orange-900/20 rounded-lg border border-orange-800/50 transition-opacity ${
                      editingPlotBeatIndex === index ? "" : "cursor-move"
                    } ${
                      draggedPlotBeatIndex === index
                        ? "opacity-50"
                        : "opacity-100"
                    }`}
                  >
                    {editingPlotBeatIndex === index ? (
                      // Edit mode
                      <div className="space-y-4">
                        <h4 className="text-md font-bold text-orange-100 flex items-center gap-2">
                          <DynamicIcon name="Edit2" className="w-4 h-4" />{" "}
                          Editing Plot Beat
                        </h4>
                        <div>
                          <label className="block text-sm font-semibold text-blue-200 mb-1">
                            Title *
                          </label>
                          <input
                            type="text"
                            value={editPlotBeat.title || ""}
                            onChange={(e) =>
                              setEditPlotBeat({
                                ...editPlotBeat,
                                title: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-blue-200 mb-1">
                            Content *
                          </label>
                          <textarea
                            value={editPlotBeat.content || ""}
                            onChange={(e) =>
                              setEditPlotBeat({
                                ...editPlotBeat,
                                content: e.target.value,
                              })
                            }
                            rows={3}
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white resize-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-blue-200 mb-1">
                            Points Reward (optional)
                          </label>
                          <input
                            type="number"
                            value={editPlotBeat.points ?? ""}
                            onChange={(e) =>
                              setEditPlotBeat({
                                ...editPlotBeat,
                                points: e.target.value
                                  ? parseInt(e.target.value)
                                  : undefined,
                              })
                            }
                            placeholder="Default: 25"
                            min="0"
                            className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                          />
                          <p className="text-xs text-blue-300/50 mt-1">
                            Leave empty to use default (25 points)
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={saveEditPlotBeat}
                            disabled={
                              !editPlotBeat.title || !editPlotBeat.content
                            }
                            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg flex items-center justify-center gap-2"
                          >
                            <DynamicIcon name="Check" className="w-4 h-4" />{" "}
                            Save Changes
                          </button>
                          <button
                            onClick={cancelEditPlotBeat}
                            className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      // View mode
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1">
                          <div className="text-blue-400/50 cursor-grab active:cursor-grabbing select-none mt-1">
                            <DynamicIcon
                              name="GripVertical"
                              className="w-5 h-5"
                            />
                          </div>
                          <div className="flex-1">
                            <div className="font-bold text-white mb-1">
                              {beat.title}
                            </div>
                            <div className="text-sm text-blue-300/60">
                              {beat.content}
                            </div>
                            {beat.points !== undefined && (
                              <div className="text-xs text-orange-400 mt-1 font-semibold flex items-center gap-1">
                                <DynamicIcon name="Coins" className="w-3 h-3" />{" "}
                                {beat.points} points
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-col items-center  gap-2 ml-3">
                            <div className="flex flex-row items-center gap-1 ml-3">
                              <button
                                onClick={() => movePlotBeatUp(index)}
                                disabled={index === 0}
                                className="px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded text-xs transition-colors"
                                title="Move up"
                              >
                                <DynamicIcon
                                  name="ChevronUp"
                                  className="w-4 h-4"
                                />
                              </button>
                              <button
                                onClick={() => movePlotBeatDown(index)}
                                disabled={index === plotBeats.length - 1}
                                className="px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded text-xs transition-colors"
                                title="Move down"
                              >
                                <DynamicIcon
                                  name="ChevronDown"
                                  className="w-4 h-4"
                                />
                              </button>
                            </div>

                            <div className="flex flex-row items-center gap-1 ml-3">
                              <button
                                onClick={() => startEditPlotBeat(index)}
                                className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors text-sm"
                              >
                                <DynamicIcon name="Edit2" className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => removePlotBeat(index)}
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
                      </div>
                    )}
                  </div>
                ))
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
                      "warning"
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
                                  1000
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
                                "warning"
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
                            1
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
                                    quests.filter((_, i) => i !== index)
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
                  )
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
                  Track custom values: numbers, flags, and lists
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
                  onChange={(updated) => {
                    const newVars = [...variables];
                    newVars[index] = updated;
                    setVariables(newVars);
                  }}
                  onDelete={() => {
                    setVariables(variables.filter((_, i) => i !== index));
                  }}
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
                    or lists of items that the AI can reference and modify.
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
                  <span className="text-2xl">??</span>
                  Mythic GME Settings
                </h3>
                <p className="text-sm text-gray-400 mt-1">
                  Optional oracle-driven storytelling with dynamic chaos
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={mythicEnabled}
                  onChange={(e) => setMythicEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-14 h-7 bg-gray-700 peer-focus:ring-4 peer-focus:ring-purple-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-1 after:bg-white after:border-blue-700/40 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>

            {mythicEnabled && (
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
                      value={mythicState.chaosFactor}
                      onChange={(e) =>
                        setMythicState({
                          ...mythicState,
                          chaosFactor: parseInt(e.target.value),
                        })
                      }
                      className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-linear-to-br [&::-webkit-slider-thumb]:from-purple-500 [&::-webkit-slider-thumb]:to-blue-500 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:hover:scale-110 [&::-webkit-slider-thumb]:transition-transform"
                    />
                    <div className="flex justify-between items-center">
                      <div className="text-center">
                        <span
                          className={`text-3xl font-bold ${getChaosColor(
                            mythicState.chaosFactor
                          )}`}
                        >
                          {mythicState.chaosFactor}
                        </span>
                        <span className="text-xs text-gray-400 block mt-1">
                          / 9
                        </span>
                      </div>
                      <div className="text-right flex-1 ml-4">
                        <p
                          className={`text-sm font-semibold ${getChaosColor(
                            mythicState.chaosFactor
                          )}`}
                        >
                          {getChaosLabel(mythicState.chaosFactor)}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {getChaosDescription(mythicState.chaosFactor)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Starting Threads */}
                <div className="p-6 rounded-lg bg-linear-to-br from-blue-900/20 to-gray-900/50 border border-blue-500/20">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-bold text-blue-400 flex items-center gap-2">
                      <span>??</span>
                      Starting Story Threads
                      {mythicState.threads.length > 0 && (
                        <span className="text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-300">
                          {mythicState.threads.length}
                        </span>
                      )}
                    </h4>
                  </div>
                  <div className="space-y-3 mb-4">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newThread}
                        onChange={(e) => setNewThread(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newThread.trim()) {
                            setMythicState({
                              ...mythicState,
                              threads: [
                                ...mythicState.threads,
                                {
                                  id: crypto.randomUUID(),
                                  description: newThread.trim(),
                                  status: "active",
                                  createdAt: Date.now(),
                                },
                              ],
                            });
                            setNewThread("");
                          }
                        }}
                        placeholder="Add a story thread (e.g., Find the missing heir)"
                        className="flex-1 px-3 py-2 border-2 border-gray-600 rounded-lg bg-gray-900 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={() => {
                          if (newThread.trim()) {
                            setMythicState({
                              ...mythicState,
                              threads: [
                                ...mythicState.threads,
                                {
                                  id: crypto.randomUUID(),
                                  description: newThread.trim(),
                                  status: "active",
                                  createdAt: Date.now(),
                                },
                              ],
                            });
                            setNewThread("");
                          }
                        }}
                        disabled={!newThread.trim()}
                        className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 disabled:bg-gray-700 disabled:text-gray-500 text-blue-400 font-semibold rounded-lg transition-colors border border-blue-500/30 hover:border-blue-500/50"
                      >
                        + Add
                      </button>
                    </div>
                    {mythicState.threads.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <p className="text-sm">No threads yet</p>
                        <p className="text-xs mt-1">
                          Threads track ongoing plotlines and mysteries
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {mythicState.threads.map((thread) => (
                          <div
                            key={thread.id}
                            className="group p-4 rounded-lg bg-gray-800/50 border border-gray-700 hover:border-blue-500/50 transition-all duration-200"
                          >
                            {editingThreadId === thread.id ? (
                              <div className="flex gap-3">
                                <span className="text-2xl">??</span>
                                <input
                                  type="text"
                                  value={editThreadDescription}
                                  onChange={(e) =>
                                    setEditThreadDescription(e.target.value)
                                  }
                                  className="flex-1 px-2 py-1 border border-gray-600 rounded bg-gray-900 text-white"
                                />
                                <button
                                  onClick={() => {
                                    setMythicState({
                                      ...mythicState,
                                      threads: mythicState.threads.map((t) =>
                                        t.id === thread.id
                                          ? {
                                              ...t,
                                              description:
                                                editThreadDescription,
                                            }
                                          : t
                                      ),
                                    });
                                    setEditingThreadId(null);
                                    setEditThreadDescription("");
                                  }}
                                  className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded"
                                >
                                  <DynamicIcon
                                    name="Check"
                                    className="w-4 h-4"
                                  />
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingThreadId(null);
                                    setEditThreadDescription("");
                                  }}
                                  className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded"
                                >
                                  <DynamicIcon name="X" className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex gap-3">
                                <span className="text-2xl">??</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-gray-200 leading-relaxed">
                                    {thread.description}
                                  </p>
                                  {thread.description.length < 10 &&
                                    thread.description.length > 0 && (
                                      <p className="text-xs text-red-400 mt-1">
                                        Too short (min 10 characters)
                                      </p>
                                    )}
                                </div>
                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => {
                                      setEditingThreadId(thread.id);
                                      setEditThreadDescription(
                                        thread.description
                                      );
                                    }}
                                    className="text-blue-400 hover:text-blue-300"
                                  >
                                    <DynamicIcon
                                      name="Edit2"
                                      className="w-4 h-4"
                                    />
                                  </button>
                                  <button
                                    onClick={() =>
                                      setMythicState({
                                        ...mythicState,
                                        threads: mythicState.threads.filter(
                                          (t) => t.id !== thread.id
                                        ),
                                      })
                                    }
                                    className="text-red-400 hover:text-red-300"
                                  >
                                    <DynamicIcon
                                      name="Trash2"
                                      className="w-4 h-4"
                                    />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Starting Characters/NPCs */}
                <div className="p-6 rounded-lg bg-linear-to-br from-green-900/20 to-gray-900/50 border border-green-500/20">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-bold text-green-400 flex items-center gap-2">
                      <span>??</span>
                      Starting NPCs
                      {mythicState.characters.length > 0 && (
                        <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-300">
                          {mythicState.characters.length}
                        </span>
                      )}
                    </h4>
                  </div>
                  <div className="space-y-3 mb-4">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newCharacterName}
                        onChange={(e) => setNewCharacterName(e.target.value)}
                        placeholder="Name (e.g., Marcus the Merchant)"
                        className="flex-1 px-3 py-2 border-2 border-gray-600 rounded-lg bg-gray-900 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                      <input
                        type="text"
                        value={newCharacterRole}
                        onChange={(e) => setNewCharacterRole(e.target.value)}
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            newCharacterName.trim() &&
                            newCharacterRole.trim()
                          ) {
                            setMythicState({
                              ...mythicState,
                              characters: [
                                ...mythicState.characters,
                                {
                                  id: crypto.randomUUID(),
                                  name: newCharacterName.trim(),
                                  role: newCharacterRole.trim(),
                                  status: "active",
                                  createdAt: Date.now(),
                                },
                              ],
                            });
                            setNewCharacterName("");
                            setNewCharacterRole("");
                          }
                        }}
                        placeholder="Role (e.g., Tavern keeper)"
                        className="flex-1 px-3 py-2 border-2 border-gray-600 rounded-lg bg-gray-900 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                      <button
                        onClick={() => {
                          if (
                            newCharacterName.trim() &&
                            newCharacterRole.trim()
                          ) {
                            setMythicState({
                              ...mythicState,
                              characters: [
                                ...mythicState.characters,
                                {
                                  id: crypto.randomUUID(),
                                  name: newCharacterName.trim(),
                                  role: newCharacterRole.trim(),
                                  status: "active",
                                  createdAt: Date.now(),
                                },
                              ],
                            });
                            setNewCharacterName("");
                            setNewCharacterRole("");
                          }
                        }}
                        disabled={
                          !newCharacterName.trim() || !newCharacterRole.trim()
                        }
                        className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 disabled:bg-gray-700 disabled:text-gray-500 text-green-400 font-semibold rounded-lg transition-colors border border-green-500/30 hover:border-green-500/50"
                      >
                        + Add
                      </button>
                    </div>
                    {mythicState.characters.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <p className="text-sm">No characters yet</p>
                        <p className="text-xs mt-1">
                          Add important NPCs that will appear in the story
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {mythicState.characters.map((char) => (
                          <div
                            key={char.id}
                            className="group p-4 rounded-lg bg-gray-800/50 border border-gray-700 hover:border-green-500/50 transition-all duration-200"
                          >
                            {editingCharacterId === char.id ? (
                              <div className="flex gap-3">
                                <span className="text-2xl">??</span>
                                <div className="flex-1 space-y-2">
                                  <input
                                    type="text"
                                    value={editCharacterName}
                                    onChange={(e) =>
                                      setEditCharacterName(e.target.value)
                                    }
                                    placeholder="Character name..."
                                    className="w-full bg-transparent text-gray-200 placeholder-gray-500 focus:outline-none text-sm font-semibold border-b border-gray-700 focus:border-green-500/50 transition-colors pb-1"
                                  />
                                  <input
                                    type="text"
                                    value={editCharacterRole}
                                    onChange={(e) =>
                                      setEditCharacterRole(e.target.value)
                                    }
                                    placeholder="Role/description..."
                                    className="w-full bg-transparent text-gray-300 placeholder-gray-500 focus:outline-none text-sm"
                                  />
                                </div>
                                <button
                                  onClick={() => {
                                    setMythicState({
                                      ...mythicState,
                                      characters: mythicState.characters.map(
                                        (c) =>
                                          c.id === char.id
                                            ? {
                                                ...c,
                                                name: editCharacterName,
                                                role: editCharacterRole,
                                              }
                                            : c
                                      ),
                                    });
                                    setEditingCharacterId(null);
                                    setEditCharacterName("");
                                    setEditCharacterRole("");
                                  }}
                                  className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded"
                                >
                                  <DynamicIcon
                                    name="Check"
                                    className="w-4 h-4"
                                  />
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingCharacterId(null);
                                    setEditCharacterName("");
                                    setEditCharacterRole("");
                                  }}
                                  className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded"
                                >
                                  <DynamicIcon name="X" className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex gap-3">
                                <span className="text-2xl">??</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-gray-200">
                                    {char.name}
                                  </p>
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    {char.role}
                                  </p>
                                  {((char.name.length < 2 &&
                                    char.name.length > 0) ||
                                    (char.role.length < 5 &&
                                      char.role.length > 0)) && (
                                    <p className="text-xs text-red-400 mt-1">
                                      {char.name.length < 2 &&
                                      char.name.length > 0
                                        ? "Name too short (min 2)"
                                        : ""}
                                      {char.role.length < 5 &&
                                      char.role.length > 0
                                        ? "Role too short (min 5)"
                                        : ""}
                                    </p>
                                  )}
                                </div>
                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => {
                                      setEditingCharacterId(char.id);
                                      setEditCharacterName(char.name);
                                      setEditCharacterRole(char.role);
                                    }}
                                    className="text-blue-400 hover:text-blue-300"
                                  >
                                    <DynamicIcon
                                      name="Edit2"
                                      className="w-4 h-4"
                                    />
                                  </button>
                                  <button
                                    onClick={() =>
                                      setMythicState({
                                        ...mythicState,
                                        characters:
                                          mythicState.characters.filter(
                                            (c) => c.id !== char.id
                                          ),
                                      })
                                    }
                                    className="text-red-400 hover:text-red-300"
                                  >
                                    <DynamicIcon
                                      name="Trash2"
                                      className="w-4 h-4"
                                    />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case "upgrades":
        return (
          <div className="space-y-6">
            <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-4">
              <p className="text-sm text-blue-100">
                <DynamicIcon
                  name="Lightbulb"
                  className="inline-block w-4 h-4 mr-1 text-blue-600"
                />
                Configure the upgrade system for your adventure. Control whether
                players can spend points to upgrade stats, resources, or add
                items, and customize the costs and amounts.
              </p>
            </div>

            {/* Master Toggle */}
            <div className="bg-blue-900/20 rounded-lg border border-blue-700/40 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">
                    Enable Upgrade System
                  </h3>
                  <p className="text-sm text-blue-300/60">
                    Allow players to spend points on upgrades
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={upgradeSettings.enabled}
                    onChange={(e) =>
                      setUpgradeSettings({
                        ...upgradeSettings,
                        enabled: e.target.checked,
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-14 h-7 bg-blue-900/40 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-4 after:bg-white after:border-blue-700/40 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>
            </div>

            {upgradeSettings.enabled && (
              <>
                {/* Stat Upgrades */}
                <div className="bg-blue-900/20 rounded-lg border border-blue-700/40 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white">
                      ?? Stat Upgrades
                    </h3>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={upgradeSettings.allowStatUpgrade}
                        onChange={(e) =>
                          setUpgradeSettings({
                            ...upgradeSettings,
                            allowStatUpgrade: e.target.checked,
                          })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-blue-900/40 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:bg-white after:border-blue-700/40 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  {upgradeSettings.allowStatUpgrade && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-blue-200 mb-2">
                          Cost (points)
                        </label>
                        <input
                          type="number"
                          value={upgradeSettings.statUpgradeCost}
                          onChange={(e) =>
                            setUpgradeSettings({
                              ...upgradeSettings,
                              statUpgradeCost: Math.max(
                                1,
                                parseInt(e.target.value) || 1
                              ),
                            })
                          }
                          min="1"
                          className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-blue-200 mb-2">
                          Increase Amount
                        </label>
                        <input
                          type="number"
                          value={upgradeSettings.statUpgradeAmount}
                          onChange={(e) =>
                            setUpgradeSettings({
                              ...upgradeSettings,
                              statUpgradeAmount: Math.max(
                                1,
                                parseInt(e.target.value) || 1
                              ),
                            })
                          }
                          min="1"
                          max="10"
                          className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Resource Upgrades */}
                <div className="bg-blue-900/20 rounded-lg border border-blue-700/40 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white">
                      ? Resource Upgrades
                    </h3>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={upgradeSettings.allowResourceUpgrade}
                        onChange={(e) =>
                          setUpgradeSettings({
                            ...upgradeSettings,
                            allowResourceUpgrade: e.target.checked,
                          })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-blue-900/40 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-blue-700/40 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                    </label>
                  </div>

                  {upgradeSettings.allowResourceUpgrade && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-blue-200 mb-2">
                          Cost (points)
                        </label>
                        <input
                          type="number"
                          value={upgradeSettings.resourceUpgradeCost}
                          onChange={(e) =>
                            setUpgradeSettings({
                              ...upgradeSettings,
                              resourceUpgradeCost: Math.max(
                                1,
                                parseInt(e.target.value) || 1
                              ),
                            })
                          }
                          min="1"
                          className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-blue-200 mb-2">
                          Max Value Increase
                        </label>
                        <input
                          type="number"
                          value={upgradeSettings.resourceUpgradeAmount}
                          onChange={(e) =>
                            setUpgradeSettings({
                              ...upgradeSettings,
                              resourceUpgradeAmount: Math.max(
                                1,
                                parseInt(e.target.value) || 1
                              ),
                            })
                          }
                          min="1"
                          max="50"
                          className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Add Item */}
                <div className="bg-blue-900/20 rounded-lg border border-blue-700/40 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white">
                      ?? Add Custom Items
                    </h3>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={upgradeSettings.allowAddItem}
                        onChange={(e) =>
                          setUpgradeSettings({
                            ...upgradeSettings,
                            allowAddItem: e.target.checked,
                          })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-blue-900/40 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-blue-700/40 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                    </label>
                  </div>

                  {upgradeSettings.allowAddItem && (
                    <div>
                      <label className="block text-sm font-semibold text-blue-200 mb-2">
                        Cost (points per item)
                      </label>
                      <input
                        type="number"
                        value={upgradeSettings.addItemCost}
                        onChange={(e) =>
                          setUpgradeSettings({
                            ...upgradeSettings,
                            addItemCost: Math.max(
                              1,
                              parseInt(e.target.value) || 1
                            ),
                          })
                        }
                        min="1"
                        className="w-full px-3 py-2 border border-blue-700/40 rounded-lg bg-blue-900/30 text-white"
                      />
                    </div>
                  )}
                </div>

                {/* Stat Shop */}
                <div className="bg-blue-900/20 rounded-lg border border-blue-700/40 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <DynamicIcon name="Store" className="w-5 h-5" /> Stat Shop
                    </h3>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={upgradeSettings.statShopEnabled}
                        onChange={(e) =>
                          setUpgradeSettings({
                            ...upgradeSettings,
                            statShopEnabled: e.target.checked,
                          })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-blue-900/40 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-blue-700/40 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
                    </label>
                  </div>
                  <p className="text-xs text-blue-300/60 mb-4">
                    Allow players to unlock new stats with points
                  </p>

                  {upgradeSettings.statShopEnabled && (
                    <div className="space-y-3">
                      <button
                        onClick={() => {
                          const newStat = {
                            name: "New Stat",
                            description: "Description...",
                            symbol: "Star",
                            startingValue: 1,
                            cost: 50,
                          };
                          setUpgradeSettings({
                            ...upgradeSettings,
                            statShop: [...upgradeSettings.statShop, newStat],
                          });
                        }}
                        className="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-lg flex items-center justify-center gap-2"
                      >
                        <DynamicIcon name="Plus" className="w-4 h-4" /> Add Shop
                        Stat
                      </button>

                      {upgradeSettings.statShop.map((stat, index) => (
                        <div
                          key={index}
                          className="p-3 bg-cyan-900/20 rounded-lg border border-cyan-800/50"
                        >
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <input
                              type="text"
                              value={stat.name}
                              onChange={(e) => {
                                const updated = [...upgradeSettings.statShop];
                                updated[index].name = e.target.value;
                                setUpgradeSettings({
                                  ...upgradeSettings,
                                  statShop: updated,
                                });
                              }}
                              placeholder="Name"
                              className="px-2 py-1 text-sm border rounded bg-blue-900/20 text-white"
                            />
                            <IconPicker
                              value={stat.symbol}
                              onChange={(icon) => {
                                const updated = [...upgradeSettings.statShop];
                                updated[index].symbol = icon;
                                setUpgradeSettings({
                                  ...upgradeSettings,
                                  statShop: updated,
                                });
                              }}
                            />
                          </div>
                          <input
                            type="text"
                            value={stat.description}
                            onChange={(e) => {
                              const updated = [...upgradeSettings.statShop];
                              updated[index].description = e.target.value;
                              setUpgradeSettings({
                                ...upgradeSettings,
                                statShop: updated,
                              });
                            }}
                            placeholder="Description"
                            className="w-full px-2 py-1 text-sm border rounded mb-2 bg-blue-900/20 text-white"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs text-blue-300/60">
                                Starting Value
                              </label>
                              <input
                                type="number"
                                value={stat.startingValue}
                                onChange={(e) => {
                                  const updated = [...upgradeSettings.statShop];
                                  updated[index].startingValue = parseInt(
                                    e.target.value
                                  );
                                  setUpgradeSettings({
                                    ...upgradeSettings,
                                    statShop: updated,
                                  });
                                }}
                                className="w-full px-2 py-1 text-sm border rounded bg-blue-900/20 text-white"
                                min="1"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-blue-300/60">
                                Cost (points)
                              </label>
                              <input
                                type="number"
                                value={stat.cost}
                                onChange={(e) => {
                                  const updated = [...upgradeSettings.statShop];
                                  updated[index].cost = parseInt(
                                    e.target.value
                                  );
                                  setUpgradeSettings({
                                    ...upgradeSettings,
                                    statShop: updated,
                                  });
                                }}
                                className="w-full px-2 py-1 text-sm border rounded bg-blue-900/20 text-white"
                                min="1"
                              />
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              const updated = upgradeSettings.statShop.filter(
                                (_, i) => i !== index
                              );
                              setUpgradeSettings({
                                ...upgradeSettings,
                                statShop: updated,
                              });
                            }}
                            className="w-full mt-2 px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Resource Shop */}
                <div className="bg-blue-900/20 rounded-lg border border-blue-700/40 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <DynamicIcon name="ShoppingCart" className="w-5 h-5" />{" "}
                      Resource Shop
                    </h3>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={upgradeSettings.resourceShopEnabled}
                        onChange={(e) =>
                          setUpgradeSettings({
                            ...upgradeSettings,
                            resourceShopEnabled: e.target.checked,
                          })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-blue-900/40 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-blue-700/40 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
                    </label>
                  </div>
                  <p className="text-xs text-blue-300/60 mb-4">
                    Allow players to unlock new resources with points
                  </p>

                  {upgradeSettings.resourceShopEnabled && (
                    <div className="space-y-3">
                      <button
                        onClick={() => {
                          const newResource = {
                            name: "New Resource",
                            description: "Description...",
                            symbol: "Gem",
                            startingValue: 10,
                            startingMaxValue: 100,
                            cost: 75,
                          };
                          setUpgradeSettings({
                            ...upgradeSettings,
                            resourceShop: [
                              ...upgradeSettings.resourceShop,
                              newResource,
                            ],
                          });
                        }}
                        className="w-full px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg flex items-center justify-center gap-2"
                      >
                        <DynamicIcon name="Plus" className="w-4 h-4" /> Add Shop
                        Resource
                      </button>

                      {upgradeSettings.resourceShop.map((resource, index) => (
                        <div
                          key={index}
                          className="p-3 bg-teal-900/20 rounded-lg border border-teal-800/50"
                        >
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <input
                              type="text"
                              value={resource.name}
                              onChange={(e) => {
                                const updated = [
                                  ...upgradeSettings.resourceShop,
                                ];
                                updated[index].name = e.target.value;
                                setUpgradeSettings({
                                  ...upgradeSettings,
                                  resourceShop: updated,
                                });
                              }}
                              placeholder="Name"
                              className="px-2 py-1 text-sm border rounded bg-blue-900/20 text-white"
                            />
                            <IconPicker
                              value={resource.symbol}
                              onChange={(icon) => {
                                const updated = [
                                  ...upgradeSettings.resourceShop,
                                ];
                                updated[index].symbol = icon;
                                setUpgradeSettings({
                                  ...upgradeSettings,
                                  resourceShop: updated,
                                });
                              }}
                            />
                          </div>
                          <input
                            type="text"
                            value={resource.description}
                            onChange={(e) => {
                              const updated = [...upgradeSettings.resourceShop];
                              updated[index].description = e.target.value;
                              setUpgradeSettings({
                                ...upgradeSettings,
                                resourceShop: updated,
                              });
                            }}
                            placeholder="Description"
                            className="w-full px-2 py-1 text-sm border rounded mb-2 bg-blue-900/20 text-white"
                          />
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="text-xs text-blue-300/60">
                                Start Value
                              </label>
                              <input
                                type="number"
                                value={resource.startingValue}
                                onChange={(e) => {
                                  const updated = [
                                    ...upgradeSettings.resourceShop,
                                  ];
                                  updated[index].startingValue = parseInt(
                                    e.target.value
                                  );
                                  setUpgradeSettings({
                                    ...upgradeSettings,
                                    resourceShop: updated,
                                  });
                                }}
                                className="w-full px-2 py-1 text-sm border rounded bg-blue-900/20 text-white"
                                min="0"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-blue-300/60">
                                Max Value
                              </label>
                              <input
                                type="number"
                                value={resource.startingMaxValue}
                                onChange={(e) => {
                                  const updated = [
                                    ...upgradeSettings.resourceShop,
                                  ];
                                  updated[index].startingMaxValue = parseInt(
                                    e.target.value
                                  );
                                  setUpgradeSettings({
                                    ...upgradeSettings,
                                    resourceShop: updated,
                                  });
                                }}
                                className="w-full px-2 py-1 text-sm border rounded bg-blue-900/20 text-white"
                                min="1"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-blue-300/60">
                                Cost (points)
                              </label>
                              <input
                                type="number"
                                value={resource.cost}
                                onChange={(e) => {
                                  const updated = [
                                    ...upgradeSettings.resourceShop,
                                  ];
                                  updated[index].cost = parseInt(
                                    e.target.value
                                  );
                                  setUpgradeSettings({
                                    ...upgradeSettings,
                                    resourceShop: updated,
                                  });
                                }}
                                className="w-full px-2 py-1 text-sm border rounded bg-blue-900/20 text-white"
                                min="1"
                              />
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              const updated =
                                upgradeSettings.resourceShop.filter(
                                  (_, i) => i !== index
                                );
                              setUpgradeSettings({
                                ...upgradeSettings,
                                resourceShop: updated,
                              });
                            }}
                            className="w-full mt-2 px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Item Shop */}
                <div className="bg-blue-900/20 rounded-lg border border-blue-700/40 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <DynamicIcon name="Store" className="w-5 h-5" /> Item Shop
                    </h3>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={upgradeSettings.itemShopEnabled}
                        onChange={(e) =>
                          setUpgradeSettings({
                            ...upgradeSettings,
                            itemShopEnabled: e.target.checked,
                          })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-blue-900/40 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-blue-700/40 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                    </label>
                  </div>
                  <p className="text-xs text-blue-300/60 mb-4">
                    Provide curated items players can purchase
                  </p>

                  {upgradeSettings.itemShopEnabled && (
                    <div className="space-y-3">
                      <button
                        onClick={() => {
                          const newItem = {
                            name: "New Item",
                            description: "Description...",
                            symbol: "Package",
                            type: "normal" as const,
                            quantity: 1,
                            cost: 30,
                          };
                          setUpgradeSettings({
                            ...upgradeSettings,
                            itemShop: [...upgradeSettings.itemShop, newItem],
                          });
                        }}
                        className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg flex items-center justify-center gap-2"
                      >
                        <DynamicIcon name="Plus" className="w-4 h-4" /> Add Shop
                        Item
                      </button>

                      {upgradeSettings.itemShop.map((item, index) => (
                        <div
                          key={index}
                          className="p-3 bg-amber-900/20 rounded-lg border border-amber-800/50"
                        >
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <input
                              type="text"
                              value={item.name}
                              onChange={(e) => {
                                const updated = [...upgradeSettings.itemShop];
                                updated[index].name = e.target.value;
                                setUpgradeSettings({
                                  ...upgradeSettings,
                                  itemShop: updated,
                                });
                              }}
                              placeholder="Name"
                              className="px-2 py-1 text-sm border rounded bg-blue-900/20 text-white"
                            />
                            <IconPicker
                              value={item.symbol}
                              onChange={(icon) => {
                                const updated = [...upgradeSettings.itemShop];
                                updated[index].symbol = icon;
                                setUpgradeSettings({
                                  ...upgradeSettings,
                                  itemShop: updated,
                                });
                              }}
                            />
                          </div>
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => {
                              const updated = [...upgradeSettings.itemShop];
                              updated[index].description = e.target.value;
                              setUpgradeSettings({
                                ...upgradeSettings,
                                itemShop: updated,
                              });
                            }}
                            placeholder="Description"
                            className="w-full px-2 py-1 text-sm border rounded mb-2 bg-blue-900/20 text-white"
                          />
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="text-xs text-blue-300/60">
                                Type
                              </label>
                              <select
                                value={item.type}
                                onChange={(e) => {
                                  const updated = [...upgradeSettings.itemShop];
                                  updated[index].type = e.target.value as any;
                                  setUpgradeSettings({
                                    ...upgradeSettings,
                                    itemShop: updated,
                                  });
                                }}
                                className="w-full px-2 py-1 text-sm border rounded bg-blue-900/20 text-white"
                              >
                                <option value="normal">Normal</option>
                                <option value="consumable">Consumable</option>
                                <option value="story">Story</option>
                                <option value="misc">Misc</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-blue-300/60">
                                Quantity
                              </label>
                              <input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => {
                                  const updated = [...upgradeSettings.itemShop];
                                  updated[index].quantity = parseInt(
                                    e.target.value
                                  );
                                  setUpgradeSettings({
                                    ...upgradeSettings,
                                    itemShop: updated,
                                  });
                                }}
                                className="w-full px-2 py-1 text-sm border rounded bg-blue-900/20 text-white"
                                min="1"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-blue-300/60">
                                Cost (points)
                              </label>
                              <input
                                type="number"
                                value={item.cost}
                                onChange={(e) => {
                                  const updated = [...upgradeSettings.itemShop];
                                  updated[index].cost = parseInt(
                                    e.target.value
                                  );
                                  setUpgradeSettings({
                                    ...upgradeSettings,
                                    itemShop: updated,
                                  });
                                }}
                                className="w-full px-2 py-1 text-sm border rounded bg-blue-900/20 text-white"
                                min="1"
                              />
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              const updated = upgradeSettings.itemShop.filter(
                                (_, i) => i !== index
                              );
                              setUpgradeSettings({
                                ...upgradeSettings,
                                itemShop: updated,
                              });
                            }}
                            className="w-full mt-2 px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
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
                    <span className="text-blue-300/60">Lore Entries:</span>
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
                    <span className="text-blue-300/60">Plot Beats:</span>
                    <span className="ml-2 font-semibold text-white">
                      {plotBeats.length}
                    </span>
                  </div>
                  <div>
                    <span className="text-blue-300/60">Tags:</span>
                    <span className="ml-2 font-semibold text-white">
                      {tags.length}
                    </span>
                  </div>
                  <div>
                    <span className="text-blue-300/60">Starting Points:</span>
                    <span className="ml-2 font-semibold text-white">
                      {points}
                    </span>
                  </div>
                  <div>
                    <span className="text-blue-300/60">Momentum:</span>
                    <span className="ml-2 font-semibold text-white">
                      {momentum}/{maxMomentum}
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
      <div className="min-h-screen bg-[#030712] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-white font-semibold">Loading adventure...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030712] pt-16">
      <div className="max-w-6xl mx-auto p-3 sm:p-6">
        {/* Compact Header */}
        <div className="bg-[#0f1a2e] rounded-xl p-4 border border-blue-800/30 mb-4">
          <div className="flex items-center justify-between">
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
                  {title || "Untitled"} ? Step {currentStepIndex + 1}/
                  {steps.length}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
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
        </div>

        {/* Progress Steps */}
        <div className="mb-4 bg-[#0f1a2e] rounded-xl p-3 border border-blue-800/30">
          <DraggableScroll innerClassName="gap-2">
            {steps.map((step, index) => (
              <button
                key={step.id}
                onClick={() => setCurrentStep(step.id)}
                className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-all whitespace-nowrap text-sm ${
                  currentStep === step.id
                    ? "bg-purple-600 text-white shadow-md"
                    : index < currentStepIndex
                    ? "bg-green-900/30 text-green-400 border border-green-800/30"
                    : "bg-blue-900/30 text-blue-300 hover:bg-blue-800/40"
                }`}
              >
                <DynamicIcon name={step.icon} className="w-4 h-4" />
                <span className="hidden sm:inline">{step.label}</span>
              </button>
            ))}
          </DraggableScroll>
        </div>

        {/* Content */}
        <div className="bg-[#0f1a2e] rounded-xl p-4 sm:p-6 border border-blue-800/30 mb-4">
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
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0f1a2e] rounded-xl p-3 border border-blue-800/30 mb-5">
          <button
            onClick={() => {
              const prevIndex = Math.max(0, currentStepIndex - 1);
              setCurrentStep(steps[prevIndex].id);
            }}
            disabled={currentStepIndex === 0}
            className="px-4 py-2.5 bg-blue-800/40 hover:bg-blue-700/50 disabled:opacity-50 disabled:cursor-not-allowed text-blue-200 text-sm font-medium rounded-lg transition-colors border border-blue-700/30"
          >
            ? Previous
          </button>

          <div className="text-xs sm:text-sm text-blue-300/60 text-center">
            Step {currentStepIndex + 1} of {steps.length}
          </div>

          {currentStep === "preview" ? (
            <div className="flex gap-2">
              <button
                onClick={handleSaveLocally}
                disabled={saving}
                className="flex-1 sm:flex-none px-3 py-3 sm:py-2.5 bg-blue-800/40 hover:bg-blue-700/50 active:bg-blue-600/50 text-blue-200 text-sm font-medium rounded-lg transition-all whitespace-nowrap border border-blue-700/30 touch-manipulation flex items-center justify-center gap-2"
                title="Save to your device without publishing"
              >
                <DynamicIcon name="Save" className="w-4 h-4" />
                <span className="hidden sm:inline">Save Locally</span>
                <span className="sm:hidden">Local</span>
              </button>
              {isLocal && (
                <button
                  onClick={handleSaveToDatabase}
                  disabled={saving}
                  className="flex-1 sm:flex-none px-3 py-3 sm:py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:bg-blue-800/30 disabled:text-blue-300/40 text-white text-sm font-medium rounded-lg transition-all whitespace-nowrap touch-manipulation flex items-center justify-center gap-2"
                  title="Upload local adventure to database"
                >
                  {saving ? (
                    <>
                      <DynamicIcon
                        name="Loader2"
                        className="w-4 h-4 animate-spin"
                      />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <DynamicIcon name="Upload" className="w-4 h-4" />
                      <span className="hidden sm:inline">Save to Database</span>
                      <span className="sm:hidden">Upload</span>
                    </>
                  )}
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 sm:flex-none px-3 py-3 sm:py-2.5 bg-green-600 hover:bg-green-500 active:bg-green-700 disabled:bg-blue-800/30 disabled:text-blue-300/40 text-white text-sm font-medium rounded-lg transition-all whitespace-nowrap touch-manipulation flex items-center justify-center gap-2"
                title={
                  isLocal ? "Save changes locally" : "Publish to the community"
                }
              >
                {saving ? (
                  <>
                    <DynamicIcon
                      name="Loader2"
                      className="w-4 h-4 animate-spin"
                    />
                    {isLocal ? "Saving..." : "Publishing..."}
                  </>
                ) : (
                  <>
                    <DynamicIcon
                      name={isLocal ? "Save" : "Rocket"}
                      className="w-4 h-4"
                    />
                    {isLocal ? "Save" : "Publish"}
                  </>
                )}
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                const nextIndex = Math.min(
                  steps.length - 1,
                  currentStepIndex + 1
                );
                setCurrentStep(steps[nextIndex].id);
              }}
              className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Next ?
            </button>
          )}
        </div>
      </div>

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

      <CreatorAIChat
        isOpen={isAIMenuOpen}
        onClose={() => setIsAIMenuOpen(false)}
        adventureId={editAdventureId || undefined}
        currentStoryData={{
          story_name: title,
          premise,
          player_name: playerName,
          player_summary: playerSummary,
          intro: intro,
          author_notes: authorNotes,
          stats,
          resources,
          inventory,
          plot_beats: plotBeats,
          lore,
          achievements,
          quests,
          presets,
          upgradeSettings,
          mythicState: mythicEnabled ? mythicState : undefined,
          customTables,
        }}
        adventureMetadata={{
          title: title,
          shortDescription: shortDescription,
          description: description,
          startingChoices: startingChoices,
        }}
        onApplyChanges={handleApplyAIChanges}
      />
    </div>
  );
}

export default function AdventureCreatorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-linear-to-br from-gray-900 via-purple-900 to-blue-900 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-400"></div>
        </div>
      }
    >
      <AdventureCreatorContent />
    </Suspense>
  );
}
