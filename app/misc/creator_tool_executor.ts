/**
 * Creator Tool Executor - Executes creator tools and returns results
 *
 * This module handles execution of creator AI tool calls, modifying
 * adventure data and returning success/failure messages.
 */

import {
  StoryData,
  Stat,
  Resource,
  InventoryItem,
  Ability,
  Achievement,
  StoryLore,
  Quest,
  Relationship,
  Variable,
  NumberVariable,
  BooleanVariable,
  StringVariable,
  ListVariable,
  Preset,
  SkillTree,
  SkillNode,
  CustomTable,
  UpgradeSettings,
  LevelingSettings,
  StartingChoice,
  ItemGrade,
  AbilityGrade,
} from "@/app/misc/structs";
import { getCumulativeXPForLevel } from "@/app/misc/leveling";

// Tool call from AI response
export interface CreatorToolCall {
  id: string;
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

// Result of executing a tool
export interface CreatorToolResult {
  toolCallId: string;
  toolName: string;
  success: boolean;
  message: string;
  changes?: string[]; // Human-readable list of changes made
  args?: Record<string, unknown>; // The parsed arguments sent to the tool
}

// Data structure for tracking all changes
export interface CreatorChanges {
  // Story data changes
  stats?: Stat[];
  resources?: Resource[];
  inventory?: InventoryItem[];
  abilities?: Ability[];
  lore?: StoryLore[];
  achievements?: Achievement[];
  quests?: Quest[];
  relationships?: Relationship[];
  variables?: Variable[];
  presets?: Preset[];
  skillTrees?: SkillTree[];
  customTables?: CustomTable[];
  upgradeSettings?: Partial<UpgradeSettings>;
  levelingSettings?: Partial<LevelingSettings>;

  // Basic info changes
  story_name?: string;
  premise?: string;
  player_name?: string;
  player_summary?: string;
  intro?: string;
  author_notes?: string;

  // Progression changes
  level?: number;
  points?: number;
  upgradesSpent?: number;

