import {
  ScenePart,
  StoryData,
  Choice,
  UPGRADE_COSTS,
} from "@/app/misc/structs";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface BuildPromptInput {
  storyData: StoryData;
  userChoice?: string;
}

// Cleans text by removing problematic characters and normalizing whitespace
function cleanString(text: string): string {
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

export function buildMessages({
  storyData,
  useRawContext = false,
  maxTokens = 120000,
}: BuildPromptInput & {
  useRawContext?: boolean;
  maxTokens?: number;
}): ChatMessage[] {
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

<memory> (Optional)
- New Memory Entry 1
- New Memory Entry 2
</memory>


<commands> (Optional)
/command1
/command2
</commands>
!!! GAME OVER !!! (Optional to indicate game over)
\`\`\`

IMPORTANT: The <story></story> tags are MANDATORY. Never write story text without wrapping it in <story> tags. All narrative content must be enclosed in <story></story> tags.

Choice Syntax:
- ...Prose <use_skill: skill name (DC Number) or none; use_resource: resource name or none; use_item: item name or none>
Example:
- You carefully sneak past the sleeping dragon. <use_skill: Stealth (DC 50); use_resource: Stamina; use_item: Stamina Potion>

Memory Guidelines:
- The <memory> section is for NEW memory entries that will be ADDED to the existing memory list.
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
- When a choice uses a resource (use_resource), that resource is AUTOMATICALLY at risk if the skill check fails.
- Choose resources that thematically fit the action: use Stamina for running/escaping, Health for combat/dangerous situations, Mana for spellcasting, etc.
- Resource requirements are DYNAMIC based on DC:
  * Required amount: DC ÷ 10 (rounded down, minimum 5)
  * If player has insufficient resource: dice roll receives -DC÷10 penalty (minimum -5)
  * On success: RECOVERS DC ÷ 20 points (minimum 1), capped at max value
  * On failure: loses DC ÷ 10 points (minimum 5)
- Example: DC 120 requires 12 resource points. Insufficient resources = -12 to dice roll. Success recovers 6 points, failure loses 12 points.
- This creates meaningful risk/reward - higher DC actions demand more resources but reward success with recovery.

Guidelines:
- Always provide at least six choices (more is better for player agency).
- Vary choice types: include safe/risky options, creative solutions, social/combat/stealth approaches, and morally ambiguous paths.
- Only reference skills and resources that exist in the game state below - use EXACT names from Stats and Resources sections.
- You can use items that are not in the inventory, but the player rolls at a disadvantage.
- You can use markdown formatting for more immersive experience. But only in the story section.
- Choices should be distinct and lead to different outcomes.
- Incorporate the player's stats, resources, inventory, and achievements into the story and choices.
- Adapt the story based on the player's previous choices and current state.
- DC system: Roll (1-100) + Stat Value ≥ DC. For average stats (~50): DC 50 is trivial, DC 100 is easy, DC 120 is medium, DC 140 is hard, DC 160+ is very hard, DC 200+ is impossible.
- ⚠️ IMPORTANT: Challenge the player! Use DC 120-140 for normal challenges, DC 140-160 for difficult ones, DC 160-180+ for epic moments. Avoid DCs below 100 unless the task is truly trivial.
- Consider player stats when setting DCs: if their relevant stat is 70, a DC of 130-150 creates exciting tension. Match DC to the drama of the moment.
- Balance challenge with narrative flow: not every choice needs a skill check. Include some "automatic success" choices that advance the story.
- Use skill checks for dramatic moments, high-stakes decisions, and character-defining actions.

Item Types:
- normal: Gives advantage when used. Doesn't get consumed on use, but breaks on skill check failure.
- consumable: Gives advantage when used. Gets consumed immediately when used, regardless of success or failure.
- story: Gives advantage when used. Never breaks and never gets consumed. Important quest items.
- misc: Doesn't give advantage, but prevents disadvantage from not having an item. Never breaks or gets consumed.

Commands (EXACT NAME MATCHING APPLIES):

Inventory Commands:
- /add_item: item name | description | type | quantity - Adds a new item to the player's inventory. Type must be: normal, consumable, story, or misc. Example: /add_item: Health Potion | Restores vitality | consumable | 3
- /remove_item: item name | quantity - Removes items from inventory. Use EXACT item name. Example: /remove_item: Health Potion | 2
- /modify_item_quantity: item name | quantity_delta - Changes item quantity by delta (can be negative). Example: /modify_item_quantity: Gold Coins | -50
- /transform_item: old_item | new_item | description | type - Transforms one item into another (upgrades, downgrades, crafting). Example: /transform_item: Rusty Sword | Steel Sword | A well-forged blade | normal

Resource & Stat Commands:
- /add_resource: name | description | current | max - Adds a new resource to the player. Example: /add_resource: Stamina | Physical energy | 100 | 100
- /modify_resource: name | current_delta | max_delta - Modifies existing resource values (can be negative). Example: /modify_resource: Health | -20 | 0
- /remove_resource: name - Removes a resource from the player. Use EXACT resource name.
- /add_stat: name | description | value - Adds a new stat to the player. Example: /add_stat: Charisma | Force of personality | 45
- /modify_stat: name | value_delta - Modifies existing stat value (can be negative). Example: /modify_stat: Strength | 5
- /remove_stat: name - Removes a stat from the player. Use EXACT stat name.

Quest Commands:
- /create_quest: title | short description | full description | points - Creates a new quest and makes it active. Example: /create_quest: Find the Lost Amulet | Locate the ancient amulet | Search the old ruins for the legendary amulet of power | 10
- /activate_quest: quest title - Makes an inactive quest active/visible to the player. Use EXACT title from Quests section.
- /complete_quest: quest title - Marks an active quest as fulfilled and awards points. Use EXACT title from Quests section.
- /deactivate_quest: quest title - Makes an active quest inactive/hidden from the player. Use EXACT title from Quests section.
- /update_quest_description: quest title | new description - Updates the full description of an existing quest. Example: /update_quest_description: Find the Lost Amulet | New evidence suggests the amulet is cursed
- /update_quest_short_description: quest title | new short description - Updates the short description shown in quest list.

Relationship Commands:
- /add_relationship: name | value | description - Adds a new relationship with a character/faction. Value ranges from -100 (enemy) to 100 (ally). Example: /add_relationship: King's Guard | 30 | Respected by the royal guards
- /modify_relationship: name | value_delta - Changes relationship value by delta (can be negative). Example: /modify_relationship: King's Guard | 15
- /remove_relationship: name - Removes a relationship from tracking. Use EXACT name.
- /update_relationship_description: name | new description - Updates the description of an existing relationship. Example: /update_relationship_description: King's Guard | Now trusted advisors to the throne

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

Achievement & Beat Commands:
- /trigger_achievement: achievement title - Triggers/unlocks an existing achievement. ⚠️ CRITICAL: You MUST use the EXACT title from the "Achievements Available to Unlock" section below. Do NOT make up achievement names or paraphrase them. Only trigger achievements that are explicitly listed in the context. Example: /trigger_achievement: First Blood
- /mark_beat: beat index - Marks a story beat as COMPLETE/FULFILLED (past tense). ⚠️ CRITICAL: Only use this command AFTER all events in the beat have concluded in the narrative. Do NOT mark a beat while its events are actively happening. Example: If beat says "infiltrate the castle," mark it AFTER the infiltration is complete, not during. Marking means "this objective is done," not "this is happening now."

Lore Commands:
- /create_lore: title | content | on_triggers | off_triggers - Creates a new lore entry. Triggers are comma-separated keywords. Set on_triggers to empty if lore should be visible from start. Example: /create_lore: The Ancient Order | A secret society of mages | ancient,order,mages | disbanded,destroyed
- /lore_replace_content: lore title | old text | new text - Replaces specific text within an existing lore entry. Use EXACT lore title. Example: /lore_replace_content: The Ancient Order | secret society | powerful organization
- /lore_add_content: lore title | new text - Adds new content on a new line at the bottom of an existing lore entry. Use EXACT lore title. Example: /lore_add_content: The Ancient Order | Their influence spans across the kingdom.
- /lore_delete_content: lore title | text to delete - Removes specific text from an existing lore entry. Use EXACT lore title. Example: /lore_delete_content: The Ancient Order | disbanded

Plot Beat Guidelines:
- Each plot beat represents a significant story milestone with multiple scenes and events.
- The "Current Plot Beat" section shows what needs to be accomplished - read it carefully.
- ⚠️ IMPORTANT: /mark_beat means "this is DONE" (past tense), NOT "this is happening now" (present tense).
- Only use /mark_beat AFTER the player has fully experienced and completed everything described in that beat's content.
- If a beat describes multiple events or objectives, ensure ALL of them happen before marking it complete.
- Beats should feel substantial - don't rush through them. Let the story breathe and develop naturally.
- After marking a beat complete, it moves to "Previous Plot Beat" for context, and the next beat becomes current.
- Reference the "Previous Plot Beat" if you need context about recently completed objectives.

Progression System:
- Players earn upgrade points from story progression and achievements.
- Points are automatically awarded when you use /mark_beat.
- Players spend points in the Upgrades shop to increase stats, expand resource maximums, or add custom items.
- Balance story progression rewards - complete meaningful beats with /mark_beat to grant points for character growth.

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

  // Remove duplicate entries from memory
  let addedItems = new Set<string>();
  const new_memory = storyData.memory.filter((item, index) => {
    if (addedItems.has(item)) {
      return false;
    } else {
      addedItems.add(item);
      return true;
    }
  });
  storyData.memory = new_memory;
  // Trim memory if too large
  let totalMemoryLength = storyData.memory.reduce(
    (acc, entry) => acc + entry.length,
    0
  );
  while (totalMemoryLength > memory_cap && storyData.memory.length > 0) {
    const removed = storyData.memory.shift();
    if (removed) {
      totalMemoryLength -= removed.length;
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

    partsToInclude.forEach((part) => {
      const role = part.user ? "user" : "assistant";
      // Use raw AI output if available and useRawContext is enabled, otherwise use parsed content
      const content =
        useRawContext && part.raw && !part.user ? part.raw : part.content;
      context.push({ role: role, content: cleanString(content) });
    });
  }

  return context;
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

  result += `## Plot Beats:\n`;

  // Find the first unfulfilled beat (current beat)
  const currentBeatIndex = storyData.plot_beats.findIndex(
    (beat) => !beat.fulfilled
  );

  // Show previous beat (most recently completed) for context
  if (currentBeatIndex > 0) {
    const previousBeat = storyData.plot_beats[currentBeatIndex - 1];
    result += `\n### Previous Plot Beat (Recently Completed)\n#### ${currentBeatIndex}. ${previousBeat.title}\n${previousBeat.content}\n`;
  }

  // Show current beat (with full content)
  if (
    currentBeatIndex !== -1 &&
    currentBeatIndex < storyData.plot_beats.length
  ) {
    const currentBeat = storyData.plot_beats[currentBeatIndex];
    result += `\n### Current Plot Beat\n#### ${currentBeatIndex + 1}. ${
      currentBeat.title
    }\n${currentBeat.content}\n`;
  }

  // Show next beat (with full content)
  if (
    currentBeatIndex !== -1 &&
    currentBeatIndex + 1 < storyData.plot_beats.length
  ) {
    const nextBeat = storyData.plot_beats[currentBeatIndex + 1];
    result += `\n### Next Plot Beat\n#### ${currentBeatIndex + 2}. ${
      nextBeat.title
    }\n${nextBeat.content}\n`;
  }

  // Show future beats (just titles)
  if (
    currentBeatIndex !== -1 &&
    currentBeatIndex + 2 < storyData.plot_beats.length
  ) {
    result += `\n### Future Plot Beats:\n`;
    for (let i = currentBeatIndex + 2; i < storyData.plot_beats.length; i++) {
      result += `- ${i + 1}. ${storyData.plot_beats[i].title}\n`;
    }
  }

  result += `## Memory:\n`;
  storyData.memory.forEach((mem, index) => {
    result += `- ${mem}\n`;
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

  // Lore - only include entries that are turned ON
  const activeLore = storyData.lore.filter((lore) => lore.on !== false);
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
    if (closeIdx === -1) return null;
    return src.substring(gtIdx + 1, closeIdx);
  };

  // Helper: extract story content even when tags are missing
  const extractStoryContent = (src: string): string => {
    // Try to extract from <story> tags first
    const storyBlock = extractBlock("story", src);
    if (storyBlock) return storyBlock;

    // If no <story> tags, try to extract everything before <memory>, <choices>, or <commands> tags
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
    return src.substring(0, endIndex).trim();
  };

  const parseChoice = (line: string): Choice => {
    // Extract metadata from angle brackets: <use_skill: ...; use_item: ...; etc>
    const metaMatch = line.match(/<([^>]+)>/);
    const text = line.replace(/\s*<[^>]*>\s*$/, "").trim();

    const choice: Choice = { text };

    if (metaMatch) {
      const metadata = metaMatch[1];

      // Parse use_skill: name (DC number)
      const skillMatch = metadata.match(
        /use_skill:\s*([^(;]+?)(?:\s*\(DC\s*(\d+)\))?(?:;|$)/i
      );
      if (skillMatch) {
        const skillName = skillMatch[1].trim();
        if (skillName.toLowerCase() !== "none") {
          choice.skill_used = skillName;
          if (skillMatch[2]) {
            choice.skill_dc = parseInt(skillMatch[2], 10);
          }
        }
      }

      // Parse use_resource: name (automatically at risk on failure)
      const resourceMatch = metadata.match(/use_resource:\s*([^;]+?)(?:;|$)/i);
      if (resourceMatch) {
        const resourceName = resourceMatch[1].trim();
        if (resourceName.toLowerCase() !== "none") {
          choice.resource_used = resourceName;
        }
      }

      // Parse use_item: name
      const itemMatch = metadata.match(/use_item:\s*([^;]+?)(?:;|$)/i);
      if (itemMatch) {
        const itemName = itemMatch[1].trim();
        if (itemName.toLowerCase() !== "none") {
          choice.item_used = itemName;
        }
      }

      // Parse item_loss: true/false
      const lossMatch = metadata.match(/item_loss:\s*(true|false)/i);
      if (lossMatch) {
        choice.item_loss = lossMatch[1].toLowerCase() === "true";
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
