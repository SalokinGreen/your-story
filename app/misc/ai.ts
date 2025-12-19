import {
  ScenePart,
  StoryData,
  Choice,
  UPGRADE_COSTS,
  CommandResponse,
  getMemoryContent,
  deduplicateMemories,
} from "@/app/misc/structs";
import { getRPGSystem, RPGSystem } from "@/app/misc/rpgSystems";
import { formatResponsesForAI } from "@/app/misc/commandResponses";
import { TOOL_SCHEMAS, TOOL_NAMES } from "@/app/misc/toolSchemas";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  reasoning?: string; // AI reasoning/thinking
  reasoning_details?: any[]; // Structured reasoning tokens (ReasoningDetail[])
  tool_calls?: any[]; // OpenAI/DeepSeek format tool calls
  tool_call_id?: string; // For tool role messages
};

export interface BuildPromptInput {
  storyData: StoryData;
  userChoice?: string;
  commandResponses?: CommandResponse[]; // AI feedback from last commands
}

// Cleans text by removing problematic characters and normalizing whitespace
function cleanString(text: string): string {
  if (!text) return "";
  return (
    text
      // Remove null bytes and other control characters (except newlines and tabs)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      // Normalize different types of whitespace to standard space
      .replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000]/g, " ")
      // Replace multiple spaces with single space
      .replace(/ {2,}/g, " ")
      // Replace more than 2 consecutive newlines with exactly 2
      .replace(/\n{3,}/g, "\n\n")
      // Trim spaces at start/end of lines
      .replace(/[ \t]+$/gm, "")
      .replace(/^[ \t]+/gm, "")
      // Trim overall
      .trim()
  );
}

/**
 * Strip <thinking>...</thinking> tags, <output> tags, and other GM markers from content
 * Used to hide GM's internal reasoning from the player
 *
 * STRICT BEHAVIOR: If <output> or <story> tags are detected, ONLY content inside
 * those tags is returned. Everything else is hidden. No fallback cleaning.
 */
export function stripThinkingTags(content: string): string {
  if (!content) return "";

  // 1. Check for <output> tags (new standard) - STRICT: only return content inside tags
  const outputStartRegex = /<\s*output[^>]*>/i;
  if (outputStartRegex.test(content)) {
    let outputBlocks: string[] = [];
    let lastIndex = 0;
    let match;

    // Find all closed <output>...</output> blocks
    const closedBlockRegex = /<\s*output[^>]*>([\s\S]*?)<\s*\/\s*output\s*>/gi;
    while ((match = closedBlockRegex.exec(content)) !== null) {
      outputBlocks.push(match[1].trim());
      lastIndex = closedBlockRegex.lastIndex;
    }

    // Check for an open <output> tag after the last closed block (for streaming)
    const remainingContent = content.slice(lastIndex);
    // Stop at the next structured tag or end of string to avoid including choices/memory in story
    const openTagMatch =
      /<\s*output[^>]*>([\s\S]*?)(?=<\s*(?:memory|choices|commands|thinking|output|story)|!!!|$)/i.exec(
        remainingContent
      );
    if (openTagMatch) {
      outputBlocks.push(openTagMatch[1].trim());
    }

    // STRICT: If we detected <output> tags, ONLY return content from inside them
    // Even if no content was extracted, return empty string - don't fall through
    return outputBlocks.join("\n\n").trim();
  }

  // 2. Check for <story> tags (legacy standard) - STRICT: only return content inside tags
  const storyStartRegex = /<\s*story[^>]*>/i;
  if (storyStartRegex.test(content)) {
    let storyBlocks: string[] = [];
    let lastIndex = 0;
    let match;

    const closedBlockRegex = /<\s*story[^>]*>([\s\S]*?)<\s*\/\s*story\s*>/gi;
    while ((match = closedBlockRegex.exec(content)) !== null) {
      storyBlocks.push(match[1].trim());
      lastIndex = closedBlockRegex.lastIndex;
    }

    const remainingContent = content.slice(lastIndex);
    const openTagMatch =
      /<\s*story[^>]*>([\s\S]*?)(?=<\s*(?:memory|choices|commands|thinking|output|story)|!!!|$)/i.exec(
        remainingContent
      );
    if (openTagMatch) {
      storyBlocks.push(openTagMatch[1].trim());
    }

    // STRICT: If we detected <story> tags, ONLY return content from inside them
    return storyBlocks.join("\n\n").trim();
  }

  // 3. No <output> or <story> tags found - return content as-is
  return content.trim();
}

