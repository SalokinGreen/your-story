import { StoryData } from "@/app/misc/structs";
import { ChatMessage } from "@/app/misc/ai";

export interface CreatorAIInput {
  messages: ChatMessage[];
  currentStoryData: Partial<StoryData>;
  adventureMetadata?: {
    title?: string;
    shortDescription?: string;
    description?: string;
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
- Arrays (like 'inventory', 'stats', 'plot_beats', 'lore', 'achievements', 'quests', 'presets') in your JSON will be MERGED with the existing data.
  - To ADD items: Just list the new items.
  - To MODIFY items: List an item with the SAME 'name' (or 'title' or 'id') as an existing one, and your new values will overwrite the old ones.
- Scalar fields (like 'story_name', 'premise', 'player_name', 'title', 'shortDescription', 'description') will be REPLACED.

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
- starting_content (string) - Opening narrative text shown at game start
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
- lore (Array of { title, content, secrtet, on, on_triggers, off_triggers, beats_trigger, beats_untrigger })
  - title: Lore entry title
  - content: Full lore text
  - secrtet: If true, lore starts hidden and must be revealed
  - on: Whether lore is currently visible (true = visible to AI/player, false = hidden)
  - on_triggers: Array of trigger words/phrases - when these appear in story, lore becomes visible
  - off_triggers: Array of trigger words/phrases - when these appear in story, lore becomes hidden
  - beats_trigger: Array of plot beat indices (0-based) - when these beats complete, lore becomes visible
  - beats_untrigger: Array of plot beat indices (0-based) - when these beats complete, lore becomes hidden
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
  - stats: Array of starting stats for this preset
  - resources: Array of starting resources for this preset
  - inventory: Array of starting items for this preset
  - authorNotes: Private notes about this preset

Notes:
- All characters should share the same stats and resources, but they may have different values.
- Use the 'symbol' field to add an emoji or icon representing the item/stat/resource.
- Be creative and thematic in your additions/modifications based on the story setting.

### Example Response:
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

### Context - Current Adventure State:
${
  adventureMetadata
    ? `**Adventure Metadata:**
- Title: ${adventureMetadata.title || "(not set)"}
- Short Description: ${adventureMetadata.shortDescription || "(not set)"}
- Description: ${adventureMetadata.description || "(not set)"}

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
