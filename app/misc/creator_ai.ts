import { StoryData, StartingChoice } from "@/app/misc/structs";
import { ChatMessage } from "@/app/misc/ai";

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

When the user asks you to create or modify parts of the scenario (like "create a dragon boss", "make a sci-fi setting", "add a healing potion"), you MUST include a JSON block in your response containing the structured data.

### JSON Structure Rules:
- The JSON block must be valid JSON.
- It should be wrapped in \`\`\`json ... \`\`\` code blocks.
- You can return a PARTIAL StoryData object. Only include the fields you want to change or add.
- Arrays (like 'inventory', 'stats', 'plot_beats', 'lore', 'achievements', 'quests', 'presets') in your JSON will be MERGED with the existing data by default.
- Scalar fields (like 'story_name', 'premise', 'player_name', 'title', 'shortDescription', 'description') will be REPLACED.

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
  "stats": [
    {
      "name": "Strength",
      "value": 80,
      "description": "Raw physical power",
      "symbol": "💪",
      "_command": "replace"
    },
    {
      "name": "Old Unused Stat",
      "_command": "delete"
    },
    {
      "name": "Agility",
      "value": 70
    }
  ],
  "inventory": [
    {
      "name": "Rusty Sword",
      "_command": "delete"
    },
    {
      "name": "Legendary Blade",
      "description": "A powerful enchanted sword",
      "type": "normal",
      "symbol": "⚔️",
      "quantity": 1,
      "_command": "add"
    }
  ]
}
\`\`\`

**Important Notes:**
- For items WITHOUT _command, the default behavior is "merge" (update if exists, add if new)
- To ADD new items to an array, ONLY list the NEW items. DO NOT include existing items unless you want to modify/delete them.
- To MODIFY existing items: List an item with the SAME 'name' (or 'title' or 'id') as an existing one, and your new values will merge/replace based on _command.
- **For DELETE commands:** You MUST include the identifier field (name/title/id) along with "_command": "delete". Example: {"name": "Old Stat", "_command": "delete"} NOT just {"_command": "delete"}
- Example: If there are 3 stats already and user asks to "add a Luck stat", your JSON should ONLY contain the new Luck stat in the stats array, not all 4 stats.
- When user says "delete X" or "remove X", use: {"name": "X", "_command": "delete"}
- When user says "replace X with Y" or "redesign X", use "_command": "replace" for item X.

### Available Fields:

**Adventure-Level Fields** (set these to update the adventure's public-facing information):
- title (string) - The adventure's title shown in the explorer/library
- shortDescription (string) - Brief 1-2 sentence description for adventure cards (max ~100 chars)
- description (string) - Full multi-paragraph description of the adventure shown on the adventure detail page

**StoryData Fields** (these define the actual gameplay scenario):
- story_name (string) - The in-game story title (shown to player during gameplay)
- premise (string) - Story premise/conflict summary
- player_name (string) - Default player character name
- player_summary (string) - Player character background/description
- intro (string) - Opening narrative text shown at game start
- author_notes (string) - Private instructions/notes for the AI narrator
- stats (Array of { name, value, description, symbol })
  - name: Stat name (e.g., "Strength", "Intelligence")
  - value: Starting value, 1-100 where 50 is average
  - description: What the stat represents
  - symbol: Emoji/icon representing the stat
- resources (Array of { name, value, maxValue, description, symbol })
  - name: Resource name (e.g., "Health", "Mana", "Stamina")
  - value: Current amount
  - maxValue: Maximum capacity
  - description: What the resource represents
  - symbol: Emoji/icon representing the resource
- inventory (Array of { name, quantity, description, type, symbol })
  - name: Item name
  - quantity: Number of items
  - description: Item description
  - type: "normal" (advantage, breaks on fail), "consumable" (advantage, consumed on use), "story" (advantage, never breaks/consumed), "misc" (prevents disadvantage, never breaks/consumed)
  - symbol: Emoji/icon representing the item
- plot_beats (Array of { title, content, fulfilled })
  - title: Beat title/name
  - content: Detailed description of what should happen in this beat
  - fulfilled: false (always start as unfulfilled)
- lore (Array of { title, content, secrtet, on, alwaysOn, on_triggers, off_triggers, trigger_lores, untrigger_lores, beats_trigger, beats_untrigger })
  - title: Lore entry title
  - content: Full lore text
  - secrtet: If true, lore starts hidden and must be revealed
  - on: Whether lore is currently visible (true = visible to AI/player, false = hidden)
  - alwaysOn: If true, lore is always visible and ignores all triggers
  - on_triggers: Array of trigger words/phrases - when these appear in story, lore becomes visible
  - off_triggers: Array of trigger words/phrases - when these appear in story, lore becomes hidden
  - trigger_lores: Array of lore titles - when those lores become visible, this lore becomes visible
  - untrigger_lores: Array of lore titles - when those lores become visible, this lore becomes hidden
  - beats_trigger: Array of plot beat indices (0-based) - when these beats complete, lore becomes visible
  - beats_untrigger: Array of plot beat indices (0-based) - when these beats complete, lore becomes hidden
- relationships (Array of { name, value, description, symbol })
  - name: Character, faction, or organization name
  - value: Relationship level from -100 (hostile enemy) to +100 (strong ally)
  - description: Current state/context of the relationship
  - symbol: Emoji representing the relationship (auto-assigned based on value: ⚔️ enemy, 💔 hostile, 😠 unfriendly, 😐 distant, 🤝 neutral, 😊 friendly, 💙 ally, 💚 strong ally)
- achievements (Array of { title, description, points, symbol, ai_hint })
  - title: Achievement name
  - description: Public description shown to player
  - points: Points awarded when unlocked
  - symbol: Emoji/icon representing the achievement
  - ai_hint: (Optional) Precise trigger conditions for the AI to award this achievement
- quests (Array of { title, shortDescription, description, points, active, fulfilled })
  - title: Quest name
  - shortDescription: Brief summary for quest list
  - description: Full quest details and objectives
  - points: Points awarded upon completion
  - active: Whether quest is currently visible/active
  - fulfilled: Whether quest has been completed
- presets (Array of { id, name, description, icon, playerName, playerSummary, stats, resources, inventory, authorNotes })
  - id: Unique identifier (use "preset-" + timestamp for new ones)
  - name: Preset display name
  - description: What this preset/build represents
  - icon: Emoji representing the preset
  - playerName: Default character name for this preset
  - playerSummary: Character background for this preset
  - intro: Unique opening narrative for this preset
  - stats: Array of starting stats for this preset
  - resources: Array of starting resources for this preset
  - inventory: Array of starting items for this preset
  - authorNotes: Private notes about this preset
- upgradeSettings (Object with upgrade shop configuration)
  - enabled: Boolean - master toggle for the entire upgrade system
  - statShopEnabled: Boolean - whether stat shop is available
  - resourceShopEnabled: Boolean - whether resource shop is available
  - itemShopEnabled: Boolean - whether item shop is available
  - statShop: Array of { name, description, symbol, startingValue, cost } - new stats players can unlock
    - name: Name of the new stat to unlock
    - description: What the stat represents
    - symbol: Emoji/icon for the stat
    - startingValue: Initial value when unlocked (1-100, 50 = average)
    - cost: Progression points required to unlock
  - resourceShop: Array of { name, description, symbol, startingValue, startingMaxValue, cost } - new resources players can unlock
    - name: Name of the new resource to unlock
    - description: What the resource represents
    - symbol: Emoji/icon for the resource
    - startingValue: Initial current value when unlocked
    - startingMaxValue: Initial maximum value when unlocked
    - cost: Progression points required to unlock
  - itemShop: Array of { name, description, type, symbol, quantity, cost } - items players can purchase
    - name: Item name
    - description: Item description
    - type: "normal" | "consumable" | "story" | "misc"
    - symbol: Emoji/icon representing the item
    - quantity: How many of this item to grant
    - cost: Progression points required to purchase
- mythicState (Object with Mythic GME state - if provided, Mythic system will be enabled for this adventure)
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
- startingChoices (Array of { text, intro_override, skill_used, skill_dc, resource_used, item_used, item_loss, mythic_check, mythic_context_only, mythic_table, custom_table }) - Custom starting choices instead of default "Start Story" button
  - text: The choice text displayed to player (required)
  - intro_override: Optional alternate intro text for this path (if empty, uses main intro)
  - skill_used: Optional skill name for skill check on this choice
  - skill_dc: DC (difficulty) for the skill check (required if skill_used is set)
  - resource_used: Optional resource name for resource cost
  - item_used: Optional item name that this choice requires
  - item_loss: Boolean - whether the item is consumed when used (default false)
  - mythic_check: Optional Mythic fate check question in format "Question (Likelihood)" e.g., "Is the guard asleep? (Likely)"
  - mythic_context_only: Boolean - when true with skill_used, mythic provides context only (doesn't override skill check result)
  - mythic_table: Optional Mythic table to roll on (e.g., "action", "subject", "character_descriptors", "locations", "plot_twists")
  - custom_table: Optional custom table name to roll on

Notes:
- All characters should share the same stats and resources, but they may have different values.
- Use the 'symbol' field to add an emoji or icon representing the item/stat/resource.
- Be creative and thematic in your additions/modifications based on the story setting.
- When creating stat/resource shop items, these are NEW stats/resources that players can unlock, not upgrades to existing ones.
- Mythic GME is enabled by providing a mythicState object. If you want to enable Mythic, simply include mythicState with at least chaosFactor.
- Mythic chaos factor must be between 1-9, scene count must be >= 0.
- Thread and character IDs are auto-generated if not provided, so you can omit them for new entries.
- Starting choices allow players to choose how they begin the adventure. If startingChoices is empty/undefined, players see a default "Start Story" button.

### Example Responses:

**Example 1 - Adding Items:**
User: "Create a fire sword item and a strength stat."
Assistant:
"Here is a fire sword and a strength stat for your game.

\`\`\`json
{
  "stats": [
    { "name": "Strength", "value": 10, "description": "Physical power", "symbol": "💪" }
  ],
  "inventory": [
    { "name": "Fire Sword", "quantity": 1, "description": "A blade wreathed in eternal flame.", "type": "normal", "symbol": "⚔️" }
  ]
}
\`\`\`"

**Example 2 - Deleting Items:**
User: "Remove the Rusty Sword and Old Potion from inventory."
Assistant:
"I'll remove those items from your inventory.

\`\`\`json
{
  "inventory": [
    { "name": "Rusty Sword", "_command": "delete" },
    { "name": "Old Potion", "_command": "delete" }
  ]
}
\`\`\`"

**Example 2b - Deleting Stats:**
User: "Delete the Intelligence stat."
Assistant:
"I'll remove the Intelligence stat.

\`\`\`json
{
  "stats": [
    { "name": "Intelligence", "_command": "delete" }
  ]
}
\`\`\`"

**Example 3 - Replacing Items:**
User: "Completely redesign the Strength stat with new values."
Assistant:
"I've completely replaced the Strength stat with new properties.

\`\`\`json
{
  "stats": [
    {
      "name": "Strength",
      "value": 85,
      "description": "Pure physical might that crushes all opposition",
      "symbol": "⚡",
      "_command": "replace"
    }
  ]
}
\`\`\`"

**Example 4 - Mixed Operations:**
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

**Example 5 - Relationships:**
User: "Add a relationship with the King's Guard (allies) and the Shadow Syndicate (enemies)."
Assistant:
"I've added two key relationships to your adventure.

\`\`\`json
{
  "relationships": [
    { "name": "King's Guard", "value": 60, "description": "Loyal protectors of the realm who trust you", "symbol": "💙" },
    { "name": "Shadow Syndicate", "value": -80, "description": "Criminal organization that wants you dead", "symbol": "💔" }
  ]
}
\`\`\`"

**Example 6 - Upgrade Shops:**
User: "Enable upgrades and create a shop with a new Magic stat (10 points) and a Health Potion item (5 points)."
Assistant:
"I've enabled upgrades and created shop items.

\`\`\`json
{
  "upgradeSettings": {
    "enabled": true,
    "statShopEnabled": true,
    "itemShopEnabled": true,
    "statShop": [
      {
        "name": "Magic",
        "description": "Arcane power and spell effectiveness",
        "symbol": "✨",
        "startingValue": 50,
        "cost": 10
      }
    ],
    "itemShop": [
      {
        "name": "Health Potion",
        "description": "Restores health when consumed",
        "type": "consumable",
        "symbol": "🧪",
        "quantity": 1,
        "cost": 5
      }
    ]
  }
}
\`\`\`"

**Example 7 - Mythic GME:**
User: "Enable Mythic with chaos 5, add a thread about finding the ancient temple, and an NPC named Elara."
Assistant:
"I've enabled Mythic GME with your settings.

\`\`\`json
{
  "mythicState": {
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

**Example 8 - Managing Mythic Threads:**
User: "Close the temple thread and add a new thread about the dragon awakening."
Assistant:
"I've updated the Mythic threads.

\`\`\`json
{
  "mythicState": {
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

**Example 9 - Custom Random Tables:**
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

**Example 10 - Editing Custom Tables:**
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

**Example 11 - Starting Choices:**
User: "Create custom starting choices: one for sneaking in (Stealth check), one for fighting through (Strength check), and one that uses a Disguise item."
Assistant:
"I've created three different ways to begin the adventure.

\`\`\`json
{
  "startingChoices": [
    {
      "text": "Sneak through the shadows",
      "skill_used": "Stealth",
      "skill_dc": 60,
      "intro_override": "You slip into the darkness, your footsteps silent on the cold stone floor..."
    },
    {
      "text": "Fight your way through",
      "skill_used": "Strength",
      "skill_dc": 55
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

**Example 12 - Starting Choices with Mythic:**
User: "Add a starting choice that asks fate if there's a secret passage, and rolls on the locations table."
Assistant:
"I've added a Mythic-powered starting choice.

\`\`\`json
{
  "startingChoices": [
    {
      "text": "Search for a hidden entrance",
      "mythic_check": "Is there a secret passage? (Unlikely)",
      "mythic_table": "locations"
    }
  ]
}
\`\`\`"

**Example 13 - Deleting Starting Choices:**
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

### Context - Current Adventure State:
${
  adventureMetadata
    ? `**Adventure Metadata:**
