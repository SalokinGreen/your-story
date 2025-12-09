/**
 * Tool Executor - Maps AI tool calls to existing command execution logic
 *
 * This module bridges the gap between structured tool calling and our existing
 * commandResponses.ts implementation, reusing all validation and fuzzy matching logic.
 */

import {
  StoryData,
  CommandResponse,
  Condition,
  Variable,
  NumberVariable,
  BooleanVariable,
  StringVariable,
  ListVariable,
  AdventureDifficulty,
  RestType,
  REST_CONFIG,
  StoryThread,
} from "@/app/misc/structs";
import { executeCommandWithResponse } from "@/app/misc/commandResponses";
import { TOOL_MAP } from "@/app/misc/toolSchemas";
import { logger } from "@/app/misc/logger";
import {
  applyChaosAdjustment,
  getChaosAdjustmentReason,
} from "@/app/misc/mythicChaos";
import { findBestMatch } from "@/app/misc/fuzzyMatch";
import {
  parseDCValue,
  parsePointsValue,
  parseStatChangeValue,
  parseChallengeRoundsValue,
  RPGSystemType,
} from "@/app/misc/rpgSystems";
import { calculateLevel } from "@/app/misc/leveling";

/**
 * Calculate relationship value change based on magnitude, difficulty, and current value.
 * Enemies are hard to befriend (small gains), friends are easy to lose (big losses).
 */
function calculateRelationshipDelta(
  magnitude: string,
  currentValue: number,
  difficulty: AdventureDifficulty = "medium"
): number {
  // Base changes by magnitude
  const baseMagnitudes: Record<string, number> = {
    greatly_damage: -25,
    damage: -15,
    slightly_damage: -8,
    slightly_improve: 8,
    improve: 15,
    greatly_improve: 25,
  };

  // Difficulty multipliers (harder = slower relationship gains, faster losses)
  const difficultyMultipliers: Record<
    AdventureDifficulty,
    { gain: number; loss: number }
  > = {
    easy: { gain: 1.3, loss: 0.7 },
    medium: { gain: 1.0, loss: 1.0 },
    hard: { gain: 0.7, loss: 1.3 },
    expert: { gain: 0.5, loss: 1.5 },
  };

  const baseChange = baseMagnitudes[magnitude] || 0;
  const isImproving = baseChange > 0;
  const diffMult =
    difficultyMultipliers[difficulty] || difficultyMultipliers.medium;

  // Current relationship affects how easy it is to change
  // Negative relationships: hard to improve, easy to damage further
  // Positive relationships: easy to improve more, hard to damage
  let relationshipModifier = 1.0;

  if (isImproving) {
    // Improving relationships
    if (currentValue <= -50) {
      // Nemesis/enemy: very hard to improve (they hate you)
      relationshipModifier = 0.3;
    } else if (currentValue <= -25) {
      // Hostile: hard to improve
      relationshipModifier = 0.5;
    } else if (currentValue <= 0) {
      // Unfriendly/stranger: somewhat hard to improve
      relationshipModifier = 0.7;
    } else if (currentValue <= 50) {
      // Acquaintance/friendly: normal improvement
      relationshipModifier = 1.0;
    } else {
      // Already friends: diminishing returns
      relationshipModifier = 0.8;
    }
  } else {
    // Damaging relationships
    if (currentValue >= 75) {
      // Trusted friend/ally: takes a lot to damage
      relationshipModifier = 0.6;
    } else if (currentValue >= 50) {
      // Friendly: somewhat resistant to damage
      relationshipModifier = 0.8;
    } else if (currentValue >= 0) {
      // Acquaintance/stranger: normal damage
      relationshipModifier = 1.0;
    } else {
      // Already negative: easy to damage further
      relationshipModifier = 1.2;
    }
  }

  const finalChange = Math.round(
    baseChange *
      (isImproving ? diffMult.gain : diffMult.loss) *
      relationshipModifier
  );

  return finalChange;
}

/**
 * Calculate stat change based on magnitude and difficulty.
 * Stats are 0-100 scale, so changes are absolute values.
 */
function calculateStatDelta(
  magnitude: string,
  difficulty: AdventureDifficulty = "medium"
): number {
  // Base changes (absolute values on 0-100 scale)
  const baseMagnitudes: Record<string, number> = {
    // Negative (weakening)
    greatly_weaken: -15,
    weaken: -10,
    slightly_weaken: -5,
    // Positive (strengthening)
    slightly_strengthen: 5,
    strengthen: 10,
    greatly_strengthen: 15,
  };

  // Difficulty multipliers (harder = less gains, more losses)
  const difficultyMultipliers: Record<
    AdventureDifficulty,
    { gain: number; loss: number }
  > = {
    easy: { gain: 1.2, loss: 0.8 },
    medium: { gain: 1.0, loss: 1.0 },
    hard: { gain: 0.8, loss: 1.2 },
    expert: { gain: 0.6, loss: 1.4 },
  };

  const baseChange = baseMagnitudes[magnitude] || 0;
  const isStrengthening = baseChange > 0;
  const diffMult =
    difficultyMultipliers[difficulty] || difficultyMultipliers.medium;

  const multiplier = isStrengthening ? diffMult.gain : diffMult.loss;
  const finalChange = Math.round(baseChange * multiplier);

  return finalChange;
}

/**
 * Calculate durability change based on magnitude and difficulty.
 * Returns percentage-based change scaled to item's max durability.
 */
function calculateDurabilityDelta(
  magnitude: string,
  maxDurability: number,
  difficulty: AdventureDifficulty = "medium"
): number {
  // Base percentages of max durability
  const baseMagnitudes: Record<string, number> = {
    // Negative (damaging)
    destroy: -1.0, // 100%
    heavily_damage: -0.5, // 50%
    damage: -0.25, // 25%
    scratch: -0.1, // 10%
    // Positive (repairing)
    patch: 0.1, // 10%
    repair: 0.25, // 25%
    fully_repair: 1.0, // 100%
  };

  // Difficulty multipliers (harder = more damage, less repair)
  const difficultyMultipliers: Record<
    AdventureDifficulty,
    { gain: number; loss: number }
  > = {
    easy: { gain: 1.3, loss: 0.7 },
    medium: { gain: 1.0, loss: 1.0 },
    hard: { gain: 0.8, loss: 1.2 },
    expert: { gain: 0.6, loss: 1.4 },
  };

  const basePercent = baseMagnitudes[magnitude] || 0;
  const isRepairing = basePercent > 0;
  const diffMult =
    difficultyMultipliers[difficulty] || difficultyMultipliers.medium;

  const multiplier = isRepairing ? diffMult.gain : diffMult.loss;
  const finalChange = Math.round(basePercent * maxDurability * multiplier);

  return finalChange;
}

export interface ToolCall {
  id?: string;
  type: "function";
  function: {
    name: string;
    arguments: string | Record<string, any>;
  };
}

export interface ExecuteToolsResult {
  responses: CommandResponse[];
  stateChanges: string[];
}

/**
 * Tools whose successful execution should generate state change notifications
 * for the story generation stage. Includes both tool names and their command equivalents.
 */
const STATE_CHANGE_TOOLS = new Set([
  // Stats - tool names and command names
  "adjust_stat",
  "modify_stat",
  "set_stat",
  "create_stat",
  // Resources - tool names and command names
  "adjust_resource",
  "set_resource",
  "set_resource_max",
  "create_resource",
  "add_resource",
  "delete_resource",
  "remove_resource",
  // Items - tool names and command names
  "add_item",
  "remove_item",
  "modify_item",
  "break_item",
  "consume_item",
  "repair_item",
  "damage_item",
  "upgrade_item",
  "set_item_durability",
  // Abilities - tool names and command names
  "add_ability",
  "remove_ability",
  "modify_ability",
  "upgrade_ability",
  "reset_ability_cooldown",
  "reduce_cooldown",
  "refresh_ability",
  // Passives - tool names and command names
  "add_passive",
  "remove_passive",
  "modify_passive",
  // Conditions
  "add_condition",
  "upgrade_condition",
  "downgrade_condition",
  "remove_condition",
  // Relationships - tool names and command names
  "add_relationship",
  "modify_relationship",
  "delete_relationship",
  "update_relationship_description",
  // NPC Management
  "add_npc",
  // Achievements - tool names and command names
  "trigger_achievement",
  // Note: Lore tools (show_lore, hide_lore, create_lore) excluded - lore visibility
  // changes are not useful context for the AI story stage
  // Variables
  "set_variable",
  "modify_variable",
  "toggle_variable",
  "add_to_list",
  "remove_from_list",
  "clear_list",
  "create_variable",
  "delete_variable",
  // Momentum - tool names and command names
  "modify_momentum",
  // Game state
  "game_over",
  // Scene Challenges
  "start_challenge",
  "update_challenge",
  "resolve_challenge",
  "cancel_challenge",
  // Rest System
  "take_rest",
  // Thread Management
  "create_thread",
  "update_thread",
  "resolve_thread",
  "abandon_thread",
  // Quests - completion includes XP gain and potential level ups
  "complete_quest",
  "fail_quest",
  "create_quest",
]);

/**
 * Parse dice notation (e.g., "2d6+3", "-1d8+2", "3d6-5") and return the rolled value
 * Returns null if the string is not valid dice notation
 */
function parseDiceNotation(
  input: string | number
): { value: number; notation: string } | null {
  // If it's already a number, return it directly
  if (typeof input === "number") {
    return { value: input, notation: input.toString() };
  }

  // Check if it's a plain number string
  const plainNum = parseFloat(input);
  if (!isNaN(plainNum) && /^[+-]?\d+(\.\d+)?$/.test(input.trim())) {
    return { value: plainNum, notation: input };
  }

  // Dice notation regex: optional sign, optional count, d, sides, optional modifier
  // Examples: 1d6, 2d8+3, -1d8, d20-2, +3d6+5
  const diceRegex = /^([+-])?(\d*)d(\d+)([+-]\d+)?$/i;
  const match = input.trim().match(diceRegex);

  if (!match) {
    return null;
  }

  const [, sign, countStr, sidesStr, modifierStr] = match;
  const negative = sign === "-";
  const count = countStr ? parseInt(countStr) : 1;
  const sides = parseInt(sidesStr);
  const modifier = modifierStr ? parseInt(modifierStr) : 0;

  // Validate dice parameters
  if (count < 1 || count > 100 || sides < 2 || sides > 1000) {
    return null;
  }

  // Roll the dice
  let total = 0;
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) {
    const roll = Math.floor(Math.random() * sides) + 1;
    rolls.push(roll);
    total += roll;
  }

  // Apply modifier
  total += modifier;

  // Apply negative sign if present
  if (negative) {
    total = -total;
  }

  // Build notation string for display
  const rollsStr = rolls.join("+");
  const modStr =
    modifier > 0 ? `+${modifier}` : modifier < 0 ? modifier.toString() : "";
  const notation = `${negative ? "-" : ""}(${rollsStr}${modStr}) = ${total}`;

  return { value: total, notation };
}

/**
 * Execute multiple tool calls and return command responses with state changes
 * Converts tool calls to XML command format and reuses existing validation
 */
