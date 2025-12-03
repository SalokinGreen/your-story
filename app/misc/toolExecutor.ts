/**
 * Tool Executor - Maps AI tool calls to existing command execution logic
 *
 * This module bridges the gap between structured tool calling and our existing
 * commandResponses.ts implementation, reusing all validation and fuzzy matching logic.
 */

import {
  StoryData,
  CommandResponse,
  AGMTThread,
  AGMTCharacter,
  Condition,
  Variable,
  NumberVariable,
  BooleanVariable,
  StringVariable,
  ListVariable,
} from "@/app/misc/structs";
import { executeCommandWithResponse } from "@/app/misc/commandResponses";
import { TOOL_MAP } from "@/app/misc/toolSchemas";
import { logger } from "@/app/misc/logger";
import {
  applyChaosAdjustment,
  getChaosAdjustmentReason,
} from "@/app/misc/mythicChaos";
import { findBestMatch } from "@/app/misc/fuzzyMatch";

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
  // Achievements - tool names and command names
  "trigger_achievement",
  // Lore - tool names and command names
  "show_lore",
  "lore_show",
  "hide_lore",
  "lore_hide",
  "create_lore",
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

      // Special handling for add_memory (direct array manipulation)
      if (toolCall.function.name === "add_memory") {
        logger.action("Special handling: add_memory", {
          toolCallId: toolId,
          entry: args.entry.substring(0, 100),
        });
        if (!storyData.memory) storyData.memory = [];
        const entry = args.entry;
        storyData.memory.push(entry);
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

      // Special handling for modify_relationship with description
      // Need to execute two commands: modify value, then update description
      if (
        toolCall.function.name === "modify_relationship" &&
        args.description
      ) {
        logger.action(
          "Special handling: modify_relationship with description",
          {
            toolCallId: toolId,
            relationshipName: args.name,
            valueDelta: args.valueDelta,
          }
        );

        // First: modify the value
        const valueCommand = `/modify_relationship: ${args.name} | ${args.valueDelta}`;
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

      // === Advanced RPG Tools TOOL HANDLERS ===

      // Add thread
      if (toolCall.function.name === "add_thread") {
        const description = args.description?.trim();
        if (!description || description.length < 10) {
          const errorMsg = "Thread description must be at least 10 characters";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/add_thread: ${description || ""}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const newThread: AGMTThread = {
          id: crypto.randomUUID(),
          description,
          status: "active",
          createdAt: Date.now(),
        };

        storyData.agmtState = storyData.agmtState || {
          chaosFactor: 5,
          threads: [],
          characters: [],
          sceneCount: 0,
          skillCheckHistory: [],
          currentStreak: 0,
          lastChaosAdjustment: -999,
        };

        storyData.agmtState.threads.push(newThread);

        logger.action("Thread added via tool", {
          toolCallId: toolId,
          description,
        });
        responses.push({
          command: `/add_thread: ${description}`,
          success: true,
          message: `✓ Added thread: "${description}"`,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Close thread
      if (toolCall.function.name === "close_thread") {
        const threadId = args.threadId;
        if (!storyData.agmtState) {
          const errorMsg = "Advanced RPG Tools not enabled";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/close_thread: ${threadId}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const thread = storyData.agmtState.threads.find(
          (t) => t.id === threadId
        );
        if (!thread) {
          const errorMsg = `Thread not found (ID: ${threadId})`;
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/close_thread: ${threadId}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        thread.status = "closed";

        logger.action("Thread closed via tool", {
          toolCallId: toolId,
          description: thread.description,
        });
        responses.push({
          command: `/close_thread: ${thread.description}`,
          success: true,
          message: `✓ Closed thread: "${thread.description}"`,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Reopen thread
      if (toolCall.function.name === "reopen_thread") {
        const threadId = args.threadId;
        if (!storyData.agmtState) {
          const errorMsg = "Advanced RPG Tools not enabled";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/reopen_thread: ${threadId}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const thread = storyData.agmtState.threads.find(
          (t) => t.id === threadId
        );
        if (!thread) {
          const errorMsg = `Thread not found (ID: ${threadId})`;
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/reopen_thread: ${threadId}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        thread.status = "active";

        logger.action("Thread reopened via tool", {
          toolCallId: toolId,
          description: thread.description,
        });
        responses.push({
          command: `/reopen_thread: ${thread.description}`,
          success: true,
          message: `✓ Reopened thread: "${thread.description}"`,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Update thread
      if (toolCall.function.name === "update_thread") {
        const threadId = args.threadId;
        const description = args.description?.trim();

        if (!description || description.length < 10) {
          const errorMsg = "Thread description must be at least 10 characters";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/update_thread: ${threadId}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (!storyData.agmtState) {
          const errorMsg = "Advanced RPG Tools not enabled";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/update_thread: ${threadId}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const thread = storyData.agmtState.threads.find(
          (t) => t.id === threadId
        );
        if (!thread) {
          const errorMsg = `Thread not found (ID: ${threadId})`;
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/update_thread: ${threadId}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const oldDesc = thread.description;
        thread.description = description;

        logger.action("Thread updated via tool", {
          toolCallId: toolId,
          oldDescription: oldDesc,
          newDescription: description,
        });
        responses.push({
          command: `/update_thread: ${oldDesc} → ${description}`,
          success: true,
          message: `✓ Updated thread: "${oldDesc}" → "${description}"`,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Add character
      if (toolCall.function.name === "add_character") {
        const name = args.name?.trim();
        const role = args.role?.trim();

        if (!name || name.length < 2) {
          const errorMsg = "Character name must be at least 2 characters";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/add_character: ${name || ""}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (!role || role.length < 5) {
          const errorMsg = "Character role must be at least 5 characters";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/add_character: ${name}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const newCharacter: AGMTCharacter = {
          id: crypto.randomUUID(),
          name,
          role,
          status: "active",
          createdAt: Date.now(),
        };

        storyData.agmtState = storyData.agmtState || {
          chaosFactor: 5,
          threads: [],
          characters: [],
          sceneCount: 0,
          skillCheckHistory: [],
          currentStreak: 0,
          lastChaosAdjustment: -999,
        };

        storyData.agmtState.characters.push(newCharacter);

        logger.action("Character added via tool", {
          toolCallId: toolId,
          name,
          role,
        });
        responses.push({
          command: `/add_character: ${name} (${role})`,
          success: true,
          message: `✓ Added character: ${name} - ${role}`,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Update character
      if (toolCall.function.name === "update_character") {
        const characterId = args.characterId;
        const name = args.name?.trim();
        const role = args.role?.trim();

        if (!storyData.agmtState) {
          const errorMsg = "Advanced RPG Tools not enabled";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/update_character: ${characterId}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const character = storyData.agmtState.characters.find(
          (c) => c.id === characterId
        );
        if (!character) {
          const errorMsg = `Character not found (ID: ${characterId})`;
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/update_character: ${characterId}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const oldName = character.name;
        const oldRole = character.role;

        if (name) character.name = name;
        if (role) character.role = role;

        logger.action("Character updated via tool", {
          toolCallId: toolId,
          oldName,
          newName: character.name,
          oldRole,
          newRole: character.role,
        });
        responses.push({
          command: `/update_character: ${oldName} → ${character.name} (${character.role})`,
          success: true,
          message: `✓ Updated character: ${oldName} (${oldRole}) → ${character.name} (${character.role})`,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Update character status
      if (toolCall.function.name === "update_character_status") {
        const characterId = args.characterId;
        const status = args.status as "active" | "deceased" | "departed";

        if (!["active", "deceased", "departed"].includes(status)) {
          const errorMsg = "Status must be 'active', 'deceased', or 'departed'";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/update_character_status: ${characterId} ${status}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (!storyData.agmtState) {
          const errorMsg = "Advanced RPG Tools not enabled";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/update_character_status: ${characterId}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const character = storyData.agmtState.characters.find(
          (c) => c.id === characterId
        );
        if (!character) {
          const errorMsg = `Character not found (ID: ${characterId})`;
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/update_character_status: ${characterId}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const oldStatus = character.status;
        character.status = status;

        logger.action("Character status updated via tool", {
          toolCallId: toolId,
          name: character.name,
          oldStatus,
          newStatus: status,
        });
        responses.push({
          command: `/update_character_status: ${character.name} ${oldStatus} → ${status}`,
          success: true,
          message: `✓ ${character.name} status changed: ${oldStatus} → ${status}`,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Increment scene
      if (toolCall.function.name === "increment_scene") {
        storyData.agmtState = storyData.agmtState || {
          chaosFactor: 5,
          threads: [],
          characters: [],
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

      // Convert tool call to XML command format and execute
      const command = convertToolToCommand(toolCall.function.name, args);
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
 */
function convertToolToCommand(
  toolName: string,
  args: Record<string, any>
): string | null {
  switch (toolName) {
    // Quest Management
    case "create_quest":
      // Points defaults to 50 if not provided (per schema)
      return `/create_quest: ${args.title} | ${args.shortDescription} | ${
        args.description
      } | ${args.points || 50}`;

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
    case "add_item":
      // Include grade if specified
      if (args.grade) {
        return `/add_item: ${args.name} | ${args.description} | ${args.type} | ${args.quantity} | ${args.grade}`;
      }
      return `/add_item: ${args.name} | ${args.description} | ${args.type} | ${args.quantity}`;

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
      return `/consume_item: ${args.name}`;

    case "repair_item":
      // Amount is optional - omit for full repair
      if (args.amount !== undefined) {
        return `/repair_item: ${args.name} | ${args.amount}`;
      }
      return `/repair_item: ${args.name}`;

    case "damage_item":
      return `/damage_item: ${args.name} | ${args.amount}`;

    case "upgrade_item":
      return `/upgrade_item: ${args.name} | ${args.newGrade}`;

    // Resource Management
    case "adjust_resource":
      // Use /adjust_resource for current value only, /modify_resource for both
      if (args.maxDelta !== undefined && args.maxDelta !== 0) {
        return `/modify_resource: ${args.name} | ${args.currentDelta} | ${args.maxDelta}`;
      }
      return `/adjust_resource: ${args.name} | ${args.currentDelta}`;

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
    case "adjust_stat":
      return `/modify_stat: ${args.name} | ${args.valueDelta}`;

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

    // Plot Beats
    case "mark_beat":
      return `/mark_beat: ${args.beatIndex}`;

    case "unmark_beat":
      return `/unmark_beat: ${args.beatIndex}`;

    case "create_beat":
      return `/create_beat: ${args.description}`;

    case "delete_beat":
      return `/delete_beat: ${args.beatIndex}`;

    case "edit_beat":
      return `/edit_beat: ${args.beatIndex} | ${args.description}`;

    // Momentum
    case "modify_momentum":
      return `/modify_momentum: ${args.amount >= 0 ? "+" : ""}${args.amount}`;

    // Relationships
    case "add_relationship":
      return `/add_relationship: ${args.name} | ${args.value} | ${args.description}`;

    case "modify_relationship":
      // Description handled separately in executeTools if provided
      return `/modify_relationship: ${args.name} | ${args.valueDelta}`;

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
