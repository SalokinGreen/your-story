/**
 * Tool Executor - Maps AI tool calls to existing command execution logic
 *
 * This module bridges the gap between structured tool calling and our existing
 * commandResponses.ts implementation, reusing all validation and fuzzy matching logic.
 */

import {
  StoryData,
  CommandResponse,
  MythicThread,
  MythicCharacter,
} from "@/app/misc/structs";
import { executeCommandWithResponse } from "@/app/misc/commandResponses";
import { TOOL_MAP } from "@/app/misc/toolSchemas";
import { logger } from "@/app/misc/logger";

export interface ToolCall {
  id?: string;
  type: "function";
  function: {
    name: string;
    arguments: string | Record<string, any>;
  };
}

/**
 * Execute multiple tool calls and return command responses
 * Converts tool calls to XML command format and reuses existing validation
 */
export function executeTools(
  toolCalls: ToolCall[],
  storyData: StoryData
): CommandResponse[] {
  logger.action(
    `Executing ${toolCalls.length} tool call${
      toolCalls.length !== 1 ? "s" : ""
    }`,
    { toolNames: toolCalls.map((tc) => tc.function.name) }
  );

  const responses: CommandResponse[] = [];

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

      // === MYTHIC GME TOOL HANDLERS ===

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

        const newThread: MythicThread = {
          id: crypto.randomUUID(),
          description,
          status: "active",
          createdAt: Date.now(),
        };

        storyData.mythicState = storyData.mythicState || {
          chaosFactor: 5,
          threads: [],
          characters: [],
          sceneCount: 0,
        };

        storyData.mythicState.threads.push(newThread);

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
        if (!storyData.mythicState) {
          const errorMsg = "Mythic GME not enabled";
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

        const thread = storyData.mythicState.threads.find(
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
        if (!storyData.mythicState) {
          const errorMsg = "Mythic GME not enabled";
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

        const thread = storyData.mythicState.threads.find(
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

        if (!storyData.mythicState) {
          const errorMsg = "Mythic GME not enabled";
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

        const thread = storyData.mythicState.threads.find(
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

        const newCharacter: MythicCharacter = {
          id: crypto.randomUUID(),
          name,
          role,
          status: "active",
          createdAt: Date.now(),
        };

        storyData.mythicState = storyData.mythicState || {
          chaosFactor: 5,
          threads: [],
          characters: [],
          sceneCount: 0,
        };

        storyData.mythicState.characters.push(newCharacter);

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

        if (!storyData.mythicState) {
          const errorMsg = "Mythic GME not enabled";
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

        const character = storyData.mythicState.characters.find(
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

        if (!storyData.mythicState) {
          const errorMsg = "Mythic GME not enabled";
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

        const character = storyData.mythicState.characters.find(
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

      // Adjust chaos
      if (toolCall.function.name === "adjust_chaos") {
        const delta = args.delta;

        if (typeof delta !== "number" || isNaN(delta)) {
          const errorMsg = "Delta must be a number";
          logger.error(`Tool call failed: ${errorMsg}`, {
            toolCallId: toolId,
            toolName,
          });
          responses.push({
            command: `/adjust_chaos: ${delta}`,
            success: false,
            message: errorMsg,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          });
          continue;
        }

        storyData.mythicState = storyData.mythicState || {
          chaosFactor: 5,
          threads: [],
          characters: [],
          sceneCount: 0,
        };

        const oldChaos = storyData.mythicState.chaosFactor;
        const newChaos = Math.max(1, Math.min(9, oldChaos + delta));
        storyData.mythicState.chaosFactor = newChaos;

        logger.action("Chaos factor adjusted via tool", {
          toolCallId: toolId,
          oldChaos,
          newChaos,
          delta,
        });
        responses.push({
          command: `/adjust_chaos: ${oldChaos} → ${newChaos} (${
            delta > 0 ? "+" : ""
          }${delta})`,
          success: true,
          message: `✓ Chaos Factor: ${oldChaos} → ${newChaos}`,
          timestamp: Date.now(),
          toolCallId: toolCall.id,
        });
        continue;
      }

      // Increment scene
      if (toolCall.function.name === "increment_scene") {
        storyData.mythicState = storyData.mythicState || {
          chaosFactor: 5,
          threads: [],
          characters: [],
          sceneCount: 0,
        };

        const oldCount = storyData.mythicState.sceneCount;
        storyData.mythicState.sceneCount++;

        logger.action("Scene count incremented via tool", {
          toolCallId: toolId,
          oldCount,
          newCount: oldCount + 1,
        });
        responses.push({
          command: `/increment_scene: ${oldCount} → ${oldCount + 1}`,
          success: true,
          message: `✓ Scene count: ${oldCount} → ${oldCount + 1}`,
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

  return responses;
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
      return `/add_item: ${args.name} | ${args.description} | ${args.type} | ${args.quantity}`;

    case "remove_item":
      return `/remove_item: ${args.name} | ${args.quantity}`;

    case "modify_item":
      if (args.description && args.type) {
        return `/modify_item: ${args.name} | ${args.description} | ${args.type}`;
      } else if (args.description) {
        return `/modify_item: ${args.name} | ${args.description}`;
      } else if (args.type) {
        return `/modify_item: ${args.name} | ${args.type}`;
      }
      return `/add_item: ${args.name}`; // Fallback

    case "break_item":
      return `/break_item: ${args.name}`;

    case "consume_item":
      return `/consume_item: ${args.name}`;

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

    // Memory - handled directly in executeTools, not via command
    case "add_memory":
      return null; // Signal to handle directly

    default:
      throw new Error(`Unhandled tool: ${toolName}`);
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