  // Metadata changes
  title?: string;
  shortDescription?: string;
  description?: string;
  startingChoices?: StartingChoice[];
}

// Current state passed to executor
export interface CreatorCurrentState {
  storyData: Partial<StoryData>;
  adventureMetadata?: {
    title?: string;
    shortDescription?: string;
    description?: string;
    startingChoices?: StartingChoice[];
  };
}

/**
 * Execute a single creator tool call
 */
export function executeCreatorTool(
  toolCall: CreatorToolCall,
  currentState: CreatorCurrentState
): { result: CreatorToolResult; changes: CreatorChanges } {
  const { name, arguments: argsJson } = toolCall.function;
  let args: Record<string, unknown>;

  try {
    args = JSON.parse(argsJson);
  } catch (e) {
    return {
      result: {
        toolCallId: toolCall.id,
        toolName: name,
        success: false,
        message: `Failed to parse arguments: ${e}`,
      },
      changes: {},
    };
  }

  const changes: CreatorChanges = {};
  const changesList: string[] = [];

  try {
    switch (name) {
      // ============================================
      // STATS
      // ============================================
      case "add_stats": {
        const stats = args.stats as Stat[];
        const existingStats = [...(currentState.storyData.stats || [])];
        for (const stat of stats) {
          const existing = existingStats.find(
            (s) => s.name.toLowerCase() === stat.name.toLowerCase()
          );
          if (existing) {
            changesList.push(`Stat "${stat.name}" already exists, skipped`);
          } else {
            existingStats.push({
              name: stat.name,
              value: stat.value,
              description: stat.description,
              symbol: stat.symbol,
            });
            changesList.push(`Added stat: ${stat.name} (${stat.value})`);
          }
        }
        changes.stats = existingStats;
        break;
      }

      case "modify_stats": {
        const modifications = args.stats as Array<{
          name: string;
          new_name?: string;
          value?: number;
          description?: string;
          symbol?: string;
        }>;
        const existingStats = [...(currentState.storyData.stats || [])];
        for (const mod of modifications) {
          const idx = existingStats.findIndex(
            (s) => s.name.toLowerCase() === mod.name.toLowerCase()
          );
          if (idx === -1) {
            changesList.push(`Stat "${mod.name}" not found, skipped`);
            continue;
          }
          if (mod.new_name !== undefined)
            existingStats[idx].name = mod.new_name;
          if (mod.value !== undefined) existingStats[idx].value = mod.value;
          if (mod.description !== undefined)
            existingStats[idx].description = mod.description;
          if (mod.symbol !== undefined) existingStats[idx].symbol = mod.symbol;
          changesList.push(`Modified stat: ${mod.name}`);
        }
        changes.stats = existingStats;
        break;
      }

      case "remove_stats": {
        const names = args.names as string[];
        const existingStats = [...(currentState.storyData.stats || [])];
        const remaining = existingStats.filter(
          (s) => !names.some((n) => n.toLowerCase() === s.name.toLowerCase())
        );
        const removed = existingStats.length - remaining.length;
        changesList.push(`Removed ${removed} stat(s)`);
        changes.stats = remaining;
        break;
      }

      // ============================================
      // RESOURCES
      // ============================================
      case "add_resources": {
        const resources = args.resources as Resource[];
        const existingResources = [...(currentState.storyData.resources || [])];
        for (const resource of resources) {
          const existing = existingResources.find(
            (r) => r.name.toLowerCase() === resource.name.toLowerCase()
          );
          if (existing) {
            changesList.push(
              `Resource "${resource.name}" already exists, skipped`
            );
          } else {
            existingResources.push({
              name: resource.name,
              value: resource.value,
              maxValue: resource.maxValue,
              description: resource.description,
              symbol: resource.symbol,
            });
            changesList.push(
              `Added resource: ${resource.name} (${resource.value}/${resource.maxValue})`
            );
          }
        }
        changes.resources = existingResources;
        break;
      }

      case "modify_resources": {
        const modifications = args.resources as Array<{
          name: string;
          new_name?: string;
          value?: number;
          maxValue?: number;
          description?: string;
          symbol?: string;
        }>;
        const existingResources = [...(currentState.storyData.resources || [])];
        for (const mod of modifications) {
          const idx = existingResources.findIndex(
            (r) => r.name.toLowerCase() === mod.name.toLowerCase()
          );
          if (idx === -1) {
            changesList.push(`Resource "${mod.name}" not found, skipped`);
            continue;
          }
          if (mod.new_name !== undefined)
            existingResources[idx].name = mod.new_name;
          if (mod.value !== undefined) existingResources[idx].value = mod.value;
          if (mod.maxValue !== undefined)
            existingResources[idx].maxValue = mod.maxValue;
          if (mod.description !== undefined)
            existingResources[idx].description = mod.description;
          if (mod.symbol !== undefined)
            existingResources[idx].symbol = mod.symbol;
          changesList.push(`Modified resource: ${mod.name}`);
        }
        changes.resources = existingResources;
        break;
      }

      case "remove_resources": {
        const names = args.names as string[];
        const existingResources = [...(currentState.storyData.resources || [])];
        const remaining = existingResources.filter(
          (r) => !names.some((n) => n.toLowerCase() === r.name.toLowerCase())
        );
        const removed = existingResources.length - remaining.length;
        changesList.push(`Removed ${removed} resource(s)`);
        changes.resources = remaining;
        break;
      }

      // ============================================
      // ITEMS
      // ============================================
      case "add_items": {
        const items = args.items as InventoryItem[];
        const existingItems = [...(currentState.storyData.inventory || [])];
        for (const item of items) {
          const existing = existingItems.find(
            (i) => i.name.toLowerCase() === item.name.toLowerCase()
          );
          if (existing) {
            existing.quantity += item.quantity || 1;
            changesList.push(
              `Added ${item.quantity || 1} to existing item: ${item.name}`
            );
          } else {
            const newItem: InventoryItem = {
              name: item.name,
              quantity: item.quantity || 1,
              description: item.description,
              type: item.type || "normal",
              symbol: item.symbol,
            };
            if (item.grade) newItem.grade = item.grade as ItemGrade;
            if (item.stat) newItem.stat = item.stat;
            existingItems.push(newItem);
            changesList.push(`Added item: ${item.name} x${item.quantity || 1}`);
          }
        }
        changes.inventory = existingItems;
        break;
      }

      case "modify_items": {
        const modifications = args.items as Array<{
          name: string;
          new_name?: string;
          quantity?: number;
          description?: string;
          type?: string;
          grade?: string;
          stat?: string;
          symbol?: string;
        }>;
        const existingItems = [...(currentState.storyData.inventory || [])];
        for (const mod of modifications) {
          const idx = existingItems.findIndex(
            (i) => i.name.toLowerCase() === mod.name.toLowerCase()
          );
          if (idx === -1) {
            changesList.push(`Item "${mod.name}" not found, skipped`);
            continue;
          }
          if (mod.new_name !== undefined)
            existingItems[idx].name = mod.new_name;
          if (mod.quantity !== undefined)
            existingItems[idx].quantity = mod.quantity;
          if (mod.description !== undefined)
            existingItems[idx].description = mod.description;
          if (mod.type !== undefined)
            existingItems[idx].type = mod.type as InventoryItem["type"];
          if (mod.grade !== undefined)
            existingItems[idx].grade = mod.grade as ItemGrade;
          if (mod.stat !== undefined) existingItems[idx].stat = mod.stat;
          if (mod.symbol !== undefined) existingItems[idx].symbol = mod.symbol;
          changesList.push(`Modified item: ${mod.name}`);
        }
        changes.inventory = existingItems;
        break;
      }

      case "remove_items": {
        const names = args.names as string[];
        const existingItems = [...(currentState.storyData.inventory || [])];
        const remaining = existingItems.filter(
          (i) => !names.some((n) => n.toLowerCase() === i.name.toLowerCase())
        );
        const removed = existingItems.length - remaining.length;
        changesList.push(`Removed ${removed} item(s)`);
        changes.inventory = remaining;
        break;
      }

      // ============================================
      // ABILITIES
      // ============================================
      case "add_abilities": {
        const abilities = args.abilities as Ability[];
        const existingAbilities = [...(currentState.storyData.abilities || [])];
        for (const ability of abilities) {
          const existing = existingAbilities.find(
            (a) => a.name.toLowerCase() === ability.name.toLowerCase()
          );
          if (existing) {
            changesList.push(
              `Ability "${ability.name}" already exists, skipped`
            );
          } else {
            existingAbilities.push({
              name: ability.name,
              description: ability.description,
              grade: (ability.grade || "novice") as AbilityGrade,
              cost: ability.cost || [],
              cooldown: ability.cooldown || 0,
              currentCooldown: 0,
              stat: ability.stat,
              symbol: ability.symbol,
            });
            changesList.push(
              `Added ability: ${ability.name} [${ability.grade}]`
            );
          }
        }
        changes.abilities = existingAbilities;
        break;
      }

      case "modify_abilities": {
        const modifications = args.abilities as Array<{
          name: string;
          new_name?: string;
          description?: string;
          grade?: string;
          cost?: Ability["cost"];
          cooldown?: number;
          stat?: string;
          symbol?: string;
        }>;
        const existingAbilities = [...(currentState.storyData.abilities || [])];
        for (const mod of modifications) {
          const idx = existingAbilities.findIndex(
            (a) => a.name.toLowerCase() === mod.name.toLowerCase()
          );
          if (idx === -1) {
            changesList.push(`Ability "${mod.name}" not found, skipped`);
            continue;
          }
          if (mod.new_name !== undefined)
            existingAbilities[idx].name = mod.new_name;
          if (mod.description !== undefined)
            existingAbilities[idx].description = mod.description;
          if (mod.grade !== undefined)
            existingAbilities[idx].grade = mod.grade as AbilityGrade;
          if (mod.cost !== undefined) existingAbilities[idx].cost = mod.cost;
          if (mod.cooldown !== undefined)
            existingAbilities[idx].cooldown = mod.cooldown;
          if (mod.stat !== undefined) existingAbilities[idx].stat = mod.stat;
          if (mod.symbol !== undefined)
            existingAbilities[idx].symbol = mod.symbol;
          changesList.push(`Modified ability: ${mod.name}`);
        }
        changes.abilities = existingAbilities;
        break;
      }

      case "remove_abilities": {
        const names = args.names as string[];
        const existingAbilities = [...(currentState.storyData.abilities || [])];
        const remaining = existingAbilities.filter(
          (a) => !names.some((n) => n.toLowerCase() === a.name.toLowerCase())
        );
        const removed = existingAbilities.length - remaining.length;
        changesList.push(`Removed ${removed} ability/abilities`);
        changes.abilities = remaining;
        break;
      }

      // ============================================
      // LORE
      // ============================================
      case "add_lore": {
        const loreEntries = args.lore as StoryLore[];
        const existingLore = [...(currentState.storyData.lore || [])];
        for (const lore of loreEntries) {
          const existing = existingLore.find(
            (l) => l.title.toLowerCase() === lore.title.toLowerCase()
          );
          if (existing) {
            changesList.push(`Lore "${lore.title}" already exists, skipped`);
          } else {
            existingLore.push({
              title: lore.title,
              content: lore.content,
              secrtet: (lore as any).secret || false,
              relatedCharacters: [],
              relatedLocations: [],
              keys: [],
              alwaysOn: lore.alwaysOn,
              on_triggers: lore.on_triggers,
              off_triggers: lore.off_triggers,
              var_on_triggers: lore.var_on_triggers,
              var_off_triggers: lore.var_off_triggers,
              trigger_lores: lore.trigger_lores,
            });
            changesList.push(`Added lore: ${lore.title}`);
          }
        }
        changes.lore = existingLore;
        break;
      }

      case "modify_lore": {
        const modifications = args.lore as Array<{
          title: string;
          new_title?: string;
          content?: string;
          secret?: boolean;
          alwaysOn?: boolean;
          on_triggers?: string[];
          off_triggers?: string[];
          var_on_triggers?: string[];
          var_off_triggers?: string[];
          trigger_lores?: string[];
        }>;
        const existingLore = [...(currentState.storyData.lore || [])];
        for (const mod of modifications) {
          const idx = existingLore.findIndex(
            (l) => l.title.toLowerCase() === mod.title.toLowerCase()
          );
          if (idx === -1) {
            changesList.push(`Lore "${mod.title}" not found, skipped`);
            continue;
          }
          if (mod.new_title !== undefined)
            existingLore[idx].title = mod.new_title;
          if (mod.content !== undefined)
            existingLore[idx].content = mod.content;
          if (mod.secret !== undefined) existingLore[idx].secrtet = mod.secret;
          if (mod.alwaysOn !== undefined)
            existingLore[idx].alwaysOn = mod.alwaysOn;
          if (mod.on_triggers !== undefined)
            existingLore[idx].on_triggers = mod.on_triggers;
          if (mod.off_triggers !== undefined)
            existingLore[idx].off_triggers = mod.off_triggers;
          if (mod.var_on_triggers !== undefined)
            existingLore[idx].var_on_triggers = mod.var_on_triggers;
          if (mod.var_off_triggers !== undefined)
            existingLore[idx].var_off_triggers = mod.var_off_triggers;
          if (mod.trigger_lores !== undefined)
            existingLore[idx].trigger_lores = mod.trigger_lores;
          changesList.push(`Modified lore: ${mod.title}`);
        }
        changes.lore = existingLore;
        break;
      }

      case "remove_lore": {
        const titles = args.titles as string[];
        const existingLore = [...(currentState.storyData.lore || [])];
        const remaining = existingLore.filter(
          (l) => !titles.some((t) => t.toLowerCase() === l.title.toLowerCase())
        );
        const removed = existingLore.length - remaining.length;
        changesList.push(`Removed ${removed} lore entry/entries`);
        changes.lore = remaining;
        break;
      }

      // ============================================
      // ACHIEVEMENTS
      // ============================================
      case "add_achievements": {
        const achievements = args.achievements as Achievement[];
        const existingAchievements = [
          ...(currentState.storyData.achievements || []),
        ];
        for (const ach of achievements) {
          const existing = existingAchievements.find(
            (a) => a.title.toLowerCase() === ach.title.toLowerCase()
          );
          if (existing) {
            changesList.push(
              `Achievement "${ach.title}" already exists, skipped`
            );
          } else {
            existingAchievements.push({
              title: ach.title,
              description: ach.description,
              ai_hint: ach.ai_hint,
              points: ach.points,
              hidden: ach.hidden,
              rewardDescription: ach.rewardDescription,
              symbol: ach.symbol,
              dateAchieved: null,
            });
            changesList.push(
              `Added achievement: ${ach.title} (${ach.points} pts)`
            );
          }
        }
        changes.achievements = existingAchievements;
        break;
      }

      case "modify_achievements": {
        const modifications = args.achievements as Array<{
          title: string;
          new_title?: string;
          description?: string;
          ai_hint?: string;
          points?: number;
          hidden?: boolean;
          rewardDescription?: string;
          symbol?: string;
        }>;
        const existingAchievements = [
          ...(currentState.storyData.achievements || []),
        ];
        for (const mod of modifications) {
          const idx = existingAchievements.findIndex(
            (a) => a.title.toLowerCase() === mod.title.toLowerCase()
          );
          if (idx === -1) {
            changesList.push(`Achievement "${mod.title}" not found, skipped`);
            continue;
          }
          if (mod.new_title !== undefined)
            existingAchievements[idx].title = mod.new_title;
          if (mod.description !== undefined)
            existingAchievements[idx].description = mod.description;
          if (mod.ai_hint !== undefined)
            existingAchievements[idx].ai_hint = mod.ai_hint;
          if (mod.points !== undefined)
            existingAchievements[idx].points = mod.points;
          if (mod.hidden !== undefined)
            existingAchievements[idx].hidden = mod.hidden;
          if (mod.rewardDescription !== undefined)
            existingAchievements[idx].rewardDescription = mod.rewardDescription;
          if (mod.symbol !== undefined)
            existingAchievements[idx].symbol = mod.symbol;
          changesList.push(`Modified achievement: ${mod.title}`);
        }
        changes.achievements = existingAchievements;
        break;
      }

      case "remove_achievements": {
        const titles = args.titles as string[];
        const existingAchievements = [
          ...(currentState.storyData.achievements || []),
        ];
        const remaining = existingAchievements.filter(
          (a) => !titles.some((t) => t.toLowerCase() === a.title.toLowerCase())
        );
        const removed = existingAchievements.length - remaining.length;
        changesList.push(`Removed ${removed} achievement(s)`);
        changes.achievements = remaining;
        break;
      }

      // ============================================
      // QUESTS
      // ============================================
      case "add_quests": {
        const quests = args.quests as Quest[];
        const existingQuests = [...(currentState.storyData.quests || [])];
        for (const quest of quests) {
          const existing = existingQuests.find(
            (q) =>
              q.id === quest.id ||
              q.title.toLowerCase() === quest.title.toLowerCase()
          );
          if (existing) {
            changesList.push(`Quest "${quest.title}" already exists, skipped`);
          } else {
            existingQuests.push({
              id:
                quest.id ||
                `quest_${Date.now()}_${Math.random()
                  .toString(36)
                  .substr(2, 9)}`,
              title: quest.title,
              shortDescription: quest.shortDescription,
              description: quest.description,
              active: quest.active ?? false,
              fulfilled: false,
              points: quest.points,
            });
            changesList.push(
              `Added quest: ${quest.title} (${quest.points} pts)`
            );
          }
        }
        changes.quests = existingQuests;
        break;
      }

      case "modify_quests": {
        const modifications = args.quests as Array<{
          id?: string;
          title?: string;
          new_id?: string;
          new_title?: string;
          shortDescription?: string;
          description?: string;
          active?: boolean;
          points?: number;
        }>;
        const existingQuests = [...(currentState.storyData.quests || [])];
        for (const mod of modifications) {
          const idx = existingQuests.findIndex(
            (q) =>
              (mod.id && q.id === mod.id) ||
              (mod.title && q.title.toLowerCase() === mod.title.toLowerCase())
          );
          if (idx === -1) {
            changesList.push(
              `Quest "${mod.id || mod.title}" not found, skipped`
            );
            continue;
          }
          if (mod.new_id !== undefined) existingQuests[idx].id = mod.new_id;
          if (mod.new_title !== undefined)
            existingQuests[idx].title = mod.new_title;
          if (mod.shortDescription !== undefined)
            existingQuests[idx].shortDescription = mod.shortDescription;
          if (mod.description !== undefined)
            existingQuests[idx].description = mod.description;
          if (mod.active !== undefined) existingQuests[idx].active = mod.active;
          if (mod.points !== undefined) existingQuests[idx].points = mod.points;
          changesList.push(`Modified quest: ${existingQuests[idx].title}`);
        }
        changes.quests = existingQuests;
        break;
      }

      case "remove_quests": {
        const ids = args.ids as string[];
        const existingQuests = [...(currentState.storyData.quests || [])];
        const remaining = existingQuests.filter(
          (q) =>
            !ids.some(
              (id) => id === q.id || id.toLowerCase() === q.title.toLowerCase()
            )
        );
        const removed = existingQuests.length - remaining.length;
        changesList.push(`Removed ${removed} quest(s)`);
        changes.quests = remaining;
        break;
      }

      // ============================================
      // RELATIONSHIPS
      // ============================================
      case "add_relationships": {
        const relationships = args.relationships as Relationship[];
        const existingRelationships = [
          ...(currentState.storyData.relationships || []),
        ];
        for (const rel of relationships) {
          const existing = existingRelationships.find(
            (r) => r.name.toLowerCase() === rel.name.toLowerCase()
          );
          if (existing) {
            changesList.push(
              `Relationship "${rel.name}" already exists, skipped`
            );
          } else {
            existingRelationships.push({
              name: rel.name,
              value: Math.max(-100, Math.min(100, rel.value)),
              description: rel.description,
              symbol: rel.symbol,
            });
            changesList.push(`Added relationship: ${rel.name} (${rel.value})`);
          }
        }
        changes.relationships = existingRelationships;
        break;
      }

      case "modify_relationships": {
        const modifications = args.relationships as Array<{
          name: string;
          new_name?: string;
          value?: number;
          description?: string;
          symbol?: string;
        }>;
        const existingRelationships = [
          ...(currentState.storyData.relationships || []),
        ];
        for (const mod of modifications) {
          const idx = existingRelationships.findIndex(
            (r) => r.name.toLowerCase() === mod.name.toLowerCase()
          );
          if (idx === -1) {
            changesList.push(`Relationship "${mod.name}" not found, skipped`);
            continue;
          }
          if (mod.new_name !== undefined)
            existingRelationships[idx].name = mod.new_name;
          if (mod.value !== undefined)
            existingRelationships[idx].value = Math.max(
              -100,
              Math.min(100, mod.value)
            );
          if (mod.description !== undefined)
            existingRelationships[idx].description = mod.description;
          if (mod.symbol !== undefined)
            existingRelationships[idx].symbol = mod.symbol;
          changesList.push(`Modified relationship: ${mod.name}`);
        }
        changes.relationships = existingRelationships;
        break;
      }

      case "remove_relationships": {
        const names = args.names as string[];
        const existingRelationships = [
          ...(currentState.storyData.relationships || []),
        ];
        const remaining = existingRelationships.filter(
          (r) => !names.some((n) => n.toLowerCase() === r.name.toLowerCase())
        );
        const removed = existingRelationships.length - remaining.length;
        changesList.push(`Removed ${removed} relationship(s)`);
        changes.relationships = remaining;
        break;
      }

      // ============================================
      // VARIABLES
      // ============================================
      case "add_variables": {
        const variables = args.variables as Array<{
          id: string;
          name: string;
          description: string;
          type: "number" | "boolean" | "string" | "list";
          value?: string;
          minValue?: number;
          maxValue?: number;
          options?: string[];
        }>;
        const existingVariables = [...(currentState.storyData.variables || [])];
        for (const v of variables) {
          const existing = existingVariables.find(
            (ev) =>
              ev.id === v.id || ev.name.toLowerCase() === v.name.toLowerCase()
          );
          if (existing) {
            changesList.push(`Variable "${v.name}" already exists, skipped`);
            continue;
          }

          let newVar: Variable;
          switch (v.type) {
            case "number":
              newVar = {
                id: v.id,
                name: v.name,
                description: v.description,
                type: "number",
                value: v.value ? parseFloat(v.value) : 0,
                minValue: v.minValue,
                maxValue: v.maxValue,
              } as NumberVariable;
              break;
            case "boolean":
              newVar = {
                id: v.id,
                name: v.name,
                description: v.description,
                type: "boolean",
                value: v.value === "true",
              } as BooleanVariable;
              break;
            case "string":
              newVar = {
                id: v.id,
                name: v.name,
                description: v.description,
                type: "string",
                value: v.value || "",
                options: v.options,
              } as StringVariable;
              break;
            case "list":
              newVar = {
                id: v.id,
                name: v.name,
                description: v.description,
                type: "list",
                items: v.value ? v.value.split(",").map((s) => s.trim()) : [],
              } as ListVariable;
              break;
          }
          existingVariables.push(newVar);
          changesList.push(`Added variable: ${v.name} [${v.type}]`);
        }
        changes.variables = existingVariables;
        break;
      }

      case "modify_variables": {
        const modifications = args.variables as Array<{
          id?: string;
          name?: string;
          new_id?: string;
          new_name?: string;
          description?: string;
          type?: "number" | "boolean" | "string" | "list";
          value?: string;
          minValue?: number;
          maxValue?: number;
          options?: string[];
        }>;
        const existingVariables = [...(currentState.storyData.variables || [])];
        for (const mod of modifications) {
          const idx = existingVariables.findIndex(
            (v) =>
              (mod.id && v.id === mod.id) ||
              (mod.name && v.name.toLowerCase() === mod.name.toLowerCase())
          );
          if (idx === -1) {
            changesList.push(
              `Variable "${mod.id || mod.name}" not found, skipped`
            );
            continue;
          }
          const v = existingVariables[idx];
          if (mod.new_id !== undefined) v.id = mod.new_id;
          if (mod.new_name !== undefined) v.name = mod.new_name;
          if (mod.description !== undefined) v.description = mod.description;
          if (mod.value !== undefined) {
            if (v.type === "number")
              (v as NumberVariable).value = parseFloat(mod.value);
            else if (v.type === "boolean")
              (v as BooleanVariable).value = mod.value === "true";
            else if (v.type === "string")
              (v as StringVariable).value = mod.value;
            else if (v.type === "list")
              (v as ListVariable).items = mod.value
                .split(",")
                .map((s) => s.trim());
          }
          if (mod.minValue !== undefined && v.type === "number")
            (v as NumberVariable).minValue = mod.minValue;
          if (mod.maxValue !== undefined && v.type === "number")
            (v as NumberVariable).maxValue = mod.maxValue;
          if (mod.options !== undefined && v.type === "string")
            (v as StringVariable).options = mod.options;
          changesList.push(`Modified variable: ${v.name}`);
        }
        changes.variables = existingVariables;
        break;
      }

      case "remove_variables": {
        const ids = args.ids as string[];
        const existingVariables = [...(currentState.storyData.variables || [])];
        const remaining = existingVariables.filter(
          (v) =>
            !ids.some(
              (id) => id === v.id || id.toLowerCase() === v.name.toLowerCase()
            )
        );
        const removed = existingVariables.length - remaining.length;
        changesList.push(`Removed ${removed} variable(s)`);
        changes.variables = remaining;
        break;
      }

      // ============================================
      // PRESETS
      // ============================================
      case "add_presets": {
        const presets = args.presets as Preset[];
        const existingPresets = [...(currentState.storyData.presets || [])];
        for (const preset of presets) {
          const existing = existingPresets.find(
            (p) =>
              p.id === preset.id ||
              p.name.toLowerCase() === preset.name.toLowerCase()
          );
          if (existing) {
            changesList.push(`Preset "${preset.name}" already exists, skipped`);
          } else {
            existingPresets.push({
              id:
                preset.id ||
                `preset_${Date.now()}_${Math.random()
                  .toString(36)
                  .substr(2, 9)}`,
              name: preset.name,
              description: preset.description,
              icon: preset.icon,
              playerName: preset.playerName,
              playerSummary: preset.playerSummary,
              intro: preset.intro,
              authorNotes: preset.authorNotes || "",
              stats: preset.stats || [],
              resources: preset.resources || [],
              inventory: preset.inventory || [],
              abilities: preset.abilities,
              relationships: preset.relationships || [],
            });
            changesList.push(`Added preset: ${preset.name}`);
          }
        }
        changes.presets = existingPresets;
        break;
      }

      case "modify_presets": {
        const modifications = args.presets as Array<
          Partial<Preset> & {
            id?: string;
            name?: string;
            new_id?: string;
            new_name?: string;
          }
        >;
        const existingPresets = [...(currentState.storyData.presets || [])];
        for (const mod of modifications) {
          const idx = existingPresets.findIndex(
            (p) =>
              (mod.id && p.id === mod.id) ||
              (mod.name && p.name.toLowerCase() === mod.name.toLowerCase())
          );
          if (idx === -1) {
            changesList.push(
              `Preset "${mod.id || mod.name}" not found, skipped`
            );
            continue;
          }
          const p = existingPresets[idx];
          if (mod.new_id !== undefined) p.id = mod.new_id;
          if (mod.new_name !== undefined) p.name = mod.new_name;
          if (mod.description !== undefined) p.description = mod.description;
          if (mod.icon !== undefined) p.icon = mod.icon;
          if (mod.playerName !== undefined) p.playerName = mod.playerName;
          if (mod.playerSummary !== undefined)
            p.playerSummary = mod.playerSummary;
          if (mod.intro !== undefined) p.intro = mod.intro;
          if (mod.authorNotes !== undefined) p.authorNotes = mod.authorNotes;
          if (mod.stats !== undefined) p.stats = mod.stats;
          if (mod.resources !== undefined) p.resources = mod.resources;
          if (mod.inventory !== undefined) p.inventory = mod.inventory;
          if (mod.abilities !== undefined) p.abilities = mod.abilities;
          if (mod.relationships !== undefined)
            p.relationships = mod.relationships;
          changesList.push(`Modified preset: ${p.name}`);
        }
        changes.presets = existingPresets;
        break;
      }

      case "remove_presets": {
        const ids = args.ids as string[];
        const existingPresets = [...(currentState.storyData.presets || [])];
        const remaining = existingPresets.filter(
          (p) =>
            !ids.some(
              (id) => id === p.id || id.toLowerCase() === p.name.toLowerCase()
            )
        );
        const removed = existingPresets.length - remaining.length;
        changesList.push(`Removed ${removed} preset(s)`);
        changes.presets = remaining;
        break;
      }

      // ============================================
      // SKILL TREES
      // ============================================
      case "add_skill_trees": {
        const trees = args.skill_trees as SkillTree[];
        const existingTrees = [...(currentState.storyData.skillTrees || [])];
        for (const tree of trees) {
          const existing = existingTrees.find(
            (t) =>
              t.id === tree.id ||
              t.name.toLowerCase() === tree.name.toLowerCase()
          );
          if (existing) {
            changesList.push(
              `Skill tree "${tree.name}" already exists, skipped`
            );
          } else {
            existingTrees.push({
              id:
                tree.id ||
                `tree_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              name: tree.name,
              description: tree.description,
              symbol: tree.symbol,
              nodes: tree.nodes || [],
            });
            changesList.push(
              `Added skill tree: ${tree.name} (${
                tree.nodes?.length || 0
              } nodes)`
            );
          }
        }
        changes.skillTrees = existingTrees;
        break;
      }

      case "modify_skill_trees": {
        const modifications = args.skill_trees as Array<{
          id?: string;
          name?: string;
          new_id?: string;
          new_name?: string;
          description?: string;
          symbol?: string;
          nodes?: SkillNode[];
          remove_nodes?: string[];
        }>;
        const existingTrees = [...(currentState.storyData.skillTrees || [])];
        for (const mod of modifications) {
          const idx = existingTrees.findIndex(
            (t) =>
              (mod.id && t.id === mod.id) ||
              (mod.name && t.name.toLowerCase() === mod.name.toLowerCase())
          );
          if (idx === -1) {
            changesList.push(
              `Skill tree "${mod.id || mod.name}" not found, skipped`
            );
            continue;
          }
          const tree = existingTrees[idx];
          if (mod.new_id !== undefined) tree.id = mod.new_id;
          if (mod.new_name !== undefined) tree.name = mod.new_name;
          if (mod.description !== undefined) tree.description = mod.description;
          if (mod.symbol !== undefined) tree.symbol = mod.symbol;

          // Handle node modifications
          if (mod.remove_nodes) {
            tree.nodes = tree.nodes.filter(
              (n) => !mod.remove_nodes!.includes(n.id)
            );
            changesList.push(
              `Removed ${mod.remove_nodes.length} node(s) from ${tree.name}`
            );
          }
          if (mod.nodes) {
            for (const node of mod.nodes) {
              const nodeIdx = tree.nodes.findIndex((n) => n.id === node.id);
              if (nodeIdx >= 0) {
                tree.nodes[nodeIdx] = { ...tree.nodes[nodeIdx], ...node };
              } else {
                tree.nodes.push(node);
              }
            }
            changesList.push(`Updated nodes in ${tree.name}`);
          }
          changesList.push(`Modified skill tree: ${tree.name}`);
        }
        changes.skillTrees = existingTrees;
        break;
      }

      case "remove_skill_trees": {
        const ids = args.ids as string[];
        const existingTrees = [...(currentState.storyData.skillTrees || [])];
        const remaining = existingTrees.filter(
          (t) =>
            !ids.some(
              (id) => id === t.id || id.toLowerCase() === t.name.toLowerCase()
            )
        );
        const removed = existingTrees.length - remaining.length;
        changesList.push(`Removed ${removed} skill tree(s)`);
        changes.skillTrees = remaining;
        break;
      }

      // ============================================
      // CUSTOM TABLES
      // ============================================
      case "add_custom_tables": {
        const tables = args.tables as CustomTable[];
        const existingTables = [...(currentState.storyData.customTables || [])];
        for (const table of tables) {
          const existing = existingTables.find(
            (t) =>
              t.id === table.id ||
              t.name.toLowerCase() === table.name.toLowerCase()
          );
          if (existing) {
            changesList.push(
              `Custom table "${table.name}" already exists, skipped`
            );
          } else {
            existingTables.push({
              id:
                table.id ||
                `table_${Date.now()}_${Math.random()
                  .toString(36)
                  .substr(2, 9)}`,
              name: table.name,
              description: table.description,
              entries: table.entries || [],
            });
            changesList.push(
              `Added custom table: ${table.name} (${
                table.entries?.length || 0
              } entries)`
            );
          }
        }
        changes.customTables = existingTables;
        break;
      }

      case "modify_custom_tables": {
        const modifications = args.tables as Array<{
          id?: string;
          name?: string;
          new_id?: string;
          new_name?: string;
          description?: string;
          entries?: CustomTable["entries"];
          add_entries?: CustomTable["entries"];
          remove_entries?: string[];
        }>;
        const existingTables = [...(currentState.storyData.customTables || [])];
        for (const mod of modifications) {
          const idx = existingTables.findIndex(
            (t) =>
              (mod.id && t.id === mod.id) ||
              (mod.name && t.name.toLowerCase() === mod.name.toLowerCase())
          );
          if (idx === -1) {
            changesList.push(
              `Custom table "${mod.id || mod.name}" not found, skipped`
            );
            continue;
          }
          const table = existingTables[idx];
          if (mod.new_id !== undefined) table.id = mod.new_id;
          if (mod.new_name !== undefined) table.name = mod.new_name;
          if (mod.description !== undefined)
            table.description = mod.description;
          if (mod.entries !== undefined) table.entries = mod.entries;
          if (mod.add_entries) table.entries.push(...mod.add_entries);
          if (mod.remove_entries) {
            table.entries = table.entries.filter(
              (e) => !mod.remove_entries!.includes(e.text)
            );
          }
          changesList.push(`Modified custom table: ${table.name}`);
        }
        changes.customTables = existingTables;
        break;
      }

      case "remove_custom_tables": {
        const ids = args.ids as string[];
        const existingTables = [...(currentState.storyData.customTables || [])];
        const remaining = existingTables.filter(
          (t) =>
            !ids.some(
              (id) => id === t.id || id.toLowerCase() === t.name.toLowerCase()
            )
        );
        const removed = existingTables.length - remaining.length;
        changesList.push(`Removed ${removed} custom table(s)`);
        changes.customTables = remaining;
        break;
      }

      // ============================================
      // SETTINGS
      // ============================================
      case "update_basic_info": {
        if (args.story_name !== undefined) {
          changes.story_name = args.story_name as string;
          changesList.push(`Updated story name`);
        }
        if (args.premise !== undefined) {
          changes.premise = args.premise as string;
          changesList.push(`Updated premise`);
        }
        if (args.player_name !== undefined) {
          changes.player_name = args.player_name as string;
          changesList.push(`Updated player name`);
        }
        if (args.player_summary !== undefined) {
          changes.player_summary = args.player_summary as string;
          changesList.push(`Updated player summary`);
        }
        if (args.intro !== undefined) {
          changes.intro = args.intro as string;
          changesList.push(`Updated intro`);
        }
        if (args.author_notes !== undefined) {
          changes.author_notes = args.author_notes as string;
          changesList.push(`Updated author notes`);
        }
        break;
      }

      case "update_adventure_metadata": {
        if (args.title !== undefined) {
          changes.title = args.title as string;
          changesList.push(`Updated title`);
        }
        if (args.shortDescription !== undefined) {
          changes.shortDescription = args.shortDescription as string;
          changesList.push(`Updated short description`);
        }
        if (args.description !== undefined) {
          changes.description = args.description as string;
          changesList.push(`Updated description`);
        }
        break;
      }

      case "update_upgrade_settings": {
        const settings: Partial<UpgradeSettings> = {};
        const settingLabels: Record<string, string> = {
          pointsToLevelUp: "Points to Level Up",
          maxLevel: "Max Level",
          upgradePointsPerLevel: "Upgrade Points Per Level",
          allowStatUpgrades: "Allow Stat Upgrades",
          allowResourceUpgrades: "Allow Resource Upgrades",
          statUpgradeCost: "Stat Upgrade Cost",
          resourceUpgradeCost: "Resource Upgrade Cost",
        };
        for (const key of Object.keys(args)) {
          (settings as any)[key] = args[key];
          const label = settingLabels[key] || key;
          const value = args[key];
          if (typeof value === "boolean") {
            changesList.push(`${label}: ${value ? "Enabled" : "Disabled"}`);
          } else if (typeof value === "number") {
            changesList.push(`${label}: ${value}`);
          } else {
            changesList.push(`${label}: ${String(value)}`);
          }
        }
        if (Object.keys(settings).length > 0) {
          changes.upgradeSettings = settings;
        }
        break;
      }

      case "update_leveling_settings": {
        const settings: Partial<LevelingSettings> = {};
        const settingLabels: Record<string, string> = {
          xpBase: "XP Base",
          levelCap: "Level Cap",
          defaultUpgradesPerLevel: "Upgrades Per Level",
          useCustomCurve: "Use Custom Curve",
          customCurve: "Custom XP Curve",
          upgradeOverrides: "Upgrade Overrides",
          startingUpgrades: "Starting Upgrades",
        };
        for (const key of Object.keys(args)) {
          (settings as any)[key] = args[key];
          const label = settingLabels[key] || key;
          const value = args[key];
          if (typeof value === "boolean") {
            changesList.push(`${label}: ${value ? "Enabled" : "Disabled"}`);
          } else if (typeof value === "number") {
            changesList.push(`${label}: ${value}`);
          } else if (Array.isArray(value)) {
            changesList.push(`${label}: ${value.length} entries`);
          } else if (typeof value === "object" && value !== null) {
            changesList.push(`${label}: configured`);
          } else {
            changesList.push(`${label}: ${String(value)}`);
          }
        }
        if (Object.keys(settings).length > 0) {
          changes.levelingSettings = settings;
        }
        break;
      }

      // ============================================
      // PROGRESSION
      // ============================================
      case "set_progression": {
        const currentPoints = (currentState.storyData.points as number) || 0;
        const currentLevel = (currentState.storyData.level as number) || 1;
        const currentUpgradesSpent =
          (currentState.storyData.upgradesSpent as number) || 0;
        const levelingSettings = currentState.storyData.levelingSettings as
          | LevelingSettings
          | undefined;

        // Handle add_points (relative change)
        if (args.add_points !== undefined) {
          const addAmount = args.add_points as number;
          const newPoints = Math.max(0, currentPoints + addAmount);
          changes.points = newPoints;
          if (addAmount >= 0) {
            changesList.push(`Added ${addAmount} XP (total: ${newPoints})`);
          } else {
            changesList.push(
              `Removed ${Math.abs(addAmount)} XP (total: ${newPoints})`
            );
          }
        }

        // Handle points (absolute set)
        if (args.points !== undefined) {
          const newPoints = Math.max(0, args.points as number);
          changes.points = newPoints;
          changesList.push(`Set XP to ${newPoints}`);
        }

        // Handle level (absolute set) - also set XP to match!
        if (args.level !== undefined) {
          const newLevel = Math.max(1, args.level as number);
          changes.level = newLevel;

          // Calculate the minimum XP required for this level
          // Use getCumulativeXPForLevel which gives total XP needed to REACH that level
          // For level 3, we need the XP threshold for level 2->3 transition
          const requiredXP = getCumulativeXPForLevel(
            newLevel,
            levelingSettings
          );

          // Only update points if not already explicitly set in this call
          if (args.points === undefined && args.add_points === undefined) {
            changes.points = requiredXP;
            changesList.push(
              `Set XP to ${requiredXP} (minimum for level ${newLevel})`
            );
          }

          if (newLevel > currentLevel) {
            changesList.push(`Leveled up to ${newLevel}!`);
          } else if (newLevel < currentLevel) {
            changesList.push(`Level reduced to ${newLevel}`);
          } else {
            changesList.push(`Level set to ${newLevel}`);
          }
        }

        // Handle upgradesSpent
        if (args.upgradesSpent !== undefined) {
          const newSpent = Math.max(0, args.upgradesSpent as number);
          changes.upgradesSpent = newSpent;
          changesList.push(`Upgrades spent set to ${newSpent}`);
        }

        break;
      }

      // ============================================
      // STARTING CHOICES
      // ============================================
      case "add_starting_choices": {
        const choices = args.choices as StartingChoice[];
        const existingChoices = [
          ...(currentState.adventureMetadata?.startingChoices || []),
        ];
        for (const choice of choices) {
          existingChoices.push(choice);
          changesList.push(`Added starting choice: "${choice.text}"`);
        }
        changes.startingChoices = existingChoices;
        break;
      }

      case "modify_starting_choices": {
        const modifications = args.choices as Array<
          StartingChoice & { new_text?: string }
        >;
        const existingChoices = [
          ...(currentState.adventureMetadata?.startingChoices || []),
        ];
        for (const mod of modifications) {
          const idx = existingChoices.findIndex(
            (c) => c.text.toLowerCase() === mod.text.toLowerCase()
          );
          if (idx === -1) {
            changesList.push(
              `Starting choice "${mod.text}" not found, skipped`
            );
            continue;
          }
          if (mod.new_text !== undefined)
            existingChoices[idx].text = mod.new_text;
          if (mod.intro_override !== undefined)
            existingChoices[idx].intro_override = mod.intro_override;
          if (mod.skill_used !== undefined)
            existingChoices[idx].skill_used = mod.skill_used;
          if (mod.skill_dc !== undefined)
            existingChoices[idx].skill_dc = mod.skill_dc;
          if (mod.resource_used !== undefined)
            existingChoices[idx].resource_used = mod.resource_used;
          if (mod.item_used !== undefined)
            existingChoices[idx].item_used = mod.item_used;
          if (mod.item_loss !== undefined)
            existingChoices[idx].item_loss = mod.item_loss;
          changesList.push(`Modified starting choice: "${mod.text}"`);
        }
        changes.startingChoices = existingChoices;
        break;
      }

      case "remove_starting_choices": {
        const texts = args.texts as string[];
        const existingChoices = [
          ...(currentState.adventureMetadata?.startingChoices || []),
        ];
        const remaining = existingChoices.filter(
          (c) => !texts.some((t) => t.toLowerCase() === c.text.toLowerCase())
        );
        const removed = existingChoices.length - remaining.length;
        changesList.push(`Removed ${removed} starting choice(s)`);
        changes.startingChoices = remaining;
        break;
      }

      default:
        return {
          result: {
            toolCallId: toolCall.id,
            toolName: name,
            success: false,
            message: `Unknown tool: ${name}`,
          },
          changes: {},
        };
    }

    return {
      result: {
        toolCallId: toolCall.id,
        toolName: name,
        success: true,
        message:
          changesList.length > 0 ? changesList.join("; ") : "No changes made",
        changes: changesList,
        args,
      },
      changes,
    };
  } catch (error) {
    return {
      result: {
        toolCallId: toolCall.id,
        toolName: name,
        success: false,
        message: `Error executing ${name}: ${error}`,
      },
      changes: {},
    };
  }
}

/**
 * Execute multiple tool calls and merge changes
 */
export function executeCreatorTools(
  toolCalls: CreatorToolCall[],
  currentState: CreatorCurrentState
): { results: CreatorToolResult[]; mergedChanges: CreatorChanges } {
  const results: CreatorToolResult[] = [];
  let mergedChanges: CreatorChanges = {};

  // Create a mutable state that gets updated after each tool
  let runningState = { ...currentState };

  for (const toolCall of toolCalls) {
    const { result, changes } = executeCreatorTool(toolCall, runningState);
    results.push(result);

    // Merge changes into running state for subsequent tools
    if (result.success) {
      // Update running state
      runningState = {
        ...runningState,
        storyData: {
          ...runningState.storyData,
          ...(changes.stats !== undefined && { stats: changes.stats }),
          ...(changes.resources !== undefined && {
            resources: changes.resources,
          }),
          ...(changes.inventory !== undefined && {
            inventory: changes.inventory,
          }),
          ...(changes.abilities !== undefined && {
            abilities: changes.abilities,
          }),
          ...(changes.lore !== undefined && { lore: changes.lore }),
          ...(changes.achievements !== undefined && {
            achievements: changes.achievements,
          }),
          ...(changes.quests !== undefined && { quests: changes.quests }),
          ...(changes.relationships !== undefined && {
            relationships: changes.relationships,
          }),
          ...(changes.variables !== undefined && {
            variables: changes.variables,
          }),
          ...(changes.presets !== undefined && { presets: changes.presets }),
          ...(changes.skillTrees !== undefined && {
            skillTrees: changes.skillTrees,
          }),
          ...(changes.customTables !== undefined && {
            customTables: changes.customTables,
          }),
          ...(changes.story_name !== undefined && {
            story_name: changes.story_name,
          }),
          ...(changes.premise !== undefined && { premise: changes.premise }),
          ...(changes.player_name !== undefined && {
            player_name: changes.player_name,
          }),
          ...(changes.player_summary !== undefined && {
            player_summary: changes.player_summary,
          }),
          ...(changes.intro !== undefined && { intro: changes.intro }),
          ...(changes.author_notes !== undefined && {
            author_notes: changes.author_notes,
          }),
        },
        adventureMetadata: {
          ...runningState.adventureMetadata,
          ...(changes.title !== undefined && { title: changes.title }),
          ...(changes.shortDescription !== undefined && {
            shortDescription: changes.shortDescription,
          }),
          ...(changes.description !== undefined && {
            description: changes.description,
          }),
          ...(changes.startingChoices !== undefined && {
            startingChoices: changes.startingChoices,
          }),
        },
      };

      // Merge into final changes
      mergedChanges = {
        ...mergedChanges,
        ...changes,
        // For settings, deep merge
        ...(changes.upgradeSettings && {
          upgradeSettings: {
            ...mergedChanges.upgradeSettings,
            ...changes.upgradeSettings,
          },
        }),
        ...(changes.levelingSettings && {
          levelingSettings: {
            ...mergedChanges.levelingSettings,
            ...changes.levelingSettings,
          },
        }),
      };
    }
  }

  return { results, mergedChanges };
}
