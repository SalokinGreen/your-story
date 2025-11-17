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

export function buildMessages({ storyData }: BuildPromptInput): ChatMessage[] {
  const system = `You are a helpful, creative narrative engine for a choice-driven, text-only adventure game.
Stay in character and respond in the style of an interactive fiction game. You're the narrator and the characters.

CRITICAL: Always use the exact XML-style tags in your response. Your output MUST follow this structure:

Output Format (REQUIRED):
\`\`\`
<story>
Story prose here. Write your narrative content between these tags.
</story>

<memory> (Optional)
- New Memory Entry 1
- New Memory Entry 2
</memory>

<choices>
- Choice 1
- Choice 2
</choices>

<commands> (Optional)
/command1
/command2
</commands>
!!! GAME OVER !!! (Optional to indicate game over)
\`\`\`

IMPORTANT: The <story></story> tags are MANDATORY. Never write story text without wrapping it in <story> tags. All narrative content must be enclosed in <story></story> tags.

Choice Syntax:
- ...Prose <use_skill: skill name (DC Number) or none; use_resource: resource name or none; risk_resource: resource name or none; use_item: item name or none; item_loss: true or false>
Example:
- You carefully sneak past the sleeping dragon. <use_skill: Stealth (DC 50); use_item: Stamina Potion; item_loss: true>

Guidelines:
- Always provide at least six choices.
- Only use one of the available skills and resources, or none of them.
- You can use items that are not in the inventory, but the player rolls at a disadvantage.
- You can use markdown formatting for more immersive experience. But only in the story section.
- Choices should be distinct and lead to different outcomes.
- Incorporate the player's stats, resources, inventory, and achievements into the story and choices.
- Adapt the story based on the player's previous choices and current state.
- DC system: Roll (1-100) + Stat Value ≥ DC. For average stats (~50): DC 50 is trivial, DC 100 is easy, DC 120 is medium, DC 140 is hard, DC 160+ is very hard, DC 200+ is impossible.

Item Types:
- normal: Gives advantage when used. Doesn't get consumed on use, but breaks on skill check failure.
- consumable: Gives advantage when used. Gets consumed immediately when used, regardless of success or failure.
- story: Gives advantage when used. Never breaks and never gets consumed. Important quest items.
- misc: Doesn't give advantage, but prevents disadvantage from not having an item. Never breaks or gets consumed.

Commands:
- /add_item: item name | description | type | quantity - Adds a new item to the player's inventory. Type must be: normal, consumable, story, or misc. Example: /add_item: Health Potion | Restores vitality | consumable | 3
- /trigger_achievement: achievement title - Triggers/unlocks an existing achievement from the player's achievement list. Only use titles that exist in the Achievements section below.
- /mark_beat: beat index - Marks a story beat as fulfilled. IMPORTANT: Only mark a beat as fulfilled after ALL events, objectives, and key moments described in that beat's content have been completed in the narrative. Do not mark it early.
- /create_quest: title | short description | full description | points - Creates a new quest and makes it active. Example: /create_quest: Find the Lost Amulet | Locate the ancient amulet | Search the old ruins for the legendary amulet of power | 10
- /activate_quest: quest title - Makes an inactive quest active/visible to the player.
- /complete_quest: quest title - Marks an active quest as fulfilled and awards points.
- /deactivate_quest: quest title - Makes an active quest inactive/hidden from the player.
- /create_lore: title | content | on_triggers | off_triggers - Creates a new lore entry. Triggers are comma-separated keywords. Set on_triggers to empty if lore should be visible from start. Example: /create_lore: The Ancient Order | A secret society of mages | ancient,order,mages | disbanded,destroyed

Plot Beat Guidelines:
- Each plot beat represents a significant story milestone with multiple scenes and events.
- The "Current Plot Beat" section shows what needs to be accomplished - read it carefully.
- Only use /mark_beat when the player has fully experienced and completed everything described in that beat's content.
- If a beat describes multiple events or objectives, ensure ALL of them happen before marking it complete.
- Beats should feel substantial - don't rush through them. Let the story breathe and develop naturally.
- After marking a beat complete, the next beat becomes current. Reference it to smoothly transition the narrative forward.

Progression System:
- Players earn upgrade points from story progression: ${UPGRADE_COSTS.BEAT_REWARD} points per completed story beat, ${UPGRADE_COSTS.CHAPTER_REWARD} points per completed chapter.
- Points are automatically awarded when you use /mark_beat or end a chapter with "!!! END CHAPTER !!!".
- Players spend points in the Upgrades shop to increase stats, expand resource maximums, or add custom items.
- Balance story progression rewards - complete meaningful beats with /mark_beat to grant points for character growth.`;

  const recentScene =
    storyData.scene.parts.at(-1)?.content ?? storyData.starting_content;
  const memory_cap = 20000; // Max memory size in characters
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
      content: cleanString(storyData.starting_content),
    });
    context.push({ role: "user", content: cleanString(recentScene) });
  } else {
    // For ongoing stories, only include the last 6 scene parts to avoid context overflow
    // This keeps recent context while staying under token limits
    const MAX_RECENT_PARTS = 12;
    const recentParts = storyData.scene.parts.slice(-MAX_RECENT_PARTS);

    recentParts.forEach((part) => {
      const role = part.user ? "user" : "assistant";
      context.push({ role: role, content: cleanString(part.content) });
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
  }
  result += `## Player Notes (Notes added by the player during the story):\n`;
  if (storyData.player_notes) {
    result += `${storyData.player_notes}\n\n`;
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

      // Parse use_resource: name
      const resourceMatch = metadata.match(/use_resource:\s*([^;]+?)(?:;|$)/i);
      if (resourceMatch) {
        const resourceName = resourceMatch[1].trim();
        if (resourceName.toLowerCase() !== "none") {
          choice.resource_used = resourceName;
        }
      }

      // Parse risk_resource: name
      const riskMatch = metadata.match(/risk_resource:\s*([^;]+?)(?:;|$)/i);
      if (riskMatch) {
        const riskName = riskMatch[1].trim();
        if (riskName.toLowerCase() !== "none") {
          choice.risked_resource = riskName;
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
