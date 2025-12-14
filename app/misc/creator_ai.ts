import {
  StoryData,
  StartingChoice,
  Ability,
  Achievement,
  StoryLore,
  Quest,
  Relationship,
  Condition,
  Variable,
  SkillTree,
  CustomTable,
  Preset,
  getMemoryContent,
} from "@/app/misc/structs";
import { ChatMessage } from "@/app/misc/ai";
import { getCreatorToolsForAPI } from "@/app/misc/creator_tools";

export interface CreatorAIInput {
  messages: ChatMessage[];
  currentStoryData: Partial<StoryData>;
  adventureMetadata?: {
    title?: string;
    shortDescription?: string;
    description?: string;
    startingChoices?: StartingChoice[];
  };
}

/**
 * Formats StoryData as readable markdown for AI context.
 * Replaces JSON.stringify for better AI comprehension.
 */
export function formatStoryDataAsMarkdown(data: Partial<StoryData>): string {
  const sections: string[] = [];

  // Basic info
  if (data.story_name || data.premise || data.characterSheet) {
    const basic: string[] = ["## Basic Info"];
    if (data.story_name) basic.push(`- **Story Name:** ${data.story_name}`);
    if (data.premise) basic.push(`- **Premise:** ${data.premise}`);
    if (data.intro)
      basic.push(
        `- **Intro:** ${data.intro.substring(0, 200)}${
          data.intro.length > 200 ? "..." : ""
        }`
      );
    if (data.author_notes)
      basic.push(`- **Author Notes:** ${data.author_notes}`);
    sections.push(basic.join("\n"));
  }

  // Character Sheet
  if (data.characterSheet) {
    sections.push("## Character Sheet\n" + data.characterSheet);
  }

  // Points
  const progression: string[] = [];
  if (data.points !== undefined && data.points > 0)
    progression.push(`- **Points:** ${data.points}`);
  if (progression.length > 0) {
    sections.push("## Progression\n" + progression.join("\n"));
  }

  // Game settings
  const settings: string[] = [];
  if (data.rpgSystem) settings.push(`- **RPG System:** ${data.rpgSystem}`);
  if (data.difficulty) settings.push(`- **Difficulty:** ${data.difficulty}`);
  if (data.max_chapters)
    settings.push(`- **Max Chapters:** ${data.max_chapters}`);
  if (data.nsfw !== undefined)
    settings.push(`- **NSFW:** ${data.nsfw ? "Yes" : "No"}`);
  if (settings.length > 0) {
    sections.push("## Game Settings\n" + settings.join("\n"));
  }

  // NOTE: Abilities section removed - abilities are deprecated and should be in character_sheet lore

  // Achievements
  if (data.achievements && data.achievements.length > 0) {
    const achievementsSection = ["## Achievements"];
    data.achievements.forEach((ach: Achievement) => {
      const status = ach.dateAchieved ? "✓ Unlocked" : "○ Locked";
      const hiddenStr = ach.hidden ? " [Hidden]" : "";
      achievementsSection.push(
        `- **${ach.title}** (${ach.points} pts) ${status}${hiddenStr} ${
          ach.symbol || ""
        }`
      );
      if (ach.description) achievementsSection.push(`  - ${ach.description}`);
      if (ach.ai_hint)
        achievementsSection.push(`  - *AI Hint:* ${ach.ai_hint}`);
      if (ach.rewardDescription)
        achievementsSection.push(`  - Reward: ${ach.rewardDescription}`);
    });
    sections.push(achievementsSection.join("\n"));
  }

  // Lore
  if (data.lore && data.lore.length > 0) {
    const loreSection = ["## Lore Entries"];
    data.lore.forEach((lore: StoryLore) => {
      const statusStr =
        lore.on === false ? " [OFF]" : lore.alwaysOn ? " [Always On]" : "";
      const secretStr = lore.secrtet ? " [Secret]" : "";
      loreSection.push(`### ${lore.title}${statusStr}${secretStr}`);
      loreSection.push(lore.content);
      if (lore.on_triggers?.length)
        loreSection.push(`- *On Triggers:* ${lore.on_triggers.join(", ")}`);
      if (lore.off_triggers?.length)
        loreSection.push(`- *Off Triggers:* ${lore.off_triggers.join(", ")}`);
      if (lore.var_on_triggers?.length)
        loreSection.push(
          `- *Variable On Triggers:* ${lore.var_on_triggers.join(", ")}`
        );
      if (lore.var_off_triggers?.length)
        loreSection.push(
          `- *Variable Off Triggers:* ${lore.var_off_triggers.join(", ")}`
        );
      if (lore.trigger_lores?.length)
        loreSection.push(
          `- *Triggered By Lore:* ${lore.trigger_lores.join(", ")}`
        );
      loreSection.push(""); // Empty line between entries
    });
    sections.push(loreSection.join("\n"));
  }

  // Quests
  if (data.quests && data.quests.length > 0) {
    const questsSection = ["## Quests"];
    data.quests.forEach((quest: Quest) => {
      const status = quest.fulfilled
        ? "✓ Complete"
        : quest.active
        ? "○ Active"
        : "- Inactive";
      questsSection.push(
        `- **${quest.title}** (${quest.points} pts) ${status}`
      );
      questsSection.push(`  - ${quest.shortDescription}`);
      if (quest.description !== quest.shortDescription) {
        questsSection.push(`  - *Details:* ${quest.description}`);
      }
    });
    sections.push(questsSection.join("\n"));
  }

  // Relationships
  if (data.relationships && data.relationships.length > 0) {
    const relSection = ["## Relationships"];
    data.relationships.forEach((rel: Relationship) => {
      const sentiment =
        rel.value > 50 ? "Positive" : rel.value < -50 ? "Negative" : "Neutral";
      relSection.push(
        `- **${rel.name}:** ${rel.value} (${sentiment}) ${rel.symbol || ""}`
      );
      if (rel.description) relSection.push(`  - ${rel.description}`);
    });
    sections.push(relSection.join("\n"));
  }

  // Conditions
  if (data.conditions && data.conditions.length > 0) {
    const condSection = ["## Active Conditions"];
    data.conditions.forEach((cond: Condition) => {
      const permStr = cond.permanent ? " [Permanent]" : "";
      const affectsStr = cond.affectsAll
        ? "All checks"
        : cond.affects.join(", ");
      condSection.push(`- **${cond.name}** Tier ${cond.tier}${permStr}`);
      condSection.push(`  - ${cond.description}`);
      condSection.push(`  - Affects: ${affectsStr}`);
      if (cond.source) condSection.push(`  - Source: ${cond.source}`);
    });
    sections.push(condSection.join("\n"));
  }

  // Variables
  if (data.variables && data.variables.length > 0) {
    const varsSection = ["## Variables"];
    data.variables.forEach((v: Variable) => {
      let valueStr: string;
      if (v.type === "list") {
        valueStr = v.items.length > 0 ? v.items.join(", ") : "(empty list)";
      } else {
        valueStr = String(v.value);
      }
      varsSection.push(`- **${v.name}** [${v.type}]: ${valueStr}`);
      if (v.description) varsSection.push(`  - ${v.description}`);
    });
    sections.push(varsSection.join("\n"));
  }

  // Custom Tables
  if (data.customTables && data.customTables.length > 0) {
    const tablesSection = ["## Custom Tables"];
    data.customTables.forEach((table: CustomTable) => {
      tablesSection.push(`### ${table.name}`);
      if (table.description) tablesSection.push(`*${table.description}*`);
      table.entries.forEach((entry) => {
        tablesSection.push(`- ${entry.text} (weight: ${entry.weight})`);
      });
      tablesSection.push("");
    });
    sections.push(tablesSection.join("\n"));
  }

  // Skill Trees
  if (data.skillTrees && data.skillTrees.length > 0) {
    const treesSection = ["## Skill Trees"];
    data.skillTrees.forEach((tree: SkillTree) => {
      treesSection.push(`### ${tree.name} ${tree.symbol || ""}`);
      if (tree.description) treesSection.push(`*${tree.description}*`);
      treesSection.push(`Nodes (${tree.nodes.length} total):`);
      tree.nodes.forEach((node) => {
        const prereqs =
          node.prerequisites.length > 0
            ? ` (requires: ${node.prerequisites.join(", ")})`
            : " (root)";
        treesSection.push(`- **${node.name}** [${node.type}]${prereqs}`);
        if (node.description) treesSection.push(`  - ${node.description}`);
        node.effects.forEach((effect) => {
          if (effect.type === "stat_bonus") {
            treesSection.push(`  - Effect: +${effect.value} ${effect.target}`);
          } else if (effect.type === "resource_bonus") {
            treesSection.push(
              `  - Effect: +${effect.value} max ${effect.target}`
            );
          } else if (effect.type === "grant_ability") {
            treesSection.push(`  - Effect: Grants ability "${effect.target}"`);
          } else if (effect.type === "grant_item") {
            treesSection.push(
              `  - Effect: Grants item "${effect.target}" x${
                effect.quantity || 1
              }`
            );
          } else if (effect.type === "passive") {
            treesSection.push(`  - Effect: Passive - ${effect.target}`);
          }
        });
      });
      treesSection.push("");
    });
    sections.push(treesSection.join("\n"));
  }

  // Unlocked nodes
  if (data.unlockedNodes && data.unlockedNodes.length > 0) {
    sections.push(`## Unlocked Skill Nodes\n${data.unlockedNodes.join(", ")}`);
  }

  // Presets
  if (data.presets && data.presets.length > 0) {
    const presetsSection = ["## Character Presets"];
    data.presets.forEach((preset: Preset) => {
      presetsSection.push(`### ${preset.name} ${preset.icon || ""}`);
      presetsSection.push(`*${preset.description}*`);
      if (preset.characterSheet)
        presetsSection.push(
          `- Character sheet: ${preset.characterSheet.substring(0, 200)}${
            preset.characterSheet.length > 200 ? "..." : ""
          }`
        );
      if (preset.abilities && preset.abilities.length > 0) {
        presetsSection.push(
          `- Starting abilities: ${preset.abilities
            .map((a) => a.name)
            .join(", ")}`
        );
      }
      if (preset.authorNotes)
        presetsSection.push(`- *Author notes:* ${preset.authorNotes}`);
      presetsSection.push("");
    });
    sections.push(presetsSection.join("\n"));
  }

  // Leveling Settings
  if (data.levelingSettings) {
    const ls = data.levelingSettings;
    const levelingSection = ["## Leveling Settings"];
    if (ls.xpBase !== undefined)
      levelingSection.push(`- XP Base: ${ls.xpBase}`);
    if (ls.levelCap !== undefined)
      levelingSection.push(`- Level Cap: ${ls.levelCap}`);
    if (ls.defaultUpgradesPerLevel !== undefined) {
      levelingSection.push(
        `- Default Upgrades Per Level: ${ls.defaultUpgradesPerLevel} (1 upgrade = 1 skill tree node)`
      );
    }
    if (ls.useCustomCurve && ls.customCurve?.length) {
      levelingSection.push(
        `- Custom XP Curve: ${ls.customCurve
          .map((c) => `Lvl ${c.level}: ${c.cumulativeXP} XP`)
          .join(", ")}`
      );
    }
    if (ls.upgradeOverrides?.length) {
      levelingSection.push(
        `- Upgrade Overrides: ${ls.upgradeOverrides
          .map((o) => `Lvl ${o.level}: ${o.upgrades} upgrades`)
          .join(", ")}`
      );
    }
    if (ls.startingUpgrades) {
      const starts = Object.entries(ls.startingUpgrades)
        .map(([d, u]) => `${d}: ${u}`)
        .join(", ");
      levelingSection.push(`- Starting Upgrades by Difficulty: ${starts}`);
    }
    sections.push(levelingSection.join("\n"));
  }

  // Progress info (simplified - removed XP/level/upgrades)
  const progress: string[] = [];
  if (data.points !== undefined && data.points > 0)
    progress.push(`- **Points:** ${data.points}`);
  if (data.currentChapter !== undefined)
    progress.push(`- **Current Chapter:** ${data.currentChapter}`);
  if (progress.length > 0) {
    sections.push("## Current Progress\n" + progress.join("\n"));
  }

  // Memory (truncated for context)
  if (data.memory && data.memory.length > 0) {
    const memorySection = ["## Memory Entries"];
    const memories = data.memory.slice(-10); // Last 10 memories
    if (data.memory.length > 10) {
      memorySection.push(
        `*(Showing last 10 of ${data.memory.length} entries)*`
      );
    }
    memories.forEach((mem) => {
      memorySection.push(`- ${getMemoryContent(mem)}`);
    });
    sections.push(memorySection.join("\n"));
  }

  // AGMT State
  if (data.agmtState) {
    const agmt = data.agmtState;
    const agmtSection = ["## AGMT State (Advanced Game Master Tools)"];
    agmtSection.push(`- Chaos Factor: ${agmt.chaosFactor}`);
    agmtSection.push(`- Scene Count: ${agmt.sceneCount}`);
    sections.push(agmtSection.join("\n"));
  }

  // Game Over state
  if (data.gameOver) {
    sections.push(
      `## Game Over\n- Reason: ${data.gameOver.reason}${
        data.gameOver.condition
          ? `\n- Caused by: ${data.gameOver.condition}`
          : ""
      }`
    );
  }

  // Starting choices
  if (data.starting_choices && data.starting_choices.length > 0) {
    const choicesSection = ["## Starting Choices"];
    data.starting_choices.forEach((choice, i) => {
      choicesSection.push(`${i + 1}. "${choice.text}"`);
      if (choice.intro_override)
        choicesSection.push(
          `   - Custom intro: ${choice.intro_override.substring(0, 100)}...`
        );
      if (choice.skill_used)
        choicesSection.push(
          `   - Skill check: ${choice.skill_used} DC ${choice.skill_dc || "?"}`
        );
      if (choice.resource_used)
        choicesSection.push(`   - Resource: ${choice.resource_used}`);
      if (choice.item_used)
        choicesSection.push(
          `   - Item: ${choice.item_used}${
            choice.item_loss ? " (consumed)" : ""
          }`
        );
    });
    sections.push(choicesSection.join("\n"));
  }

  return sections.join("\n\n");
}