/**
 * Extract <thinking>...</thinking> content from a string
 * Returns array of thinking blocks found
 * Handles spaces inside tags like < thinking > that some models output
 * Also handles malformed tags like <thinking::label] ... </thinking>
 */
export function extractThinkingTags(content: string): string[] {
  if (!content) return [];
  // Match standard thinking tags
  const standardMatches =
    content.match(/<\s*thinking\s*>[\s\S]*?<\s*\/\s*thinking\s*>/gi) || [];
  // Match malformed thinking tags with labels: <thinking::label] ... </thinking>
  const malformedMatches =
    content.match(
      /<\s*thinking\s*:+[^\]>]*[\]>][\s\S]*?<\s*\/\s*thinking\s*>/gi
    ) || [];
  const allMatches = [...standardMatches, ...malformedMatches];
  return allMatches.map((m) =>
    m
      .replace(/<\s*thinking\s*:+[^\]>]*[\]>]/gi, "") // Remove malformed opening tags
      .replace(/<\s*\/?\s*thinking\s*>/gi, "") // Remove standard tags
      .trim()
  );
}

/**
 * Detect if AI output contains repetitive/looping content.
 * This happens when the model gets stuck repeating the same phrase.
 */
export function detectRepetition(content: string): boolean {
  if (!content || content.length < 500) return false;

  // Method 1: Check for repeated phrases (minimum 30 chars repeated 3+ times)
  // Look for patterns like "Let me check X. Let me check X. Let me check X."
  const phrasePattern = /(.{30,100})\1{2,}/;
  if (phrasePattern.test(content)) {
    return true;
  }

  // Method 2: Check for high repetition ratio
  // Split into sentences and check how many are duplicates
  const sentences = content
    .split(/[.!?]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 20);

  if (sentences.length >= 5) {
    const uniqueSentences = new Set(sentences);
    const uniqueRatio = uniqueSentences.size / sentences.length;
    // If less than 30% unique sentences, it's repetitive
    if (uniqueRatio < 0.3) {
      return true;
    }
  }

  // Method 3: Check for specific repetition patterns
  // Count occurrences of common repetitive starters
  const repetitiveStarters = [
    "let me check",
    "let me also check",
    "i need to check",
    "i'll check",
    "checking",
  ];

  for (const starter of repetitiveStarters) {
    const count = (content.toLowerCase().match(new RegExp(starter, "g")) || [])
      .length;
    // If same phrase appears 5+ times, it's stuck in a loop
    if (count >= 5) {
      return true;
    }
  }

  return false;
}