export function executeTools(
  toolCalls: ToolCall[],
  storyData: StoryData
): ExecuteToolsResult {
  logger.action(
    `Executing ${toolCalls.length} tool call${
      toolCalls.length !== 1 ? "s" : ""
    }`,
    { toolNames: toolCalls.map((tc) => tc.function.name) }
  );

  const responses: CommandResponse[] = [];
  const stateChanges: string[] = [];

  // Helper to serialize arguments (string or object) in a compact form for failure diagnostics
  function serializeArgs(raw: string | Record<string, any>): string {
    try {
      if (typeof raw === "string") {
        // Return raw string (trimmed) if already JSON string / invalid JSON
        return raw.length > 160 ? raw.substring(0, 157) + "..." : raw;
      }
      const json = JSON.stringify(raw);
      return json.length > 160 ? json.substring(0, 157) + "..." : json;
    } catch {
      return "<unserializable args>";
    }
  }

  // Extract difficulty for tier conversion (used by challenge and other tools)
  const difficulty: AdventureDifficulty = storyData.difficulty || "medium";

  for (const toolCall of toolCalls) {
    const toolName = toolCall.function.name;
    const toolId = toolCall.id || "unknown";

    logger.action(`Processing tool call: ${toolName}`, {
      toolCallId: toolId,
      argsPreview: serializeArgs(toolCall.function.arguments),
    });

    try {
      // Parse arguments if they're a string (some APIs send JSON strings)
      let args: Record<string, any>;
      if (typeof toolCall.function.arguments === "string") {
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch (e) {
          const errorMsg = `Invalid tool arguments: ${
            e instanceof Error ? e.message : "Parse error"
          } (tool ${toolCall.function.name} rawArgs=${serializeArgs(
            toolCall.function.arguments
          )})`;
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }
      } else {
        args = toolCall.function.arguments;
      }

      // Validate tool exists
      const toolSchema = TOOL_MAP.get(toolCall.function.name);
      if (!toolSchema) {
        const errorMsg = `Unknown tool: ${
          toolCall.function.name
        } (called with args=${serializeArgs(args)})`;
        logger.error(`Tool call failed: ${errorMsg}`, {
          toolCallId: toolId,
          toolName,
        });
        responses.push({
          command: toolCall.function.name,
          success: false,
          message: errorMsg,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Validate required parameters
      const required = toolSchema.function.parameters.required || [];
      const missingParams = required.filter((param) => !(param in args));

      if (missingParams.length > 0) {
        const errorMsg = `Missing required parameters: ${missingParams.join(
          ", "
        )} (tool ${toolCall.function.name} args=${serializeArgs(args)})`;
        logger.error(`Tool call failed: ${errorMsg}`, {
          toolCallId: toolId,
          toolName,
          missingParams,
        });
        responses.push({
          command: toolCall.function.name,
          success: false,
          message: errorMsg,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Special handling for skip_tools (no-op when no changes needed)
      if (toolCall.function.name === "skip_tools") {
        const reason = args.reason || "No changes needed";
        logger.action(`Tool stage skipped: ${reason}`, { toolCallId: toolId });
        responses.push({
          command: toolCall.function.name,
          success: true,
          message: `Skipped: ${reason}`,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Special handling for add_memory (direct array manipulation)
      if (toolCall.function.name === "add_memory") {
        logger.action("Special handling: add_memory", {
          toolCallId: toolId,
          entry: args.entry.substring(0, 100),
        });
        if (!storyData.memory) storyData.memory = [];
        const entry = args.entry;
        // Add as MemoryEntry with embedded: false so it gets embedded on next sync
        storyData.memory.push({ content: entry, embedded: false });
        const successMsg = `Added memory: "${entry.substring(0, 50)}${
          entry.length > 50 ? "..." : ""
        }"`;
        logger.action(`Tool call succeeded: ${successMsg}`, {
          toolCallId: toolId,
          toolName,
        });
        responses.push({
          command: toolCall.function.name,
          success: true,
          message: successMsg,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Special handling for list_inactive_lore (query tool - returns data directly)
      if (toolCall.function.name === "list_inactive_lore") {
        logger.action("Special handling: list_inactive_lore", {
          toolCallId: toolId,
        });

        if (!storyData.lore || storyData.lore.length === 0) {
          responses.push({
            command: toolCall.function.name,
            success: true,
            message: "No lore entries defined in this adventure.",
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Find inactive lore (not revealed, not always-on, on=false or no triggers matched)
        const currentPartIndex = storyData.scene.parts.length;
        const inactiveLore = storyData.lore.filter((l) => {
          if (l.enabled === false) return false; // Completely disabled in editor
          if (l.alwaysOn) return false; // Always visible, not "inactive"

          // Check if already revealed via show_lore
          const wasRevealed = storyData.scene.parts.some((p) =>
            p.revealedLore?.some(
              (title) => title.toLowerCase() === l.title.toLowerCase()
            )
          );
          if (wasRevealed) return false;

          // Check standard activation
          if (l.on === true) {
            // If recently triggered, it's active
            if (
              l.lastTriggeredIndex &&
              currentPartIndex - l.lastTriggeredIndex <= 15
            ) {
              return false;
            }
          }

          // If we get here, lore is inactive
          return true;
        });

        if (inactiveLore.length === 0) {
          responses.push({
            command: toolCall.function.name,
            success: true,
            message:
              "All lore entries are currently active/visible. No hidden lore available.",
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Format inactive lore for AI
        const loreList = inactiveLore
          .map((l) => {
            const preview =
              l.content.length > 80
                ? l.content.substring(0, 77) + "..."
                : l.content;
            return `- ${l.title}: ${preview}`;
          })
          .join("\n");

        const successMsg = `Inactive/Hidden Lore Entries (${inactiveLore.length}):\n${loreList}\n\nUse show_lore({ title: "..." }) to reveal any of these to the player.`;

        logger.action(
          `Tool call succeeded: list_inactive_lore found ${inactiveLore.length} entries`,
          {
            toolCallId: toolId,
            count: inactiveLore.length,
          }
        );

        responses.push({
          command: toolCall.function.name,
          success: true,
          message: successMsg,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Special handling for variable management tools
      if (
        [
          "set_variable",
          "modify_variable",
          "toggle_variable",
          "add_to_list",
          "remove_from_list",
          "clear_list",
          "create_variable",
          "delete_variable",
        ].includes(toolCall.function.name)
      ) {
        const variableResult = executeVariableTool(
          toolCall.function.name,
          args,
          storyData,
          toolId
        );
        responses.push({
          ...variableResult,
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Special handling for update_quest with both shortDescription and description
      // Need to execute two commands
      if (
        toolCall.function.name === "update_quest" &&
        args.shortDescription &&
        args.description
      ) {
        logger.action("Special handling: update_quest with both descriptions", {
          toolCallId: toolId,
          questTitle: args.title,
        });

        // First: update description
        const descCommand = `/update_quest_description: ${args.title} | ${args.description}`;
        logger.action(`Executing command: ${descCommand}`, {
          toolCallId: toolId,
        });
        const descResponse = executeCommandWithResponse(descCommand, storyData);

        if (!descResponse || !descResponse.success) {
          const errorMsg =
            descResponse?.message || `Failed to update quest description`;
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
            command: descCommand,
          });
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Second: update short description
        const shortCommand = `/update_quest_short_description: ${args.title} | ${args.shortDescription}`;
        logger.action(`Executing command: ${shortCommand}`, {
          toolCallId: toolId,
        });
        const shortResponse = executeCommandWithResponse(
          shortCommand,
          storyData
        );

        if (!shortResponse || !shortResponse.success) {
          // Description was updated but short description failed - return partial success
          const partialMsg = `${
            descResponse.message
          } (short description update failed: ${
            shortResponse?.message || "unknown error"
          })`;
          logger.warn(`Tool call partial success: ${partialMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: toolCall.function.name,
            success: true,
            message: partialMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Both succeeded - combine messages
        const successMsg = `${descResponse.message} and updated short description`;
        logger.action(`Tool call succeeded: ${successMsg}`, {
          toolCallId: toolId,
          toolName,
        });
        responses.push({
          command: toolCall.function.name,
          success: true,
          message: successMsg,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Special handling for modify_relationship - calculate delta from magnitude
      // Need to execute two commands if description provided: modify value, then update description
      if (toolCall.function.name === "modify_relationship") {
        // Find current relationship value for delta calculation
        const relationships = storyData.relationships || [];
        const existingRel = relationships.find(
          (r) => r.name.toLowerCase() === args.name?.toLowerCase()
        );
        const currentValue = existingRel?.value ?? 0;
        const difficulty = storyData.difficulty || "medium";

        // Calculate actual delta from magnitude
        const valueDelta = calculateRelationshipDelta(
          args.magnitude || "slightly_improve",
          currentValue,
          difficulty as AdventureDifficulty
        );

        logger.action("Special handling: modify_relationship with magnitude", {
          toolCallId: toolId,
          relationshipName: args.name,
          magnitude: args.magnitude,
          currentValue,
          calculatedDelta: valueDelta,
          difficulty,
        });

        // First: modify the value
        const valueCommand = `/modify_relationship: ${args.name} | ${valueDelta}`;
        logger.action(`Executing command: ${valueCommand}`, {
          toolCallId: toolId,
        });
        const valueResponse = executeCommandWithResponse(
          valueCommand,
          storyData
        );

        if (!valueResponse || !valueResponse.success) {
          const errorMsg =
            valueResponse?.message || `Failed to modify relationship value`;
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
            command: valueCommand,
          });
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // If no description provided, we're done
        if (!args.description) {
          const magnitudeLabel = (args.magnitude || "slightly_improve").replace(
            /_/g,
            " "
          );
          const successMsg = `${valueResponse.message} (${magnitudeLabel})`;
          logger.action(`Tool call succeeded: ${successMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: toolCall.function.name,
            success: true,
            message: successMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });

          // Add state change for relationship modification
          if (STATE_CHANGE_TOOLS.has(toolName)) {
            stateChanges.push(successMsg);
          }
          continue;
        }

        // Second: update the description
        const descCommand = `/update_relationship_description: ${args.name} | ${args.description}`;
        logger.action(`Executing command: ${descCommand}`, {
          toolCallId: toolId,
        });
        const descResponse = executeCommandWithResponse(descCommand, storyData);

        if (!descResponse || !descResponse.success) {
          // Value was updated but description failed - return partial success
          const partialMsg = `${
            valueResponse.message
          } (description update failed: ${
            descResponse?.message || "unknown error"
          })`;
          logger.warn(`Tool call partial success: ${partialMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: toolCall.function.name,
            success: true,
            message: partialMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Both succeeded - combine messages
        const successMsg = `${valueResponse.message} and updated description`;
        logger.action(`Tool call succeeded: ${successMsg}`, {
          toolCallId: toolId,
          toolName,
        });
        responses.push({
          command: toolCall.function.name,
          success: true,
          message: successMsg,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Handle adjust_resource - use delta directly
      if (toolCall.function.name === "adjust_resource") {
        const delta = args.delta ?? 0;
        const command = `/adjust_resource: ${args.name} | ${delta}`;
        logger.action(`Executing command: ${command}`, {
          toolCallId: toolId,
        });
        const response = executeCommandWithResponse(command, storyData);

        if (!response || !response.success) {
          const errorMsg = response?.message || `Failed to adjust resource`;
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
            command,
          });
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        logger.action(`Tool call succeeded: ${response.message}`, {
          toolCallId: toolId,
          toolName,
        });
        responses.push({
          command: toolCall.function.name,
          success: true,
          message: response.message,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });

        if (STATE_CHANGE_TOOLS.has(toolName)) {
          stateChanges.push(response.message);
        }
        continue;
      }

      // Special handling for damage_item - calculate durability loss from magnitude
      if (toolCall.function.name === "damage_item") {
        const inventory = storyData.inventory || [];
        const existingItem = inventory.find(
          (i) => i.name.toLowerCase() === args.name?.toLowerCase()
        );

        if (!existingItem) {
          const errorMsg = `Item "${args.name}" not found`;
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Items without durability tracking can't be damaged this way
        const maxDurability = existingItem.maxDurability || 100;
        const difficulty = storyData.difficulty || "medium";

        // Calculate actual damage from magnitude
        const damage = calculateDurabilityDelta(
          args.magnitude || "damage",
          maxDurability,
          difficulty as AdventureDifficulty
        );

        logger.action("Special handling: damage_item with magnitude", {
          toolCallId: toolId,
          itemName: args.name,
          magnitude: args.magnitude,
          maxDurability,
          calculatedDamage: damage,
          difficulty,
        });

        // Use absolute value since /damage_item expects positive amount
        const command = `/damage_item: ${args.name} | ${Math.abs(damage)}`;
        logger.action(`Executing command: ${command}`, {
          toolCallId: toolId,
        });
        const response = executeCommandWithResponse(command, storyData);

        if (!response || !response.success) {
          const errorMsg = response?.message || `Failed to damage item`;
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
            command,
          });
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const magnitudeLabel = (args.magnitude || "damage").replace(/_/g, " ");
        const successMsg = `${response.message} (${magnitudeLabel})`;
        logger.action(`Tool call succeeded: ${successMsg}`, {
          toolCallId: toolId,
          toolName,
        });
        responses.push({
          command: toolCall.function.name,
          success: true,
          message: successMsg,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });

        if (STATE_CHANGE_TOOLS.has(toolName)) {
          stateChanges.push(successMsg);
        }
        continue;
      }

      // Special handling for repair_item - calculate durability restoration from magnitude
      if (toolCall.function.name === "repair_item") {
        const inventory = storyData.inventory || [];
        const existingItem = inventory.find(
          (i) => i.name.toLowerCase() === args.name?.toLowerCase()
        );

        if (!existingItem) {
          const errorMsg = `Item "${args.name}" not found`;
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const maxDurability = existingItem.maxDurability || 100;
        const difficulty = storyData.difficulty || "medium";

        // Calculate actual repair amount from magnitude
        const repair = calculateDurabilityDelta(
          args.magnitude || "repair",
          maxDurability,
          difficulty as AdventureDifficulty
        );

        logger.action("Special handling: repair_item with magnitude", {
          toolCallId: toolId,
          itemName: args.name,
          magnitude: args.magnitude,
          maxDurability,
          calculatedRepair: repair,
          difficulty,
        });

        const command = `/repair_item: ${args.name} | ${repair}`;
        logger.action(`Executing command: ${command}`, {
          toolCallId: toolId,
        });
        const response = executeCommandWithResponse(command, storyData);

        if (!response || !response.success) {
          const errorMsg = response?.message || `Failed to repair item`;
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
            command,
          });
          responses.push({
            command: toolCall.function.name,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const magnitudeLabel = (args.magnitude || "repair").replace(/_/g, " ");
        const successMsg = `${response.message} (${magnitudeLabel})`;
        logger.action(`Tool call succeeded: ${successMsg}`, {
          toolCallId: toolId,
          toolName,
        });
        responses.push({
          command: toolCall.function.name,
          success: true,
          message: successMsg,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });

        if (STATE_CHANGE_TOOLS.has(toolName)) {
          stateChanges.push(successMsg);
        }
        continue;
      }

      // === Advanced RPG Tools TOOL HANDLERS ===

      // Increment scene
      if (toolCall.function.name === "increment_scene") {
        storyData.agmtState = storyData.agmtState || {
          chaosFactor: 5,
          sceneCount: 0,
          skillCheckHistory: [],
          currentStreak: 0,
          lastChaosAdjustment: -999,
        };

        const oldCount = storyData.agmtState.sceneCount;
        const oldChaos = storyData.agmtState.chaosFactor;

        // Increment scene
        storyData.agmtState.sceneCount++;

        // Auto-adjust chaos based on performance
        const adjustedState = applyChaosAdjustment(storyData.agmtState);
        const newChaos = adjustedState.chaosFactor;

        storyData.agmtState = adjustedState;

        // Build response message
        let message = `✓ Scene count: ${oldCount} → ${oldCount + 1}`;

        if (newChaos !== oldChaos) {
          const reason = getChaosAdjustmentReason(
            oldChaos,
            newChaos,
            adjustedState
          );
          message += `\n${reason}`;
        }

        logger.action("Scene count incremented via tool", {
          toolCallId: toolId,
          oldCount,
          newCount: oldCount + 1,
          oldChaos,
          newChaos,
          chaosAdjusted: newChaos !== oldChaos,
        });
        responses.push({
          command: `/increment_scene: ${oldCount} → ${oldCount + 1}`,
          success: true,
          message,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // === CONDITION MANAGEMENT TOOL HANDLERS ===

      // Add condition
      if (toolCall.function.name === "add_condition") {
        const name = args.name?.trim();
        const tier = args.tier as 1 | 2 | 3 | 4 | 5 | 6;
        const description = args.description?.trim();
        const affects = args.affects || [];
        const affectsAll = args.affectsAll || false;
        const source = args.source?.trim() || undefined;

        if (!name || name.length < 2) {
          const errorMsg = "Condition name must be at least 2 characters";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/add_condition: ${name || ""}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (!tier || tier < 1 || tier > 6) {
          const errorMsg = "Condition tier must be between 1 and 6";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/add_condition: ${name}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (!description || description.length < 5) {
          const errorMsg =
            "Condition description must be at least 5 characters";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/add_condition: ${name}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Initialize conditions array if needed
        if (!storyData.conditions) {
          storyData.conditions = [];
        }

        // Check for duplicate condition name
        const existing = storyData.conditions.find(
          (c) => c.name.toLowerCase() === name.toLowerCase()
        );
        if (existing) {
          const errorMsg = `Condition "${name}" already exists at tier ${existing.tier}`;
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/add_condition: ${name}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const newCondition: Condition = {
          id: crypto.randomUUID(),
          name,
          tier,
          description,
          affects: affectsAll ? [] : affects,
          affectsAll,
          source,
          permanent: tier === 6,
          createdAt: Date.now(),
        };

        storyData.conditions.push(newCondition);

        const tierLabel = ["I", "II", "III", "IV", "V", "VI"][tier - 1];
        const affectsLabel = affectsAll
          ? "all checks"
          : affects.length > 0
          ? affects.join(", ")
          : "unspecified";

        logger.action("Condition added via tool", {
          toolCallId: toolId,
          name,
          tier,
          affectsAll,
          affects,
        });
        responses.push({
          command: `/add_condition: ${name} (Tier ${tierLabel})`,
          success: true,
          message: `✓ Inflicted ${
            tier === 6 ? "PERMANENT " : ""
          }condition: ${name} (Tier ${tierLabel}) - affects ${affectsLabel}`,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Upgrade condition (increase tier)
      if (toolCall.function.name === "upgrade_condition") {
        const name = args.name?.trim();
        const tiers = args.tiers || 1;
        const newDescription = args.description?.trim();

        if (!storyData.conditions || storyData.conditions.length === 0) {
          const errorMsg = "No conditions to upgrade";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/upgrade_condition: ${name}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const match = findBestMatch(
          name,
          storyData.conditions,
          (c) => c.name,
          0.6
        );
        if (!match) {
          const errorMsg = `Condition not found: "${name}"`;
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/upgrade_condition: ${name}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const condition = match.item;
        const oldTier = condition.tier;

        if (condition.tier >= 6) {
          const errorMsg = `Condition "${condition.name}" is already at maximum tier (VI)`;
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/upgrade_condition: ${condition.name}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const newTier = Math.min(6, condition.tier + tiers) as
          | 1
          | 2
          | 3
          | 4
          | 5
          | 6;
        condition.tier = newTier;
        if (newTier === 6) {
          condition.permanent = true;
        }
        if (newDescription) {
          condition.description = newDescription;
        }

        const oldTierLabel = ["I", "II", "III", "IV", "V", "VI"][oldTier - 1];
        const newTierLabel = ["I", "II", "III", "IV", "V", "VI"][newTier - 1];

        logger.action("Condition upgraded via tool", {
          toolCallId: toolId,
          name: condition.name,
          oldTier,
          newTier,
        });
        responses.push({
          command: `/upgrade_condition: ${condition.name} (Tier ${oldTierLabel} → ${newTierLabel})`,
          success: true,
          message: `✓ ${
            condition.name
          } worsened: Tier ${oldTierLabel} → ${newTierLabel}${
            newTier === 6 ? " (PERMANENT)" : ""
          }`,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Downgrade condition (decrease tier)
      if (toolCall.function.name === "downgrade_condition") {
        const name = args.name?.trim();
        const tiers = args.tiers || 1;
        const newDescription = args.description?.trim();

        if (!storyData.conditions || storyData.conditions.length === 0) {
          const errorMsg = "No conditions to downgrade";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/downgrade_condition: ${name}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const match = findBestMatch(
          name,
          storyData.conditions,
          (c) => c.name,
          0.6
        );
        if (!match) {
          const errorMsg = `Condition not found: "${name}"`;
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/downgrade_condition: ${name}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const condition = match.item;
        const oldTier = condition.tier;

        if (condition.permanent || condition.tier === 6) {
          const errorMsg = `Condition "${condition.name}" is permanent and cannot be downgraded`;
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/downgrade_condition: ${condition.name}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const newTier = condition.tier - tiers;

        if (newTier <= 0) {
          // Remove condition entirely
          storyData.conditions = storyData.conditions.filter(
            (c) => c.id !== condition.id
          );

          const oldTierLabel = ["I", "II", "III", "IV", "V", "VI"][oldTier - 1];

          logger.action("Condition removed via downgrade", {
            toolCallId: toolId,
            name: condition.name,
            oldTier,
          });
          responses.push({
            command: `/downgrade_condition: ${condition.name} (Tier ${oldTierLabel} → Removed)`,
            success: true,
            message: `✓ ${condition.name} fully recovered - condition removed`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        condition.tier = newTier as 1 | 2 | 3 | 4 | 5 | 6;
        if (newDescription) {
          condition.description = newDescription;
        }

        const oldTierLabel = ["I", "II", "III", "IV", "V", "VI"][oldTier - 1];
        const newTierLabel = ["I", "II", "III", "IV", "V", "VI"][newTier - 1];

        logger.action("Condition downgraded via tool", {
          toolCallId: toolId,
          name: condition.name,
          oldTier,
          newTier,
        });
        responses.push({
          command: `/downgrade_condition: ${condition.name} (Tier ${oldTierLabel} → ${newTierLabel})`,
          success: true,
          message: `✓ ${condition.name} improved: Tier ${oldTierLabel} → ${newTierLabel}`,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Remove condition
      if (toolCall.function.name === "remove_condition") {
        const name = args.name?.trim();
        const force = args.force || false;

        if (!storyData.conditions || storyData.conditions.length === 0) {
          const errorMsg = "No conditions to remove";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/remove_condition: ${name}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const match = findBestMatch(
          name,
          storyData.conditions,
          (c) => c.name,
          0.6
        );
        if (!match) {
          const errorMsg = `Condition not found: "${name}"`;
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/remove_condition: ${name}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const condition = match.item;

        if ((condition.permanent || condition.tier === 6) && !force) {
          const errorMsg = `Condition "${condition.name}" is permanent. Use force=true for extraordinary circumstances.`;
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/remove_condition: ${condition.name}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        storyData.conditions = storyData.conditions.filter(
          (c) => c.id !== condition.id
        );

        const tierLabel = ["I", "II", "III", "IV", "V", "VI"][
          condition.tier - 1
        ];

        logger.action("Condition removed via tool", {
          toolCallId: toolId,
          name: condition.name,
          tier: condition.tier,
          forced: force,
        });
        responses.push({
          command: `/remove_condition: ${condition.name}`,
          success: true,
          message: `✓ ${
            condition.permanent && force
              ? "Miraculously cured permanent "
              : "Removed "
          }condition: ${condition.name} (was Tier ${tierLabel})`,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Modify condition
      if (toolCall.function.name === "modify_condition") {
        const name = args.name?.trim();
        const newDescription = args.description?.trim();
        const newAffects = args.affects;
        const newAffectsAll = args.affectsAll;

        if (!storyData.conditions || storyData.conditions.length === 0) {
          const errorMsg = "No conditions to modify";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/modify_condition: ${name}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const match = findBestMatch(
          name,
          storyData.conditions,
          (c) => c.name,
          0.6
        );
        if (!match) {
          const errorMsg = `Condition not found: "${name}"`;
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/modify_condition: ${name}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const condition = match.item;
        const changes: string[] = [];

        if (newDescription) {
          condition.description = newDescription;
          changes.push("description");
        }
        if (newAffects !== undefined) {
          condition.affects = newAffects;
          changes.push("affected stats");
        }
        if (newAffectsAll !== undefined) {
          condition.affectsAll = newAffectsAll;
          changes.push("affectsAll");
        }

        if (changes.length === 0) {
          const errorMsg = "No changes specified";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/modify_condition: ${condition.name}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        logger.action("Condition modified via tool", {
          toolCallId: toolId,
          name: condition.name,
          changes,
        });
        responses.push({
          command: `/modify_condition: ${condition.name}`,
          success: true,
          message: `✓ Updated condition "${condition.name}": ${changes.join(
            ", "
          )}`,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Game over
      if (toolCall.function.name === "game_over") {
        const reason = args.reason?.trim();
        const conditionName = args.condition?.trim();

        if (!reason || reason.length < 10) {
          const errorMsg = "Game over reason must be at least 10 characters";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/game_over`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Mark story as game over
        storyData.gameOver = {
          reason,
          condition: conditionName,
          timestamp: Date.now(),
        };

        logger.action("Game over triggered via tool", {
          toolCallId: toolId,
          reason,
          condition: conditionName,
        });
        responses.push({
          command: `/game_over: ${reason}`,
          success: true,
          message: `⚠️ GAME OVER: ${reason}${
            conditionName ? ` (due to ${conditionName})` : ""
          }`,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // === SCENE CHALLENGE (PROGRESS CLOCK) TOOL HANDLERS ===

      // Start a new challenge
      if (toolCall.function.name === "start_challenge") {
        const name = args.name?.trim();
        const description = args.description?.trim();
        // Rounds can be a tier string or number - convert using tier system
        let rounds = parseChallengeRoundsValue(args.rounds ?? "standard");
        // Points can be a tier string or number - convert using tier system
        const points = parsePointsValue(args.points ?? "moderate", difficulty);
        const initialSuccesses = Math.min(args.initialSuccesses ?? 0, 3);
        const initialFailures = Math.min(args.initialFailures ?? 0, 3);

        // Ensure rounds is odd and within bounds (3, 5, 7, or 9)
        if (rounds < 3) rounds = 3;
        if (rounds > 9) rounds = 9;
        if (rounds % 2 === 0) rounds += 1; // Make odd

        if (!name || name.length < 3) {
          const errorMsg = "Challenge name must be at least 3 characters";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/start_challenge: ${name || ""}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Check if there's already an active challenge
        if (storyData.activeChallenge?.active) {
          const errorMsg = `Cannot start new challenge: "${storyData.activeChallenge.name}" is still active`;
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/start_challenge: ${name}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const majority = Math.ceil(rounds / 2);

        // Create the new challenge
        storyData.activeChallenge = {
          id: crypto.randomUUID(),
          name,
          description,
          rounds,
          currentSuccesses: initialSuccesses,
          currentFailures: initialFailures,
          active: true,
          createdAt: Date.now(),
          pointsAwarded: points,
        };

        logger.action("Challenge started via tool", {
          toolCallId: toolId,
          name,
          rounds,
          majority,
          points,
          initialSuccesses,
          initialFailures,
        });
        responses.push({
          command: `/start_challenge: ${name}`,
          success: true,
          message: `🎯 CHALLENGE STARTED: ${name} (Best of ${rounds} - first to ${majority}) [Score: ${initialSuccesses}-${initialFailures}]${
            points > 0 ? ` (${points} points on victory)` : ""
          }`,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Update challenge progress
      if (toolCall.function.name === "update_challenge") {
        const successIncrement = args.successIncrement ?? 0;
        const failureIncrement = args.failureIncrement ?? 0;

        if (!storyData.activeChallenge?.active) {
          const errorMsg = "No active challenge to update";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/update_challenge`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (successIncrement === 0 && failureIncrement === 0) {
          const errorMsg = "Must specify successIncrement or failureIncrement";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/update_challenge`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const challenge = storyData.activeChallenge;
        const oldSuccesses = challenge.currentSuccesses;
        const oldFailures = challenge.currentFailures;

        challenge.currentSuccesses += successIncrement;
        challenge.currentFailures += failureIncrement;

        // Check for automatic resolution (best of X - first to majority wins)
        const majority = Math.ceil(challenge.rounds / 2);
        let autoResolved = false;
        let autoResult: "won" | "lost" | null = null;
        let leveledUp = false;
        let newLevel = storyData.level || 1;

        if (challenge.currentSuccesses >= majority) {
          autoResolved = true;
          autoResult = "won";
          challenge.active = false;
          challenge.resolvedAt = Date.now();
          challenge.result = "won";

          // Award XP and update level
          if (challenge.pointsAwarded && challenge.pointsAwarded > 0) {
            const oldLevel = storyData.level || 1;
            storyData.points =
              (storyData.points || 0) + challenge.pointsAwarded;
            const level = calculateLevel(
              storyData.points || 0,
              storyData.levelingSettings
            );
            storyData.level = level;
            newLevel = level;
            leveledUp = level > oldLevel;
          }
        } else if (challenge.currentFailures >= majority) {
          autoResolved = true;
          autoResult = "lost";
          challenge.active = false;
          challenge.resolvedAt = Date.now();
          challenge.result = "lost";
        }

        const scoreStr = `[Score: ${challenge.currentSuccesses}-${challenge.currentFailures}]`;
        let message = "";

        if (successIncrement > 0 && failureIncrement > 0) {
          message = `${challenge.name}: +${successIncrement} success, +${failureIncrement} failure ${scoreStr}`;
        } else if (successIncrement > 0) {
          message = `${challenge.name}: +${successIncrement} success${
            successIncrement > 1 ? "es" : ""
          } ${scoreStr}`;
        } else {
          message = `${challenge.name}: +${failureIncrement} failure${
            failureIncrement > 1 ? "s" : ""
          } ${scoreStr}`;
        }

        if (autoResolved) {
          if (autoResult === "won") {
            message += `\n🏆 CHALLENGE WON: ${challenge.name}!${
              challenge.pointsAwarded
                ? ` (+${challenge.pointsAwarded} XP${
                    leveledUp ? `, Level Up to ${newLevel}!` : ""
                  })`
                : ""
            }`;
          } else {
            message += `\n💀 CHALLENGE LOST: ${challenge.name}!`;
          }
        }

        logger.action("Challenge updated via tool", {
          toolCallId: toolId,
          name: challenge.name,
          oldSuccesses,
          newSuccesses: challenge.currentSuccesses,
          oldFailures,
          newFailures: challenge.currentFailures,
          autoResolved,
          autoResult,
        });
        responses.push({
          command: `/update_challenge: +${successIncrement}s, +${failureIncrement}f`,
          success: true,
          message,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Manually resolve challenge
      if (toolCall.function.name === "resolve_challenge") {
        const result = args.result as "won" | "lost";
        const reason = args.reason?.trim();

        if (!storyData.activeChallenge?.active) {
          const errorMsg = "No active challenge to resolve";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/resolve_challenge`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (result !== "won" && result !== "lost") {
          const errorMsg = "Result must be 'won' or 'lost'";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/resolve_challenge`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const challenge = storyData.activeChallenge;
        challenge.active = false;
        challenge.resolvedAt = Date.now();
        challenge.result = result;

        let message = "";
        let leveledUp = false;
        let newLevel = storyData.level || 1;
        if (result === "won") {
          // Award XP and update level
          if (challenge.pointsAwarded && challenge.pointsAwarded > 0) {
            const oldLevel = storyData.level || 1;
            storyData.points =
              (storyData.points || 0) + challenge.pointsAwarded;
            const level = calculateLevel(
              storyData.points || 0,
              storyData.levelingSettings
            );
            storyData.level = level;
            newLevel = level;
            leveledUp = level > oldLevel;
          }
          message = `🏆 CHALLENGE WON: ${challenge.name}!${
            challenge.pointsAwarded
              ? ` (+${challenge.pointsAwarded} XP${
                  leveledUp ? `, Level Up to ${newLevel}!` : ""
                })`
              : ""
          }${reason ? ` - ${reason}` : ""}`;
        } else {
          message = `💀 CHALLENGE LOST: ${challenge.name}!${
            reason ? ` - ${reason}` : ""
          }`;
        }

        logger.action("Challenge resolved via tool", {
          toolCallId: toolId,
          name: challenge.name,
          result,
          reason,
          xpAwarded: result === "won" ? challenge.pointsAwarded : 0,
        });
        responses.push({
          command: `/resolve_challenge: ${result}`,
          success: true,
          message,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Cancel challenge (no win/loss)
      if (toolCall.function.name === "cancel_challenge") {
        const reason = args.reason?.trim();

        if (!storyData.activeChallenge?.active) {
          const errorMsg = "No active challenge to cancel";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/cancel_challenge`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (!reason || reason.length < 5) {
          const errorMsg = "Cancellation reason must be at least 5 characters";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/cancel_challenge`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const challenge = storyData.activeChallenge;
        const challengeName = challenge.name;

        // Clear the challenge without setting a result
        challenge.active = false;
        challenge.resolvedAt = Date.now();
        // Note: result remains undefined for cancelled challenges

        const message = `⏹️ CHALLENGE CANCELLED: ${challengeName} - ${reason}`;

        logger.action("Challenge cancelled via tool", {
          toolCallId: toolId,
          name: challengeName,
          reason,
          score: `${challenge.currentSuccesses}-${challenge.currentFailures}`,
        });
        responses.push({
          command: `/cancel_challenge: ${reason}`,
          success: true,
          message,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // === ADD NPC TOOL HANDLER ===
      // Creates both a relationship entry and a lore entry for important NPCs
      if (toolCall.function.name === "add_npc") {
        const name = args.name?.trim();
        const role = args.role?.trim();
        const disposition = args.disposition ?? 0;
        const appearance = args.appearance?.trim();
        const personality = args.personality?.trim();
        const motivation = args.motivation?.trim();
        const secret = args.secret?.trim();
        const location = args.location?.trim();

        // Validate required fields
        if (!name || name.length < 2) {
          const errorMsg = "NPC name must be at least 2 characters";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/add_npc: ${name || ""}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (!role || role.length < 3) {
          const errorMsg = "NPC role must be at least 3 characters";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/add_npc: ${name}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (!appearance || appearance.length < 10) {
          const errorMsg = "NPC appearance must be at least 10 characters";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/add_npc: ${name}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Check for duplicate relationship
        if (!storyData.relationships) {
          storyData.relationships = [];
        }
        const existingRelationship = storyData.relationships.find(
          (r) => r.name.toLowerCase() === name.toLowerCase()
        );
        if (existingRelationship) {
          const errorMsg = `NPC "${name}" already exists as a relationship`;
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/add_npc: ${name}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Check for duplicate lore
        if (!storyData.lore) {
          storyData.lore = [];
        }
        const existingLore = storyData.lore.find(
          (l) => l.title.toLowerCase() === name.toLowerCase()
        );
        if (existingLore) {
          const errorMsg = `Lore entry "${name}" already exists`;
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/add_npc: ${name}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Create relationship entry
        const clampedDisposition = Math.max(-100, Math.min(100, disposition));
        storyData.relationships.push({
          name,
          value: clampedDisposition,
          description: role,
          symbol: "👤", // Default person symbol for NPCs
        });

        // Build lore content
        let loreContent = `**${role}**\n\n`;
        loreContent += `**Appearance:** ${appearance}\n\n`;
        loreContent += `**Personality:** ${personality}\n\n`;
        if (motivation) {
          loreContent += `**Motivation:** ${motivation}\n\n`;
        }
        if (location) {
          loreContent += `**Usually Found:** ${location}\n\n`;
        }
        if (secret) {
          loreContent += `**Secret:** ${secret}\n`;
        }

        // Create lore entry with the NPC's name as a trigger
        const nameParts = name.split(/\s+/);
        const triggers: string[] = [name.toLowerCase()];
        // Add first name and last name as separate triggers if multi-word
        if (nameParts.length > 1) {
          nameParts.forEach((part: string) => {
            if (part.length > 2) {
              triggers.push(part.toLowerCase());
            }
          });
        }

        storyData.lore.push({
          title: name,
          content: loreContent.trim(),
          relatedCharacters: [],
          relatedLocations: location ? [location] : [],
          secrtet: !!secret, // Note: typo in interface
          keys: [],
          enabled: true,
          alwaysOn: false,
          on: true, // Start visible since they were just introduced
          on_triggers: triggers,
          off_triggers: [],
          embedded: false, // Mark for embedding sync
        });

        // Mark lore as dirty for embedding sync
        storyData.loreEmbeddingsDirty = true;

        const dispositionLabel =
          clampedDisposition >= 50
            ? "friendly"
            : clampedDisposition >= 20
            ? "warm"
            : clampedDisposition > -20
            ? "neutral"
            : clampedDisposition > -50
            ? "wary"
            : "hostile";

        logger.action("NPC added via tool", {
          toolCallId: toolId,
          name,
          role,
          disposition: clampedDisposition,
          hasSecret: !!secret,
        });

        responses.push({
          command: `/add_npc: ${name}`,
          success: true,
          message: `✓ Added NPC: ${name} (${role}) - ${dispositionLabel} disposition (${clampedDisposition})`,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });

        // Add state change for the story stage
        stateChanges.push(
          `New NPC introduced: ${name} (${role}, ${dispositionLabel})`
        );
        continue;
      }

      // === REST SYSTEM TOOL HANDLER ===
      if (toolCall.function.name === "take_rest") {
        const restResult = executeRestTool(args, storyData, toolId);
        responses.push({
          ...restResult,
          toolCallId: toolCall.id,
        });
        continue;
      }

      // === THREAD MANAGEMENT TOOL HANDLERS ===
      if (toolCall.function.name === "create_thread") {
        const { title, description, priority } = args;

        if (!title || !description) {
          responses.push({
            command: "/create_thread",
            success: false,
            message: "✗ Thread title and description are required",
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Initialize threads array if needed
        if (!storyData.threads) {
          storyData.threads = [];
        }

        // Check for duplicate title
        const existingThread = storyData.threads.find(
          (t) => t.title.toLowerCase() === title.toLowerCase()
        );
        if (existingThread) {
          responses.push({
            command: `/create_thread: ${title}`,
            success: false,
            message: `✗ Thread '${title}' already exists`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const newThread: StoryThread = {
          id: `thread_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          title,
          description,
          status: "active",
          priority: priority || "side",
          createdAt: Date.now(),
        };

        storyData.threads.push(newThread);

        responses.push({
          command: `/create_thread: ${title}`,
          success: true,
          message: `✓ Created ${priority || "side"} thread: ${title}`,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        stateChanges.push(`New thread: ${title} (${priority || "side"})`);
        continue;
      }

      if (toolCall.function.name === "update_thread") {
        const { title, description, priority } = args;

        if (!title) {
          responses.push({
            command: "/update_thread",
            success: false,
            message: "✗ Thread title is required",
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (!storyData.threads || storyData.threads.length === 0) {
          responses.push({
            command: `/update_thread: ${title}`,
            success: false,
            message: "✗ No threads exist",
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Find thread (fuzzy match)
        const thread = storyData.threads.find(
          (t) =>
            t.title.toLowerCase().includes(title.toLowerCase()) ||
            title.toLowerCase().includes(t.title.toLowerCase())
        );

        if (!thread) {
          responses.push({
            command: `/update_thread: ${title}`,
            success: false,
            message: `✗ Thread '${title}' not found`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (thread.status !== "active") {
          responses.push({
            command: `/update_thread: ${thread.title}`,
            success: false,
            message: `✗ Thread '${thread.title}' is ${thread.status}, cannot update`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const changes: string[] = [];
        if (description) {
          thread.description = description;
          changes.push("description");
        }
        if (priority) {
          thread.priority = priority;
          changes.push(`priority → ${priority}`);
        }

        if (changes.length === 0) {
          responses.push({
            command: `/update_thread: ${thread.title}`,
            success: false,
            message: "✗ No changes provided",
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        responses.push({
          command: `/update_thread: ${thread.title}`,
          success: true,
          message: `✓ Updated thread '${thread.title}': ${changes.join(", ")}`,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        stateChanges.push(`Thread updated: ${thread.title}`);
        continue;
      }

      if (toolCall.function.name === "resolve_thread") {
        const { title, resolution } = args;

        if (!title) {
          responses.push({
            command: "/resolve_thread",
            success: false,
            message: "✗ Thread title is required",
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (!storyData.threads || storyData.threads.length === 0) {
          responses.push({
            command: `/resolve_thread: ${title}`,
            success: false,
            message: "✗ No threads exist",
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Find thread (fuzzy match)
        const thread = storyData.threads.find(
          (t) =>
            t.title.toLowerCase().includes(title.toLowerCase()) ||
            title.toLowerCase().includes(t.title.toLowerCase())
        );

        if (!thread) {
          responses.push({
            command: `/resolve_thread: ${title}`,
            success: false,
            message: `✗ Thread '${title}' not found`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (thread.status !== "active") {
          responses.push({
            command: `/resolve_thread: ${thread.title}`,
            success: false,
            message: `✗ Thread '${thread.title}' is already ${thread.status}`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        thread.status = "resolved";
        thread.resolvedAt = Date.now();
        if (resolution) {
          thread.description = `${thread.description}\n\n[RESOLVED: ${resolution}]`;
        }

        responses.push({
          command: `/resolve_thread: ${thread.title}`,
          success: true,
          message: `✓ Resolved thread: ${thread.title}`,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        stateChanges.push(`Thread resolved: ${thread.title}`);
        continue;
      }

      if (toolCall.function.name === "abandon_thread") {
        const { title, reason } = args;

        if (!title) {
          responses.push({
            command: "/abandon_thread",
            success: false,
            message: "✗ Thread title is required",
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (!storyData.threads || storyData.threads.length === 0) {
          responses.push({
            command: `/abandon_thread: ${title}`,
            success: false,
            message: "✗ No threads exist",
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        // Find thread (fuzzy match)
        const thread = storyData.threads.find(
          (t) =>
            t.title.toLowerCase().includes(title.toLowerCase()) ||
            title.toLowerCase().includes(t.title.toLowerCase())
        );

        if (!thread) {
          responses.push({
            command: `/abandon_thread: ${title}`,
            success: false,
            message: `✗ Thread '${title}' not found`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (thread.status !== "active") {
          responses.push({
            command: `/abandon_thread: ${thread.title}`,
            success: false,
            message: `✗ Thread '${thread.title}' is already ${thread.status}`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        thread.status = "abandoned";
        thread.resolvedAt = Date.now();
        if (reason) {
          thread.description = `${thread.description}\n\n[ABANDONED: ${reason}]`;
        }

        responses.push({
          command: `/abandon_thread: ${thread.title}`,
          success: true,
          message: `✓ Abandoned thread: ${thread.title}`,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        stateChanges.push(`Thread abandoned: ${thread.title}`);
        continue;
      }

      // Convert tool call to XML command format and execute
      const command = convertToolToCommand(
        toolCall.function.name,
        args,
        storyData
      );
      if (command === null) {
        const errorMsg = `Tool cannot be converted to command (tool ${
          toolCall.function.name
        } args=${serializeArgs(args)})`;
        logger.error(`Tool call failed: ${errorMsg}`, {
          toolCallId: toolId,
          toolName,
        });
        responses.push({
          command: toolCall.function.name,
          success: false,
          message: errorMsg,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      logger.action(`Converted to command: ${command}`, { toolCallId: toolId });
      const response = executeCommandWithResponse(command, storyData);
      if (response) {
        response.toolCallId = toolCall.id; // Link response to tool call
        logger.action(
          `Tool call ${response.success ? "succeeded" : "failed"}: ${
            response.message
          }`,
          {
            toolCallId: toolId,
            toolName,
            success: response.success,
          }
        );
        responses.push(response);
      } else {
        const errorMsg = `Command execution returned null (tool ${
          toolCall.function.name
        } args=${serializeArgs(args)} command=${command})`;
        logger.error(`Tool call failed: ${errorMsg}`, {
          toolCallId: toolId,
          toolName,
          command,
        });
        responses.push({
          command: toolCall.function.name,
          success: false,
          message: errorMsg,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
      }
    } catch (error: any) {
      const errorMsg = `Execution error: ${error.message} (tool ${
        toolCall.function.name
      } args=${serializeArgs(toolCall.function.arguments)})`;
      logger.error(`Tool call exception: ${errorMsg}`, {
        toolCallId: toolId,
        toolName,
        error: error.message,
        stack: error.stack,
      });
      responses.push({
        command: toolCall.function.name,
        success: false,
        message: errorMsg,
        timestamp: Date.now(),
        toolCallId: toolCall.id,
      });
    }
  }

  const successCount = responses.filter((r) => r.success).length;
  const failureCount = responses.length - successCount;
  logger.action(
    `Tool execution complete: ${successCount} succeeded, ${failureCount} failed`,
    {
      totalCalls: toolCalls.length,
      successCount,
      failureCount,
      responses: responses.map((r) => ({
        tool: r.command,
        success: r.success,
        message: r.message.substring(0, 100),
      })),
    }
  );

  // Generate state changes from successful tool calls that modify game state
  for (const response of responses) {
    if (!response.success) continue;

    // Extract tool name from command (may be in format "/command_name: args" or just "tool_name")
    const commandMatch = response.command.match(/^\/(\w+):|^(\w+)$/);
    const toolName = commandMatch
      ? commandMatch[1] || commandMatch[2]
      : response.command;

    // Check if this tool should generate state change notification
    if (STATE_CHANGE_TOOLS.has(toolName)) {
      // Clean up message for state changes (remove emoji prefixes like ✓ or ⚠️)
      const cleanMessage = response.message.replace(/^[✓✗⚠️\s]+/, "").trim();
      if (cleanMessage) {
        stateChanges.push(cleanMessage);
      }
    }
  }

  if (stateChanges.length > 0) {
    logger.action(
      `Generated ${stateChanges.length} state change notifications`,
      {
        stateChanges,
      }
    );
  }

  return { responses, stateChanges };
}

/**
 * Convert tool call to XML command format for existing commandResponses.ts
 * This allows us to reuse all existing validation and fuzzy matching logic
 * Returns null for tools that need special handling (e.g., add_memory)
 *
 * Tier Conversion: Some tools accept tier strings (e.g., "moderate", "hard") instead of numbers.
 * These are converted to actual numbers based on RPG system and adventure difficulty.
 */
function convertToolToCommand(
  toolName: string,
  args: Record<string, any>,
  storyData: StoryData
): string | null {
  // Extract system and difficulty for tier conversion
  const rpgSystem: RPGSystemType =
    (storyData.rpgSystem as RPGSystemType) || "3d6";
  const difficulty: AdventureDifficulty = storyData.difficulty || "medium";

  switch (toolName) {
    // Quest Management
    case "create_quest": {
      // Points can be a tier string or number
      const rawPoints = args.points ?? "moderate";
      const points = parsePointsValue(rawPoints, difficulty);
      return `/create_quest: ${args.title} | ${args.shortDescription} | ${args.description} | ${points}`;
    }

    case "complete_quest":
      return `/complete_quest: ${args.title}`;

    case "fail_quest":
      return `/fail_quest: ${args.title}`;

    case "update_quest":
      if (args.shortDescription && args.description) {
        // Update both - do description first
        return `/update_quest_description: ${args.title} | ${args.description}`;
      } else if (args.shortDescription) {
        return `/update_quest_short_description: ${args.title} | ${args.shortDescription}`;
      } else if (args.description) {
        return `/update_quest_description: ${args.title} | ${args.description}`;
      }
      // No updates provided - this shouldn't happen but return null to fail gracefully
      return null;

    case "delete_quest":
      return `/delete_quest: ${args.title}`;

    // Item Management
    case "add_item": {
      // Validate and normalize item type - AI sometimes uses invalid types like "utility"
      const validTypes = ["normal", "consumable", "story", "misc"];
      const itemType = validTypes.includes(args.type?.toLowerCase())
        ? args.type.toLowerCase()
        : "normal"; // Default to normal if invalid type

      // Include grade if specified
      if (args.grade) {
        return `/add_item: ${args.name} | ${args.description} | ${itemType} | ${args.quantity} | ${args.grade}`;
      }
      return `/add_item: ${args.name} | ${args.description} | ${itemType} | ${args.quantity}`;
    }

    case "remove_item":
      return `/remove_item: ${args.name} | ${args.quantity}`;

    case "modify_item":
      // Handle new grade and durability parameters
      if (args.durability !== undefined) {
        return `/set_item_durability: ${args.name} | ${args.durability}`;
      } else if (args.grade) {
        return `/upgrade_item: ${args.name} | ${args.grade}`;
      } else if (args.description && args.type) {
        return `/modify_item: ${args.name} | ${args.description} | ${args.type}`;
      } else if (args.description) {
        return `/modify_item: ${args.name} | ${args.description}`;
      } else if (args.type) {
        return `/modify_item: ${args.name} | ${args.type}`;
      }
      return null; // No valid modifications specified

    case "break_item":
      return `/break_item: ${args.name}`;

    case "consume_item":
      // Use remove_item with quantity 1 to consume
      return `/remove_item: ${args.name} | 1`;

    case "repair_item":
      // Magnitude-based repair - handled in executeTools special handling
      return null;

    case "damage_item":
      // Magnitude-based damage - handled in executeTools special handling
      return null;

    case "upgrade_item":
      return `/upgrade_item: ${args.name} | ${args.newGrade}`;

    // Resource Management
    case "adjust_resource":
      // Delta-based resource change - handled in executeTools
      return null;

    case "set_resource":
      // Set resource values - use /modify_resource with deltas calculated from current values
      // Note: We can't set absolute values directly, only adjust them
      // This is a limitation of the current command system
      if (args.currentValue !== undefined && args.maxValue !== undefined) {
        // Would need current values to calculate deltas - not possible with command system
        // Best we can do is use /set_resource_max for max and /modify_resource for current
        return `/set_resource_max: ${args.name} | ${args.maxValue}`;
      } else if (args.maxValue !== undefined) {
        return `/set_resource_max: ${args.name} | ${args.maxValue}`;
      }
      // Can't set current value absolutely without knowing the current value
      return null;

    case "create_resource":
      // Use /add_resource command: name | description | current | max
      return `/add_resource: ${args.name} | ${args.description} | ${args.currentValue} | ${args.maxValue}`;

    case "delete_resource":
      // Use /remove_resource command: resource name
      return `/remove_resource: ${args.name}`;

    // Stat Management
    case "adjust_stat": {
      // Magnitude-based stat change
      const delta = calculateStatDelta(args.magnitude, difficulty);
      return `/modify_stat: ${args.name} | ${delta}`;
    }

    case "set_stat":
      return `/set_stat: ${args.name} ${args.value}`;

    case "create_stat":
      return `/create_stat: ${args.name} | ${args.description} | ${args.value}`;

    // Achievement
    case "trigger_achievement":
      return `/trigger_achievement: ${args.title}`;

    // Lore Management
    case "create_lore": {
      // Use /create_lore command (exists in commandResponses.ts)
      // Format: /create_lore: title | content | on_triggers | off_triggers
      const onTriggersStr = args.onTriggers?.length
        ? args.onTriggers.join(", ")
        : "";
      const offTriggersStr = args.offTriggers?.length
        ? args.offTriggers.join(", ")
        : "";
      return `/create_lore: ${args.title} | ${args.content} | ${onTriggersStr} | ${offTriggersStr}`;
    }

    case "delete_lore":
      return `/lore_delete: ${args.title}`;

    case "show_lore":
      return `/lore_show: ${args.title}`;

    case "hide_lore":
      return `/lore_hide: ${args.title}`;

    case "list_inactive_lore":
      return null; // Handled directly in executeTools

    case "update_lore": {
      // Format: /lore_update: title | newTitle | content | on | onTriggers | offTriggers
      const newTitle = args.newTitle || "";
      const content = args.content || "";
      const on = args.on !== undefined ? String(args.on) : "";
      const onTriggersStr = Array.isArray(args.onTriggers)
        ? args.onTriggers.join(",")
        : "";
      const offTriggersStr = Array.isArray(args.offTriggers)
        ? args.offTriggers.join(",")
        : "";
      return `/lore_update: ${args.title} | ${newTitle} | ${content} | ${on} | ${onTriggersStr} | ${offTriggersStr}`;
    }

    // Momentum
    case "modify_momentum":
      return `/modify_momentum: ${args.amount >= 0 ? "+" : ""}${args.amount}`;

    // Relationships
    case "add_relationship":
      return `/add_relationship: ${args.name} | ${args.value} | ${args.description}`;

    case "modify_relationship":
      // Handled by special logic in executeTools (magnitude-based calculation)
      return null;

    case "delete_relationship":
      return `/delete_relationship: ${args.name}`;

    case "edit_relationship":
      return `/update_relationship_description: ${args.name} | ${args.description}`;

    // Ability Management
    case "add_ability": {
      // Format: /add_ability: name | description | grade | stat | costs | maxCooldown
      // costs format: "resource:Health:10,variable:ManaSpent:5"
      const costsStr =
        args.costs
          ?.map(
            (c: { type: string; name: string; amount: number }) =>
              `${c.type}:${c.name}:${c.amount}`
          )
          .join(",") || "";
      return `/add_ability: ${args.name} | ${args.description} | ${
        args.grade || "novice"
      } | ${args.stat || ""} | ${costsStr} | ${args.maxCooldown || 0}`;
    }

    case "remove_ability":
      return `/remove_ability: ${args.name}`;

    case "modify_ability": {
      // Handle different modification types
      if (args.costs !== undefined) {
        const costsStr =
          args.costs
            ?.map(
              (c: { type: string; name: string; amount: number }) =>
                `${c.type}:${c.name}:${c.amount}`
            )
            .join(",") || "none";
        return `/modify_ability: ${args.name} | costs | ${costsStr}`;
      } else if (args.description !== undefined) {
        return `/modify_ability: ${args.name} | description | ${args.description}`;
      } else if (args.stat !== undefined) {
        return `/modify_ability: ${args.name} | stat | ${args.stat || "none"}`;
      } else if (args.maxCooldown !== undefined) {
        return `/modify_ability: ${args.name} | maxCooldown | ${args.maxCooldown}`;
      }
      return null; // No valid modifications specified
    }

    case "upgrade_ability":
      return `/upgrade_ability: ${args.name}`;

    case "reset_ability_cooldown":
      return `/refresh_ability: ${args.name}`;

    case "reduce_cooldown":
      return `/reduce_cooldown: ${args.name} | ${args.amount}`;

    case "refresh_ability":
      return `/refresh_ability: ${args.name}`;

    // Passive Effect Management
    case "add_passive":
      return `/add_passive: ${args.name} | ${args.description}`;

    case "remove_passive":
      return `/remove_passive: ${args.name}`;

    case "modify_passive": {
      const parts = [args.name];
      if (args.newName) parts.push(`name:${args.newName}`);
      if (args.newDescription) parts.push(`desc:${args.newDescription}`);
      return `/modify_passive: ${parts.join(" | ")}`;
    }

    // Memory - handled directly in executeTools, not via command
    case "add_memory":
      return null; // Signal to handle directly

    // Variable Management - handled directly in executeTools
    case "set_variable":
    case "modify_variable":
    case "toggle_variable":
    case "add_to_list":
    case "remove_from_list":
    case "clear_list":
    case "create_variable":
    case "delete_variable":
      return null; // Signal to handle directly

    default:
      throw new Error(`Unhandled tool: ${toolName}`);
  }
}

/**
 * Execute variable management tools
 * Returns CommandResponse for the operation
 */
function executeVariableTool(
  toolName: string,
  args: Record<string, any>,
  storyData: StoryData,
  toolId: string
): Omit<CommandResponse, "toolCallId"> {
  // Initialize variables array if not present
  if (!storyData.variables) {
    storyData.variables = [];
  }

  // Find variable by name with fuzzy matching
  const findVariable = (
    name: string
  ): { variable: Variable; index: number } | null => {
    const match = findBestMatch(name, storyData.variables!, (v) => v.name, 0.6);
    if (!match) return null;
    const index = storyData.variables!.findIndex((v) => v.name === match.name);
    if (index === -1) return null;
    return { variable: storyData.variables![index], index };
  };

  switch (toolName) {
    case "set_variable": {
      const found = findVariable(args.name);
      if (!found) {
        return {
          command: toolName,
          success: false,
          message: `Variable "${args.name}" not found`,
          timestamp: Date.now(),
        };
      }

      const { variable, index } = found;

      if (variable.type === "list") {
        return {
          command: toolName,
          success: false,
          message: `Cannot set list variable "${variable.name}" directly. Use add_to_list, remove_from_list, or clear_list instead.`,
          timestamp: Date.now(),
        };
      }

      if (variable.type === "boolean") {
        const newValue =
          typeof args.value === "boolean"
            ? args.value
            : args.value === "true" || args.value === true;
        (storyData.variables![index] as BooleanVariable).value = newValue;
        logger.action(`Set boolean variable: ${variable.name} = ${newValue}`, {
          toolId,
        });
        return {
          command: toolName,
          success: true,
          message: `Set ${variable.name} to ${newValue}`,
          timestamp: Date.now(),
        };
      }

      if (variable.type === "string") {
        const strValue = String(args.value);
        const strVar = variable as StringVariable;

        // If options are defined, validate against them
        if (strVar.options && strVar.options.length > 0) {
          const validOption = strVar.options.find(
            (opt) => opt.toLowerCase() === strValue.toLowerCase()
          );
          if (validOption) {
            (storyData.variables![index] as StringVariable).value = validOption;
          } else {
            // Allow setting to any value, but log that it's outside predefined options
            (storyData.variables![index] as StringVariable).value = strValue;
          }
        } else {
          (storyData.variables![index] as StringVariable).value = strValue;
        }

        logger.action(`Set string variable: ${variable.name} = "${strValue}"`, {
          toolId,
        });
        return {
          command: toolName,
          success: true,
          message: `Set ${variable.name} to "${strValue}"`,
          timestamp: Date.now(),
        };
      }

      // Number variable - support dice notation
      const parsed = parseDiceNotation(args.value);
      if (!parsed) {
        return {
          command: toolName,
          success: false,
          message: `Invalid value "${args.value}" - must be a number or dice notation (e.g., "2d6+3")`,
          timestamp: Date.now(),
        };
      }

      let finalValue = parsed.value;
      const numVar = variable as NumberVariable;

      // Clamp to min/max if defined
      if (numVar.minValue !== undefined && finalValue < numVar.minValue) {
        finalValue = numVar.minValue;
      }
      if (numVar.maxValue !== undefined && finalValue > numVar.maxValue) {
        finalValue = numVar.maxValue;
      }

      (storyData.variables![index] as NumberVariable).value = finalValue;
      const notation =
        typeof args.value === "string" && args.value.includes("d")
          ? ` [${parsed.notation}]`
          : "";
      logger.action(
        `Set number variable: ${variable.name} = ${finalValue}${notation}`,
        { toolId }
      );
      return {
        command: toolName,
        success: true,
        message: `Set ${variable.name} to ${finalValue}${notation}`,
        timestamp: Date.now(),
      };
    }

    case "modify_variable": {
      const found = findVariable(args.name);
      if (!found) {
        return {
          command: toolName,
          success: false,
          message: `Variable "${args.name}" not found`,
          timestamp: Date.now(),
        };
      }

      const { variable, index } = found;

      if (variable.type !== "number") {
        return {
          command: toolName,
          success: false,
          message: `Cannot modify ${variable.type} variable "${variable.name}". modify_variable only works on number variables.`,
          timestamp: Date.now(),
        };
      }

      const parsed = parseDiceNotation(args.amount);
      if (!parsed) {
        return {
          command: toolName,
          success: false,
          message: `Invalid amount "${args.amount}" - must be a number or dice notation (e.g., "-1d8+2")`,
          timestamp: Date.now(),
        };
      }

      const numVar = storyData.variables![index] as NumberVariable;
      const oldValue = numVar.value;
      let newValue = oldValue + parsed.value;

      // Clamp to min/max if defined
      if (numVar.minValue !== undefined && newValue < numVar.minValue) {
        newValue = numVar.minValue;
      }
      if (numVar.maxValue !== undefined && newValue > numVar.maxValue) {
        newValue = numVar.maxValue;
      }

      numVar.value = newValue;
      const delta =
        parsed.value >= 0 ? `+${parsed.value}` : parsed.value.toString();
      const notation =
        typeof args.amount === "string" && args.amount.includes("d")
          ? ` [${parsed.notation}]`
          : "";
      logger.action(
        `Modified variable: ${variable.name} ${delta}${notation} (${oldValue} → ${newValue})`,
        { toolId }
      );
      return {
        command: toolName,
        success: true,
        message: `${variable.name}: ${oldValue} ${delta}${notation} → ${newValue}`,
        timestamp: Date.now(),
      };
    }

    case "toggle_variable": {
      const found = findVariable(args.name);
      if (!found) {
        return {
          command: toolName,
          success: false,
          message: `Variable "${args.name}" not found`,
          timestamp: Date.now(),
        };
      }

      const { variable, index } = found;

      if (variable.type !== "boolean") {
        return {
          command: toolName,
          success: false,
          message: `Cannot toggle ${variable.type} variable "${variable.name}". toggle_variable only works on boolean variables.`,
          timestamp: Date.now(),
        };
      }

      const boolVar = storyData.variables![index] as BooleanVariable;
      const oldValue = boolVar.value;
      boolVar.value = !oldValue;
      logger.action(
        `Toggled variable: ${variable.name} ${oldValue} → ${boolVar.value}`,
        { toolId }
      );
      return {
        command: toolName,
        success: true,
        message: `Toggled ${variable.name}: ${oldValue} → ${boolVar.value}`,
        timestamp: Date.now(),
      };
    }

    case "add_to_list": {
      const found = findVariable(args.name);
      if (!found) {
        return {
          command: toolName,
          success: false,
          message: `Variable "${args.name}" not found`,
          timestamp: Date.now(),
        };
      }

      const { variable, index } = found;

      if (variable.type !== "list") {
        return {
          command: toolName,
          success: false,
          message: `Cannot add to ${variable.type} variable "${variable.name}". add_to_list only works on list variables.`,
          timestamp: Date.now(),
        };
      }

      const listVar = storyData.variables![index] as ListVariable;

      // Check maxSize
      if (
        listVar.maxSize !== undefined &&
        listVar.items.length >= listVar.maxSize
      ) {
        return {
          command: toolName,
          success: false,
          message: `Cannot add to ${variable.name}: list is at maximum size (${listVar.maxSize})`,
          timestamp: Date.now(),
        };
      }

      listVar.items.push(args.item);
      logger.action(`Added to list: ${variable.name} += "${args.item}"`, {
        toolId,
      });
      return {
        command: toolName,
        success: true,
        message: `Added "${args.item}" to ${variable.name} (${listVar.items.length} items)`,
        timestamp: Date.now(),
      };
    }

    case "remove_from_list": {
      const found = findVariable(args.name);
      if (!found) {
        return {
          command: toolName,
          success: false,
          message: `Variable "${args.name}" not found`,
          timestamp: Date.now(),
        };
      }

      const { variable, index } = found;

      if (variable.type !== "list") {
        return {
          command: toolName,
          success: false,
          message: `Cannot remove from ${variable.type} variable "${variable.name}". remove_from_list only works on list variables.`,
          timestamp: Date.now(),
        };
      }

      const listVar = storyData.variables![index] as ListVariable;

      // Find item with fuzzy matching
      const itemMatchResult = findBestMatch(
        args.item,
        listVar.items,
        (item) => item,
        0.6
      );
      if (!itemMatchResult) {
        return {
          command: toolName,
          success: false,
          message: `Item "${args.item}" not found in ${variable.name}`,
          timestamp: Date.now(),
        };
      }

      const matchedItem = itemMatchResult.item;
      const itemIndex = listVar.items.indexOf(matchedItem);
      listVar.items.splice(itemIndex, 1);
      logger.action(`Removed from list: ${variable.name} -= "${matchedItem}"`, {
        toolId,
      });
      return {
        command: toolName,
        success: true,
        message: `Removed "${matchedItem}" from ${variable.name} (${listVar.items.length} items remaining)`,
        timestamp: Date.now(),
      };
    }

    case "clear_list": {
      const found = findVariable(args.name);
      if (!found) {
        return {
          command: toolName,
          success: false,
          message: `Variable "${args.name}" not found`,
          timestamp: Date.now(),
        };
      }

      const { variable, index } = found;

      if (variable.type !== "list") {
        return {
          command: toolName,
          success: false,
          message: `Cannot clear ${variable.type} variable "${variable.name}". clear_list only works on list variables.`,
          timestamp: Date.now(),
        };
      }

      const listVar = storyData.variables![index] as ListVariable;
      const oldCount = listVar.items.length;
      listVar.items = [];
      logger.action(
        `Cleared list: ${variable.name} (${oldCount} items removed)`,
        { toolId }
      );
      return {
        command: toolName,
        success: true,
        message: `Cleared ${variable.name} (${oldCount} items removed)`,
        timestamp: Date.now(),
      };
    }

    case "create_variable": {
      // Initialize variables array if needed
      if (!storyData.variables) {
        storyData.variables = [];
      }

      // Check for duplicate name
      const existingVar = storyData.variables.find(
        (v) => v.name.toLowerCase() === args.name.toLowerCase()
      );
      if (existingVar) {
        return {
          command: toolName,
          success: false,
          message: `Variable "${args.name}" already exists`,
          timestamp: Date.now(),
        };
      }

      const id = crypto.randomUUID();
      let newVar: Variable;

      switch (args.type) {
        case "number": {
          const numValue = typeof args.value === "number" ? args.value : 0;
          newVar = {
            id,
            name: args.name,
            description: args.description || "",
            type: "number",
            value: numValue,
            minValue: args.minValue,
            maxValue: args.maxValue,
          } as NumberVariable;
          break;
        }
        case "boolean": {
          const boolValue =
            typeof args.value === "boolean" ? args.value : false;
          newVar = {
            id,
            name: args.name,
            description: args.description || "",
            type: "boolean",
            value: boolValue,
          } as BooleanVariable;
          break;
        }
        case "string": {
          const strValue = typeof args.value === "string" ? args.value : "";
          newVar = {
            id,
            name: args.name,
            description: args.description || "",
            type: "string",
            value: strValue,
            options: args.options,
          } as StringVariable;
          break;
        }
        case "list": {
          newVar = {
            id,
            name: args.name,
            description: args.description || "",
            type: "list",
            items: [],
            maxSize: args.maxSize,
          } as ListVariable;
          break;
        }
        default:
          return {
            command: toolName,
            success: false,
            message: `Invalid variable type "${args.type}". Must be: number, boolean, string, or list`,
            timestamp: Date.now(),
          };
      }

      storyData.variables.push(newVar);
      logger.action(`Created ${args.type} variable: ${args.name}`, { toolId });

      let valueStr = "";
      if (args.type === "number")
        valueStr = ` = ${(newVar as NumberVariable).value}`;
      else if (args.type === "boolean")
        valueStr = ` = ${(newVar as BooleanVariable).value}`;
      else if (args.type === "string")
        valueStr = ` = "${(newVar as StringVariable).value}"`;
      else if (args.type === "list") valueStr = " (empty list)";

      return {
        command: toolName,
        success: true,
        message: `Created ${args.type} variable "${args.name}"${valueStr}`,
        timestamp: Date.now(),
      };
    }

    case "delete_variable": {
      if (!storyData.variables || storyData.variables.length === 0) {
        return {
          command: toolName,
          success: false,
          message: `No variables exist to delete`,
          timestamp: Date.now(),
        };
      }

      const found = findVariable(args.name);
      if (!found) {
        return {
          command: toolName,
          success: false,
          message: `Variable "${args.name}" not found`,
          timestamp: Date.now(),
        };
      }

      const { variable, index } = found;
      storyData.variables.splice(index, 1);
      logger.action(`Deleted variable: ${variable.name}`, { toolId });

      return {
        command: toolName,
        success: true,
        message: `Deleted variable "${variable.name}"`,
        timestamp: Date.now(),
      };
    }

    default:
      return {
        command: toolName,
        success: false,
        message: `Unknown variable tool: ${toolName}`,
        timestamp: Date.now(),
      };
  }
}

/**
 * Execute rest tool - handles resource recovery, cooldown reduction, condition healing, item repair
 * Returns CommandResponse for the operation
 */
function executeRestTool(
  args: Record<string, any>,
  storyData: StoryData,
  toolId: string
): Omit<CommandResponse, "toolCallId"> {
  const restType = args.type as RestType;
  const narrativeSummary = args.narrative_summary?.trim() || "";
  const resourcesArg = args.resources as
    | Array<{ name: string; amount: number; percentage?: boolean }>
    | undefined;
  const difficulty = storyData.difficulty || "medium";
  const config = REST_CONFIG[difficulty];

  // Initialize rest state if not present
  if (!storyData.restState) {
    storyData.restState = {
      quickRestsUsed: 0,
      shortRestsUsed: 0,
    };
  }

  // Check if rest is available
  if (
    restType === "quick" &&
    storyData.restState.quickRestsUsed >= config.maxQuickRests
  ) {
    return {
      command: "take_rest",
      success: false,
      message: `Cannot quick rest: ${config.maxQuickRests} quick rests already used (long rest required to recharge)`,
      timestamp: Date.now(),
    };
  }

  if (
    restType === "short" &&
    storyData.restState.shortRestsUsed >= config.maxShortRests
  ) {
    return {
      command: "take_rest",
      success: false,
      message: `Cannot short rest: ${config.maxShortRests} short rests already used (long rest required to recharge)`,
      timestamp: Date.now(),
    };
  }

  // Check for active challenge - cannot rest during challenges
  if (storyData.activeChallenge?.active) {
    return {
      command: "take_rest",
      success: false,
      message: `Cannot rest while "${storyData.activeChallenge.name}" challenge is active`,
      timestamp: Date.now(),
    };
  }

  // Track effects for summary message
  const effects: string[] = [];

  // 1. Resource Recovery (GM-specified list only)
  if (resourcesArg && resourcesArg.length > 0 && storyData.resources?.length) {
    for (const resourceReq of resourcesArg) {
      // Find matching resource using fuzzy match
      const match = findBestMatch(
        resourceReq.name,
        storyData.resources,
        (r) => r.name,
        0.6
      );

      if (!match) {
        // Resource not found - skip silently (don't fail the whole rest)
        continue;
      }

      const resource = match.item;
      if (resource.value >= resource.maxValue) {
        // Already at max - skip
        continue;
      }

      // Calculate recovery amount
      const isPercentage = resourceReq.percentage !== false; // Default to true
      let recoveryAmount: number;
      if (isPercentage) {
        recoveryAmount = Math.ceil(
          (resource.maxValue * resourceReq.amount) / 100
        );
      } else {
        recoveryAmount = Math.ceil(resourceReq.amount);
      }

      const oldValue = resource.value;
      resource.value = Math.min(
        resource.maxValue,
        resource.value + recoveryAmount
      );
      const actualRecovery = resource.value - oldValue;
      if (actualRecovery > 0) {
        effects.push(`${resource.name} +${actualRecovery}`);
      }
    }
  }

  // 2. Stress Reduction (YZE system)
  const stressReduction = config.stressReduction[restType];
  if (
    stressReduction > 0 &&
    storyData.rpgSystem === "yze" &&
    (storyData.stress ?? 0) > 0
  ) {
    const oldStress = storyData.stress ?? 0;
    storyData.stress = Math.max(0, oldStress - stressReduction);
    const actualReduction = oldStress - (storyData.stress ?? 0);
    if (actualReduction > 0) {
      effects.push(`Stress -${actualReduction}`);
    }
  }

  // 3. Cooldown Reduction
  const cooldownReduction = config.cooldownReduction[restType];
  if (cooldownReduction > 0 && storyData.abilities?.length) {
    let cooldownsReset = 0;
    for (const ability of storyData.abilities) {
      if ((ability.currentCooldown ?? 0) > 0) {
        if (cooldownReduction >= 999) {
          // Full reset
          ability.currentCooldown = 0;
          cooldownsReset++;
        } else {
          const oldCooldown = ability.currentCooldown ?? 0;
          ability.currentCooldown = Math.max(
            0,
            oldCooldown - cooldownReduction
          );
          if (ability.currentCooldown < oldCooldown) {
            cooldownsReset++;
          }
        }
      }
    }
    if (cooldownsReset > 0) {
      if (cooldownReduction >= 999) {
        effects.push(
          `${cooldownsReset} ability cooldown${
            cooldownsReset > 1 ? "s" : ""
          } reset`
        );
      } else {
        effects.push(
          `${cooldownsReset} ability cooldown${
            cooldownsReset > 1 ? "s" : ""
          } reduced`
        );
      }
    }
  }

  // 4. Condition Downgrade (non-permanent only)
  const conditionDowngrade = config.conditionDowngrade[restType];
  if (conditionDowngrade > 0 && storyData.conditions?.length) {
    const conditionsHealed: string[] = [];
    const conditionsToRemove: number[] = [];

    for (let i = 0; i < storyData.conditions.length; i++) {
      const condition = storyData.conditions[i];
      // Skip permanent conditions (tier 6) and explicitly permanent ones
      if (condition.permanent || condition.tier >= 6) continue;

      const newTier = condition.tier - conditionDowngrade;
      if (newTier < 1) {
        // Condition fully healed - mark for removal
        conditionsToRemove.push(i);
        conditionsHealed.push(`${condition.name} healed`);
      } else {
        // Downgrade tier
        condition.tier = newTier as 1 | 2 | 3 | 4 | 5;
        conditionsHealed.push(`${condition.name} improved`);
      }
    }

    // Remove fully healed conditions (reverse order to preserve indices)
    for (let i = conditionsToRemove.length - 1; i >= 0; i--) {
      storyData.conditions.splice(conditionsToRemove[i], 1);
    }

    if (conditionsHealed.length > 0) {
      effects.push(conditionsHealed.join(", "));
    }
  }

  // 5. Update rest state tracking
  if (restType === "long") {
    // Long rest resets quick/short rest counts
    storyData.restState.quickRestsUsed = 0;
    storyData.restState.shortRestsUsed = 0;
  } else if (restType === "short") {
    storyData.restState.shortRestsUsed++;
    // Short rest also resets quick rest count
    storyData.restState.quickRestsUsed = 0;
  } else {
    storyData.restState.quickRestsUsed++;
  }

  storyData.restState.lastRestType = restType;
  storyData.restState.lastRestTimestamp = Date.now();

  // Build summary message
  const restTypeLabel =
    restType === "quick"
      ? "Quick Rest"
      : restType === "short"
      ? "Short Rest"
      : "Long Rest";
  const durationLabel =
    restType === "quick"
      ? "~30 minutes"
      : restType === "short"
      ? "4-8 hours"
      : "several days";

  let summary = `🛏️ ${restTypeLabel} (${durationLabel})`;
  if (narrativeSummary) {
    summary += `: ${narrativeSummary}`;
  }

  if (effects.length > 0) {
    summary += `\nEffects: ${effects.join(" | ")}`;
  } else {
    summary += "\nNo recovery needed - already at full capacity";
  }

  // Add remaining rest counts
  if (restType !== "long") {
    const remainingQuick =
      config.maxQuickRests - storyData.restState.quickRestsUsed;
    const remainingShort =
      config.maxShortRests - storyData.restState.shortRestsUsed;
    summary += `\n[Rests remaining: ${remainingQuick} quick, ${remainingShort} short]`;
  }

  logger.action(`Rest executed: ${restType}`, {
    toolId,
    restType,
    difficulty,
    effects: effects.length,
    quickRestsRemaining:
      config.maxQuickRests - storyData.restState.quickRestsUsed,
    shortRestsRemaining:
      config.maxShortRests - storyData.restState.shortRestsUsed,
  });

  return {
    command: `take_rest: ${restType}`,
    success: true,
    message: summary,
    timestamp: Date.now(),
  };
}

/**
 * Validate tool call parameters against schema
 * Returns error message if validation fails, null if valid
 */
export function validateToolCall(toolCall: ToolCall): string | null {
  const toolSchema = TOOL_MAP.get(toolCall.function.name);
  if (!toolSchema) {
    return `Unknown tool: ${toolCall.function.name}`;
  }

  // Parse arguments
  let args: Record<string, any>;
  try {
    if (typeof toolCall.function.arguments === "string") {
      args = JSON.parse(toolCall.function.arguments);
    } else {
      args = toolCall.function.arguments;
    }
  } catch (e) {
    return `Invalid JSON arguments: ${
      e instanceof Error ? e.message : "Parse error"
    }`;
  }

  // Check required parameters
  const required = toolSchema.function.parameters.required || [];
  const missingParams = required.filter((param) => !(param in args));
  if (missingParams.length > 0) {
    return `Missing required parameters: ${missingParams.join(", ")}`;
  }

  // Basic type validation
  const properties = toolSchema.function.parameters.properties;
  for (const [key, value] of Object.entries(args)) {
    if (!(key in properties)) {
      return `Unknown parameter: ${key}`;
    }

    const propSchema = properties[key];
    const actualType = Array.isArray(value) ? "array" : typeof value;

    if (propSchema.type && actualType !== propSchema.type) {
      return `Parameter '${key}' expected type ${propSchema.type}, got ${actualType}`;
    }

    // Validate enum
    if (propSchema.enum && !propSchema.enum.includes(value)) {
      return `Parameter '${key}' must be one of: ${propSchema.enum.join(", ")}`;
    }

    // Validate number ranges
    if (propSchema.type === "number") {
      if (propSchema.minimum !== undefined && value < propSchema.minimum) {
        return `Parameter '${key}' must be >= ${propSchema.minimum}`;
      }
      if (propSchema.maximum !== undefined && value > propSchema.maximum) {
        return `Parameter '${key}' must be <= ${propSchema.maximum}`;
      }
    }
  }

  return null;
}