export function buildCreatorMessages({
  messages,
  currentStoryData,
  adventureMetadata,
}: CreatorAIInput): ChatMessage[] {
  // Clean up deprecated fields from lore entries before sending to AI
  const cleanedStoryData = { ...currentStoryData };
  if (cleanedStoryData.lore && Array.isArray(cleanedStoryData.lore)) {
    cleanedStoryData.lore = cleanedStoryData.lore.map((loreEntry) => {
      const { relatedCharacters, relatedLocations, keys, ...cleanEntry } =
        loreEntry as any;
      return cleanEntry;
    });
  }

  const systemPrompt = `You are an expert Game Designer and Creative Writer assistant.
Your goal is to help the user design a text adventure game scenario.
You can brainstorm ideas, write content, and most importantly, GENERATE SCENARIO DATA.

**STYLE RULE: Do NOT use emojis in any content you generate.** Use :icon: syntax for icons (e.g., :sword:, :fire:, :shield:), or text symbols where appropriate. Emojis look unprofessional in game content.

When the user asks you to create or modify parts of the scenario (like "create a dragon boss", "make a sci-fi setting", "add a healing potion"), you MUST include a JSON block in your response containing the structured data.

### JSON Structure Rules:
- The JSON block must be valid JSON.
- It should be wrapped in \`\`\`json ... \`\`\` code blocks.
- **CRITICAL: You may only include ONE JSON block per response.** All changes must be combined into a single JSON object. The app cannot process multiple JSON blocks.
- You can return a PARTIAL StoryData object. Only include the fields you want to change or add.
- **CRITICAL: ONLY include fields the user EXPLICITLY requested.** Do NOT add extra fields "for convenience" or "best practice". If user asks for skill trees, ONLY output skillTrees. Do NOT also output upgradeSettings or anything else unless specifically asked.
- Arrays (like 'lore', 'achievements', 'quests', 'presets', 'variables', 'relationships', 'customTables') in your JSON will be MERGED with the existing data by default.
- Scalar fields (like 'story_name', 'premise', 'characterSheet', 'title', 'shortDescription', 'description') will be REPLACED.

### IMPORTANT: Item Commands
You can control how items in arrays are applied using the **_command** field:

- **"merge"** (default): Merge properties with existing item of same name/title/id, or add if new
- **"replace"**: Completely replace the existing item (all old properties removed, new properties only)
- **"delete"**: Remove the item from the adventure entirely
- **"add"**: Always add as new item, even if name/title/id already exists

**When to use each command:**
- Use **"merge"** (or omit _command) when updating specific properties of an existing item
- Use **"replace"** when completely redesigning an item from scratch
- Use **"delete"** when removing outdated, unwanted, or duplicate items
- Use **"add"** when you want to ensure a new item is created (even if name matches existing)

**Command Examples:**

\`\`\`json
{
  "lore": [
    {
      "title": "The Ancient Tower",
      "content": "A mysterious tower that appeared overnight...",
      "secret": false,
      "_command": "add"
    },
    {
      "title": "Old Lore Entry",
      "_command": "delete"
    }
  ],
  "quests": [
    {
      "title": "Main Quest",
      "description": "Updated quest description",
      "_command": "replace"
    }
  ]
}
\`\`\`

**Important Notes:**
- For items WITHOUT _command, the default behavior is "merge" (update if exists, add if new)
- To ADD new items to an array, ONLY list the NEW items. DO NOT include existing items unless you want to modify/delete them.
- To MODIFY existing items: List an item with the SAME 'name' (or 'title' or 'id') as an existing one, and your new values will merge/replace based on _command.
- **For DELETE commands:** You MUST include the identifier field (name/title/id) along with "_command": "delete". Example: {"id": "old_field", "_command": "delete"} NOT just {"_command": "delete"}
- Example: If there are 3 lore entries already and user asks to "add a new location", your JSON should ONLY contain the new lore entry, not all 4 entries.
- When user says "delete X" or "remove X", use: {"name": "x", "_command": "delete"}
- When user says "replace X with Y" or "redesign X", use "_command": "replace" for item X.

### Available Fields:

**Adventure-Level Fields** (set these to update the adventure's public-facing information):
- title (string) - The adventure's title shown in the explorer/library
- shortDescription (string) - Brief 1-2 sentence description for adventure cards (max ~100 chars)
- description (string) - Full multi-paragraph description of the adventure shown on the adventure detail page

**StoryData Fields** (these define the actual gameplay scenario):
- story_name (string) - The in-game story title (shown to player during gameplay)
- premise (string) - Story premise/conflict summary
- characterSheet (string) - The player's filled character sheet in markdown format (stats, abilities, backstory, etc.)
- intro (string) - Opening narrative text shown at game start
- author_notes (string) - Private instructions/notes for the AI narrator
- variables (Array of variable objects) - **IMPORTANT: Custom state tracking for counters, flags, strings, and lists**. Four types:
  - **Number Variables**: { id, name, description, type: "number", value, minValue?, maxValue? }
    - id: Unique identifier (e.g., "var_gold", "var_time")
    - name: Display name (e.g., "Gold", "Time of Day", "Days Worked")
    - description: What this variable tracks
    - type: "number" (required - must be exactly this string)
    - value: Current numeric value
    - minValue: Optional minimum (e.g., 0)
    - maxValue: Optional maximum (e.g., 100)
  - **Boolean Variables**: { id, name, description, type: "boolean", value }
    - id: Unique identifier (e.g., "var_night", "var_wanted")
    - name: Display name (e.g., "Is Night", "Is Wanted")
    - description: What this flag represents
    - type: "boolean" (required - must be exactly this string)
    - value: true or false
  - **String Variables**: { id, name, description, type: "string", value, options? }
    - id: Unique identifier (e.g., "var_current_day", "var_location")
    - name: Display name (e.g., "Current Day", "Current Location")
    - description: What this variable tracks
    - type: "string" (required - must be exactly this string)
    - value: Current string value
    - options: Optional array of predefined choices (e.g., ["Monday", "Tuesday", "Wednesday", ...] or ["Tavern", "Market", "Castle"])
  - **List Variables**: { id, name, description, type: "list", items, maxSize? }
    - id: Unique identifier (e.g., "var_spells")
    - name: Display name (e.g., "Known Spells", "Collected Items")
    - description: What this list contains
    - type: "list" (required - must be exactly this string)
    - items: Array of strings
    - maxSize: Optional max items
- lore (Array of { title, content, secrtet, on, alwaysOn, on_triggers, off_triggers, trigger_lores, untrigger_lores, var_on_triggers, var_off_triggers })
  - title: Lore entry title
  - content: Full lore text (see THREAT PROFILES below for combat encounters)
  - secrtet: If true, lore starts hidden and must be revealed
  - on: Whether lore is currently visible (true = visible to AI/player, false = hidden)
  - alwaysOn: If true, lore is always visible and ignores all triggers
  - on_triggers: Array of trigger words/phrases - when these appear in story, lore becomes visible
  - off_triggers: Array of trigger words/phrases - when these appear in story, lore becomes hidden
  - trigger_lores: Array of lore titles - when those lores become visible, this lore becomes visible
  - untrigger_lores: Array of lore titles - when those lores become visible, this lore becomes hidden
  - var_on_triggers: Array of boolean variable names - when variable is true, lore becomes visible
  - var_off_triggers: Array of boolean variable names - when variable is true, lore becomes hidden

  **THREAT PROFILES IN LORE (IMPORTANT):**
  When creating lore entries for enemies, monsters, or dangerous NPCs, include a **Threat Profile** section that documents:
  1. **Challenge Difficulty**: How hard is this threat overall? (Easy/Medium/Hard/Boss)
  2. **Approach DCs**: What skills work against this threat and at what difficulty?
     - Example: "Combat (hard), Persuasion (very_hard), Stealth (average)"
  3. **Per-Failure Condition**: What condition does the threat inflict on failed checks?
     - Name the condition and its tier: "Slash Wound (Tier II)", "Psychic Trauma (Tier III)"
  4. **Challenge Loss Stakes**: If player loses an extended challenge, what happens?
     - Example: "Defeat inflicts Broken Body (Tier IV) and capture"
  
  **Example Threat Lore Entry:**
  Title: "Guard Captain Marcus"
  Content: "Marcus is the ruthless captain of the city guard, known for his brutal efficiency...
  
  **Threat Profile:**
  - Challenge Difficulty: Hard (best of 5)
  - Combat DC: hard, Persuasion DC: very_hard, Stealth DC: average (to avoid)
  - Per-Failure Condition: Sword Wound (Tier II) - upgrades to Tier III, IV on repeated failures
  - Challenge Loss: Deep Wound (Tier IV) + arrested and imprisoned"
  
  This allows the AI narrator to consistently apply consequences during gameplay.
- relationships (Array of { name, value, description, symbol })
  - name: Character, faction, or organization name
  - value: Relationship level from -100 (hostile enemy) to +100 (strong ally)
  - description: Current state/context of the relationship
  - symbol: Icon name as words (e.g., "heart", "skull", "shield", "handshake")
- achievements (Array of { title, description, points, symbol, ai_hint })
  - title: Achievement name
  - description: Public description shown to player
  - points: Points awarded when unlocked
  - symbol: Icon name as words (e.g., "trophy", "crown", "star", "medal")
  - ai_hint: (Optional) Precise trigger conditions for the AI to award this achievement
- quests (Array of { title, shortDescription, description, points, active, fulfilled })
  - title: Quest name
  - shortDescription: Brief summary for quest list
  - description: Full quest details and objectives
  - points: Points awarded upon completion
  - active: Whether quest is currently visible/active
  - fulfilled: Whether quest has been completed
- presets (Array of { id, name, description, icon, playerName, playerSummary, abilities, authorNotes })
  - id: Unique identifier (use "preset-" + timestamp for new ones)
  - name: Preset display name
  - description: What this preset/build represents
  - icon: Icon name as words (e.g., "knight", "wizard", "rogue")
  - playerName: Default character name for this preset
  - playerSummary: Character background for this preset
  - intro: Unique opening narrative for this preset
  - abilities: Array of starting abilities for this preset
  - authorNotes: Private notes about this preset
- upgradeSettings (Object with upgrade shop configuration) - **NOTE: Prefer skillTrees over upgradeSettings for progression**
  - enabled: Boolean - master toggle for the entire upgrade system
  - abilityShopEnabled: Boolean - whether ability shop is available
  - abilityShop: Array of { name, description, grade, cost, abilityCost, cooldown, symbol } - abilities players can unlock
    - name: Ability name
    - description: What the ability does
    - grade: "novice", "apprentice", "adept", "expert", "master", "legendary"
    - cost: Progression points required to unlock
    - abilityCost: Array of { type, name, amount } - variable costs to use
    - cooldown: Turns until can be used again (0 = no cooldown)
    - symbol: Emoji/icon
- agmtState (Object with Advanced RPG Tools state - if provided, AGMT system will be enabled for this adventure)
  - chaosFactor: Number 1-9 representing narrative chaos/unpredictability
  - sceneCount: Number >= 0 tracking scenes played
  - threads: Array of { id, description, status } - narrative threads
    - id: Unique identifier (auto-generated if omitted)
    - description: What this thread represents
    - status: "active" | "closed"
  - characters: Array of { id, name, description, status } - NPCs/characters
    - id: Unique identifier (auto-generated if omitted)
    - name: Character name
    - description: Character details
    - status: "active" | "deceased" | "departed"
- customTables (Array of { id, name, description, entries }) - Random tables for gameplay variety
  - id: Unique identifier (use "table-" + timestamp for new ones)
  - name: Table name (e.g., "Weather Conditions", "Random Encounters", "Treasure Loot")
  - description: What this table is used for
  - entries: Array of { text, weight } - possible results when rolling on the table
    - text: The result text that will be shown/used
    - weight: Probability weight (higher numbers = more likely to be selected). Default is 1.
- skillTrees (Array of { id, name, description, symbol, nodes }) - **Skill trees for character progression**. When skill trees are defined, they REPLACE the simple upgrade system (stat/resource/item upgrades).
  - id: Unique identifier for the tree (e.g., "warrior-path", "arcane-studies")
  - name: Display name (e.g., "Warrior's Path", "Arcane Studies", "Shadow Arts")
  - description: What this skill tree represents
  - symbol: Icon name as words (e.g., "sword", "magic-swirl", "shadow")
  - nodes: Array of skill tree nodes (see below)
  
  **Skill Tree Node Structure** (each node in the nodes array):
  - id: Unique identifier within this tree (e.g., "power-strike", "fireball")
  - name: Display name of the node
  - description: What this node grants
  - symbol: Icon name as words (e.g., "fireball", "shield", "running")
  - type: "stat" | "ability" | "item" | "passive" | "resource" - determines the node's primary effect type
  - position: { x: number, y: number } - Visual position (0-100 normalized coordinates). Root nodes should be at y: 10-20, with children below them.
  - prerequisites: Array of node IDs that must be unlocked first (empty array = root node, always unlockable first)
  - effects: Array of effects this node grants when unlocked:
    - Stat bonus: { type: "stat_bonus", target: "StatName", value: number }
    - Resource bonus: { type: "resource_bonus", target: "ResourceName", value: number } (increases max)
    - Grant ability: { type: "grant_ability", target: "AbilityName", abilityData: { full ability object } }
    - Grant item: { type: "grant_item", target: "ItemName", quantity: number, itemData: { full item object } }
    - Passive: { type: "passive", target: "PassiveName: Description of passive effect" }
  
  **Skill Tree Design Guidelines:**
  - Each tree should have 1-3 root nodes (prerequisites: []) at the top
  - Arrange nodes in a tree structure flowing downward (higher y = lower on screen)
  - Space nodes horizontally (x: 0-100) to prevent overlap
  - Use prerequisites to create meaningful progression paths
  - A single node can have multiple effects (e.g., stat bonus AND passive)
  - Trees should be thematic (combat tree, magic tree, stealth tree, etc.)
  - Consider having 5-15 nodes per tree for meaningful progression
  - **When skillTrees are defined, simple upgrade shop sections are automatically hidden in the UI** - you do NOT need to set upgradeSettings.enabled = false, the system handles this automatically
  - When asked to create skill trees, ONLY output skillTrees - do NOT also modify upgradeSettings
- startingChoices (Array of { text, intro_override, skill_used, skill_dc, resource_used, item_used, item_loss, ability_used, agmt_check, agmt_context_only, agmt_table, custom_table }) - Custom starting choices instead of default "Start Story" button
  - text: The choice text displayed to player (required)
  - intro_override: Optional alternate intro text for this path (if empty, uses main intro)
  - skill_used: Optional skill name for skill check on this choice
  - skill_dc: Difficulty tier ("trivial" | "easy" | "average" | "hard" | "very_hard" | "impossible") for the skill check (required if skill_used is set)
  - resource_used: Optional resource name for resource cost
  - item_used: Optional item name that this choice requires
  - item_loss: Boolean - whether the item is consumed when used (default false)
  - ability_used: Optional ability name to use on this choice (will check/deduct costs and apply cooldown)
  - agmt_check: Optional AGMT fate check question in format "Question (Likelihood)" e.g., "Is the guard asleep? (Likely)"
  - agmt_context_only: Boolean - when true with skill_used, agmt provides context only (doesn't override skill check result)
  - agmt_table: Optional AGMT table to roll on (e.g., "action", "subject", "character_descriptors", "locations", "plot_twists")
  - custom_table: Optional custom table name to roll on
- levelingSettings (Object with leveling curve and upgrade point configuration)
  - xpBase: Number (default 100) - Base multiplier for XP requirements. Higher = slower leveling.
  - levelCap: Number (default 100) - Maximum level players can reach.
  - defaultUpgradesPerLevel: Number (default 1) - Upgrade points granted per level up. **Each upgrade point unlocks ONE skill tree node**, so 1 point/level is standard. For faster progression, use 2-3 points/level.
  - useCustomCurve: Boolean - When true, use customCurve instead of quadratic formula. MUST set to true when providing customCurve.
  - customCurve: Array of { level: number, cumulativeXP: number } - Custom XP thresholds for each level. Level is the target level (2+), cumulativeXP is total XP needed to reach that level. Example: [{ level: 2, cumulativeXP: 100 }, { level: 3, cumulativeXP: 300 }]
  - upgradeOverrides: Array of { level, upgrades } - Override upgrade points for specific levels (e.g., milestone bonus points at level 10).
  - startingUpgrades: Object { easy?: number, medium?: number, hard?: number, expert?: number } - Starting upgrade points per difficulty. Since 1 point = 1 skill tree node, giving 5-10 starting points lets players customize their build immediately.

Notes:
- **ICONS**: Use the 'symbol' field with descriptive WORDS like "heart", "sword", "shield", "fire", "brain", "lightning", "coin", "skull", "potion", "book", "eye", "moon" - NOT emoji characters. We fuzzy-match these words to our icon library automatically. Examples: "broken-heart" for loss, "fire" for fire magic, "shield" for defense.
- Be creative and thematic in your additions/modifications based on the story setting.
- Advanced RPG Tools is enabled by providing a agmtState object. If you want to enable AGMT, simply include agmtState with at least chaosFactor.
- AGMT chaos factor must be between 1-9, scene count must be >= 0.
- Thread and character IDs are auto-generated if not provided, so you can omit them for new entries.
- Starting choices allow players to choose how they begin the adventure. If startingChoices is empty/undefined, players see a default "Start Story" button.
- **Variables are essential for tracking custom game state** - use them for counters (gold, time), flags (is_night, is_wanted), and lists (known_spells). Boolean variables can trigger lore visibility.

### Example Responses:

**Example 1 - Adding Lore:**
User: "Create a location entry for The Crimson Tavern and a character entry for the barkeep."
Assistant:
"I've created two lore entries for your adventure.

\`\`\`json
{
  "lore": [
    {
      "title": "The Crimson Tavern",
      "content": "A smoky establishment at the crossroads of the merchant district. Known for its strong ale and stronger rumors. The regulars here include off-duty guards, traveling merchants, and the occasional adventurer seeking work.",
      "secret": false,
      "on": true
    },
    {
      "title": "Barkeep Greta",
      "content": "The stout, no-nonsense owner of The Crimson Tavern. She has connections throughout the city and trades in information as readily as drinks.",
      "secret": false,
      "on": true,
      "on_triggers": ["tavern", "Crimson Tavern"]
    }
  ]
}
\`\`\`"

**Example 2 - Variables (counters, flags, lists):**
User: "Add a gold counter, a night boolean, and a list for tracking visited places."
Assistant:
"I've created variables to track gold, time of day, and visited locations.

\`\`\`json
{
  "variables": [
    {
      "id": "var_gold",
      "name": "Gold",
      "description": "Currency for purchases and bribes",
      "type": "number",
      "value": 100,
      "minValue": 0
    },
    {
      "id": "var_night",
      "name": "Is Night",
      "description": "Whether it's currently nighttime",
      "type": "boolean",
      "value": false
    },
    {
      "id": "var_visited",
      "name": "Visited Places",
      "description": "Locations the player has discovered",
      "type": "list",
      "items": []
    }
  ]
}
\`\`\`"

**Example 3 - Mixed Operations:**
User: "Delete the Old Quest, update Main Quest description, and add a Secret Quest."
Assistant:
"I've made those changes to your quest list.

\`\`\`json
{
  "quests": [
    { "title": "Old Quest", "_command": "delete" },
    {
      "title": "Main Quest",
      "description": "Find the ancient artifact before the dark lord does"
    },
    {
      "title": "Secret Quest",
      "shortDescription": "Hidden path",
      "description": "Discover the secret passage beneath the castle",
      "points": 50,
      "active": false,
      "fulfilled": false,
      "_command": "add"
    }
  ]
}
\`\`\`"

**Example 4 - Relationships:**
User: "Add a relationship with the King's Guard (allies) and the Shadow Syndicate (enemies)."
Assistant:
"I've added two key relationships to your adventure.

\`\`\`json
{
  "relationships": [
    { "name": "King's Guard", "value": 60, "description": "Loyal protectors of the realm who trust you", "symbol": "shield" },
    { "name": "Shadow Syndicate", "value": -80, "description": "Criminal organization that wants you dead", "symbol": "skull" }
  ]
}
\`\`\`"

**Example 5 - Custom Tables:**
User: "Create an encounter table for the forest with wolves, bandits, and a rare unicorn."
Assistant:
"I've created a custom encounter table for forest travel.

\`\`\`json
{
  "customTables": [
    {
      "id": "table-forest-encounters",
      "name": "Forest Encounters",
      "description": "Random encounters when traveling through the forest",
      "entries": [
        { "text": "A pack of hungry wolves blocks your path", "weight": 3 },
        { "text": "Bandits emerge from the underbrush demanding toll", "weight": 2 },
        { "text": "You spot a majestic unicorn in a moonlit clearing", "weight": 1 }
      ]
    }
  ]
}
\`\`\`"

**Example 6 - Advanced RPG Tools:**
User: "Enable AGMT with chaos 5, add a thread about finding the ancient temple, and an NPC named Elara."
Assistant:
"I've enabled Advanced RPG Tools with your settings.

\`\`\`json
{
  "agmtState": {
    "chaosFactor": 5,
    "sceneCount": 0,
    "threads": [
      {
        "description": "Find and explore the ancient temple before it collapses",
        "status": "active"
      }
    ],
    "characters": [
      {
        "name": "Elara",
        "description": "Mysterious guide who knows the temple's secrets",
        "status": "active"
      }
    ]
  }
}
\`\`\`"

**Example 7 - Managing AGMT Threads:**
User: "Close the temple thread and add a new thread about the dragon awakening."
Assistant:
"I've updated the AGMT threads.

\`\`\`json
{
  "agmtState": {
    "threads": [
      {
        "description": "Find and explore the ancient temple before it collapses",
        "status": "closed"
      },
      {
        "description": "Stop the ancient dragon from awakening and destroying the kingdom",
        "status": "active",
        "_command": "add"
      }
    ]
  }
}
\`\`\`"

**Example 8 - Custom Random Tables:**
User: "Create a weather table with sunny, cloudy, rainy, and stormy options."
Assistant:
"I've created a weather random table for your adventure.

\`\`\`json
{
  "customTables": [
    {
      "id": "table-weather-001",
      "name": "Weather Conditions",
      "description": "Roll to determine the current weather",
      "entries": [
        { "text": "Sunny - Clear skies and warm temperatures", "weight": 3 },
        { "text": "Cloudy - Overcast but dry", "weight": 2 },
        { "text": "Rainy - Steady rain, reduced visibility", "weight": 2 },
        { "text": "Stormy - Heavy rain and thunder, dangerous conditions", "weight": 1 }
      ]
    }
  ]
}
\`\`\`"

**Example 9 - Editing Custom Tables:**
User: "Add a 'foggy' option to the weather table and delete the encounter table."
Assistant:
"I've updated your tables.

\`\`\`json
{
  "customTables": [
    {
      "name": "Weather Conditions",
      "entries": [
        { "text": "Sunny - Clear skies and warm temperatures", "weight": 3 },
        { "text": "Cloudy - Overcast but dry", "weight": 2 },
        { "text": "Rainy - Steady rain, reduced visibility", "weight": 2 },
        { "text": "Stormy - Heavy rain and thunder, dangerous conditions", "weight": 1 },
        { "text": "Foggy - Dense mist, greatly reduced visibility", "weight": 2 }
      ],
      "_command": "replace"
    },
    {
      "name": "Random Encounters",
      "_command": "delete"
    }
  ]
}
\`\`\`"

**Example 10 - Starting Choices:**
User: "Create custom starting choices: one for sneaking in (Stealth check), one for fighting through (Strength check), and one that uses a Disguise item."
Assistant:
"I've created three different ways to begin the adventure.

\`\`\`json
{
  "startingChoices": [
    {
      "text": "Sneak through the shadows",
      "skill_used": "Stealth",
      "skill_dc": "hard",
      "intro_override": "You slip into the darkness, your footsteps silent on the cold stone floor..."
    },
    {
      "text": "Fight your way through",
      "skill_used": "Strength",
      "skill_dc": "average"
    },
    {
      "text": "Use your disguise to blend in",
      "item_used": "Disguise Kit",
      "item_loss": true,
      "intro_override": "Donning the stolen uniform, you walk confidently through the front gates..."
    }
  ]
}
\`\`\`"

**Example 11 - Starting Choices with AGMT:**
User: "Add a starting choice that asks fate if there's a secret passage, and rolls on the locations table."
Assistant:
"I've added a AGMT-powered starting choice.

\`\`\`json
{
  "startingChoices": [
    {
      "text": "Search for a hidden entrance",
      "agmt_check": "Is there a secret passage? (Unlikely)",
      "agmt_table": "locations"
    }
  ]
}
\`\`\`"

**Example 12 - Deleting Starting Choices:**
User: "Remove the sneak option from starting choices."
Assistant:
"I've removed that starting choice.

\`\`\`json
{
  "startingChoices": [
    {
      "text": "Sneak through the shadows",
      "_command": "delete"
    }
  ]
}
\`\`\`"

**Example 13 - Creating a Skill Tree:**
User: "Create a warrior skill tree with power attack, defensive stance, and a passive that gives damage reduction."
Assistant:
"I've created a Warrior skill tree with combat abilities.

\`\`\`json
{
  "skillTrees": [
    {
      "id": "warrior-path",
      "name": "Warrior's Path",
      "description": "Master the art of combat through strength and discipline",
      "symbol": "sword",
      "nodes": [
        {
          "id": "basic-training",
          "name": "Basic Training",
          "description": "+5 Strength from foundational combat training",
          "symbol": "muscle",
          "type": "stat",
          "position": { "x": 50, "y": 15 },
          "prerequisites": [],
          "effects": [
            { "type": "stat_bonus", "target": "Strength", "value": 5 }
          ]
        },
        {
          "id": "power-attack",
          "name": "Power Attack",
          "description": "Learn a devastating attack that deals massive damage",
          "symbol": "lightning",
          "type": "ability",
          "position": { "x": 25, "y": 40 },
          "prerequisites": ["basic-training"],
          "effects": [
            {
              "type": "grant_ability",
              "target": "Power Attack",
              "abilityData": {
                "name": "Power Attack",
                "description": "A mighty strike that deals devastating damage",
                "grade": "adept",
                "cost": [{ "type": "resource", "name": "Stamina", "amount": 15 }],
                "cooldown": 2,
                "currentCooldown": 0,
                "stat": "Strength",
                "symbol": "lightning"
              }
            }
          ]
        },
        {
          "id": "defensive-stance",
          "name": "Defensive Stance",
          "description": "Learn to protect yourself and allies",
          "symbol": "shield",
          "type": "ability",
          "position": { "x": 75, "y": 40 },
          "prerequisites": ["basic-training"],
          "effects": [
            {
              "type": "grant_ability",
              "target": "Defensive Stance",
              "abilityData": {
                "name": "Defensive Stance",
                "description": "Take a protective stance that reduces incoming damage",
                "grade": "apprentice",
                "cost": [{ "type": "resource", "name": "Stamina", "amount": 10 }],
                "cooldown": 3,
                "currentCooldown": 0,
                "symbol": "shield"
              }
            }
          ]
        },
        {
          "id": "iron-skin",
          "name": "Iron Skin",
          "description": "Your skin hardens through combat experience",
          "symbol": "rock",
          "type": "passive",
          "position": { "x": 50, "y": 65 },
          "prerequisites": ["power-attack", "defensive-stance"],
          "effects": [
            { "type": "passive", "target": "Iron Skin: Reduce all physical damage taken by 10%" }
          ]
        }
      ]
    }
  ]
}
\`\`\`"

**Example 14 - Adding Nodes to Existing Skill Tree:**
User: "Add a 'Berserker Rage' ability node to the warrior tree that requires Iron Skin."
Assistant:
"I've added the Berserker Rage node to your Warrior tree.

\`\`\`json
{
  "skillTrees": [
    {
      "id": "warrior-path",
      "nodes": [
        {
          "id": "berserker-rage",
          "name": "Berserker Rage",
          "description": "Unleash unstoppable fury in combat",
          "symbol": "fire",
          "type": "ability",
          "position": { "x": 50, "y": 85 },
          "prerequisites": ["iron-skin"],
          "effects": [
            { "type": "stat_bonus", "target": "Strength", "value": 10 },
            {
              "type": "grant_ability",
              "target": "Berserker Rage",
              "abilityData": {
                "name": "Berserker Rage",
                "description": "Enter a rage that doubles damage but prevents defensive actions",
                "grade": "expert",
                "cost": [{ "type": "resource", "name": "Health", "amount": 20 }],
                "cooldown": 5,
                "currentCooldown": 0,
                "stat": "Strength",
                "symbol": "fire"
              }
            }
          ],
          "_command": "add"
        }
      ]
    }
  ]
}
\`\`\`"

### Context - Current Adventure State:
${
  adventureMetadata
    ? `**Adventure Metadata:**
- Title: ${adventureMetadata.title || "(not set)"}
- Short Description: ${adventureMetadata.shortDescription || "(not set)"}
- Description: ${adventureMetadata.description || "(not set)"}
- Starting Choices: ${
        adventureMetadata.startingChoices?.length
          ? adventureMetadata.startingChoices
              .map(
                (c, i) =>
                  `${i + 1}. "${c.text}"${
                    c.skill_used ? ` [${c.skill_used} DC ${c.skill_dc}]` : ""
                  }${c.intro_override ? " (custom intro)" : ""}`
              )
              .join("\n  ")
          : "(none - using default Start Story button)"
      }

`
    : ""
}**Current Adventure Data:**

${formatStoryDataAsMarkdown(cleanedStoryData)}
`;

  return [{ role: "system", content: systemPrompt }, ...messages];
}