- Title: ${adventureMetadata.title || "(not set)"}
- Short Description: ${adventureMetadata.shortDescription || "(not set)"}
- Description: ${adventureMetadata.description || "(not set)"}
- Starting Choices: ${
        adventureMetadata.startingChoices?.length
          ? JSON.stringify(adventureMetadata.startingChoices, null, 2)
          : "(none - using default Start Story button)"
      }

`
    : ""
}**Story Template:**
${JSON.stringify(cleanedStoryData, null, 2)}
`;

  return [{ role: "system", content: systemPrompt }, ...messages];
}

export interface CreatorOutputData extends Partial<StoryData> {
  title?: string;
  shortDescription?: string;
  description?: string;
  startingChoices?: StartingChoice[];
}

export function parseCreatorOutput(content: string): {
  text: string;
  data: CreatorOutputData | null;
} {
  const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/;
  const match = content.match(jsonBlockRegex);

  if (match) {
    const jsonString = match[1];
    try {
      const data = JSON.parse(jsonString);
      // Remove the JSON block from the text to keep the chat clean
      const text = content.replace(jsonBlockRegex, "").trim();
      return { text, data };
    } catch (e) {
      console.error("Failed to parse Creator AI JSON:", e);
      console.error("JSON string was:", jsonString);

      // Try to extract and fix common JSON errors
      try {
        // Remove any trailing commas before closing brackets/braces
        let fixedJson = jsonString
          .replace(/,(\s*[}\]])/g, "$1")
          // Fix unescaped quotes in strings (basic attempt)
          .replace(/title":/g, '"title":')
          // Remove any leading/trailing whitespace
          .trim();

        const fixedData = JSON.parse(fixedJson);
        const text = content.replace(jsonBlockRegex, "").trim();
        console.log("Successfully parsed JSON after cleanup");
        return { text, data: fixedData };
      } catch (fixError) {
        console.error("Failed to parse even after cleanup:", fixError);
        return { text: content, data: null };
      }
    }
  }

  return { text: content, data: null };
}