export function buildMessages({
  storyData,
  userChoice,
  useRawContext = false,
  maxTokens = 120000,
  commandResponses,
}: BuildPromptInput & {
  useRawContext?: boolean;
  maxTokens?: number;
}): { messages: ChatMessage[]; tools: any[] } {
  // Get the RPG system configuration
  const rpgSystem = getRPGSystem(storyData.rpgSystem || "3d6");

  const system = `You are a helpful, creative narrative engine for a choice-driven, text-only adventure game.
Stay in character and respond in the style of an interactive fiction game. You're the narrator and the characters.

CRITICAL: Always use the exact XML-style tags in your response. Your output MUST follow this structure:

Output Format (REQUIRED):
\`\`\`
<story>
Story prose here. Write your narrative content between these tags.
</story>

<choices>
- Choice 1
- Choice 2
</choices>
\`\`\`

IMPORTANT: The <story></story> tags are MANDATORY. Never write story text without wrapping it in <story> tags. All narrative content must be enclosed in <story></story> tags.

Choice Syntax:
${rpgSystem.aiInstructions.choiceSyntax}q

Memory Guidelines:
- Add new memory entries with the add memory tool call.
- Do NOT repeat entries that already exist in the Memory section below. Only add genuinely new information.
- Make memory entries DETAILED and SPECIFIC. Include names, locations, consequences, and emotional context.
- BAD: "Met a merchant" GOOD: "Met Aldric, a suspicious merchant in Darkwater who tried to sell cursed artifacts and fled when confronted"
- BAD: "Fought goblins" GOOD: "Slaughtered goblin war party at Blackridge Pass, their chieftain swore revenge before dying"
- Use memory to track important story developments, character actions, and world changes, or anything else that should influence future scenes and shall be remembered by the narrative.

⚠️ EXACT NAME MATCHING REQUIREMENT:
When referencing skills, resources, or items in choices and commands, you MUST use the EXACT names as they appear in the game state below.
- Copy the exact spelling, capitalization, and punctuation from the Stats, Resources, and Inventory sections.
- Do NOT paraphrase, abbreviate, or modify names. The system uses exact string matching and will fail if names don't match perfectly.
- Examples:
  ✓ CORRECT: use_skill: Stealth (if "Stealth" exists in Stats)
  ✗ WRONG: use_skill: Sneak (if the actual stat is called "Stealth")
  ✓ CORRECT: use_resource: Stamina (if "Stamina" exists in Resources)
  ✗ WRONG: use_resource: Energy (if the actual resource is called "Stamina")
  ✓ CORRECT: use_item: Health Potion (if "Health Potion" exists in Inventory)
  ✗ WRONG: use_item: Healing Potion (if the actual item is called "Health Potion")

Resource System:
- When a choice uses a resource (use_resource), it signifies that action requires or risks that resource.
- Choose resources that thematically fit the action: use Stamina for running/escaping, Health for combat/dangerous situations, Mana for spellcasting, etc.
- Resource requirements are based on DC:
  * Required amount: DC ÷ ${
    rpgSystem.resources.requiredDivisor
  } (rounded down, minimum ${rpgSystem.resources.minRequired})
  * If player has insufficient resource: dice roll receives -DC÷${
    rpgSystem.resources.penaltyDivisor
  } penalty (minimum -${rpgSystem.resources.minPenalty})
- YOU manage all resource gains and losses via tools (adjust_resource, set_resource) based on narrative outcomes.
- Example: A player sprints to escape - on failure, YOU might deduct Stamina; on success, YOU decide if they're winded or energized.

Guidelines:
- Always provide at least six choices (more is better for player agency).
- Vary choice types: include safe/risky options, creative solutions, social/combat/stealth approaches, and morally ambiguous paths.
- Only reference skills and resources that exist in the game state below - use EXACT names from Stats and Resources sections.
- You can use items that are not in the inventory, but the player rolls at a disadvantage.
- You can use markdown formatting for more immersive experience. But only in the story section.
- Choices should be distinct and lead to different outcomes.
- Incorporate the player's stats, resources, inventory, and achievements into the story and choices.
- Adapt the story based on the player's previous choices and current state.
- ${rpgSystem.aiInstructions.diceSystem}
- ${rpgSystem.aiInstructions.dcGuidance}
- ${rpgSystem.aiInstructions.challengeGuidance}
- Balance challenge with narrative flow: not every choice needs a skill check. Include some "automatic success" choices that advance the story.
- Use skill checks for dramatic moments, high-stakes decisions, and character-defining actions.
- ${rpgSystem.aiInstructions.dcGuidelines}

Item Types:
- normal: Gives advantage when used. Doesn't get consumed on use, but breaks on skill check failure.
- consumable: Gives advantage when used. Gets consumed immediately when used, regardless of success or failure.
- story: Gives advantage when used. Never breaks and never gets consumed. Important quest items.
- misc: Doesn't give advantage, but prevents disadvantage from not having an item. Never breaks or gets consumed.

Hidden Text (DM Notes):
- Use ||double pipes|| to hide text from the player: ||this text is hidden||
- Players CANNOT see hidden text - it's completely invisible to them unless they enable a special setting
- Use hidden text for: foreshadowing, NPC true motives, secret information, future plot hints, or notes for yourself
- Example: "The merchant smiles warmly. ||He's actually planning to rob you tonight.||"
- Important: If hidden information becomes relevant, you MUST reveal it in regular text - the player can't act on what they can't see
- Hidden text persists in conversation history, so you can reference your own hidden notes later

## TOOL CALLING

You have access to structured tools (functions) to modify game state.

Available tools: ${TOOL_NAMES.join(", ")}

Tool Usage:
- Call tools to modify game state (create quests, add items, adjust stats, etc.)
- You'll receive feedback in the next user message showing success/failure
- If a tool fails, you'll see why and can retry with corrections
- Tools use fuzzy matching for names, so close matches work
- You can call multiple tools in one response

Example (you just call the tool - no special format needed):
  Story output: "You find a mysterious potion on the shelf."
  Tool call: add_item with parameters {name: "Mysterious Potion", description: "A bubbling green liquid", type: "consumable", quantity: 1}
  Next turn you'll see: "✓ Added Mysterious Potion to inventory"

Relationship Guidelines:
Value Ranges & Meanings:
- 75 to 100: Strong Ally/Friend - Will go out of their way to help, trust implicitly, may offer special favors or discounts
- 50 to 74: Ally - Helpful and supportive, willing to assist within reason
- 25 to 49: Friend/Acquaintance - Generally friendly, minor assistance available
- 0 to 24: Neutral - Neither friend nor foe, purely transactional
- -1 to -24: Slight Tension - Minor distrust, may be uncooperative or charge more
- -25 to -49: Unfriendly - Actively unhelpful, rude, or obstructive
- -50 to -74: Enemy - Hostile, may refuse service or actively work against player
- -75 to -100: Blood Enemy - Will attack on sight or plot player's downfall

Relationship Change Guidelines:
- Small actions (minor help/insult): ±3 to ±8
- Moderate actions (saving from danger/betrayal): ±10 to ±20
- Major actions (life-changing favor/grievous harm): ±25 to ±40
- Epic actions (saving their faction/destroying their life's work): ±50+
- Relationships should evolve gradually through consistent actions, not single dramatic swings (unless truly warranted)
- Consider cultural context: some factions value honor, others pragmatism
- Track key NPCs, factions, guilds, kingdoms - anyone with ongoing story relevance
- Use relationships to open/close narrative paths: high reputation unlocks exclusive quests, low reputation creates obstacles
- Don't track every minor NPC - focus on recurring characters and important factions

Progression System:
- Players earn upgrade points from story progression and achievements.
- Players spend points in the Upgrades shop to increase stats, expand resource maximums, or add custom items.

Narrative Best Practices:
- Show, don't tell: Use vivid descriptions, sensory details, and character actions instead of exposition dumps.
- Respect player agency: Let choices matter and have meaningful consequences that ripple through the story.
- Maintain consistent tone: Match the adventure's theme (dark fantasy, lighthearted comedy, gritty realism, etc.).
- Build tension gradually: Escalate stakes through the story beats, with peaks and valleys for pacing.
- Reward creativity: If the player's previous choice was unexpected or clever, acknowledge it in the narrative.
- Use the memory system strategically: Add short-term developments to <memory>, but remember that older memory entries will eventually fall out as new ones are added.
- Preserve important information as lore: When you introduce crucial worldbuilding, key NPCs, locations, factions, or story-critical information that should persist permanently, use /create_lore to save it. Unlike memory entries, lore entries never disappear and can be referenced throughout the entire adventure.
- Reference lore: Weave in lore entries when contextually appropriate to enrich worldbuilding and maintain narrative consistency.`;

  const recentScene = storyData.scene.parts.at(-1)?.content ?? storyData.intro;

  // Dynamic caps based on context window
  // 1 token ~= 4 characters
  const CHARS_PER_TOKEN = 4;
  // Reserve tokens for system prompt, new generation, and other overhead (approx 2000 tokens)
  const RESERVED_TOKENS = 2000;
  const availableTokens = Math.max(1000, maxTokens - RESERVED_TOKENS);

  // 1/4 for memory, 3/4 for story parts
  const memoryTokens = Math.floor(availableTokens * 0.25);
  const storyTokens = Math.floor(availableTokens * 0.75);

  const memory_cap = memoryTokens * CHARS_PER_TOKEN;
  const story_cap = storyTokens * CHARS_PER_TOKEN;

  // Deduplicate memories (removes exact duplicates and very similar entries)
  storyData.memory = deduplicateMemories(storyData.memory);

  // Trim memory if too large
  let totalMemoryLength = storyData.memory.reduce(
    (acc, entry) => acc + getMemoryContent(entry).length,
    0
  );
  while (totalMemoryLength > memory_cap && storyData.memory.length > 0) {
    const removed = storyData.memory.shift();
    if (removed) {
      totalMemoryLength -= getMemoryContent(removed).length;
    }
  }
  const info = cleanString(storyDataToString(storyData));
  let context: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: info },
  ];

  // For very first interaction
  if (storyData.scene.parts.length === 1) {
    context.push({
      role: "assistant",
      content: cleanString(storyData.intro),
    });
    context.push({ role: "user", content: cleanString(recentScene) });
  } else {
    // For ongoing stories, dynamically include parts that fit within story_cap
    const recentParts = [...storyData.scene.parts];
    const partsToInclude: typeof recentParts = [];
    let currentStoryLength = 0;

    // Iterate backwards to keep most recent parts
    for (let i = recentParts.length - 1; i >= 0; i--) {
      const part = recentParts[i];
      const content =
        useRawContext && part.raw && !part.user ? part.raw : part.content;
      const partLength = content.length;

      if (currentStoryLength + partLength <= story_cap) {
        partsToInclude.unshift(part);
        currentStoryLength += partLength;
      } else {
        // If we can't fit this part, we stop adding older parts
        break;
      }
    }

    let lastWasToolResponse = false; // Track if last message was a tool response

    partsToInclude.forEach((part) => {
      if (part.user) {
        // If last message was a tool response, add an assistant acknowledgment first
        // This is required by Mistral which doesn't allow user messages after tool messages
        if (lastWasToolResponse) {
          context.push({
            role: "assistant",
            content: "Understood. Processing player action.",
          });
          lastWasToolResponse = false;
        }
        // User message
        context.push({ role: "user", content: cleanString(part.content) });
      } else {
        // Assistant message (with optional tool calls)
        const content = useRawContext && part.raw ? part.raw : part.content;
        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: cleanString(content),
          reasoning: part.reasoning,
          reasoning_details: part.reasoning_details,
        };

        // Include tool calls if present
        // Ensure each tool call has the required 'type: "function"' field (required by Mistral API)
        if (part.toolCalls && part.toolCalls.length > 0) {
          assistantMessage.tool_calls = part.toolCalls.map(
            (tc: {
              id: string;
              type?: string;
              function: { name: string; arguments: string };
              extra_content?: any;
            }) => ({
              id: tc.id,
              type: "function" as const,
              function: tc.function,
              // Preserve extra_content for Google (contains thought_signature for thinking models)
              ...(tc.extra_content ? { extra_content: tc.extra_content } : {}),
            })
          );
        }

        context.push(assistantMessage);
        lastWasToolResponse = false;

        // Add tool responses as separate tool messages
        if (part.toolResponses && part.toolResponses.length > 0) {
          for (const response of part.toolResponses) {
            context.push({
              role: "tool",
              tool_call_id: response.toolCallId || "unknown",
              content: `${
                response.success === true
                  ? "✓"
                  : response.success === "partial"
                  ? "⚠"
                  : "✗"
              } ${response.message}`,
            });
          }
          lastWasToolResponse = true;
        }
      }
    });

    // If last part was tool responses, add acknowledgment before any new user message
    if (lastWasToolResponse) {
      context.push({
        role: "assistant",
        content: "Game state updated. Ready for new content.",
      });
    }
  }

  // Build new user message with command responses and/or user choice
  // This ensures we create a proper user message rather than corrupting the last assistant message
  let newUserMessage = "";

  // Prepend command responses (if any)
  if (commandResponses && commandResponses.length > 0) {
    newUserMessage = formatResponsesForAI(commandResponses); // Already includes trailing \n\n
  }

  // Append user choice (if any)
  if (userChoice) {
    if (newUserMessage) {
      // formatResponsesForAI already ends with \n\n, so just append directly
      newUserMessage += cleanString(userChoice);
    } else {
      newUserMessage = cleanString(userChoice);
    }
  }

  // Add as new user message if we have content
  if (newUserMessage) {
    context.push({ role: "user", content: newUserMessage });
  }

  return {
    messages: context,
    tools: TOOL_SCHEMAS,
  };
}
export function storyDataToString(storyData: StoryData): string {
  let result = `# Story Name: ${storyData.story_name}\n`;
  result += `${storyData.premise}\n`;

  result += `## Player: ${storyData.player_name}\n`;
  result += `${storyData.player_summary}\n\n`;

  result += `## Stats:\n`;
  result +=
    storyData.stats
      .map((stat) => `- ${stat.name}: ${stat.value}% (${stat.description})`)
      .join("\n") + "\n\n";

  result += `## Resources:\n`;
  result +=
    storyData.resources
      .map(
        (resource) =>
          `- ${resource.name}: ${resource.value}/${resource.maxValue} (${resource.description})`
      )
      .join("\n") + "\n\n";

  result += `## Inventory:\n`;
  result +=
    storyData.inventory
      .map((item) => `- ${item.name} x${item.quantity}: ${item.description}`)
      .join("\n") + "\n\n";

  // Relationships - show all tracked relationships with current values
  if (storyData.relationships && storyData.relationships.length > 0) {
    result += `## Relationships:\n`;
    result +=
      storyData.relationships
        .map(
          (rel) =>
            `- ${rel.name} (${rel.value > 0 ? "+" : ""}${rel.value}): ${
              rel.description
            }`
        )
        .join("\n") + "\n\n";
  }

  // Only show locked achievements (available to unlock)
  const lockedAchievements = storyData.achievements.filter(
    (ach) => !ach.dateAchieved
  );
  if (lockedAchievements.length > 0) {
    result += `## Achievements Available to Unlock:\n`;
    result +=
      lockedAchievements
        .map((ach) => `- ${ach.title}: ${ach.ai_hint || ach.description}`)
        .join("\n") + "\n\n";
  }

  result += `## Memory:\n`;
  storyData.memory.forEach((mem) => {
    result += `- ${getMemoryContent(mem)}\n`;
  });

  // Quests
  if (storyData.quests && storyData.quests.length > 0) {
    const activeQuests = storyData.quests.filter(
      (q) => q.active && !q.fulfilled
    );
    const inactiveQuests = storyData.quests.filter(
      (q) => !q.active && !q.fulfilled
    );

    if (activeQuests.length > 0) {
      result += `\n## Active Quests:\n`;
      activeQuests.forEach((quest) => {
        result += `- ${quest.title}: ${quest.description} (${quest.points} points)\n`;
      });
    }

    if (inactiveQuests.length > 0) {
      result += `\n## Inactive Quests (hidden from player, you can activate with /activate_quest):\n`;
      inactiveQuests.forEach((quest) => {
        result += `- ${quest.title}: ${quest.description}\n`;
      });
    }
  }

  // Character Sheet notes - highest priority, always at the top
  const characterSheetLore = storyData.lore.filter(
    (lore) => lore.type === "character_sheet" && lore.enabled !== false
  );
  if (characterSheetLore.length > 0) {
    result += `\n## Character Sheet:\n`;
    characterSheetLore.forEach((lore) => {
      result += `----\n${lore.title}\n${lore.content}\n`;
    });
  }

  // Lore - only include always-on lore or recently triggered lore (last 10 parts)
  const currentPartIndex = storyData.scene.parts.length;
  const activeLore = storyData.lore.filter((lore) => {
    if (lore.type === "character_sheet") return false; // Handled above
    if (lore.on === false || lore.enabled === false) return false; // Explicitly disabled
    if (lore.alwaysOn) return true; // Always include always-on lore
    if (!lore.lastTriggeredIndex)
      return lore.on === true || lore.on === undefined; // Fallback for old lore without tracking
    return currentPartIndex - lore.lastTriggeredIndex <= 10; // Only recent triggers (last 10 parts)
  });
  if (activeLore.length > 0) {
    result += `\n## Lore Entries:\n`;
    activeLore.forEach((lore, index) => {
      result += `----\nLore: ${lore.title}\n${lore.content}\n`;
    });
  }
  result += `\n## Author Notes (AI instructions from the author of the story):\n`;
  if (storyData.author_notes) {
    result += `${storyData.author_notes}\n\n`;
  } else {
    result += "None\n\n";
  }
  result += `## Player Notes (Notes added by the player during the story):\n`;
  if (storyData.player_notes) {
    result += `${storyData.player_notes}\n\n`;
  } else {
    result += "None\n\n";
  }

  console.log("storyDataToString result:", result);
  return result;
}
export function outputToScenePart(text: string): ScenePart {
  // Helper: extract inner text of a simple XML-like block
  const extractBlock = (tag: string, src: string): string | null => {
    // Use String.raw so backslashes are preserved for the RegExp constructor
    const re = new RegExp(String.raw`<${tag}[^>]*>([\s\S]*?)<\/${tag}>`, "i");
    const m = src.match(re);
    if (m?.[1]) return m[1];

    // Fallback: naive search, case-insensitive
    const lower = src.toLowerCase();
    const openTag = `<${tag.toLowerCase()}`;
    const closeTag = `</${tag.toLowerCase()}>`;
    const openIdx = lower.indexOf(openTag);
    if (openIdx === -1) return null;

    const gtIdx = lower.indexOf(">", openIdx);
    if (gtIdx === -1) return null;

    const closeIdx = lower.indexOf(closeTag, gtIdx + 1);
    if (closeIdx === -1) {
      // If no closing tag, but we have an opening tag, return content until the next structured tag
      // This handles streaming or truncated responses and prevents including choices/memory in story
      const remaining = src.substring(gtIdx + 1);
      const nextTagMatch = remaining.match(
        /<\s*(?:memory|choices|commands|thinking|output|story)|!!!/i
      );
      if (nextTagMatch && nextTagMatch.index !== undefined) {
        return remaining.substring(0, nextTagMatch.index).trim();
      }
      return remaining.trim();
    }

    return src.substring(gtIdx + 1, closeIdx).trim();
  };

  // Helper: extract story content even when tags are missing
  const extractStoryContent = (src: string): string => {
    // Try to extract from <output> tags first (new standard)
    const outputBlock = extractBlock("output", src);
    if (outputBlock) return outputBlock;

    // Try to extract from <story> tags (legacy standard)
    const storyBlock = extractBlock("story", src);
    if (storyBlock) return storyBlock;

    // If no <output> or <story> tags, try to extract everything before <memory>, <choices>, or <commands> tags
    const lowerSrc = src.toLowerCase();
    let endIndex = src.length;

    // Find the first occurrence of any structured tag
    const tagMatches = [
      { tag: "<memory", index: lowerSrc.indexOf("<memory") },
      { tag: "<choices", index: lowerSrc.indexOf("<choices") },
      { tag: "<commands", index: lowerSrc.indexOf("<commands") },
      {
        tag: "!!! end chapter !!!",
        index: lowerSrc.indexOf("!!! end chapter !!!"),
      },
      {
        tag: "!!! end story !!!",
        index: lowerSrc.indexOf("!!! end story !!!"),
      },
      {
        tag: "!!! game over !!!",
        index: lowerSrc.indexOf("!!! game over !!!"),
      },
    ].filter((m) => m.index !== -1);

    if (tagMatches.length > 0) {
      endIndex = Math.min(...tagMatches.map((m) => m.index));
    }

    // Extract everything up to that point as story content
    const rawContent = src.substring(0, endIndex).trim();

    // Use stripThinkingTags to clean up any untagged reasoning (like [GM] markers)
    return stripThinkingTags(rawContent);
  };

  const parseChoice = (line: string): Choice => {
    // Extract metadata from angle brackets: <use_skill: ...; use_item: ...; etc>
    const metaMatch = line.match(/<([^>]+)>/);
    const text = line.replace(/\s*<[^>]*>\s*$/, "").trim();

    const choice: Choice = { text };

    if (metaMatch) {
      const metadata = metaMatch[1];

      // Parse use_skill: name (DC number/tier) or (X success(es) needed/required)
      // Supports: "Stealth (DC 25)", "Stealth (hard)", "Stealth (DC hard)", "Stealth (2 successes needed)"
      const skillMatch = metadata.match(
        /use_skill:\s*([^(;]+?)(?:\s*\((?:(?:DC\s*)?(\d+|trivial|easy|average|hard|very_hard|impossible)|(?:needs?\s*)?(\d+)\s*succ(?:ess)?(?:es)?\s*(?:needed|required)?)\))?(?:;|$)/i
      );
      if (skillMatch) {
        const skillName = skillMatch[1].trim();
        if (skillName.toLowerCase() !== "none") {
          choice.skill_used = skillName;
          // Try DC format first (group 2), then success count format (group 3)
          const dc = skillMatch[2] || skillMatch[3];
          if (dc) {
            // If it's a tier name, store as string; parser will convert later
            const numericDC = parseInt(dc, 10);
            if (!isNaN(numericDC)) {
              choice.skill_dc = numericDC;
            } else {
              // Store tier name as string - will be converted to number by game logic
              choice.skill_dc_tier = dc.toLowerCase() as any;
            }
          }
        }
      }

      // Parse use_resource: name (automatically at risk on failure)
      const resourceMatch = metadata.match(/use_resource:\s*([^;]+?)(?:;|$)/i);
      if (resourceMatch) {
        // Strip DC notation like "(DC 6)" and clean up the name
        let resourceName = resourceMatch[1]
          .trim()
          .replace(/\s*\(DC\s*\d+\)/gi, "")
          .replace(
            /\s*\(\d+\s*succ(?:ess)?(?:es)?\s*(?:needed|required)?\)/gi,
            ""
          )
          .trim();
        if (resourceName.toLowerCase() !== "none" && resourceName.length > 0) {
          choice.resource_used = resourceName;
        }
      }

      // Parse use_item: name
      const itemMatch = metadata.match(/use_item:\s*([^;]+?)(?:;|$)/i);
      if (itemMatch) {
        // Strip DC notation like "(DC 6)" and clean up the name
        let itemName = itemMatch[1]
          .trim()
          .replace(/\s*\(DC\s*\d+\)/gi, "")
          .replace(
            /\s*\(\d+\s*succ(?:ess)?(?:es)?\s*(?:needed|required)?\)/gi,
            ""
          )
          .trim();
        if (itemName.toLowerCase() !== "none" && itemName.length > 0) {
          choice.item_used = itemName;
        }
      }

      // Parse item_loss: true/false - DEPRECATED, kept for backward compatibility
      // item_loss was intended to signal if item_used should be consumed
      const lossMatch = metadata.match(/item_loss:\s*(true|false)/i);
      if (lossMatch && lossMatch[1].toLowerCase() === "true") {
        // If item_loss is true and item_used is set, store item name as item_loss
        if (choice.item_used) {
          choice.item_loss = choice.item_used;
        }
      }

      // Parse agmt_check: question (likelihood)
      const agmtCheckMatch = metadata.match(/agmt_check:\s*([^;]+?)(?:;|$)/i);
      if (agmtCheckMatch) {
        const agmtCheck = agmtCheckMatch[1].trim();
        if (agmtCheck.toLowerCase() !== "none") {
          choice.agmt_check = agmtCheck;
        }
      }

      // Parse agmt_table: category
      const agmtTableMatch = metadata.match(/agmt_table:\s*([^;]+?)(?:;|$)/i);
      if (agmtTableMatch) {
        const agmtTable = agmtTableMatch[1].trim();
        if (agmtTable.toLowerCase() !== "none") {
          choice.agmt_table = agmtTable;
        }
      }

      // Parse custom_table: table name
      const customTableMatch = metadata.match(
        /custom_table:\s*([^;]+?)(?:;|$)/i
      );
      if (customTableMatch) {
        const customTable = customTableMatch[1].trim();
        if (customTable.toLowerCase() !== "none") {
          choice.custom_table = customTable;
        }
      }
    }

    return choice;
  };

  const blockToChoiceList = (block: string | null): Choice[] => {
    if (!block) return [];
    return (
      block
        .split(/\r?\n/)
        .map((l) => l.trim())
        // strip common bullet prefixes: -, *, •
        .map((l) => l.replace(/^[\-\*\u2022]\s+/, ""))
        .filter((l) => l.length > 0)
        .map(parseChoice)
    );
  };

  const blockToList = (block: string | null): string[] => {
    if (!block) return [];
    return (
      block
        .split(/\r?\n/)
        .map((l) => l.trim())
        // strip common bullet prefixes: -, *, •
        .map((l) => l.replace(/^[\-\*\u2022]\s+/, ""))
        .filter((l) => l.length > 0)
    );
  };

  const story = extractStoryContent(text);
  const memoryBlock = extractBlock("memory", text);
  const choicesBlock = extractBlock("choices", text);
  const commandsBlock = extractBlock("commands", text);

  const content = story.trim();
  const memoryEntries = blockToList(memoryBlock);
  const choices = blockToChoiceList(choicesBlock);
  const commands = blockToList(commandsBlock);

  // Check for markers
  const endChapter = /!!!\s*END\s+CHAPTER\s*!!!/i.test(text);
  const endStory = /!!!\s*END\s+STORY\s*!!!/i.test(text);
  const gameOver = /!!!\s*GAME\s+OVER\s*!!!/i.test(text);

  const part: ScenePart = {
    content: content,
    imageUrl: "",
    user: false,
    role: "assistant",
    raw: text, // Preserve raw AI output for alternative context building
    ...(memoryEntries.length ? { memoryEntries } : {}),
    ...(choices.length ? { choices } : {}),
    ...(commands.length ? { commands } : {}),
    ...(endChapter ? { endChapter: true } : {}),
    ...(endStory ? { endStory: true } : {}),
    ...(gameOver ? { gameOver: true } : {}),
  };

  return part;
}

// Back-compat alias used by the API route
export const coerceToScenePart = outputToScenePart;