export interface CreatorOutputData extends Partial<StoryData> {
  title?: string;
  shortDescription?: string;
  description?: string;
  startingChoices?: StartingChoice[];
}

/**
 * Attempt to repair incomplete/malformed JSON
 * Handles missing code fences, truncated content, unclosed brackets, etc.
 */
function attemptJSONRepair(content: string): string {
  let jsonContent = content.trim();

  // Remove markdown code blocks if present (at start/end)
  const jsonBlockMatch = jsonContent.match(
    /```(?:json)?\s*([\s\S]*?)(?:\s*```)?$/
  );
  if (jsonBlockMatch) {
    jsonContent = jsonBlockMatch[1].trim();
  }

  // Remove ALL embedded markdown code block markers that may appear mid-JSON
  jsonContent = jsonContent.replace(/```json\s*/gi, "");
  jsonContent = jsonContent.replace(/```\s*/g, "");

  const startIndex = jsonContent.indexOf("{");
  if (startIndex === -1) return jsonContent;

  jsonContent = jsonContent.slice(startIndex);

  // Track what needs closing
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let lastValidPosition = 0;

  for (let i = 0; i < jsonContent.length; i++) {
    const char = jsonContent[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"' && !escaped) {
      inString = !inString;
      if (!inString) {
        const nextNonSpace = jsonContent.slice(i + 1).match(/^\s*([,}\]:])/);
        if (nextNonSpace) {
          lastValidPosition = i;
        }
      }
      continue;
    }

    if (!inString) {
      if (char === "{") {
        stack.push("}");
      } else if (char === "[") {
        stack.push("]");
      } else if (char === "}" || char === "]") {
        if (stack.length > 0 && stack[stack.length - 1] === char) {
          stack.pop();
          lastValidPosition = i;
        }
      } else if (char === ",") {
        lastValidPosition = i;
      }
    }
  }

  // If we're in an unterminated string or have unclosed brackets, truncate
  if (inString || stack.length > 0) {
    const truncated = jsonContent.slice(0, lastValidPosition + 1);

    // Remove trailing partial elements
    let cleaned = truncated.replace(/,\s*\{[^}]*$/, "");
    cleaned = cleaned.replace(/,\s*\[[^\]]*$/, "");
    cleaned = cleaned.replace(/,\s*"[^"]*"?\s*:?\s*(?:"[^"]*)?$/, "");
    cleaned = cleaned.replace(/,\s*$/, "");

    jsonContent = cleaned;

    // Recount stack after truncation
    stack.length = 0;
    inString = false;
    escaped = false;
    for (let i = 0; i < jsonContent.length; i++) {
      const char = jsonContent[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === "{") stack.push("}");
        else if (char === "[") stack.push("]");
        else if (char === "}" || char === "]") {
          if (stack.length > 0) stack.pop();
        }
      }
    }
  }

  // Remove trailing comma before closing bracket
  jsonContent = jsonContent.replace(/,(\s*[}\]])/, "$1");

  // Close remaining brackets/braces
  while (stack.length > 0) {
    jsonContent += stack.pop();
  }

  return jsonContent;
}

export function parseCreatorOutput(content: string): {
  text: string;
  data: CreatorOutputData | null;
} {
  // First try: look for fenced ```json blocks
  const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/;
  const match = content.match(jsonBlockRegex);

  if (match) {
    const jsonString = match[1];
    try {
      const data = JSON.parse(jsonString);
      const text = content.replace(jsonBlockRegex, "").trim();
      return { text, data };
    } catch (e) {
      console.warn("Fenced JSON parse failed, attempting repair...");
      try {
        const repairedJson = attemptJSONRepair(jsonString);
        const data = JSON.parse(repairedJson);
        const text = content.replace(jsonBlockRegex, "").trim();
        console.log("JSON repair successful (fenced block)");
        return { text, data };
      } catch (repairError) {
        console.error("Failed to repair fenced JSON:", repairError);
      }
    }
  }

  // Second try: look for raw JSON (no code fence) - common with some models
  // Find JSON object that starts with { and contains typical story data keys
  const rawJsonMatch = content.match(
    /(\{[\s\S]*(?:"lore"|"achievements"|"quests"|"relationships"|"variables"|"abilities"|"customTables"|"skillTrees"|"upgradeSettings"|"levelingSettings"|"presets")[\s\S]*\})/
  );

  if (rawJsonMatch) {
    const rawJson = rawJsonMatch[1];
    try {
      const data = JSON.parse(rawJson);
      // Remove the JSON from text, keeping any prose before/after
      const text = content.replace(rawJson, "").trim();
      console.log("Parsed raw JSON successfully (no code fence)");
      return { text, data };
    } catch (e) {
      console.warn("Raw JSON parse failed, attempting repair...");
      try {
        const repairedJson = attemptJSONRepair(rawJson);
        const data = JSON.parse(repairedJson);
        const text = content.replace(rawJson, "").trim();
        console.log("JSON repair successful (raw JSON)");
        return { text, data };
      } catch (repairError) {
        console.error("Failed to repair raw JSON:", repairError);
      }
    }
  }

  // Third try: just look for any JSON object starting with {
  const anyJsonStart = content.indexOf("{");
  if (anyJsonStart !== -1) {
    const potentialJson = content.slice(anyJsonStart);
    try {
      const repairedJson = attemptJSONRepair(potentialJson);
      const data = JSON.parse(repairedJson);
      const text = content.slice(0, anyJsonStart).trim();
      console.log("Parsed JSON after aggressive repair");
      return { text, data };
    } catch (e) {
      // Give up on JSON parsing
      console.warn("All JSON parsing attempts failed");
    }
  }

  return { text: content, data: null };
}

/**
 * Build messages for tool-based creator AI.
 * Returns messages + tools for API call.
 */
export function buildCreatorMessagesWithTools({
  messages,
  currentStoryData,
  adventureMetadata,
}: CreatorAIInput): {
  messages: ChatMessage[];
  tools: ReturnType<typeof getCreatorToolsForAPI>;
} {
  // Clean up deprecated fields from lore entries
  const cleanedStoryData = { ...currentStoryData };
  if (cleanedStoryData.lore && Array.isArray(cleanedStoryData.lore)) {
    cleanedStoryData.lore = cleanedStoryData.lore.map((loreEntry) => {
      const { relatedCharacters, relatedLocations, keys, ...cleanEntry } =
        loreEntry as any;
      return cleanEntry;
    });
  }

  const systemPrompt = `You are an expert Game Designer and Creative Writer assistant.
Your goal is to help the user design a text adventure game scenario.
You can brainstorm ideas, write content, and modify the scenario using the available tools.

**STYLE RULE: Do NOT use emojis in any content you generate.** Use :icon: syntax for icons (e.g., :sword:, :fire:, :shield:), or text symbols where appropriate. Emojis look unprofessional in game content.

## How to Use Tools

When the user asks you to create or modify parts of the scenario (like "create a dragon boss", "make a sci-fi setting", "add a healing potion"), you should:
1. Think about what changes are needed
2. Call the appropriate tools to make those changes
3. Explain what you did in your response

### Tool Categories:

**Story Content:**
- add_lore, modify_lore, remove_lore - Manage world-building entries with triggers
  **LORE TYPES:** Use the 'type' field to set note priority:
  - "character_sheet" - HIGHEST PRIORITY. Use this for the player's character sheet! Contains stats, attributes, skills, HP, abilities, equipment, etc. Appears at the very top of AI context so the narrator always knows the character's capabilities.
  - "mechanics" - Game rules and systems. Second priority.
  - "lore" (default) - World-building, NPCs, locations, history.
  **THREAT PROFILES:** When creating lore for enemies/threats, include in the content:
  - Challenge Difficulty (Easy/Medium/Hard/Boss)
  - Approach DCs (e.g., "Combat: hard, Stealth: average")
  - Per-Failure Condition (e.g., "Claw Wound Tier II")
  - Challenge Loss Stakes (e.g., "Devoured - Tier VI, game over")
- add_achievements, modify_achievements, remove_achievements - Manage unlockables
- add_quests, modify_quests, remove_quests - Manage objectives

**Relationships & Variables:**
- add_relationships, modify_relationships, remove_relationships - Manage NPC/faction standings
- add_variables, modify_variables, remove_variables - Manage custom counters, flags, lists

**Complex Structures:**
- add_presets, modify_presets, remove_presets - Manage character build presets
- add_skill_trees, modify_skill_trees, remove_skill_trees - Manage progression trees
- add_custom_tables, modify_custom_tables, remove_custom_tables - Manage random tables

**Settings:**
- update_basic_info - Update story_name, premise, characterSheet, intro, author_notes
- update_adventure_metadata - Update title, shortDescription, description
- update_upgrade_settings - Configure progression shop system
- update_leveling_settings - Configure XP curve and level caps

**Character Sheet:**
- update_character_sheet - Update the player's filled character sheet markdown
- update_character_sheet_template - Set the adventure's fillable template
- update_preset_character_sheet - Update a preset's pre-filled character sheet

**Starting Choices:**
- add_starting_choices, modify_starting_choices, remove_starting_choices - Custom game starts

## Important Guidelines:

1. **Only modify what the user asks for.** If they say "add an ability", only call add_abilities - don't also add other things.

2. **Use batch operations.** If adding multiple abilities, call add_abilities once with all abilities, not multiple times.

3. **Maintain consistency.** If the user has a fantasy setting, use appropriate names and descriptions.

4. **Be creative.** Add interesting details and flavor text to make the scenario engaging.

5. **Icons:** Use descriptive WORDS like "heart", "sword", "shield", "fire" for symbols - we fuzzy-match to our icon library.

6. **Be conversational and friendly!** You're their creative buddy helping them build something cool. After using tools, write a brief but warm response about what you did - share your creative thinking, point out cool details you added, or ask follow-up questions. Don't just say "I made the changes" - be personable! Examples:
   - "Added your Fireball spell! I set it as an 'adept' grade ability with a 2-turn cooldown - should feel powerful but not spammable."
   - "Got those three NPCs set up! I especially like how the merchant's backstory ties into the thieves guild - could make for some interesting drama later."
   - "Done! Here's your new ability. I kept the cost low since you mentioned wanting it available early."

7. **Grades & Tiers:**
   - Abilities: "novice" (+0), "apprentice" (+1), "adept" (+2), "expert" (+3), "master" (+4), "legendary" (+5)

8. **Relationship values:** -100 (sworn enemy) to +100 (devoted ally).

## Current Adventure State:
${
  adventureMetadata
    ? `**Adventure Metadata:**
- Title: ${adventureMetadata.title || "(not set)"}
- Short Description: ${adventureMetadata.shortDescription || "(not set)"}
- Description: ${adventureMetadata.description || "(not set)"}
- Starting Choices: ${
        adventureMetadata.startingChoices?.length
          ? adventureMetadata.startingChoices
              .map(
                (c, i) =>
                  `${i + 1}. "${c.text}"${
                    c.skill_used ? ` [${c.skill_used} DC ${c.skill_dc}]` : ""
                  }${c.intro_override ? " (custom intro)" : ""}`
              )
              .join("\n  ")
          : "(none - using default Start Story button)"
      }

`
    : ""
}**Current Adventure Data:**

${formatStoryDataAsMarkdown(cleanedStoryData)}
`;

  return {
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    tools: getCreatorToolsForAPI(),
  };
}
